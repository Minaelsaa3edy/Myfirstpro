/* ---------- Cash receipts (8.49) ----------
   «إيصال استلام نقدية من عميل»  (kind 'in')  — the office received cash from a customer
   «إيصال استلام نقدية من المكتب» (kind 'out') — the customer received cash from the office (a return, what is left of his account…)
   A receipt is a paper to print / save as PDF / send by WhatsApp, kept in a register with its own number. It does NOT change the drawer or the customer's account
   (the money itself is recorded where it always was: «تحصيل» on the invoice / customer page, the expenses, the returns).
   db.vouchers  {id, kind, no, date (YYYY-MM-DD), customerId, name, amount, why, cashier, fm, by, at}   db.vseq {in, out}: the numbers of each kind */

/* ----- the amount in words ----- */
const AR_U = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
const AR_T = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const AR_H = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];
function ar3(n) { /* 1..999 */
  const h = Math.floor(n / 100), r = n % 100, o = [];
  if (h) o.push(AR_H[h]);
  if (r) o.push(r < 20 ? AR_U[r] : (r % 10 ? AR_U[r % 10] + ' و' : '') + AR_T[Math.floor(r / 10)]);
  return o.join(' و');
}
function arWords(n) { /* a whole number, 0 … 999,999,999,999 — written to be followed by the counted noun, so a thousand / million that ends it stands in the annexed form (ألف جنيه, ألفا جنيه) */
  if (n === 0) return 'صفر';
  const sc = (v, one, two, twoA, few, many, last) => v === 1 ? one : v === 2 ? (last ? twoA : two) : v <= 10 ? ar3(v) + ' ' + few : v % 100 === 0 ? (v === 200 ? 'مائتا' : ar3(v)) + ' ' + one : ar3(v) + ' ' + (last ? one : many);
  const b = Math.floor(n / 1e9), m = Math.floor(n % 1e9 / 1e6), th = Math.floor(n % 1e6 / 1e3), r = n % 1e3, o = [];
  const end = r ? 'r' : th ? 'th' : m ? 'm' : 'b';
  if (b) o.push(sc(b, 'مليار', 'ملياران', 'مليارا', 'مليارات', 'مليارًا', end === 'b'));
  if (m) o.push(sc(m, 'مليون', 'مليونان', 'مليونا', 'ملايين', 'مليونًا', end === 'm'));
  if (th) o.push(sc(th, 'ألف', 'ألفان', 'ألفا', 'آلاف', 'ألفًا', end === 'th'));
  if (r) o.push(r === 200 ? 'مائتا' : ar3(r));
  return o.join(' و');
}
const EN_U = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const EN_T = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function en3(n) {
  const h = Math.floor(n / 100), r = n % 100, o = [];
  if (h) o.push(EN_U[h] + ' hundred');
  if (r) o.push(r < 20 ? EN_U[r] : EN_T[Math.floor(r / 10)] + (r % 10 ? '-' + EN_U[r % 10] : ''));
  return o.join(' and ');
}
function enWords(n) {
  if (n === 0) return 'zero';
  const o = [], b = Math.floor(n / 1e9), m = Math.floor(n % 1e9 / 1e6), th = Math.floor(n % 1e6 / 1e3), r = n % 1e3;
  if (b) o.push(en3(b) + ' billion'); if (m) o.push(en3(m) + ' million'); if (th) o.push(en3(th) + ' thousand'); if (r) o.push(en3(r));
  return o.join(' ').replace(/ and (?=.* and )/g, ' ');
}
/* 5,000 -> «فقط خمسة آلاف جنيه مصري لا غير» (English UI: «Five thousand Egyptian pounds only») */
function amtWords(a) {
  a = round2(a); if (!(a > 0) || a > 999999999999) return '';
  const p = Math.floor(a), q = Math.round((a - p) * 100);
  if (LANG === 'en') { const w = (p ? enWords(p) + (p === 1 ? ' Egyptian pound' : ' Egyptian pounds') : '') + (q ? (p ? ' and ' : '') + enWords(q) + (q === 1 ? ' piastre' : ' piastres') : ''); return w.charAt(0).toUpperCase() + w.slice(1) + ' only'; }
  const last = p % 100, jn = p === 1 ? 'جنيه مصري واحد' : p === 2 ? 'جنيهان مصريان' : last >= 3 && last <= 10 ? arWords(p) + ' جنيهات مصرية' : last >= 11 ? arWords(p) + ' جنيهًا مصريًا' : arWords(p) + ' جنيه مصري';
  const ql = q % 100, pq = q === 1 ? 'قرش واحد' : q === 2 ? 'قرشان' : ql >= 3 && ql <= 10 ? arWords(q) + ' قروش' : arWords(q) + ' قرشًا';
  return 'فقط ' + (p ? jn : '') + (q ? (p ? ' و' : '') + pq : '') + ' لا غير';
}

