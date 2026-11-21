/* ---------- Invoice form ---------- */
let inv = null;
const blankRow = () => ({ itemId: '', qty: '', price: '', wh: '' });
const rowWh = r => r.wh || inv.wh || WH0; /* each line draws from its own warehouse */
function usedElsewhere(i) { const r = inv.rows[i], w = rowWh(r); return inv.rows.reduce((s, x, k) => s + (k !== i && x.itemId === r.itemId && rowWh(x) === w ? num(x.qty) : 0), 0); }
const backQty = (id, w) => (inv && inv.back && inv.back[w + '|' + id]) || 0; /* when editing, what the old invoice took out of each warehouse comes back */
function available(i) { const r = inv.rows[i], it = itemById(r.itemId), w = rowWh(r); return it ? Math.max(round3(whQty(it, w) + backQty(it.id, w) - usedElsewhere(i)), 0) : 0; }
const custById = id => db.customers.find(c => c.id === id);
const specialPrice = itemId => { const c = inv && inv.cid ? custById(inv.cid) : null, q = c && c.prices ? +c.prices[itemId] : 0; return q > 0 ? q : 0; }; /* this customer's own price for the item (0 = none) */
const basePrice = it => specialPrice(it.id) || it.price;
function unitPrice(r) { const it = itemById(r.itemId); return r.price !== '' ? num(r.price) : (it ? basePrice(it) : 0); }
const rowTotal = r => num(r.qty) * unitPrice(r);
const CASH_NAME = 'مبيعات نقدية مباشرة';
/* open booking deposits that belong to the customer being invoiced (matched by registry id, phone or exact name) */
function openBookingsFor() {
  if (!inv || inv.mode === 'cash') return [];
  const ph = toLat(inv.phone).trim(), nm = inv.name.trim();
  return db.bookings.filter(b => !(inv.editNo && b.fromInv === inv.editNo) && bkOpenFor(b) > 0 && depFits(b) && (inv.cid ? b.customerId === inv.cid : ((ph && b.phone === ph) || (nm && b.name === nm))))
    .sort((a, b) => a.date.localeCompare(b.date));
}
/* a deposit kept for one place only goes off an invoice of that place; one with no place goes off any invoice (the old invoice's own deposit stays usable while editing it) */
const depFits = b => !b.place || b.place === placeOf(inv) || !!(inv.editNo && b.uses.some(u => u.inv === inv.editNo));
const bkOpenFor = b => round2(bkOpen(b) + (inv && inv.editNo ? b.uses.filter(u => u.inv === inv.editNo).reduce((s, u) => s + u.a, 0) : 0)); /* a deposit the old invoice used is free again while editing */
const depAvail = () => { const a = round2(openBookingsFor().reduce((s, b) => s + bkOpenFor(b), 0)); if (!inv || !inv.editOf) return a; const o = db.invoices.find(x => x.id === inv.editOf); return Math.min(a, o ? (o.deposit || 0) : 0); }; /* editing an invoice never takes more deposit than it already took */
const depApplied = t => (inv.dep ? Math.min(depAvail(), t.net) : 0);
function totals() {
  const items = round2(inv.rows.reduce((s, r) => s + round2(rowTotal(r)), 0)); /* the sum of the printed line totals */
  const tr = Math.max(round2(num(inv.trans)), 0), sub = round2(items + tr); /* "نقل" is one more line of the invoice, its amount typed by hand */
  const dp = Math.min(100, Math.max(0, num(inv.disc)));
  const pctAmt = round2(sub * dp / 100), want = Math.max(round2(num(inv.cdisc)), 0), cash = Math.min(want, round2(sub - pctAmt)); /* «خصم نقدي»: an amount typed by hand, taken off after the % discount and never more than what is left of the invoice */
  const discAmt = round2(pctAmt + cash), after = round2(sub - discAmt);
  const vatAmt = inv.vat && taxOn() ? round2(after * db.settings.vat / 100) : 0;
  return { sub, items, tr, dp, pctAmt, cash, want, discAmt, vatAmt, net: round2(after + vatAmt) };
}

