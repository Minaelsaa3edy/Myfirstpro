/* ---------- Quotations (turned into an invoice with one tap) and deliveries (driver, vehicle, fee, status) ---------- */
Object.assign(AUD, { q_add: 'عرض سعر جديد', q_edit: 'تعديل عرض سعر', q_inv: 'تحويل عرض سعر إلى فاتورة', q_void: 'إلغاء عرض سعر', q_del: 'حذف عرض سعر', dl_add: 'تسجيل توصيل', dl_edit: 'تعديل توصيل', dl_st: 'تغيير حالة توصيل', dl_del: 'حذف توصيل' });

/* ===== quotations ===== */
const Q_ST = { open: 'مفتوح', done: 'تحوّل لفاتورة', old: 'منتهي', void: 'ملغي' }, Q_CLS = { open: 'info', done: 'ok', old: 'bad', void: '' };
const qState = q => q.status === 'void' ? 'void' : q.status === 'done' ? 'done' : (q.valid && daysTo(q.valid) < 0 ? 'old' : 'open');
function qTotals(lines, disc, vat) {
  const sub = round2(lines.reduce((s, l) => s + round2(l.total), 0)), dp = Math.min(100, Math.max(0, num(disc))), discAmt = round2(sub * dp / 100), after = round2(sub - discAmt);
  const vatAmt = vat && taxOn() ? round2(after * db.settings.vat / 100) : 0;
  return { sub, dp, discAmt, vatAmt, net: round2(after + vatAmt) };
}
let qf = null; /* the quotation being written */
const qCust = () => qf && qf.cid ? custById(qf.cid) : null;
const qSpecial = id => { const c = qCust(), x = c && c.prices ? +c.prices[id] : 0; return x > 0 ? x : 0; };
const qUnit = r => { const it = itemById(r.itemId); return r.price !== '' ? num(r.price) : (it ? (qSpecial(it.id) || it.price) : 0); };
const qLine = r => round2(round3(num(r.qty)) * qUnit(r));
const qBlank = () => ({ itemId: '', qty: '', price: '' });