/* ----- the two kinds ----- */
const VCH = {
  in: { menu: 'إيصال استلام نقدية من عميل', paper: 'إيصال استلام نقدية', who: 'استلمنا من السيد / السيدة', nameL: 'اسم العميل (المسلِّم)', whyL: 'مقابل إيه (سبب الاستلام)', how: 'طريقة الاستلام',
    chips: ['سداد فاتورة', 'دفعة على الحساب', 'عربون حجز', 'تحصيل باقي الحساب'], list: 'vchIn', key: 'vchin',
    hint: 'اكتب اسم العميل والمبلغ ومقابل إيه استلمت الفلوس، ويطلع إيصال أبيض جاهز للطباعة والـPDF والواتساب بتوقيع المستلم (أمين الصندوق) والمدير المالي. الإيصال ورقة توثيق فقط: ما بيغيّرش الدرج ولا حساب العميل — التحصيل نفسه بيتسجّل من «تحصيل» في الفاتورة أو صفحة العميل.' },
  out: { menu: 'إيصال استلام نقدية من المكتب للعميل', paper: 'إيصال استلام نقدية من المكتب', who: 'استلم السيد / السيدة', nameL: 'اسم العميل (المستلم)', whyL: 'مقابل إيه (مرتجع / باقي حساب…)', how: 'طريقة التسليم',
    chips: ['مرتجع بضاعة', 'باقي حساب للعميل', 'استرداد عربون'], list: 'vchOut', key: 'vchout',
    hint: 'للفلوس اللي العميل بيستلمها من المكتب (مرتجع أو باقي حساب…): اكتب اسمه والمبلغ والسبب، ويطلع إيصال أبيض بتوقيع العميل (المستلم) وأمين الصندوق والمدير المالي. الإيصال ورقة توثيق فقط: ما بيغيّرش الدرج ولا حساب العميل.' },
};
const vchNext = kind => String(((db.vseq && +db.vseq[kind]) || 0) + 1).padStart(4, '0');

/* ----- the paper: the same markup is read by the PDF drawer (47-pdf.js, the «vch» branch) ----- */
function vchPaper(r) {
  const K = VCH[r.kind], out = r.kind === 'out', fac = facName() || 'المكتب';
  const rows = [[K.who, r.name || '—'], ...(out ? [['المسلِّم (الجهة)', fac]] : []), ['وذلك مقابل', r.why || '—'], [K.how, 'نقدًا']];
  const sg = out ? [['توقيع العميل (المستلم)', r.name], ['أمين الصندوق (المسلِّم)', r.cashier], ['المدير المالي', r.fm]] : [['المستلم — أمين الصندوق', r.cashier], ['المدير المالي', r.fm]];
  return paper(letterhead(letterOf()) + `<div class="vch ${r.kind}">
    <div class="vh"><b class="vtt">${K.paper}</b><span class="vno"><small>رقم</small><b><bdi dir="ltr">${esc(r.no)}</bdi></b></span><span class="vdt"><small>التاريخ</small><b><bdi dir="ltr">${esc(ymd(r.date))}</bdi></b></span></div>
    <div class="vamt"><small>المبلغ</small><b>${money(r.amount || 0)}</b>${r.amount > 0 ? `<em>${esc(amtWords(r.amount))}</em>` : ''}</div>
    <div class="vrows">${rows.map(([k, v]) => `<div class="vr"><small>${k}</small><b>${esc(v)}</b></div>`).join('')}</div>
    <div class="vsg">${sg.map(([k, n]) => `<div><i></i><span>${k}</span>${n ? `<small>${esc(n)}</small>` : ''}</div>`).join('')}</div></div>`, 'inv vchp');
}
function vchMsg(r) {
  const K = VCH[r.kind], L = []; if (facName()) L.push(facName());
  L.push(`${T(K.paper)} ${T('رقم')} ${r.no} — ${ymd(r.date)}`, `${T(K.who)}: ${r.name}`, `${T('المبلغ')}: ${T(money(r.amount))}`);
  const w = amtWords(r.amount); if (w) L.push(w);
  L.push(`${T('وذلك مقابل')}: ${T(r.why)}`); return L.join('\n');
}
const vchFile = r => (VCH[r.kind].paper + '_' + r.no + '_' + r.name).replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_');

