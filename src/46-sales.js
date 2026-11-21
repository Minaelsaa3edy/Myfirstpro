/* ---------- Sales follow-up: customer details (credit limit, special prices), debts & aging, cheques, WhatsApp messages, numbers dashboard ---------- */
Object.assign(AUD, { cust_edit: 'تعديل بيانات عميل', cust_xfer: 'ترحيل رصيد عميل', cust_place: 'أماكن العميل', limit_over: 'تجاوز الحد الائتماني', chq_add: 'تسجيل شيك', chq_clear: 'تحصيل أو صرف شيك', chq_bounce: 'ارتداد شيك', chq_back: 'إعادة شيك للانتظار', chq_void: 'إلغاء شيك', chq_del: 'حذف شيك', chq_undo: 'تراجع عن تحصيل شيك', wa: 'رسالة واتساب' });

/* ===== WhatsApp: the program opens WhatsApp with a ready message; the person presses send ===== */
const waPhone = s => { let d = toLat(String(s || '')).replace(/\D/g, ''); if (d.startsWith('00')) d = d.slice(2); else if (d.length === 11 && d.startsWith('0')) d = '20' + d.slice(1); return d.length >= 8 ? d : ''; };
function waOpen(phone, text, what) { logA('wa', what); save(); waGo(phone, text); }
function waGo(phone, text) { /* open the chat (or copy the message when the browser blocks the window) */
  const w = window.open('https://wa.me/' + waPhone(phone) + '?text=' + encodeURIComponent(text), '_blank');
  if (w) { try { w.opener = null; } catch (e) { /* nothing to detach */ } return; }
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast('تعذّر فتح واتساب، تم نسخ الرسالة', 'ok'), () => toast('تعذّر فتح واتساب'));
  else toast('تعذّر فتح واتساب');
}
const T = s => trText(s); /* the message follows the program language */
const facName = () => db.settings.company.trim();
function invMsg(r) {
  const L = []; if (facName()) L.push(facName());
  L.push(`${T('فاتورة رقم')} ${r.no} — ${ymd(r.date)}`, `${T('العميل')}: ${T(r.name)}`);
  r.rows.forEach(l => L.push(`• ${T(l.name)} — ${fmtq(l.qty)} ${T(l.unit)} × ${fmt(l.price)} = ${fmt(l.total)}`));
  if (r.transport) L.push(`• ${T('نقل')} = ${fmt(r.transport)}`);
  L.push(`${T('إجمالي الأصناف')}: ${T(money(r.subtotal))}`);
  const pa = round2((r.discAmt || 0) - (r.discCash || 0)); if (pa > 0.004) L.push(`${T('الخصم')}: ${T(money(pa))}`); if (r.discCash > 0.004) L.push(`${T('خصم نقدي')}: ${T(money(r.discCash))}`);
  if (r.vatAmt) L.push(`${T('القيمة المضافة')}: ${T(money(r.vatAmt))}`);
  L.push(`${T('الصافي')}: ${T(money(r.net))}`); invFlow(r).filter(l => !l.iss && !l.info && l.kind !== 'disc').forEach(l => L.push(`${ymd(l.d)} — ${bnX(l.t)}: ${l.neg ? '− ' : ''}${T(money(l.a))}`)); /* what came after issue, every line with its date */
  const left = invLeft(r); if (r.over > 0) L.push(`${T('رصيد العميل')}: ${T('له ' + money(r.over))}`); else if (left > 0) L.push(`${T('المتبقي')}: ${T(money(left))}`);
  L.push(T('شكراً لتعاملكم معنا')); return L.join('\n');
}
function remindMsg(c) {
  const m = settledMap(), open = db.invoices.filter(i => i.customerId === c.id && invLeft(i, m) > 0).sort(byDate), L = [];
  L.push(`${T('السلام عليكم')} ${c.name}${LANG === 'en' ? ',' : '،'}`, `${T('نذكّركم بأن الرصيد المستحق لدينا حتى اليوم')}: ${T(money(customerDebt(c.id)))}`);
  open.slice(0, 8).forEach(i => L.push(`• ${T('فاتورة')} ${i.no} (${ymd(i.date)}): ${T(money(invLeft(i, m)))}`));
  if (open.length > 8) L.push(`… ${T('وفواتير أخرى')}`);
  L.push(T('برجاء التكرّم بالسداد. شكراً لتعاونكم.')); if (facName()) L.push(facName());
  return L.join('\n');
}
/* documents go as PDF files; the short text rides along as the caption (and opens in the chat when the file has to be attached by hand) */
const waInvoice = r => { const c = custById(r.customerId); waDoc({ base: 'فاتورة', no: r.no, html: invPaper(r), phone: r.phone || (c && c.phone) || '', cap: `${T('فاتورة رقم')} ${r.no} — ${T('الصافي')}: ${T(money(r.net))}${facName() ? '\n' + facName() : ''}`, full: invMsg(r), what: `فاتورة ${r.no}` }); };
const waBk = b => { const c = custById(b.customerId), o = bkOpen(b), m = `${T('رصيد العميل')}: ${T(b.name)} — ${T('المتبقي من الرصيد')}: ${T(o ? owe(-o) : 'منتهٍ')}${facName() ? '\n' + facName() : ''}`; waDoc({ base: 'رصيد عميل', no: b.name, html: bkPaper(b), phone: b.phone || (c && c.phone) || '', cap: m, full: m, what: `رصيد ${b.name}` }); };
const waRemind = c => { const m = remindMsg(c); waDoc({ base: 'كشف حساب عميل', no: c.name, html: custPaper(c), phone: c.phone, cap: m, full: m, what: c.name }); };