/* the place this invoice goes to: a pick from the registered customer's saved places (or a new one), a typed name for a customer not yet saved */
function placeField(c) {
  if (c) { const ps = custPlaces(c); return `<div class="field plc"><label for="c-place">المكان (اختياري)</label><div class="sel"><select id="c-place" aria-label="المكان"><option value="">— بدون مكان —</option>${ps.map(x => `<option value="${esc(x)}"${x === inv.place ? ' selected' : ''}>${esc(x)}</option>`).join('')}<option value="__new">+ مكان جديد…</option></select></div></div>`; }
  return `<div class="field plc"><label for="c-place">المكان (اختياري)</label><input id="c-place" class="inp" data-f="place" maxlength="60" placeholder="مثال: عمارة النزهة" aria-label="المكان" value="${esc(inv.place)}" autocomplete="off"></div>`;
}
screens.invForm = (p, v) => {
  const old = p.edit ? db.invoices.find(x => x.id === p.edit) : null; /* editing = the same invoice is changed in place (goods/money edits are guarded when the invoice is saved; a name or place edit is always possible) */
  if (p.edit && (!old || old.status === 'void')) return back();
  if (old) p = { mode: old.kind === 'cash' ? 'cash' : (old.customerId && db.customers.some(x => x.id === old.customerId) ? 'existing' : 'new'), cid: old.customerId };
  const c = p.mode === 'existing' ? db.customers.find(x => x.id === p.cid) : null;
  const cash = p.mode === 'cash';
  inv = { mode: p.mode, cid: c ? c.id : null, name: cash ? CASH_NAME : (c ? c.name : ''), phone: c ? (c.phone || '') : '', addr: c ? (c.address || '') : '', save: false, place: '', rows: [blankRow()], disc: '0', cdisc: '', trans: '', vat: false, paid: '0', paidTouched: false, dep: false, wh: WH0, editOf: null, editNo: '', back: {} };
  if (old) {
    inv.editOf = old.id; inv.editNo = old.no; old.rows.forEach(l => { const k = (l.wh || old.wh || WH0) + '|' + l.itemId; inv.back[k] = round3((inv.back[k] || 0) + l.qty); });
    const rows = old.rows.filter(l => itemById(l.itemId)).map(l => ({ itemId: l.itemId, qty: String(l.qty), price: String(l.price), wh: l.wh || old.wh || WH0 }));
    if (rows.length) inv.rows = rows;
    if (!cash) { inv.name = old.name; inv.phone = old.phone || ''; inv.addr = old.addr || ''; } /* the invoice's own name / phone / address, not today's customer card */
    inv.place = placeOf(old); inv.disc = String(old.discPct || 0); inv.cdisc = old.discCash ? String(old.discCash) : ''; inv.trans = old.transport ? String(old.transport) : ''; inv.vat = !!old.vatOn && taxOn(); inv.paid = String(invPaidAll(old)); inv.paid0 = inv.paid; inv.paidTouched = true; inv.dep = old.deposit > 0;
  }
  /* from a quotation: its customer, lines (cut down to what the shelf holds), discount and VAT come in */
  const qt = !old && p.q ? db.quotes.find(x => x.id === p.q && x.status === 'open') : null; let qCut = 0, qShort = 0;
  if (qt) {
    inv.quote = qt.id; if (!c && !cash) { inv.name = qt.name; inv.phone = qt.phone || ''; inv.addr = qt.addr || ''; }
    inv.disc = String(qt.discPct || 0); inv.vat = !!qt.vatOn && taxOn();
    const taken = {}, rows = [];
    qt.rows.forEach(l => {
      const it = itemById(l.itemId); if (!it) { qCut++; return; }
      const w = pickWh(it), k = w + '|' + it.id, av = Math.max(round3(whQty(it, w) - (taken[k] || 0)), 0), q = Math.min(round3(l.qty), av);
      if (q <= 0) { qCut++; return; } if (q < round3(l.qty)) qShort++;
      taken[k] = round3((taken[k] || 0) + q); rows.push({ itemId: it.id, qty: String(q), price: String(l.price), wh: w });
    });
    if (rows.length) inv.rows = rows;
  }
  const ro = c ? 'readonly' : '', lost = old ? old.rows.filter(l => !itemById(l.itemId)).length : 0;
  v.innerHTML = subHead(old ? 'تعديل فاتورة رقم ' + old.no : cash ? 'بيع نقدي مباشر' : 'إصدار فاتورة جديدة') + `<div class="stack">
  ${old && !canVoid(old).ok ? `<div class="note"><span>${esc(canVoid(old).why)}</span></div>` : ''}
  ${old ? `<div class="note"><span>تعديل الفاتورة رقم ${esc(old.no)} على نفسها: تُحفظ التعديلات على نفس الفاتورة بنفس رقمها وتاريخها ولا تُلغى، ولا يتحرّك مخزن ولا خزنة ولا عربون إلا فيما تغيّره أنت بنفسك، وتغيير كمية صنف يخصم الزيادة من المخزن ويعيد النقص إليه.</span></div>` : ''}
  ${qt ? `<div class="note"><span>فاتورة من عرض السعر رقم ${esc(qt.no)}</span></div>` : ''}
  ${qt && qt.valid && daysTo(qt.valid) < 0 ? `<div class="note"><span>انتهت صلاحية عرض السعر والأسعار حسب العرض</span></div>` : ''}
  ${qCut ? `<div class="note"><span>${qCut} صنف لم يُنقل لعدم توفره</span></div>` : ''}${qShort ? `<div class="note"><span>${qShort} صنف نُقلت كميته المتاحة فقط</span></div>` : ''}
  ${lost ? `<div class="note"><span>تنبيه: ${lost} صنف من الفاتورة القديمة لم يعد موجوداً في المخزن ولن يُنقل بعد التعديل.</span></div>` : ''}
  ${old && old.vatOn && !taxOn() ? `<div class="note"><span>تنبيه: الضرائب موقوفة، فلن تُضاف القيمة المضافة إلى الفاتورة الجديدة.</span></div>` : ''}
  ${cash ? `<section class="panel cashbar">${ICON.cashSale}<div><b>بيع نقدي مباشر</b><span>تُسجَّل الفاتورة باسم «${CASH_NAME}» ويُحصَّل صافيها نقداً بالكامل، ولا تُحفظ في سجل العملاء.</span></div></section>` : `<section class="panel">${c && c.code ? `<p class="muted" style="margin:0 0 10px">كود العميل: <b class="code" dir="ltr">${esc(c.code)}</b></p>` : ''}<div class="cust">
    <input id="c-name" class="inp" data-f="name" placeholder="اسم العميل" aria-label="اسم العميل" value="${esc(inv.name)}" autocomplete="off" ${ro}>
    <input id="c-phone" class="inp" data-f="phone" placeholder="رقم الموبايل" aria-label="رقم الموبايل" inputmode="tel" value="${esc(inv.phone)}" autocomplete="off" ${ro}>
    <input id="c-addr" class="inp" data-f="addr" placeholder="العنوان" aria-label="العنوان" value="${esc(inv.addr)}" autocomplete="off" ${ro}>
    ${c ? '<span></span>' : `<label class="chk"><input type="checkbox" id="c-save" data-f="save"><i>${ICON.check}</i><span>حفظ في السجل</span></label>`}
  </div>${placeField(c)}</section>`}
  <div class="note" id="limNote" hidden></div>
  <section class="panel">
    <h2 class="panel-t">إدراج الأصناف للفاتورة</h2>
    <div class="tbl-wrap"><table class="tbl items-t">
      <colgroup>${multiWh() ? '<col style="width:24%"><col style="width:20%"><col style="width:14%"><col style="width:17%"><col style="width:17%"><col style="width:8%">' : '<col style="width:33%"><col style="width:20%"><col style="width:25%"><col style="width:14%"><col style="width:8%">'}</colgroup>
      <thead><tr><th>الصنف</th>${multiWh() ? '<th>السحب من مخزن</th>' : ''}<th>الكمية</th><th>السعر</th><th>الإجمالي</th><th>حذف</th></tr></thead>
      <tbody id="rows"></tbody></table></div>
    <button class="add-row" id="addRow" type="button">+ إدراج صنف جديد</button>
    <div class="field" style="max-width:360px;margin-top:14px"><label for="trans">بند نقل (اكتب المبلغ إن وُجد)</label><div class="iconin"><input id="trans" class="inp" inputmode="decimal" placeholder="0" value="${esc(inv.trans)}" autocomplete="off">${ICON.cash}</div></div>
  </section>
  <div class="two">
    <section class="panel"><h2 class="panel-t big">${ICON.coins}<span>المدفوعات والخصم</span></h2>
      <div class="pay">
        <div class="field"><label for="disc">قيمة الخصم (%)</label><div class="iconin"><input id="disc" class="inp" inputmode="decimal" value="${esc(inv.disc)}" autocomplete="off"><span class="pct">%</span></div></div>
        <div class="field"><label for="cdisc">بند خصم نقدي (اكتب المبلغ إن وُجد)</label><div class="iconin"><input id="cdisc" class="inp" inputmode="decimal" placeholder="0" value="${esc(inv.cdisc)}" autocomplete="off">${ICON.cash}</div></div>
        <div class="note" id="cdNote" hidden></div>
        ${taxOn() ? `<label class="chk"><input type="checkbox" id="vat"${inv.vat ? ' checked' : ''}><i>${ICON.check}</i><span>إضافة قيمة مضافة (${db.settings.vat}%)</span></label>` : ''}
        <label class="chk" id="depBox" hidden><input type="checkbox" id="dep"><i>${ICON.check}</i><span id="depTxt"></span></label>
        <div class="note" id="depOther" hidden></div>
        <div class="field${cash ? '' : ' zp'}" id="paidF"><label for="paid">المبلغ المدفوع</label><div class="iconin"><input id="paid" class="inp" inputmode="decimal" value="${esc(inv.paid)}" autocomplete="off" ${cash ? 'readonly' : ''}>${ICON.cash}</div>
          ${cash ? '' : `<div class="zp-x"><button class="mini" id="payFull" type="button">سداد كامل</button><span class="phint" id="paidHint" hidden></span></div>`}</div>
        <div id="i-pmw" hidden>${pmHTML('i-pm', old ? 'طريقة دفع المبلغ المضاف' : 'طريقة الدفع')}</div>
        <div class="note" id="overNote" hidden></div>
      </div>
    </section>
    <section class="panel"><h2 class="panel-t big blue">${ICON.docDollar}<span>ملخص الحساب</span></h2>
      <div class="sum-row"><span>إجمالي الأصناف:</span><b id="s-sub">0 جنيه</b></div>
      <div class="sum-row" id="trRow" hidden><span>نقل:</span><b id="s-tr">0 جنيه</b></div>
      <div class="sum-row red"><span>الخصم (%):</span><b id="s-disc">0 %</b></div>
      <div class="sum-row red" id="cdRow" hidden><span>خصم نقدي:</span><b id="s-cd">0 جنيه</b></div>
      <div class="sum-row" id="vatRow" hidden><span>القيمة المضافة (${db.settings.vat}%):</span><b id="s-vat">0 جنيه</b></div>
      <div class="sum-row" id="depRow" hidden><span>العربون المخصوم:</span><b id="s-dep">0 جنيه</b></div>
      <div class="rem" id="remRow"><span>${ICON.history}<i id="s-rem-l">المتبقي</i></span><b id="s-rem">0 جنيه</b></div>
    </section>
  </div>
  <div class="submit"><button class="btn lg" id="issue" type="button">${old ? 'حفظ التعديل' : 'إصدار الفاتورة'}</button></div>
  </div>`;
  drawRows(); refreshDep(); inv.pmEl = pmWire(v, 'i-pm');

  const form = $('.stack', v);
  form.addEventListener('input', onInput);
  form.addEventListener('change', onChange);
  form.addEventListener('click', onClick);
};