/* ----- the screens: a form with a live preview, then the register ----- */
let vchView = { in: '', out: '' };
function vchScreen(v, kind) {
  const K = VCH[kind], today = ymd(new Date()), S = db.settings.vch || {};
  const mine = () => db.vouchers.filter(x => x.kind === kind);
  v.innerHTML = subHead(K.menu) + `<div class="stack">
    <section class="panel"><h2 class="panel-t big">${kind === 'in' ? ICON.vin : ICON.vout}<span>إصدار إيصال جديد</span></h2>
      <p class="lbl" style="margin:0 0 12px;line-height:1.9">${K.hint}</p>
      <div class="form-grid">
        <div class="field"><label for="v-name">${K.nameL}</label><input id="v-name" class="inp" list="v-dl" maxlength="80" autocomplete="off"><datalist id="v-dl">${db.customers.map(c => `<option value="${esc(c.name)}"></option>`).join('')}</datalist></div>
        <div class="field"><label for="v-amt">المبلغ (جنيه)</label><input id="v-amt" class="inp" inputmode="decimal" placeholder="0" autocomplete="off"></div>
        <div class="field"><label for="v-date">التاريخ</label><input id="v-date" class="inp" type="date" value="${today}" max="${today}"></div>
        <div class="field" style="grid-column:1/-1"><label for="v-why">${K.whyL}</label><input id="v-why" class="inp" maxlength="140" autocomplete="off">
          <div class="vchips">${K.chips.map(c => `<button class="mini" type="button" data-chip="${esc(c)}">${c}</button>`).join('')}</div></div>
        <div class="field"><label for="v-cash">اسم أمين الصندوق (اختياري)</label><input id="v-cash" class="inp" maxlength="60" value="${esc(S.cashier || '')}" autocomplete="off"></div>
        <div class="field"><label for="v-fm">اسم المدير المالي (اختياري)</label><input id="v-fm" class="inp" maxlength="60" value="${esc(S.fm || '')}" autocomplete="off"></div>
      </div>
      <div class="note" id="v-hint" hidden style="margin-top:12px"></div>
      <div class="actions" style="margin-top:14px"><button class="btn" id="v-go" type="button">${ICON.save}<span>حفظ وعرض الإيصال</span></button></div></section>
    <section class="panel noprint"><h2 class="panel-t">معاينة الإيصال</h2><div id="v-prev"></div></section>
    <section class="panel"><div class="stats" id="v-st"></div>
      <div class="toolbar" style="margin-top:12px"><input id="v-q" class="inp" placeholder="ابحث برقم الإيصال أو اسم العميل" aria-label="بحث" autocomplete="off" value="${esc(vchView[kind])}"></div>
      <div class="tbl-wrap"><table class="grid cardt"><thead><tr><th>الرقم</th><th>التاريخ</th><th>العميل</th><th>المبلغ</th><th>مقابل</th><th>عرض</th></tr></thead><tbody id="v-body"></tbody></table></div>
      ${db.vouchers.some(x => x.kind === kind) ? docBar(K.key) : ''}</section></div>`;
  const draft = () => ({ kind, no: vchNext(kind), date: $('#v-date').value || today, name: $('#v-name').value.trim(), amount: round2(num($('#v-amt').value)), why: $('#v-why').value.trim(), cashier: $('#v-cash').value.trim(), fm: $('#v-fm').value.trim() });
  const prev = () => { $('#v-prev').innerHTML = vchPaper(draft()); };
  const hint = () => {
    const n = $('#v-name').value.trim(), c = n && db.customers.find(x => x.name === n), h = $('#v-hint');
    if (!c) { h.hidden = true; return; }
    const d = customerDebt(c.id); h.hidden = false;
    h.innerHTML = `<span>عميل مسجّل${c.code ? ' — كود ' + esc(c.code) : ''}${c.phone ? ' — ' + esc(c.phone) : ''}${d > 0 ? ` — المتبقي عليه الآن: ${money(d)}` : ''}</span>`;
  };
  const draw = () => {
    const q = toLat($('#v-q').value.trim()), all = mine(), list = all.slice().reverse().filter(x => !q || x.no.includes(q) || x.name.includes(q));
    $('#v-st').innerHTML = `<div class="stat ${kind === 'in' ? 'pos' : 'neg'}"><span>إجمالي المبالغ (${fmt(all.length)} إيصال)</span><b>${money(round2(all.reduce((s, x) => s + x.amount, 0)))}</b></div><div class="stat"><span>إيصالات هذا الشهر</span><b>${fmt(all.filter(x => x.date.slice(0, 7) === today.slice(0, 7)).length)}</b></div>`;
    $('#v-body').innerHTML = list.map(x => `<tr><td data-l="الرقم">${esc(x.no)}</td><td class="muted" data-l="التاريخ"><bdi dir="ltr">${esc(x.date)}</bdi></td><td class="full">${esc(x.name)}</td><td class="val" data-l="المبلغ">${fmt(x.amount)}</td><td class="full muted">${esc(x.why)}</td><td><button class="mini" data-vv="${x.id}">عرض</button></td></tr>`).join('')
      || `<tr><td colspan="6" class="empty">${all.length ? 'لا توجد نتائج' : 'لم يُصدر أي إيصال بعد.'}</td></tr>`;
    $$('[data-vv]', v).forEach(b => b.onclick = () => go('vchDetail', { id: b.dataset.vv }));
  };
  $('#v-amt').addEventListener('input', e => { e.target.value = cleanNum(e.target.value); });
  ['v-name', 'v-amt', 'v-date', 'v-why', 'v-cash', 'v-fm'].forEach(id => $('#' + id).addEventListener('input', () => { if (id === 'v-name') hint(); prev(); }));
  $('#v-date').addEventListener('change', prev);
  $$('[data-chip]', v).forEach(b => b.onclick = () => { const w = $('#v-why'), c = b.dataset.chip; w.value = w.value.trim() && !w.value.includes(c) ? w.value.trim() + ' — ' + c : c; prev(); w.focus(); });
  $('#v-q').addEventListener('input', e => { vchView[kind] = e.target.value; draw(); });
  $('#v-go').onclick = () => {
    const d = draft();
    if (!d.name) { toast('اكتب اسم العميل'); return $('#v-name').focus(); }
    if (!(d.amount > 0)) { toast('اكتب المبلغ بقيمة أكبر من صفر'); return $('#v-amt').focus(); }
    if (!d.why) { toast(kind === 'in' ? 'اكتب مقابل إيه استلمت المبلغ' : 'اكتب سبب تسليم المبلغ (مرتجع / باقي حساب…)'); return $('#v-why').focus(); }
    if (d.date > today) return toast('التاريخ بعد اليوم');
    const c = db.customers.find(x => x.name === d.name);
    db.vseq[kind] = (+db.vseq[kind] || 0) + 1;
    const rec = Object.assign({ id: uid(), at: new Date().toISOString(), by: CUR_USER ? CUR_USER.name : '', customerId: c ? c.id : null }, d, { no: String(db.vseq[kind]).padStart(4, '0') });
    db.vouchers.push(rec); db.settings.vch = { cashier: d.cashier, fm: d.fm };
    logA('vch_add', `${K.paper} ${rec.no}`, rec.name, money(rec.amount), rec.why); save(); toast('تم حفظ الإيصال', 'ok'); go('vchDetail', { id: rec.id });
  };
  prev(); draw();
}
screens.vchIn = (p, v) => vchScreen(v, 'in');
screens.vchOut = (p, v) => vchScreen(v, 'out');

