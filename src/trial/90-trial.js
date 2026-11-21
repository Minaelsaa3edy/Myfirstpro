/* ---------- Trial guard: runs only with a signed trial link (each link carries its own duration), checks the server clock, wipes on expiry ---------- */
const TRIAL = { until: 0, m: 0, id: '', note: '' };
const TRIAL_SRV = '@@TRIAL_SRV@@'; /* the code server (stopped codes are listed there) */
const XKEY = 'accounts.demo.state';
let srvOff = 0, srvOk = false, dead = false, tickT = null, seenMem = 0, ticks = 0, warned = {};
const tget = () => { try { return JSON.parse(localStorage.getItem(XKEY)) || {}; } catch (e) { return {}; } };
const tset = o => { try { localStorage.setItem(XKEY, JSON.stringify(Object.assign(tget(), o))); } catch (e) { /* blocked */ } };
const tNow = () => Date.now() + srvOff;
/* 'ok' | 'over' (time is up or already ended) | 'clock' (the device clock was moved back) */
function trialState() {
  const st = tget(), n = tNow();
  if (st.x || n >= TRIAL.until) return 'over';
  if (!srvOk && n < Math.max(st.seen || 0, seenMem) - 120000) return 'clock';
  return 'ok';
}
const CREDIT = `<footer class="credit">تصميم بواسطة <bdi dir="ltr">MINA.N.F</bdi><span class="sep">·</span><bdi dir="ltr" class="ver">Version @@VER@@</bdi></footer>`;
/* a card with a box to paste a trial code (also shown after the trial ends, for a new link) */
function trialCard(title, msg, withCode = true) {
  closePop(); const m = $('#modals'), t = $('#toasts'); if (m) m.innerHTML = ''; if (t) t.innerHTML = ''; gxMount();
  $('#app').innerHTML = `<main id="view"><section class="trial-over"><div class="to-card gx-card gx-wide">
    <div class="gx-mark">${GX_MARK}</div><h1>${title}</h1><p>${msg}</p>
    ${withCode ? `<div><label class="gx-field">${GX_USER}<span class="gx-sr">اسم المستخدم</span><input id="g-user" class="gx-un" type="text" enterkeyhint="next" spellcheck="false" autocomplete="username" autocapitalize="none" autocorrect="off" maxlength="60" placeholder="اسم المستخدم"></label><div class="gx-gap"></div>
    <label class="gx-field gx-ta">${GX_KEY}<span class="gx-sr">الكود الذي أرسله لك المصمم</span><textarea id="g-code" rows="3" dir="ltr" spellcheck="false" placeholder="الصق الكود هنا"></textarea></label><div class="gx-gap"></div>
    <button class="gx-btn" id="g-go" type="button"><span>دخول</span>${GX_GO}</button></div><p class="gx-err" id="g-err"></p>` : ''}
    <p class="gx-s">للحصول على النسخة الفعلية تواصل مع المصمم.</p></div></section></main>${CREDIT}`;
  const go = $('#g-go'); if (!go) return;
  const shake = () => { const c = document.querySelector('.to-card'); c.classList.remove('gx-bad'); void c.offsetWidth; c.classList.add('gx-bad'); };
  go.onclick = async () => {
    const sc = String($('#g-code').value).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!tokPick($('#g-code').value) && sc.length === 16) { try { const u = $('#g-user').value.trim(); if (u) sessionStorage.setItem('gx.u', u); else sessionStorage.removeItem('gx.u'); } catch (e) { /* no storage */ } location.hash = 'c=' + sc; location.reload(); return; } /* short code: the gate page on the host opens it */
    const raw = tokPick($('#g-code').value), tk = raw && await tokVerify(raw);
    if (!tk) { $('#g-err').textContent = 'الكود غير صالح. تأكد من نسخه كاملاً كما أرسله المصمم.'; shake(); return; }
    try { localStorage.setItem(XKEY, JSON.stringify({ raw, done: tget().done || [] })); } catch (e) { /* blocked */ }
    location.reload();
  };
}
function endTrial(why) {
  if (dead) return; dead = true; clearInterval(tickT);
  try { localStorage.removeItem(KEY); } catch (e) { /* blocked */ }
  const st = tget(), done = (st.done || []).filter(x => x !== TRIAL.id).concat(TRIAL.id ? [TRIAL.id] : []).slice(-60);
  tset({ x: 1, why, done });
  trialCard('انتهت مدة النسخة التجريبية', `${why === 'clock' ? 'تم اكتشاف تغيير في وقت الجهاز، لذلك أُنهيت التجربة.' : why === 'revoked' ? 'أوقف المصمم هذه التجربة.' : `انتهت فترة التجربة (${fmtDur(TRIAL.m)})`} ومُسحت البيانات التجريبية من هذا الجهاز.`);
}
guardFn = () => { if (dead) return true; const s = trialState(); if (s !== 'ok') { endTrial(s); return true; } return false; };

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
/* the designer can stop a link before its time is up: its id is listed in revoked.txt next to this page (checked at start, every minute, and when the tab comes back) */
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
async function checkRevoked() {
  if (dead || !TRIAL.id) return;
  if (!TRIAL_SRV) return;
  const hit = await jsonp(TRIAL_SRV, { a: 'rv' }, 7000).then(r => !!(r && r.ok && (r.ids || []).includes(TRIAL.id))).catch(() => false); /* offline: the time limit still applies */
  if (hit && !dead) endTrial('revoked');
}
/* the designer sees that this code was opened and how long is left here: only the code's id and its end time are sent (no data of the business) */
let seenAt = 0;
function tellSeen(first) {
  if (dead || !TRIAL_SRV || !TRIAL.id || (!first && Date.now() - seenAt < 60000)) return; seenAt = Date.now();
  jsonp(TRIAL_SRV, Object.assign({ a: 'seen', i: TRIAL.id, e: isFinite(TRIAL.until) ? Math.round(TRIAL.until) : 0 }, first ? { n: 1 } : {}), 7000).catch(() => { /* offline */ });
}
const fmtLeft = ms => { const s = Math.max(0, Math.floor(ms / 1000)), d = Math.floor(s / 86400); return (d ? d + (LANG === 'en' ? ' d ' : ' يوم ') : '') + [Math.floor(s % 86400 / 3600), Math.floor(s % 3600 / 60), s % 60].map(x => String(x).padStart(2, '0')).join(':'); };
function tick() {
  if (guardFn()) return;
  const n = tNow(), left = TRIAL.until - n;
  seenMem = Math.max(seenMem, n); if (++ticks % 5 === 1) tset({ seen: seenMem });
  const el = $('#tleft'); if (el) el.textContent = fmtLeft(left);
  const bar = $('#tbar'); if (bar) bar.classList.toggle('warn', left <= 600000);
  if (left <= 600000 && left > 60000 && !warned.a && TRIAL.m > 20) { warned.a = 1; toast('باقي أقل من 10 دقائق على انتهاء التجربة'); }
  if (left <= 60000 && !warned.b) { warned.b = 1; toast('باقي أقل من دقيقة وتنتهي التجربة'); }
}