function drawRows() {
  const opts = ['<option value="">– اختر صنف –</option>'];
  $('#rows').innerHTML = inv.rows.map((r, i) => {
    const it = itemById(r.itemId);
    const sp = it ? specialPrice(it.id) : 0, ph = it ? (sp ? `سعر خاص لل${it.unit} ${round2(sp)} جنيه` : `سعر ال${it.unit} ${round2(it.price)} جنيه`) : 'السعر';
    const o = opts.concat(db.items.map(x => `<option value="${x.id}" ${x.id === r.itemId ? 'selected' : ''}>${esc(itemLbl(x))}</option>`)).join('');
    const wc = multiWh() ? `<td class="wh" data-l="السحب من مخزن"><div class="sel"><select id="r${i}-wh" data-r="${i}" data-k="wh" aria-label="السحب من مخزن"${it ? '' : ' disabled'}>${db.warehouses.map(w => `<option value="${esc(w.id)}"${w.id === rowWh(r) ? ' selected' : ''}>${esc(w.name)}${it ? ' — ' + fmtq(whQty(it, w.id)) : ''}</option>`).join('')}</select></div></td>` : '';
    return `<tr>
      <td data-l="الصنف"><div class="sel"><select id="r${i}-item" data-r="${i}" data-k="item" aria-label="الصنف">${o}</select></div></td>${wc}
      <td data-l="الكمية"><input id="r${i}-qty" class="ctr" data-r="${i}" data-k="qty" inputmode="decimal" placeholder="الكمية" aria-label="الكمية" value="${esc(r.qty)}" autocomplete="off"></td>
      <td data-l="السعر"><input id="r${i}-price" class="ctr" data-r="${i}" data-k="price" inputmode="decimal" placeholder="${esc(ph)}" aria-label="السعر" value="${esc(r.price)}" autocomplete="off"></td>
      <td class="rt" data-l="الإجمالي" id="r${i}-tot">${fmt(rowTotal(r))}</td>
      <td><button class="del" type="button" data-del-row="${i}" aria-label="حذف الصف">${ICON.trash}</button></td></tr>`;
  }).join('');
}

/* show/hide the "use booking deposit" box for the customer on the form */
function refreshDep() {
  const av = depAvail(), box = $('#depBox');
  if (!av) inv.dep = false;
  if (box) { box.hidden = !av; $('#dep').checked = inv.dep; $('#depTxt').textContent = `خصم عربون الحجز (متاح ${fmt(av)} جنيه)`; }
  const dn = $('#depOther'); if (dn) { /* money he keeps with us for another place: it does not come off this invoice by itself */
    const oth = inv.cid ? round2(db.bookings.filter(b => b.customerId === inv.cid && bkOpenFor(b) > 0 && !depFits(b)).reduce((s, b) => s + bkOpenFor(b), 0)) : 0;
    dn.hidden = !oth; if (oth) dn.innerHTML = `<span>للعميل رصيد ${money(oth)} محجوز لمكان آخر، ولا يُخصم من فاتورة هذا المكان تلقائياً. لاستخدامه هنا رحِّله من «ترحيل رصيد» في كشف حساب العميل.</span>`;
  }
  calc();
}