screens.vchDetail = (p, v) => {
  const r = db.vouchers.find(x => x.id === p.id); if (!r) return back();
  const K = VCH[r.kind], c = r.customerId ? custById(r.customerId) : null;
  v.innerHTML = subHead(K.paper + ' رقم ' + r.no) + `<div class="stack">${vchPaper(r)}
    <div class="actions noprint" style="justify-content:center">
      ${window.claude ? '' : `<button class="btn" id="v-print" type="button">${ICON.printer}<span>طباعة / حفظ PDF</span></button><button class="btn ghost" id="v-pdf" type="button">${ICON.pdf}<span>تصدير PDF</span></button>`}
      <button class="btn ghost" id="v-wa" type="button">${ICON.chat}<span>إرسال واتساب (PDF)</span></button>
      <button class="btn ghost" data-act="go" data-to="${K.list}">كل الإيصالات</button>
      <button class="btn danger" id="v-del" type="button">حذف الإيصال</button>
    </div></div>`;
  const on = (id, fn) => { const b = $(id, v); if (b) b.onclick = fn; };
  on('#v-print', () => printRep(vchFile(r), vchPaper(r), K.paper, r.no));
  on('#v-pdf', () => pdfSave(vchPaper(r), K.paper, r.no));
  on('#v-wa', () => waDoc({ base: K.paper, no: r.no, html: vchPaper(r), phone: (c && c.phone) || '', cap: `${T(K.paper)} ${T('رقم')} ${r.no} — ${T(money(r.amount))}${facName() ? '\n' + facName() : ''}`, full: vchMsg(r), what: `${K.paper} ${r.no}` }));
  on('#v-del', async () => { if (!await confirmBox('', `هل تريد حذف ${K.paper} رقم ${r.no} نهائياً؟ الإيصال ورقة توثيق فقط، فحذفه لا يغيّر الدرج ولا حساب العميل.`, 'حذف')) return; db.vouchers = db.vouchers.filter(x => x.id !== r.id); logA('vch_del', `${K.paper} ${r.no}`, r.name, money(r.amount)); save(); back(); toast('تم حذف الإيصال', 'ok'); });
  docWarm(vchPaper(r), K.paper, r.no);
};