screens.quoteForm = (p, v) => {
  const old = p.edit ? db.quotes.find(x => x.id === p.edit) : null;
  if (p.edit && (!old || old.status !== 'open')) return back();
  const c = old ? (old.customerId ? custById(old.customerId) : null) : (p.cid ? custById(p.cid) : null), d7 = new Date(); d7.setDate(d7.getDate() + 7);
  qf = { id: old ? old.id : '', cid: c ? c.id : null, name: old ? old.name : (c ? c.name : ''), phone: old ? (old.phone || '') : (c ? c.phone || '' : ''), addr: old ? (old.addr || '') : (c ? c.address || '' : ''), save: false,
    rows: old && old.rows.some(l => itemById(l.itemId)) ? old.rows.filter(l => itemById(l.itemId)).map(l => ({ itemId: l.itemId, qty: String(l.qty), price: String(l.price) })) : [qBlank()],
    disc: old ? String(old.discPct || 0) : '0', vat: old ? !!old.vatOn && taxOn() : false, valid: old ? (old.valid || '') : ymd(d7), note: old ? old.note || '' : '' };
  v.innerHTML = subHead(old ? 'تعديل عرض سعر رقم ' + old.no : 'عرض سعر جديد') + `<div class="stack">
    <section class="panel"><div class="field" style="max-width:360px;margin-bottom:12px"><label for="q-cust">العميل</label><div class="sel"><select id="q-cust"><option value="">عميل جديد / غير مسجل</option>${db.customers.map(x => `<option value="${x.id}"${qf.cid === x.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div></div>
      <div class="cust">
        <input id="q-name" class="inp" data-qf="name" placeholder="اسم العميل" aria-label="اسم العميل" value="${esc(qf.name)}" autocomplete="off">
        <input id="q-phone" class="inp" data-qf="phone" placeholder="رقم الموبايل" aria-label="رقم الموبايل" inputmode="tel" value="${esc(qf.phone)}" autocomplete="off">
        <input id="q-addr" class="inp" data-qf="addr" placeholder="العنوان" aria-label="العنوان" value="${esc(qf.addr)}" autocomplete="off">
        <label class="chk" id="q-saveBox"><input type="checkbox" id="q-save"><i>${ICON.check}</i><span>حفظ في السجل</span></label>
      </div></section>
    <section class="panel"><h2 class="panel-t">أصناف العرض</h2>
      <div class="tbl-wrap"><table class="tbl items-t"><colgroup><col style="width:33%"><col style="width:20%"><col style="width:25%"><col style="width:14%"><col style="width:8%"></colgroup>
        <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th><th>حذف</th></tr></thead><tbody id="q-rows"></tbody></table></div>
      <button class="add-row" id="q-addRow" type="button">+ إدراج صنف جديد</button></section>
    <div class="two">
      <section class="panel"><h2 class="panel-t big">${ICON.coins}<span>الخصم والصلاحية</span></h2><div class="pay">
        <div class="field"><label for="q-disc">قيمة الخصم (%)</label><div class="iconin"><input id="q-disc" class="inp" inputmode="decimal" value="${esc(qf.disc)}" autocomplete="off"><span class="pct">%</span></div></div>
        ${taxOn() ? `<label class="chk"><input type="checkbox" id="q-vat"${qf.vat ? ' checked' : ''}><i>${ICON.check}</i><span>إضافة قيمة مضافة (${db.settings.vat}%)</span></label>` : ''}
        <div class="field"><label for="q-valid">صالح حتى (اتركه فارغاً بدون مدة)</label><input id="q-valid" class="inp" type="date" value="${esc(qf.valid)}"></div>
        <div class="field"><label for="q-note">ملاحظات تظهر في العرض (اختياري)</label><input id="q-note" class="inp" data-qf="note" maxlength="160" value="${esc(qf.note)}" autocomplete="off"></div></div></section>
      <section class="panel"><h2 class="panel-t big blue">${ICON.docDollar}<span>ملخص العرض</span></h2>
        <div class="sum-row"><span>إجمالي الأصناف:</span><b id="q-sub">0 جنيه</b></div><div class="sum-row red"><span>الخصم (%):</span><b id="q-dsp">0 %</b></div>
        <div class="sum-row" id="q-vatRow" hidden><span>القيمة المضافة (${db.settings.vat}%):</span><b id="q-vatv">0 جنيه</b></div>
        <div class="net"><span>الصافي:</span><b id="q-net">0 جنيه</b></div></section></div>
    <div class="submit"><button class="btn lg" id="q-go" type="button">${old ? 'حفظ التعديل' : 'حفظ عرض السعر'}</button></div></div>`;
  qDraw(); qCalc(); qLock();
  const f = $('.stack', v);
  f.addEventListener('input', qInput); f.addEventListener('change', qChange);
  f.addEventListener('click', e => {
    const d = e.target.closest('[data-q-del]');
    if (d) { qf.rows.splice(+d.dataset.qDel, 1); if (!qf.rows.length) qf.rows.push(qBlank()); qDraw(); qCalc(); return; }
    if (e.target.closest('#q-addRow')) { qf.rows.push(qBlank()); qDraw(); qCalc(); return; }
    if (e.target.closest('#q-go')) qSave();
  });
};
function qLock() { /* a registered customer's details are fixed; a new one can be saved to the register */
  const c = qCust(); ['#q-name', '#q-phone', '#q-addr'].forEach(q => { $(q).readOnly = !!c; });
  $('#q-saveBox').hidden = !!c;
}
function qDraw() {
  $('#q-rows').innerHTML = qf.rows.map((r, i) => {
    const it = itemById(r.itemId), sp = it ? qSpecial(it.id) : 0, ph = it ? (sp ? `سعر خاص لل${it.unit} ${round2(sp)} جنيه` : `سعر ال${it.unit} ${round2(it.price)} جنيه`) : 'السعر';
    const o = ['<option value="">– اختر صنف –</option>'].concat(db.items.map(x => `<option value="${x.id}"${x.id === r.itemId ? ' selected' : ''}>${esc(itemLbl(x))}</option>`)).join('');
    return `<tr><td data-l="الصنف"><div class="sel"><select id="q${i}-item" data-qr="${i}" data-qk="item" aria-label="الصنف">${o}</select></div></td>
      <td data-l="الكمية"><input id="q${i}-qty" class="ctr" data-qr="${i}" data-qk="qty" inputmode="decimal" placeholder="الكمية" aria-label="الكمية" value="${esc(r.qty)}" autocomplete="off"></td>
      <td data-l="السعر"><input id="q${i}-price" class="ctr" data-qr="${i}" data-qk="price" inputmode="decimal" placeholder="${esc(ph)}" aria-label="السعر" value="${esc(r.price)}" autocomplete="off"></td>
      <td class="rt" data-l="الإجمالي" id="q${i}-tot">${fmt(qLine(r))}</td><td><button class="del" type="button" data-q-del="${i}" aria-label="حذف الصف">${ICON.trash}</button></td></tr>`;
  }).join('');
}
const qLines = () => qf.rows.filter(r => r.itemId && num(r.qty) > 0).map(r => { const it = itemById(r.itemId), price = round2(qUnit(r)), qty = round3(num(r.qty)); return { itemId: it.id, name: it.name, unit: it.unit, qty, price, total: round2(qty * price) }; });
function qCalc() {
  const t = qTotals(qLines(), qf.disc, qf.vat);
  qf.rows.forEach((r, i) => { const el = $('#q' + i + '-tot'); if (el) el.textContent = fmt(qLine(r)); });
  $('#q-sub').textContent = money(t.sub); $('#q-dsp').textContent = fmt(t.dp) + ' %'; $('#q-vatRow').hidden = !(qf.vat && taxOn()); $('#q-vatv').textContent = money(t.vatAmt); $('#q-net').textContent = money(t.net);
}
function qInput(e) {
  const t = e.target;
  if (t.dataset.qf) { qf[t.dataset.qf] = t.value; return; }
  if (t.dataset.qr !== undefined && t.dataset.qk !== 'item') { t.value = cleanNum(t.value); qf.rows[+t.dataset.qr][t.dataset.qk] = t.value; qCalc(); return; }
  if (t.id === 'q-disc') { t.value = cleanNum(t.value); if (num(t.value) > 100) t.value = '100'; qf.disc = t.value; qCalc(); }
}
function qChange(e) {
  const t = e.target;
  if (t.id === 'q-cust') {
    const c = t.value ? custById(t.value) : null; qf.cid = c ? c.id : null;
    if (c) { qf.name = c.name; qf.phone = c.phone || ''; qf.addr = c.address || ''; } else { qf.name = ''; qf.phone = ''; qf.addr = ''; }
    $('#q-name').value = qf.name; $('#q-phone').value = qf.phone; $('#q-addr').value = qf.addr; qLock(); qDraw(); qCalc(); return;
  }
  if (t.id === 'q-save') { qf.save = t.checked; return; }
  if (t.id === 'q-vat') { qf.vat = t.checked; qCalc(); return; }
  if (t.id === 'q-valid') { qf.valid = t.value; return; }
  if (t.dataset.qr !== undefined && t.dataset.qk === 'item') { const r = qf.rows[+t.dataset.qr]; r.itemId = t.value; r.price = ''; qDraw(); qCalc(); }
}
function qSave() {
  const name = qf.name.trim(); if (!name) { toast('اكتب اسم العميل'); return $('#q-name').focus(); }
  const lines = qLines(); if (!lines.length) return toast('أضف صنفاً واحداً على الأقل بكمية صحيحة');
  if (lines.some(l => !(l.price > 0))) return toast('اكتب سعراً أكبر من صفر لكل صنف');
  if (qf.valid && qf.valid < ymd(new Date())) return toast('تاريخ الصلاحية قبل اليوم');
  const t = qTotals(lines, qf.disc, qf.vat), old = qf.id ? db.quotes.find(x => x.id === qf.id) : null;
  if (qf.id && (!old || old.status !== 'open')) return toast('لا يمكن تعديل هذا العرض');
  let cid = qf.cid; const phone = toLat(qf.phone).trim();
  if (!cid && qf.save) {
    let c = db.customers.find(x => (phone && x.phone === phone) || x.name === name);
    if (c) { c.name = name; if (phone) c.phone = phone; if (qf.addr.trim()) c.address = qf.addr.trim(); } else { c = { id: uid(), name, phone, address: qf.addr.trim(), limit: 0, prices: {} }; db.customers.push(c); }
    cid = c.id;
  }
  const f = { customerId: cid || null, name, phone, addr: qf.addr.trim(), rows: lines, subtotal: t.sub, discPct: t.dp, discAmt: t.discAmt, vatOn: qf.vat && taxOn(), vatPct: db.settings.vat, vatAmt: t.vatAmt, net: t.net, valid: qf.valid || '', note: qf.note.trim() };
  let rec;
  if (old) { Object.assign(old, f, { edited: new Date().toISOString() }); rec = old; logA('q_edit', `عرض سعر ${rec.no}`, name, money(rec.net)); }
  else { db.qseq += 1; rec = Object.assign({ id: uid(), no: String(db.qseq).padStart(4, '0'), date: new Date().toISOString(), status: 'open', invNo: '', by: CUR_USER ? CUR_USER.name : '' }, f); db.quotes.push(rec); logA('q_add', `عرض سعر ${rec.no}`, name, money(rec.net)); }
  save(); toast(old ? 'تم حفظ التعديل' : 'تم حفظ عرض السعر', 'ok'); go('quoteDetail', { id: rec.id }, { replace: true });
}

function quotePaper(q) {
  const st = qState(q), who = esc(q.name) + (q.phone ? ' • ' + esc(q.phone) : '') + (q.addr ? ' • ' + esc(q.addr) : '');
  const ln = (a, b, c = '') => `<div class="l${c ? ' ' + c : ''}"><span>${a}</span><b>${b}</b></div>`;
  return paper(letterhead(letterOf()) + `<div class="rt"><h3>عرض سعر</h3></div>` +
    `<div class="ibox"><span>اسم العميل: <b>${who}</b></span><span>عرض سعر رقم: <b><bdi dir="ltr">${esc(q.no)}</bdi></b></span><span>التاريخ: <b><bdi dir="ltr">${ymd(q.date)}</bdi></b></span>${q.valid ? `<span>صالح حتى: <b><bdi dir="ltr">${esc(q.valid)}</bdi></b></span>` : ''}</div>` +
    `<table class="itbl"><colgroup><col style="width:34%"><col style="width:16%"><col style="width:25%"><col style="width:25%"></colgroup><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>` +
    q.rows.map(l => `<tr><td class="nm">${esc(l.name)}</td><td>${fmtq(l.qty)} ${esc(l.unit)}</td><td>${money(l.price)}</td><td>${money(l.total)}</td></tr>`).join('') + `</tbody></table>` +
    `<div class="isum"><div class="ic">${ln('إجمالي الأصناف:', money(q.subtotal))}${q.discPct ? ln(`الخصم (${fmt(q.discPct)}%):`, '− ' + money(q.discAmt)) : ''}${q.vatOn ? ln(`القيمة المضافة (${q.vatPct}%):`, money(q.vatAmt)) : ''}</div><div class="ic">${ln('الصافي:', money(q.net), 'big')}</div></div>` +
    (q.note ? `<p class="qnt">${esc(q.note)}</p>` : '') + (q.valid ? `<p class="qnt">الأسعار سارية حتى ${esc(q.valid)}.</p>` : '') +
    (st === 'void' ? `<div class="vstamp">ملغي</div>` : ''), 'inv' + (st === 'void' ? ' void' : ''));
}
function quoteMsg(q) {
  const L = []; if (facName()) L.push(facName());
  L.push(`${T('عرض سعر رقم')} ${q.no} — ${ymd(q.date)}`, `${T('العميل')}: ${q.name}`);
  q.rows.forEach(l => L.push(`• ${T(l.name)} — ${fmtq(l.qty)} ${T(l.unit)} × ${fmt(l.price)} = ${fmt(l.total)}`));
  L.push(`${T('إجمالي الأصناف')}: ${T(money(q.subtotal))}`); if (q.discAmt) L.push(`${T('الخصم')}: ${T(money(q.discAmt))}`); if (q.vatAmt) L.push(`${T('القيمة المضافة')}: ${T(money(q.vatAmt))}`);
  L.push(`${T('الصافي')}: ${T(money(q.net))}`); if (q.valid) L.push(`${T('الأسعار سارية حتى')} ${q.valid}`);
  L.push(T('شكراً لتعاملكم معنا')); return L.join('\n');
}
screens.quoteDetail = (p, v) => {
  const q = db.quotes.find(x => x.id === p.id); if (!q) return back();
  const st = qState(q), cust = q.customerId ? custById(q.customerId) : null, iv = q.invNo ? db.invoices.find(x => x.no === q.invNo && x.status !== 'void') : null;
  v.innerHTML = subHead('عرض سعر رقم ' + q.no) + `<div class="stack">${quotePaper(q)}
    ${iv ? `<section class="panel noprint"><p class="lbl" style="margin:0">تحوّل هذا العرض إلى الفاتورة رقم <button class="lnk" data-iv="${iv.id}">${esc(iv.no)}</button>.</p></section>` : ''}
    ${st === 'old' ? `<section class="panel noprint"><p class="lbl" style="margin:0">انتهت صلاحية هذا العرض. يمكنك تعديله لتمديد المدة أو تحويله كما هو.</p></section>` : ''}
    <div class="actions noprint" style="justify-content:center">
      ${q.status === 'open' ? `<button class="btn" id="q-conv" type="button">${ICON.plus}<span>تحويل إلى فاتورة</span></button><button class="btn outline" id="q-edit" type="button">تعديل</button><button class="btn danger" id="q-void" type="button">إلغاء العرض</button>` : ''}
      ${q.status === 'void' ? `<button class="btn danger" id="q-del" type="button">حذف العرض</button>` : ''}
      <button class="btn ghost" data-act="go" data-to="quotes">كل العروض</button>
      ${window.claude ? '' : `<button class="btn ghost" id="q-print" type="button">${ICON.printer}<span>طباعة / حفظ PDF</span></button>`}
      ${q.status !== 'void' ? `<button class="btn ghost" id="q-wa" type="button">${ICON.chat}<span>إرسال واتساب (PDF)</span></button>` : ''}
    </div></div>`;
  const on = (id, fn) => { const b = $(id, v); if (b) b.onclick = fn; };
  $$('[data-iv]', v).forEach(b => b.onclick = () => go('invDetail', { id: b.dataset.iv }));
  on('#q-conv', () => go('invForm', { mode: cust ? 'existing' : 'new', cid: cust ? cust.id : null, q: q.id }));
  on('#q-edit', () => go('quoteForm', { edit: q.id }));
  on('#q-void', async () => { if (!await confirmBox('', `سيُلغى عرض السعر رقم ${q.no} ولا يمكن تحويله إلى فاتورة. هل تريد المتابعة؟`, 'إلغاء العرض')) return; q.status = 'void'; logA('q_void', `عرض سعر ${q.no}`, q.name); save(); render(); toast('تم إلغاء العرض', 'ok'); });
  on('#q-del', async () => { if (!await confirmBox('', 'هل تريد حذف هذا العرض نهائياً؟', 'حذف')) return; db.quotes = db.quotes.filter(x => x.id !== q.id); logA('q_del', `عرض سعر ${q.no}`, q.name); save(); back(); toast('تم حذف العرض', 'ok'); });
  on('#q-print', () => printRep(('عرض_سعر_' + q.name + '_' + ymd(q.date)).replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_')));
  on('#q-wa', () => waDoc({ base: 'عرض سعر', no: q.no, html: quotePaper(q), phone: q.phone || (cust && cust.phone) || '', cap: `${T('عرض سعر رقم')} ${q.no} — ${T('الصافي')}: ${T(money(q.net))}${facName() ? '\n' + facName() : ''}`, full: quoteMsg(q), what: `عرض سعر ${q.no}` }));
  docWarm(quotePaper(q), 'عرض سعر', q.no);
};
let qView = { st: '', q: '' };
screens.quotes = (p, v) => {
  const open = db.quotes.filter(q => qState(q) === 'open'), val = round2(open.reduce((s, q) => s + q.net, 0)), done = db.quotes.filter(q => q.status === 'done'), rate = db.quotes.length ? Math.round(done.length / db.quotes.length * 100) : 0;
  v.innerHTML = subHead('عروض الأسعار') + `<div class="stack">
    <section class="panel"><div class="stats"><div class="stat blue"><span>عروض مفتوحة</span><b>${fmt(open.length)}</b></div><div class="stat"><span>قيمة العروض المفتوحة</span><b>${money(val)}</b></div>
      <div class="stat pos"><span>تحوّلت لفواتير</span><b>${fmt(done.length)}</b></div><div class="stat"><span>نسبة التحويل</span><b>${rate}%</b></div></div></section>
    <section class="panel"><div class="toolbar"><input id="q-q" class="inp" placeholder="ابحث برقم العرض أو اسم العميل" aria-label="بحث" autocomplete="off" value="${esc(qView.q)}">
      <div class="sel"><select id="q-st" aria-label="الحالة"><option value="">كل الحالات</option>${Object.entries(Q_ST).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></div>
      <button class="btn" id="q-new" type="button">${ICON.plus}<span>عرض سعر جديد</span></button></div>
      <div class="tbl-wrap"><table class="grid cardt"><thead><tr><th>الرقم</th><th>التاريخ</th><th>العميل</th><th>الصافي</th><th>صالح حتى</th><th>الحالة</th><th>عرض</th></tr></thead><tbody id="q-body"></tbody></table></div>
      ${db.quotes.length ? docBar('quotes') : ''}</section></div>`;
  $('#q-st').value = qView.st;
  const draw = () => {
    const q = toLat($('#q-q').value.trim()), list = db.quotes.slice().reverse().filter(x => (!qView.st || qState(x) === qView.st) && (!q || x.no.includes(q) || x.name.includes(q)));
    $('#q-body').innerHTML = list.map(x => { const s = qState(x); return `<tr><td data-l="الرقم">${esc(x.no)}</td><td class="muted" data-l="التاريخ">${dateTimeAr(x.date)}</td><td class="full">${esc(x.name)}</td><td class="val" data-l="الصافي">${fmt(x.net)}</td>
      <td data-l="صالح حتى">${x.valid ? `<bdi dir="ltr">${esc(x.valid)}</bdi>` : '—'}</td><td data-l="الحالة"><span class="pill ${Q_CLS[s]}">${Q_ST[s]}</span></td><td><button class="mini" data-qv="${x.id}">عرض</button></td></tr>`; }).join('')
      || `<tr><td colspan="7" class="empty">${db.quotes.length ? 'لا توجد نتائج' : 'لم تُكتب أي عروض أسعار بعد.'}</td></tr>`;
    $$('[data-qv]', v).forEach(b => b.onclick = () => go('quoteDetail', { id: b.dataset.qv }));
  };
  $('#q-q').addEventListener('input', e => { qView.q = e.target.value; draw(); }); $('#q-st').onchange = e => { qView.st = e.target.value; draw(); };
  $('#q-new').onclick = () => go('quoteForm', {}); draw();
};

/* ===== deliveries ===== */
const DL_ST = { pending: 'بانتظار الخروج', out: 'في الطريق', done: 'تم التسليم', cancel: 'ملغي' }, DL_CLS = { pending: 'info', out: 'bad', done: 'ok', cancel: '' };
const DL_NEXT = { pending: ['out', 'done', 'cancel'], out: ['done', 'pending', 'cancel'], done: ['out'], cancel: ['pending'] };
const DL_ACT = { out: 'خرج للتوصيل', done: 'تم التسليم', cancel: 'إلغاء', pending: 'إعادة للانتظار' };
const dlOf = invId => db.deliveries.filter(x => x.invId === invId);
const dlWho = x => `${esc(x.name)}${x.addr ? `<br><small class="muted">${esc(x.addr)}</small>` : ''}`;
function delivForm(opt = {}) {
  const old = opt.edit ? db.deliveries.find(x => x.id === opt.edit) : null; if (opt.edit && (!old || old.status === 'done')) return;
  const inv0 = old ? (old.invId ? db.invoices.find(i => i.id === old.invId) : null) : opt.inv || null, today = ymd(new Date());
  const drivers = [...new Set(db.deliveries.map(x => x.driver).filter(Boolean))], vehicles = [...new Set(db.deliveries.map(x => x.vehicle).filter(Boolean))];
  const invs = db.invoices.filter(i => i.status !== 'void').slice(-60).reverse();
  modal(`<h3>${old ? 'تعديل توصيل' : 'تسجيل توصيل'}</h3>
    <div class="field"><label for="d-inv">الفاتورة</label><div class="sel"><select id="d-inv"${old ? ' disabled' : ''}><option value="">بدون فاتورة</option>${invs.map(i => `<option value="${i.id}"${inv0 && inv0.id === i.id ? ' selected' : ''}>${esc(i.no)} — ${esc(i.name)} — ${money(i.net)}</option>`).join('')}</select></div></div>
    <div class="field"><label for="d-name">العميل</label><input id="d-name" class="inp" maxlength="60" value="${esc(old ? old.name : inv0 ? inv0.name : '')}" autocomplete="off"></div>
    <div class="field"><label for="d-phone">الموبايل</label><input id="d-phone" class="inp" inputmode="tel" value="${esc(old ? old.phone || '' : inv0 ? inv0.phone || '' : '')}" autocomplete="off"></div>
    <div class="field"><label for="d-addr">عنوان التسليم</label><input id="d-addr" class="inp" maxlength="120" value="${esc(old ? old.addr || '' : inv0 ? inv0.addr || '' : '')}" autocomplete="off"></div>
    <div class="field"><label for="d-date">موعد التوصيل</label><input id="d-date" class="inp" type="date" value="${esc(old ? old.date : today)}"></div>
    <div class="field"><label for="d-driver">السائق</label><input id="d-driver" class="inp" list="d-drivers" maxlength="40" value="${esc(old ? old.driver || '' : '')}" autocomplete="off"><datalist id="d-drivers">${drivers.map(x => `<option value="${esc(x)}">`).join('')}</datalist></div>
    <div class="field"><label for="d-veh">اسم أو رقم العربية</label><input id="d-veh" class="inp" list="d-vehs" maxlength="40" value="${esc(old ? old.vehicle || '' : '')}" autocomplete="off"><datalist id="d-vehs">${vehicles.map(x => `<option value="${esc(x)}">`).join('')}</datalist></div>
    <div class="field"><label for="d-fee">أجرة التوصيل (جنيه)</label><input id="d-fee" class="inp" inputmode="decimal" value="${old && old.fee ? old.fee : ''}" placeholder="0" autocomplete="off"></div>
    <label class="chk"><input type="checkbox" id="d-exp"${!old || old.exp ? ' checked' : ''}><i>${ICON.check}</i><span>تسجيل الأجرة كمصروف عند التسليم</span></label>
    <div class="field" style="margin-top:10px"><label for="d-note">ملاحظة (اختياري)</label><input id="d-note" class="inp" maxlength="100" value="${esc(old ? old.note || '' : '')}" autocomplete="off"></div>
    <div class="actions"><button class="btn" data-ok>حفظ</button><button class="btn ghost" data-no>إلغاء</button></div>`, (d, close) => {
    $('#d-fee').addEventListener('input', e => { e.target.value = cleanNum(e.target.value); });
    $('#d-inv').onchange = e => { const i = db.invoices.find(x => x.id === e.target.value); if (i) { $('#d-name').value = i.name; $('#d-phone').value = i.phone || ''; $('#d-addr').value = i.addr || ''; } };
    $('[data-no]', d).onclick = close;
    $('[data-ok]', d).onclick = () => {
      const name = $('#d-name').value.trim(), date = $('#d-date').value; if (!name) return toast('اكتب اسم العميل'); if (!date) return toast('اختر موعد التوصيل');
      const iv = old ? (old.invId ? db.invoices.find(i => i.id === old.invId) : null) : db.invoices.find(i => i.id === $('#d-inv').value);
      const f = { invId: iv ? iv.id : '', invNo: iv ? iv.no : '', name, phone: toLat($('#d-phone').value).trim(), addr: $('#d-addr').value.trim(), date, driver: $('#d-driver').value.trim(), vehicle: $('#d-veh').value.trim(), fee: Math.max(round2(num($('#d-fee').value)), 0), exp: $('#d-exp').checked, note: $('#d-note').value.trim() };
      let rec; if (old) { Object.assign(old, f); rec = old; logA('dl_edit', name, iv ? `فاتورة ${iv.no}` : '', f.driver); }
      else { rec = Object.assign({ id: uid(), status: 'pending', created: new Date().toISOString(), outAt: '', doneAt: '', expId: '' }, f); db.deliveries.push(rec); logA('dl_add', name, iv ? `فاتورة ${iv.no}` : '', f.driver); }
      save(); close(); toast('تم حفظ التوصيل', 'ok'); if (cur.name === 'invDetail' || cur.name === 'deliveries' || cur.name === 'delivDetail') render(); else go('delivDetail', { id: rec.id });
    };
  });
}
async function dlStep(d, to) {
  if (!DL_NEXT[d.status].includes(to)) return; const from = d.status, now = new Date().toISOString(), what = [d.name, d.invNo ? `فاتورة ${d.invNo}` : '', DL_ST[to]];
  if (from === 'done') {
    const ex = d.expId ? db.expenses.find(x => x.id === d.expId) : null;
    if (ex && isLocked(ex.date)) return toast('أجرة هذا التوصيل سُجّلت في فترة مقفولة ولا يمكن التراجع');
    if (!await confirmBox('', `سيعود التوصيل «في الطريق»${ex ? ' وتُحذف أجرته من المصروفات' : ''}. هل تريد المتابعة؟`, 'تراجع')) return;
    if (ex) db.expenses = db.expenses.filter(x => x.id !== ex.id); d.expId = ''; d.doneAt = '';
  }
  if (to === 'cancel' && !await confirmBox('', 'سيُلغى هذا التوصيل. هل تريد المتابعة؟', 'إلغاء التوصيل')) return;
  if (to === 'out') d.outAt = d.outAt || now;
  if (to === 'done') {
    d.doneAt = now;
    if (d.exp && d.fee > 0 && !d.expId) { const ex = { id: uid(), date: now, title: `توصيل${d.invNo ? ' فاتورة ' + d.invNo : ''}`, amount: d.fee, note: [d.driver, d.vehicle].filter(Boolean).join(' — '), cat: 'misc', delivId: d.id }; db.expenses.push(ex); d.expId = ex.id; }
  }
  d.status = to; logA('dl_st', ...what); save(); render(); toast(to === 'done' ? 'تم تسجيل التسليم' : 'تم تغيير الحالة', 'ok');
}
function delivPaper(d) {
  const iv = d.invId ? db.invoices.find(i => i.id === d.invId) : null;
  return paper(letterhead(letterOf()) + `<div class="rt"><h3>إذن تسليم</h3></div>` +
    `<div class="ibox"><span>اسم العميل: <b>${esc(d.name)}${d.phone ? ' • ' + esc(d.phone) : ''}</b></span>${d.invNo ? `<span>فاتورة رقم: <b><bdi dir="ltr">${esc(d.invNo)}</bdi></b></span>` : ''}<span>موعد التوصيل: <b><bdi dir="ltr">${esc(d.date)}</bdi></b></span></div>` +
    `<div class="ibox">${d.addr ? `<span>العنوان: <b>${esc(d.addr)}</b></span>` : ''}${d.driver ? `<span>السائق: <b>${esc(d.driver)}</b></span>` : ''}${d.vehicle ? `<span>العربية: <b>${esc(d.vehicle)}</b></span>` : ''}</div>` +
    (iv ? `<table class="itbl"><colgroup><col style="width:60%"><col style="width:40%"></colgroup><thead><tr><th>الصنف</th><th>الكمية</th></tr></thead><tbody>${iv.rows.map(l => `<tr><td class="nm">${esc(l.name)}</td><td>${fmtq(l.qty)} ${esc(l.unit)}</td></tr>`).join('')}</tbody></table>` : '') +
    (d.note ? `<p class="qnt">${esc(d.note)}</p>` : '') +
    `<div class="sigs"><div><span>توقيع السائق</span></div><div><span>توقيع المستلم</span></div></div>`, 'inv');
}
function delivMsg(d) {
  const L = []; if (facName()) L.push(facName());
  L.push(`${T('السلام عليكم')} ${d.name}${LANG === 'en' ? ',' : '،'}`, d.status === 'out' ? T('طلبكم في الطريق إليكم') : T('موعد توصيل طلبكم'));
  if (d.invNo) L.push(`${T('فاتورة رقم')} ${d.invNo}`); L.push(`${T('الموعد')}: ${d.date}`);
  if (d.driver) L.push(`${T('السائق')}: ${d.driver}`); if (d.vehicle) L.push(`${T('العربية:')} ${d.vehicle}`); if (d.addr) L.push(`${T('العنوان')}: ${d.addr}`);
  L.push(T('شكراً لتعاملكم معنا')); return L.join('\n');
}
screens.delivDetail = (p, v) => {
  const d = db.deliveries.find(x => x.id === p.id); if (!d) return back();
  const iv = d.invId ? db.invoices.find(i => i.id === d.invId) : null;
  v.innerHTML = subHead('توصيل — ' + d.name) + `<div class="stack">${delivPaper(d)}
    <section class="panel noprint"><p class="lbl" style="margin:0 0 8px">الحالة: <span class="pill ${DL_CLS[d.status]}">${DL_ST[d.status]}</span>${d.outAt ? ` — خرج <bdi dir="ltr">${dateTimeAr(d.outAt)}</bdi>` : ''}${d.doneAt ? ` — سُلِّم <bdi dir="ltr">${dateTimeAr(d.doneAt)}</bdi>` : ''}</p>
      <p class="lbl" style="margin:0">أجرة التوصيل: <b>${money(d.fee)}</b>${d.expId ? ' — سُجّلت في المصروفات' : d.fee > 0 && d.exp ? ' — تُسجَّل في المصروفات عند التسليم' : ''}${iv ? ` — الفاتورة <button class="lnk" data-iv="${iv.id}">${esc(iv.no)}</button>` : ''}</p></section>
    <div class="actions noprint" style="justify-content:center">
      ${DL_NEXT[d.status].map(k => `<button class="btn ${k === 'done' || k === 'out' ? '' : k === 'cancel' ? 'danger' : 'outline'}" data-dl="${k}" type="button">${DL_ACT[k]}</button>`).join('')}
      ${d.status !== 'done' ? `<button class="btn outline" id="d-edit" type="button">تعديل</button>` : ''}
      ${d.status === 'pending' || d.status === 'cancel' ? `<button class="btn danger" id="d-del" type="button">حذف</button>` : ''}
      <button class="btn ghost" data-act="go" data-to="deliveries">كل التوصيلات</button>
      ${window.claude ? '' : `<button class="btn ghost" id="d-print" type="button">${ICON.printer}<span>طباعة إذن التسليم</span></button>`}
      ${d.status === 'pending' || d.status === 'out' ? `<button class="btn ghost" id="d-wa" type="button">${ICON.chat}<span>إبلاغ العميل واتساب (PDF)</span></button>` : ''}
    </div></div>`;
  $$('[data-iv]', v).forEach(b => b.onclick = () => go('invDetail', { id: b.dataset.iv }));
  $$('[data-dl]', v).forEach(b => b.onclick = () => dlStep(d, b.dataset.dl));
  const on = (id, fn) => { const b = $(id, v); if (b) b.onclick = fn; };
  on('#d-edit', () => delivForm({ edit: d.id }));
  on('#d-del', async () => { if (!await confirmBox('', 'هل تريد حذف هذا التوصيل؟', 'حذف')) return; db.deliveries = db.deliveries.filter(x => x.id !== d.id); logA('dl_del', d.name, d.invNo ? `فاتورة ${d.invNo}` : ''); save(); back(); toast('تم حذف التوصيل', 'ok'); });
  on('#d-print', () => printRep(('إذن_تسليم_' + d.name + '_' + d.date).replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_')));
  on('#d-wa', () => waDoc({ base: 'إذن تسليم', no: d.name, html: delivPaper(d), phone: d.phone, cap: delivMsg(d), full: delivMsg(d), what: `توصيل ${d.name}` }));
  docWarm(delivPaper(d), 'إذن تسليم', d.name);
};
let dlView = { st: '', q: '' };
screens.deliveries = (p, v) => {
  const t = ymd(new Date()), mon = t.slice(0, 7), n = k => db.deliveries.filter(x => x.status === k).length;
  const doneToday = db.deliveries.filter(x => x.status === 'done' && ymd(x.doneAt) === t).length, feeM = round2(db.deliveries.filter(x => x.status === 'done' && ymd(x.doneAt).slice(0, 7) === mon).reduce((s, x) => s + x.fee, 0));
  v.innerHTML = subHead('التوصيل') + `<div class="stack">
    <section class="panel"><div class="stats"><div class="stat"><span>بانتظار الخروج</span><b>${fmt(n('pending'))}</b></div><div class="stat neg"><span>في الطريق</span><b>${fmt(n('out'))}</b></div>
      <div class="stat pos"><span>سُلِّم اليوم</span><b>${fmt(doneToday)}</b></div><div class="stat"><span>أجرة التوصيل هذا الشهر</span><b>${money(feeM)}</b></div></div></section>
    <section class="panel"><div class="toolbar"><input id="d-q" class="inp" placeholder="ابحث بالعميل أو السائق أو رقم الفاتورة" aria-label="بحث" autocomplete="off" value="${esc(dlView.q)}">
      <div class="sel"><select id="d-st" aria-label="الحالة"><option value="">كل الحالات</option>${Object.entries(DL_ST).map(([k, x]) => `<option value="${k}">${x}</option>`).join('')}</select></div>
      <button class="btn" id="d-new" type="button">${ICON.plus}<span>توصيل جديد</span></button></div>
      <div class="tbl-wrap"><table class="grid cardt"><thead><tr><th>العميل</th><th>الفاتورة</th><th>الموعد</th><th>السائق / العربية</th><th>الأجرة</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody id="d-body"></tbody></table></div>
      ${db.deliveries.length ? docBar('deliveries') : ''}</section></div>`;
  $('#d-st').value = dlView.st;
  const draw = () => {
    const q = $('#d-q').value.trim(), qq = toLat(q), order = { out: 0, pending: 1, done: 2, cancel: 3 };
    const list = db.deliveries.filter(x => (!dlView.st || x.status === dlView.st) && (!q || x.name.includes(q) || (x.driver || '').includes(q) || (x.invNo || '').includes(qq))).sort((a, b) => order[a.status] - order[b.status] || a.date.localeCompare(b.date));
    $('#d-body').innerHTML = list.map(x => { const next = DL_NEXT[x.status].find(k => k === 'out' || k === 'done'); const late = (x.status === 'pending' || x.status === 'out') && daysTo(x.date) < 0;
      return `<tr><td class="full">${dlWho(x)}</td><td data-l="الفاتورة">${x.invNo ? esc(x.invNo) : '—'}</td><td data-l="الموعد"><bdi dir="ltr">${esc(x.date)}</bdi>${late ? ' <span class="pill bad">متأخر</span>' : ''}</td>
      <td data-l="السائق / العربية">${esc(x.driver || '—')}${x.vehicle ? `<br><small class="muted">${esc(x.vehicle)}</small>` : ''}</td><td class="val" data-l="الأجرة">${x.fee ? fmt(x.fee) : '—'}</td><td data-l="الحالة"><span class="pill ${DL_CLS[x.status]}">${DL_ST[x.status]}</span></td>
      <td class="full"><div class="actions" style="justify-content:center;gap:6px">${x.status === 'pending' || x.status === 'out' ? `<button class="mini" data-dn="${x.id}" data-to="${next}">${DL_ACT[next]}</button>` : ''}<button class="mini" data-dv="${x.id}">عرض</button></div></td></tr>`; }).join('')
      || `<tr><td colspan="7" class="empty">${db.deliveries.length ? 'لا توجد نتائج' : 'لم يُسجَّل أي توصيل بعد.'}</td></tr>`;
    $$('[data-dv]', v).forEach(b => b.onclick = () => go('delivDetail', { id: b.dataset.dv }));
    $$('[data-dn]', v).forEach(b => b.onclick = () => dlStep(db.deliveries.find(x => x.id === b.dataset.dn), b.dataset.to));
  };
  $('#d-q').addEventListener('input', e => { dlView.q = e.target.value; draw(); }); $('#d-st').onchange = e => { dlView.st = e.target.value; draw(); };
  $('#d-new').onclick = () => delivForm(); draw();
};

/* ===== Excel exports ===== */
EXPORTS.quotes = () => ({ name: 'عروض_الأسعار', head: ['الرقم', 'التاريخ', 'العميل', 'الموبايل', 'الصافي', 'صالح حتى', 'الحالة', 'الفاتورة'], rows: db.quotes.map(q => [q.no, ymd(q.date), q.name, q.phone || '', q.net, q.valid || '', Q_ST[qState(q)], q.invNo || '']) });
EXPORTS.deliveries = () => ({ name: 'التوصيل', head: ['العميل', 'الموبايل', 'العنوان', 'الفاتورة', 'الموعد', 'السائق', 'اسم أو رقم العربية', 'الأجرة', 'الحالة', 'وقت التسليم'], rows: db.deliveries.map(x => [x.name, x.phone || '', x.addr || '', x.invNo || '', x.date, x.driver || '', x.vehicle || '', x.fee, DL_ST[x.status], x.doneAt ? ymd(x.doneAt) : '']) });
EXP_LIST.push(['quotes', 'عروض الأسعار'], ['deliveries', 'التوصيل']);
