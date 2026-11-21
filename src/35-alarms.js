/* ---------- Alarms: sounds and messages at the times he sets (they ring while the program is open) ---------- */
const ALARM_SOUNDS = { bell: 'جرس', beep: 'صفارة رقمية', chime: 'رنين هادئ' };
const ALARM_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const ALARM_WINDOW = 10; /* minutes after the set time during which the alarm still rings; later than that it is only listed as missed */
const ALARM_LOOP_MS = 2400, ALARM_MAX_MS = 60000;
const ALARM_LATER = [[5, '5 دقائق'], [10, '10 دقائق'], [15, '15 دقيقة'], [30, '30 دقيقة'], [60, 'ساعة'], [120, 'ساعتين']]; /* "remind me after …" choices on the ringing window */
let alarmRing = null; /* the one that is ringing now: { ids, loop, stop } */
const alarmSnooze = {}; /* reminder id -> time (ms) it rings again (also kept on the reminder as r.snz, so a "remind me" survives closing the program) */
const alarmSnzOf = r => alarmSnooze[r.id] || r.snz || 0;
const alarmSnzSet = (r, ts) => { alarmSnooze[r.id] = ts; r.snz = ts; };
const alarmSnzClear = r => { delete alarmSnooze[r.id]; delete r.snz; };
const alarmHM = d => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');

const alarmMin = t => +t.slice(0, 2) * 60 + +t.slice(3);
const alarmOkTime = t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t || '');
const ALARM_PM = () => LANG === 'en' ? ['AM', 'PM'] : ['ص', 'م'];
const alarmT12 = t => { if (!alarmOkTime(t)) return t || ''; const h = +t.slice(0, 2); return (h % 12 || 12) + ':' + t.slice(3) + ' ' + ALARM_PM()[h < 12 ? 0 : 1]; }; /* '22:00' -> '10:00 م' : the time is always shown with ص (morning) or م (evening) */
const alarmDay = (r, now) => r.date ? r.date === ymd(now) : (!r.days || !r.days.length || r.days.includes(now.getDay())); /* does it apply on this day? */
const alarmRepeat = r => r.date ? 'مرة واحدة ' + r.date : (!r.days || !r.days.length || r.days.length === 7) ? 'كل يوم' : r.days.slice().sort().map(d => '<span>' + ALARM_DAYS[d] + '</span>').join(' · '); /* html: each day is its own piece so English mode can translate it */
function alarmCtx() { /* one shared audio context (the click sound uses the same); a browser lets it sound only after the user has touched the page once */
  try {
    const A = window.AudioContext || window.webkitAudioContext; if (!A) return null;
    if (AC && AC.state === 'closed') AC = null;
    AC = AC || new A();
    if (AC.state !== 'running') { const p = AC.resume(); if (p && p.catch) p.catch(() => { /* still locked: the next touch tries again */ }); } /* 'suspended' (not touched yet) and Safari's 'interrupted' (a call, another app) */
    return AC;
  } catch (e) { return null; }
}
/* iPhone / iPad (Safari and every browser there): the alarm must reach him as a PLAIN notification, like WhatsApp or Telegram (the phone's own notification sound, banner and lock screen),
   which only the push worker (tools/sw.js) can do. The page itself never plays an <audio> element and never asks for a "playback" audio session there: iOS shows both as a music player
   on the lock screen (Now Playing) and keeps the page alive in the background to play them. A page that is in front rings with the Web Audio tones only. */