/* ===== customer details: name, phone, address, credit limit, special prices ===== */
screens.custEdit = (p, v) => {
  const c = db.customers.find(x => x.id === p.id); if (!c) return back();
  const prices = Object.entries(c.prices || {}).filter(([id]) => itemById(id)).map(([id, q]) => ({ id, p: String(q) }));
  v.innerHTML = subHead('بيانات العميل') + `<div class="stack">
    <section class="panel"><h2 class="panel-t">${esc(c.name)}</h2><div class="form-grid">
      <div class="field"><label for="ce-name">اسم العميل</label><input id="ce-name" class="inp" value="${esc(c.name)}" autocomplete="off"></div>
      <div class="field"><label for="ce-code">كود العميل</label><input id="ce-code" class="inp" dir="ltr" value="${esc(c.code || '')}" autocomplete="off"></div>
      <div class="field"><label for="ce-phone">رقم الموبايل</label><input id="ce-phone" class="inp" inputmode="tel" value="${esc(c.phone)}" autocomplete="off"></div>
      <div class="field"><label for="ce-addr">العنوان</label><input id="ce-addr" class="inp" value="${esc(c.address)}" autocomplete="off"></div>
      <div class="field"><label for="ce-lim">الحد الائتماني (جنيه) — صفر لعدم التحديد</label><input id="ce-lim" class="inp" inputmode="decimal" value="${c.limit || ''}" placeholder="0" autocomplete="off"></div></div>
      <p class="lbl" style="margin:12px 0 0">رصيد العميل الحالي: <b>${money(customerDebt(c.id))}</b>. إذا تجاوزت فاتورة آجلة الحد يُطلب الرقم السري للمسؤول.</p></section>
    <section class="panel"><h2 class="panel-t">أسعار خاصة بهذا العميل</h2>
      <p class="lbl" style="margin:0 0 12px;line-height:1.9">عند إصدار فاتورة لهذا العميل يظهر سعره الخاص بدل السعر الأساسي، ويمكنك تعديله داخل الفاتورة.</p>
      <div class="tbl-wrap"><table class="grid cardt"><colgroup><col style="width:40%"><col style="width:20%"><col style="width:28%"><col style="width:12%"></colgroup>
      <thead><tr><th>الصنف</th><th>السعر الأساسي</th><th>السعر الخاص</th><th>حذف</th></tr></thead><tbody id="pr-rows"></tbody></table></div>
      <button class="add-row" id="pr-add" type="button">+ إضافة سعر خاص</button></section>
    <div class="submit"><button class="btn lg" id="ce-save" type="button">${ICON.save}<span>حفظ</span></button></div></div>`;
  const draw = () => {
    $('#pr-rows').innerHTML = prices.map((r, i) => {
      const it = itemById(r.id), used = new Set(prices.map(x => x.id).filter(x => x && x !== r.id));
      const opts = '<option value="">– اختر صنف –</option>' + db.items.filter(x => !used.has(x.id)).map(x => `<option value="${x.id}"${x.id === r.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('');
      return `<tr><td class="full" data-l="الصنف"><div class="sel"><select data-pi="${i}" data-k="id" aria-label="الصنف">${opts}</select></div></td><td class="muted" data-l="السعر الأساسي">${it ? fmt(it.price) : '—'}</td>
        <td data-l="السعر الخاص"><input class="inp ctr" data-pi="${i}" data-k="p" inputmode="decimal" value="${esc(r.p)}" aria-label="السعر الخاص" autocomplete="off"></td>
        <td><button class="del" type="button" data-prdel="${i}" aria-label="حذف السعر الخاص">${ICON.trash}</button></td></tr>`;
    }).join('') || '<tr><td colspan="4" class="empty">لا توجد أسعار خاصة لهذا العميل.</td></tr>';
  };
  v.addEventListener('change', e => { const t = e.target; if (t.dataset.k === 'id') { prices[+t.dataset.pi].id = t.value; draw(); } });
  v.addEventListener('input', e => { const t = e.target; if (t.dataset.k === 'p') { t.value = cleanNum(t.value); prices[+t.dataset.pi].p = t.value; } if (t.id === 'ce-lim') t.value = cleanNum(t.value); });
  v.addEventListener('click', e => {
    const d = e.target.closest('[data-prdel]'); if (d) { prices.splice(+d.dataset.prdel, 1); draw(); return; }
    if (e.target.closest('#pr-add')) { if (!db.items.length) return toast('لا توجد أصناف في المخزن'); prices.push({ id: '', p: '' }); draw(); }
  });
  $('#ce-save').onclick = async () => {
    const nm = $('#ce-name').value.trim(); if (!nm) return toast('اكتب اسم العميل');
    const used = prices.filter(r => r.id || r.p !== '');
    if (used.some(r => !r.id)) return toast('اختر الصنف لكل سعر خاص');
    if (used.some(r => !(num(r.p) > 0))) return toast('اكتب السعر الخاص لكل صنف بقيمة أكبر من صفر');
    const code = cleanCode($('#ce-code').value) || c.code || nextCode(db.customers, 'C'); if (db.customers.some(x => x !== c && x.code === code)) return toast('هذا الكود مستخدم لعميل آخر');
    if (!await requireAdmin()) return;
    c.code = code; c.name = nm; c.phone = toLat($('#ce-phone').value).trim(); c.address = $('#ce-addr').value.trim(); c.limit = Math.max(round2(num($('#ce-lim').value)), 0);
    c.prices = {}; used.forEach(r => { c.prices[r.id] = round2(num(r.p)); });
    logA('cust_edit', nm); save(); back(); toast('تم حفظ بيانات العميل', 'ok');
  };
  draw();
};

/* ===== debts: every open invoice by age (days since it was issued) ===== */
function agingData() {
  const m = settledMap(), rc = retCreditMap(), t0 = dayNum(ymd(new Date())), map = new Map();
  liveInvoices().forEach(i => {
    const left = invLeft(i, m, rc); if (left <= 0) return;
    const cu = i.customerId ? custById(i.customerId) : null, key = cu ? cu.id : 'n:' + i.name;
    let r = map.get(key);
    if (!r) { r = { key, cid: cu ? cu.id : null, name: cu ? cu.name : i.name, phone: cu ? cu.phone : (i.phone || ''), limit: cu ? (cu.limit || 0) : 0, b: [0, 0, 0, 0], total: 0, oldest: 0, first: i.id }; map.set(key, r); }
    const age = Math.max(Math.round(t0 - dayNum(ymd(i.date))), 0), k = age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : 3;
    r.b[k] = round2(r.b[k] + left); r.total = round2(r.total + left); if (age > r.oldest) { r.oldest = age; r.first = i.id; }
  });
  const rows = [...map.values()].sort((a, b) => b.total - a.total), tot = [0, 1, 2, 3].map(k => round2(rows.reduce((s, r) => s + r.b[k], 0)));
  return { rows, tot, all: round2(tot.reduce((s, x) => s + x, 0)), late: round2(tot[1] + tot[2] + tot[3]) };
}
const AGE_H = ['حتى 30 يوم', '31 – 60 يوم', '61 – 90 يوم', 'أكثر من 90 يوم'];
screens.debts = (p, v) => {
  const A = agingData(), over = db.customers.filter(c => c.limit > 0 && customerDebt(c.id) > c.limit).length;
  const cell = x => x ? `<span class="val">${fmt(x)}</span>` : '<span class="muted">—</span>';
  v.innerHTML = subHead('الديون والتحصيل') + `<div class="stack"><section class="panel"><div class="stats">
      <div class="stat neg"><span>إجمالي المديونية</span><b>${money(A.all)}</b></div>
      <div class="stat"><span>متأخر أكثر من 30 يوماً</span><b>${money(A.late)}</b></div>
      <div class="stat"><span>عملاء تجاوزوا الحد الائتماني</span><b>${over}</b></div></div></section>
    <section class="panel"><div class="tbl-wrap"><table class="grid cardt"><thead><tr><th>العميل</th>${AGE_H.map(h => `<th>${h}</th>`).join('')}<th>الإجمالي</th><th>إجراء</th></tr></thead><tbody>${A.rows.map(r => `<tr>
      <td class="full">${r.cid ? `<button class="lnk" data-cs="${r.cid}">${esc(r.name)}</button>` : `${esc(r.name)} <span class="pill info">غير مسجّل</span>`}${r.limit > 0 && r.total > r.limit ? ' <span class="pill bad">تجاوز الحد</span>' : ''}</td>
      ${r.b.map(cell).map((x, k) => `<td data-l="${AGE_H[k]}">${x}</td>`).join('')}<td data-l="الإجمالي"><span class="pill bad">${fmt(r.total)}</span></td>
      <td class="full"><div class="actions" style="justify-content:center;gap:6px">${r.cid ? `<button class="mini" data-pay="${r.cid}">تحصيل</button><button class="mini" data-wa="${r.cid}">تذكير</button><button class="mini" data-rm="${r.cid}">منبّه</button>` : `<button class="mini" data-iv="${r.first}">عرض الفاتورة</button><button class="mini" data-rmi="${r.first}">منبّه</button>`}</div></td></tr>`).join('')
      || '<tr><td colspan="7" class="empty">لا توجد ديون مستحقة.</td></tr>'}</tbody>${A.rows.length ? `<tfoot><tr><td class="tl">الإجمالي</td>${A.tot.map(x => `<td><b>${fmt(x)}</b></td>`).join('')}<td><b>${fmt(A.all)}</b></td><td></td></tr></tfoot>` : ''}</table></div>
      ${A.rows.length ? docBar('aging') : ''}</section></div>`;
  $$('[data-cs]', v).forEach(b => b.onclick = () => go('custDetail', { id: b.dataset.cs }));
  $$('[data-pay]', v).forEach(b => b.onclick = () => collectModal(b.dataset.pay, null, () => render()));
  $$('[data-wa]', v).forEach(b => b.onclick = () => { const c = custById(b.dataset.wa); if (c) waRemind(c); });
  $$('[data-iv]', v).forEach(b => b.onclick = () => go('invDetail', { id: b.dataset.iv }));
  $$('[data-rm]', v).forEach(b => b.onclick = () => alarmCollect(b.dataset.rm, ''));
  $$('[data-rmi]', v).forEach(b => b.onclick = () => alarmCollect('', b.dataset.rmi));
};
function agingPaper() {
  const A = agingData();
  return paper(letterhead(letterOf()) + `<div class="rt"><h3>أعمار الديون</h3><p>حتى تاريخ: ${ymd(new Date())}</p></div>
    <section class="rsec"><table class="rtbl age"><thead><tr><th>العميل</th>${AGE_H.map(h => `<th>${h}</th>`).join('')}<th>الإجمالي</th></tr></thead><tbody>${A.rows.map(r => `<tr><td>${esc(r.name)}</td>${r.b.map(x => `<td>${x ? fmt(x) : '—'}</td>`).join('')}<td class="amt">${fmt(r.total)}</td></tr>`).join('') || '<tr><td colspan="6">لا توجد ديون مستحقة.</td></tr>'}</tbody>
    <tfoot><tr><td class="tl">الإجمالي</td>${A.tot.map(x => `<td class="tv">${fmt(x)}</td>`).join('')}<td class="tv">${fmt(A.all)}</td></tr></tfoot></table></section>`);
}
screens.repAging = (p, v) => {
  v.innerHTML = subHead('أعمار الديون') + `<div class="stack"><section class="panel noprint"><div class="actions">${window.claude ? '<p class="lbl" style="margin:0">الطباعة وحفظ PDF متاحان من الملف الكامل للبرنامج.</p>' : `<button class="btn" id="r-print" type="button">${ICON.printer}<span>طباعة / حفظ PDF</span></button>${exportBtn('aging')}`}</div></section>${agingPaper()}</div>`;
  const pb = $('#r-print'); if (pb) pb.onclick = () => printRep('أعمار_الديون_' + ymd(new Date()));
};

/* ===== cheques: received from customers / issued to suppliers. Money moves in the books only when a cheque is cleared. ===== */
const CHQ_ST = { pending: 'قيد الانتظار', cleared: 'تم', bounced: 'مرتدّ', void: 'ملغي' };
let chqView = { kind: '', st: 'pending' };
const chqAct = ch => ch.kind === 'in' ? 'تحصيل' : 'صرف';
function chqWhen(ch) { const n = daysTo(ch.due); return n < 0 ? `<span class="pill bad">متأخر ${-n} يوم</span>` : n === 0 ? '<span class="pill bad">اليوم</span>' : n <= 7 ? `<span class="pill info">بعد ${n} يوم</span>` : ''; }
screens.cheques = (p, v) => {
  const pend = db.cheques.filter(c => c.status === 'pending'), sum = k => round2(pend.filter(c => c.kind === k).reduce((s, c) => s + c.amount, 0));
  v.innerHTML = subHead('الشيكات') + `<div class="stack"><section class="panel"><div class="stats">
      <div class="stat pos"><span>شيكات واردة قيد الانتظار</span><b>${money(sum('in'))}</b></div>
      <div class="stat neg"><span>شيكات صادرة قيد الانتظار</span><b>${money(sum('out'))}</b></div>
      <div class="stat"><span>مستحقة خلال 7 أيام أو متأخرة</span><b>${pend.filter(c => daysTo(c.due) <= 7).length}</b></div></div></section>
    <section class="panel"><div class="toolbar">
      <div class="sel"><select id="f-kind" aria-label="النوع"><option value="">كل الشيكات</option><option value="in">الواردة</option><option value="out">الصادرة</option></select></div>
      <div class="sel"><select id="f-st" aria-label="الحالة"><option value="">كل الحالات</option>${Object.entries(CHQ_ST).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></div>
      <button class="btn" id="ch-add" type="button">${ICON.plus}<span>تسجيل شيك</span></button></div>
      <div class="tbl-wrap"><table class="grid cardt"><thead><tr><th>النوع</th><th>الشيك</th><th>الطرف</th><th>المبلغ</th><th>الاستحقاق</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody id="ch-rows"></tbody></table></div>
      ${db.cheques.length ? docBar('cheques') : ''}</section></div>`;
  $('#f-kind').value = chqView.kind; $('#f-st').value = chqView.st;
  const draw = () => {
    const list = db.cheques.filter(c => (!chqView.kind || c.kind === chqView.kind) && (!chqView.st || c.status === chqView.st)).sort((a, b) => a.due.localeCompare(b.due));
    $('#ch-rows').innerHTML = list.map(c => `<tr>
      <td data-l="النوع"><span class="pill ${c.kind === 'in' ? 'ok' : 'bad'}">${c.kind === 'in' ? 'وارد' : 'صادر'}</span></td>
      <td data-l="الشيك">${esc(c.no)}${c.bank ? `<br><small class="muted">${esc(c.bank)}</small>` : ''}</td><td data-l="الطرف">${esc(c.name)}${c.note ? `<br><small class="muted">${esc(c.note)}</small>` : ''}</td>
      <td class="val" data-l="المبلغ">${fmt(c.amount)}</td><td data-l="الاستحقاق"><bdi dir="ltr">${esc(c.due)}</bdi>${c.status === 'pending' ? '<br>' + chqWhen(c) : ''}</td>
      <td data-l="الحالة"><span class="pill ${c.status === 'cleared' ? 'ok' : c.status === 'bounced' ? 'bad' : 'info'}">${CHQ_ST[c.status] || c.status}</span>${c.doneAt ? `<br><small class="muted"><bdi dir="ltr">${ymd(c.doneAt)}</bdi></small>` : ''}</td>
      <td class="full"><div class="actions" style="justify-content:center;gap:6px">${c.status === 'pending' ? `<button class="mini" data-ck="clear" data-id="${c.id}">${chqAct(c)}</button><button class="mini" data-ck="bounce" data-id="${c.id}">ارتد</button><button class="mini" data-ck="void" data-id="${c.id}">إلغاء</button>` : ''}${c.status === 'cleared' ? `<button class="mini" data-ck="undo" data-id="${c.id}">تراجع</button>` : ''}${c.status === 'bounced' || c.status === 'void' ? `<button class="mini" data-ck="back" data-id="${c.id}">إعادة للانتظار</button>` : ''}${c.status !== 'cleared' ? `<button class="del" data-ck="del" data-id="${c.id}" aria-label="حذف الشيك">${ICON.trash}</button>` : ''}</div></td></tr>`).join('')
      || `<tr><td colspan="7" class="empty">${db.cheques.length ? 'لا توجد شيكات بهذه الشروط.' : 'لم تُسجَّل أي شيكات بعد.'}</td></tr>`;
    $$('[data-ck]', v).forEach(b => b.onclick = () => chqDo(b.dataset.ck, db.cheques.find(x => x.id === b.dataset.id)));
  };
  $('#f-kind').onchange = e => { chqView.kind = e.target.value; draw(); };
  $('#f-st').onchange = e => { chqView.st = e.target.value; draw(); };
  $('#ch-add').onclick = () => chqAdd();
  draw();
};
function chqAdd() {
  const today = ymd(new Date());
  modal(`<h3>تسجيل شيك</h3>
    <div class="field"><label for="k-kind">النوع</label><div class="sel"><select id="k-kind"><option value="in">شيك وارد من عميل</option><option value="out">شيك صادر لمورد</option></select></div></div>
    <div class="field"><label for="k-party">الطرف</label><div class="sel"><select id="k-party"></select></div></div>
    <div class="field"><label for="k-no">رقم الشيك</label><input id="k-no" class="inp" maxlength="30" autocomplete="off"></div>
    <div class="field"><label for="k-bank">البنك</label><input id="k-bank" class="inp" maxlength="40" autocomplete="off"></div>
    <div class="field"><label for="k-amt">المبلغ (جنيه)</label><input id="k-amt" class="inp" inputmode="decimal" autocomplete="off"></div>
    <div class="field"><label for="k-due">تاريخ الاستحقاق</label><input id="k-due" class="inp" type="date" value="${today}"></div>
    <div class="field"><label for="k-note">ملاحظة (اختياري)</label><input id="k-note" class="inp" maxlength="80" autocomplete="off"></div>
    <div class="actions"><button class="btn" data-ok>حفظ</button><button class="btn ghost" data-no>إلغاء</button></div>`, (d, close) => {
    const fill = () => { const L = $('#k-kind').value === 'in' ? db.customers : db.suppliers; $('#k-party').innerHTML = L.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('') || '<option value="">— لا يوجد —</option>'; };
    fill(); $('#k-kind').onchange = fill; $('#k-amt').addEventListener('input', e => { e.target.value = cleanNum(e.target.value); });
    $('[data-no]', d).onclick = close;
    $('[data-ok]', d).onclick = () => {
      const kind = $('#k-kind').value, pid = $('#k-party').value, party = kind === 'in' ? custById(pid) : supById(pid), no = toLat($('#k-no').value).trim(), bank = $('#k-bank').value.trim(), amt = round2(num($('#k-amt').value)), due = $('#k-due').value;
      if (!party) return toast(kind === 'in' ? 'اختر العميل (أضفه أولاً من «العملاء» إن لم يكن مسجلاً)' : 'اختر المورد (أضفه أولاً من «الموردين» إن لم يكن مسجلاً)');
      if (!no) return toast('اكتب رقم الشيك'); if (!(amt > 0)) return toast('اكتب مبلغ الشيك'); if (!due) return toast('اختر تاريخ الاستحقاق');
      if (db.cheques.some(c => c.kind === kind && c.no === no && c.bank === bank && c.status !== 'void')) return toast('هذا الشيك مسجل بالفعل');
      db.cheques.push({ id: uid(), kind, no, bank, partyId: party.id, name: party.name, amount: amt, due, note: $('#k-note').value.trim(), status: 'pending', created: new Date().toISOString(), doneAt: '', payId: '' });
      logA('chq_add', kind === 'in' ? 'شيك وارد' : 'شيك صادر', no, party.name, money(amt)); save(); close(); render(); toast('تم تسجيل الشيك', 'ok');
    };
  });
}
async function chqDo(a, ch) {
  if (!ch) return;
  const what = [ch.no, ch.name, money(ch.amount)], now = new Date().toISOString();
  if (a === 'clear') {
    if (ch.status !== 'pending') return;
    if (ch.kind === 'in') {
      const c = custById(ch.partyId); if (!c) return toast('العميل غير موجود في السجل');
      const debt = customerDebt(c.id); if (ch.amount > debt + 0.004) return toast(`قيمة الشيك ${money(ch.amount)} أكبر من المتبقي على العميل ${money(debt)}`);
      const pay = { id: uid(), customerId: c.id, amount: ch.amount, date: now, alloc: allocate(c.id, ch.amount), via: 'cheque', chq: ch.id };
      db.payments.push(pay); ch.payId = pay.id;
    } else {
      const s = supById(ch.partyId); if (!s) return toast('المورد غير موجود في السجل');
      const sp = { id: uid(), supplierId: s.id, name: s.name, amount: ch.amount, date: now, kind: supBal(s.id) > 0 ? 'settle' : 'pay', note: `شيك رقم ${ch.no}`, chq: ch.id };
      db.spay.push(sp); ch.payId = sp.id;
    }
    ch.status = 'cleared'; ch.doneAt = now; logA('chq_clear', ch.kind === 'in' ? 'تحصيل شيك وارد' : 'صرف شيك صادر', ...what); save(); render(); toast(ch.kind === 'in' ? 'تم تحصيل الشيك وتسجيله على فواتير العميل' : 'تم صرف الشيك وتسجيل الدفعة للمورد', 'ok');
  } else if (a === 'bounce') {
    if (ch.status !== 'pending') return;
    ch.status = 'bounced'; ch.doneAt = now; logA('chq_bounce', ...what); save(); render(); toast('سُجّل الشيك كمرتدّ', 'ok');
  } else if (a === 'void') {
    if (ch.status !== 'pending') return;
    if (!await confirmBox('', 'سيُلغى هذا الشيك ولا يؤثر على الحسابات. هل تريد المتابعة؟', 'إلغاء الشيك')) return;
    ch.status = 'void'; ch.doneAt = now; logA('chq_void', ...what); save(); render(); toast('تم إلغاء الشيك', 'ok');
  } else if (a === 'back') {
    if (ch.status !== 'bounced' && ch.status !== 'void') return;
    ch.status = 'pending'; ch.doneAt = ''; logA('chq_back', ...what); save(); render(); toast('عاد الشيك إلى قيد الانتظار', 'ok');
  } else if (a === 'undo') {
    if (ch.status !== 'cleared') return;
    const list = ch.kind === 'in' ? db.payments : db.spay, pay = list.find(x => x.id === ch.payId);
    if (pay && isLocked(pay.date)) return toast('تم تحصيل هذا الشيك في فترة مقفولة ولا يمكن التراجع عنه');
    if (pay && ch.kind === 'in' && payVoided(pay) > 0) return toast('جزء من هذا الشيك كان على فاتورة أُلغيت ورُدّ للعميل، فلا يمكن التراجع عنه');
    if (!await confirmBox('', 'سيُحذف التحصيل أو الدفعة الناتجة عن هذا الشيك ويعود الشيك قيد الانتظار. هل تريد المتابعة؟', 'تراجع')) return;
    if (!await requireAdmin('اكتب الرقم السري للمسؤول للتراجع عن الشيك')) return;
    if (pay) { if (ch.kind === 'in') db.payments = db.payments.filter(x => x.id !== pay.id); else db.spay = db.spay.filter(x => x.id !== pay.id); }
    ch.status = 'pending'; ch.doneAt = ''; ch.payId = ''; logA('chq_undo', ...what); save(); render(); toast('تم التراجع، والشيك عاد قيد الانتظار', 'ok');
  } else if (a === 'del') {
    if (ch.status === 'cleared') return;
    if (!await confirmBox('', 'هل أنت متأكد من حذف هذا الشيك؟', 'حذف')) return;
    if (!await requireAdmin()) return;
    db.cheques = db.cheques.filter(x => x.id !== ch.id); logA('chq_del', ...what); save(); render(); toast('تم حذف الشيك', 'ok');
  }
}

/* ===== numbers dashboard ===== */
let dashP = 'm';
const DASH_P = [['m', 'هذا الشهر'], ['30', 'آخر 30 يوماً'], ['y', 'هذه السنة'], ['all', 'كل الفترة']];
function dashRange() {
  const n = new Date(), to = ymd(n);
  if (dashP === '30') return [ymd(new Date(n.getFullYear(), n.getMonth(), n.getDate() - 29)), to];
  if (dashP === 'y') return [n.getFullYear() + '-01-01', to];
  if (dashP === 'all') return ['0000-01-01', '9999-12-31'];
  return [ymd(new Date(n.getFullYear(), n.getMonth(), 1)), to];
}
function dashData(from, to) {
  const inR = d => { const k = ymd(d); return k >= from && k <= to; }, it = new Map(), cu = new Map();
  const add = (map, key, name, unit, q, val, cost) => { const r = map.get(key) || { name, unit, q: 0, val: 0, cost: 0 }; r.q = round3(r.q + q); r.val = round2(r.val + val); r.cost = round2(r.cost + cost); map.set(key, r); };
  liveInvoices().filter(i => inR(i.date)).forEach(i => {
    const f = 1 - (i.discPct || 0) / 100 - (i.discCash && i.subtotal ? i.discCash / i.subtotal : 0);
    i.rows.forEach(l => add(it, l.itemId || l.name, l.name, l.unit, l.qty, l.total * f, l.qty * (l.cost || 0)));
    if (i.kind !== 'cash' || i.customerId) add(cu, i.customerId || 'n:' + i.name, i.name, '', 1, i.net, 0);
  });
  db.returns.filter(r => inR(r.date)).forEach(r => {
    const f = 1 - (r.discPct || 0) / 100 - (r.discCash && r.subtotal ? r.discCash / r.subtotal : 0);
    r.rows.forEach(l => add(it, l.itemId || l.name, l.name, l.unit, -l.qty, -l.total * f, -l.qty * (l.cost || 0)));
    if (r.customerId) add(cu, r.customerId, r.name, '', 0, -r.net, 0);
  });
  const items = [...it.values()].filter(x => x.val > 0).sort((a, b) => b.val - a.val).slice(0, 5);
  const custs = [...cu.entries()].map(([k, x]) => ({ ...x, id: k.startsWith('n:') ? '' : k })).filter(x => x.val > 0).sort((a, b) => b.val - a.val).slice(0, 5);
  return { items, custs };
}
screens.dashboard = (p, v) => {
  const [from, to] = dashRange(), I = incomeData(from, to), D = dashData(from, to), A = agingData();
  const months = [], n = new Date();
  for (let k = 5; k >= 0; k--) { const a = new Date(n.getFullYear(), n.getMonth() - k, 1), z = new Date(n.getFullYear(), n.getMonth() - k + 1, 0); months.push({ t: ymd(a).slice(0, 7), v: incomeData(ymd(a), ymd(z)).netSales }); }
  const top = Math.max(...months.map(m => m.v), 1), debtTot = A.all;
  const pendIn = round2(db.cheques.filter(c => c.status === 'pending' && c.kind === 'in').reduce((s, c) => s + c.amount, 0));
  const soon = db.cheques.filter(c => c.status === 'pending' && daysTo(c.due) <= 14).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 6);
  const late = A.rows.filter(r => r.b[1] + r.b[2] + r.b[3] > 0).map(r => ({ ...r, l: round2(r.b[1] + r.b[2] + r.b[3]) })).sort((a, b) => b.l - a.l).slice(0, 5);
  v.innerHTML = subHead('لوحة الأرقام') + `<div class="stack">
    <section class="panel"><div class="actions" style="margin-bottom:14px">${DASH_P.map(([k, t]) => `<button class="mini${dashP === k ? ' on' : ''}" data-dp="${k}" type="button">${t}</button>`).join('')}</div>
      <div class="stats">
      <div class="stat blue"><span>صافي المبيعات</span><b>${money(I.netSales)}</b></div>
      <div class="stat pos"><span>مجمل الربح</span><b>${money(I.gross)}</b></div>
      <div class="stat neg"><span>المصروفات</span><b>${money(I.expT)}</b></div>
      <div class="stat ${I.net >= 0 ? 'pos' : 'neg'}"><span>صافي الربح</span><b>${money(I.net)}</b></div>
      <div class="stat neg"><span>ديون العملاء الآن</span><b>${money(debtTot)}</b></div>
      <div class="stat"><span>شيكات واردة قيد الانتظار</span><b>${money(pendIn)}</b></div></div></section>
    <div class="dash">
      <section class="panel wide"><h2 class="panel-t">صافي المبيعات آخر 6 شهور</h2><div class="bars">${months.map(m => `<div class="bar"><b>${m.v ? fmt(m.v) : ''}</b><i style="height:${Math.round(m.v / top * 100)}%"></i><span><bdi dir="ltr">${m.t}</bdi></span></div>`).join('')}</div></section>
      <section class="panel"><h2 class="panel-t">أكثر الأصناف مبيعاً</h2><div class="tbl-wrap"><table class="grid cat cardt"><thead><tr><th>الصنف</th><th>الكمية</th><th>المبيعات</th><th>الربح</th></tr></thead><tbody>${D.items.map(x => `<tr><td class="full">${esc(x.name)}</td><td class="muted" data-l="الكمية">${fmtq(x.q)} ${esc(x.unit)}</td><td class="val" data-l="المبيعات">${fmt(x.val)}</td><td data-l="الربح">${fmt(round2(x.val - x.cost))}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">لا توجد مبيعات في هذه الفترة.</td></tr>'}</tbody></table></div></section>
      <section class="panel"><h2 class="panel-t">أكثر العملاء شراءً</h2><div class="tbl-wrap"><table class="grid cat cardt"><thead><tr><th>العميل</th><th>المشتريات</th><th>المتبقي عليه</th></tr></thead><tbody>${D.custs.map(x => `<tr><td class="full">${x.id ? `<button class="lnk" data-cs="${x.id}">${esc(x.name)}</button>` : `<button class="lnk" data-nv="${esc(x.name)}">${esc(x.name)}</button> <span class="pill info">غير مسجّل</span>`}</td><td class="val" data-l="المشتريات">${fmt(x.val)}</td><td data-l="المتبقي عليه">${(() => { const dd = x.id ? customerDebt(x.id) : ((A.rows.find(r => r.key === 'n:' + x.name) || {}).total || 0); return dd ? `<span class="pill bad">${fmt(dd)}</span>` : '<span class="pill ok">لا يوجد</span>'; })()}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">لا توجد مبيعات في هذه الفترة.</td></tr>'}</tbody></table></div></section>
      <section class="panel"><h2 class="panel-t">أكثر العملاء تأخراً في السداد</h2><div class="tbl-wrap"><table class="grid cat cardt"><thead><tr><th>العميل</th><th>المتأخر (أكثر من 30 يوماً)</th><th>أقدم فاتورة</th></tr></thead><tbody>${late.map(r => `<tr><td class="full">${r.cid ? `<button class="lnk" data-cs="${r.cid}">${esc(r.name)}</button>` : `<button class="lnk" data-iv="${r.first}">${esc(r.name)}</button> <span class="pill info">غير مسجّل</span>`}</td><td data-l="المتأخر (أكثر من 30 يوماً)"><span class="pill bad">${fmt(r.l)}</span></td><td class="muted" data-l="أقدم فاتورة">${r.oldest} يوم</td></tr>`).join('') || '<tr><td colspan="3" class="empty">لا يوجد عملاء متأخرون.</td></tr>'}</tbody></table></div></section>
      <section class="panel"><h2 class="panel-t">شيكات تستحق قريباً</h2><div class="tbl-wrap"><table class="grid cat cardt"><thead><tr><th>الشيك</th><th>الطرف</th><th>المبلغ</th><th>الاستحقاق</th></tr></thead><tbody>${soon.map(c => `<tr><td class="full">${esc(c.no)} <span class="pill ${c.kind === 'in' ? 'ok' : 'bad'}">${c.kind === 'in' ? 'وارد' : 'صادر'}</span></td><td data-l="الطرف">${esc(c.name)}</td><td class="val" data-l="المبلغ">${fmt(c.amount)}</td><td data-l="الاستحقاق"><bdi dir="ltr">${esc(c.due)}</bdi> ${chqWhen(c)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">لا توجد شيكات تستحق خلال 14 يوماً.</td></tr>'}</tbody></table></div></section>
    </div></div>`;
  $$('[data-dp]', v).forEach(b => b.onclick = () => { dashP = b.dataset.dp; render(); });
  $$('[data-cs]', v).forEach(b => b.onclick = () => go('custDetail', { id: b.dataset.cs }));
  $$('[data-iv]', v).forEach(b => b.onclick = () => go('invDetail', { id: b.dataset.iv }));
  /* a customer who was never saved in the registry: open his invoice (or the list of his invoices when he has several) */
  $$('[data-nv]', v).forEach(b => b.onclick = () => { const nm = b.dataset.nv, l = liveInvoices().filter(i => !i.customerId && i.kind !== 'cash' && i.name === nm); if (l.length === 1) go('invDetail', { id: l[0].id }); else go('invList', { q: nm }); });
};

/* ===== Excel exports ===== */
EXPORTS.aging = () => { const A = agingData(); return { name: 'أعمار_الديون', head: ['العميل', 'الموبايل', ...AGE_H, 'الإجمالي', 'الحد الائتماني'], rows: A.rows.map(r => [r.name, r.phone, ...r.b, r.total, r.limit || '']), sum: [...AGE_H.map((_, i) => i + 2), 2 + AGE_H.length] }; };
EXPORTS.cheques = () => ({ name: 'الشيكات', head: ['النوع', 'رقم الشيك', 'البنك', 'الطرف', 'المبلغ', 'الاستحقاق', 'الحالة', 'تاريخ التنفيذ', 'ملاحظة'], rows: db.cheques.map(c => [c.kind === 'in' ? 'وارد' : 'صادر', c.no, c.bank || '', c.name, c.amount, c.due, CHQ_ST[c.status] || c.status, c.doneAt ? ymd(c.doneAt) : '', c.note || '']) });
EXP_LIST.push(['aging', 'أعمار الديون'], ['cheques', 'الشيكات']);
