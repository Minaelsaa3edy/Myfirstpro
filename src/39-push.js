/* ---------- alarms that reach a LOCKED phone or a closed browser (Web Push) ----------
   A web page cannot ring while its screen is off, but the phone's own push service can wake a small worker (tools/sw.js) that shows a notice.
   The device tells the code server only the TIMES of its next alarms (minutes since 1970); at each time the server sends an EMPTY push
   (tools/server.gs.tpl: pushTick); the worker then reads the alarm's name from this browser's own storage. Names never leave the device.
   Only the program that runs with a code can use it: the server must know the code is genuine.
   The designer's own page (PUSH_DEV) does the same with a push-only code that it signs itself after asking for the designer's password once; it keeps its own
   storage, its own worker registration (scope "pushdev/") and its own list in the browser, so it never mixes with the customer program on the same phone. */
const PUSH_SRV = '@@PUSH_SRV@@';
const PUSH_DEV = /*PUSHDEV*/false, PUSH_S = PUSH_DEV ? '.d' : '', PUSH_DEVDAYS = 180; /* the designer's page: how long the code it signs for itself lives */
const PUSH_DAYS = 10, PUSH_MAXN = 120, PUSH_AGAIN = 6 * 3600000; /* how far ahead the server is told, how many times at most, and how often it is told again even if nothing changed */
const PUSH_K = { on: 'rm.push' + PUSH_S, dev: 'rm.pushdev' + PUSH_S, at: 'rm.pushat' + PUSH_S, pk: 'rm.pushpk' + PUSH_S, tk: 'rm.pushtk.d', ld: 'rm.pushld' + PUSH_S, cal: 'rm.pushcal' + PUSH_S, lat: 'rm.pushlat' + PUSH_S };
const pushLsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const pushLsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* blocked */ } };
const pushU8 = s => { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
const pushIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const pushPhone = pushIOS || /Android|Mobile/i.test(navigator.userAgent); /* a phone or tablet; anything else is a laptop / desktop computer */
const pushStandalone = () => { try { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; } catch (e) { return false; } };
const pushToken = () => { try { return PUSH_DEV ? (localStorage.getItem(PUSH_K.tk) || '') : (JSON.parse(localStorage.getItem('accounts.real.state')) || {}).raw || ''; } catch (e) { return ''; } };
const pushDir = () => location.href.split('#')[0].split('?')[0].replace(/[^\/]*$/, '');
const pushIsOn = () => pushLsGet(PUSH_K.on) === '1';
function pushCan() { /* '' = this device can do it, otherwise why not */
  if (!PUSH_SRV || (!PUSH_DEV && !pushToken())) return 'nocode'; /* the designer's page can always ask for its own code */
  if (!window.isSecureContext || !('serviceWorker' in navigator)) return 'nosw';
  if (pushIOS && !pushStandalone()) return 'ios';
  if (!('PushManager' in window) || !window.Notification) return 'nopush';
  return '';
}
function pushCall(params, ms) { /* plain <script> request to the code server (no CORS needed), like the code check does */
  return new Promise((res, rej) => {
    const cb = '__p' + Math.random().toString(36).slice(2), s = document.createElement('script'); let done = false, t = 0;
    const end = (ok, v) => { if (done) return; done = true; clearTimeout(t); try { delete window[cb]; } catch (e) { window[cb] = undefined; } s.remove(); ok ? res(v) : rej(v); };
    t = setTimeout(() => end(false, new Error('net')), ms || 12000);
    window[cb] = v => end(true, v); s.onerror = () => end(false, new Error('net'));
    s.src = PUSH_SRV + (PUSH_SRV.indexOf('?') < 0 ? '?' : '&') + new URLSearchParams(Object.assign({}, params, { cb, _: Date.now() })).toString();
    document.head.appendChild(s);
  });
}
function pushDev() { /* a random name for this device, made once */
  let d = pushLsGet(PUSH_K.dev);
  if (!/^[A-Za-z0-9_-]{16,32}$/.test(d || '')) { const a = new Uint8Array(15); crypto.getRandomValues(a); d = btoa(String.fromCharCode.apply(null, a)).replace(/\+/g, '-').replace(/\//g, '_'); pushLsSet(PUSH_K.dev, d); }
  return d;
}
/* what the worker reads (same browser storage as tools/sw.js) */
const pushIdb = () => new Promise((ok, no) => { const q = indexedDB.open(PUSH_DEV ? 'rm-push-dev' : 'rm-push', 1); q.onupgradeneeded = () => q.result.createObjectStore('st'); q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error); });
async function pushIdbGet(k) { const d = await pushIdb(); try { return await new Promise(ok => { const r = d.transaction('st').objectStore('st').get(k); r.onsuccess = () => ok(r.result); r.onerror = () => ok(undefined); }); } finally { d.close(); } }
async function pushIdbSet(k, v) { const d = await pushIdb(); try { await new Promise((ok, no) => { const t = d.transaction('st', 'readwrite'); t.objectStore('st').put(v, k); t.oncomplete = () => ok(); t.onerror = () => no(t.error); t.onabort = () => no(t.error); }); } finally { d.close(); } }

/* Some phones get a push a whole minute after the server sent it (the phone / push service holds it). The worker notes how long a notice took (tools/sw.js: «lag» for an alarm, «tlag» for the test button);
   from that this page works out how many minutes (0-2) the server must send BEFORE the alarm minute so the notice lands on time. The server is simply told earlier minutes, it needs no change. */
const pushLead = () => { const n = parseInt(pushLsGet(PUSH_K.ld), 10); return n >= 1 ? Math.min(n, 2) : 0; };
async function pushCalib() { /* the sentences about the last measured delay ([] = none yet); sets the lead when a new measurement says so */
  if (!pushIsOn()) return [];
  try {
    const lead = pushLead(), seen = Number(pushLsGet(PUSH_K.cal)) || 0, lg = await pushIdbGet('lag'), tl = await pushIdbGet('tlag'); let m = null;
    if (tl && tl.at > seen && tl.s >= 0 && tl.s < 300) m = { at: tl.at, lat: Math.max(0, tl.s - 1) }; /* 1 s of it is the page's own call to the server */
    if (lg && lg.at > seen && Math.abs(lg.s) < 300 && (!m || lg.at > m.at)) m = { at: lg.at, lat: Math.max(0, lg.s + lead * 60 - 1) }; /* the server sent it `lead` minutes + about 1 s around the alarm minute */
    if (m) {
      pushLsSet(PUSH_K.cal, String(m.at)); pushLsSet(PUSH_K.lat, String(m.lat));
      const nl = Math.min(2, Math.round(m.lat / 60));
      if (nl !== lead) { pushLsSet(PUSH_K.ld, String(nl)); pushSig = ''; pushSoon(300); }
    }
  } catch (e) { /* no storage / nothing measured */ }
  const lat = pushLsGet(PUSH_K.lat); if (lat === null || lat === '') return [];
  const n = Number(lat), l = pushLead(), out = [`آخر إشعار وصل للجهاز بعد حوالي ${n} ثانية من إرساله.`];
  if (l === 1) out.push('علشان كده السيرفر بيبعت المنبّه قبل ميعاده بدقيقة علشان يوصلك في وقته.'); else if (l === 2) out.push('علشان كده السيرفر بيبعت المنبّه قبل ميعاده بدقيقتين علشان يوصلك في وقته.');
  return out;
}
const pushCalibShow = () => { const el = $('#rm-plag'); pushCalib().then(t => { if (el && t.length) { el.innerHTML = t.map(x => '<span>' + esc(x) + '</span>').join(' '); el.hidden = false; } }); }; /* also learns when the panel is not on screen */

/* the next times the alarms will ring: [{ m: minute since 1970, t: its name, h: the time as written on screen }].
   past > 0: also the ones of the last `past` minutes, for the notice text only (never sent to the server) */
function pushEnt(now, past) {
  now = now || new Date(); const out = [], t0 = now.getTime(), from = t0 - (past || 0) * 60000, today = ymd(now);
  (db.reminders || []).forEach(r => {
    const L = alarmLive(r); if (L && L.left <= 0) return; /* a collection alarm whose money was paid */
    const sn = alarmSnzOf(r); if (sn && sn > from) out.push({ m: Math.ceil(sn / 60000), t: r.title || '', h: alarmT12(alarmHM(new Date(sn))) });
    if (!r.on || !alarmOkTime(r.time)) return;
    for (let i = past ? -1 : 0; i <= PUSH_DAYS; i++) {
      const d = new Date(now); d.setDate(d.getDate() + i); d.setHours(+r.time.slice(0, 2), +r.time.slice(3), 0, 0);
      if (d.getTime() <= from || !alarmDay(r, d)) continue;
      if (!past && ymd(d) === today && r.last === today) continue; /* it already rang (or was missed) today: the page has dealt with it */
      out.push({ m: Math.floor(d.getTime() / 60000), t: r.title || '', h: alarmT12(r.time) });
    }
  });
  out.sort((a, b) => a.m - b.m || a.t.localeCompare(b.t));
  return out.filter((x, i) => i === 0 || x.m !== out[i - 1].m || x.t !== out[i - 1].t).slice(0, PUSH_MAXN + (past ? 10 : 0));
}

let pushReg = null, pushSig = '', pushBusy = false, pushRetry = 0, pushTimer = 0, pushMsg = '';
const pushStat = { n: 0, at: 0, err: '', dead: false }; /* n: how many times the server holds; err: why the last try failed */
async function pushSw() { /* the worker: registered next to the page (scope = this folder) */
  if (pushReg) return pushReg;
  const dir = pushDir();
  if (PUSH_DEV) { /* its own registration (a folder that holds no page): a second push address, apart from the customer program's */
    const g = await navigator.serviceWorker.register(dir + 'sw.js', { scope: dir + 'pushdev/' });
    for (let i = 0; i < 75 && !(g.active && g.active.state === 'activated'); i++) await new Promise(r => setTimeout(r, 200));
    if (!(g.active && g.active.state === 'activated')) throw new Error('sw');
    return (pushReg = g);
  }
  await navigator.serviceWorker.register(dir + 'sw.js');
  const r = await Promise.race([navigator.serviceWorker.ready, new Promise((_, no) => setTimeout(() => no(new Error('sw')), 15000))]);
  return (pushReg = r);
}
const pushGetReg = () => navigator.serviceWorker.getRegistration(PUSH_DEV ? pushDir() + 'pushdev/' : undefined); /* the registration this page's alarms belong to */
async function pushKey() { /* the server's public push key (kept, so it is also known offline) */
  try {
    const r = await pushCall({ a: 'pk' }, 10000);
    if (r && r.ok && r.pk) { pushLsSet(PUSH_K.pk, r.pk); return r.pk; }
    throw new Error('nopush'); /* an old server file answers "not allowed", a new one without keys says nopush: either way it needs the designer's update */
  } catch (e) { const k = pushLsGet(PUSH_K.pk); if (e.message !== 'nopush' && k) return k; throw e; }
}
async function pushSub(create) { /* this device's push address (made when asked to) */
  const reg = await pushSw(), ku = pushU8(await pushKey());
  let sub = await reg.pushManager.getSubscription();
  if (sub) { const cur = sub.options && sub.options.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null; if (cur && (cur.length !== ku.length || cur.some((v, i) => v !== ku[i]))) { try { await sub.unsubscribe(); } catch (e) { /* ignore */ } sub = null; } } /* the server got new keys */
  if (!sub && create) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: ku });
  return sub;
}
function pushSoon(ms) { clearTimeout(pushTimer); pushTimer = setTimeout(() => pushWatch(), ms || 1200); }
async function pushWatch(force) { /* keeps the server's list of times equal to the alarms on this screen; runs every few seconds, does something only when they changed */
  if (pushBusy || !pushIsOn() || pushCan() || Notification.permission !== 'granted' || pushStat.dead) return;
  pushCalib(); /* not waited for: a new measurement changes the lead for the next round (a few seconds later) */
  const now = Date.now(), lead = pushLead(), ent = pushEnt(new Date(now)), sig = ent.map(x => x.m + ':' + x.t).join('|') + '#' + LANG + '#' + lead;
  if (!force && ((sig === pushSig && now - (Number(pushLsGet(PUSH_K.at)) || 0) < PUSH_AGAIN) || now < pushRetry)) return;
  pushBusy = true;
  try {
    await pushIdbSet('sched', { v: 1, lang: LANG, ent: pushEnt(new Date(now), 8), ld: lead, at: now });
    let sub = await pushSub(false); if (!sub) sub = await pushSub(true); /* it was removed (cleared site data): ask again, silently */
    const r = await pushCall({ a: 'preg', d: pushDev(), ep: sub.endpoint, w: ent.map(x => (x.m - lead).toString(36)).join('.'), tk: pushToken() }); /* the designer's page sends its own signed code the same way */
    if (!r || !r.ok) throw new Error((r && r.e) || 'srv');
    pushSig = sig; pushLsSet(PUSH_K.at, String(now)); pushRetry = 0; pushStat.n = r.n || 0; pushStat.at = now; pushStat.err = '';
  } catch (e) {
    const m = e && e.message || 'srv'; pushStat.err = m; pushSig = '';
    if (PUSH_DEV && (m === 'expired' || m === 'revoked' || m === 'auth')) { pushLsSet(PUSH_K.tk, ''); pushLsSet(PUSH_K.on, '0'); pushMsg = 'انتهت صلاحية تفعيل التنبيه على الجهاز ده. فعّله من جديد بكلمة مرور المطوّر.'; setTimeout(() => { try { render(); } catch (x) { /* not on screen */ } }, 0); } /* its own code is old: a new one is signed at the next activation */
    else if (m === 'revoked' || m === 'expired') pushStat.dead = true; /* the code is over: no more tries */
    else pushRetry = Date.now() + (m === 'net' ? 60000 : 10 * 60000);
  } finally { pushBusy = false; }
}
/* The alarm is handed to the system notice when this page is in the background (tab hidden, window minimised or covered, phone locked): the notice has the system's own sound and
   banner, and a tap on it opens the alarm window. This is the same on every device and browser; the page rings by itself only while it is on screen, or when the push service
   is not in working order (so an alarm is never lost). iPhone always hands over (src/35-alarms.js), because a hidden page there can neither sound nor show anything. */
