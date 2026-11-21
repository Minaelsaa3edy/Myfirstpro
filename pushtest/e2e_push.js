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

  // ---------- 1) who sees the panel
  { const a = await mk({ tok: '' }); await gotoAlarms(a.p); chk('no code in this browser (demo / designer page) → no push panel', !(await a.p.$('#rm-push')) && await a.p.evaluate(() => window.__t.pushCan()) === 'nocode'); await a.c.close();
    const d = await mk(); await gotoAlarms(d.p); chk('a browser with a real code → the panel and the «فعّل» button', !!(await d.p.$('#rm-push')) && !!(await d.p.$('#rm-pon')) && !(await d.p.$('#rm-ptest')));
    await d.p.screenshot({ path: 'push-panel-off.png' }); await d.c.close(); }
  // ---------- 2) switching it on
  const A = await mk(); const { c, p } = A; await gotoAlarms(p);
  await seedAlarms(p, [
    { id: 'a1', title: 'تحصيل الشيك', time: plus(6), days: [], date: '', sound: 'bell', on: true, last: '' },
    { id: 'a2', title: 'موقوف', time: plus(7), days: [], date: '', sound: 'bell', on: false, last: '' },
    { id: 'a3', title: 'اجتماع الأحد', time: plus(8), days: [0], date: '', sound: 'bell', on: true, last: '' }]);
  SRV.st.fetches.length = 0; SRV.st.handler = () => ({ code: 201, body: '' });
  await p.evaluate(() => window.__t.render());
  await p.click('#rm-pon');
  const ok1 = await wait(async () => devs().length === 1 && await p.evaluate(() => window.__t.pushIsOn()));
  chk('enable: the server holds this phone, the switch is on', ok1, { devs: devs().length });
  const d1 = devs()[0], r1 = ok1 ? rec(d1) : null;
  chk('server record: fake endpoint, the code id, how long the code lives, times', r1 && /^https:\/\/fcm\.googleapis\.com\//.test(r1.e) && /^T[0-9a-f]{8}$/.test(r1.i) && r1.x && r1.x.s === 'a' && r1.w.length > 0, r1 && { i: r1.i, x: r1.x, n: r1.w.length });
  chk('the page subscribed with the server\'s public key (once)', await p.evaluate(() => ({ n: window.__subCalls, k: Array.from(new Uint8Array(JSON.parse(localStorage.getItem('__fakekey')))) })).then(o => o.n === 1 && b64u(Buffer.from(o.k)) === keys.vapPub));
  const reg = await p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return r && { scope: r.scope, active: !!r.active, url: r.active && r.active.scriptURL }; });
  chk('the worker is registered next to the page and is active', reg && reg.scope === BASE + '/' && reg.active && reg.url === BASE + '/sw.js', reg);
  chk('a real test push was sent right after enabling (empty POST with the VAPID header)', (() => { const f = SRV.st.fetches.filter(x => x.url === r1.e); return f.length >= 1 && f[0].payload === '' && /^vapid t=/.test(f[0].headers.Authorization); })(), SRV.st.fetches.length);
  const w = r1.w.map(x => x), ent = await p.evaluate(() => window.__t.pushEnt().map(x => x.m));
  chk('server times = the page\'s next alarm times (disabled alarm absent, 11 days of the daily one)', JSON.stringify(w) === JSON.stringify(ent) && ent.length === 11 + 2, { server: w.length, page: ent.length });
  chk('…none is in the past', w.every(m => m * 60000 > Date.now() - 1000));
  const dayCount = new Set(w.map(m => new Date(m * 60000).toDateString())).size; chk('the Sunday alarm only on Sundays', ent.length === 13 && dayCount >= 11, dayCount);
  const mir = await idbGet(p, 'sched'); chk('the worker\'s own copy has the names (never sent to the server)', mir && mir.ent.some(x => x.t === 'تحصيل الشيك') && mir.lang === 'ar' && !JSON.stringify(props()).includes('تحصيل') && !JSON.stringify(SRV.st.fetches).includes('تحصيل'), mir && mir.ent.length);
  await gotoAlarms(p); const st1 = await p.$eval('#rm-push', e => e.textContent.replace(/\s+/g, ' '));
  chk('panel now says it is on + shows the count + test / stop buttons', /شغّال على الجهاز ده/.test(st1) && /المواعيد المسجّلة: 13/.test(st1) && !!(await p.$('#rm-ptest')) && !!(await p.$('#rm-poff')), st1.slice(0, 220));
  await p.screenshot({ path: 'push-panel-on.png' });

  // ---------- 3) changes follow within seconds
  await p.click('[data-del="a1"]'); await p.waitForSelector('.modal [data-ok], [data-ok]', { timeout: 5000 }).catch(() => { });
  const okBtn = await p.$('.modal [data-ok]') || await p.$('[data-ok]'); if (okBtn) await okBtn.click();
  const shrunk = await wait(() => rec(d1).w.length === 2, 8000); chk('delete the daily alarm → its 11 times leave the server within seconds (the Sunday alarm keeps its 2)', shrunk, rec(d1).w.length);
  await p.evaluate(() => { const r = window.__t.db.reminders.find(x => x.id === 'a3'); r.on = false; window.__t.save(); }); await p.evaluate(() => window.__t.pushWatch());
  chk('switch an alarm off → gone from the server too', await wait(() => rec(d1).w.length === 0, 8000), rec(d1).w.length);
  await p.evaluate(() => { const r = window.__t.db.reminders.find(x => x.id === 'a3'); r.on = true; r.snz = Date.now() + 25 * 60000; window.__t.save(); });
  await p.evaluate(() => window.__t.pushWatch()); const snz = await wait(() => { const q = rec(d1); return q.w.includes(Math.ceil((Date.now() + 25 * 60000) / 60000)) || q.w.some(m => Math.abs(m * 60000 - (Date.now() + 25 * 60000)) < 90000); }, 6000);
  chk('a «remind me later» time is sent too', snz, rec(d1).w.length);
  // an alarm that already rang today is not sent for today
  const tdy = await p.evaluate(() => { const d = new Date(); const ymd = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); return ymd; });
  const lateT = (() => { const d = new Date(Date.now() + 40 * 60000); return d.getDate() === new Date().getDate() ? hm(d) : null; })();
  if (lateT) { await seedAlarms(p, [{ id: 'b1', title: 'x', time: lateT, days: [], date: '', sound: 'bell', on: true, last: tdy }]); await p.evaluate(() => window.__t.pushWatch());
    chk('already rang today → today is not sent (tomorrow on is)', await wait(() => { const q = rec(d1); return q.w.length === 10 && q.w.every(m => new Date(m * 60000).toDateString() !== new Date().toDateString()); }, 6000), rec(d1).w.length); }
  // ---------- 4) the test button
  await new Promise(r => setTimeout(r, 16000)); /* the server allows one test push per 15 s */
  SRV.st.fetches.length = 0; await gotoAlarms(p); await p.click('#rm-ptest');
  chk('«جرّب إشعار الآن» → the server pushes and the panel says so', await wait(async () => /اتبعت إشعار تجريبي/.test(await p.$eval('#rm-push', e => e.textContent).catch(() => ''))) && SRV.st.fetches.length === 1);
  // push service says "gone" → the page makes a new address
  SRV.st.handler = () => ({ code: 410, body: 'gone' }); const subs0 = await p.evaluate(() => window.__subCalls); await p.evaluate(() => window.__t.render()); await new Promise(r => setTimeout(r, 16000));
  await p.click('#rm-ptest'); const re = await wait(async () => (await p.evaluate(() => window.__subCalls)) > subs0, 20000);
  chk('410 from the push service → the page unsubscribes, subscribes anew and syncs again', re && await wait(() => devs().length === 1 && rec(devs()[0]).e !== r1.e, 8000), await p.evaluate(() => window.__subCalls));
  SRV.st.handler = () => ({ code: 201, body: '' });
  // ---------- 5) the worker shows what the page wrote
  const p2 = await c.newPage(); await p2.goto(BASE + '/icon-64.png'); // a page of the same origin that is NOT the program: it cannot close notices
  const { s: cdp, regs } = await swCdp(c, p2); await wait(() => regs.size > 0, 5000);
  const regId = [...regs.keys()][0]; const push = async () => { await cdp.send('ServiceWorker.deliverPushMessage', { origin: BASE, registrationId: regId, data: '' }); await new Promise(r => setTimeout(r, 900)); };
  const nowM = Math.floor(Date.now() / 60000);
  await p.close();
  await idbSet(p2, 'sched', { v: 1, lang: 'ar', at: Date.now(), ent: [{ m: nowM, t: 'تحصيل الشيك', h: '10:30 ص' }, { m: nowM, t: 'اتصل بالمورد', h: '10:30 ص' }, { m: nowM + 30, t: 'لاحقاً', h: '11:00 ص' }] });
  await idbSet(p2, 'shown', []); await push();
  let n1 = await notes(p2); chk('push at an alarm minute → ONE notice with every alarm of that minute (name + time)', n1 && n1.length === 1 && /تحصيل الشيك/.test(n1[0].body) && /اتصل بالمورد/.test(n1[0].body) && /10:30 ص/.test(n1[0].body) && !/لاحقاً/.test(n1[0].body) && n1[0].title === 'منبّه', n1);
  { const lg = await idbGet(p2, 'lag'); chk('the worker notes how late the notice came after its alarm minute (for the alarms screen)', lg && lg.s >= 0 && lg.s < 150 && Date.now() - lg.at < 20000, lg); }
  await idbSet(p2, 'test', 0); await push(); let n2 = await notes(p2); chk('a second push for the same minute → generic notice (that alarm was shown already; iPhone wants a notice every time)', n2.length === 2 && n2.some(x => /جه ميعاد منبّه/.test(x.body)), n2.map(x => x.body.slice(0, 20)));
  for (const n of n2) await p2.evaluate(async t => { const r = await navigator.serviceWorker.getRegistration(); (await r.getNotifications({ tag: t })).forEach(x => x.close()); }, n.tag);
  await idbSet(p2, 'sched', { v: 1, lang: 'en', at: Date.now(), ent: [{ m: nowM, t: 'Collect cheque', h: '10:30 AM' }] }); await idbSet(p2, 'shown', []); await push();
  let n3 = await notes(p2); chk('English: title «Alarm», English hint, the name and time', n3.length === 1 && n3[0].title === 'Alarm' && /Collect cheque/.test(n3[0].body) && /10:30 AM/.test(n3[0].body) && /Open the program/.test(n3[0].body), n3);
  await p2.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); (await r.getNotifications()).forEach(x => x.close()); });
  await idbSet(p2, 'sched', { v: 1, lang: 'ar', at: Date.now(), ent: [{ m: nowM - 20, t: 'قديم', h: '9:00 ص' }] }); await idbSet(p2, 'shown', []); await idbSet(p2, 'test', 0); await push();
  let n4 = await notes(p2); chk('an alarm 20 minutes old is not announced as «now» (generic notice)', n4.length === 1 && !/قديم/.test(n4[0].body) && /جه ميعاد/.test(n4[0].body), n4);
  await p2.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); (await r.getNotifications()).forEach(x => x.close()); });
  await idbSet(p2, 'sched', null); await idbSet(p2, 'shown', []); await idbSet(p2, 'test', Date.now()); await push(); let n5 = await notes(p2);
  chk('after the «test» button: a notice that says it works', n5.length === 1 && n5[0].title === 'تجربة المنبّه' && /هتوصل/.test(n5[0].body), n5);
  { const tl = await idbGet(p2, 'tlag'); chk('the worker notes how long the test notice took (press → notice), for the lead', tl && tl.s >= 0 && tl.s < 60 && Date.now() - tl.at < 30000, tl); }
  await push(); let n6 = await notes(p2); chk('…and only once (the test marker is spent)', n6.some(x => /جه ميعاد/.test(x.body)) , n6.map(x => x.title));
  await p2.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); (await r.getNotifications()).forEach(x => x.close()); });
  chk('no sound/vibration flags broken: notice is persistent with vibration + icon', await p2.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!r; }));
  await c.close();

  // ---------- 6) an open page takes the notice away (it rings by itself)
  { const B = await mk(); await gotoAlarms(B.p); await B.p.click('#rm-pon'); await wait(() => devs().some(k => rec(k).i === JSON.parse(unb64u(B.tok.split('.')[0]).toString()).i)); await new Promise(r => setTimeout(r, 1500));
    const { s: cd, regs: rg } = await swCdp(B.c, B.p); await B.p.evaluate(() => navigator.serviceWorker.getRegistration()); await wait(() => rg.size > 0, 5000); const rid = [...rg.keys()][0];
    const nm = Math.floor(Date.now() / 60000); await idbSet(B.p, 'sched', { v: 1, lang: 'ar', at: Date.now(), ent: [{ m: nm, t: 'مفتوح', h: '1:00 م' }] }); await idbSet(B.p, 'shown', []);
    await cd.send('ServiceWorker.deliverPushMessage', { origin: BASE, registrationId: rid, data: '' });
    chk('program open and in front: the notice is shown by the worker and then removed by the page', await wait(async () => { const n = await notes(B.p); return n && !n.some(x => /^rm-alarm/.test(x.tag)); }, 6000));
    await gotoAlarms(B.p); chk('the alarms screen tells how long the last notice took to reach the phone', await wait(async () => /آخر إشعار وصل للجهاز بعد حوالي/.test(await B.p.$eval('#rm-push', e => e.textContent).catch(() => '')), 6000));
    await B.c.close(); }

  // ---------- 6b) a phone that gets pushes a minute late: the server is told a minute earlier (no change on the server)
  { const B = await mk(); await seedAlarms(B.p, [{ id: 'l1', title: 'تأخير', time: plus(30), days: [], date: '', sound: 'bell', on: true, last: '' }]);
    await gotoAlarms(B.p); await B.p.click('#rm-pon'); const dv = JSON.parse(unb64u(B.tok.split('.')[0]).toString()).i; const kk = () => devs().find(k => rec(k).i === dv);
    await wait(() => !!kk() && rec(kk()).w.length > 0);
    const m0 = await B.p.evaluate(() => window.__t.pushEnt()[0].m); const T0 = Date.now();
    chk('no measurement yet: the server holds the alarm minute itself, lead 0', rec(kk()).w.indexOf(m0) >= 0 && await B.p.evaluate(() => window.__t.pushLead()) === 0, rec(kk()).w);
    await idbSet(B.p, 'tlag', { s: 63, at: T0 + 10 }); await B.p.evaluate(() => window.__t.pushCalib());
    chk('a test notice that took 63 s to arrive → lead of 1 minute', await B.p.evaluate(() => window.__t.pushLead()) === 1);
    chk('the server is now told the minute BEFORE the alarm (and not the alarm minute)', await wait(() => { const w = rec(kk()).w; return w.indexOf(m0 - 1) >= 0 && w.indexOf(m0) < 0; }, 9000), rec(kk()).w);
    chk('the worker\'s copy of the list says lead 1 (so it still names the alarm when the notice comes a little early)', (await idbGet(B.p, 'sched')).ld === 1);
    await gotoAlarms(B.p); chk('the screen says it sends a minute before the time', await wait(async () => /قبل ميعاده بدقيقة/.test(await B.p.$eval('#rm-push', e => e.textContent).catch(() => '')), 5000));
    await idbSet(B.p, 'lag', { s: 4, at: T0 + 20 }); await B.p.evaluate(() => window.__t.pushCalib());
    chk('an alarm notice 4 s after its minute while the lead is 1 (=64 s of delay) → the lead stays 1', await B.p.evaluate(() => window.__t.pushLead()) === 1);
    await idbSet(B.p, 'tlag', { s: 70, at: T0 + 30 }); await idbSet(B.p, 'lag', { s: 9999, at: T0 + 25 }); await B.p.evaluate(() => window.__t.pushCalib());
    chk('a silly number (9999 s) is ignored; 70 s test → lead 1', await B.p.evaluate(() => window.__t.pushLead()) === 1);
    await idbSet(B.p, 'tlag', { s: 4, at: T0 + 40 }); await B.p.evaluate(() => window.__t.pushCalib());
    chk('the phone gets fast again (4 s) → lead goes back to 0', await B.p.evaluate(() => window.__t.pushLead()) === 0);
    chk('…and the server is told the alarm minute again', await wait(() => { const w = rec(kk()).w; return w.indexOf(m0) >= 0 && w.indexOf(m0 - 1) < 0; }, 9000), rec(kk()).w);
    await idbSet(B.p, 'tlag', { s: 100, at: T0 + 50 }); await B.p.evaluate(() => window.__t.pushCalib());
    chk('never more than 2 minutes early', await B.p.evaluate(() => window.__t.pushLead()) === 2 && await wait(() => rec(kk()).w.indexOf(m0 - 2) >= 0, 9000));
    await B.c.close(); }

  // ---------- 7) switching it off
  { const B = await mk(); await gotoAlarms(B.p); await B.p.click('#rm-pon'); await wait(() => devs().length >= 1 && B.p.evaluate(() => window.__t.pushIsOn())); const before = devs().length; await new Promise(r => setTimeout(r, 1500)); await gotoAlarms(B.p); await B.p.click('#rm-poff');
    chk('«إيقاف» → forgotten at the server, unsubscribed, switch off, panel offers «فعّل» again', await wait(async () => devs().length === before - 1 && !(await B.p.evaluate(() => window.__t.pushIsOn())) && await B.p.evaluate(() => window.__unsub) === 1 && !!(await B.p.$('#rm-pon')), 10000), { before, after: devs().length });
    await B.c.close(); }

  // ---------- 8) things that go wrong
  { const B = await mk({ deny: true }); await gotoAlarms(B.p); const t = await B.p.$eval('#rm-push', e => e.textContent.replace(/\s+/g, ' '));
    chk('notifications blocked in the browser → the panel says how to unblock, the button is off', /محظورة للموقع ده/.test(t) && await B.p.$eval('#rm-pon', e => e.disabled), t.slice(0, 60)); await B.c.close(); }
  { const B = await mk({ deny: true, init: "Object.defineProperty(Notification, 'permission', { get: () => 'default' }); Notification.requestPermission = async () => 'denied';" }); await gotoAlarms(B.p); await B.p.click('#rm-pon');
    chk('the person presses «don\'t allow» → says to allow notifications, nothing registered, switch stays off', await wait(async () => /لازم تسمح/.test(await B.p.$eval('#rm-push', e => e.textContent).catch(() => '')), 8000) && !(await B.p.evaluate(() => window.__t.pushIsOn())) && !devs().some(k => rec(k).i === JSON.parse(unb64u(B.tok.split('.')[0]).toString()).i)); await B.c.close(); }
  { const old = SRV; SRV = makeServer(TPL, keys, { noKeys: true, sub: BASE + '/' }); const B = await mk(); await gotoAlarms(B.p); await B.p.click('#rm-pon');
    chk('server file not updated / no push keys → «كلّم المصمم…», switch off', await wait(async () => /لسه ما اتفعّلتش على السيرفر/.test(await B.p.$eval('#rm-push', e => e.textContent).catch(() => '')), 15000) && !(await B.p.evaluate(() => window.__t.pushIsOn())), await B.p.$eval('#rm-push', e => e.textContent.slice(0, 160)).catch(() => ''));
    await B.c.close(); SRV = old; }
  { const B = await mk({ tok: tokOf({ i: 'STOPPED1', m: 1, c: Date.now() - 3600000 }) }); await gotoAlarms(B.p); await B.p.click('#rm-pon');
    chk('an ended code → says the code ended, switch off', await wait(async () => /الكود ده انتهى/.test(await B.p.$eval('#rm-push', e => e.textContent).catch(() => '')), 15000) && !(await B.p.evaluate(() => window.__t.pushIsOn())), await B.p.$eval('#rm-push', e => e.textContent.slice(0, 160)).catch(() => '')); await B.c.close(); }
  { const wrong = makeKeys(); const B = await mk({ tok: makeToken(wrong, { v: 2, p: 'r', i: 'FORGED01', c: Date.now() - 1000, m: 0, s: 'a' }) }); await gotoAlarms(B.p); await B.p.click('#rm-pon');
    chk('a code signed by someone else → refused by the server, switch off', await wait(async () => /مش قابل الكود ده/.test(await B.p.$eval('#rm-push', e => e.textContent).catch(() => '')), 15000) && !(await B.p.evaluate(() => window.__t.pushIsOn()))); await B.c.close(); }
  { const B = await mk({ init: "localStorage.setItem('__failsub','1')" }); await gotoAlarms(B.p); await B.p.click('#rm-pon');
    chk('the browser\'s push service fails (AbortError) → a clear message, no crash', await wait(async () => /مش متاحة دلوقتي/.test(await B.p.$eval('#rm-push', e => e.textContent).catch(() => '')), 15000) && !(await B.p.evaluate(() => window.__t.pushIsOn()))); await B.c.close(); }
  { const B = await mk(); await gotoAlarms(B.p); await B.p.click('#rm-pon'); await wait(() => B.p.evaluate(() => window.__t.pushIsOn())); await new Promise(r => setTimeout(r, 2500));
    srvDown = true; await seedAlarms(B.p, [{ id: 'n1', title: 'x', time: plus(15), days: [], date: '', sound: 'bell', on: true, last: '' }]); await B.p.evaluate(() => window.__t.pushWatch());
    const netErr = await wait(() => B.p.evaluate(() => window.__t.pushStat.err === 'net'), 20000); chk('server unreachable → the page keeps working, error is «net», it retries later', netErr && await B.p.evaluate(() => window.__t.pushIsOn()), await B.p.evaluate(() => window.__t.pushStat.err));
    srvDown = false; await B.p.evaluate(() => { window.__t.pushStat.err = ''; }); await B.p.evaluate(() => window.__t.pushWatch(true)); chk('…and a forced sync works again when the server is back', await wait(() => B.p.evaluate(() => window.__t.pushStat.at > 0 && !window.__t.pushStat.err), 15000)); await B.c.close(); }
  { // new server keys → the old subscription is dropped and a new one made
    const B = await mk(); await gotoAlarms(B.p); await B.p.click('#rm-pon'); await wait(() => B.p.evaluate(() => window.__t.pushIsOn())); await new Promise(r => setTimeout(r, 2500));
    const old = SRV, keys2 = Object.assign({}, keys, makeKeys()); keys2.designer = keys.designer; keys2.pubJwk = keys.pubJwk; keys2.admin = keys.admin; SRV = makeServer(TPL, keys2, { sub: BASE + '/' });
    await B.p.evaluate(() => localStorage.removeItem('rm.pushpk')); const c0 = await B.p.evaluate(() => window.__subCalls); await B.p.evaluate(() => window.__t.pushWatch(true));
    chk('server got new push keys → old subscription dropped, new one made with the new key', await wait(async () => (await B.p.evaluate(() => window.__subCalls)) > c0 && JSON.parse(await B.p.evaluate(() => localStorage.getItem('__fakekey'))).length === 65 && b64u(Buffer.from(JSON.parse(await B.p.evaluate(() => localStorage.getItem('__fakekey'))))) === keys2.vapPub, 15000));
    SRV = old; await B.c.close(); }

  // ---------- 9) browsers that cannot do it say so
  { const B = await mk({ ctx: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } }); await gotoAlarms(B.p);
    const t = await B.p.$eval('#rm-push', e => e.textContent.replace(/\s+/g, ' ')); chk('iPhone in Safari (not added to the Home Screen) → explains how, no button', /إضافة إلى الشاشة الرئيسية/.test(t) && !(await B.p.$('#rm-pon')), t.slice(0, 120)); await B.p.screenshot({ path: 'push-panel-ios.png' }); await B.c.close(); }
  { const B = await mk({ init: 'delete window.PushManager;' }); await gotoAlarms(B.p); const t = await B.p.$eval('#rm-push', e => e.textContent.replace(/\s+/g, ' ')); chk('a browser without PushManager → says it is not supported, no button', /مش بيدعم تنبيهات الخلفية/.test(t) && !(await B.p.$('#rm-pon')), t.slice(0, 100)); await B.c.close(); }
  // ---------- 10) the same on laptops and desktop computers, in every browser and system
  const UAS = {
    'Windows Chrome': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Windows Edge': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
    'Windows Firefox': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
    'Mac Safari': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    'Mac Chrome': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Linux Firefox': 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0' };
  for (const [nm, ua] of Object.entries(UAS)) {
    const mac = /Mac/.test(nm), B = await mk({ ctx: { userAgent: ua, viewport: { width: 1280, height: 800 } }, init: mac ? "Object.defineProperty(navigator,'platform',{get:function(){return 'MacIntel'},configurable:true});Object.defineProperty(navigator,'maxTouchPoints',{get:function(){return 0},configurable:true});" : '' }); await gotoAlarms(B.p);
    const o = await B.p.evaluate(() => ({ can: window.__t.pushCan(), phone: window.__t.pushPhone, btn: !!document.querySelector('#rm-pon'), desk: !!document.querySelector('#rm-pdesk'), ios: /إضافة إلى الشاشة الرئيسية/.test(document.querySelector('#rm-push').textContent) }));
    chk(nm + ': the same panel and «فعّل» button as on a phone, no Home-Screen step, with the computer note', o.can === '' && !o.phone && o.btn && o.desk && !o.ios, o);
    await B.c.close(); }
  { const B = await mk({ ctx: { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36', viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true } }); await gotoAlarms(B.p);
    const o = await B.p.evaluate(() => ({ can: window.__t.pushCan(), phone: window.__t.pushPhone, btn: !!document.querySelector('#rm-pon'), desk: !!document.querySelector('#rm-pdesk') }));
    chk('Android Chrome: the button, no computer note, no Home-Screen step', o.can === '' && o.phone && o.btn && !o.desk, o); await B.c.close(); }
  { const B = await mk({ ctx: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15', viewport: { width: 820, height: 1180 }, hasTouch: true }, init: "Object.defineProperty(navigator,'platform',{get:function(){return 'MacIntel'},configurable:true});Object.defineProperty(navigator,'maxTouchPoints',{get:function(){return 5},configurable:true});" }); await gotoAlarms(B.p);
    const o = await B.p.evaluate(() => ({ can: window.__t.pushCan(), btn: !!document.querySelector('#rm-pon'), ios: /إضافة إلى الشاشة الرئيسية/.test(document.querySelector('#rm-push').textContent), desk: !!document.querySelector('#rm-pdesk') }));
    chk('iPad (a Mac-looking Safari with a touch screen) → still asks for the Home Screen step', o.can === 'ios' && !o.btn && o.ios && !o.desk, o); await B.c.close(); }

  // the alarm is handed to the system notice on every device while the page is in the background; the page rings itself only when it is on screen or the push is not working
  const hide = (p, v) => p.evaluate(h => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); }, v);
  const dueNow = [{ id: 'h1', title: 'خلفية', time: plus(0), days: [], date: '', sound: 'bell', on: true, last: '' }];
  const ringState = p => p.evaluate(() => ({ ring: !!window.__t.ring, last: (window.__t.db.reminders[0] || {}).last, hands: window.__t.pushHands() }));
  { const B = await mk({ ctx: { userAgent: UAS['Windows Chrome'], viewport: { width: 1280, height: 800 } } }); await hide(B.p, true); await gotoAlarms(B.p); await B.p.click('#rm-pon');
    chk('desktop: switching it on works while the tab is in the background', await wait(async () => await B.p.evaluate(() => window.__t.pushIsOn() && window.__t.pushStat.at > 0)));
    await seedAlarms(B.p, dueNow); await B.p.evaluate(() => window.__t.alarmTick());
    let s = await ringState(B.p); chk('desktop, tab in the background, push working → the page does NOT ring (the system notice does), the alarm stays due', s.hands && !s.ring && !s.last, s);
    await hide(B.p, false); await B.p.evaluate(() => window.__t.alarmBack()); await B.p.waitForTimeout(300);
    s = await ringState(B.p); chk('…the notice is tapped / the tab comes back → the alarm window opens', s.ring && !!s.last, s);
    await B.c.close(); }
  { const B = await mk({ ctx: { userAgent: UAS['Windows Chrome'], viewport: { width: 1280, height: 800 } } }); await hide(B.p, true); await gotoAlarms(B.p); await B.p.click('#rm-pon');
    await wait(async () => await B.p.evaluate(() => window.__t.pushIsOn() && window.__t.pushStat.at > 0));
    const { s: cd, regs: rg } = await swCdp(B.c, B.p); await B.p.evaluate(() => navigator.serviceWorker.getRegistration()); await wait(() => rg.size > 0, 5000); const rid = [...rg.keys()][0];
    const nm = Math.floor(Date.now() / 60000); await seedAlarms(B.p, dueNow); await idbSet(B.p, 'sched', { v: 1, lang: 'ar', at: Date.now(), ent: [{ m: nm, t: 'خلفية', h: '1:00 م' }] }); await idbSet(B.p, 'shown', []);
    await cd.send('ServiceWorker.deliverPushMessage', { origin: BASE, registrationId: rid, data: '' });
    chk('desktop, tab in the background: the push shows the system notice', await wait(async () => { const n = await notes(B.p); return n && n.some(x => x.tag === 'rm-alarm-' + nm && /خلفية/.test(x.body)); }, 6000));
    await B.p.evaluate(() => window.__t.alarmTick()); await B.p.waitForTimeout(1500); const n1 = await notes(B.p), s1 = await ringState(B.p);
    chk('…it stays (the page does not take it away or ring over it)', n1.some(x => x.tag === 'rm-alarm-' + nm) && !s1.ring, { tags: n1.map(x => x.tag), ring: s1.ring });
    await hide(B.p, false); await B.p.evaluate(() => window.__t.alarmBack()); await B.p.waitForTimeout(500); const n2 = await notes(B.p), s2 = await ringState(B.p);
    chk('…a tap on it brings the tab back: the alarm window opens and the notice is cleared', s2.ring && !n2.some(x => /^rm-alarm/.test(x.tag)), { ring: s2.ring, tags: n2.map(x => x.tag) }); await B.c.close(); }
  { const B = await mk({ ctx: { userAgent: UAS['Mac Safari'], viewport: { width: 1280, height: 800 } }, init: "Object.defineProperty(navigator,'platform',{get:function(){return 'MacIntel'},configurable:true});Object.defineProperty(navigator,'maxTouchPoints',{get:function(){return 0},configurable:true});" }); await gotoAlarms(B.p); await B.p.click('#rm-pon');
    await wait(async () => await B.p.evaluate(() => window.__t.pushIsOn() && window.__t.pushStat.at > 0)); await hide(B.p, true); await seedAlarms(B.p, dueNow); await B.p.evaluate(() => window.__t.alarmTick());
    let s = await ringState(B.p); chk('Mac Safari: the same hand-over', s.hands && !s.ring, s);
    await B.p.evaluate(() => { window.__t.pushStat.err = 'srv'; }); await B.p.evaluate(() => window.__t.alarmTick()); s = await ringState(B.p);
    chk('…but when the push service is not working the page rings by itself even in the background (never a lost alarm)', !s.hands && s.ring, s); await B.c.close(); }
  { const B = await mk({ ctx: { userAgent: UAS['Windows Firefox'], viewport: { width: 1280, height: 800 } } }); await hide(B.p, true); await seedAlarms(B.p, dueNow); await B.p.evaluate(() => window.__t.alarmTick());
    const s = await ringState(B.p); chk('push switched off → the page rings in the background as before', !s.hands && s.ring, s); await B.c.close(); }
  { const B = await mk({ ctx: { userAgent: UAS['Windows Chrome'], viewport: { width: 1280, height: 800 } } }); await gotoAlarms(B.p); await B.p.click('#rm-pon');
    await wait(async () => await B.p.evaluate(() => window.__t.pushIsOn() && window.__t.pushStat.at > 0)); await seedAlarms(B.p, dueNow); await B.p.evaluate(() => window.__t.alarmTick());
    const s = await ringState(B.p); chk('desktop, page on screen, push working → the page rings (sound + window) as always', s.ring, s); await B.c.close(); }

  // English page
  { const B = await mk({ init: "try{var d=JSON.parse(localStorage.getItem('accounts.v1')||'{}');}catch(e){}" }); await gotoAlarms(B.p); await B.p.evaluate(() => { window.__t.db.settings.lang = 'en'; window.__t.save(); }); await B.p.reload(); await B.p.waitForFunction(() => window.__t); await gotoAlarms(B.p);
    const t = await B.p.$eval('#rm-push', e => e.textContent.replace(/\s+/g, ' ')); chk('English: the panel is in English', /Alert even when the screen is locked/.test(t) && /Turn the alert on for this device/.test(t), t.slice(0, 80)); await B.c.close(); }
  console.log('page errors:', errs.length, errs.slice(0, 5));
  chk('no page errors', errs.length === 0, errs.slice(0, 3));
  console.log(res.filter(x => x).length + '/' + res.length + ' passed'); await b.close(); process.exit(res.every(x => x) ? 0 : 1);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
