/* ---------- Real-program guard: the program only runs with a valid signed code (each code carries its own duration, or none = permanent).
   When the time is over or the designer stops the code, the program LOCKS but the customer's data stays on the device; a new code (or turning the old one back on) opens it again. ---------- */
const REAL = { until: 0, m: 0, id: '', note: '' };
const REAL_SRV = '@@TRIAL_SRV@@'; /* the code server (stopped codes are listed there) */
const XKEY = 'accounts.real.state';
let srvOff = 0, srvOk = false, dead = false, deadWhy = '', tickT = null, seenMem = 0, ticks = 0, warned = {};
const tget = () => { try { return JSON.parse(localStorage.getItem(XKEY)) || {}; } catch (e) { return {}; } };
const tset = o => { try { localStorage.setItem(XKEY, JSON.stringify(Object.assign(tget(), o))); } catch (e) { /* blocked */ } };
const tNow = () => Date.now() + srvOff;
/* 'ok' | 'over' (time is up or already ended) | 'clock' (the device clock was moved back) */
function realState() {
  const st = tget(), n = tNow();
  if (st.x || n >= REAL.until) return 'over';
  if (!srvOk && n < Math.max(st.seen || 0, seenMem) - 120000) return 'clock';
  return 'ok';
}
const CREDIT = `<footer class="credit">تصميم بواسطة <bdi dir="ltr">MINA.N.F</bdi><span class="sep">·</span><bdi dir="ltr" class="ver">Version @@VER@@</bdi></footer>`;
/* a card with a box to enter a code (shown when there is no code, or when it ended / was stopped); the data on this device is not touched */
function lockCard(title, msg, retry = false) {
  closePop(); const m = $('#modals'), t = $('#toasts'); if (m) m.innerHTML = ''; if (t) t.innerHTML = ''; gxMount();
  $('#app').innerHTML = `<main id="view"><section class="trial-over"><div class="to-card gx-card gx-wide">
    <div class="gx-mark">${GX_MARK}</div><h1>${title}</h1><p>${msg}</p>
    <div><label class="gx-field">${GX_USER}<span class="gx-sr">اسم المستخدم</span><input id="g-user" class="gx-un" type="text" enterkeyhint="next" spellcheck="false" autocomplete="username" autocapitalize="none" autocorrect="off" maxlength="60" placeholder="اسم المستخدم"></label><div class="gx-gap"></div>
    <label class="gx-field">${GX_KEY}<span class="gx-sr">الكود الذي أرسله لك المصمم</span><input id="g-code" type="text" enterkeyhint="go" spellcheck="false" autocomplete="off" autocapitalize="characters" maxlength="200" placeholder="XXXX-XXXX-XXXX-XXXX"></label><div class="gx-gap"></div>
    <button class="gx-btn" id="g-go" type="button"><span>دخول</span>${GX_GO}</button>${retry ? '<button class="gx-btn gx-out" id="g-re" type="button"><span>إعادة المحاولة</span></button>' : ''}</div>
    <p class="gx-err" id="g-err"></p>
    <p class="gx-s">للتواصل أو تجديد الكود تواصل مع المصمم.</p></div></section></main>${CREDIT}`;
  if ($('#g-re')) $('#g-re').onclick = () => location.reload();
  gxFormat($('#g-code'));
  const go = () => {
    const sc = gxNorm($('#g-code').value);
    if (sc.length !== 16) { $('#g-err').textContent = 'الكود غير مكتمل. اكتبه كاملاً كما أرسله المصمم.'; const c = document.querySelector('.to-card'); c.classList.remove('gx-bad'); void c.offsetWidth; c.classList.add('gx-bad'); return; }
    try { const u = $('#g-user').value.trim(); if (u) sessionStorage.setItem('gx.u', u); else sessionStorage.removeItem('gx.u'); } catch (e) { /* no storage */ } /* a name tied to the code goes to the gate page this way, not in the address */
    location.hash = 'c=' + sc; location.reload(); /* the gate page on the host checks the code and brings the program back */
  };
  $('#g-go').onclick = go; $('#g-code').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); go(); } };
  $('#g-user').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('#g-code').focus(); } };
}
function lockApp(why) {
  if (dead) return; dead = true; deadWhy = why; clearInterval(tickT);
  if (why === 'over') { const st = tget(), done = (st.done || []).filter(x => x !== REAL.id).concat(REAL.id ? [REAL.id] : []).slice(-60); tset({ x: 1, why, done }); } /* a stop is NOT remembered: turning the code back on works at the next check */
  const keep = 'بياناتك محفوظة على جهازك ولن تُمسح.';
  if (why === 'clock') lockCard('تم اكتشاف تغيير في وقت الجهاز', `اضبط تاريخ ووقت الجهاز على الوقت الصحيح ثم أعد فتح الصفحة. ${keep}`, true);
  else if (why === 'revoked') lockCard('تم إيقاف الكود', `أوقف المصمم هذا الكود. ${keep} يعود البرنامج للعمل بمجرد تشغيله من جديد، أو بإدخال كود جديد.`, true);
  else lockCard('انتهت مدة الكود', `انتهت المدة المحددة لهذا الكود (${fmtDur(REAL.m)}). ${keep} يعود البرنامج للعمل عند إدخال كود جديد.`);
}
guardFn = () => { if (dead) return true; const s = realState(); if (s !== 'ok') { lockApp(s); return true; } return false; };

