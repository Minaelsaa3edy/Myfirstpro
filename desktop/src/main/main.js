'use strict';
const { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, protocol, session, shell, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const APP_DIR = path.join(__dirname, '..');
const channel = require('./channel').load(APP_DIR);
const platform = require('./platform');
const cu = require('./lib/cu');
const license = require('./lib/license');
const update = require('./lib/update');
const { DataStore } = require('./lib/store');
const { SealedState } = require('./lib/state');
const T = require('./text-ar');
const issuerMod = channel.dev ? require('./issuer') : null; /* the code generator exists only in the Developer build */

const DEV = channel.dev;
const denv = k => (DEV ? process.env[k] : undefined); /* test switches exist only in the developer channel */
const now = () => (denv('MPD_TEST_NOW') ? +denv('MPD_TEST_NOW') : Date.now());
const RENDERER = path.join(APP_DIR, 'renderer');

/* ---------- identity + folders (must be set before "ready") ---------- */
app.setName(channel.productName);
app.setAppUserModelId(channel.appId);
app.setPath('userData', denv('MPD_TEST_USERDATA') || path.join(app.getPath('appData'), channel.userDataName));
protocol.registerSchemesAsPrivileged([{ scheme: 'mpd', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

const U = () => app.getPath('userData');
/* a small log for support (no personal data: only start/stop, licence result codes and errors); rotated at 512 KB */
function log(...a) {
  try {
    const f = path.join(U(), 'logs', 'app.log'); fs.mkdirSync(path.dirname(f), { recursive: true });
    try { if (fs.statSync(f).size > 512 * 1024) fs.renameSync(f, f + '.1'); } catch (e) { /* first write */ }
    fs.appendFileSync(f, new Date().toISOString() + ' ' + a.map(x => (x && x.stack) || String(x)).join(' ') + '\n');
  } catch (e) { /* logging must never break the program */ }
}
process.on('uncaughtException', e => log('uncaughtException', e));
process.on('unhandledRejection', e => log('unhandledRejection', e));
const ctx = { lic: null, devLogin: false, appHtml: null, win: null, issuerWin: null, issuer: null, kind: '', store: null, state: null, prefs: { autoCheck: false }, quitting: false, locking: false, actCode: 'NONE', actNote: '', warned: false, expTimer: null };

/* ---------- small helpers ---------- */
const readSafe = (f, max) => { try { const st = fs.statSync(f); if (st.size > (max || 1e6)) return ''; return fs.readFileSync(f, 'utf8'); } catch (e) { return ''; } };
const writeAtomic = (f, txt) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = f + '.tmp'; fs.writeFileSync(t, txt); fs.renameSync(t, f); };
const senderOk = (e, pages) => { try { const u = new URL(e.senderFrame.url); return u.protocol === 'mpd:' && u.host === 'app' && pages.includes(u.pathname) && e.senderFrame === e.sender.mainFrame; } catch (er) { return false; } };
const loadPrefs = () => { try { Object.assign(ctx.prefs, JSON.parse(readSafe(path.join(U(), 'prefs.json'), 20000) || '{}')); } catch (e) { /* defaults */ } };
const savePrefs = () => { try { writeAtomic(path.join(U(), 'prefs.json'), JSON.stringify(ctx.prefs)); } catch (e) { /* ignore */ } };

/* ---------- licence ---------- */
const licFile = () => path.join(U(), 'license.mpl');
const normCode = t => String(t == null ? '' : t).replace(/[\s\u200b\u200e\u200f\u202a-\u202e]+/g, '');
function initState(secret) {
  const id8 = cu.sha256hex(channel.appId).slice(0, 8);
  const files = [path.join(U(), '.mpd', 's.bin'), path.join(app.getPath('appData'), '.mpd-' + id8, 's.bin')];
  if (process.platform === 'win32' && process.env.ProgramData) files.push(path.join(process.env.ProgramData, '.mpd-' + id8, 's.bin'));
  ctx.state = new SealedState(files, secret + '|' + channel.appId);
  ctx.state.load();
}
function witnessTimes() {
  const w = [];
  if (denv('MPD_TEST_NOW')) return w; /* a faked test clock cannot be compared with real file times */
  [path.join(U(), 'data', 'db.json'), licFile(), path.join(U(), 'prefs.json')].forEach(f => { try { w.push(fs.statSync(f).mtimeMs); } catch (e) { /* none */ } });
  try { const s = ctx.store && ctx.store.snapshot(); if (s) w.push(s.savedAt); } catch (e) { /* none */ }
  return w;
}
/* The computer id is only a secret that ties the saved licence state to this computer (it is never shown or asked for).
   If Windows will not tell it, a random per-install secret is used instead. */
async function ensureState() {
  if (ctx.state) return;
  let id = ''; try { id = String((await platform.machineId()) || ''); } catch (e) { id = ''; }
  if (!id) {
    const f = path.join(U(), '.mpd', 'inst.key'); id = readSafe(f, 200).trim();
    if (!/^[0-9a-f]{64}$/.test(id)) { id = crypto.randomBytes(32).toString('hex'); try { writeAtomic(f, id); } catch (e) { /* keep it in memory */ } }
  }
  initState(id);
}
/* text === undefined: check the code saved on this computer;  otherwise check the code typed by the user */
async function evaluate(text) {
  if (!platform.supported && !platform.testOnly) return { ok: false, code: 'PLATFORM' };
  await ensureState();
  const t = text == null ? readSafe(licFile(), 20000) : text;
  if (!t.trim()) return { ok: false, code: 'NONE' };
  const p = license.parse(t);
  if (!p) return { ok: false, code: 'MALFORMED' };
  const tk = ctx.state.tick(now(), witnessTimes());
  const r = license.check(t, { pubKey: channel.licenseKey, channel: channel.channel, now: now(), revoked: ctx.state.data.revoked, used: ctx.state.getUsed(p.info.id), clockOk: tk.ok });
  r.now = now();
  return r;
}
function decryptPayload(key) {
  if (!key) return { ok: false, code: 'NO_KEY' };
  try {
    const blob = fs.readFileSync(path.join(RENDERER, 'app.enc'));
    if (blob.subarray(0, 4).toString() !== 'MPE1') return { ok: false, code: 'BAD_PAYLOAD' };
    return { ok: true, html: cu.open(key, blob.subarray(4), 'MPD-PAYLOAD-v1') };
  } catch (e) { return { ok: false, code: 'BAD_PAYLOAD' }; }
}
/* ---------- protocol: mpd://app/... (the only origin the windows ever load) ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };
const CSP_APP = "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' data: blob:; connect-src 'self' data: blob:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
const CSP_ACT = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
const PAGES = ['/activation.html', '/activation.js', '/activation.css'].concat(DEV ? ['/issuer.html', '/issuer.js', '/issuer.css'] : []);
function registerProtocol() {
  protocol.handle('mpd', req => {
    const hdr = (type, csp) => ({ 'Content-Type': type, 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
    try {
      const u = new URL(req.url);
      if (u.host !== 'app') return new Response('not found', { status: 404 });
      const p = decodeURIComponent(u.pathname);
      if (p === '/app.html') {
        if (!ctx.appHtml) return new Response('locked', { status: 403 });
        return new Response(ctx.appHtml, { headers: hdr(MIME['.html'], CSP_APP) });
      }
      const ok = PAGES.includes(p) || /^\/fonts\/[A-Za-z0-9._-]+\.woff2$/.test(p);
      if (!ok) return new Response('not found', { status: 404 });
      const f = path.join(RENDERER, p);
      if (!f.startsWith(RENDERER + path.sep)) return new Response('not found', { status: 404 });
      return new Response(fs.readFileSync(f), { headers: hdr(MIME[path.extname(p)] || 'application/octet-stream', CSP_ACT) });
    } catch (e) { return new Response('error', { status: 500 }); }
  });
}
function hardenSession() {
  const s = session.defaultSession;
  s.setPermissionRequestHandler((wc, perm, cb) => cb(false));
  s.setPermissionCheckHandler(() => false);
  s.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*', 'ftp://*/*'] }, (d, cb) => cb({ cancel: true })); /* the program itself never talks to the network */
}

/* ---------- windows ---------- */
const WEB_OK = /^https:\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com|www\.whatsapp\.com)\//i;
function guardWindow(win) {
  win.webContents.setWindowOpenHandler(({ url }) => { if (WEB_OK.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { let ok = false; try { const u = new URL(url); ok = u.protocol === 'mpd:' && u.host === 'app'; } catch (er) { /* bad */ } if (!ok) { e.preventDefault(); if (WEB_OK.test(url)) shell.openExternal(url); } });
  win.webContents.on('will-attach-webview', e => e.preventDefault());
  win.webContents.on('page-title-updated', (e, title) => { if (DEV) { e.preventDefault(); win.setTitle('[DEVELOPER] ' + title); } });
}
function newWindow(opt) {
  const win = new BrowserWindow(Object.assign({
    backgroundColor: '#f3f5f7', show: false, autoHideMenuBar: false, title: channel.productName,
    icon: path.join(APP_DIR, 'icon.png'),
    webPreferences: { preload: path.join(APP_DIR, 'preload', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: false, devTools: DEV }
  }, opt));
  guardWindow(win);
  win.once('ready-to-show', () => win.show());
  return win;
}
function swapWindow(next) {
  const old = ctx.win; ctx.win = next;
  if (old && !old.isDestroyed()) { ctx.locking = true; old.destroy(); ctx.locking = false; }
}
function boundsFile() { return path.join(U(), 'window.json'); }
function restoreBounds() {
  try {
    const b = JSON.parse(readSafe(boundsFile(), 2000) || 'null');
    if (b && [b.x, b.y, b.width, b.height].every(Number.isFinite) && screen.getAllDisplays().some(d => b.x < d.bounds.x + d.bounds.width - 80 && b.x + b.width > d.bounds.x + 80 && b.y >= d.bounds.y - 10 && b.y < d.bounds.y + d.bounds.height - 80)) return b;
  } catch (e) { /* default */ }
  return null;
}
function showActivation(code, note) {
  ctx.kind = 'activation'; ctx.appHtml = null; ctx.lic = null; ctx.devLogin = false; clearTimeout(ctx.expTimer);
  ctx.actCode = code || 'NONE'; ctx.actNote = note || '';
  const win = newWindow({ width: 560, height: 920, minWidth: 460, minHeight: 640, title: 'تفعيل ' + channel.productName });
  win.setMenu(null);
  win.on('closed', () => { if (ctx.win === win) { ctx.win = null; closeIssuer(); } });
  swapWindow(win);
  win.loadURL('mpd://app/activation.html');
}
function showMain() {
  ctx.kind = 'main';
  const b = restoreBounds();
  const win = newWindow(Object.assign({ width: 1280, height: 860, minWidth: 480, minHeight: 600 }, b || {}));
  if (b && b.max) win.maximize();
  buildMenu();
  let t = null; const keep = () => { clearTimeout(t); t = setTimeout(() => { if (win.isDestroyed()) return; const bb = win.getNormalBounds(); try { writeAtomic(boundsFile(), JSON.stringify(Object.assign({}, bb, { max: win.isMaximized() }))); } catch (e) { /* ignore */ } }, 600); };
  win.on('resize', keep); win.on('move', keep);
  win.on('close', () => { if (!ctx.locking) { const bb = win.getNormalBounds(); try { writeAtomic(boundsFile(), JSON.stringify(Object.assign({}, bb, { max: win.isMaximized() }))); } catch (e) { /* ignore */ } } });
  win.on('closed', () => { if (ctx.win === win) { ctx.win = null; closeIssuer(); } });
  swapWindow(win);
  win.loadURL('mpd://app/app.html');
}
async function lockTo(code) { /* the code stopped being valid while the program is open */
  if (ctx.kind !== 'main') return;
  try { ctx.store && ctx.store.flush(); } catch (e) { /* ignore */ }
  showActivation(code);
}
/* the program locks itself at the exact end of a timed code (the 60-second check below is only a safety net) */
function scheduleExpiry() {
  clearTimeout(ctx.expTimer);
  if (!ctx.lic || ctx.lic.exp == null || denv('MPD_TEST_NOW')) return;
  const ms = ctx.lic.exp - now() + 500;
  if (ms > 0 && ms < 2147483000) { ctx.expTimer = setTimeout(async () => { if (ctx.kind !== 'main' || ctx.devLogin) return; const x = await evaluate(); if (!x.ok) lockTo(x.code); }, ms); ctx.expTimer.unref && ctx.expTimer.unref(); }
}

/* ---------- activation (from the activation page) ---------- */
async function tryActivate(text) {
  const r = await evaluate(text);
  if (!r.ok) return { ok: false, code: r.code, message: T.licenseErr[r.code] || T.licenseErr.MALFORMED };
  const p = decryptPayload(r.payloadKey);
  if (!p.ok) return { ok: false, code: p.code, message: T.licenseErr[p.code] };
  ctx.state.markUsed(r.info.id, r.at, r.exp); /* the time of a timed code counts from this first use and never restarts */
  ctx.state.setVer(channel.version, now());
  writeAtomic(licFile(), normCode(text));
  ctx.lic = { info: r.info, at: r.at, exp: r.exp, now: r.now }; ctx.devLogin = false; ctx.appHtml = p.html; ctx.warned = false;
  log('activated', r.info.id, r.info.unit, r.info.value, r.fresh ? 'first-use' : 'again');
  scheduleExpiry(); setTimeout(showMain, 1500);
  return { ok: true, summary: T.codeLine(r), fresh: r.fresh };
}

/* ---------- IPC ---------- */
const ACT = ['/activation.html'], ISS = ['/issuer.html'];
const guard = (e, pages) => { if (!senderOk(e, pages)) throw new Error('denied'); };
function setupIpc() {
  ipcMain.handle('lic:status', e => {
    guard(e, ACT);
    const kind = ctx.actCode === 'NONE' ? 'info' : ctx.actCode === 'UPDATED' ? 'warn' : 'err';
    return { productName: channel.productName, version: channel.version, channel: channel.channel, dev: DEV, code: ctx.actCode, kind,
      message: ctx.actCode === 'NONE' ? '' : (ctx.actNote || T.licenseErr[ctx.actCode] || ''), notice: T.keepNotice,
      hasData: !!(ctx.store && ctx.store.snapshot()), canIssue: !!(DEV && ctx.issuer && ctx.issuer.hasVaults()) };
  });
  ipcMain.handle('lic:activate', (e, text) => { guard(e, ACT); return tryActivate(String(text || '').slice(0, 6000)); });
  ipcMain.handle('data:export', e => { guard(e, ACT); return exportData(); });
  ipcMain.on('app:quit', e => { if (senderOk(e, ACT)) app.quit(); });
  ipcMain.on('store:snapshot', e => { e.returnValue = senderOk(e, ['/app.html']) && ctx.kind === 'main' ? (ctx.store.snapshot() || null) : null; });
  ipcMain.on('store:persist', (e, s) => {
    if (!senderOk(e, ['/app.html']) || ctx.kind !== 'main' || typeof s !== 'string' || s.length > 300e6) return;
    try {
      const o = JSON.parse(s), keys = {};
      for (const k of Object.keys(o)) if (/^accounts\.[A-Za-z0-9._-]{1,40}$/.test(k) && typeof o[k] === 'string') keys[k] = o[k];
      ctx.store.write(keys);
    } catch (er) { /* ignore a malformed message */ }
  });
  if (!DEV) return;
  /* ---- Developer build only: developer sign-in (no code) and the activation-code generator ---- */
  ipcMain.handle('dev:login', async (e, pw) => {
    guard(e, ACT);
    const r = await ctx.issuer.devPayloadKey(String(pw || '').slice(0, 200));
    if (!r.ok) return { ok: false, code: r.code, message: T.licenseErr[r.code] || 'تعذّر الدخول.' };
    const p = decryptPayload(r.payloadKey);
    if (!p.ok) return { ok: false, code: p.code, message: T.licenseErr[p.code] };
    ctx.lic = null; ctx.devLogin = true; ctx.appHtml = p.html; log('developer sign-in');
    setTimeout(showMain, 400);
    return { ok: true, summary: 'دخول المطوّر' };
  });
  ipcMain.on('issuer:open', e => { if (senderOk(e, ACT)) openIssuer(); });
  ipcMain.handle('issuer:unlock', async (e, pw) => { guard(e, ISS); const r = await ctx.issuer.unlock(String(pw || '').slice(0, 200)); return r.ok ? r : Object.assign(r, { message: T.licenseErr[r.code] || 'تعذّر فتح المولّد.' }); });
  ipcMain.handle('issuer:issue', (e, o) => { guard(e, ISS); const r = ctx.issuer.issue(o); if (!r.ok && !r.message) r.message = T.licenseErr[r.code]; return r; });
  ipcMain.handle('issuer:list', e => { guard(e, ISS); return ctx.issuer.list(); });
  ipcMain.on('issuer:lock', e => { if (senderOk(e, ISS)) ctx.issuer.lock(); });
  ipcMain.on('clip:write', (e, t) => { if (senderOk(e, ISS) && typeof t === 'string' && t.length <= 40000) clipboard.writeText(t); });
  ipcMain.handle('issuer:save', async (e, text, name) => {
    guard(e, ISS);
    if (typeof text !== 'string' || text.length > 400000) return { ok: false };
    const r = await dialog.showSaveDialog(ctx.issuerWin, { title: 'حفظ الأكواد', defaultPath: String(name || 'codes').replace(/[^A-Za-z0-9._-]/g, '_') + '.txt', filters: [{ name: 'نص', extensions: ['txt'] }] });
    if (r.canceled || !r.filePath) return { ok: false, code: 'CANCEL' };
    try { fs.writeFileSync(r.filePath, '\ufeff' + text, 'utf8'); return { ok: true, file: r.filePath }; } catch (er) { return { ok: false, message: 'تعذّر حفظ الملف.' }; }
  });
}
function openIssuer() {
  if (!DEV || !ctx.issuer) return;
  if (ctx.issuerWin && !ctx.issuerWin.isDestroyed()) { ctx.issuerWin.focus(); return; }
  const win = newWindow({ width: 780, height: 900, minWidth: 560, minHeight: 620, title: T.menu.issuer.replace('…', '') });
  win.setMenu(null);
  win.on('closed', () => { ctx.issuer.lock(); if (ctx.issuerWin === win) ctx.issuerWin = null; });
  ctx.issuerWin = win; win.loadURL('mpd://app/issuer.html');
}
function closeIssuer() { if (ctx.issuerWin && !ctx.issuerWin.isDestroyed()) ctx.issuerWin.destroy(); ctx.issuerWin = null; }

/* ---------- user data export ---------- */
async function exportData() {
  const snap = ctx.store.snapshot();
  if (!snap) return { ok: false, code: 'NO_DATA', message: 'لا توجد بيانات محفوظة لتصديرها.' };
  const d = new Date(now()), p = n => String(n).padStart(2, '0');
  const r = await dialog.showSaveDialog(ctx.win, { title: 'تصدير نسخة من البيانات', defaultPath: 'myfirstpro-data-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (r.canceled || !r.filePath) return { ok: false, code: 'CANCEL' };
  try { ctx.store.exportTo(r.filePath); return { ok: true, file: r.filePath }; } catch (e) { return { ok: false, code: 'WRITE', message: 'تعذّر حفظ الملف.' }; }
}

/* ---------- updates ---------- */
const updCtx = () => ({ channel: channel.channel, version: channel.version, plat: 'win32', arch: 'x64', lastSeq: ctx.state ? ctx.state.data.seq : 0 });
const updDir = () => path.join(U(), 'updates');
const updUrl = () => denv('MPD_UPDATE_URL') || channel.updateUrl || '';
const box = (o) => dialog.showMessageBox(ctx.win, Object.assign({ type: 'info', buttons: ['حسنًا'], defaultId: 0, noLink: true, title: channel.productName }, o));
const updErr = e => (T.updateErr[e && e.code] || ('تعذّر إكمال التحديث: ' + (e && e.message || e)));
async function installUpdate(file, manifest) {
  await update.reverify(file, manifest);
  const ask = await box({ type: 'question', message: 'تحديث إلى الإصدار ' + manifest.ver, detail: (manifest.notes ? manifest.notes + '\n\n' : '') + 'سيُغلق البرنامج ويُثبَّت التحديث ثم يُفتح من جديد. بياناتك محفوظة ولن تتأثر، وتُحفظ لها نسخة احتياطية قبل التحديث.', buttons: ['تحديث الآن', 'إلغاء'], defaultId: 0, cancelId: 1 });
  if (ask.response !== 0) return;
  try { ctx.store.flush(); ctx.store.backup('pre-update'); } catch (e) { /* the backup is best effort */ }
  ctx.state.setSeq(manifest.seq); ctx.state.addRevoked(manifest.revoke);
  const r = platform.launchInstaller(file);
  if (r && r.dryRun) { writeAtomic(path.join(U(), 'last-install.json'), JSON.stringify({ file, version: manifest.ver, sha512: manifest.file.sha512 })); await box({ message: 'وضع الاختبار: لم يبدأ التثبيت.' }); return; }
  ctx.quitting = true; setTimeout(() => app.quit(), 300);
}
async function checkOnlineUpdate(silent) {
  const url = updUrl();
  if (!url) { if (!silent) await box({ type: 'warning', message: T.updateErr.NOT_CONFIGURED }); return; }
  try {
    const c = await update.checkOnline(url, channel.updateKey, updCtx());
    if (c.manifest.seq >= ctx.state.data.seq) { ctx.state.addRevoked(c.manifest.revoke); ctx.state.setSeq(c.manifest.seq); }
    if (!c.newer) { if (!silent) await box({ message: 'أنت تستخدم أحدث إصدار (' + channel.version + ').' }); return; }
    const ask = await box({ type: 'question', message: 'يتوفر إصدار جديد ' + c.manifest.ver, detail: c.manifest.notes || '', buttons: ['تنزيل وتثبيت', 'لاحقًا'], defaultId: 0, cancelId: 1 });
    if (ask.response !== 0) return;
    ctx.win.setProgressBar(0.01);
    const f = await update.downloadInstaller(c.manifest, url, updDir(), (n, tot) => { if (ctx.win && !ctx.win.isDestroyed()) ctx.win.setProgressBar(n / tot); });
    if (ctx.win && !ctx.win.isDestroyed()) ctx.win.setProgressBar(-1);
    await installUpdate(f, c.manifest);
  } catch (e) { if (ctx.win && !ctx.win.isDestroyed()) ctx.win.setProgressBar(-1); if (!silent) await box({ type: 'error', message: 'التحديث', detail: updErr(e) }); }
}
async function updateFromFile() {
  const r = await dialog.showOpenDialog(ctx.win, { title: 'اختر ملف التحديث', properties: ['openFile'], filters: [{ name: 'ملف تحديث', extensions: ['mpupdate'] }] });
  if (r.canceled || !r.filePaths[0]) return;
  try {
    const x = await update.readContainer(r.filePaths[0], channel.updateKey, updCtx(), updDir());
    await installUpdate(x.file, x.manifest);
  } catch (e) { await box({ type: 'error', message: 'التحديث', detail: updErr(e) }); }
}

/* ---------- menu ---------- */
function buildMenu() {
  const m = T.menu;
  const dev = DEV ? [{ label: m.dev, submenu: [{ id: 'dev-issuer', label: m.issuer, accelerator: 'CmdOrCtrl+Shift+K', click: () => openIssuer() }, { type: 'separator' }, { label: m.devtools, accelerator: 'F12', click: () => ctx.win && ctx.win.webContents.toggleDevTools() }, { label: m.reload, accelerator: 'CmdOrCtrl+R', click: () => ctx.win && ctx.win.webContents.reload() }] }] : [];
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: m.file, submenu: [{ id: 'file-export', label: m.exportData, click: () => { exportData().then(r => { if (r.ok) box({ message: 'تم حفظ نسخة البيانات.', detail: r.file }); else if (r.code === 'NO_DATA') box({ message: r.message }); }); } }, { label: m.openData, click: () => shell.openPath(U()) }, { type: 'separator' }, { label: m.quit, accelerator: 'Alt+F4', click: () => app.quit() }] },
    { label: m.edit, submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: m.view, submenu: [{ label: m.fullscreen, role: 'togglefullscreen' }] },
    ...dev,
    { label: m.help, submenu: [
      { id: 'help-check', label: m.checkUpdate, click: () => checkOnlineUpdate(false) }, { id: 'help-file', label: m.updateFile, click: () => updateFromFile() },
      { id: 'help-auto', label: m.autoCheck, type: 'checkbox', checked: !!ctx.prefs.autoCheck, click: it => { ctx.prefs.autoCheck = it.checked; savePrefs(); } },
      { type: 'separator' }, { id: 'help-license', label: m.licenseInfo, click: () => showLicenseInfo() }, { id: 'help-about', label: m.about, click: () => showAbout() }] }
  ]));
}
function showLicenseInfo() {
  const l = ctx.lic, ver = 'النسخة: ' + (DEV ? 'مطوّر (Developer)' : 'إنتاج (Production)') + ' — الإصدار ' + channel.version;
  if (ctx.devLogin || !l) return box({ message: 'معلومات الترخيص', detail: ['دخول المطوّر بكلمة المرور (بدون كود تفعيل).', ver].join('\n') });
  const i = l.info, t = now();
  box({ message: 'معلومات الترخيص', detail: ['رقم الكود: ' + i.id, 'النوع: ' + (i.unit === 'permanent' ? 'دائم' : 'مؤقت — ' + T.dur(i.unit, i.value)), 'بدأ التفعيل: ' + T.dt(l.at),
    l.exp == null ? 'الصلاحية: دائمة' : 'ينتهي: ' + T.dt(l.exp) + ' (متبقي ' + T.remain(l.exp - t) + ')', ver, '', T.keepNotice].join('\n') });
}
function showAbout() {
  box({ message: channel.productName, detail: ['الإصدار ' + channel.version + (DEV ? ' — Developer Build' : ''), 'إصدار البرنامج الداخلي: ' + (channel.webVersion || '—'), 'تصميم بواسطة MINA.N.F', 'Electron ' + process.versions.electron + ' • Chromium ' + process.versions.chrome].join('\n') });
}

/* ---------- start ---------- */
app.on('second-instance', () => { if (ctx.win && !ctx.win.isDestroyed()) { if (ctx.win.isMinimized()) ctx.win.restore(); ctx.win.focus(); } });
app.on('window-all-closed', () => { log('all windows closed'); if (!ctx.locking) app.quit(); });
app.on('render-process-gone', (e, wc, d) => log('render-process-gone', d && d.reason));
app.on('child-process-gone', (e, d) => log('child-process-gone', d && d.type, d && d.reason));
app.on('before-quit', () => { ctx.quitting = true; try { ctx.store && ctx.store.flush(); } catch (e) { /* ignore */ } });

app.whenReady().then(async () => {
  log('start', channel.channel, channel.version, process.platform, 'electron', process.versions.electron);
  registerProtocol(); hardenSession(); setupIpc(); loadPrefs();
  ctx.store = new DataStore(path.join(U(), 'data'), { now });
  if (DEV) ctx.issuer = issuerMod.create({ vaultsFile: path.join(RENDERER, 'vaults.json'), logFile: path.join(U(), 'issued.jsonl'), now });
  const r = await evaluate();
  const stored = r.code !== 'NONE';
  /* a saved code is asked for again after the program was updated (or when the saved licence state was lost) */
  const again = r.ok && ctx.state.data.ver !== channel.version;
  log('licence check:', r.code, again ? '(asking again after update)' : '');
  const p = r.ok && !again ? decryptPayload(r.payloadKey) : null;
  if (p && p.ok) {
    ctx.lic = { info: r.info, at: r.at, exp: r.exp, now: r.now }; ctx.appHtml = p.html; showMain(); scheduleExpiry();
    if (ctx.prefs.autoCheck && updUrl()) setTimeout(() => checkOnlineUpdate(true), 5000);
  } else if (again) {
    showActivation('UPDATED', ctx.state.data.ver ? T.updated(channel.version, r.info.id) : 'أدخل كود التفعيل مرة أخرى لتأكيده على هذا الجهاز.');
  } else showActivation(r.ok ? p.code : r.code);
  setInterval(async () => { /* a code that ends while the program is open locks it (the data stays) */
    if (ctx.kind !== 'main' || ctx.devLogin) return;
    const x = await evaluate(); if (!x.ok) return lockTo(x.code);
    if (x.exp != null && x.exp - now() <= 10 * 60000 && !ctx.warned) { ctx.warned = true; box({ type: 'warning', message: 'اقتربت نهاية مدة الكود', detail: 'متبقي ' + T.remain(x.exp - now()) + '. احفظ عملك — بياناتك تبقى محفوظة بعد الانتهاء ويمكنك تصديرها.' }); }
  }, 60000).unref();
});
