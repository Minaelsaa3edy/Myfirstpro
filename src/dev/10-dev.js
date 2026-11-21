/* ---------- Developer section (Settings): locked by the designer's password. Makes the access codes (demo or real program, any duration) and stops them.
   The password is never stored: it only unlocks (AES-GCM) the private signing key and the two program keys that ship encrypted inside this page. ---------- */
const DEV = /*DEVBLOB*/null, SRV_URL = '@@SRV_URL@@', SITE0 = '@@SITE_URL@@', TURL = 'accounts.dev.turl', DCODES = 'accounts.dev.codes';
const FAR = 4102444800000; /* 2100-01-01: the end used when a permanent code is stopped */
const OPEN_DAYS = { d: 7, r: 30 }; /* a code made with "from first open" can be typed in for this long (demo / real) */
const MIN_MINS = 5, MAX_MINS = 10 * 525600; /* 5 minutes .. 10 years (or permanent) */
const UNIT_MINS = { m: 1, h: 60, d: 1440, y: 525600 };
/* a link saved by an older version (the old site, or its separate trial page) is dropped: the customers' page is the one this copy was published with */
const staleUrl = u => !u || /\/trial\.html$/i.test(u) || /\/test1\//i.test(u) || (/^https?:\/\/[^/]*github\.io\//i.test(SITE0) && /^https?:\/\/[^/]*github\.io\//i.test(u) && u !== SITE0);
const siteUrl = () => { try { const u = localStorage.getItem(TURL); if (u && staleUrl(u)) { localStorage.removeItem(TURL); return SITE0; } return u || SITE0; } catch (e) { return SITE0; } }; /* the page customers open (the same for demo and real) */
const cleanUrl = s => { s = String(s || '').trim().replace(/#.*$/, ''); return /^https?:\/\/[^\s]+$/i.test(s) ? s : ''; };
const saveUrl = u => { try { localStorage.setItem(TURL, u); } catch (e) { /* blocked */ } };
let devKey = null, devSec = null, devUntil = 0, devFail = 0, devLock = 0;
leaveHooks.push(() => { devKey = null; devSec = null; devUntil = 0; }); /* leaving Settings locks it again */
const devOpen = () => !!devKey && Date.now() < devUntil;
async function devUnlock(pw) { /* -> {key: signing key, dk: notes key, kc/kt: program keys, ak: server key}, or throws when the password is wrong */
  const mat = await crypto.subtle.importKey('raw', TXT_E.encode(pw), 'PBKDF2', false, ['deriveKey']);
  const k = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: unb64u(DEV.s), iterations: DEV.it, hash: 'SHA-256' }, mat, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(DEV.iv) }, k, unb64u(DEV.c));
  const o = JSON.parse(TXT_D.decode(raw)), jwk = o.kty ? o : o.k;
  const dk = await crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', TXT_E.encode('trial-codes.v1|' + jwk.d)), 'AES-GCM', false, ['encrypt', 'decrypt']); /* only the designer can read the notes kept on the server */
  return { key: await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']), dk, kc: o.kc || '', kt: o.kt || '', ak: o.ak || '' };
}
const NOCRYPTO = !(window.crypto && crypto.subtle); /* file:// pages on some browsers (e.g. Safari on iPhone) have no WebCrypto */
const dAt = ms => dateTimeAr(new Date(ms).toISOString());
const CALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const cRand = n => { const r = crypto.getRandomValues(new Uint8Array(n)); let s = ''; for (let i = 0; i < n; i++) s += CALPHA[r[i] & 31]; return s; };
const cFmt = c => c.replace(/(.{4})/g, '$1-').replace(/-$/, '');
const eOpenBy = e => e.m === 0 ? 0 : e.s === 'a' ? e.c + e.m * 60000 : e.o; /* the last moment this code can still be typed in (0 = always) */
const eEnd = e => e.m === 0 ? FAR : e.s === 'a' ? e.c + e.m * 60000 : e.o + e.m * 60000; /* the last moment a program started from it can still be running */
const fmtDurAr = m => fmtDur(m, 'ar');
const tName = p => p === 'r' ? 'فعلي' : 'تجريبي', tNameF = p => p === 'r' ? 'فعلية' : 'تجريبية';
const dDesc = e => e.m === 0 ? 'دائم — بدون مدة انتهاء' : e.s === 'a' ? `${fmtDurAr(e.m)} — تنتهي ${dAt(e.c + e.m * 60000)}` : `${fmtDurAr(e.m)} من أول فتح — يصلح للإدخال حتى ${dAt(e.o)}`;
const eMsg = e => `برنامج المحاسبات لمواد البناء — نسخة ${tNameF(e.p)} (${e.m === 0 ? 'دائمة' : fmtDurAr(e.m) + (e.s === 'r' ? ' من أول فتح' : '')})\nالرابط: ${siteUrl()}${e.un ? `\nاسم المستخدم: ${e.un}` : ''}\nالكود: ${cFmt(e.k)}`;
async function copyText(text, msg) { try { await navigator.clipboard.writeText(text); toast(msg, 'ok'); } catch (e) { toast('تعذر النسخ تلقائياً — حدّد النص وانسخه يدوياً'); } }

