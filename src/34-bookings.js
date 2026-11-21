/* ---------- Bookings: customer deposits that can be spent on a later invoice or refunded ---------- */
const bkUsed = b => round2(b.uses.reduce((s, u) => s + u.a, 0));
const bkRef = b => round2(b.refunds.reduce((s, u) => s + u.a, 0));
const bkOpen = b => Math.max(round2(b.amount - bkUsed(b) - bkRef(b)), 0);
/* where a customer's credit came from and where it went. Every move is kept on the credit itself (b.uses: late:1 = put on an invoice after it was issued, no flag = taken off at issue, inv:'ترحيل' = moved to another place's balance) */
const bkFrom = b => b.fromInv ? (placeOf(b) ? `الفاتورة رقم ${b.fromInv} المحجوزة للمكان ${placeOf(b)}` : `الفاتورة رقم ${b.fromInv} المحجوزة`) : (placeOf(b) ? `رصيد «${b.desc || 'عربون'}» المحجوز للمكان ${placeOf(b)}` : `رصيد «${b.desc || 'عربون'}» المحجوز`);
/* the same source, short (v8.41): «حجز حديد» — قطعه ٢٩٣ الرحاب  /  فاتورة 9001 — قطعه ٢٩٣ الرحاب */
const bkS = b => { const pl = placeOf(b), d = b.desc || 'عربون'; return b.fromInv ? `فاتورة ${b.fromInv}${pl ? ' — ' + pl : ''}` : d === 'عربون' || d === 'عربون — ' + pl ? (pl || 'عربون') : `«${d}»${pl && !d.includes(pl) ? ' — ' + pl : ''}`; }; /* the default name «عربون — المكان» is only the place; a name that already holds the place does not repeat it */
const invRef = no => { const i = db.invoices.find(x => x.no === no && x.status !== 'void'); return i ? `الفاتورة ${no} (${placeOf(i) || 'بدون مكان'})` : `الفاتورة ${no}`; };
/* what was moved onto invoice r from a balance of the customer («ins»), and what left the extra payment this invoice created («outs») */
function invMoves(r) {
  const ins = [], outs = []; if (!r.customerId) return { ins, outs, left: 0 }; let left = 0;
  db.bookings.filter(b => b.customerId === r.customerId).forEach(b => {
    b.uses.forEach(u => { if (u.late && u.inv === r.no) ins.push({ a: u.a, date: u.date, b }); });
    if (b.fromInv === r.no) { b.uses.forEach(u => { if (u.inv !== 'ترحيل') outs.push({ a: u.a, date: u.date, to: u.inv, late: !!u.late }); }); left = round2(left + bkOpen(b)); }
  });
  const byD = (x, y) => String(x.date).localeCompare(String(y.date)); return { ins: ins.sort(byD), outs: outs.sort(byD), left };
}
/* the trail under a balance: what it started as, what is left, and every move out of it */
const bkTrail = b => {
  if (!b.uses.length && !b.refunds.length) return '';
  return `<div class="trail"><small>${esc(`الأصل ${money(b.amount)} — المتبقي ${money(bkOpen(b))}`)}</small>${b.refunds.map(u => `<small>${esc(`رُدّ ${money(u.a)} للعميل`)}</small>`).join('')}${b.uses.map(u => `<small>${esc(u.inv === 'ترحيل' ? (u.to ? `رُحّل ${money(u.a)} إلى رصيد مكان ${u.to}` : `رُحّل ${money(u.a)} إلى رصيد بدون مكان`) : u.late ? `رُحّل ${money(u.a)} إلى ${invRef(u.inv)}` : `خُصم ${money(u.a)} في ${invRef(u.inv)}`)}</small>`).join('')}</div>`;
};

