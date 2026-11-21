// v6.7 — the REAL sealed designer page (dev.html from make_site.py): password page → program → alarms → push on with the developer password → the server holds the phone.
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path'), url = require('url');
const { makeServer } = require('./gas.js');
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
  PushManager.prototype.subscribe = async function (o) { localStorage.setItem('__fakekey', JSON.stringify(Array.from(new Uint8Array(o.applicationServerKey)))); const e = 'https://fcm.googleapis.com/fcm/send/FAKE' + Math.random().toString(36).slice(2) + ':APA91bHabcdefghijklmnop'; localStorage.setItem('__fakesub', e); return mk(e); };
};
(async () => {
  const b = await chromium.launch({ channel: 'chromium', args: ['--host-resolver-rules=MAP fonts.googleapis.com 127.0.0.1:9, MAP fonts.gstatic.com 127.0.0.1:9'] });
  const res = []; const chk = (n, c, x) => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); };
  const errs = []; const wait = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 150)); } return false; };
  const c = await b.newContext({ viewport: { width: 420, height: 900 }, permissions: ['notifications'] }); await c.addInitScript(f => (new Function('return (' + f + ')()'))(), FAKE.toString());
  const p = await c.newPage(); p.on('pageerror', e => errs.push(String(e)));
  await p.goto(BASE + '/dev.html'); await p.waitForSelector('#i');
  chk('the password page already points at the designer\'s own manifest + app name', await p.evaluate(() => document.querySelector('link[rel=manifest]').getAttribute('href') === 'manifest-dev.webmanifest' && document.querySelector('meta[name=apple-mobile-web-app-title]').content === 'Mina.Dev'));
  await p.fill('#i', PW); await p.click('#b'); await p.waitForSelector('[data-act="logout"]', { timeout: 20000 });
  chk('inside the program: manifest = manifest-dev, still the same page address', await p.evaluate(() => document.querySelector('link[rel=manifest]').getAttribute('href') === 'manifest-dev.webmanifest' && /\/dev\.html/.test(location.pathname)), await p.evaluate(() => location.pathname));
  const man = await (await fetch(BASE + '/manifest-dev.webmanifest')).json();
  chk('manifest-dev: opens dev.html, its own id and name, standalone', man.start_url === './dev.html' && man.id === './dev.html' && man.display === 'standalone' && man.short_name === 'Mina.Dev', man.start_url);
  await p.evaluate(() => { const a = [...document.querySelectorAll('[data-to]')].find(x => x.dataset.to === 'reminders'); if (a) a.click(); }); await p.waitForSelector('#rm-add', { timeout: 10000 });
  chk('alarms screen on the sealed designer page: panel with password box + button', !!(await p.$('#rm-push')) && !!(await p.$('#rm-ppw')) && !!(await p.$('#rm-pon')));
  await p.click('#rm-add'); await p.waitForSelector('#rm-title'); await p.fill('#rm-title', 'اختبار المطوّر');
  const when = new Date(Date.now() + 15 * 60000); await p.fill('#rm-h', String(when.getHours())); await p.fill('#rm-m', String(when.getMinutes())); await p.click('[data-ok]');
  await p.waitForSelector('[data-edit]', { timeout: 5000 });
  await p.waitForSelector('#rm-ppw', { timeout: 10000 }); await p.fill('#rm-ppw', PW); await p.click('#rm-pon');
  const ok = await wait(() => Object.keys(SRV.props).some(k => k.startsWith('pu_')));
  chk('real server file: the designer-signed code is accepted, the phone is registered', ok, Object.keys(SRV.props).filter(k => k.startsWith('pu_')).length);
  const regs = await p.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map(r => r.scope));
  chk('only the designer registration exists (pushdev/)', regs.length === 1 && regs[0] === BASE + '/pushdev/', regs);
  await p.screenshot({ path: 'push-dev-site.png' });
  console.log('page errors:', errs.length ? errs : 'none'); chk('no page errors', errs.length === 0);
  console.log(res.filter(x => x).length + '/' + res.length + ' passed'); await b.close(); process.exit(res.every(x => x) ? 0 : 1);
})();