const alarmIOS = (() => { try { return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); } catch (e) { return false; } })();
const alarmSoundOk = () => !!(AC && AC.state === 'running'); /* can an alarm be heard now (no touch needed any more)? */
const alarmAudio = () => { const A = window.AudioContext || window.webkitAudioContext; return !A ? 'none' : alarmSoundOk() ? 'ok' : 'locked'; };
const alarmAllOk = () => alarmSoundOk(); /* nothing left to unlock */
const ALARM_NOTES = { /* [Hz, start s, length s, wave, volume] : the three sounds (used by the Web Audio tones and by the WAV) */
  bell: [0, 0.55, 1.1].flatMap(a => [[1318, a, 0.8, 'sine', 0.3], [2637, a, 0.5, 'sine', 0.1]]),
  beep: [0, 0.32, 0.64].map(a => [1000, a, 0.2, 'square', 0.16]),
  chime: [[880, 0], [1175, 0.3], [1568, 0.6]].map(([f, a]) => [f, a, 1, 'sine', 0.3])
};
function alarmSession(on) { /* Safari desktop / Android: Web Audio is muted by the silent switch unless the page says it is "playback"; set only while an alarm sounds so the click ticks never stop the person's music. Never on iPhone (it would show a music player) */
  if (alarmIOS) return;
  try { if (navigator.audioSession) navigator.audioSession.type = on ? 'playback' : 'auto'; } catch (e) { /* not supported */ }
}
function alarmUnlock() { /* called from a real touch / click / key: makes the context run and plays one silent sample (what Safari and iOS want) */
  const ac = alarmCtx();
  if (ac) { try { const s = ac.createBufferSource(); s.buffer = ac.createBuffer(1, 1, 22050); s.connect(ac.destination); s.start(0); } catch (e) { /* ignore */ } }
}
function alarmBeeps(kind, touched) { /* one round of the chosen sound. touched = called from a real tap (a test button): the sound also works with the iPhone silent switch, and it waits for the context to open */
  if (touched) { alarmSession(true); setTimeout(() => { if (!alarmRing) alarmSession(false); }, 4000); }
  alarmTones(kind, touched);
}
function alarmTones(kind, touched) { /* the Web Audio API version (no audio files) */
  const ac = alarmCtx(); if (!ac) return;
  if (ac.state !== 'running') { /* never queue tones on a locked context: they would all sound at once the moment it opens */
    if (touched) { try { ac.resume().then(() => { if (ac.state === 'running') alarmTones(kind); }).catch(() => { /* blocked */ }); } catch (e) { /* ignore */ } }
    return;
  }
  try {
    const t0 = ac.currentTime + 0.03;
    (ALARM_NOTES[kind] || ALARM_NOTES.bell).forEach(([f, at, dur, type, vol]) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur); o.connect(g); g.connect(ac.destination); o.start(t0 + at); o.stop(t0 + at + dur + 0.05); });
  } catch (e) { /* no audio: stay silent */ }
}
function alarmStop() {
  if (!alarmRing) return;
  clearInterval(alarmRing.loop); clearTimeout(alarmRing.stop); clearInterval(alarmRing.flash);
  try { document.title = alarmRing.t0; } catch (e) { /* ignore */ }
  try { if (navigator.vibrate) navigator.vibrate(0); } catch (e) { /* ignore */ }
  alarmRing = null; alarmSession(false);
}
const alarmDone = (r, day) => { r.last = day; if (r.date) r.on = false; }; /* rang (or missed): not again today; a one-day alarm switches itself off */

/* ----- collection alarms: tied to a customer and/or an invoice that still has money owed on it ----- */
function alarmInv(id) { /* the live invoice behind a saved id: an invoice that was edited is cancelled and replaced by a new one, so follow it */
  let i = db.invoices.find(x => x.id === id);
  for (let n = 0; i && i.status === 'void' && i.replacedBy && n < 5; n++) { const no = i.replacedBy, nx = db.invoices.find(x => x.no === no); if (!nx) break; i = nx; }
  return i || null;
}
function alarmLive(r) { /* null for an ordinary alarm; for a collection alarm: what is still owed right now */
  if (!r.cust && !r.inv) return null;
  const c = r.cust ? db.customers.find(x => x.id === r.cust) : null, i = r.inv ? alarmInv(r.inv) : null;
  const iLeft = i ? invLeft(i) : 0, cLeft = c ? customerDebt(c.id) : 0;
  return { c, i, iLeft, cLeft, name: c ? c.name : i ? i.name : '', left: r.inv ? iLeft : cLeft };
}
function alarmLiveHtml(r) {
  const L = alarmLive(r); if (!L) return '';
  const owed = L.left > 0 ? `<span>المتبقي:</span> <b>${money(L.left)}</b>` : '<span>تم السداد</span>';
  const tot = r.inv && L.c && L.cLeft > L.iLeft ? ` — <span>إجمالي دين العميل:</span> <b>${money(L.cLeft)}</b>` : '';
  return `<small class="muted">${L.name ? `<bdi>${esc(L.name)}</bdi> — ` : ''}${owed}${tot}</small>`;
}
function alarmCollect(cust, inv) { /* "collection alarm" button on an invoice / customer / debts row */
  const c = cust ? db.customers.find(x => x.id === cust) : null, i = inv ? db.invoices.find(x => x.id === inv) : null, nm = c ? c.name : i ? i.name : '', t = new Date(); t.setDate(t.getDate() + 1);
  alarmForm(null, { cust: cust || '', inv: inv || '', title: nm ? `تحصيل من ${nm}` : 'تحصيل', time: '10:00', date: ymd(t) });
}