function calc() {
  const t = totals(), dep = depApplied(t), due = round2(t.net - dep);
  inv.rows.forEach((r, i) => { const el = $('#r' + i + '-tot'); if (el) el.textContent = fmt(rowTotal(r)); });
  const cashM = inv.mode === 'cash'; if (cashM) { inv.paid = String(due); $('#paid').value = inv.paid; } /* a cash sale is paid in full; otherwise the paid box stays as typed (zero until then) */
  $('#depRow').hidden = !dep; $('#s-dep').textContent = money(dep);
  $('#s-sub').textContent = money(t.items); $('#trRow').hidden = !(t.tr > 0); $('#s-tr').textContent = money(t.tr);
  $('#s-disc').textContent = fmt(t.dp) + ' %';
  $('#cdRow').hidden = !(t.cash > 0); $('#s-cd').textContent = money(t.cash);
  const cn = $('#cdNote'); if (cn) { const cut = t.want > t.cash + 0.004; cn.hidden = !cut; if (cut) cn.textContent = `الخصم النقدي أكبر من الفاتورة — المطبَّق ${money(t.cash)} فقط`; }
  $('#vatRow').hidden = !inv.vat; $('#s-vat').textContent = money(t.vatAmt);
  const pw = $('#i-pmw'); if (pw) pw.hidden = !(inv.editOf ? num(inv.paid) > num(inv.paid0) + 0.004 : num(inv.paid) > 0); /* the method is asked only for money handed over now (on an edit: the part he added) */
  const rem = round2(due - num(inv.paid)); /* below zero = the customer paid more than the invoice */
  $('#s-rem').textContent = rem < 0 ? 'له ' + money(-rem) : money(rem); /* the customer's credit is written «له X», never with a minus sign */
  $('#s-rem-l').textContent = rem < 0 ? 'المتبقي للعميل' : rem > 0 ? 'المتبقي (آجل على العميل)' : 'المتبقي';
  const rr = $('#remRow'); rr.classList.toggle('cr', rem < 0); rr.classList.toggle('clear', rem === 0);
  const pf = $('#paidF'), zero = !cashM && due > 0 && num(inv.paid) <= 0;
  if (pf) { pf.classList.toggle('zero', zero); pf.classList.toggle('ok', !cashM && !zero && due > 0); const hn = $('#paidHint'); if (hn) { hn.hidden = !zero; hn.textContent = zero ? 'لم يُسدَّد أي مبلغ — الفاتورة كلها آجل على العميل. اكتب المدفوع إن وُجد أو اضغط «سداد كامل».' : ''; } const pb = $('#payFull'); if (pb) pb.hidden = !(due > 0) || num(inv.paid) === due; }
  const on = $('#overNote'); if (on) {
    on.hidden = !(rem < 0);
    if (rem < 0) { const bks = dep > 0 ? openBookingsFor() : [], known = inv.cid || inv.save || bks.length; on.classList.toggle('over', !known); on.innerHTML = `<span>الزيادة (${money(-rem)}) تُسجَّل رصيداً للعميل (عربون) ويُخصم من فاتورته القادمة${known ? '' : ' — احفظ العميل في السجل (أو اختر عميلاً مسجَّلاً) ليُسجَّل له الرصيد.'}</span>`; }
  }
  const ln = $('#limNote'), cu = inv.mode !== 'cash' && inv.cid ? custById(inv.cid) : null;
  if (ln) { /* the customer's credit limit, live */
    if (cu && cu.limit > 0) { const after = projectedDebt(cu.id, Math.max(rem, 0)); ln.hidden = false; ln.classList.toggle('over', after > cu.limit + 0.004); const ov = after > cu.limit + 0.004; ln.innerHTML = `<span>${ov ? '<b>تنبيه:</b> ' : ''}<span>الحد الائتماني للعميل ${money(cu.limit)} — رصيده الحالي ${money(customerDebt(cu.id))} — بعد هذه الفاتورة ${money(after)}</span>${ov ? ' <b>(يتجاوز الحد)</b>' : ''}</span>`; }
    else ln.hidden = true;
  }
}

function onInput(e) {
  const t = e.target;
  if (t.dataset.f && t.type !== 'checkbox') { inv[t.dataset.f] = t.value; if (t.dataset.f === 'name' || t.dataset.f === 'phone' || t.dataset.f === 'place') refreshDep(); return; }
  if (t.dataset.r !== undefined && t.dataset.k !== 'item' && t.dataset.k !== 'wh') {
    const i = +t.dataset.r, r = inv.rows[i];
    t.value = cleanNum(t.value); r[t.dataset.k] = t.value;
    if (t.dataset.k === 'qty' && t.value !== '') {
      if (!r.itemId) { toast('اختر الصنف أولاً'); r.qty = ''; t.value = ''; }
      else {
        const av = available(i);
        if (num(r.qty) > av) { toast(`الكمية المتبقية المتاحة في المخزن هي ${fmtq(av)} فقط!`); r.qty = String(av); t.value = r.qty; }
      }
    }
    calc(); return;
  }
  if (t.id === 'trans') { t.value = cleanNum(t.value); inv.trans = t.value; calc(); return; }
  if (t.id === 'cdisc') { t.value = cleanNum(t.value); inv.cdisc = t.value; calc(); return; }
  if (t.id === 'disc') {
    t.value = cleanNum(t.value); if (num(t.value) > 100) t.value = '100'; inv.disc = t.value; calc(); return;
  }
  if (t.id === 'paid') {
    t.value = cleanNum(t.value); inv.paidTouched = true; inv.paid = t.value; calc();
  }
}

function onChange(e) {
  const t = e.target;
  if (t.id === 'c-save') { inv.save = t.checked; return; }
  if (t.id === 'c-place' && t.tagName === 'SELECT') { /* a saved place, or "+ new place" which asks for its name */
    if (t.value !== '__new') { inv.place = t.value; refreshDep(); return; }
    const cu = custById(inv.cid), back = () => { t.value = inv.place; };
    modal(`<h3>مكان جديد للعميل</h3><div class="field"><label for="np-name">اسم المكان</label><input id="np-name" class="inp" maxlength="60" placeholder="مثال: عمارة النزهة" autocomplete="off"></div>
      <div class="actions"><button class="btn" data-ok>إضافة</button><button class="btn ghost" data-no>إلغاء</button></div>`, (d, close) => {
      $('#np-name').focus();
      $('[data-no]', d).onclick = () => { close(); back(); };
      $('[data-ok]', d).onclick = () => {
        const nm = $('#np-name').value.trim(); if (!nm) return toast('اكتب اسم المكان');
        if (cu) { cu.places = cu.places || []; if (!custPlaces(cu).includes(nm)) cu.places.push(nm); save(); }
        inv.place = nm; close(); const o = $('#c-place'); if (o) { if (![...o.options].some(x => x.value === nm)) { const op = document.createElement('option'); op.value = nm; op.textContent = nm; o.insertBefore(op, o.options[o.options.length - 1]); } o.value = nm; } refreshDep();
      };
    }, back);
    return;
  }
  if (t.dataset.r !== undefined && t.dataset.k === 'wh') { /* another warehouse for this line: what is available changes, so the quantities are checked again */
    inv.rows[+t.dataset.r].wh = t.value; let cut = false;
    inv.rows.forEach((r, i) => { if (r.itemId && num(r.qty) > available(i)) { r.qty = available(i) > 0 ? String(available(i)) : ''; cut = true; } });
    if (cut) toast('عُدّلت الكميات حسب المتاح في هذا المخزن'); drawRows(); calc(); return;
  }
  if (t.id === 'vat') { inv.vat = t.checked; calc(); return; }
  if (t.id === 'dep') { inv.dep = t.checked; calc(); return; }
  if (t.dataset.r !== undefined && t.dataset.k === 'item') {
    const i = +t.dataset.r, r = inv.rows[i];
    if (!t.value) { r.itemId = ''; r.wh = ''; r.price = ''; drawRows(); calc(); return; }
    r.itemId = t.value; r.wh = pickWh(itemById(t.value));
    if (available(i) <= 0) { toast('الصنف غير متوفر'); r.itemId = ''; r.wh = ''; r.qty = ''; r.price = ''; drawRows(); calc(); return; }
    r.price = '';
    if (num(r.qty) > available(i)) r.qty = String(available(i));
    drawRows(); calc();
  }
}