/* the invoice this balance came out of (fromInv holds the invoice NUMBER; an id is still accepted for old data) */
const bkSrcInv = b => b.fromInv ? (db.invoices.find(x => x.no === b.fromInv && x.customerId === b.customerId && x.status !== 'void') || db.invoices.find(x => x.id === b.fromInv)) || null : null;
/* the moves out of a balance as rows, oldest first: put on an invoice, taken off at issue, moved to another place, paid back */
function bkMoves(b) {
  const ix = no => { const i = db.invoices.find(x => x.no === no && x.status !== 'void'); return i ? i.id : ''; };
  return b.uses.map(u => ({ d: u.date, a: u.a, inv: u.inv === 'ترحيل' ? '' : ix(u.inv), t: u.inv === 'ترحيل' ? (u.to ? `رُحّل إلى رصيد مكان ${u.to}` : 'رُحّل إلى رصيد بدون مكان') : u.late ? `رُحّل إلى ${invRef(u.inv)}` : `خُصم في ${invRef(u.inv)}` }))
    .concat(b.refunds.map(u => ({ d: u.date, a: u.a, inv: '', t: 'رُدّ للعميل' }))).sort((x, y) => String(x.d).localeCompare(String(y.d)));
}
/* a customer's balance as a paper, like an invoice: what it began as, every move out of it one under another with what is left after each, and the total left */
function bkPaper(b) {
  const cu = b.customerId ? db.customers.find(x => x.id === b.customerId) : null, iv = bkSrcInv(b), open = bkOpen(b), mv = bkMoves(b), who = esc(b.name) + (b.phone ? ' • ' + esc(b.phone) : '');
  const ln = (a, v, c = '') => `<div class="l${c ? ' ' + c : ''}"><span>${a}</span><b>${v}</b></div>`;
  let run = b.amount;
  const rows = `<tr><td class="dt"><bdi dir="ltr">${ymd(b.date)}</bdi></td><td class="bn">${esc(`الأصل: ${bkFrom(b)}`)}</td><td>${fmt(b.amount)}</td><td class="bl">${fmt(b.amount)}</td></tr>` +
    mv.map(m => { run = round2(run - m.a); return `<tr${m.inv ? ` class="clk" data-iv="${esc(m.inv)}"` : ''}><td class="dt"><bdi dir="ltr">${ymd(m.d)}</bdi></td><td class="bn">${esc(m.t)}</td><td>${fmt(m.a)}</td><td class="bl">${fmt(run)}</td></tr>`; }).join('');
  return paper(letterhead(letterOf()) + `<div class="rt"><h3>رصيد عميل</h3></div>` +
    `<div class="ibox"><span>اسم العميل: <b>${who}</b></span>${cu && cu.code ? `<span>كود العميل: <b><bdi dir="ltr">${esc(cu.code)}</bdi></b></span>` : ''}<span>المصدر: <b>${iv ? esc(`فاتورة رقم ${iv.no}`) : esc(b.desc || 'حجز')}</b></span>${placeOf(b) ? `<span>المكان: <b>${esc(placeOf(b))}</b></span>` : ''}<span>التاريخ: <b><bdi dir="ltr">${ymd(b.date)}</bdi></b></span></div>` +
    `<table class="itbl st bkt"><colgroup><col style="width:21%"><col style="width:36%"><col style="width:19%"><col style="width:24%"></colgroup><thead><tr><th>التاريخ</th><th>البيان</th><th>المبلغ</th><th>المتبقي</th></tr></thead><tbody>${rows}</tbody></table>` +
    `<div class="isum"><div class="ic">${ln('أصل الرصيد:', money(b.amount))}${bkUsed(b) ? ln('رُحّل وخُصم:', money(bkUsed(b))) : ''}${bkRef(b) ? ln('رُدّ للعميل:', money(bkRef(b))) : ''}</div><div class="ic">${ln('المتبقي من الرصيد:', open ? owe(-open) : 'منتهٍ', 'big')}</div></div>`, 'inv');
}
screens.bkDetail = (p, v) => {
  const b = db.bookings.find(x => x.id === p.id); if (!b) return back();
  const c = b.customerId ? db.customers.find(x => x.id === b.customerId) : null, iv = bkSrcInv(b), open = bkOpen(b), canPrint = !window.claude;
  const canGo = !!c && db.invoices.some(i => i.customerId === c.id && i.status !== 'void' && invLeft(i) > 0);
  v.innerHTML = subHead('رصيد العميل') + `<div class="stack">${bkPaper(b)}
    <div class="actions noprint" style="justify-content:center">
      ${open > 0 && canGo ? `<button class="btn" id="b-xf" type="button">ترحيل</button>` : ''}
      ${iv ? `<button class="btn outline" data-iv="${esc(iv.id)}">الفاتورة الأصلية</button>` : ''}
      ${c ? `<button class="btn ghost" data-cust="${c.id}">كشف حساب العميل</button>` : ''}
      <button class="btn ghost" data-act="go" data-to="bookings">الحجوزات</button>
      ${canPrint ? `<button class="btn ghost" id="b-print" type="button">${ICON.printer}<span>طباعة / حفظ PDF</span></button>` : ''}
      <button class="btn ghost" id="b-wa" type="button">${ICON.chat}<span>إرسال واتساب (PDF)</span></button>
    </div></div>`;
  $$('[data-iv]', v).forEach(b2 => b2.onclick = () => go('invDetail', { id: b2.dataset.iv }));
  $$('[data-cust]', v).forEach(b2 => b2.onclick = () => go('custDetail', { id: b2.dataset.cust }));
  const xf = $('#b-xf'); if (xf) xf.onclick = () => transferModal(c, () => render(), b.id);
  const pb = $('#b-print'); if (pb) pb.onclick = () => printRep(('رصيد_' + b.name + '_' + ymd(b.date)).replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_'));
  const wa = $('#b-wa'); if (wa) { wa.onclick = () => waBk(b); docWarm(bkPaper(b), 'رصيد عميل', b.name); }
};

/* the list says only «حجز» in «البيان»: what kind of balance it is and where every pound of it went is inside «عرض» (the balance page), not stacked in the list */
screens.bookings = (p, v) => {
  v.innerHTML = subHead('الحجوزات') + `<section class="panel">
    <div class="toolbar"><input id="q" class="inp" placeholder="ابحث باسم العميل أو المكان أو البيان" aria-label="بحث" autocomplete="off"><button class="btn" id="k-add" type="button">${ICON.plus}<span>إيداع حجز جديد</span></button></div>
    <div class="stats" id="k-stats" style="margin-bottom:16px"></div>
    ${db.bookings.length ? docBar('bk', '', true) : ''}
    <div class="tbl-wrap"><table class="grid"><colgroup><col style="width:13%"><col style="width:16%"><col style="width:13%"><col style="width:15%"><col style="width:11%"><col style="width:11%"><col style="width:11%"><col style="width:10%"></colgroup>
    <thead><tr><th>التاريخ</th><th>العميل</th><th>المكان</th><th>البيان</th><th>العربون</th><th>المستخدم</th><th>المتبقي</th><th>إجراء</th></tr></thead><tbody id="rows"></tbody></table></div></section>`;
  const draw = () => {
    const q = $('#q').value.trim(), openN = db.bookings.filter(b => bkOpen(b) > 0);
    $('#k-stats').innerHTML = `<div class="stat blue"><span>حجوزات مفتوحة</span><b>${openN.length}</b></div><div class="stat"><span>إجمالي العربون المتبقي</span><b>${money(openN.reduce((s, b) => s + bkOpen(b), 0))}</b></div>`;
    const list = db.bookings.slice().reverse().filter(b => !q || b.name.includes(q) || b.desc.includes(q) || placeOf(b).includes(q));
    $('#rows').innerHTML = list.map(b => { const o = bkOpen(b); return `<tr class="clk" data-bkrow="${esc(b.id)}"><td class="muted">${dateTimeAr(b.date)}</td><td>${b.customerId && db.customers.some(x => x.id === b.customerId) ? `<button class="lnk" data-cu="${esc(b.customerId)}">${esc(b.name)}</button>` : esc(b.name)}</td><td>${placeOf(b) ? `<span class="bk-pl">${esc(placeOf(b))}</span>` : '<span class="muted">—</span>'}</td><td class="muted">حجز</td>
      <td class="val">${fmt(b.amount)}</td><td>${fmt(bkUsed(b))}${bkRef(b) ? `<br><small class="muted">مردود ${fmt(bkRef(b))}</small>` : ''}</td>
      <td>${o ? `<span class="pill info">${fmt(o)}</span>` : '<span class="pill ok">منتهٍ</span>'}</td>
      <td><div class="actions" style="justify-content:center;gap:6px"><button class="mini" data-bk="${esc(b.id)}">عرض</button>${o ? `<button class="mini" data-ref="${b.id}">رد</button>` : ''}${!b.uses.length && !b.refunds.length && !b.xfer ? `<button class="del" data-rm="${b.id}" aria-label="حذف الحجز">${ICON.trash}</button>` : ''}</div></td></tr>`; }).join('')
      || `<tr><td colspan="8" class="empty">${db.bookings.length ? 'لا توجد نتائج' : 'لا توجد حجوزات. اضغط «إيداع حجز جديد».'}</td></tr>`;
    $$('[data-cu]', v).forEach(b => b.onclick = () => go('custDetail', { id: b.dataset.cu })); /* his statement: invoices, places, deposits */
    $$('[data-ref]', v).forEach(b => b.onclick = () => refundModal(b.dataset.ref, draw));
    $$('[data-bk]', v).forEach(b => b.onclick = () => go('bkDetail', { id: b.dataset.bk }));
    $$('tr[data-bkrow]', v).forEach(tr => tr.onclick = e => { if (!e.target.closest('button, a, .lnk, input')) go('bkDetail', { id: tr.dataset.bkrow }); });
    $$('[data-rm]', v).forEach(b => b.onclick = async () => {
      const bk = db.bookings.find(x => x.id === b.dataset.rm); if (!bk) return;
      if (isLocked(bk.date)) return toast('هذا الحجز في فترة مقفولة ولا يمكن حذفه');
      if (await confirmBox('حذف الحجز', 'سيُحذف الحجز (لم يُستخدم ولم يُرد منه شيء). يُنصح بالرد بدل الحذف لو العميل سيسترد العربون.')) { db.bookings = db.bookings.filter(x => x.id !== bk.id); logA('bk_del', bk.name, money(bk.amount)); save(); draw(); }
    });
  };
  $('#q').addEventListener('input', draw);
  $('#k-add').onclick = () => modal(`<h3>إيداع حجز جديد</h3>
    <div class="field"><label for="k-name">اسم العميل</label><input id="k-name" class="inp" list="k-list" autocomplete="off"><datalist id="k-list">${db.customers.map(c => `<option value="${esc(c.name)}">`).join('')}</datalist></div>
    <div class="field"><label for="k-phone">رقم الموبايل</label><input id="k-phone" class="inp" inputmode="tel" autocomplete="off"></div>
    <div class="field"><label for="k-place">المكان (اختياري)</label><input id="k-place" class="inp" list="k-pl" maxlength="60" placeholder="إن كان العربون لمكان معيّن عند العميل" autocomplete="off"><datalist id="k-pl"></datalist></div>
    <div class="field"><label for="k-desc">البيان</label><input id="k-desc" class="inp" placeholder="مثال: حجز حديد" autocomplete="off"></div>
    <div class="field"><label for="k-amt">مبلغ العربون (جنيه)</label><input id="k-amt" class="inp" inputmode="decimal" placeholder="0" autocomplete="off"></div>
    ${pmHTML('k-pm')}
    <div class="actions"><button class="btn" data-ok>تسجيل الإيداع</button><button class="btn ghost" data-no>إلغاء</button></div>`, (d, close) => {
    $('#k-amt').addEventListener('input', e => { e.target.value = cleanNum(e.target.value); });
    const kpm = pmWire(d, 'k-pm');
    $('#k-name').addEventListener('change', e => { const c = db.customers.find(x => x.name === e.target.value.trim()); if (c && c.phone && !$('#k-phone').value) $('#k-phone').value = c.phone; $('#k-pl').innerHTML = c ? custPlaces(c).map(x => `<option value="${esc(x)}">`).join('') : ''; });
    $('[data-no]', d).onclick = close;
    $('[data-ok]', d).onclick = () => {
      const name = $('#k-name').value.trim(), phone = toLat($('#k-phone').value).trim(), amount = round2(num($('#k-amt').value));
      if (!name) return toast('اكتب اسم العميل');
      if (amount <= 0) return toast('اكتب مبلغ العربون');
      let c = db.customers.find(x => (phone && x.phone === phone) || x.name === name);
      if (!c) { c = { id: uid(), name, phone, address: '' }; db.customers.push(c); } else if (phone && !c.phone) c.phone = phone;
      const place = $('#k-place').value.trim();
      if (place && !custPlaces(c).includes(place)) { c.places = c.places || []; c.places.push(place); }
      const s = pmGet(kpm), bid = uid();
      db.bookings.push({ id: bid, customerId: c.id, name: c.name, phone: c.phone || phone, desc: $('#k-desc').value.trim() || 'حجز', amount, date: new Date().toISOString(), uses: [], refunds: [], ...(place ? { place } : {}), ...(pmIs(s.pm) ? { pm: s.pm } : {}) });
      logA('bk_add', c.name, money(amount), ...(place ? [place] : []), ...(pmIs(s.pm) ? [pmName(s.pm)] : [])); rcFromPm(s, { cid: c.id, name: c.name, a: amount, k: 'bk', ref: bid }); save(); close(); draw(); toast('تم تسجيل إيداع الحجز', 'ok');
    };
  });
  draw();
};

function refundModal(id, done) {
  const b = db.bookings.find(x => x.id === id), o = b ? bkOpen(b) : 0; if (!b || !o) return;
  modal(`<h3>رد عربون ${esc(b.name)}</h3><p>المتبقي من العربون: <b>${money(o)}</b></p>
    <div class="field"><label for="m-amt">المبلغ المردود (جنيه)</label><input id="m-amt" class="inp" inputmode="decimal" value="${o}" autocomplete="off"></div>
    <div class="actions"><button class="btn" data-ok>تسجيل الرد</button><button class="btn ghost" data-no>إلغاء</button></div>`, (d, close) => {
    $('#m-amt').addEventListener('input', e => { e.target.value = cleanNum(e.target.value); });
    $('[data-no]', d).onclick = close;
    $('[data-ok]', d).onclick = () => {
      const a = round2(num($('#m-amt').value));
      if (a <= 0) return toast('اكتب مبلغاً أكبر من صفر');
      if (a > o + 0.004) return toast('المبلغ أكبر من المتبقي من العربون');
      b.refunds.push({ a, date: new Date().toISOString() }); logA('bk_ref', b.name, money(a)); save(); close(); done(); toast('تم رد العربون وسُجّل كمصروف خارج', 'ok');
    };
  });
}