/* the ringing window: the sound repeats until he answers (or a minute passes). He can cancel it ("إلغاء"), or "ذكّرني" — pick how long
   until it rings again (5 min … 2 hours, tomorrow at its own time, or an exact time written with ص / م). A reminder is kept on the alarm itself. */
function alarmShow(due, missed) {
  if (alarmRing) return;
  const all = due.concat(missed), kind = due.length ? (due[0].sound || 'bell') : '';
  const row = r => { const L = alarmLive(r), go1 = L && (L.c || L.i) ? `<button class="mini" type="button" data-gc="${esc(L.c ? 'c:' + L.c.id : 'i:' + L.i.id)}">فتح الحساب</button>` : '', gw = L && L.c && L.c.phone && L.left > 0 ? `<button class="mini" type="button" data-gw="${esc(L.c.id)}">تذكير العميل واتساب</button>` : '';
    return `<p class="ring-t"><b dir="ltr">${esc(alarmT12(r.time))}</b> — ${esc(r.title || 'منبّه')}</p>${L ? `<p class="ring-s">${alarmLiveHtml(r)}${go1}${gw}</p>` : ''}`; };
  const muted = due.length && !alarmIOS && !alarmSoundOk(); /* iPhone: the sound is the notification's own, no "turn sound on" nag */
  const nx = new Date(Date.now() + 3600000); nx.setMinutes(Math.ceil(nx.getMinutes() / 5) * 5, 0, 0); /* the exact-time box starts an hour from now */
  const close = modal(`<h3 class="ring-h">${ICON.bell}<span>${due.length ? 'منبّه' : 'فاتتك هذه المنبّهات'}</span></h3>
    ${due.map(row).join('')}
    ${missed.length && due.length ? `<p class="muted"><small>وفاتك قبلها:</small></p>${missed.map(row).join('')}` : (!due.length ? missed.map(row).join('') : '')}
    ${muted ? '<p class="muted" data-mute><small>المتصفح منع الصوت لحد ما تلمس الصفحة. اضغط «شغّل الصوت».</small></p>' : ''}
    <div class="actions">${muted ? '<button class="btn" type="button" data-snd>شغّل الصوت</button>' : ''}<button class="btn${muted ? ' outline' : ''}" data-ok>إلغاء</button><button class="btn outline" type="button" data-snz>ذكّرني…</button></div>
    <div class="ring-snz" hidden>
      <p class="lbl">ذكّرني بعد:</p>
      <div class="ring-chips">${ALARM_LATER.map(([m, n]) => `<button class="mini" type="button" data-m="${m}">${n}</button>`).join('')}<button class="mini" type="button" data-tm>غداً</button></div>
      <p class="lbl">أو في وقت محدد:</p>
      <div class="ring-at">${alarmClockHTML(alarmHM(nx), 'rs')}<button class="btn" type="button" data-at>تأكيد</button></div>
    </div>`, (d, close) => {
    const done = () => { alarmStop(); close(); };
    $('[data-ok]', d).onclick = done;
    const snd = $('[data-snd]', d); if (snd) snd.onclick = () => { alarmBeeps(kind, true); const shut = () => { if (alarmAudio() === 'ok') { snd.hidden = true; const m = $('[data-mute]', d); if (m) m.hidden = true; } }; setTimeout(shut, 400); setTimeout(shut, 1400); };
    $$('[data-gc]', d).forEach(b => b.onclick = () => { const [k, id] = b.dataset.gc.split(':'); done(); go(k === 'c' ? 'custDetail' : 'invDetail', { id }); });
    $$('[data-gw]', d).forEach(b => b.onclick = () => { const c = db.customers.find(x => x.id === b.dataset.gw); done(); if (c) waRemind(c); }); /* the same reminder message as on the customer's page */
    const panel = $('.ring-snz', d), readAt = alarmClockWire(d, 'rs');
    $('[data-snz]', d).onclick = () => { panel.hidden = !panel.hidden; if (!panel.hidden) alarmStop(); }; /* he is answering: the sound stops while he chooses */
    const remind = at => { const now = new Date(); all.forEach(r => alarmSnzSet(r, at(r, now))); save(); alarmPushSoon();
      const t = new Date(alarmSnzOf(all[0])), lbl = alarmT12(alarmHM(t));
      toast(ymd(t) === ymd(now) ? `هذكّرك الساعة ${lbl}` : `هذكّرك غداً الساعة ${lbl}`, 'ok'); done(); if (document.querySelector('.rem-time')) render(); };
    $$('[data-m]', d).forEach(b => b.onclick = () => remind((r, now) => now.getTime() + +b.dataset.m * 60000));
    $('[data-tm]', d).onclick = () => remind((r, now) => { const x = new Date(now), m = alarmOkTime(r.time) ? alarmMin(r.time) : 540; x.setDate(x.getDate() + 1); x.setHours(Math.floor(m / 60), m % 60, 0, 0); return x.getTime(); });
    $('[data-at]', d).onclick = () => { const t = readAt(); if (!t) return toast('اكتب الوقت');
      remind((r, now) => { const x = new Date(now); x.setHours(+t.slice(0, 2), +t.slice(3), 0, 0); if (x.getTime() <= now.getTime()) x.setDate(x.getDate() + 1); return x.getTime(); }); };
  }, () => alarmStop());
  if (due.length) {
    const r0 = alarmRing = { ids: due.map(r => r.id), loop: null, stop: null, flash: null, t0: document.title, close };
    const buzz = () => { try { if (navigator.vibrate) navigator.vibrate([600, 250, 600, 250, 600]); } catch (e) { /* no vibration here */ } }; /* phones: the sound may be blocked, the buzz and the flashing tab title still tell him */
    if (typeof pushClear === 'function') pushClear();
    alarmSession(true); alarmBeeps(kind); buzz(); r0.loop = setInterval(() => { alarmBeeps(kind); buzz(); }, ALARM_LOOP_MS);
    const ttl = '🔔 ' + alarmT12(due[0].time); let blink = false; r0.flash = setInterval(() => { blink = !blink; try { document.title = blink ? ttl : r0.t0; } catch (e) { /* ignore */ } }, 1000);
    r0.stop = setTimeout(alarmStop, ALARM_MAX_MS);
    try { /* a system notice too when the program is in the background */
      if ((document.hidden || (document.hasFocus && !document.hasFocus())) && window.Notification && Notification.permission === 'granted') {
        const n = new Notification('منبّه', { body: due.map(r => alarmT12(r.time) + ' — ' + (r.title || 'منبّه')).join('\n') + '\nافتح البرنامج للإلغاء أو التذكير', tag: 'alarm', requireInteraction: true, silent: true });
        n.onclick = () => { try { window.focus(); n.close(); } catch (e) { /* ignore */ } };
      }
    } catch (e) { /* no system notice */ }
  }
}
function alarmTick(now = new Date()) { /* looks at the alarms every few seconds */
  if (alarmRing || !Array.isArray(db.reminders) || !db.reminders.length) return;
  if (document.hidden && (alarmIOS || (typeof pushHands === 'function' && pushHands()))) return; /* iPhone, screen off or another app in front: the page can neither sound nor show a notice, and ringing now would only take the push notice away. On every other device the same hand-over happens while the push notice is switched on and working (src/39-push.js, pushHands). The alarm stays due and rings the moment the program is opened (the notice's tap does that) */
  const today = ymd(now), nm = now.getHours() * 60 + now.getMinutes(), due = [], missed = [], again = new Set(); let changed = false;
  db.reminders.forEach(r => {
    const sn = alarmSnzOf(r); let list;
    if (sn) { if (now.getTime() < sn) return; alarmSnzClear(r); changed = true; list = now.getTime() - sn <= ALARM_WINDOW * 60000 ? due : missed; again.add(r.id); } /* a snoozed alarm rings again even if it was a one-time alarm that switched itself off, and it never touches "last" (that belongs to its real day) */
    else {
      if (!r.on || !alarmOkTime(r.time)) return;
      if (r.last === today || !alarmDay(r, now)) return;
      const tm = alarmMin(r.time); if (nm < tm) return;
      list = nm - tm <= ALARM_WINDOW ? due : missed;
    }
    const L = alarmLive(r);
    if (L && L.left <= 0) { r.on = false; r.last = today; changed = true; return; } /* already paid: nothing to remind about */
    list.push(r);
  });
  if (!due.length && !missed.length) { if (changed) { save(); alarmPushSoon(); } return; }
  due.concat(missed).forEach(r => { if (!again.has(r.id)) alarmDone(r, today); }); save(); alarmPushSoon();
  alarmShow(due, missed);
}
/* keeps the screen on while he asked for it (phones / laptops left open) and at least one alarm is on: a sleeping screen stops the page, so nothing rings */
let alarmWakeLock = null;
const alarmPending = (now = new Date()) => (db.reminders || []).some(r => alarmSnzOf(r) || (r.on && alarmOkTime(r.time) && r.last !== ymd(now) && alarmDay(r, now))); /* something still to ring today (or a "remind me" waiting) */
const alarmKeepOn = () => { try { return localStorage.getItem('rm.keepawake') === '1'; } catch (e) { return false; } };
async function alarmWake() {
  try {
    const want = alarmKeepOn() && !document.hidden && alarmPending();
    if (!want) { const w = alarmWakeLock; alarmWakeLock = null; if (w) await w.release(); return; }
    if (alarmWakeLock || !navigator.wakeLock) return;
    const w = await navigator.wakeLock.request('screen'); alarmWakeLock = w;
    w.addEventListener('release', () => { if (alarmWakeLock === w) alarmWakeLock = null; }); /* the system took it back (page hidden, low battery): asked again when the page is back */
  } catch (e) { alarmWakeLock = null; }
}
const alarmPushSoon = () => { if (typeof pushSoon === 'function') pushSoon(); };
const alarmPush = () => { if (typeof pushWatch === 'function') pushWatch(); }; /* keeps the phone's alarm list at the server in step (tools/sw.js, src/39-push.js) */
setInterval(() => { alarmTick(); alarmWake(); alarmPush(); }, 10000);
setTimeout(() => { alarmTick(); alarmWake(); alarmPush(); }, 2500);
const alarmBack = () => { if (!document.hidden) { alarmTick(); alarmWake(); alarmPush(); if (typeof pushClear === 'function') pushClear(); } else alarmPush(); }; /* the page is back (tab shown, phone woken, laptop opened): look at once, timers sleep in the background */
document.addEventListener('visibilitychange', alarmBack);
document.addEventListener('resume', alarmBack);
['focus', 'pageshow', 'online'].forEach(ev => window.addEventListener(ev, alarmBack));
/* the first real touch / click / key lets the page make sound. Safari and iOS accept only some of these (touchend, click), Chrome any of them, so listen to all */
['pointerdown', 'pointerup', 'touchend', 'mouseup', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, () => { if (alarmAllOk()) return; if ((db.reminders || []).some(r => r.on || alarmSnzOf(r))) alarmUnlock(); }, { capture: true, passive: true }));