/* what this browser made (kept apart from the business data and its backups); the server is the master copy, any device of the designer can list it */
function dget() {
  let s = null; try { s = JSON.parse(localStorage.getItem(DCODES)); } catch (e) { s = null; }
  if (!s || !Array.isArray(s.list)) s = { list: [] };
  if (!Array.isArray(s.rv)) s.rv = []; /* ids of stopped codes */
  if (!Array.isArray(s.rvq)) s.rvq = []; /* stops the server has not received yet: {i, u} */
  return s;
}
const dset = s => { try { localStorage.setItem(DCODES, JSON.stringify(Object.assign(s, { list: s.list.slice(0, 300) }))); } catch (e) { /* blocked */ } };

/* ---- the code server (Google Apps Script web app): a code works the moment it is made and a stop reaches the customer within seconds ---- */
const srvOn = () => !!(SRV_URL && devSec && devSec.ak && devSec.dk && devSec.kt && devSec.kc && !NOCRYPTO);
function srvCall(params, ms) { /* JSONP (a plain <script> request): no CORS to worry about */
  return new Promise((res, rej) => {
    const cb = '__s' + Math.random().toString(36).slice(2), sc = document.createElement('script'); let done = false, tm = 0;
    const end = (ok, x) => { if (done) return; done = true; clearTimeout(tm); try { delete window[cb]; } catch (e) { window[cb] = undefined; } sc.remove(); ok ? res(x) : rej(x); };
    tm = setTimeout(() => end(false, new Error('srv timeout')), ms || 15000);
    window[cb] = x => end(true, x); sc.onerror = () => end(false, new Error('srv net'));
    sc.src = SRV_URL + (SRV_URL.indexOf('?') < 0 ? '?' : '&') + new URLSearchParams(Object.assign({}, params, { cb, _: Date.now() })).toString();
    document.head.appendChild(sc);
  });
}
const srvAdm = (a, p) => srvCall(Object.assign({ a, k: devSec.ak }, p)).then(r => { if (!r || !r.ok) throw new Error(r && r.e === 'key' ? 'srv key' : 'srv ' + (r && r.e)); return r; });
const srvMsg = e => /srv key/.test(e.message) ? 'مفتاح السيرفر غير مطابق — راجع الكود الذي لصقته في Google' : 'تعذر الوصول للسيرفر — تأكد من النت وحاول مرة أخرى';
/* a user name tied to a code: compared after a light clean-up, and mixed into the secret that unlocks the code's slot (the gate page does the same: tools/loader.html) */
const unorm = s => String(s || '').normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).toLowerCase().replace(/\s+/g, ' ').trim();
const usecret = (user, c12) => { const n = unorm(user); return n ? 'u1|' + n + '|' + c12 : c12; };
async function wrapSecret(secret, bytes) { /* a typed code -> PBKDF2 -> AES-GCM wrap of `bytes` (same slot format the gate page reads) */
  const salt = crypto.getRandomValues(new Uint8Array(16)), siv = crypto.getRandomValues(new Uint8Array(12)), it = 150000;
  const mat = await crypto.subtle.importKey('raw', TXT_E.encode(secret), 'PBKDF2', false, ['deriveKey']);
  const wk = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: it, hash: 'SHA-256' }, mat, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  return { s: b64u(salt), iv: b64u(siv), c: b64u(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: siv }, wk, bytes))), it };
}
async function srvPutCode(e) { /* slot for the gate + the designer's own encrypted note, so any of his devices can list it */
  const iv = crypto.getRandomValues(new Uint8Array(12)), body = TXT_E.encode(JSON.stringify({ k: e.k, p: e.p, i: e.i, c: e.c, m: e.m, s: e.s, o: e.o, n: e.n, un: e.un || '' }));
  const m = { iv: b64u(iv), c: b64u(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, devSec.dk, body))) };
  await srvAdm('put', { id: e.k.slice(0, 4), slot: JSON.stringify(Object.assign({ s: e.w.s, iv: e.w.iv, c: e.w.c, it: e.w.it }, e.un ? { un: 1 } : {})), m: JSON.stringify(m), u: eOpenBy(e) });
}