/* a few screens differ in the trial */
BACKUP_OK = false;
screens.setBackup = (p, v) => {
  v.innerHTML = setHead() + `<section class="panel"><h2 class="panel-t">نسخة احتياطية</h2>
    <p class="lbl" style="margin:0;line-height:1.9">النسخ الاحتياطي والاسترجاع غير متاحين في النسخة التجريبية. كل البيانات هنا وهمية وتُمسح تلقائياً عند انتهاء المدة.</p></section>`;
};

window.addEventListener('hashchange', () => { if (tokPick(location.hash)) location.reload(); }); /* a new link opened in the same tab */
(async function trialBoot() {
  const st0 = tget(), raw = tokPick((location.hash || '') + '&' + (location.search || '')) || st0.raw || '';
  if (!raw) return trialCard('تجربة برنامج المحاسبات', 'هذه النسخة تعمل برابط تجربة خاص يرسله لك المصمم. افتح الرابط كاملاً، أو الصق الكود هنا.');
  $('#view').innerHTML = `<div class="trial-over"><p class="hint" style="color:var(--fg3);font-weight:700">جارٍ تجهيز النسخة التجريبية…</p></div>`;
  const tk = await tokVerify(raw);
  if (!tk || tk.p !== 'd') return trialCard('الكود غير صالح', 'الكود غير صحيح أو ناقص. اطلب من المصمم كوداً جديداً، أو الصق الكود كاملاً.');
  await syncTime();
  let st = tget();
  if (st.tok !== tk.i) { /* a link this device has not used yet */
    if ((st.done || []).includes(tk.i)) return trialCard('انتهت مدة هذا الرابط', 'تم استخدام هذا الرابط وانتهت مدته. اطلب من المصمم رابطاً جديداً، أو الصق كوداً جديداً هنا.');
    try { localStorage.setItem(XKEY, JSON.stringify({ raw, tok: tk.i, done: st.done || [] })); localStorage.removeItem(KEY); } catch (e) { /* blocked */ }
    if (tget().tok === tk.i) { location.reload(); return; } /* start from fresh demo data */
    st = {};
  }
  Object.assign(TRIAL, { id: tk.i, m: tk.m, note: tk.n || '' });
  await checkRevoked(); if (dead) return;
  const n = tNow();
  if (tk.m === 0) TRIAL.until = Infinity; /* a code made without a time limit */
  else if (tk.s === 'a') TRIAL.until = tk.c + tk.m * 60000; /* fixed end, set when the link was made */
  else if (st.until) TRIAL.until = st.until; /* started earlier on this device */
  else {
    if (n > tk.o) return trialCard('انتهت صلاحية الرابط', 'لم يُفتح هذا الرابط خلال المدة المسموحة. اطلب من المصمم رابطاً جديداً.');
    TRIAL.until = n + tk.m * 60000; tset({ until: TRIAL.until, start: n });
  }
  const pre = trialState(); if (pre !== 'ok') return endTrial(pre);
  const u = new Date(TRIAL.until), hm = isFinite(TRIAL.until) ? u.toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' }) : '', dd = isFinite(TRIAL.until) ? u.toLocaleDateString(LOC, { day: 'numeric', month: 'long' }) : '';
  $('#app').insertAdjacentHTML('afterbegin', `<div class="tbar" id="tbar" role="timer"><span>نسخة تجريبية • بيانات وهمية${TRIAL.note ? ' • ' + esc(TRIAL.note) : ''}</span>${isFinite(TRIAL.until) ? `<span>تنتهي ${dd} ${hm}</span><span>المتبقي <b id="tleft" dir="ltr">--:--:--</b></span>` : '<span>بدون مدة محددة</span>'}</div>`);
  tick(); tickT = setInterval(tick, 1000);
  setInterval(syncTime, 120000); setInterval(checkRevoked, 30000);
  tellSeen(1); setInterval(() => { if (!document.hidden) tellSeen(); }, 300000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); checkRevoked(); tellSeen(); } });
  applyZoom(); if (needLogin()) lockScreen(); else render();
})();