/* ---------- the screen ---------- */
screens.reminders = (p, v) => {
  const L = (db.reminders || []).slice().sort((a, b) => a.time.localeCompare(b.time));
  const rows = L.map(r => `<tr${r.on ? '' : ' class="rem-off"'}>
    <td data-l="الوقت"><span class="rem-time" dir="ltr">${esc(alarmT12(r.time))}</span></td>
    <td data-l="الرسالة">${esc(r.title || 'منبّه')}${alarmLiveHtml(r) ? '<br>' + alarmLiveHtml(r) : ''}${alarmSnzHtml(r)}</td>
    <td data-l="التكرار" class="muted">${alarmRepeat(r)}</td>
    <td data-l="الصوت" class="muted">${esc(ALARM_SOUNDS[r.sound] || ALARM_SOUNDS.bell)}</td>
    <td data-l="تشغيل"><label class="chk"><input type="checkbox" data-on="${esc(r.id)}"${r.on ? ' checked' : ''}><i>${ICON.check}</i><span>${r.on ? 'شغّال' : 'موقوف'}</span></label></td>
    <td data-l="إجراء"><div class="actions" style="justify-content:center;gap:6px"><button class="mini" data-edit="${esc(r.id)}">تعديل</button><button class="mini" data-del="${esc(r.id)}">حذف</button></div></td></tr>`).join('');
  v.innerHTML = subHead('المنبّهات') + `<div class="stack">
    <section class="panel">
      <p class="muted" style="margin:0 0 12px">اكتب الوقت والرسالة، وهيرنّ البرنامج بصوت في الميعاد وتظهر لك الرسالة. بيرنّ طول ما البرنامج مفتوح (المتصفح أو برنامج سطح المكتب) والجهاز شغّال؛ لو كان مقفولاً هتظهر لك المنبّهات اللي فاتتك أول ما تفتحه.</p>
      <p class="muted" style="margin:0 0 12px">على الموبايل: سيب صفحة البرنامج مفتوحة قدامك وفعّل «إبقاء الشاشة مفتوحة» تحت، لأن المتصفح بيوقّف الصفحة لما الشاشة تتقفل. والأفضل على أي جهاز (آيفون أو أندرويد أو لابتوب أو كمبيوتر) تفعّل «تنبيه حتى لو الشاشة مقفولة» تحت: المنبّه بيوصلك كإشعار عادي زي الواتساب بصوت الإشعارات، وتدوس عليه يفتح البرنامج على شاشة المنبّه (وعلى الآيفون اتأكد إن مفتاح الصامت مقفول).</p>
      <div class="actions" style="justify-content:flex-start"><button class="btn" id="rm-add" type="button">${ICON.plus}<span>منبّه جديد</span></button><button class="btn outline" id="rm-test" type="button">جرّب الصوت</button>${window.Notification && Notification.permission === 'default' ? '<button class="btn ghost" id="rm-notif" type="button">السماح بإشعارات النظام</button>' : ''}</div>
      <p class="lbl" id="rm-state" style="margin:12px 0 0"></p>
      <p class="lbl" id="rm-ntf" style="margin:6px 0 0"></p>
      ${navigator.wakeLock ? '<label class="chk" style="margin-top:10px"><input type="checkbox" id="rm-wake"><i>' + ICON.check + '</i><span>إبقاء الشاشة مفتوحة طول ما فيه منبّه شغّال</span></label>' : ''}
    </section>
    ${typeof pushPanelHtml === 'function' ? pushPanelHtml() : ''}
    <section class="panel">${L.length ? `<div class="tbl-wrap"><table class="grid cardt"><thead><tr><th>الوقت</th><th>الرسالة</th><th>التكرار</th><th>الصوت</th><th>تشغيل</th><th>إجراء</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="none">لا توجد منبّهات بعد. اضغط «منبّه جديد».</div>'}</section>
  </div>`;
  if (typeof pushPanelWire === 'function') pushPanelWire(v);
  const st = $('#rm-state'); alarmCtx();
  const stateTxt = () => { const a = alarmAudio(); return a === 'none' ? 'هذا المتصفح لا يدعم الصوت.' : a === 'ok' ? 'الصوت جاهز.' : 'اضغط «جرّب الصوت» مرة لتفعيل الصوت في هذا المتصفح.'; };
  if (st) st.textContent = stateTxt();
  const nt = $('#rm-ntf'); if (nt) nt.textContent = !window.Notification ? 'إشعارات النظام غير متاحة في هذا المتصفح، فالمنبّه بيظهر جوه الصفحة بس.' : Notification.permission === 'denied' ? 'إشعارات النظام محظورة من إعدادات المتصفح.' : '';
  const wk = $('#rm-wake'); if (wk) { wk.checked = alarmKeepOn(); wk.onchange = async () => { try { localStorage.setItem('rm.keepawake', wk.checked ? '1' : '0'); } catch (e) { /* no storage */ } await alarmWake(); toast(!wk.checked ? 'تم إيقاف إبقاء الشاشة مفتوحة' : alarmWakeLock ? 'الشاشة هتفضل مفتوحة طول ما فيه منبّه شغّال' : 'هتشتغل أول ما يكون فيه منبّه شغّال', 'ok'); }; }
  $('#rm-add').onclick = () => alarmForm();
  $('#rm-test').onclick = () => { alarmBeeps('bell', true); setTimeout(() => { const s = $('#rm-state'); if (s) s.textContent = alarmAudio() === 'ok' ? 'الصوت جاهز.' : 'الصوت غير مفعّل في هذا المتصفح.'; }, 600); };
  const nb = $('#rm-notif'); if (nb) nb.onclick = () => { try { Notification.requestPermission().then(() => render()); } catch (e) { /* not supported */ } };
  $$('[data-edit]', v).forEach(b => b.onclick = () => alarmForm(db.reminders.find(x => x.id === b.dataset.edit)));
  $$('[data-del]', v).forEach(b => b.onclick = async () => { const r = db.reminders.find(x => x.id === b.dataset.del); if (!r || !await confirmBox('', `حذف المنبّه «${r.title || alarmT12(r.time)}»؟`, 'حذف')) return; db.reminders = db.reminders.filter(x => x.id !== r.id); delete alarmSnooze[r.id]; logA('rem_del', r.title, alarmT12(r.time)); save(); alarmPushSoon(); render(); toast('تم حذف المنبّه', 'ok'); });
  $$('[data-on]', v).forEach(c => c.onchange = () => {
    const r = db.reminders.find(x => x.id === c.dataset.on); if (!r) return; r.on = c.checked; alarmArm(r); save(); alarmPushSoon(); render();
  });
};
function alarmSnzHtml(r) { /* "it will remind you at …" under an alarm he asked to be reminded about */
  const s = alarmSnzOf(r); if (!s || s <= Date.now()) return ''; const t = new Date(s);
  return `<br><small class="muted"><span>${ymd(t) === ymd(new Date()) ? 'سيذكّرك الساعة' : 'سيذكّرك غداً الساعة'}</span> <bdi dir="ltr">${alarmT12(alarmHM(t))}</bdi></small>`;
}
function alarmArm(r, now = new Date()) { /* after a change: it rings on its next time, not at once for a time that has already passed today */
  r.last = alarmDay(r, now) && r.on && alarmMin(r.time) <= now.getHours() * 60 + now.getMinutes() ? ymd(now) : ''; alarmSnzClear(r);
}
/* the time box of an alarm: hours : minutes and a ص / م button (always the 12-hour clock, so the morning/evening he picks is written next to it).
   Typed like the notebook: 8 -> 08; 13–23 is taken as evening; ص or م typed (or a tap on the button) picks morning/evening */
function alarmClockHTML(t, p = 'rm') {
  const ok = alarmOkTime(t), h = ok ? +t.slice(0, 2) : -1, d2 = x => String(x).padStart(2, '0'), P = ALARM_PM(), pv = P[h >= 12 ? 1 : 0];
  return `<div class="inp tbox rem-tbox" id="${p}-time" dir="ltr"><input class="tseg" id="${p}-h" inputmode="numeric" maxlength="2" placeholder="00" autocomplete="off" aria-label="الساعة" value="${ok ? d2(h % 12 || 12) : ''}"><span class="tcol">:</span><input class="tseg" id="${p}-m" inputmode="numeric" maxlength="2" placeholder="00" autocomplete="off" aria-label="الدقائق" value="${ok ? t.slice(3) : ''}"><button type="button" class="tseg tp" id="${p}-p" data-v="${pv}" aria-label="صباحاً أو مساءً">${pv}</button></div>`;
}
function alarmClockWire(d, p = 'rm') { /* returns a function that reads the box as 'HH:MM' ('' when no hour is written) */
  const hh = $('#' + p + '-h', d), mm = $('#' + p + '-m', d), pp = $('#' + p + '-p', d), P = ALARM_PM(), d2 = x => String(x).padStart(2, '0');
  const setP = i => { pp.dataset.v = P[i]; pp.textContent = P[i]; };
  const digits = el => { const v = toLat(el.value).replace(/\D/g, '').slice(0, 2); if (v !== el.value) el.value = v; };
  const fix = () => { /* hour: 13–23 means evening, 0 means 12 at night; more than that is not a time */
    if (hh.value !== '') { let n = +hh.value;
      if (n > 23) { toast('الساعة من 1 إلى 12 والدقائق من 0 إلى 59'); hh.value = ''; return; }
      if (n >= 13) { n -= 12; setP(1); } else if (n === 0) { n = 12; setP(0); }
      hh.value = d2(n); }
    if (mm.value !== '') { if (+mm.value > 59) { toast('الساعة من 1 إلى 12 والدقائق من 0 إلى 59'); mm.value = ''; return; } mm.value = d2(+mm.value); }
  };
  hh.oninput = () => { digits(hh); if (hh.value.length === 2 || +hh.value >= 2) { mm.focus(); mm.select(); } };
  mm.oninput = () => digits(mm);
  hh.onchange = mm.onchange = fix;
  [hh, mm].forEach(el => el.onmouseup = ev => { ev.preventDefault(); el.select(); });
  hh.onkeydown = ev => { if (ev.key === ':' || ev.key === '.' || ev.key === ' ') { ev.preventDefault(); mm.focus(); mm.select(); } };
  pp.onclick = () => setP(pp.dataset.v === P[0] ? 1 : 0);
  pp.onkeydown = ev => { const k = ev.key; if (k === 'Backspace') { ev.preventDefault(); mm.focus(); mm.select(); } else if (k === 'ص' || /^a$/i.test(k)) { ev.preventDefault(); setP(0); } else if (k === 'م' || /^p$/i.test(k)) { ev.preventDefault(); setP(1); } else if (k === 'ArrowUp' || k === 'ArrowDown') { ev.preventDefault(); pp.click(); } };
  return () => { fix(); const h = +hh.value, m = mm.value === '' ? 0 : +mm.value; if (hh.value === '' || !(h >= 1 && h <= 12) || !(m >= 0 && m <= 59)) return ''; return d2(h % 12 + (pp.dataset.v === P[1] ? 12 : 0)) + ':' + d2(m); };
}
function alarmForm(r, pre) {
  const edit = !!r, now = new Date(), cur = r || Object.assign({ id: uid(), title: '', time: '', days: [], date: '', sound: 'bell', on: true, last: '' }, pre || {}), linked = !!(cur.cust || cur.inv);
  const rep0 = cur.date ? 'once' : (cur.days && cur.days.length && cur.days.length < 7) ? 'days' : 'daily';
  modal(`<h3>${linked ? 'منبّه تحصيل' : edit ? 'تعديل المنبّه' : 'منبّه جديد'}</h3>
    ${linked ? `<p class="ring-s" style="margin:0 0 12px">${alarmLiveHtml(cur)}</p>` : ''}
    <div class="field"><label for="rm-title">الرسالة (اختياري)</label><input id="rm-title" class="inp" maxlength="80" autocomplete="off" placeholder="مثلاً: تحصيل الشيك، مكالمة المورد" value="${esc(cur.title)}"></div>
    <div class="field"><label for="rm-h">الوقت</label>${alarmClockHTML(cur.time)}</div>
    <div class="field"><label for="rm-rep">التكرار</label><div class="sel"><select id="rm-rep"><option value="daily">كل يوم</option><option value="days">أيام محددة</option><option value="once">مرة واحدة في تاريخ</option></select></div></div>
    <div class="field" id="rm-daysbox" hidden><div class="rem-days">${ALARM_DAYS.map((n, i) => `<label class="chk"><input type="checkbox" data-d="${i}"${(cur.days || []).includes(i) ? ' checked' : ''}><i>${ICON.check}</i><span>${n}</span></label>`).join('')}</div></div>
    <div class="field" id="rm-quick"${linked ? '' : ' hidden'}><div class="actions" style="gap:6px"><button class="mini" type="button" data-q="1">غداً</button><button class="mini" type="button" data-q="3">بعد 3 أيام</button><button class="mini" type="button" data-q="7">بعد أسبوع</button></div></div>
    <div class="field" id="rm-datebox" hidden><label for="rm-date">التاريخ</label><input id="rm-date" class="inp" type="date" dir="ltr" min="${ymd(now)}" value="${esc(cur.date)}"></div>
    <div class="field"><label for="rm-snd">الصوت</label><div style="display:flex;gap:8px;align-items:center"><div class="sel" style="flex:1"><select id="rm-snd">${Object.entries(ALARM_SOUNDS).map(([k, n]) => `<option value="${k}"${(cur.sound || 'bell') === k ? ' selected' : ''}>${n}</option>`).join('')}</select></div><button class="mini" type="button" id="rm-try">جرّب</button></div></div>
    <div class="actions"><button class="btn" data-ok>حفظ</button><button class="btn outline" data-no>رجوع</button></div>`, (d, close) => {
    const getTime = alarmClockWire(d);
    const rep = $('#rm-rep', d); rep.value = rep0;
    const sync = () => { $('#rm-daysbox', d).hidden = rep.value !== 'days'; $('#rm-datebox', d).hidden = rep.value !== 'once'; };
    rep.onchange = sync; sync();
    $$('[data-q]', d).forEach(b => b.onclick = () => { const t = new Date(); t.setDate(t.getDate() + +b.dataset.q); rep.value = 'once'; sync(); $('#rm-date', d).value = ymd(t); });
    $('#rm-try', d).onclick = () => alarmBeeps($('#rm-snd', d).value, true);
    $('[data-no]', d).onclick = close;
    $('[data-ok]', d).onclick = () => {
      const time = getTime(), kind = rep.value, days = $$('[data-d]', d).filter(x => x.checked).map(x => +x.dataset.d), date = $('#rm-date', d).value;
      if (!alarmOkTime(time)) return toast('اكتب الوقت');
      if (kind === 'days' && !days.length) return toast('اختر يوماً واحداً على الأقل');
      if (kind === 'once' && !date) return toast('اختر التاريخ');
      Object.assign(cur, { title: $('#rm-title', d).value.trim(), time, days: kind === 'days' ? days : [], date: kind === 'once' ? date : '', sound: $('#rm-snd', d).value, on: true });
      if (kind === 'once' && date === ymd(now) && alarmMin(time) < now.getHours() * 60 + now.getMinutes()) toast('الوقت عدّى النهارده، المنبّه لن يرنّ');
      if (!cur.title && linked) { const L = alarmLive(cur); cur.title = L && L.name ? `تحصيل من ${L.name}` : 'تحصيل'; }
      alarmArm(cur);
      try { if (window.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch (e) { /* not supported */ }
      if (!edit) { db.reminders = db.reminders || []; db.reminders.push(cur); }
      logA('rem_save', cur.title, alarmT12(cur.time)); save(); alarmPushSoon(); close(); render(); if (!edit) toast('تم حفظ المنبّه', 'ok');
    };
  });
}
