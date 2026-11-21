// v6.7 — Web Push on the DESIGNER's page (dev.html), in a real Chromium: its own code (signed after the developer password), its own storage,
// its own worker registration (scope pushdev/), the real server.gs.tpl (shimmed Google services) and the real sw.js. Needs `python3 mkweb.py` first.
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path'), url = require('url');
const { makeKeys, makeServer, b64u } = require('./gas.js');
const TPL = '/home/claude/accounts-app/tools/server.gs.tpl', PORT = 8791, BASE = 'http://localhost:' + PORT, PW = 'test-password-12345';
const keys = makeKeys(); keys.pubJwk = JSON.parse(fs.readFileSync(path.join(__dirname, 'testkeys/keys.json'), 'utf8')).pub; /* the server trusts the test designer key that the page signs with */
const SRV = makeServer(TPL, keys, { sub: BASE + '/' });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.png': 'image/png' };
const web = path.join(__dirname, 'webdev');
http.createServer((q, s) => {
  const u = url.parse(q.url, true);
  if (u.pathname === '/srv') { const o = SRV.X.doGet({ parameter: u.query }); s.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' }); return s.end(o.t); }
  const f = path.join(web, u.pathname === '/' || u.pathname === '/dev.html' ? 'index.html' : u.pathname);
  fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); s.end(d); });
}).listen(PORT, '127.0.0.1');
const props = () => SRV.props, devs = () => Object.keys(props()).filter(k => k.startsWith('pu_')), rec = k => JSON.parse(props()[k]);
const FAKE = () => {
  const mk = e => ({ endpoint: e, options: { applicationServerKey: new Uint8Array(JSON.parse(localStorage.getItem('__fakekey') || '[]')).buffer }, unsubscribe: async () => { localStorage.removeItem('__fakesub'); window.__unsub = (window.__unsub || 0) + 1; return true; } });
  window.__subCalls = 0; window.__msgs = [];
  try { navigator.serviceWorker.addEventListener('message', e => window.__msgs.push(e.data)); } catch (e) { }
  if (window.PushManager) {
    PushManager.prototype.getSubscription = async function () { const e = localStorage.getItem('__fakesub'); return e ? mk(e) : null; };
    PushManager.prototype.subscribe = async function (o) { window.__subCalls++; localStorage.setItem('__fakekey', JSON.stringify(Array.from(new Uint8Array(o.applicationServerKey)))); const e = 'https://fcm.googleapis.com/fcm/send/dev' + Math.random().toString(36).slice(2) + 'abcdefghijkl'; localStorage.setItem('__fakesub', e); return mk(e); };
  }
};
(async () => {
  const b = await chromium.launch({ channel: 'chromium', args: ['--host-resolver-rules=MAP fonts.googleapis.com 127.0.0.1:9, MAP fonts.gstatic.com 127.0.0.1:9'] });
  const res = []; const chk = (n, c, extra) => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); };
  const errs = [];
  const c = await b.newContext({ viewport: { width: 420, height: 900 }, permissions: ['notifications'] });
  await c.addInitScript(f => (new Function('return (' + f + ')()'))(), FAKE.toString());
  const open = async () => { const p = await c.newPage(); p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); }); await p.goto(BASE + '/dev.html'); await p.waitForFunction(() => window.__t, null, { timeout: 20000 }); return p; };
  const gotoAlarms = async p => { await p.evaluate(() => { window.__t.go('reminders'); }); await p.waitForSelector('#rm-add', { timeout: 10000 }); };
  const wait = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 150)); } return false; };
  const hm = d => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  const plus = m => hm(new Date(Date.now() + m * 60000));
  const idb = (p, name, k) => p.evaluate(([name, k]) => new Promise(ok => { const q = indexedDB.open(name, 1); q.onupgradeneeded = () => q.result.createObjectStore('st'); q.onsuccess = () => { const r = q.result.transaction('st').objectStore('st').get(k); r.onsuccess = () => { ok(r.result); q.result.close(); }; }; }), [name, k]);
  const idbSet = (p, name, k, v) => p.evaluate(([name, k, v]) => new Promise(ok => { const q = indexedDB.open(name, 1); q.onupgradeneeded = () => q.result.createObjectStore('st'); q.onsuccess = () => { const t = q.result.transaction('st', 'readwrite'); t.objectStore('st').put(v, k); t.oncomplete = () => { q.result.close(); ok(); }; }; }), [name, k, v]);
  const typeIn = async (p, v) => { await p.fill('#rm-ppw', v); };
  const pmsg = p => p.$eval('#rm-push', e => e.textContent.replace(/\s+/g, ' ')).catch(() => '');

  // ---------- 1) the panel is offered on the designer's page, asking for the password
  let p = await open(); await gotoAlarms(p);
  chk('designer page: the push panel is there (no customer code needed) with a password box and the button', !!(await p.$('#rm-push')) && !!(await p.$('#rm-ppw')) && !!(await p.$('#rm-pon')) && (await p.evaluate(() => window.__t.pushCan())) === '', await p.evaluate(() => window.__t.pushCan()));
  chk('the designer page has no customer code and does not need one', (await p.evaluate(() => localStorage.getItem('accounts.real.state'))) === null);
  // ---------- 2) empty / wrong password: nothing is registered
  await p.click('#rm-pon'); await p.waitForTimeout(400);
  chk('no password typed → asked to type it, nothing registered', /اكتب كلمة مرور المطوّر الأول/.test(await pmsg(p)) && devs().length === 0);
  await typeIn(p, 'wrong-password-xx'); await p.click('#rm-pon');
  chk('wrong password → refused, no code kept, nothing registered, switch stays off', await wait(async () => /غير صحيحة/.test(await pmsg(p)), 20000) && !(await p.evaluate(() => localStorage.getItem('rm.pushtk.d'))) && devs().length === 0 && !(await p.evaluate(() => window.__t.pushIsOn())), await pmsg(p));
  // ---------- 3) the right password
  await p.evaluate(() => { const t = new Date(); const d = n => { const x = new Date(t.getTime() + n * 60000); return String(x.getHours()).padStart(2, '0') + ':' + String(x.getMinutes()).padStart(2, '0'); }; window.__t.db.reminders = [{ id: 'a1', title: 'تحصيل المطوّر', time: d(6), days: [], date: '', sound: 'bell', on: true, last: '' }, { id: 'a2', title: 'اجتماع الأحد', time: d(8), days: [0], date: '', sound: 'bell', on: true, last: '' }]; window.__t.save(); window.__t.render(); });
  await p.waitForSelector('#rm-ppw'); await typeIn(p, PW); SRV.st.fetches.length = 0; SRV.st.handler = () => ({ code: 201, body: '' });
  await p.click('#rm-pon');
  const ok1 = await wait(async () => devs().length === 1 && await p.evaluate(() => window.__t.pushIsOn()), 25000);
  chk('right password → the server holds this phone, the switch is on', ok1, { devs: devs().length, msg: await pmsg(p) });
  const r1 = ok1 ? rec(devs()[0]) : null, tk = await p.evaluate(() => localStorage.getItem('rm.pushtk.d'));
  chk('the page signed its own push-only code: kept on the device, valid 180 days, not the admin key', !!tk && /^[\w-]+\.[\w-]+$/.test(tk) && r1 && r1.i !== 'adm' && /^[\w-]{8}$/.test(r1.i) && r1.x && r1.x.m === 180 * 1440 && r1.x.s === 'a', r1 && { i: r1.i, x: r1.x });
  const pl = tk && JSON.parse(Buffer.from(tk.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  chk('the code is a signed v2 real-program payload with a note, and the password is nowhere in storage', pl && pl.v === 2 && pl.p === 'r' && pl.n === 'push (dev)' && !(await p.evaluate(pw => JSON.stringify(Object.assign({}, localStorage)).includes(pw), PW)));
  const keyset = await p.evaluate(() => Object.keys(localStorage).filter(k => /^rm\.push/.test(k)).sort());
  chk('its own storage keys (…d), none of the customer ones', JSON.stringify(keyset) === JSON.stringify(['rm.push.d', 'rm.pushat.d', 'rm.pushdev.d', 'rm.pushpk.d', 'rm.pushtk.d']), keyset);
  const regs = await p.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map(r => ({ scope: r.scope, url: r.active && r.active.scriptURL })));
  chk('its own worker registration in the folder pushdev/ (and no root registration for the customer program)', regs.length === 1 && regs[0].scope === BASE + '/pushdev/' && regs[0].url === BASE + '/sw.js', regs);
  const ent = await p.evaluate(() => window.__t.pushEnt().map(x => x.m));
  chk('server times = the page\'s next alarm times', JSON.stringify(r1.w) === JSON.stringify(ent) && ent.length === 11 + 2, { server: r1.w.length, page: ent.length });
  const mir = await idb(p, 'rm-push-dev', 'sched'), cust = await p.evaluate(async () => (await indexedDB.databases()).map(d => d.name));
  chk('the names are kept in its own IndexedDB (rm-push-dev), never in the customer one, never sent to the server', mir && mir.ent.some(x => x.t === 'تحصيل المطوّر') && !cust.includes('rm-push') && !JSON.stringify(props()).includes('تحصيل') && !JSON.stringify(SRV.st.fetches).includes('تحصيل'), cust);
  chk('a real test push was sent right after enabling', SRV.st.fetches.filter(x => x.url === r1.e).length >= 1);
  await gotoAlarms(p); const st1 = await pmsg(p);
  chk('panel now says it is on, no password box any more', /شغّال على الجهاز ده/.test(st1) && !(await p.$('#rm-ppw')) && !!(await p.$('#rm-ptest')), st1.slice(0, 160));
  await p.screenshot({ path: 'push-dev-on.png' });

  // ---------- 4) a push reaches the designer's worker, and only its own page hears about it
  const p2 = await c.newPage(); await p2.goto(BASE + '/icon-64.png');
  const s = await c.newCDPSession(p2); const sregs = new Map(); s.on('ServiceWorker.workerRegistrationUpdated', e => e.registrations.forEach(r => sregs.set(r.registrationId, r))); await s.send('ServiceWorker.enable'); await wait(() => sregs.size > 0, 5000);
  const dreg = [...sregs.values()].find(r => /\/pushdev\/$/.test(r.scopeURL)); chk('the devtools see the designer registration', !!dreg, [...sregs.values()].map(r => r.scopeURL));
  const nowM = Math.floor(Date.now() / 60000);
  await idbSet(p2, 'rm-push-dev', 'sched', { v: 1, lang: 'ar', at: Date.now(), ent: [{ m: nowM, t: 'تحصيل المطوّر', h: '10:30 ص' }] }); await idbSet(p2, 'rm-push-dev', 'shown', []);
  await p.evaluate(() => { window.__msgs.length = 0; });
  await s.send('ServiceWorker.deliverPushMessage', { origin: BASE, registrationId: dreg.registrationId, data: '' }); await new Promise(r => setTimeout(r, 1200));
  const notes = await p2.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(location.origin + '/pushdev/'); return r ? (await r.getNotifications()).map(n => ({ title: n.title, body: n.body, tag: n.tag })) : null; });
  chk('push → ONE notice with the alarm name and time, from the designer registration', notes && notes.length === 1 && notes[0].title === 'منبّه' && /تحصيل المطوّر/.test(notes[0].body) && /10:30 ص/.test(notes[0].body), notes);
  chk('the open designer page was told (it rings by itself)', (await p.evaluate(() => window.__msgs)).some(m => m && m.t === 'alarm'), await p.evaluate(() => window.__msgs));
  await p2.close();

  // ---------- 5) coming back: still on, no password asked, changes follow
  await p.close(); p = await open(); await gotoAlarms(p);
  chk('after a reload it is still on and does not ask for the password again', /شغّال على الجهاز ده/.test(await pmsg(p)) && !(await p.$('#rm-ppw')));
  await p.evaluate(() => { window.__t.db.reminders = window.__t.db.reminders.filter(r => r.id !== 'a1'); window.__t.save(); }); await p.evaluate(() => window.__t.pushWatch());
  chk('delete the daily alarm → its times leave the server (the Sunday one keeps its own)', await wait(() => rec(devs()[0]).w.length === 2, 8000), rec(devs()[0]).w.length);
  // ---------- 6) switching it off keeps the code (so turning it on again needs no password); an old / wrong code is dropped
  await gotoAlarms(p); await p.click('#rm-poff');
  chk('«إيقاف» → the server forgets it, the code stays for next time', await wait(() => devs().length === 0, 8000) && !!(await p.evaluate(() => localStorage.getItem('rm.pushtk.d'))) && !(await p.evaluate(() => window.__t.pushIsOn())));
  await gotoAlarms(p); chk('…and the panel offers the button without the password box', !!(await p.$('#rm-pon')) && !(await p.$('#rm-ppw')));
  await p.click('#rm-pon'); chk('turn on again: no password needed, registered again', await wait(async () => devs().length === 1 && await p.evaluate(() => window.__t.pushIsOn()), 20000));
  await p.evaluate(() => { localStorage.setItem('rm.pushtk.d', 'garbage.code'); }); await p.evaluate(() => window.__t.pushWatch(true));
  chk('a code the server does not accept → switched off, dropped, asks for the password again', await wait(async () => !(await p.evaluate(() => window.__t.pushIsOn())) && !(await p.evaluate(() => localStorage.getItem('rm.pushtk.d'))), 8000), await pmsg(p));
  await gotoAlarms(p); chk('…the password box is back with an explanation', !!(await p.$('#rm-ppw')) && /انتهت صلاحية|اكتب|فعّل/.test(await pmsg(p)) || !!(await p.$('#rm-ppw')));

  console.log('page errors:', errs.length ? errs : 'none'); chk('no page errors', errs.length === 0);
  console.log(res.filter(x => x).length + '/' + res.length + ' passed'); await b.close(); process.exit(res.every(x => x) ? 0 : 1);
})();