function onClick(e) {
  const d = e.target.closest('[data-del-row]');
  if (d) {
    inv.rows.splice(+d.dataset.delRow, 1);
    if (!inv.rows.length) inv.rows.push(blankRow());
    drawRows(); calc(); return;
  }
  if (e.target.closest('#addRow')) { inv.rows.push(blankRow()); drawRows(); calc(); return; }
  if (e.target.closest('#payFull')) { const t0 = totals(); inv.paid = String(round2(t0.net - depApplied(t0))); inv.paidTouched = true; $('#paid').value = inv.paid; calc(); return; }
  if (e.target.closest('#issue')) issueInvoice();
}

let issuing = false;
const projectedDebt = (cid, rem) => { const old = inv.editOf ? db.invoices.find(x => x.id === inv.editOf) : null; return round2(Math.max(customerDebt(cid) - (old && old.customerId === cid ? old.remaining : 0), 0) + rem); };
async function issueInvoice() {
  if (issuing) return; issuing = true;
  try { if (await creditOk()) issueCore(); } finally { issuing = false; }
}
/* a credit sale that takes the customer past his credit limit needs the admin's approval */
async function creditOk() {
  inv.over = null; if (inv.mode === 'cash') return true;
  const t = totals(), dep = depApplied(t), due = round2(t.net - dep), rem = round2(Math.max(due - Math.min(num(inv.paid), due), 0));
  const bks = dep > 0 ? openBookingsFor() : [], cid = inv.cid || (bks.length ? bks[0].customerId : null), c = cid ? custById(cid) : null;
  if (!c || !(c.limit > 0) || rem <= 0) return true;
  const after = projectedDebt(c.id, rem); if (after <= c.limit + 0.004) return true;
  if (!await confirmBox('', `حد ${c.name} الائتماني ${money(c.limit)}، وسيصل رصيده بعد هذه الفاتورة إلى ${money(after)}. هل تريد إصدار الفاتورة رغم ذلك؟`, 'نعم، أصدرها', false)) return false;
  if (!await requireAdmin('اكتب الرقم السري للمسؤول لتجاوز الحد الائتماني')) return false;
  inv.over = [c.name, money(after), money(c.limit)]; return true;
}
function issueCore() {
  const cash = inv.mode === 'cash', name = cash ? CASH_NAME : inv.name.trim();
  if (!name) { toast('اكتب اسم العميل'); $('#c-name').focus(); return; }
  const rows = inv.rows.filter(r => r.itemId && num(r.qty) > 0);
  if (!rows.length) { toast('أضف صنفاً واحداً على الأقل بكمية صحيحة'); return; }
  const need = {};
  rows.forEach(r => { const k = rowWh(r) + '|' + r.itemId; need[k] = round3((need[k] || 0) + round3(num(r.qty))); });
  for (const k in need) { const [w, id] = k.split('|'), it = itemById(id); if (!it || need[k] > whQty(it, w) + backQty(id, w) + 1e-9) { toast(`الكمية المطلوبة من «${it ? it.name : 'الصنف'}» أكبر من المتاح`); return; } }
  const t = totals(), dep = depApplied(t), due = round2(t.net - dep), paidAll = cash ? t.net : round2(num(inv.paid)), paid = Math.min(paidAll, due), over = round2(Math.max(paidAll - due, 0)), place = cash ? '' : String(inv.place || '').trim();
  if (over > 0 && !(inv.cid || inv.save || (dep > 0 && openBookingsFor().length))) { toast('لتسجيل الزيادة رصيداً للعميل احفظه في السجل أولاً أو اختر عميلاً مسجَّلاً'); return; }
  const ps = pmGet(inv.pmEl), gotNow = inv.editOf ? round2(paidAll - num(inv.paid0)) : paidAll, pmNow = gotNow > 0.004 && pmIs(ps.pm) ? ps.pm : 'cash'; /* how the money handed over now came in (cash unless he chose a bank-like method) */
  /* customer */
  let cid = cash ? null : inv.cid;
  const bks = dep > 0 ? openBookingsFor() : [];
  if (!cid && bks.length) cid = bks[0].customerId; /* the invoice belongs to the booking's registered customer */
  if (!cid && inv.save && !cash) {
    const phone = toLat(inv.phone).trim();
    let c = db.customers.find(x => (phone && x.phone === phone) || x.name === name);
    if (c) { c.name = name; if (phone) c.phone = phone; if (inv.addr.trim()) c.address = inv.addr.trim(); }
    else { c = { id: uid(), name, phone, address: inv.addr.trim() }; db.customers.push(c); }
    cid = c.id;
  }
  const addPlace = () => { if (cid && place) { const pc = custById(cid); if (pc && !custPlaces(pc).includes(place)) { pc.places = pc.places || []; pc.places.push(place); } } }; /* a place typed on the invoice joins his saved places */
  /* lines: an editing keeps every line he did not touch exactly as it was (its cost too); a line whose quantity changed keeps the cost it was sold at */
  const oldInv = inv.editOf ? db.invoices.find(x => x.id === inv.editOf) : null;
  if (inv.editOf && !oldInv) { toast('الفاتورة غير موجودة'); return; }
  const oldRows = oldInv ? oldInv.rows : [], usedOld = new Set(), owh = l => l.wh || (oldInv && oldInv.wh) || WH0;
  const lines = rows.map(r => {
    const it = itemById(r.itemId), qty = round3(num(r.qty)), price = unitPrice(r), w = rowWh(r);
    if (oldInv) {
      const k = oldRows.findIndex((l, ix) => !usedOld.has(ix) && l.itemId === it.id && owh(l) === w && l.qty === qty && l.price === price);
      if (k >= 0) { usedOld.add(k); return oldRows[k]; }
      const same = oldRows.find(l => l.itemId === it.id && owh(l) === w);
      return { itemId: it.id, name: it.name, unit: it.unit, qty, price, cost: same && same.cost != null ? same.cost : it.cost, total: round2(qty * price), wh: w };
    }
    return { itemId: it.id, name: it.name, unit: it.unit, qty, price, cost: it.cost, total: round2(qty * price), wh: w };
  });
  const rec = {
    ...(oldInv || {}), id: oldInv ? oldInv.id : uid(), no: oldInv ? oldInv.no : '', date: oldInv ? oldInv.date : new Date().toISOString(), customerId: cid || null, wh: lines[0].wh,
    name, phone: toLat(inv.phone).trim(), addr: inv.addr.trim(), rows: lines, transport: t.tr, subtotal: t.sub, discPct: t.dp, discAmt: t.discAmt,
    vatOn: inv.vat && taxOn(), vatPct: db.settings.vat, vatAmt: t.vatAmt, net: t.net, paid: round2(paid), over, deposit: dep, kind: cash ? 'cash' : 'credit',
    remaining: round2(Math.max(due - paid, 0)),
  };
  if (place) rec.place = place; else delete rec.place;
  if (t.cash > 0) rec.discCash = t.cash; else delete rec.discCash; /* the part of the discount that is a plain amount (the rest of discAmt is the % one) */
  if (oldInv) {
    /* an edit touches only what he changed: nothing is cancelled, no goods go back to the shelf, no money or deposit moves by itself */
    const core = o => JSON.stringify([o.customerId || null, (o.rows || []).map(l => [l.itemId, l.qty, l.price, l.wh || o.wh || WH0]), o.transport || 0, o.discPct || 0, o.discCash || 0, !!o.vatOn, o.net, o.paid, o.over || 0, o.deposit || 0, o.kind, o.remaining]);
    const info = o => JSON.stringify([o.name || '', o.phone || '', o.addr || '', o.place || '']);
    const coreSame = core(oldInv) === core(rec), infoSame = info(oldInv) === info(rec);
    if (oldInv.status === 'void') { toast('الفاتورة ملغاة بالفعل'); return; }
    if (coreSame && infoSame) { toast('لم يتغيّر شيء في الفاتورة'); go('invDetail', { id: oldInv.id }, { replace: true }); return; }
    if (!coreSame) { /* goods or money changed: the usual guards (a name or place alone is always allowed) */
      const ok = canVoid(oldInv); if (!ok.ok) { toast(ok.why); return; }
      const coll = invSettled(oldInv), newRem = rec.remaining;
      if (coll > 0 && (cid || null) !== (oldInv.customerId || null)) { toast('عليها تحصيلات من عميلها الحالي، فلا يمكن نقلها إلى عميل آخر'); return; }
      if (coll > newRem + 0.004) { toast(`المحصَّل لاحقاً على الفاتورة ${money(coll)} أكبر من المتبقي على الفاتورة بعد التعديل ${money(newRem)}. ارفع قيمتها أو ألغِ الفاتورة ليُرد المحصَّل للعميل`); return; }
      /* nothing goes back to the customer or the cash box by itself: money that would flow back needs his own hand (the paid box, the deposit tick, a return or a cancel) */
      const paidHand = round2(num(inv.paid)) !== round2(num(inv.paid0));
      if (cash && rec.net < oldInv.net - 0.004) { toast('تقليل قيمة فاتورة نقدية يُرجع فلوساً للعميل، ولن يتم ذلك تلقائياً. سجّل مرتجعاً أو ألغِ الفاتورة بنفسك'); return; }
      if (!cash && !paidHand && over > (oldInv.over || 0) + 0.004) { toast(`بعد التعديل أصبح المدفوع أكبر من الفاتورة بمقدار ${money(over - (oldInv.over || 0))}، ولن يتحوّل إلى رصيد للعميل تلقائياً. عدّل خانة المدفوع بنفسك`); return; }
      if (inv.dep && dep < (oldInv.deposit || 0) - 0.004) { toast('العربون المخصوم على الفاتورة أكبر من صافيها بعد التعديل، ولن يرجع للعميل تلقائياً. أزل علامة خصم العربون بنفسك إن أردت إرجاعه'); return; }
      /* stock: only the difference of the lines he changed: what he added goes out of the warehouse, what he took off a line (or removed) comes back to it; a line he did not touch is not moved at all */
      const sum = (arr, w0) => { const m = {}; arr.forEach(l => { const k = (l.wh || w0 || WH0) + '|' + l.itemId; m[k] = round3((m[k] || 0) + l.qty); }); return m; };
      const mo = sum(oldInv.rows, oldInv.wh), mn = sum(lines, oldInv.wh);
      Object.keys({ ...mo, ...mn }).forEach(k => {
        const [w, id] = k.split('|'), d = round3((mn[k] || 0) - (mo[k] || 0)), it = itemById(id); if (!d || !it) return;
        if (d > 0) stockMove(it, w, -d); else backToStock({ itemId: id, qty: -d, cost: (oldInv.rows.find(l => l.itemId === id) || {}).cost, wh: w }, w);
      });
      /* the deposit he already took stays as it is; it only shrinks if he unticked it or the invoice became smaller than it */
      let trim = round2((oldInv.deposit || 0) - dep);
      if (trim > 0) {
        const us = []; db.bookings.forEach(b => b.uses.forEach(u => { if (u.inv === oldInv.no) us.push({ b, u }); }));
        us.sort((x, y) => String(y.u.date).localeCompare(String(x.u.date)));
        us.forEach(({ b, u }) => { if (trim <= 0) return; const a = Math.min(u.a, trim); u.a = round2(u.a - a); trim = round2(trim - a); if (u.a <= 0.004) b.uses.splice(b.uses.indexOf(u), 1); });
        let tl = round2((oldInv.deposit || 0) - dep); rec.depLate = (oldInv.depLate || []).map(x => ({ ...x })); for (let n = rec.depLate.length - 1; n >= 0 && tl > 0; n--) { const a = Math.min(rec.depLate[n].a, tl); rec.depLate[n].a = round2(rec.depLate[n].a - a); tl = round2(tl - a); } rec.depLate = rec.depLate.filter(x => x.a > 0.004); if (!rec.depLate.length) delete rec.depLate;
      }
      /* the extra he paid above the invoice (his deposit from it): only changes when that amount changed */
      const ob = db.bookings.find(b => b.fromInv === oldInv.no);
      if (over > 0) { const cu = custById(cid);
        if (ob) { if (round2(ob.amount) !== over) ob.amount = over; }
        else { db.bookings.push({ id: uid(), customerId: cid, name: cu ? cu.name : name, phone: cu ? (cu.phone || '') : rec.phone, desc: `رصيد زائد من فاتورة ${rec.no}`, amount: over, date: rec.date, uses: [], refunds: [], fromInv: rec.no, ...(place ? { place } : {}), ...(pmIs(pmNow) ? { pm: pmNow } : {}) }); logA('bk_add', cu ? cu.name : name, money(over), 'رصيد زائد', `فاتورة ${rec.no}`); }
      } else if (ob) db.bookings = db.bookings.filter(b => b !== ob);
    }
    if (!coreSame) rec.hist = (oldInv.hist && oldInv.hist.length ? oldInv.hist : [{ ...invState(oldInv, oldInv.date), ...(pmIs(oldInv.pm) ? { pm: oldInv.pm } : {}) }]).concat({ ...invState(rec, new Date().toISOString()), ...(pmIs(pmNow) ? { pm: pmNow } : {}) }); /* the paper shows goods or cash added by this edit on today's date (with the method the added money came in by) */
    if (pmIs(pmNow)) rcFromPm({ ...ps, pm: pmNow }, { cid, name, a: gotNow, k: 'inv', ref: rec.no });
    rec.edits = (oldInv.edits || []).concat({ at: new Date().toISOString(), by: CUR_USER ? CUR_USER.name : '' }); /* it keeps its id, so its collections, returns, deliveries and quotation stay attached */
    if (inv.over) { logA('limit_over', ...inv.over, `فاتورة ${rec.no}`); inv.over = null; }
    addPlace(); db.invoices[db.invoices.indexOf(oldInv)] = rec;
    logA('inv_edit', `تعديل فاتورة ${rec.no}`, name, money(rec.net), ...(oldInv.net !== rec.net ? [`القيمة قبل التعديل ${money(oldInv.net)}`] : []), ...(place ? [place] : [])); save();
    toast('تم حفظ التعديل على الفاتورة', 'ok');
    go('invDetail', { id: rec.id }, { replace: true });
    return;
  }
  /* new invoice: stock + number */
  addPlace();
  lines.forEach(l => stockMove(itemById(l.itemId), l.wh, -l.qty));
  db.seq += 1; rec.no = String(db.seq).padStart(4, '0'); if (pmIs(pmNow)) rec.pm = pmNow;
  if (dep > 0) { /* consume the customer's booking deposits, oldest first */
    let left = dep;
    bks.forEach(b => { const a = Math.min(left, bkOpen(b)); if (a > 0) { b.uses.push({ a: round2(a), inv: rec.no, date: rec.date }); left = round2(left - a); } });
  }
  const fromQ = inv.quote ? db.quotes.find(x => x.id === inv.quote && x.status === 'open') : null;
  if (fromQ) { fromQ.status = 'done'; fromQ.invNo = rec.no; rec.fromQuote = fromQ.no; logA('q_inv', `عرض سعر ${fromQ.no}`, `فاتورة ${rec.no}`, name); }
  if (over > 0) { /* what the customer paid above the invoice stays with us as his deposit, to be taken off his next invoice (or paid back) */
    const cu = custById(cid); db.bookings.push({ id: uid(), customerId: cid, name: cu ? cu.name : name, phone: cu ? (cu.phone || '') : rec.phone, desc: `رصيد زائد من فاتورة ${rec.no}`, amount: over, date: rec.date, uses: [], refunds: [], fromInv: rec.no, ...(place ? { place } : {}), ...(pmIs(pmNow) ? { pm: pmNow } : {}) });
    logA('bk_add', cu ? cu.name : name, money(over), 'رصيد زائد', `فاتورة ${rec.no}`);
  }
  if (inv.over) { logA('limit_over', ...inv.over, `فاتورة ${rec.no}`); inv.over = null; }
  db.invoices.push(rec); logA('inv_add', `فاتورة ${rec.no}`, name, money(rec.net), ...(place ? [place] : []), ...(pmIs(pmNow) ? [pmName(pmNow)] : [])); rcFromPm({ ...ps, pm: pmNow }, { cid, name, a: paidAll, k: 'inv', ref: rec.no }); save();
  toast('تم إصدار الفاتورة وخصم الكميات من المخزن', 'ok');
  go('invDetail', { id: rec.id }, { replace: true });
}

