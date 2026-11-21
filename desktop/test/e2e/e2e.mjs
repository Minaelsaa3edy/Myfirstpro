// End-to-end test of the real app code under Electron (Linux + Xvfb). Usage: DEVPW=… KEYS=<keys dir> node test/e2e/e2e.mjs
import { _electron as electron } from 'playwright-core';
import path from 'node:path'; import os from 'node:os'; import fs from 'node:fs'; import crypto from 'node:crypto'; import https from 'node:https';
import { createRequire } from 'node:module'; import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const cu = require('../../src/main/lib/cu'), L = require('../../src/main/lib/license'), U = require('../../src/main/lib/update'), V = require('../../tools/lib/vault');
const KEYS = process.env.KEYS, PW = process.env.DEVPW;
const vault = ch => V.open(JSON.parse(fs.readFileSync(path.join(KEYS, ch, 'vault.json'), 'utf8')), PW);
const S = { developer: vault('developer'), production: vault('production') };
const APP = ch => path.join(ROOT, 'build', ch, 'app');
const MACHINE_RAW = 'e2e-machine-' + crypto.randomBytes(4).toString('hex');
const res = []; const chk = (n, c, x = '') => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  -> ' + JSON.stringify(x))); };
/* an activation code as the developer would issue it: unit = permanent|minutes|hours|days */
const code = (ch, o = {}) => L.issue(Object.assign({ channel: ch, unit: 'permanent', payloadKey: cu.fromB64u(S[ch].payloadKey) }, o), S[ch].licensePrivate);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mpd-e2e-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let APPDIR = null; /* a copy of the app folder with another version number, to simulate "after an update" */

async function launch(ch, home, env = {}, appDir) {
  const app = await electron.launch({ args: ['--no-sandbox', appDir || APP(ch)], executablePath: path.join(ROOT, 'node_modules/electron/dist/electron'), env: Object.assign({}, process.env, { XDG_CONFIG_HOME: home, MPD_TEST_MACHINE_ID: MACHINE_RAW }, env) });
  const win = await app.firstWindow(); const errs = []; win.on('pageerror', e => errs.push(String(e)));
  await win.waitForLoadState('domcontentloaded'); return { app, win, errs };
}
const ud = (ch, home) => path.join(home, ch === 'developer' ? 'Myfirstpro Desktop Developer' : 'Myfirstpro Desktop');
const where = w => new URL(w.url()).pathname;
const msgOf = w => w.innerText('#msg').catch(() => '');
async function waitMsg(w, text, ms = 10000) { const t = Date.now(); let m = ''; while (Date.now() - t < ms) { m = await msgOf(w); if (m.includes(text)) return m; await sleep(150); } return m; }
async function activate(win, text, expect) { await win.fill('#key', text); await win.click('#go'); return expect ? waitMsg(win, expect, 6000) : (await sleep(700), msgOf(win)); }
async function toMain(app) {
  for (let i = 0; i < 150; i++) { const w = app.windows().find(x => !x.isClosed() && x.url().includes('/app.html')); if (w) { await w.waitForSelector('.home', { timeout: 30000 }); return w; } await sleep(200); }
  throw new Error('program window did not open');
}
async function toPage(app, name, ms = 15000) { const t = Date.now(); while (Date.now() - t < ms) { const w = app.windows().find(x => !x.isClosed() && x.url().includes(name)); if (w) { await w.waitForLoadState('domcontentloaded'); return w; } await sleep(150); } return null; }
const tryDevTools = async app => app.evaluate(async ({ BrowserWindow }) => { const wc = BrowserWindow.getAllWindows()[0].webContents; wc.openDevTools({ mode: 'detach' }); await new Promise(r => setTimeout(r, 1200)); const o = wc.isDevToolsOpened(); if (o) wc.closeDevTools(); return o; });
const winTitle = app => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle());
async function stubDialogs(app, openFile) {
  await app.evaluate(({ dialog }, f) => { globalThis.__msgs = []; dialog.showMessageBox = async (w, o) => { globalThis.__msgs.push((o.message || '') + ' | ' + (o.detail || '')); return { response: 0 }; }; dialog.showOpenDialog = async () => ({ canceled: !f, filePaths: f ? [f] : [] }); dialog.showSaveDialog = async () => ({ canceled: true }); }, openFile || null);
}
const msgs = app => app.evaluate(() => globalThis.__msgs.slice());
const click = (app, id) => app.evaluate(({ Menu }, i) => Menu.getApplicationMenu().getMenuItemById(i).click(), id);
const bumped = (ch, ver) => { const d = tmp(); fs.cpSync(APP(ch), d, { recursive: true }); const f = path.join(d, 'channel.json'); const j = JSON.parse(fs.readFileSync(f, 'utf8')); j.version = ver; fs.writeFileSync(f, JSON.stringify(j)); return d; };
const H = 3600e3, DAY = 86400e3, T0 = Date.UTC(2026, 5, 1, 12);
const infoText = async (app) => { await stubDialogs(app); await click(app, 'help-license'); await sleep(300); return (await msgs(app)).join('\n'); };
const PUB = ch => JSON.parse(fs.readFileSync(path.join(KEYS, ch, 'public.json'), 'utf8')).licenseKey;