const pushHands = () => { try { return pushIsOn() && !pushCan() && !!window.Notification && Notification.permission === 'granted' && !pushStat.dead && !pushStat.err && pushStat.at > 0; } catch (e) { return false; } };
async function pushClear() { /* the page is in front: it rings by itself, so the notices of the worker are taken away */
  try { const reg = await pushGetReg(); if (!reg) return; (await reg.getNotifications()).forEach(n => { if (/^rm-alarm/.test(n.tag)) n.close(); }); } catch (e) { /* none */ }
}
try { if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.t === 'alarm') { try { alarmBack(); } catch (x) { /* ignore */ } setTimeout(pushCalibShow, 700); } }); } catch (e) { /* no worker support */ }

/* why something failed, in words for the customer */
const pushWhy = e => ({
  nopush: 'الخدمة لسه ما اتفعّلتش على السيرفر. كلّم المصمم علشان يحدّث ملف السيرفر.',
  net: 'مفيش اتصال بالإنترنت أو السيرفر مش بيرد. جرّب تاني بعد شوية.',
  revoked: 'الكود ده اتوقّف، فالتنبيه متاح بعد ما يرجع الكود يشتغل.',
  expired: 'الكود ده انتهى، فالتنبيه متاح بعد تجديده.',
  auth: 'السيرفر مش قابل الكود ده. كلّم المصمم.',
  endpoint: 'الجهاز ده مش مدعوم للتنبيهات في الخلفية.',
  full: 'السيرفر وصل لأقصى عدد أجهزة. كلّم المصمم.',
  sw: 'المتصفح ما قدرش يشغّل خدمة التنبيهات هنا. لو إنت في نافذة تصفح خاص (Private / Incognito) افتح البرنامج في نافذة عادية.'
})[e] || 'حصلت مشكلة في التفعيل. جرّب تاني.';
async function pushDevMint(pw) { /* the designer's page: signs a push-only code for itself (PUSH_DEVDAYS days) once the designer's password has opened the signing key; the password is never kept */
  if (NOCRYPTO) throw new Error('crypto');
  if (devLock - Date.now() > 0) throw new Error('wait');
  let s; try { s = await devUnlock(pw); } catch (e) { if (++devFail >= 5) { devFail = 0; devLock = Date.now() + 30000; } throw new Error('pw'); }
  devFail = 0;
  const pb = TXT_E.encode(JSON.stringify({ v: 2, p: 'r', i: b64u(crypto.getRandomValues(new Uint8Array(6))), c: Date.now(), m: PUSH_DEVDAYS * 1440, s: 'a', o: 0, n: 'push (dev)' }));
  return b64u(pb) + '.' + b64u(new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, s.key, pb)));
}
async function pushEnable() { /* the button: permission, subscription, first sync, then a real test */
  if (pushBusy) return; pushMsg = '';
  let pw = ''; /* the designer's page with no code of its own yet: the password typed in the box, read before anything is awaited */
  if (PUSH_DEV && !pushToken()) { pw = ($('#rm-ppw') || {}).value || ''; if (!pw) { pushMsg = 'اكتب كلمة مرور المطوّر الأول.'; render(); return; } }
  try {
    if (Notification.permission !== 'granted') { const p = await Notification.requestPermission(); if (p !== 'granted') { pushMsg = 'لازم تسمح بالإشعارات علشان التنبيه يشتغل.'; return; } } /* first await: iPhone wants it straight from the tap */
    if (pw) { try { pushLsSet(PUSH_K.tk, await pushDevMint(pw)); } catch (e) { pushMsg = ({ wait: 'جرّبت كلمات كتير غلط. حاول بعد نص دقيقة.', crypto: 'التشفير غير متاح في هذه الصفحة. افتحها من رابط https.' })[e && e.message] || 'كلمة مرور المطوّر غير صحيحة.'; return; } }
    pushBusy = true; render();
    await pushSub(true); pushLsSet(PUSH_K.on, '1'); pushStat.dead = false; pushSig = ''; pushRetry = 0; pushBusy = false;
    await pushWatch(true);
    if (pushStat.err) { pushMsg = pushWhy(pushStat.err); if (pushStat.err !== 'net') pushLsSet(PUSH_K.on, '0'); return; }
    toast('تم تفعيل التنبيه', 'ok'); pushMsg = await pushTest(true);
  } catch (e) {
    pushLsSet(PUSH_K.on, '0'); const m = e && e.message;
    pushMsg = m === 'nopush' || m === 'net' || m === 'sw' ? pushWhy(m) : e && e.name === 'NotAllowedError' ? 'الإشعارات محظورة للموقع ده من إعدادات المتصفح.' : e && e.name === 'AbortError' ? 'خدمة الإشعارات بتاعة المتصفح مش متاحة دلوقتي. جرّب تاني. ولو بتستخدم Brave فعّل من إعداداته «Use Google services for push messaging».' : pushWhy('');
  } finally { pushBusy = false; render(); }
}
async function pushUnsub() { try { const reg = await pushGetReg(), sub = reg && await reg.pushManager.getSubscription(); if (sub) await sub.unsubscribe(); } catch (e) { /* nothing to drop */ } }
async function pushForget() { /* the person leaves with «خروج»: this device stops getting alarms (the server forgets it, the worker's copy of the names is emptied) */
  if (!pushIsOn()) return;
  pushLsSet(PUSH_K.on, '0');
  const jobs = [pushCall({ a: 'punreg', d: pushDev() }, 2500).catch(() => 0), pushIdbSet('sched', { v: 1, lang: LANG, ent: [], at: Date.now() }).catch(() => 0), pushUnsub()];
  await Promise.race([Promise.all(jobs), new Promise(r => setTimeout(r, 3000))]); /* never holds the exit for long */
}
async function pushDisable() {
  pushLsSet(PUSH_K.on, '0'); pushMsg = ''; pushBusy = true; render();
  try { await pushCall({ a: 'punreg', d: pushDev() }, 8000); } catch (e) { /* the server forgets it when the push service says it is gone */ }
  await pushUnsub();
  try { await pushIdbSet('sched', { v: 1, lang: LANG, ent: [], at: Date.now() }); } catch (e) { /* ignore */ }
  pushBusy = false; pushSig = ''; pushStat.n = 0; toast('تم إيقاف التنبيه على الجهاز ده', 'ok'); render();
}
async function pushTest(quiet) { /* the server sends one push now: a real notice should appear, even if the phone is locked */
  try {
    await pushIdbSet('test', Date.now());
    let r = await pushCall({ a: 'ptest', d: pushDev() }, 20000);
    if (r && r.e === 'unknown') { await pushWatch(true); r = await pushCall({ a: 'ptest', d: pushDev() }, 20000); }
    if (r && r.e === 'rate') return 'استنى 15 ثانية وجرّب تاني.';
    if (!r || !r.ok) return pushWhy(r && r.e === 'nopush' ? 'nopush' : '');
    if (r.c >= 200 && r.c < 300) return 'اتبعت إشعار تجريبي للجهاز. لو ما ظهرش خلال ثواني راجع إعدادات الإشعارات للمتصفح (أو للبرنامج لو مضاف للشاشة الرئيسية) وإعدادات النظام: وضع عدم الإزعاج أو التركيز، وتوفير البطارية.';
    if (r.c === 404 || r.c === 410) { /* the push service forgot this device's address: make a new one and sync again */
      try { const o = await pushSub(false); if (o) await o.unsubscribe(); await pushSub(true); pushSig = ''; pushRetry = 0; await pushWatch(true); } catch (e) { /* the button can be pressed again */ }
      return 'خدمة الإشعارات رفضت العنوان القديم للجهاز فاتجدّد. جرّب الإشعار تاني.';
    }
    if (r.c === 400 || r.c === 401 || r.c === 403) return 'خدمة الإشعارات رفضت السيرفر. كلّم المصمم علشان يراجع مفاتيح الإشعارات.';
    return r.c ? `خدمة الإشعارات في المتصفح مش بترد دلوقتي (${r.c}). جرّب بعد شوية.` : 'خدمة الإشعارات في المتصفح مش بترد دلوقتي. جرّب بعد شوية.';
  } catch (e) { return pushWhy('net'); }
}