async function syncTime() { /* the server's own clock (HTTP Date header) wins over the device clock when we can reach it */
  try {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 3500), t0 = Date.now();
    const r = await fetch('ping.txt?t=' + t0, { cache: 'no-store', signal: ctl.signal });
    clearTimeout(to);
    const t1 = Date.now(), d = Date.parse(r.headers.get('date') || '');
    if (!r.ok || !isFinite(d)) return false;
    const off = d + 500 - (t0 + t1) / 2; /* Date has 1 s resolution */
    srvOff = Math.abs(off) > 3000 ? Math.round(off) : 0; srvOk = true; return true;
  } catch (e) { return false; }
}
function jsonp(base, params, ms) { /* plain <script> request: no CORS needed */
  return new Promise((res, rej) => {
    const cb = '__r' + Math.random().toString(36).slice(2), s = document.createElement('script'); let done = false, t = 0;
    const end = (ok, v) => { if (done) return; done = true; clearTimeout(t); try { delete window[cb]; } catch (e) { window[cb] = undefined; } s.remove(); ok ? res(v) : rej(v); };
    t = setTimeout(() => end(false, new Error('timeout')), ms || 7000);
    window[cb] = v => end(true, v); s.onerror = () => end(false, new Error('net'));
    s.src = base + (base.indexOf('?') < 0 ? '?' : '&') + new URLSearchParams(Object.assign({}, params, { cb, _: Date.now() })).toString();
    document.head.appendChild(s);
  });
}
/* the designer can stop a code before its time is up (and turn it back on): the server lists the stopped ids, checked at start, every 30 s and when the tab comes back */
async function checkRevoked() {
  if (!REAL.id || !REAL_SRV) return;
  const hit = await jsonp(REAL_SRV, { a: 'rv' }, 7000).then(r => r && r.ok ? (r.ids || []).includes(REAL.id) : null).catch(() => null); /* offline: the time limit still applies */
  if (hit === null) return;
  if (hit && !dead) lockApp('revoked');
  else if (!hit && dead && deadWhy === 'revoked') location.reload(); /* turned back on */
}
/* the designer sees that this code was opened and how long is left here: only the code's id and its end time are sent (no data of the business) */
let seenAt = 0;
function tellSeen(first) {
  if (dead || !REAL_SRV || !REAL.id || (!first && Date.now() - seenAt < 60000)) return; seenAt = Date.now();
  jsonp(REAL_SRV, Object.assign({ a: 'seen', i: REAL.id, e: isFinite(REAL.until) ? Math.round(REAL.until) : 0 }, first ? { n: 1 } : {}), 7000).catch(() => { /* offline */ });
}
const fmtLeft = ms => { const s = Math.max(0, Math.floor(ms / 1000)), d = Math.floor(s / 86400); return (d ? d + (LANG === 'en' ? ' d ' : ' يوم ') : '') + [Math.floor(s % 86400 / 3600), Math.floor(s % 3600 / 60), s % 60].map(x => String(x).padStart(2, '0')).join(':'); };
const NEAR = 7 * 86400000; /* the countdown bar appears only in the last 7 days of a code that has an end */
function tick() {
  if (guardFn()) return;
  const n = tNow(), left = REAL.until - n;
  seenMem = Math.max(seenMem, n); if (++ticks % 5 === 1) tset({ seen: seenMem });
  let bar = $('#tbar');
  if (!isFinite(REAL.until) || left > NEAR) { if (bar) bar.remove(); return; }
  if (!bar) {
    const u = new Date(REAL.until);
    $('#app').insertAdjacentHTML('afterbegin', `<div class="tbar" id="tbar" role="timer"><span>ينتهي الكود قريباً${REAL.note ? ' • ' + esc(REAL.note) : ''}</span><span>تنتهي ${u.toLocaleDateString(LOC, { day: 'numeric', month: 'long' })} ${u.toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' })}</span><span>المتبقي <b id="tleft" dir="ltr">--:--:--</b></span></div>`);
    bar = $('#tbar');
  }
  const el = $('#tleft'); if (el) el.textContent = fmtLeft(left);
  bar.classList.toggle('warn', left <= 86400000);
  if (left <= 86400000 && left > 600000 && !warned.d && REAL.m > 1440) { warned.d = 1; toast('باقي أقل من يوم على انتهاء الكود'); }
  if (left <= 600000 && left > 60000 && !warned.a && REAL.m > 20) { warned.a = 1; toast('باقي أقل من 10 دقائق على انتهاء الكود'); }
  if (left <= 60000 && !warned.b) { warned.b = 1; toast('باقي أقل من دقيقة ويتوقف البرنامج — بياناتك محفوظة'); }
}

