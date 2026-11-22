/* Service worker of the accounts program (v8.77) — its ONLY job: when the phone's push service says "an alarm is due", wake up and show a notice.
   Public file: it holds no key, no code and no data of the program. The names / times of the alarms are written by the page into this browser's own
   storage (IndexedDB "rm-push"); this file only reads them. Nothing here talks to any server. */
'use strict';
const DEV = /\/pushdev\/$/.test(self.registration.scope); /* the designer's page registers this same file in its own folder "pushdev/": its own push address and its own list */
const DBN = DEV ? 'rm-push-dev' : 'rm-push', STN = 'st';
const BASE = (() => { try { return new URL(DEV ? '../' : './', self.registration.scope).href; } catch (e) { return ''; } })(); /* the folder of the program: other pages of the same site (the same address, another folder) are not its windows */
const mine = w => { try { return (!BASE || w.url.indexOf(BASE) === 0) && DEV === /\/dev\.html$/.test(new URL(w.url).pathname); } catch (e) { return !DEV; } }; /* a window of the same program (the designer's page is dev.html) */
const idb = () => new Promise((ok, no) => { const q = indexedDB.open(DBN, 1); q.onupgradeneeded = () => q.result.createObjectStore(STN); q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error); });
const idbGet = async k => { const d = await idb(); try { return await new Promise(ok => { const r = d.transaction(STN).objectStore(STN).get(k); r.onsuccess = () => ok(r.result); r.onerror = () => ok(undefined); }); } finally { d.close(); } };
const idbSet = async (k, v) => { const d = await idb(); try { await new Promise(ok => { const t = d.transaction(STN, 'readwrite'); t.objectStore(STN).put(v, k); t.oncomplete = () => ok(); t.onerror = () => ok(); t.onabort = () => ok(); }); } finally { d.close(); } };

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

const LATE = 7; /* minutes: an alarm older than this is not announced as "now" */
async function onPush() {
  let sc = null, shown = [], test = null;
  try { sc = await idbGet('sched'); shown = (await idbGet('shown')) || []; test = await idbGet('test'); } catch (e) { /* no storage: a generic notice below */ }
  const en = !!(sc && sc.lang === 'en'), nm = Math.floor(Date.now() / 60000), ent = (sc && Array.isArray(sc.ent)) ? sc.ent : [];
  const ld = sc && sc.ld > 0 ? 45000 : 30000; /* the server now sends right at the minute: a phone clock a few seconds slow must still name the alarm. A phone that gets pushes late (sc.ld) is sent to a minute early, so its notice may come a little before the minute */
  const due = ent.filter(x => x && x.m * 60000 <= Date.now() + ld && nm - x.m <= LATE && shown.indexOf(x.m) < 0);
  const isTest = !due.length && test && Date.now() - test < 90000;
  const wins = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).filter(mine);
  wins.forEach(w => { try { w.postMessage({ t: 'alarm' }); } catch (e) { /* page gone */ } }); /* an open page rings by itself and closes this notice */
  let title = en ? 'Alarm' : 'منبّه', body, tag = 'rm-alarm';
  if (due.length) { body = due.map(x => (x.h || '') + (x.t ? ' — ' + x.t : '')).join('\n') + '\n' + (en ? 'Open the program to dismiss or snooze' : 'افتح البرنامج للإلغاء أو التذكير'); tag = 'rm-alarm-' + due[0].m; }
  else if (isTest) { title = en ? 'Alarm test' : 'تجربة المنبّه'; body = en ? 'Alarms will reach this device even when its screen is locked.' : 'تمام: المنبّهات هتوصل للجهاز ده حتى لو الشاشة مقفولة.'; tag = 'rm-test'; }
  else body = en ? 'An alarm time has come. Open the program.' : 'جه ميعاد منبّه. افتح البرنامج.';
  /* how long pushes take to reach this phone: the page reads these two notes and asks the server to send earlier when they are long (src/39-push.js, pushCalib) */
  if (due.length) { try { await idbSet('lag', { s: Math.round((Date.now() - due[0].m * 60000) / 1000), at: Date.now() }); } catch (e) { /* ignore */ } } /* seconds after the alarm minute (negative = before it) */
  if (isTest) { try { await idbSet('tlag', { s: Math.max(0, Math.round((Date.now() - test) / 1000)), at: Date.now() }); await idbSet('test', 0); } catch (e) { /* ignore */ } } /* seconds from the «test» press to the notice */
  await self.registration.showNotification(title, { body, tag, renotify: true, requireInteraction: true, vibrate: [600, 250, 600, 250, 600, 250, 600], icon: 'icon-192.png', badge: 'icon-64.png', lang: en ? 'en' : 'ar', dir: en ? 'ltr' : 'rtl', timestamp: Date.now(), data: { m: due.map(x => x.m) } });
  if (due.length) { try { await idbSet('shown', shown.concat(due.map(x => x.m)).slice(-80)); } catch (e) { /* ignore */ } }
}
self.addEventListener('push', e => e.waitUntil(onPush())); /* every push must show a notice (iPhone and Chrome both require it) */

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const wins = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).filter(mine);
    for (const w of wins) { try { await w.focus(); w.postMessage({ t: 'alarm' }); return; } catch (x) { /* try the next window */ } }
    if (self.clients.openWindow) await self.clients.openWindow(DEV ? new URL('../dev.html', self.registration.scope).href : self.registration.scope);
  })());
});