/* ----- the panel on the alarms screen ----- */
function pushPanelHtml() {
  const why = pushCan(); if (why === 'nocode') return ''; /* the demo / the designer's page: not offered */
  const on = pushIsOn() && !why && window.Notification && Notification.permission === 'granted', busy = pushBusy;
  let note = '';
  if (why === 'ios' && PUSH_DEV) note = 'في الآيفون لازم تضيف نسختك للشاشة الرئيسية الأول: افتح الصفحة في Safari واضغط زر المشاركة ثم «إضافة إلى الشاشة الرئيسية»، بعدين افتحها من الأيقونة الجديدة وادخل بكلمة المرور، وفعّل التنبيه من هنا. (محتاج iOS 16.4 أو أحدث)';
  else if (why === 'ios') note = 'في الآيفون لازم تضيف البرنامج للشاشة الرئيسية الأول: افتح الصفحة في Safari واضغط زر المشاركة ثم «إضافة إلى الشاشة الرئيسية»، بعدين افتح البرنامج من الأيقونة الجديدة وادخل بالكود، وفعّل التنبيه من هنا. (محتاج iOS 16.4 أو أحدث)';
  else if (why === 'nosw') note = 'التنبيه ما بيشتغلش في نافذة التصفح الخاص (Private / Incognito) ولا لو الصفحة مفتوحة كملف من الجهاز. افتح البرنامج من رابطه في نافذة عادية.';
  else if (why) note = 'المتصفح ده مش بيدعم تنبيهات الخلفية. استخدم Chrome أو Edge أو Firefox، أو Safari (على الماك 13 أو أحدث، وعلى الآيفون بعد إضافة البرنامج للشاشة الرئيسية).';
  else if (Notification.permission === 'denied') note = 'الإشعارات محظورة للموقع ده. افتح إعدادات الموقع في المتصفح واسمح بالإشعارات وبعدين ارجع هنا.';
  const st = on ? (pushStat.dead ? 'متوقف: الكود ده انتهى أو اتوقّف.' : pushStat.err && pushStat.err !== 'net' ? pushWhy(pushStat.err) : pushStat.at ? `شغّال على الجهاز ده. المواعيد المسجّلة: ${pushStat.n}. افتح البرنامج مرة في الأسبوع على الأقل علشان المواعيد تتجدد.` : 'شغّال على الجهاز ده. بيتم تسجيل المواعيد…') : '';
  return `<section class="panel" id="rm-push"><h3 style="margin:0 0 6px">تنبيه حتى لو الشاشة مقفولة</h3>
    <p class="muted" style="margin:0 0 10px">المنبّه بيوصلك كإشعار عادي على الجهاز (موبايل أو لابتوب أو كمبيوتر) زي الواتساب: فوق الشاشة وفي شاشة القفل أو مركز الإشعارات وبصوت الإشعارات، حتى لو الشاشة مقفولة أو الصفحة مقفولة. لما تدوس عليه البرنامج بيفتح على شاشة المنبّه. اسم المنبّه مش بيطلع من جهازك، بس المواعيد بتتبعت للسيرفر.</p>
    ${pushPhone || why ? '' : '<p class="lbl" id="rm-pdesk" style="margin:0 0 8px">على الكمبيوتر: المتصفح لازم يكون شغّال في الخلفية علشان الإشعار يوصل (ممكن من غير أي نافذة مفتوحة)، وSafari على الماك بيوصله الإشعار حتى لو مقفول. في Chrome وEdge على ويندوز سيب إعداد «متابعة تشغيل التطبيقات في الخلفية» شغّال.</p>'}
    ${note ? `<p class="lbl" style="margin:0 0 8px">${note}</p>` : ''}
    ${st ? `<p class="lbl" id="rm-pst" style="margin:0 0 8px">${st}</p>` : ''}
    ${on ? '<p class="lbl" id="rm-plag" style="margin:0 0 8px" hidden></p>' : ''}
    ${pushMsg ? `<p class="lbl" id="rm-pmsg" style="margin:0 0 8px">${esc(pushMsg)}</p>` : ''}
    ${PUSH_DEV && !why && !on && !pushToken() ? '<div class="field" style="max-width:320px;margin:0 0 10px"><label for="rm-ppw">كلمة مرور المطوّر (مرة واحدة على الجهاز ده)</label><input id="rm-ppw" class="inp" type="password" dir="ltr" autocomplete="off"></div>' : ''}
    ${why ? '' : `<div class="actions" style="justify-content:flex-start">${on ? `<button class="btn outline" id="rm-ptest" type="button"${busy ? ' disabled' : ''}>جرّب إشعار الآن</button><button class="btn ghost" id="rm-poff" type="button"${busy ? ' disabled' : ''}>إيقاف</button>` : `<button class="btn" id="rm-pon" type="button"${busy || Notification.permission === 'denied' ? ' disabled' : ''}>${busy ? 'جاري التفعيل…' : 'فعّل التنبيه على الجهاز ده'}</button>`}</div>`}
  </section>`;
}
function pushPanelWire(v) {
  const on = $('#rm-pon', v), off = $('#rm-poff', v), ts = $('#rm-ptest', v);
  pushCalibShow();
  if (on) on.onclick = () => pushEnable();
  if (off) off.onclick = () => pushDisable();
  if (ts) ts.onclick = async () => { pushMsg = 'بيتم الإرسال…'; render(); pushMsg = await pushTest(); render(); };
}