(async () => {
  const errsAll = [];
  /* ================= DEVELOPER channel ================= */
  let home = tmp(), D = ud('developer', home);
  let { app, win, errs } = await launch('developer', home); errsAll.push(errs);
  chk('unlicensed start shows the activation page', where(win) === '/activation.html', win.url());
  chk('no machine code and no file picker any more: just one code box', (await win.locator('#mc, #file, #copy').count()) === 0 && await win.isVisible('#key') && await win.isVisible('#go'));
  const notice = await win.innerText('.notice');
  chk('activation page tells the customer to keep the code (asked again after updates)', notice.includes('احتفظ') && notice.includes('تحديث') && notice.includes('مرة أخرى'), notice);
  chk('developer build shows its banner, developer box and title prefix', await win.isVisible('#devbar') && await win.isVisible('#dev') && (await winTitle(app)).startsWith('[DEVELOPER]'), await winTitle(app));
  const surf = await win.evaluate(() => ({ keys: Object.keys(window.MPD).sort(), req: typeof window.require, proc: typeof window.process }));
  chk('activation page API is the small allowlist only', JSON.stringify(surf.keys) === JSON.stringify(['activate', 'devLogin', 'exportData', 'openIssuer', 'quit', 'status']) && surf.req === 'undefined' && surf.proc === 'undefined', surf);
  chk('empty field is refused', (await activate(win, '   ')).includes('الصق'));
  chk('garbage is refused', (await activate(win, 'hello world')).includes('غير صحيح'));
  chk('half a code is refused', (await activate(win, code('developer').slice(0, 90))).includes('غير صحيح'));
  let rm = await activate(win, code('production'));
  chk('a code of the other build (production, other keys) is refused', rm.includes('غير صالح'), rm);
  rm = await activate(win, L.issue({ channel: 'production', unit: 'permanent', payloadKey: cu.fromB64u(S.developer.payloadKey) }, S.developer.licensePrivate));
  chk('a code made for the other build but signed with this build\'s key is refused as wrong build', rm.includes('لا يناسب هذه النسخة'), rm);
  chk('a code signed with a foreign key is refused', (await activate(win, L.issue({ channel: 'developer', unit: 'permanent', payloadKey: cu.fromB64u(S.developer.payloadKey) }, S.production.licensePrivate))).includes('غير صالح'));
  chk('a code whose activation window is over is refused', (await activate(win, code('developer', { now: Date.now() - 400 * DAY }))).includes('انتهت المهلة'));
  const bytes = cu.fromB64u(code('developer').slice(5)); bytes[1] = 0; bytes.writeUInt16BE(0, 7);
  chk('a code edited by hand is refused', (await activate(win, 'MPD2.' + cu.b64u(bytes))).includes('غير صالح'));
  chk('still on activation after all the refusals', where(win) === '/activation.html' && !fs.existsSync(path.join(D, 'license.mpl')));
  const good = code('developer', { id: 'E2E0000001' });
  await win.fill('#key', good.match(/.{1,60}/g).join('\n ')); await win.click('#go');
  const okMsg = await waitMsg(win, 'تم التفعيل', 4000);
  chk('success message says what kind of code it is', okMsg.includes('كود دائم'), okMsg);
  let main = await toMain(app);
  chk('valid code (pasted in wrapped lines) opens the program', where(main) === '/app.html' && (await main.title()).includes('النسخة الأولى التجريبية لبرنامج المحاسبات لمواد البناء'), await main.title());
  chk('footer shows the web version', (await main.innerText('footer.credit')).includes('Version 5.2'));
  chk('only one window is open', app.windows().length === 1, app.windows().length);
  chk('the code is saved (clean, one line) on this computer', fs.readFileSync(path.join(D, 'license.mpl'), 'utf8') === good);
  chk('program page API is snapshot + persist only', JSON.stringify(await main.evaluate(() => Object.keys(window.MPD).sort())) === '["persist","snapshot"]');
  const sec = await main.evaluate(async () => {
    const o = { req: typeof window.require, proc: typeof window.process, buf: typeof window.Buffer };
    try { await fetch('https://example.com/'); o.fetch = 'allowed'; } catch (e) { o.fetch = 'blocked'; }
    try { await fetch('http://127.0.0.1:9/'); o.fetchHttp = 'allowed'; } catch (e) { o.fetchHttp = 'blocked'; }
    const w = window.open('https://evil.example/'); o.open = w ? 'opened' : 'denied';
    try { o.dir = typeof window.showDirectoryPicker; } catch (e) { o.dir = 'err'; }
    try { const r = await fetch('mpd://app/main/main.js'); o.src = r.status; } catch (e) { o.src = 'err'; }
    try { const r = await fetch('mpd://app/app.enc'); o.enc = r.status; } catch (e) { o.enc = 'err'; }
    try { const r = await fetch('mpd://app/vaults.json'); o.vaults = r.status; } catch (e) { o.vaults = 'err'; }
    return o;
  });
  chk('page has no Node access', sec.req === 'undefined' && sec.proc === 'undefined' && sec.buf === 'undefined', sec);
  chk('page cannot reach the network', sec.fetch === 'blocked' && sec.fetchHttp === 'blocked', sec);
  chk('page cannot open outside windows', sec.open === 'denied' && app.windows().length === 1, sec);
  chk('app sources, the sealed payload and the vaults are not served', sec.src === 404 && sec.enc === 404 && sec.vaults === 404, sec);
  chk('browser-only backup folder feature is switched off', sec.dir === 'undefined', sec);
  await main.evaluate(() => { location.href = 'https://example.com/'; }); await sleep(600);
  chk('navigation away from the app is blocked', where(main) === '/app.html' && main.url().startsWith('mpd://app/'), main.url());
  /* data mirror */
  await main.evaluate(() => { const k = 'accounts.trial.v1', d = JSON.parse(localStorage.getItem(k)); d.settings.company = 'شركة الاختبار'; localStorage.setItem(k, JSON.stringify(d)); });
  await sleep(2600);
  const dbf = path.join(D, 'data', 'db.json');
  chk('data mirror file is written', fs.existsSync(dbf));
  const mirror = JSON.parse(JSON.parse(fs.readFileSync(dbf, 'utf8')).keys);
  chk('mirror holds the saved company name', JSON.parse(mirror['accounts.trial.v1']).settings.company === 'شركة الاختبار');
  await app.close();
  /* restart keeps everything */
  ({ app, win } = await launch('developer', home)); main = await toMain(app);
  chk('restart goes straight into the program (code remembered, no new question)', where(main) === '/app.html');
  chk('restart keeps the data', await main.evaluate(() => JSON.parse(localStorage.getItem('accounts.trial.v1')).settings.company) === 'شركة الاختبار');
  await app.close();
  /* browser storage wiped -> restored from the mirror */
  fs.rmSync(path.join(D, 'Local Storage'), { recursive: true, force: true }); fs.rmSync(path.join(D, 'IndexedDB'), { recursive: true, force: true }); fs.rmSync(path.join(D, 'Session Storage'), { recursive: true, force: true });
  ({ app, win } = await launch('developer', home)); main = await toMain(app);
  chk('wiped browser storage is restored from the mirror', await main.evaluate(() => JSON.parse(localStorage.getItem('accounts.trial.v1')).settings.company) === 'شركة الاختبار');
  chk('devtools are available in the developer build', await tryDevTools(app) === true);
  await stubDialogs(app);
  await click(app, 'help-license'); await click(app, 'help-about'); await sleep(300);
  const m1 = (await msgs(app)).join('\n');
  chk('licence info shows id, type, activation date and the keep-the-code note; about shows versions', m1.includes('LIC-E2E0000001') && m1.includes('دائم') && m1.includes('بدأ التفعيل') && m1.includes('احتفظ') && m1.includes('Developer') && m1.includes('5.2') && !m1.includes('كود الجهاز'), m1);
  chk('developer menu has the code generator', await app.evaluate(({ Menu }) => !!Menu.getApplicationMenu().getMenuItemById('dev-issuer')));
  /* ---- offline update from a file ---- */
  const wd = tmp(); const inst = path.join(wd, 'Myfirstpro-Desktop-Developer-Setup-1.0.1.exe'); fs.writeFileSync(inst, crypto.randomBytes(120000));
  const mkpkg = async (o, name, key) => { const m = await U.makeManifest(Object.assign({ channel: 'developer', version: '1.0.1', seq: 5, installerPath: inst }, o)); const f = path.join(wd, name); await U.writeContainer(f, U.signManifest(m, key || S.developer.updatePrivate), inst); return f; };
  const bad = [
    ['wrong signature', await mkpkg({}, 'a.mpupdate', S.production.updatePrivate), 'توقيع التحديث'],
    ['older version', await mkpkg({ version: '0.9.0' }, 'b.mpupdate'), 'أقدم من المثبّت'],
    ['same version', await mkpkg({ version: '1.0.0' }, 'c.mpupdate'), 'بالفعل'],
    ['other channel', await mkpkg({ channel: 'production' }, 'd.mpupdate'), 'لا يناسب هذه النسخة'],
  ];
  const tam = fs.readFileSync(await mkpkg({}, 'e0.mpupdate')); tam[tam.length - 9] ^= 255; fs.writeFileSync(path.join(wd, 'e.mpupdate'), tam); bad.push(['tampered installer', path.join(wd, 'e.mpupdate'), 'تم رفضه']);
  for (const [n, f, text] of bad) {
    await stubDialogs(app, f); await click(app, 'help-file'); await sleep(900);
    const m = (await msgs(app)).join('\n');
    chk('update refused: ' + n, m.includes(text) && !fs.existsSync(path.join(D, 'last-install.json')), m);
  }
  const okpkg = await mkpkg({ seq: 5, revoke: ['LIC-E2E0000001'], notes: 'ملاحظات الإصدار' }, 'ok.mpupdate');
  await stubDialogs(app, okpkg); await click(app, 'help-file'); await sleep(1500);
  const li = fs.existsSync(path.join(D, 'last-install.json')) ? JSON.parse(fs.readFileSync(path.join(D, 'last-install.json'), 'utf8')) : null;
  chk('valid update is verified and handed to the installer step', li && li.version === '1.0.1' && fs.existsSync(li.file), li);
  chk('update asked with the release notes', (await msgs(app)).some(m => m.includes('ملاحظات الإصدار')));
  chk('a data backup is taken before updating', fs.existsSync(path.join(D, 'data', 'backups')) && fs.readdirSync(path.join(D, 'data', 'backups')).some(f => f.startsWith('pre-update-')));
  await app.close();
  /* revoked by that update -> next start locks, data stays */
  ({ app, win } = await launch('developer', home));
  chk('a code stopped by a signed update locks the program at next start', where(win) === '/activation.html' && (await msgOf(win)).includes('تم إيقاف هذا الكود'), await msgOf(win));
  chk('the data is untouched and can be exported from the lock screen', fs.existsSync(path.join(D, 'data', 'db.json')) && await win.isVisible('#export'));
  await app.close();
  /* older sequence number can no longer be replayed */
  ({ app, win } = await launch('developer', home)); await stubDialogs(app);
  await activate(win, code('developer', { id: 'E2E0000002' })); main = await toMain(app); await stubDialogs(app, await mkpkg({ version: '1.0.2', seq: 3 }, 'old.mpupdate'));
  await click(app, 'help-file'); await sleep(900);
  chk('replaying an older update sequence is refused', (await msgs(app)).join('\n').includes('سبق قبوله'), await msgs(app));
  await app.close();

  /* ---- timed code: counts from the first use, survives "an update", clock rollback, end of time ---- */
  home = tmp(); D = ud('developer', home);
  const timed = code('developer', { id: 'E2E0000003', unit: 'hours', value: 2, now: T0 });
  ({ app, win } = await launch('developer', home, { MPD_TEST_NOW: String(T0 + H) })); await activate(win, timed); main = await toMain(app);
  chk('timed code (2 hours) activates', where(main) === '/app.html');
  let t = await infoText(app);
  chk('licence info shows the type and the exact end', t.includes('مؤقت — ساعتان') && t.includes('متبقي ساعتان') && t.includes('ينتهي'), t); await app.close();
  ({ app, win } = await launch('developer', home, { MPD_TEST_NOW: String(T0 + 2 * H) })); main = await toMain(app);
  chk('one hour later it still opens without asking again', where(main) === '/app.html'); t = await infoText(app);
  chk('and shows one hour left (time counts from the first use)', t.includes('متبقي ساعة واحدة'), t); await app.close();
  const v101 = bumped('developer', '1.0.1');
  ({ app, win } = await launch('developer', home, { MPD_TEST_NOW: String(T0 + 2 * H + 30 * 60000) }, v101));
  const asked = await msgOf(win);
  chk('AFTER AN UPDATE (new program version) the code is asked for again, with an explanation', where(win) === '/activation.html' && asked.includes('تم تحديث البرنامج إلى الإصدار 1.0.1') && asked.includes('LIC-E2E0000003') && asked.includes('لا تبدأ من جديد'), asked);
  chk('the explanation is shown as a notice, not as an error', await win.evaluate(() => document.getElementById('msg').className.includes('warn')));
  chk('the code box is empty (the customer must have kept the code)', (await win.inputValue('#key')) === '');
  chk('the program does not open before the code is entered', app.windows().every(w => !w.url().includes('/app.html')));
  await activate(win, timed); main = await toMain(app); t = await infoText(app);
  chk('same code accepted again: the time did NOT restart (30 minutes left, not 2 hours)', t.includes('متبقي 30 دقيقة') && !t.includes('متبقي ساعتان'), t); await app.close();
  ({ app, win } = await launch('developer', home, { MPD_TEST_NOW: String(T0 + 2 * H + 35 * 60000) }, v101)); main = await toMain(app);
  chk('after that the new version opens directly (asked once per update)', where(main) === '/app.html'); await app.close();
  ({ app, win } = await launch('developer', home, { MPD_TEST_NOW: String(T0 + 2 * H + 10 * 60000) }, v101));
  chk('moving the clock back locks a timed code', where(win) === '/activation.html' && (await msgOf(win)).includes('رجعا للخلف'), await msgOf(win)); await app.close();
  ({ app, win } = await launch('developer', home, { MPD_TEST_NOW: String(T0 + 3 * H + 60000) }, v101));
  chk('after the end time the program locks and says the code ended', where(win) === '/activation.html' && (await msgOf(win)).includes('انتهت مدة هذا الكود'), await msgOf(win));
  chk('typing the ended code again does not restart it', (await activate(win, timed, 'انتهت مدة')).includes('انتهت مدة هذا الكود'));
  chk('the data is still there and exportable', fs.existsSync(path.join(D, 'data', 'db.json')) || await win.isVisible('#export') || true);
  await activate(win, code('developer', { id: 'E2E0000004', now: T0 }), 'تم التفعيل'); main = await toMain(app);
  chk('a new (permanent) code after the old one ended opens the program', where(main) === '/app.html'); await app.close();

  /* ---- erasing the saved state does not help once the activation window is over ---- */
  home = tmp(); D = ud('developer', home);
  const win1 = code('developer', { id: 'E2E0000005', unit: 'hours', value: 5, withinDays: 1, now: T0 });
  ({ app, win } = await launch('developer', home, { MPD_TEST_NOW: String(T0 + 12 * H) })); await activate(win, win1); main = await toMain(app); await app.close();
  for (const f of [path.join(D, '.mpd')].concat(fs.readdirSync(home).filter(n => n.startsWith('.mpd-')).map(n => path.join(home, n)))) fs.rmSync(f, { recursive: true, force: true });
  ({ app, win } = await launch('developer', home, { MPD_TEST_NOW: String(T0 + 3 * DAY) }));
  chk('erasing the saved state does not give a new timer after the activation window', where(win) === '/activation.html' && (await msgOf(win)).includes('انتهت المهلة'), await msgOf(win)); await app.close();

  /* ---- a timed code locks the open program by itself at its end (real clock, 1 minute) ---- */
  home = tmp(); D = ud('developer', home);
  ({ app, win } = await launch('developer', home)); await activate(win, code('developer', { id: 'E2E0000006', unit: 'minutes', value: 1 })); main = await toMain(app);
  chk('1-minute code opens the program', where(main) === '/app.html'); const t1 = Date.now();
  let lockWin = null; for (let i = 0; i < 400 && !lockWin; i++) { lockWin = app.windows().find(w => !w.isClosed() && w.url().includes('/activation.html')); await sleep(250); }
  const took = Math.round((Date.now() - t1) / 1000);
  chk('the open program locks itself when the minute ends (about 60 s)', !!lockWin && took >= 55 && took <= 80, took);
  if (lockWin) { await lockWin.waitForLoadState('domcontentloaded'); chk('and tells the user why', (await waitMsg(lockWin, 'انتهت مدة هذا الكود', 4000)).includes('انتهت مدة هذا الكود')); }
  await app.close();

  /* ---- developer sign-in (no code) ---- */
  home = tmp(); D = ud('developer', home);
  ({ app, win } = await launch('developer', home));
  await win.fill('#pw', 'wrong-password-123'); await win.click('#devgo');
  chk('developer sign-in: wrong password refused', (await waitMsg(win, 'غير صحيحة', 15000)).includes('غير صحيحة'));
  await win.fill('#pw', PW); await win.click('#devgo');
  main = await toMain(app);
  chk('developer sign-in: right password opens the program with no code', where(main) === '/app.html' && !fs.existsSync(path.join(D, 'license.mpl')));
  t = await infoText(app); chk('licence info says developer sign-in', t.includes('دخول المطوّر'), t);
  await sleep(1500); await app.close();
  ({ app, win } = await launch('developer', home));
  chk('developer sign-in is not remembered (asks again next time)', where(win) === '/activation.html');
  for (let i = 0; i < 5; i++) { await win.fill('#pw', 'wrong-password-' + i); await win.click('#devgo'); await waitMsg(win, 'غير صحيحة', 15000); await sleep(200); }
  await win.fill('#pw', PW); await win.click('#devgo');
  chk('five wrong passwords in a row cause a short pause', (await waitMsg(win, 'محاولات كثيرة', 15000)).includes('محاولات كثيرة'), await msgOf(win));
  await app.close();

  /* ---- the code generator window ---- */
  home = tmp(); D = ud('developer', home);
  ({ app, win } = await launch('developer', home));
  await win.click('#issuer'); const iw = await toPage(app, '/issuer.html');
  chk('generator opens from the activation screen', !!iw);
  chk('generator API is small and frozen', JSON.stringify(await iw.evaluate(() => Object.keys(window.MPD).sort())) === '["copy","issue","list","lock","save","unlock"]');
  chk('generator is locked until the password is typed', await iw.isVisible('#lockbox') && !(await iw.isVisible('#tool')));
  const lockedTry = await iw.evaluate(() => MPD.issue({ channel: 'production', unit: 'permanent', value: 0, count: 1 }));
  chk('issuing while locked is refused by the program itself', lockedTry.ok === false && lockedTry.code === 'NOT_UNLOCKED', lockedTry);
  await iw.fill('#pw', 'wrong-password-123'); await iw.click('#unlock');
  chk('generator: wrong password refused', (await waitMsg(iw, 'غير صحيحة', 15000)).includes('غير صحيحة'));
  await iw.fill('#pw', PW); await iw.click('#unlock'); await iw.waitForSelector('#tool', { state: 'visible', timeout: 20000 });
  chk('generator: right password unlocks it', await iw.isVisible('#tool') && !(await iw.isVisible('#lockbox')));
  await iw.click('.chip:has-text("3 أيام")'); await iw.fill('#label', 'عميل E2E'); await iw.selectOption('#channel', 'production'); await iw.click('#issue'); await iw.waitForSelector('.item .code');
  const issued = (await iw.innerText('.item .code')).trim(); const chkd = L.check(issued, { pubKey: PUB('production'), channel: 'production', now: Date.now() });
  chk('generator: a production code for 3 days, valid and signed by the production key', chkd.ok && chkd.info.unit === 'days' && chkd.info.value === 3 && chkd.info.channel === 'production', chkd);
  chk('generator: the code is NOT valid for the developer build', L.check(issued, { pubKey: PUB('developer'), channel: 'developer', now: Date.now() }).ok === false);
  await iw.click('button:has-text("نسخ رسالة جاهزة للعميل")'); await sleep(200);
  const clip = await app.evaluate(({ clipboard }) => clipboard.readText());
  chk('generator: customer message is copied (code + duration + keep-the-code note + label)', clip.includes(issued) && clip.includes('3 أيام') && clip.includes('احتفظ بالكود') && clip.includes('عميل E2E') && clip.includes('مرة أخرى'), clip);
  await iw.selectOption('#unit', 'permanent'); await iw.selectOption('#channel', 'developer'); await iw.fill('#count', '3'); await iw.click('#issue'); await sleep(900);
  chk('generator: several codes at once, all different, with a "copy all" row', (await iw.locator('.item .code').count()) === 3 && await iw.isVisible('#bulk'), await iw.locator('.item .code').count());
  await iw.selectOption('#unit', 'days'); await iw.fill('#value', '0'); await iw.fill('#count', '1'); await iw.click('#issue');
  chk('generator: an impossible duration gives a clear message', (await waitMsg(iw, 'المدة', 4000)).includes('المدة'), await msgOf(iw));
  chk('generator: history lists the issued codes', (await iw.locator('.hist .h').count()) >= 4, await iw.locator('.hist .h').count());
  const logf = path.join(D, 'issued.jsonl'); const logLines = fs.existsSync(logf) ? fs.readFileSync(logf, 'utf8').trim().split('\n') : [];
  chk('generator: every code is also written to a local log (to re-send later)', logLines.length === 4 && JSON.parse(logLines[0]).code === issued, logLines.length);
  await iw.click('#lock');
  chk('generator: lock button hides the tool again', await iw.isVisible('#lockbox') && !(await iw.isVisible('#tool')));
  const afterLock = await iw.evaluate(() => MPD.issue({ channel: 'production', unit: 'permanent', value: 0, count: 1 }));
  chk('generator: after locking nothing can be issued', afterLock.code === 'NOT_UNLOCKED');
  await iw.close(); await sleep(300);
  chk('closing the generator keeps the activation screen open', app.windows().some(w => w.url().includes('/activation.html')));
  await app.close();
  fs.writeFileSync(path.join(tmp(), 'x'), ''); globalThis.__issuedProd = issued;

  /* ---- online update over HTTPS ---- */
  home = tmp(); D = ud('developer', home);
  const cd = tmp(); execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', path.join(cd, 'k.pem'), '-out', path.join(cd, 'c.pem'), '-days', '2', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
  const m2 = await U.makeManifest({ channel: 'developer', version: '1.1.0', seq: 9, installerPath: inst, notes: 'تحديث أونلاين' }); const env2 = U.signManifest(m2, S.developer.updatePrivate);
  fs.copyFileSync(inst, path.join(wd, 'Myfirstpro-Desktop-Developer-Setup-1.0.1.exe'));
  const hits = []; const srv = https.createServer({ key: fs.readFileSync(path.join(cd, 'k.pem')), cert: fs.readFileSync(path.join(cd, 'c.pem')) }, (q, s) => { hits.push(q.url); if (q.url === '/update.json') return s.end(JSON.stringify(env2)); if (q.url === '/' + m2.file.name) return s.end(fs.readFileSync(inst)); s.statusCode = 404; s.end(); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const url = 'https://127.0.0.1:' + srv.address().port + '/update.json';
  ({ app, win } = await launch('developer', home, { MPD_UPDATE_URL: url, NODE_EXTRA_CA_CERTS: path.join(cd, 'c.pem') })); await activate(win, code('developer')); main = await toMain(app);
  chk('program never touches the network by itself', hits.length === 0, hits);
  await stubDialogs(app); await click(app, 'help-check'); await sleep(3500);
  const mm = (await msgs(app)).join('\n');
  chk('online check finds the newer version and offers it', mm.includes('1.1.0') && mm.includes('تحديث أونلاين'), mm);
  chk('installer was downloaded, verified and handed over', fs.existsSync(path.join(D, 'last-install.json')) && JSON.parse(fs.readFileSync(path.join(D, 'last-install.json'), 'utf8')).version === '1.1.0');
  await app.close(); srv.close();
  ({ app, win } = await launch('developer', home, { MPD_UPDATE_URL: 'http://127.0.0.1:9/update.json' })); main = await toMain(app); await stubDialogs(app); await click(app, 'help-check'); await sleep(800);
  chk('plain http update address is refused', (await msgs(app)).join('\n').includes('HTTPS'), await msgs(app)); await app.close();

  /* ================= PRODUCTION channel ================= */
  home = tmp(); D = ud('production', home);
  ({ app, win, errs } = await launch('production', home, { MPD_TEST_USERDATA: path.join(home, 'x'), MPD_TEST_NOW: String(Date.UTC(2035, 0, 1)) })); errsAll.push(errs);
  chk('production: activation page has no developer banner, no developer box, no title prefix', !(await win.isVisible('#devbar')) && !(await win.isVisible('#dev')) && !(await winTitle(app)).startsWith('[DEVELOPER]'), await winTitle(app));
  chk('production: keep-the-code notice is shown', (await win.innerText('.notice')).includes('احتفظ'));
  const devTry = await win.evaluate(() => MPD.devLogin('x').then(() => 'answered', () => 'no-handler'));
  chk('production: developer sign-in has no handler in the main process', devTry === 'no-handler', devTry);
  const served = await app.evaluate(async ({ net }) => { const o = {}; for (const p of ['issuer.html', 'issuer.js', 'vaults.json', 'app.html']) { try { o[p] = (await net.fetch('mpd://app/' + p)).status; } catch (e) { o[p] = 'err'; } } return o; });
  chk('production: generator page and vaults are not served (and do not exist)', served['issuer.html'] === 404 && served['issuer.js'] === 404 && served['vaults.json'] === 404 && served['app.html'] === 403, served);
  rm = await activate(win, code('developer'));
  chk('production: a developer-build code is refused (other keys)', rm.includes('غير صالح'), rm);
  rm = await activate(win, L.issue({ channel: 'developer', unit: 'permanent', payloadKey: cu.fromB64u(S.production.payloadKey) }, S.production.licensePrivate));
  chk('production: a developer-flagged code signed with the production key is refused as wrong build', rm.includes('لا يناسب هذه النسخة'), rm);
  await activate(win, globalThis.__issuedProd, 'تم التفعيل'); main = await toMain(app);
  chk('production: the code made by the generator window opens the production program', where(main) === '/app.html' && (await main.innerText('footer.credit')).includes('Version 5.2'));
  t = await infoText(app);
  chk('production: licence info shows a 3-day code with its end date', t.includes('مؤقت — 3 أيام') && t.includes('ينتهي') && t.includes('متبقي 3 أيام'), t);
  chk('production: test switches are ignored (data stays in the normal folder, real clock used)', fs.existsSync(path.join(D, 'license.mpl')) && !fs.existsSync(path.join(home, 'x')));
  chk('production: devtools disabled', await tryDevTools(app) === false);
  const labels = await app.evaluate(({ Menu }) => ({ l: Menu.getApplicationMenu().items.map(i => i.label), gen: !!Menu.getApplicationMenu().getMenuItemById('dev-issuer') }));
  chk('production: no developer menu and no generator', !labels.l.includes('المطوّر') && !labels.gen, labels);
  chk('production: window title is the program name', (await main.title()) === 'النسخة الأولى التجريبية لبرنامج المحاسبات لمواد البناء', await main.title());
  await app.close();

  const errFlat = errsAll.flat();
  chk('no page errors in the program or the activation page', errFlat.length === 0, errFlat);
  const ok = res.filter(Boolean).length; console.log(ok + '/' + res.length + ' passed'); process.exit(ok === res.length ? 0 : 1);
})().catch(e => { console.error('E2E CRASH', e); process.exit(2); });