SET_TILES.push(['setDev', 'قسم المطوّر', 'dev']);
screens.setDev = (p, v) => devOpen() ? devPanel(v) : devGate(v);

function devGate(v) {
  v.innerHTML = setHead() + `<div dir="rtl" lang="ar"><section class="panel"><h2 class="panel-t">قسم المطوّر</h2>
    <p class="lbl" style="margin:0 0 14px;line-height:1.9">هذا القسم خاص بالمصمم. اكتب كلمة المرور للدخول.</p>
    ${NOCRYPTO ? '<div class="note" style="display:block;margin-bottom:14px"><b>التشفير غير متاح في هذه الصفحة.</b><br>المتصفح يمنعه في الملفات المفتوحة من الجهاز (مثل ملف HTML على الموبايل). افتح نسختك من رابط https ليشتغل القسم، وكلمة المرور صحيحة.</div>' : ''}
    <div class="form-grid"><div class="field"><label for="d-pw">كلمة المرور</label><input id="d-pw" class="inp" type="password" dir="ltr" autocomplete="off"></div></div>
    <div class="actions" style="margin-top:16px"><button class="btn" id="d-go" type="button">دخول</button></div></section></div>`;
  const go = async () => {
    const pw = $('#d-pw').value, b = $('#d-go'); if (!pw) return;
    if (NOCRYPTO) return toast('التشفير غير متاح في هذه الصفحة — افتحها من رابط https');
    const wait = Math.ceil((devLock - Date.now()) / 1000); if (wait > 0) return toast(`حاول بعد ${wait} ثانية`);
    b.disabled = true; b.textContent = 'جارٍ التحقق…';
    try { devSec = await devUnlock(pw); devKey = devSec.key; }
    catch (e) { if (++devFail >= 5) { devFail = 0; devLock = Date.now() + 30000; } toast('كلمة المرور غير صحيحة'); b.disabled = false; b.textContent = 'دخول'; $('#d-pw').value = ''; $('#d-pw').focus(); return; }
    devFail = 0; devUntil = Date.now() + 10 * 60 * 1000; render();
  };
  $('#d-go').onclick = go; onEnter($('#d-pw'), go);
}