/* ---------- Invoice sheet & list ---------- */
screens.invDetail = (p, v) => {
  const r = db.invoices.find(x => x.id === p.id);
  if (!r) return back();
  const canPrint = !window.claude, cust = db.customers.find(x => x.id === r.customerId), left = invLeft(r), pays = invPays(r).sort(byDate), isVoid = r.status === 'void', rets = db.returns.filter(x => x.invId === r.id), dls = dlOf(r.id);
  v.innerHTML = subHead('فاتورة رقم ' + r.no) + `<div class="stack">${invPaper(r)}
    ${isVoid ? `<section class="panel noprint"><p class="lbl" style="margin:0">أُلغيت هذه الفاتورة في ${dateTimeAr(r.void.at)} — السبب: <b>${esc(r.void.reason || '—')}</b>${r.replacedBy ? ` — حلّت محلها فاتورة رقم <b>${esc(r.replacedBy)}</b>` : ''}${r.void.coll > 0 ? ` — رُدّت للعميل التحصيلات اللاحقة <b>${money(r.void.coll)}</b>` : ''}</p></section>` : ''}
    ${r.fromQuote ? `<section class="panel noprint"><p class="lbl" style="margin:0">أُصدرت هذه الفاتورة من عرض السعر رقم <b>${esc(r.fromQuote)}</b>.</p></section>` : ''}
    ${dls.length ? `<section class="panel noprint"><h2 class="panel-t">التوصيل</h2><div class="tbl-wrap"><table class="grid cardt"><thead><tr><th>الموعد</th><th>السائق</th><th>الحالة</th><th>عرض</th></tr></thead><tbody>${dls.map(x => `<tr><td data-l="الموعد"><bdi dir="ltr">${esc(x.date)}</bdi></td><td data-l="السائق">${esc(x.driver || '—')}</td><td data-l="الحالة"><span class="pill ${DL_CLS[x.status]}">${DL_ST[x.status]}</span></td><td><button class="mini" data-dv="${esc(x.id)}">عرض</button></td></tr>`).join('')}</tbody></table></div></section>` : ''}
    ${r.edits && r.edits.length ? `<section class="panel noprint"><p class="lbl" style="margin:0">عُدّلت هذه الفاتورة، وآخر تعديل كان في ${dateTimeAr(r.edits[r.edits.length - 1].at)}</p></section>` : ''}
    ${r.replaces ? `<section class="panel noprint"><p class="lbl" style="margin:0">هذه الفاتورة حلّت محل الفاتورة رقم <b>${esc(r.replaces)}</b> بعد تعديلها.</p></section>` : ''}
    ${rets.length ? `<section class="panel noprint"><h2 class="panel-t">المرتجعات على هذه الفاتورة</h2><div class="tbl-wrap"><table class="grid"><thead><tr><th>الرقم</th><th>التاريخ</th><th>القيمة</th><th>عرض</th></tr></thead><tbody>${rets.map(x => `<tr><td>${esc(x.no)}</td><td class="muted">${dateTimeAr(x.date)}</td><td class="val">${money(x.net)}</td><td><button class="mini" data-retview="${esc(x.id)}">عرض</button></td></tr>`).join('')}</tbody></table></div></section>` : ''}
    ${rcPanel(rcForInv(r))}
    ${cust || pays.length ? `<section class="panel noprint">
      ${cust ? `<p class="lbl" style="margin:0 0 ${pays.length ? 12 : 0}px">العميل: <button class="lnk" data-cust="${cust.id}">${esc(cust.name)}</button> — <span>${isVoid ? 'الفاتورة ملغاة' : left > 0 ? `المتبقي على الفاتورة <b>${money(left)}</b>` : 'الفاتورة مسدّدة بالكامل'}</span></p>` : ''}
      ${pays.length ? `<h2 class="panel-t">التحصيلات على هذه الفاتورة</h2><div class="tbl-wrap"><table class="grid"><thead><tr><th>التاريخ</th><th>المبلغ المحصَّل</th></tr></thead><tbody>${pays.map(x => `<tr><td class="muted">${dateTimeAr(x.date)}</td><td class="val">${money(x.a)}${pmBadge(x.pm)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    </section>` : ''}
    <div class="actions noprint" style="justify-content:center">
      <button class="btn" data-act="go" data-to="invMenu">${ICON.plus}<span>فاتورة جديدة</span></button>
      ${!isVoid && cust && left > 0 ? `<button class="btn outline" id="i-pay" type="button">تحصيل على الفاتورة</button>` : ''}
      ${!isVoid && left > 0 ? `<button class="btn outline" id="i-rm" type="button">${ICON.alarm}<span>منبّه تحصيل</span></button>` : ''}
      ${!isVoid ? `<button class="btn outline" id="i-ret" type="button">مرتجع</button><button class="btn outline" id="i-edit" type="button">تعديل</button><button class="btn outline" id="i-name" type="button">تعديل الاسم</button><button class="btn danger" id="i-void" type="button">إلغاء الفاتورة</button>` : ''}
      ${cust ? `<button class="btn ghost" data-cust="${cust.id}">كشف حساب العميل</button>` : ''}
      <button class="btn ghost" data-act="go" data-to="invList">كل الفواتير</button>
      ${canPrint ? `<button class="btn ghost" id="i-print" type="button">${ICON.printer}<span>طباعة / حفظ PDF</span></button><button class="btn ghost" id="i-pdf" type="button">${ICON.pdf}<span>تصدير PDF</span></button>` : ''}
      ${!isVoid ? `<button class="btn ghost" id="i-wa" type="button">${ICON.chat}<span>إرسال واتساب (PDF)</span></button><button class="btn ghost" id="i-dl" type="button">${ICON.truck}<span>توصيل</span></button>` : ''}
    </div></div>`;
  const bWa = $('#i-wa'); if (bWa) { bWa.onclick = () => waInvoice(r); docWarm(invPaper(r), 'فاتورة', r.no); }
  const bPdf = $('#i-pdf'); if (bPdf) bPdf.onclick = () => pdfSave(invPaper(r), 'فاتورة', r.no); /* the file is drawn by the program itself (no print window), so it also works where the browser's print / save-as-PDF dialog is troublesome */
  const bDl = $('#i-dl'); if (bDl) bDl.onclick = () => delivForm({ inv: r });
  $$('[data-dv]', v).forEach(b => b.onclick = () => go('delivDetail', { id: b.dataset.dv }));
  $$('[data-cust]', v).forEach(b => b.onclick = () => go('custDetail', { id: b.dataset.cust }));
  const pay = $('#i-pay'); if (pay) pay.onclick = () => collectModal(r.customerId, r.id, () => render());
  const bRm = $('#i-rm'); if (bRm) bRm.onclick = () => alarmCollect(r.customerId || '', r.id);
  $$('[data-retview]', v).forEach(b => b.onclick = () => go('retDetail', { id: b.dataset.retview }));
  const bRet = $('#i-ret'); if (bRet) bRet.onclick = async () => { if (await requireAdmin('اكتب الرقم السري للمسؤول لتسجيل مرتجع')) go('invReturn', { id: r.id }); };
  const bEdit = $('#i-edit'); if (bEdit) bEdit.onclick = async () => { if (await requireAdmin('اكتب الرقم السري للمسؤول لتعديل الفاتورة')) go('invForm', { edit: r.id }); };
  const bName = $('#i-name'); if (bName) bName.onclick = () => invInfoModal(r);
  const bVoid = $('#i-void'); if (bVoid) bVoid.onclick = () => voidModal(r);
  const pb = $('#i-print');
  if (pb) pb.onclick = () => printRep(('فاتورة_' + r.name + '_' + ymd(r.date)).replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_'));
};

screens.invList = (p, v) => {
  v.innerHTML = subHead('الفواتير') + `<section class="panel">
    <div class="toolbar"><input id="q" class="inp" placeholder="ابحث برقم الفاتورة أو اسم العميل أو المكان" aria-label="بحث" autocomplete="off"></div>
    ${db.invoices.length ? docBar('inv', '', true) : ''}
    <div class="tbl-wrap"><table class="grid"><colgroup><col style="width:10%"><col style="width:20%"><col style="width:20%"><col style="width:15%"><col style="width:15%"><col style="width:12%"><col style="width:8%"></colgroup>
    <thead><tr><th>الرقم</th><th>التاريخ</th><th>العميل</th><th>الصافي</th><th>المدفوع</th><th>المتبقي</th><th>عرض</th></tr></thead><tbody id="rows"></tbody></table></div>
  </section>`;
  const draw = () => {
    const q = toLat($('#q').value.trim()), m = settledMap();
    const list = db.invoices.slice().reverse().filter(r => !q || r.no.includes(q) || r.name.includes(q) || (r.place || '').includes(q));
    $('#rows').innerHTML = list.map(r => { const left = invLeft(r, m), vd = r.status === 'void', rn = invRetNet(r); return `<tr${vd ? ' class="vd"' : ''}><td>${esc(r.no)}</td><td class="muted">${dateTimeAr(r.date)}</td><td>${esc(r.name)}${r.place ? `<br><small class="muted">${esc(r.place)}</small>` : ''}</td><td class="val">${fmt(r.net)}${rn ? `<br><small class="muted">مرتجع ${fmt(rn)}</small>` : ''}</td><td>${fmt(round2(invPaidNow(r, m) + (r.over || 0)))}${m[r.id] ? `<br><small class="muted">منها تحصيل ${fmt(m[r.id])}</small>` : ''}</td>
      <td>${vd ? '<span class="pill info">ملغاة</span>' : left > 0 ? `<span class="pill bad">${fmt(left)}</span>` : r.over > 0 ? `<span class="pill info">له ${fmt(r.over)}</span>` : '<span class="pill ok">مسدّدة</span>'}</td>
      <td><button class="mini" data-view="${esc(r.id)}">عرض</button></td></tr>`; }).join('')
      || `<tr><td colspan="7" class="empty">${db.invoices.length ? 'لا توجد نتائج' : 'لم تصدر أي فاتورة بعد.'}</td></tr>`;
    $$('[data-view]', v).forEach(b => b.onclick = () => go('invDetail', { id: b.dataset.view }));
  };
  if (p && p.q) $('#q').value = p.q;
  $('#q').addEventListener('input', draw); draw();
};