window.addEventListener('hashchange', () => { if (tokPick(location.hash)) location.reload(); }); /* a new code opened in the same tab */
(async function realBoot() {
  const st0 = tget(), raw = tokPick((location.hash || '') + '&' + (location.search || '')) || st0.raw || '';
  if (!raw) return lockCard('برنامج المحاسبات', 'هذا البرنامج يعمل بكود خاص يرسله لك المصمم. اكتب الكود هنا للدخول.');
  $('#view').innerHTML = `<div class="trial-over"><p class="hint" style="color:var(--fg3);font-weight:700">جارٍ فتح البرنامج…</p></div>`;
  const tk = await tokVerify(raw);
  if (!tk || tk.p !== 'r') return lockCard('الكود غير صالح', 'الكود غير صحيح أو ناقص. اطلب من المصمم كوداً جديداً، أو اكتب الكود كاملاً.');
  await syncTime();
  let st = tget();
  if (st.tok !== tk.i) { /* a code this device has not used yet (the data stays: only the code state changes) */
    if ((st.done || []).includes(tk.i)) return lockCard('انتهت مدة هذا الكود', 'تم استخدام هذا الكود وانتهت مدته. اطلب من المصمم كوداً جديداً، أو اكتبه هنا.');
    try { localStorage.setItem(XKEY, JSON.stringify({ raw, tok: tk.i, done: st.done || [] })); } catch (e) { /* blocked */ }
    st = tget(); if (st.tok !== tk.i) st = {};
  }
  Object.assign(REAL, { id: tk.i, m: tk.m, note: tk.n || '' });
  await checkRevoked(); if (dead) { setInterval(checkRevoked, 30000); document.addEventListener('visibilitychange', () => { if (!document.hidden) checkRevoked(); }); return; } /* stopped: keep asking, so turning it back on reopens the program */
  const n = tNow();
  if (tk.m === 0) REAL.until = Infinity; /* a code made without a time limit */
  else if (tk.s === 'a') REAL.until = tk.c + tk.m * 60000; /* fixed end, set when the code was made */
  else if (st.until) REAL.until = st.until; /* started earlier on this device */
  else {
    if (n > tk.o) return lockCard('انتهت صلاحية الكود', 'لم يُستخدم هذا الكود خلال المدة المسموحة. اطلب من المصمم كوداً جديداً.');
    REAL.until = n + tk.m * 60000; tset({ until: REAL.until, start: n });
  }
  const pre = realState(); if (pre !== 'ok') return lockApp(pre);
  tick(); tickT = setInterval(tick, 1000);
  setInterval(syncTime, 120000); setInterval(checkRevoked, 30000);
  tellSeen(1); setInterval(() => { if (!document.hidden) tellSeen(); }, 300000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); checkRevoked(); tellSeen(); } });
  applyZoom(); if (needLogin()) lockScreen(); else render();
})();