function devPanel(v) {
  ['accounts.dev.cust', 'accounts.dev.gh', 'accounts.dev.log'].forEach(k => { try { localStorage.removeItem(k); } catch (e) { /* blocked */ } }); /* leftovers of the old GitHub-based tools (a saved token, old lists) */
  const on = srvOn();
  v.innerHTML = setHead() + `<div class="stack" dir="rtl" lang="ar">
  <section class="panel"><h2 class="panel-t">إنشاء كود</h2>
    ${on ? `<p class="lbl" style="margin:0 0 14px;line-height:1.9">اختار النوع والمدة، فيطلع كود قصير <bdi dir="ltr">XXXX-XXXX-XXXX-XXXX</bdi> تبعته للعميل. الكود يفتح من نفس الرابط، ويشتغل فور إنشائه، وتقدر توقفه في أي وقت.</p>
    <div class="form-grid">
      <div class="field" style="grid-column:1/-1"><label for="d-url">رابط الموقع (اللي يفتحه العميل — واحد للتجريبي والفعلي)</label><input id="d-url" class="inp" dir="ltr" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://example.com/" value="${esc(siteUrl())}"></div>
      <div class="field" style="grid-column:1/-1"><label for="d-t">نوع الكود</label><div class="sel"><select id="d-t"><option value="d">تجريبي — برنامج ببيانات وهمية (تُمسح عند الانتهاء)</option><option value="r">فعلي — البرنامج الحقيقي (بياناته محفوظة عند العميل)</option></select></div></div>
      <div class="field" id="d-nf"><label for="d-n">المدة</label><input id="d-n" class="inp" inputmode="decimal" value="3" autocomplete="off"></div>
      <div class="field"><label for="d-u" id="d-ul">الوحدة</label><div class="sel"><select id="d-u"><option value="m">دقيقة</option><option value="h" selected>ساعة</option><option value="d">يوم</option><option value="y">سنة</option><option value="p">دائم (بدون انتهاء)</option></select></div></div>
      <div class="field" id="d-sf" style="grid-column:1/-1"><label for="d-s">تبدأ المدة من</label><div class="sel"><select id="d-s"><option value="r"></option><option value="a">الآن (تنتهي في وقت ثابت حتى لو لم يُستخدم الكود)</option></select></div></div>
      <div class="field" style="grid-column:1/-1"><label for="d-user">اسم المستخدم (اختياري — يربط الكود به)</label><input id="d-user" class="inp" maxlength="30" autocomplete="off" spellcheck="false" placeholder="مثال: ahmed.steel"><span class="lbl" style="display:block;margin-top:6px;line-height:1.8">لو كتبته، العميل لازم يكتب نفس الاسم + الكود في صفحة الدخول (الكود لوحده مش هيفتح). سيبه فاضي لو عايز الكود يفتح لوحده.</span></div>
      <div class="field" style="grid-column:1/-1"><label for="d-note">ملاحظة اختيارية (اسم العميل)</label><input id="d-note" class="inp" maxlength="40" autocomplete="off"></div>
    </div>` : `<div class="note" style="display:block"><b>${SRV_URL ? 'القسم مقفول لحين الوصول للمفاتيح.' : 'سيرفر الأكواد غير مضبوط في هذه النسخة.'}</b><br>${SRV_URL ? 'افتح نسخة المطوّر المنشورة (dev.html) وادخل بكلمة المرور.' : 'الأكواد تُنشأ من نسخة المطوّر المنشورة على الاستضافة (dev.html).'}</div>`}
    <div class="actions" style="margin-top:16px">${on ? `<button class="btn" id="d-make" type="button">${ICON.plus}<span>إنشاء الكود</span></button>` : ''}<button class="btn ghost" id="d-lock" type="button">قفل القسم</button></div>
    <div id="d-out" style="margin-top:18px"></div><div id="d-pend" style="margin-top:12px"></div><div id="d-srvst" class="lbl" style="margin-top:10px"></div><div id="d-old" class="note" style="display:none;margin-top:10px"><b>متابعة فتح الأكواد تحتاج تحديث كود السيرفر في Google (مرة واحدة).</b><br>الصق ملف server.gs الجديد مكان القديم، ثم Deploy › Manage deployments › Edit › New version › Deploy. الرابط يفضل زي ما هو.</div></section>
  <section class="panel"><h2 class="panel-t">الأكواد التي أنشأتها</h2>
    <div class="tbl-wrap"><table class="grid cat"><tbody id="d-log"></tbody></table></div>
    <p class="lbl" style="margin:12px 0 0;line-height:1.9">«إيقاف» يقفل الكود عند العميل خلال ثوانٍ لو متصل بالنت، وإلا ينتهي بانتهاء مدته. الكود التجريبي الموقوف تُمسح بياناته الوهمية. الكود الفعلي الموقوف يقفل البرنامج فقط وتفضل بيانات العميل محفوظة، وتقدر تشغّله من جديد بـ «إلغاء الإيقاف».</p></section></div>`;
  const out = $('#d-out'), keep = () => { devUntil = Date.now() + 10 * 60 * 1000; };
  const syncForm = () => { /* the fields that do not apply (a permanent code has no length / start) are hidden */
    if (!on) return;
    const perm = $('#d-u').value === 'p', p = $('#d-t').value;
    $('#d-nf').style.display = perm ? 'none' : ''; $('#d-sf').style.display = perm ? 'none' : '';
    $('#d-s').options[0].textContent = `أول استخدام للكود (يصلح للإدخال ${OPEN_DAYS[p]} يوماً)`;
  };
  let srvDiff = 0, srvOld = false; /* server clock - this device's clock; an old server script knows nothing about opens */
  const dLeft = ms => { const s = Math.max(0, Math.floor(ms / 1000)), d = Math.floor(s / 86400); return (d ? d + ' يوم ' : '') + [Math.floor(s % 86400 / 3600), Math.floor(s % 3600 / 60), s % 60].map(x => String(x).padStart(2, '0')).join(':'); };
  const opLine = (e, stopped) => { /* was the code opened at the customer, and the countdown he sees */
    const op = e.op, now = Date.now() + srvDiff, end = e.m === 0 ? 0 : e.s === 'a' ? eEnd(e) : op ? op.e : 0;
    const a = op ? `<span class="d-on">● فتحه العميل ${dAt(op.f)}</span>${op.n > 1 ? ` <span class="muted">• ${op.n} مرات</span>` : ''} <span class="muted">• ${now - op.l < 400000 ? 'مفتوح الآن' : 'آخر ظهور ' + dAt(op.l)}</span>` : '<span class="muted">○ لم يفتحه العميل بعد</span>';
    const b = stopped ? '' : e.m === 0 ? (op ? '<span class="muted">دائم — بدون عد تنازلي</span>' : '') : end ? `<span>${op ? 'المتبقي عند العميل' : 'المتبقي على انتهاء الكود'}: <b dir="ltr" class="d-left" data-left="${end}">${end > now ? dLeft(end - now) : 'انتهت المدة'}</b></span>` : '<span class="muted">العد التنازلي يبدأ عند أول فتح</span>';
    return `<div class="d-op" data-op="${op ? 1 : 0}">${a}${b ? '<br>' + b : ''}</div>`;
  };
  const upd = (k, f) => { const s = dget(), e = s.list.find(x => x.k === k); if (e) { f(e); dset(s); } };
  const drawLog = () => {
    const s = dget(), L = s.list.slice().sort((a, b) => b.c - a.c), now = Date.now();
    $('#d-log').innerHTML = L.map(e => {
      const stopped = s.rv.includes(e.i), ended = e.m !== 0 && eEnd(e) < now;
      return `<tr><td style="text-align:start;padding:12px 10px">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>${esc(e.n || 'بدون ملاحظة')} <span class="muted" style="font-weight:600">• ${tName(e.p)}</span></b><span class="muted">${dAt(e.c)}</span></div>
      <div class="muted" style="margin:4px 0">${esc(dDesc(e))}</div>
      ${e.un ? `<div style="margin:2px 0">اسم المستخدم: <b dir="ltr">${esc(e.un)}</b></div>` : ''}
      <div dir="ltr" style="font-family:ui-monospace,Menlo,monospace;font-size:15px;letter-spacing:1px;text-align:start;margin:4px 0">${esc(cFmt(e.k))}</div>
      ${opLine(e, stopped)}
      <div class="actions" style="justify-content:flex-start;gap:6px;flex-wrap:wrap;margin-top:8px"><button class="mini" data-ck="${e.k}">نسخ الكود</button><button class="mini" data-cm="${e.k}">نسخ رسالة للعميل</button>${stopped ? '<span class="muted" data-stopped>موقوف</span>' + (e.p === 'r' ? `<button class="mini" data-un="${e.k}">إلغاء الإيقاف</button>` : '') : ended ? '<span class="muted" data-ended>انتهى</span>' : `<button class="mini" data-rv="${e.k}">إيقاف</button>`}${e.live ? '' : '<span class="muted" data-unpub>لم يصل للسيرفر بعد</span>'}<button class="del" data-dl="${e.k}" aria-label="حذف من السجل">${ICON.trash}</button></div></td></tr>`;
    }).join('') || '<tr><td class="empty">لم تنشئ أكواداً بعد.</td></tr>';
    const E = k => dget().list.find(x => x.k === k);
    $$('[data-ck]', v).forEach(b => b.onclick = () => copyText(cFmt(b.dataset.ck), 'تم نسخ الكود'));
    $$('[data-cm]', v).forEach(b => b.onclick = () => { const e = E(b.dataset.cm); if (e) copyText(eMsg(e), 'تم نسخ الرسالة'); });
    $$('[data-rv]', v).forEach(b => b.onclick = async () => {
      const e = E(b.dataset.rv); if (!e) return;
      if (!await confirmBox('إيقاف الكود', e.p === 'r' ? 'سيتوقف البرنامج عند هذا العميل خلال ثوانٍ (لو متصل بالنت). بياناته تفضل محفوظة على جهازه، وتقدر تشغّله من جديد بـ «إلغاء الإيقاف».' : 'سيتوقف هذا الكود عند العميل خلال ثوانٍ (لو متصل بالنت) ويُمسح ما أدخله من بيانات تجريبية. لا يمكن التراجع.', 'إيقاف')) return;
      const s = dget(); if (!s.rv.includes(e.i)) s.rv.push(e.i); if (!s.rvq.some(x => x.i === e.i)) s.rvq.push({ i: e.i, u: eEnd(e) }); dset(s); keep(); drawLog(); drawPend(); flush();
    });
    $$('[data-un]', v).forEach(b => b.onclick = async () => {
      const e = E(b.dataset.un); if (!e || !on) return;
      b.disabled = true;
      try { await srvAdm('unstop', { i: e.i }); const s = dget(); s.rv = s.rv.filter(x => x !== e.i); s.rvq = s.rvq.filter(x => x.i !== e.i); dset(s); toast('تم إلغاء الإيقاف — يشتغل عند العميل خلال ثوانٍ', 'ok'); }
      catch (x) { toast(srvMsg(x)); }
      keep(); drawLog(); drawPend();
    });
    $$('[data-dl]', v).forEach(b => b.onclick = async () => {
      const e = E(b.dataset.dl); if (!e) return;
      if (!await confirmBox('حذف من السجل', 'سيُحذف الكود من السجل ومن السيرفر، فلا يعود يُقبل لمن لم يدخل به بعد. من دخل به يفضل شغال، ولقطعه استخدم «إيقاف» قبل الحذف.')) return;
      if (on && e.live) { try { await srvAdm('del', { id: e.k.slice(0, 4), i: e.i }); } catch (x) { toast(srvMsg(x)); return; } }
      const s = dget(); s.list = s.list.filter(x => x.k !== e.k); dset(s); keep(); drawLog(); drawPend();
    });
  };
  const flush = async () => { /* send what the server has not got yet: codes made while it was out of reach, and stops */
    if (!on) return;
    let bad = 0, n = 0;
    for (const e of dget().list.filter(x => !x.live && x.w)) { n++; try { await srvPutCode(e); upd(e.k, x => { x.live = true; x.w = null; }); } catch (x) { bad++; } }
    for (const x of dget().rvq.slice()) { n++; try { await srvAdm('stop', { i: x.i, u: x.u }); const s = dget(); s.rvq = s.rvq.filter(y => y.i !== x.i); dset(s); } catch (e) { bad++; } }
    if (n) toast(bad ? 'تعذر الوصول للسيرفر — اضغط «إعادة المحاولة»' : 'تم — يصل للعميل خلال ثوانٍ', bad ? undefined : 'ok');
    drawLog(); drawPend();
  };
  const drawPend = () => {
    const s = dget(), a = s.list.some(x => !x.live), b = s.rvq.length, box = $('#d-pend'); if (!box) return;
    box.innerHTML = a || b ? `<div class="note" style="display:block"><b>${a && b ? 'فيه كود وإيقاف لم يصلوا للسيرفر بعد.' : a ? 'فيه كود لم يصل للسيرفر بعد.' : 'فيه إيقاف لم يصل للسيرفر بعد.'}</b> ${a ? 'الكود لن يعمل عند العميل قبل ذلك. ' : ''}${b ? 'العميل ما زال يستطيع الاستمرار.' : ''}</div><div class="actions" style="margin-top:10px"><button class="btn" id="d-retry" type="button">إعادة المحاولة</button></div>` : '';
    if ($('#d-retry')) $('#d-retry').onclick = flush;
  };
  const srvSync = async () => { /* what the server knows (codes made on another device, stops, un-stops) is merged in */
    if (!on) return;
    let r; try { r = await srvAdm('list'); } catch (e) { return; }
    const E = [], old = [], now = Date.now();
    for (const it of r.items || []) {
      try { const e = JSON.parse(TXT_D.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(it.m.iv) }, devSec.dk, unb64u(it.m.c)))); if (e.p === 'd' || e.p === 'r') E.push(e); else old.push(it.id); }
      catch (x) { /* not ours */ }
    }
    for (const id of old) { try { await srvAdm('del', { id }); } catch (x) { /* next time */ } } /* leftovers of the old (v2.3) codes: they cannot work any more */
    const s = dget(); let ch = false;
    srvDiff = (r.t || Date.now()) - Date.now(); srvOld = !r.v;
    const st = $('#d-old'); if (st) st.style.display = srvOld ? 'block' : 'none';
    const OP = {}; (r.op || []).forEach(x => { OP[x.i] = x; });
    E.forEach(e => { const l = s.list.find(x => x.k === e.k), o = OP[e.i]; if (!l || !o) return; /* opened at the customer: remembered here, and announced the first time */
      if (!l.op) toast(`فتح العميل الكود${l.n ? ' — ' + l.n : ''}`, 'ok');
      if (!l.op || l.op.l !== o.l || l.op.e !== o.e || l.op.n !== o.n) { l.op = { f: o.f, l: o.l, e: o.e, n: o.n }; ch = true; } });
    E.forEach(e => { if (!s.list.some(x => x.k === e.k)) { const o = OP[e.i]; s.list.push(Object.assign({ k: e.k, p: e.p, i: e.i, c: e.c, m: e.m, s: e.s, o: e.o, n: e.n, un: e.un || '', live: true }, o ? { op: { f: o.f, l: o.l, e: o.e, n: o.n } } : {})); ch = true; } else { const l = s.list.find(x => x.k === e.k); if (!l.live) { l.live = true; l.w = null; ch = true; } } });
    const on_ = (r.rv || []).filter(x => x.u >= now).map(x => x.i), pend = s.rvq.map(x => x.i).filter(i => !on_.includes(i));
    const nrv = on_.concat(pend); if (nrv.length !== s.rv.length || nrv.some(i => !s.rv.includes(i))) { s.rv = nrv; ch = true; }
    const q = s.rvq.filter(x => !on_.includes(x.i)); if (q.length !== s.rvq.length) { s.rvq = q; ch = true; }
    if (ch) { dset(s); drawLog(); drawPend(); }
  };
  const srvStatus = async () => {
    const el = $('#d-srvst'); if (!el || !on) return; el.textContent = 'السيرفر: جارٍ الفحص…';
    try { await srvAdm('chk'); el.innerHTML = 'السيرفر: <b>متصل</b> — الكود يشتغل فور إنشائه، والإيقاف يصل خلال ثوانٍ.'; } catch (e) { el.textContent = 'السيرفر: ' + srvMsg(e); }
  };
  const show = e => {
    out.innerHTML = `<div class="note" style="display:block"><b>تم إنشاء الكود (${tName(e.p)})</b><br>${esc(dDesc(e))}${e.n ? `<br>الملاحظة: ${esc(e.n)}` : ''}${e.un ? `<br>اسم المستخدم: <b dir="ltr">${esc(e.un)}</b>` : ''}${e.live ? '' : '<br><b>لم يصل للسيرفر بعد — لن يعمل قبل أن يصل.</b>'}</div>
      <div class="field" style="margin-top:12px"><label for="d-sc">الكود (ابعته للعميل)</label><div class="dev-row"><input id="d-sc" class="inp" readonly dir="ltr" style="font-size:18px;letter-spacing:1px" value="${esc(cFmt(e.k))}"><button class="btn" id="d-scc" type="button">نسخ الكود</button></div></div>
      <div class="actions" style="margin-top:12px"><button class="btn" id="d-msg" type="button">نسخ رسالة جاهزة للعميل</button></div>`;
    $('#d-scc').onclick = () => copyText($('#d-sc').value, 'تم نسخ الكود');
    $('#d-msg').onclick = () => copyText(eMsg(e), 'تم نسخ الرسالة');
  };
  $('#d-lock').onclick = () => { devKey = null; devSec = null; devUntil = 0; render(); };
  if (on) {
    $('#d-t').onchange = syncForm; $('#d-u').onchange = syncForm; syncForm();
    $('#d-url').onchange = () => { const u = cleanUrl($('#d-url').value); if (!u) return toast('اكتب الرابط كاملاً يبدأ بـ https://'); saveUrl(u); $('#d-url').value = u; toast('تم حفظ رابط الموقع', 'ok'); };
    $('#d-make').onclick = async () => {
      if (!devOpen()) return render();
      const su = cleanUrl($('#d-url').value); if (!su) return toast('اكتب رابط الموقع كاملاً يبدأ بـ https://'); saveUrl(su);
      const p = $('#d-t').value === 'r' ? 'r' : 'd', un = $('#d-u').value, perm = un === 'p';
      const mins = perm ? 0 : Math.round(num($('#d-n').value) * UNIT_MINS[un]);
      if (!perm && !(mins >= MIN_MINS)) return toast('أقل مدة 5 دقائق');
      if (mins > MAX_MINS) return toast('أقصى مدة 10 سنوات — أو اختار «دائم»');
      const now = Date.now(), s = perm || $('#d-s').value === 'a' ? 'a' : 'r', note = $('#d-note').value.trim().slice(0, 40), uname = $('#d-user').value.trim().replace(/\s+/g, ' ').slice(0, 30);
      if (uname && unorm(uname).length < 2) return toast('اسم المستخدم لازم يكون حرفين على الأقل');
      const pl = { v: 2, p, i: b64u(crypto.getRandomValues(new Uint8Array(6))), c: now, m: mins, s, o: s === 'r' ? now + OPEN_DAYS[p] * 864e5 : 0, n: note };
      const mb = $('#d-make'); mb.disabled = true;
      try {
        const pb = TXT_E.encode(JSON.stringify(pl)), sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, devKey, pb));
        const t = b64u(pb) + '.' + b64u(sig), st = dget(); let id; do { id = cRand(4); } while (st.list.some(x => x.k.slice(0, 4) === id));
        const k = id + cRand(12), w = await wrapSecret(usecret(uname, k.slice(4)), TXT_E.encode(JSON.stringify({ p, k: p === 'r' ? devSec.kc : devSec.kt, t })));
        const e = { k, p, i: pl.i, c: now, m: mins, s, o: pl.o, n: note, un: unorm(uname) ? uname : '', w, live: false };
        st.list.unshift(e); dset(st);
        try { await srvPutCode(e); upd(k, x => { x.live = true; x.w = null; }); e.live = true; } catch (x) { toast(srvMsg(x)); }
        keep(); show(e); drawLog(); drawPend(); if (e.live) toast('تم إنشاء الكود — جاهز للاستخدام الآن', 'ok');
      } catch (x) { toast('تعذر إنشاء الكود'); }
      mb.disabled = false;
    };
  }
  drawLog(); drawPend(); srvSync(); srvStatus();
  /* live: the countdowns tick every second, and the server is asked every 15 s whether a customer opened a code */
  const logEl = $('#d-log'), gone = () => !document.body.contains(logEl) || !devOpen();
  const t1 = setInterval(() => { if (gone()) return clearInterval(t1); const now = Date.now() + srvDiff; $$('[data-left]', logEl).forEach(b => { const end = +b.dataset.left; b.textContent = end > now ? dLeft(end - now) : 'انتهت المدة'; }); }, 1000);
  const t2 = setInterval(() => { if (gone()) return clearInterval(t2); if (!document.hidden) srvSync(); }, 15000);
}