/* ----- the register as a report: print / PDF / Excel ----- */
const vchExport = kind => { const L = db.vouchers.filter(x => x.kind === kind), tot = round2(L.reduce((s, x) => s + x.amount, 0));
  return { name: kind === 'in' ? 'إيصالات_استلام_نقدية_من_العملاء' : 'إيصالات_استلام_نقدية_من_المكتب', head: ['الرقم', 'التاريخ', 'العميل', 'المبلغ', 'مقابل', 'أمين الصندوق', 'المدير المالي'],
    rows: L.map(x => [x.no, ymd(x.date), x.name, x.amount, x.why, x.cashier || '', x.fm || '']), sum: [3],
    info: [['تاريخ التقرير', ymd(new Date())], ['عدد الإيصالات', L.length]], foot: [[['إجمالي المبالغ', fj(tot)]]] }; };
EXPORTS.vchin = () => vchExport('in');
EXPORTS.vchout = () => vchExport('out');
LST_TITLE.vchin = 'تقرير إيصالات استلام النقدية من العملاء'; LST_TITLE.vchout = 'تقرير إيصالات استلام النقدية من المكتب';
LST_PC.vchin = LST_PC.vchout = [0, 1, 2, 3, 4, 5];
EXP_LIST.push(['vchin', 'إيصالات استلام نقدية من العملاء'], ['vchout', 'إيصالات استلام نقدية من المكتب']);
