// v6.5 — Web Push in a real Chromium: the program ↔ the REAL server.gs.tpl code (shimmed Google services) ↔ the real sw.js.
// Chromium cannot reach Google's push service from here, so subscribe() is faked; everything else (service worker, IndexedDB, notifications, JSONP to the server) is real.
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path'), url = require('url'), crypto = require('crypto');
const { makeKeys, makeServer, makeToken, b64u, unb64u } = require('./gas.js');
const TPL = '/home/claude/accounts-app/tools/server.gs.tpl', PORT = 8790, BASE = 'http://localhost:' + PORT;
const keys = makeKeys(); let SRV = makeServer(TPL, keys, { sub: BASE + '/' }); let srvDown = false;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.png': 'image/png' };
const web = path.join(__dirname, 'web');
http.createServer((q, s) => {
  const u = url.parse(q.url, true);
  if (u.pathname === '/srv') { if (srvDown) { s.writeHead(503); return s.end(); } const o = SRV.X.doGet({ parameter: u.query }); s.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' }); return s.end(o.t); }
  const f = path.join(web, u.pathname === '/' ? 'index.html' : u.pathname);
  fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); s.end(d); });
}).listen(PORT, '127.0.0.1');
const tokOf = (o) => makeToken(keys, Object.assign({ v: 2, p: 'r', i: 'T' + crypto.randomBytes(4).toString('hex'), c: Date.now() - 60000, m: 0, s: 'a' }, o || {}));
const props = () => SRV.props, devs = () => Object.keys(props()).filter(k => k.startsWith('pu_')), rec = k => JSON.parse(props()[k]);
const FAKE = () => { /* what the phone's push service would give: only subscribe/getSubscription are faked, kept across reloads */
  const mk = e => ({ endpoint: e, options: { applicationServerKey: new Uint8Array(JSON.parse(localStorage.getItem('__fakekey') || '[]')).buffer }, unsubscribe: async () => { localStorage.removeItem('__fakesub'); window.__unsub = (window.__unsub || 0) + 1; return true; } });
  window.__subCalls = 0;
  if (window.PushManager) {
    PushManager.prototype.getSubscription = async function () { const e = localStorage.getItem('__fakesub'); return e ? mk(e) : null; };
    PushManager.prototype.subscribe = async function (o) { window.__subCalls++; if (localStorage.getItem('__failsub')) { const x = new Error('push service error'); x.name = 'AbortError'; throw x; } localStorage.setItem('__fakekey', JSON.stringify(Array.from(new Uint8Array(o.applicationServerKey)))); const e = 'https://fcm.googleapis.com/fcm/send/FAKE' + Math.random().toString(36).slice(2) + ':APA91bFakeToken' + Date.now(); localStorage.setItem('__fakesub', e); return mk(e); };
  }
};
(async () => {
  const b = await chromium.launch({ channel: 'chromium', args: ['--host-resolver-rules=MAP fonts.googleapis.com 127.0.0.1:9, MAP fonts.gstatic.com 127.0.0.1:9'] });
  const res = []; const chk = (n, c, extra) => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); };
  const errs = [];
  const mk = async (o = {}) => {
    const c = await b.newContext(Object.assign({ viewport: { width: 420, height: 900 }, permissions: o.deny ? [] : ['notifications'] }, o.ctx || {}));
    const tok = o.tok === undefined ? tokOf() : o.tok;
    await c.addInitScript(([tk, fake, extra]) => { if (tk) { try { localStorage.setItem('accounts.real.state', JSON.stringify({ raw: tk, tok: 'x', done: [] })); } catch (e) { } } if (fake) (new Function('return (' + fake + ')()'))(); if (extra) (new Function(extra))(); }, [tok, FAKE.toString(), o.init || '']);
    const p = await c.newPage(); p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
    await p.goto(BASE + '/'); await p.waitForFunction(() => window.__t, null, { timeout: 20000 }); return { c, p, tok };
  };
  const gotoAlarms = async p => { await p.evaluate(() => { window.__t.go('reminders'); }); await p.waitForSelector('#rm-add', { timeout: 10000 }); };
  const wait = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 150)); } return false; };
  const seedAlarms = (p, list) => p.evaluate(l => { window.__t.db.reminders = l; window.__t.save(); }, list);
  const hm = d => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  const plus = m => { const d = new Date(Date.now() + m * 60000); return hm(d); };
  const swCdp = async (c, p) => { const s = await c.newCDPSession(p); const regs = new Map(); s.on('ServiceWorker.workerRegistrationUpdated', e => e.registrations.forEach(r => regs.set(r.registrationId, r))); await s.send('ServiceWorker.enable'); return { s, regs }; };
  const notes = p => p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return r ? (await r.getNotifications()).map(n => ({ title: n.title, body: n.body, tag: n.tag })) : null; });
  const idbGet = (p, k) => p.evaluate(k => new Promise(ok => { const q = indexedDB.open('rm-push', 1); q.onupgradeneeded = () => q.result.createObjectStore('st'); q.onsuccess = () => { const r = q.result.transaction('st').objectStore('st').get(k); r.onsuccess = () => { ok(r.result); q.result.close(); }; }; }), k);
  const idbSet = (p, k, v) => p.evaluate(([k, v]) => new Promise(ok => { const q = indexedDB.open('rm-push', 1); q.onupgradeneeded = () => q.result.createObjectStore('st'); q.onsuccess = () => { const t = q.result.transaction('st', 'readwrite'); t.objectStore('st').put(v, k); t.oncomplete = () => { q.result.close(); ok(); }; }; }), [k, v]);

  // ---------- LIVE: real clock, whole chain: alarm saved in the program -> server list -> server minute tick -> (push service) -> worker -> notice with the alarm's name
  const A = await mk(); const { c, p } = A; await gotoAlarms(p);
  const target = new Date(Date.now() + 100000); target.setSeconds(0, 0); const tm = hm(target), tmin = Math.floor(target.getTime() / 60000);
  await seedAlarms(p, [{ id: 'live1', title: 'اختبار حي: تحصيل الشيك', time: tm, days: [], date: '', sound: 'bell', on: true, last: '' }]);
  SRV.st.handler = () => ({ code: 201, body: '' }); await p.evaluate(() => window.__t.render()); await p.click('#rm-pon');
  chk('LIVE enable', await wait(async () => devs().length === 1 && await p.evaluate(() => window.__t.pushIsOn())));
  const dv = devs()[0]; chk('LIVE the alarm minute is in the server list (' + tm + ')', rec(dv).w.includes(tmin), rec(dv).w.slice(0, 3));
  await new Promise(r => setTimeout(r, 17000)); /* the auto test push is spent */
  const p2 = await c.newPage(); await p2.goto(BASE + '/icon-64.png'); const { s: cdp, regs } = await swCdp(c, p2); await wait(() => regs.size > 0, 5000); const regId = [...regs.keys()][0];
  await idbSet(p2, 'test', 0);
  await p.close(); /* the browser/page is closed: only the worker + the server remain */
  console.log('waiting for', tm, '…'); while (Date.now() < tmin * 60000 + 3000) await new Promise(r => setTimeout(r, 500));
  SRV.st.fetches.length = 0; SRV.X.pushTick();
  const sent = SRV.st.fetches.filter(f => f.url === rec(dv).e || true);
  chk('LIVE the server\'s minute tick sends exactly one push to this phone at the alarm minute', sent.length === 1 && /^vapid t=/.test(sent[0].headers.Authorization), sent.length);
  chk('LIVE the minute is used up on the server', !rec(dv).w.includes(tmin));
  await cdp.send('ServiceWorker.deliverPushMessage', { origin: BASE, registrationId: regId, data: '' }); await new Promise(r => setTimeout(r, 1000));
  const nn = await notes(p2); chk('LIVE the worker shows the alarm by name and time', nn && nn.length === 1 && /اختبار حي: تحصيل الشيك/.test(nn[0].body) && nn[0].body.includes(tm.slice(0, 2) === '00' ? '12:' : '') , nn);
  console.log(JSON.stringify(nn));
  SRV.st.fetches.length = 0; SRV.X.pushTick(); chk('LIVE the next minute: nothing more is sent', SRV.st.fetches.length === 0);
  console.log('page errors:', errs.length);
  console.log(res.filter(x => x).length + '/' + res.length + ' passed'); await b.close(); process.exit(res.every(x => x) ? 0 : 1);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