/* ---------- Test sample on the designer's copy only: one customer «أحمد محمود (عميل تجريبي)» with two places, 3 invoices, a collection and a deposit. Added ONCE when the developer page first opens (the marker stays even after he deletes it), it is plain data he deletes himself (Settings → data wipe options). ---------- */
function demoSeedOnce() {
  try {
    if (!db || !db.settings || db.settings.demoSeed78) return;
    db.settings.demoSeed78 = 1;
    if (db.customers.some(c => c.id === 'demo-c1')) { save(); return; }
    const D = n => new Date(Date.now() - n * 864e5).toISOString(), NM = 'أحمد محمود (عميل تجريبي)';
    const items = [{ id: 'demo-i1', name: 'أسمنت (تجريبي)', unit: 'طن', qty: 480, cost: 2800, price: 3300, min: 0 }, { id: 'demo-i2', name: 'حديد تسليح (تجريبي)', unit: 'طن', qty: 40, cost: 38000, price: 41000, min: 0 }];
    items.forEach(it => { it.wh = { [WH0]: it.qty }; it.home = WH0; });
    db.items.push(...items);
    db.customers.push({ id: 'demo-c1', name: NM, phone: '01001234567', code: nextCode(db.customers, 'C'), address: 'القاهرة', places: ['عمارة النزهة', 'فيلا التجمع'] });
    const row = (it, q) => ({ itemId: it.id, name: it.name, unit: it.unit, qty: q, price: it.price, cost: it.cost, total: q * it.price, wh: WH0 });
    const mk = (id, no, place, rows, paid, d) => { const net = rows.reduce((s, r) => s + r.total, 0); return { id, no, date: D(d), customerId: 'demo-c1', wh: WH0, name: NM, phone: '01001234567', addr: 'القاهرة', rows, transport: 0, subtotal: net, discPct: 0, discAmt: 0, vatOn: false, vatPct: db.settings.vat, vatAmt: 0, net, paid, over: 0, deposit: 0, kind: 'credit', remaining: net - paid, ...(place ? { place } : {}) }; };
    db.invoices.push(mk('demo-v1', '9001', 'عمارة النزهة', [row(items[0], 2)], 0, 6), mk('demo-v2', '9002', 'فيلا التجمع', [row(items[1], 1)], 5000, 5), mk('demo-v3', '9003', '', [row(items[0], 1)], 0, 4));
    db.payments.push({ id: 'demo-p1', customerId: 'demo-c1', amount: 10000, date: D(2), alloc: [{ inv: 'demo-v2', no: '9002', a: 10000 }] });
    db.bookings.push({ id: 'demo-b1', customerId: 'demo-c1', name: NM, phone: '01001234567', desc: 'عربون حجز أسمنت', amount: 5000, date: D(1), uses: [], refunds: [] });
    save();
  } catch (e) { /* the sample is only a convenience: never stop the program from opening */ }
}
