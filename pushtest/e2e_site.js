// v6.5 — the REAL hosted flow: designer's code maker → customer gate (document.write of the program) → alarms screen → push panel → server, with the site built by make_site.py
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path'), url = require('url'), crypto = require('crypto');
const { makeKeys, makeServer, b64u, unb64u } = require('./gas.js');
const SP = '/tmp/claude-0/-home-claude/b5b8d7c6-a5d4-5acd-85dc-c84321a81c40/scratchpad', SITE = SP + '/gtest', GS = SP + '/gkeys/server.gs', PORT = 8765, BASE = 'http://localhost:' + PORT, PW = 'test-password-12345';
const vault = JSON.parse(fs.readFileSync(SP + '/gkeys/vault.json', 'utf8'));
const SRV = makeServer(GS, { admin: vault.srvkey }, { ready: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json' };
http.createServer((q, s) => {
  const u = url.parse(q.url, true);
  if (u.pathname === '/srv') { const o = SRV.X.doGet({ parameter: u.query }); s.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' }); return s.end(o.t); }
  const f = path.join(SITE, u.pathname === '/' ? 'index.html' : u.pathname);
  fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Date': new Date().toUTCString() }); s.end(d); });
}).listen(PORT, '127.0.0.1');
const FAKE = () => {
  const mk = e => ({ endpoint: e, options: { applicationServerKey: new Uint8Array(JSON.parse(localStorage.getItem('__fakekey') || '[]')).buffer }, unsubscribe: async () => { localStorage.removeItem('__fakesub'); return true; } });
  PushManager.prototype.getSubscription = async function () { const e = localStorage.getItem('__fakesub'); return e ? mk(e) : null; };
  PushManager.prototype.subscribe = async function (o) { localStorage.setItem('__fakekey', JSON.stringify(Array.from(new Uint8Array(o.applicationServerKey)))); const e = 'https://fcm.googleapis.com/fcm/send/FAKE' + Math.random().toString(36).slice(2) + ':APA91bFakeToken' + Date.now(); localStorage.setItem('__fakesub', e); return mk(e); };
};
(async () => {
  const b = await chromium.launch({ channel: 'chromium', args: ['--host-resolver-rules=MAP fonts.googleapis.com 127.0.0.1:9, MAP fonts.gstatic.com 127.0.0.1:9'] });
  const res = []; const chk = (n, c, extra) => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); };
  const errs = []; const wait = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 150)); } return false; };
  // 1) the designer makes a real code
  const dctx = await b.newContext({ viewport: { width: 420, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] }), dp = await dctx.newPage(); dp.on('pageerror', e => errs.push('dev: ' + e));
  await dp.goto(BASE + '/dev.html'); await dp.waitForSelector('#i'); await dp.fill('#i', PW); await dp.click('#b'); await dp.waitForSelector('[data-act="logout"]', { timeout: 20000 });
  await dp.evaluate(() => document.querySelector('[data-to="settings"]').click()); await dp.waitForTimeout(300);
  await dp.click('.tile[data-to="setDev"]'); await dp.waitForSelector('#d-pw'); await dp.fill('#d-pw', PW); await dp.click('#d-go'); await dp.waitForSelector('#d-make', { timeout: 20000 });
  await dp.selectOption('#d-t', 'r'); await dp.selectOption('#d-u', 'p'); await dp.fill('#d-user', ''); await dp.fill('#d-note', 'push test');
  await dp.click('#d-make'); await dp.waitForFunction(() => { const i = document.querySelector('#d-sc'); return i && i.value.length >= 19; }, null, { timeout: 30000 });
  const code = await dp.$eval('#d-sc', e => e.value); await dctx.close();
  // 2) the customer opens the gate and enters the code
  const c = await b.newContext({ viewport: { width: 420, height: 900 }, permissions: ['notifications'] }); await c.addInitScript(f => (new Function('return (' + f + ')()'))(), FAKE.toString());
  const p = await c.newPage(); p.on('pageerror', e => errs.push('app: ' + e)); await p.goto(BASE + '/index.html'); await p.waitForSelector('#i');
  const gateHead = await p.evaluate(() => ({ man: (document.querySelector('link[rel=manifest]') || {}).href, cap: !!document.querySelector('meta[name="apple-mobile-web-app-capable"]') }));
  chk('gate page links the manifest + apple web-app meta', gateHead.man === BASE + '/manifest.webmanifest' && gateHead.cap, gateHead);
  await p.fill('#i', code); await p.click('#b'); await p.waitForSelector('[data-act="logout"]', { timeout: 40000 });
  const progHead = await p.evaluate(() => ({ man: (document.querySelector('link[rel=manifest]') || {}).href, cap: !!document.querySelector('meta[name="apple-mobile-web-app-capable"]'), url: location.href }));
  chk('the program (after the gate wrote it into the page) still links the manifest', progHead.man === BASE + '/manifest.webmanifest' && progHead.cap && progHead.url.startsWith(BASE + '/index.html'), progHead);
  const mf = await (await fetch(BASE + '/manifest.webmanifest')).json();
  chk('manifest: standalone, scope + start_url = site root, 192 and 512 icons, Arabic name', mf.display === 'standalone' && mf.start_url === './' && mf.scope === './' && mf.icons.some(i => i.sizes === '192x192') && mf.icons.some(i => i.sizes === '512x512') && /المحاسبات/.test(mf.name), mf);
  const cdp = await c.newCDPSession(p); const am = await cdp.send('Page.getAppManifest'); chk('Chromium reads the manifest without errors', am.url === BASE + '/manifest.webmanifest' && (am.errors || []).length === 0, am.errors);
  chk('the icon files in the manifest exist', (await Promise.all(mf.icons.map(i => fetch(BASE + '/' + i.src).then(r => r.status)))).every(s => s === 200));
  const sw = await fetch(BASE + '/sw.js').then(r => r.text()); chk('sw.js is published with the version and no secret', sw.includes('(v' + fs.readFileSync('/home/claude/accounts-app/version.txt', 'utf8').trim() + ')') && !sw.includes(vault.kc) && !sw.includes(vault.srvkey) && !sw.includes(vault.vapid.priv) && !/@@/.test(sw));
  // 3) alarms screen → panel → enable
  await p.evaluate(() => { document.querySelector('[data-to="reminders"]') ? document.querySelector('[data-to="reminders"]').click() : (location.hash = ''); });
  const hasNav = await wait(async () => !!(await p.$('#rm-add')), 4000);
  if (!hasNav) { /* open the screen through the menu */ await p.evaluate(() => { const a = [...document.querySelectorAll('[data-to]')].find(x => x.dataset.to === 'reminders'); if (a) a.click(); }); }
  await p.waitForSelector('#rm-add', { timeout: 10000 }).catch(() => { });
  chk('in the real program the push panel is shown with the «فعّل» button', !!(await p.$('#rm-pon')));
  await p.click('#rm-add'); await p.waitForSelector('#rm-title'); await p.fill('#rm-title', 'تحصيل من العميل');
  const when = new Date(Date.now() + 15 * 60000); await p.fill('#rm-h', String(when.getHours())); await p.fill('#rm-m', String(when.getMinutes())); await p.click('[data-ok]');
  await p.waitForSelector('[data-edit]', { timeout: 5000 });
  const tmin = Math.floor(new Date(when.getFullYear(), when.getMonth(), when.getDate(), when.getHours(), when.getMinutes(), 0, 0).getTime() / 60000);
  await p.click('#rm-pon');
  const props = () => SRV.props, devs = () => Object.keys(props()).filter(k => k.startsWith('pu_'));
  chk('enable in the real program → the server holds the phone under THIS code\'s id', await wait(() => devs().length === 1, 20000));
  const tid = JSON.parse(unb64u(code ? new URLSearchParams((await p.evaluate(() => location.hash)).slice(1)).get('t').split('.')[0] : '').toString()).i, r = devs().length ? JSON.parse(props()[devs()[0]]) : null;
  chk('…the record carries the code id, permanent life (m:0) and the alarm minute', r && r.i === tid && r.x && r.x.m === 0 && r.w.includes(tmin), r && { i: r.i, tid, n: r.w.length });
  const reg = await p.evaluate(async () => { const x = await navigator.serviceWorker.getRegistration(); return x && { scope: x.scope, active: !!x.active }; }); chk('the worker is registered from the page the gate wrote (scope = site root)', reg && reg.scope === BASE + '/' && reg.active, reg);
  await p.screenshot({ path: 'push-site-on.png' });
  // reload: the gate brings the program back, the switch is still on, nothing is registered twice
  await p.reload(); await p.waitForSelector('[data-act="logout"]', { timeout: 40000 });
  await p.evaluate(() => { const a = [...document.querySelectorAll('[data-to]')].find(x => x.dataset.to === 'reminders'); if (a) a.click(); }); await p.waitForSelector('#rm-add', { timeout: 10000 });
  chk('after a reload (gate again) the panel still shows «on»', await wait(async () => !!(await p.$('#rm-poff')), 8000) && devs().length === 1);
  // exit («خروج»): the device stops getting alarms
  await p.click('[data-act="back"]'); await p.waitForSelector('[data-act="logout"]', { timeout: 8000 }); await p.click('[data-act="logout"]'); await p.waitForSelector('[data-ok]', { timeout: 5000 }); await p.click('[data-ok]'); await p.waitForSelector('#i', { timeout: 20000 });
  chk('exit → the server forgets this phone, the switch is off, the gate asks for the code again', await wait(() => devs().length === 0, 8000) && await p.evaluate(() => localStorage.getItem('rm.push')) === '0', devs().length);
  console.log('page errors:', errs.length, errs.slice(0, 4)); chk('no page errors', errs.length === 0, errs.slice(0, 3));
  console.log(res.filter(x => x).length + '/' + res.length + ' passed'); await b.close(); process.exit(res.every(x => x) ? 0 : 1);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
