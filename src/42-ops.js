/* ---------- Operations: cancel / edit invoices, sales returns, cash count & period close, audit log, tax switch, Excel export ---------- */

/* ===== cancel an invoice ===== */
function canVoid(i) { /* a cancelled (or edited) invoice must leave nothing half-done: no returns, not in a closed period. Later collections (instalments) are no obstacle: cancel pays them back to the customer, edit keeps them on the same invoice */
  if (i.status === 'void') return { ok: false, why: 'الفاتورة ملغاة بالفعل' };
  if (db.returns.some(r => r.invId === i.id)) return { ok: false, why: 'عليها مرتجع ولا يمكن إلغاؤها أو تعديل أصنافها (اسم العميل فقط يتعدّل من «تعديل الاسم»)' };
  if (isLocked(i.date)) return { ok: false, why: 'الفاتورة في فترة مقفولة، سجّل مرتجعاً بدل الإلغاء (اسم العميل فقط يتعدّل من «تعديل الاسم»)' };
  if (db.bookings.some(b => b.fromInv === i.no && (b.uses.length || b.refunds.length))) return { ok: false, why: 'الرصيد الزائد المسجَّل للعميل من هذه الفاتورة استُخدم أو رُدّ، سجّل مرتجعاً بدل الإلغاء' };
  return { ok: true };
}
function backToStock(l, w) { /* goods come back to the shelf (of the line's own warehouse); the average cost is kept fair */
  const it = itemById(l.itemId); if (!it) return;
  const q = round3(it.qty + l.qty);
  if (l.cost != null && q > 0) it.cost = round2((Math.max(it.qty, 0) * it.cost + l.qty * l.cost) / q); /* an old line with no saved cost leaves the average as it is */
  stockMove(it, l.wh || w || WH0, l.qty);
}
function voidCore(i, reason, keepPays) { /* keepPays: the instalments are not paid back (an old-style edit; kept for old callers) */
  i.rows.forEach(l => backToStock(l, i.wh));
  db.bookings.forEach(b => { b.uses = b.uses.filter(u => u.inv !== i.no); }); /* a booking deposit it used becomes free again */
  db.bookings.forEach(b => { if (b.fromInv === i.no) { const o = bkOpen(b); if (o > 0) b.refunds.push({ a: o, date: new Date().toISOString() }); } }); /* the extra the customer paid on it goes back to him */
  db.quotes.forEach(q => { if (q.status === 'done' && q.invNo === i.no) { q.status = 'open'; q.invNo = ''; } }); /* the quotation it came from is open again */
  const coll = keepPays ? 0 : invSettled(i); /* what was collected on it after issue: paid back to the customer on the day of the cancel */
  i.status = 'void'; i.void = { at: new Date().toISOString(), reason: reason || '', by: CUR_USER ? CUR_USER.name : '' };
  if (coll > 0) i.void.coll = coll;
}
async function voidModal(i) {
  i = db.invoices.find(x => x.id === i.id) || i;
  const c = canVoid(i); if (!c.ok) return toast(c.why);
  if (!await requireAdmin('اكتب الرقم السري للمسؤول لإلغاء الفاتورة')) return;
  modal(`<h3>إلغاء الفاتورة رقم ${esc(i.no)}</h3>
    <p>يرجع ما فيها من أصناف إلى المخزن، وتبقى الفاتورة في السجل بعلامة «ملغاة».</p>
    ${invPaidAll(i) + invSettled(i) > 0 ? `<p>سيُسجَّل رد المبلغ المدفوع (<b>${money(round2(invPaidAll(i) + invSettled(i)))}</b>) كخارج من الخزينة.</p>` : ''}
    ${invSettled(i) > 0 ? `<p class="muted"><small>منه ${money(invPaidAll(i))} عند الإصدار، و${money(invSettled(i))} تحصيلات لاحقة (${invPays(i).length} دفعة)</small></p>` : ''}
    ${i.deposit > 0 ? '<p>يعود العربون المخصوم إلى الحجز.</p>' : ''}
    <div class="field"><label for="v-why">سبب الإلغاء</label><input id="v-why" class="inp" maxlength="120" autocomplete="off"></div>
    <div class="actions"><button class="btn danger" data-ok>إلغاء الفاتورة</button><button class="btn outline" data-no>رجوع</button></div>`, (d, close) => {
    $('[data-no]', d).onclick = close;
    $('[data-ok]', d).onclick = () => {
      const why = $('#v-why').value.trim(); if (!why) return toast('اكتب سبب الإلغاء');
      const c2 = canVoid(i); if (!c2.ok) { close(); return toast(c2.why); }
      voidCore(i, why); logA('inv_void', `فاتورة ${i.no}`, i.name, why); save(); close(); toast('تم إلغاء الفاتورة', 'ok'); render();
    };
  });
}

/* ===== change only the customer's name / phone / address printed on an invoice (in place: same number, no stock or money moves, allowed even when the items can no longer be edited) ===== */
async function invInfoModal(i) {
  i = db.invoices.find(x => x.id === i.id) || i; if (i.status === 'void') return toast('الفاتورة ملغاة');
  if (!await requireAdmin('اكتب الرقم السري للمسؤول لتعديل اسم العميل على الفاتورة')) return;
  modal(`<h3>تعديل الاسم على الفاتورة رقم ${esc(i.no)}</h3>
    <p class="muted"><small>يتغيّر الاسم والموبايل والعنوان المكتوبة على الفاتورة فقط، ولا يتغيّر أي صنف أو مبلغ أو حساب العميل.</small></p>
    <div class="field"><label for="e-name">اسم العميل</label><input id="e-name" class="inp" maxlength="80" autocomplete="off" value="${esc(i.name)}"></div>
    <div class="field"><label for="e-phone">الموبايل</label><input id="e-phone" class="inp" inputmode="tel" dir="ltr" maxlength="20" autocomplete="off" value="${esc(i.phone || '')}"></div>
    <div class="field"><label for="e-addr">العنوان</label><input id="e-addr" class="inp" maxlength="120" autocomplete="off" value="${esc(i.addr || '')}"></div>
    ${i.kind !== 'cash' ? `<div class="field"><label for="e-place">المكان</label><input id="e-place" class="inp" list="e-pl" maxlength="60" autocomplete="off" value="${esc(placeOf(i))}"><datalist id="e-pl">${custPlaces(db.customers.find(x => x.id === i.customerId)).map(x => `<option value="${esc(x)}">`).join('')}</datalist></div>` : ''}
    <div class="actions"><button class="btn" data-ok>حفظ</button><button class="btn outline" data-no>رجوع</button></div>`, (d, close) => {
    $('[data-no]', d).onclick = close;
    $('[data-ok]', d).onclick = () => {
      const name = $('#e-name').value.trim(), phone = toLat($('#e-phone').value).trim(), addr = $('#e-addr').value.trim();
      if (!name) return toast('اكتب اسم العميل');
      const pe = $('#e-place'), place = pe ? pe.value.trim() : placeOf(i);
      if (name === i.name && phone === (i.phone || '') && addr === (i.addr || '') && place === placeOf(i)) { close(); return toast('لم يتغيّر شيء'); }
      const was = i.name, wasPl = placeOf(i); i.name = name; i.phone = phone; i.addr = addr;
      if (place !== wasPl) { if (place) i.place = place; else delete i.place; const cu = db.customers.find(x => x.id === i.customerId); if (cu && place && !custPlaces(cu).includes(place)) { cu.places = cu.places || []; cu.places.push(place); } }
      if (name !== was || phone !== (i.phone || '') || addr !== (i.addr || '')) logA('inv_edit', `تعديل اسم فاتورة ${i.no}`, was, name);
      if (place !== wasPl) logA('inv_edit', `تعديل مكان فاتورة ${i.no}`, wasPl || 'بدون مكان', place || 'بدون مكان'); save(); close(); toast('تم تعديل بيانات العميل على الفاتورة', 'ok'); render();
    };
  });
}

/* ===== sales returns ===== */
const retLines = i => i.rows.map((l, li) => ({ li, l, done: round3(db.returns.filter(r => r.invId === i.id).reduce((s, r) => s + r.rows.filter(x => x.li === li).reduce((a, x) => a + x.qty, 0), 0)) }));
function retCalc(i, q) { /* value of the returned quantities, with the invoice's own discount and VAT share; the last piece takes the exact remainder */
  let sub = 0, cost = 0, full = true;
  retLines(i).forEach(x => { const k = q[x.li] || 0; sub += round2(k * x.l.price); cost += k * (x.l.cost || 0); if (x.l.qty - round3(x.done + k) > 1e-9) full = false; });
  const prev = db.returns.filter(r => r.invId === i.id), sum = f => prev.reduce((s, r) => s + (r[f] || 0), 0);
  sub = round2(sub); let cashD = i.discCash ? round2(i.discCash * sub / (i.subtotal || sub)) : 0; /* the cash discount comes back in proportion to the goods returned */
  let discAmt = round2(round2(sub * (i.discPct || 0) / 100) + cashD), vatAmt = i.vatOn ? round2((sub - discAmt) * (i.vatPct || 0) / 100) : 0, net = round2(sub - discAmt + vatAmt);
  if (full && sub > 0) { /* the last piece: what is left of the invoice, so all the returns add up exactly to its net */
    sub = round2(i.subtotal - sum('subtotal')); net = round2(i.net - sum('net')); cashD = round2((i.discCash || 0) - sum('discCash'));
    if (i.vatOn) { discAmt = round2(i.discAmt - sum('discAmt')); vatAmt = round2(net - sub + discAmt); } else { vatAmt = 0; discAmt = round2(sub - net); }
  }
  const credit = round2(Math.min(net, invLeft(i)));
  return { sub, discAmt, cashD, vatAmt, net, cost: round2(cost), credit, refund: round2(net - credit) };
}
screens.invReturn = (p, v) => {
  const i = db.invoices.find(x => x.id === p.id); if (!i || i.status === 'void') return back();
  const L = retLines(i), q = L.map(() => 0);
  v.innerHTML = subHead('مرتجع من فاتورة رقم ' + i.no) + `<div class="stack">
    <section class="panel"><h2 class="panel-t">اختر الكميات المرتجعة</h2>
      <div class="tbl-wrap"><table class="grid"><colgroup><col style="width:30%"><col style="width:16%"><col style="width:18%"><col style="width:20%"><col style="width:16%"></colgroup>
      <thead><tr><th>الصنف</th><th>المباع</th><th>سبق رده</th><th>المرتجع الآن</th><th>السعر</th></tr></thead><tbody>${L.map(x => `<tr><td>${esc(x.l.name)}</td><td>${fmt(x.l.qty)} ${esc(x.l.unit)}</td><td class="muted">${fmt(x.done)}</td>
        <td>${x.l.qty - x.done > 0 ? `<input class="ctr" data-q="${x.li}" inputmode="decimal" placeholder="0" aria-label="الكمية المرتجعة" autocomplete="off">` : '<span class="pill ok">تم ردّه</span>'}</td><td class="muted">${fmt(x.l.price)}</td></tr>`).join('')}</tbody></table></div></section>
    <section class="panel"><div class="field"><label for="r-why">سبب المرتجع</label><input id="r-why" class="inp" maxlength="120" autocomplete="off"></div>
      <div class="sum-row"><span>قيمة المرتجع:</span><b id="rt-net">0 جنيه</b></div>
      <div class="sum-row"><span>يُخصم من المتبقي على الفاتورة:</span><b id="rt-cr">0 جنيه</b></div>
      <div class="net"><span>يُرد نقداً للعميل:</span><b id="rt-ref">0 جنيه</b></div></section>
    <div class="submit"><button class="btn lg" id="r-save" type="button">تسجيل المرتجع</button></div></div>`;
  const calc = () => { const c = retCalc(i, q); $('#rt-net').textContent = money(c.net); $('#rt-cr').textContent = money(c.credit); $('#rt-ref').textContent = money(c.refund); return c; };
  $$('[data-q]', v).forEach(inp => inp.addEventListener('input', () => {
    const x = L[+inp.dataset.q], max = round3(x.l.qty - x.done); inp.value = cleanNum(inp.value);
    if (num(inp.value) > max) { inp.value = String(max); toast(`أقصى كمية يمكن ردها ${fmtq(max)}`); }
    q[x.li] = num(inp.value); calc();
  }));
  $('#r-save').onclick = () => {
    if (!q.some(k => k > 0)) return toast('اكتب كمية مرتجعة لصنف واحد على الأقل');
    const why = $('#r-why').value.trim(); if (!why) return toast('اكتب سبب المرتجع');
    const c = calc(), rows = [];
    L.forEach(x => { if (q[x.li] > 0) rows.push({ li: x.li, itemId: x.l.itemId, name: x.l.name, unit: x.l.unit, qty: q[x.li], price: x.l.price, cost: x.l.cost || 0, total: round2(q[x.li] * x.l.price), wh: x.l.wh || i.wh || WH0 }); });
    rows.forEach(l => backToStock(l, i.wh));
    db.rseq = (db.rseq || 0) + 1;
    const rec = { id: uid(), no: 'R' + String(db.rseq).padStart(4, '0'), invId: i.id, invNo: i.no, customerId: i.customerId || null, name: i.name, date: new Date().toISOString(), rows, subtotal: c.sub, discPct: i.discPct || 0, ...(c.cashD > 0 ? { discCash: c.cashD } : {}), discAmt: c.discAmt, vatPct: i.vatPct || 0, vatAmt: c.vatAmt, net: c.net, cost: c.cost, credit: c.credit, refund: c.refund, reason: why };
    db.returns.push(rec); logA('ret_add', `مرتجع ${rec.no}`, `فاتورة ${i.no}`, i.name, money(rec.net)); save(); toast('تم تسجيل المرتجع وإرجاع الأصناف للمخزن', 'ok');
    go('retDetail', { id: rec.id }, { replace: true });
  };
  calc();
};
function retPaper(r) {
  const ln = (a, b, k = '') => `<div class="l${k ? ' ' + k : ''}"><span>${a}</span><b>${b}</b></div>`;
  return paper(letterhead(letterOf()) + `<div class="rt"><h3>إشعار مرتجع مبيعات</h3></div>` +
    `<div class="ibox"><span>اسم العميل: <b>${esc(r.name)}</b></span><span>مرتجع رقم: <b><bdi dir="ltr">${esc(r.no)}</bdi></b></span><span>عن فاتورة رقم: <b><bdi dir="ltr">${esc(r.invNo)}</bdi></b></span><span>التاريخ: <b><bdi dir="ltr">${ymd(r.date)}</bdi></b></span></div>` +
    `<table class="itbl"><colgroup><col style="width:34%"><col style="width:16%"><col style="width:25%"><col style="width:25%"></colgroup><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>` +
    r.rows.map(l => `<tr><td class="nm">${esc(l.name)}</td><td>${fmtq(l.qty)} ${esc(l.unit)}</td><td>${money(l.price)}</td><td>${money(l.total)}</td></tr>`).join('') + `</tbody></table>` +
    `<div class="isum"><div class="ic">${ln('إجمالي المرتجع:', money(r.subtotal))}${r.discAmt ? ln('الخصم:', '− ' + money(r.discAmt)) : ''}${r.vatAmt ? ln('القيمة المضافة:', money(r.vatAmt)) : ''}${ln('صافي المرتجع:', money(r.net), 'big')}</div>` +
    `<div class="ic">${ln('خُصم من المتبقي على الفاتورة:', money(r.credit))}${ln('رُدَّ نقداً للعميل:', money(r.refund), 'big')}${r.reason ? ln('السبب:', esc(r.reason), 'sub') : ''}</div></div>`, 'inv');
}
screens.retDetail = (p, v) => {
  const r = db.returns.find(x => x.id === p.id); if (!r) return back();
  const canPrint = !window.claude;
  v.innerHTML = subHead('مرتجع رقم ' + r.no) + `<div class="stack">${retPaper(r)}<div class="actions noprint" style="justify-content:center">
    <button class="btn ghost" data-act="go" data-to="invDetail" data-p='${esc(JSON.stringify({ id: r.invId }))}'>الفاتورة الأصلية</button><button class="btn ghost" data-act="go" data-to="retList">كل المرتجعات</button>
    ${canPrint ? `<button class="btn ghost" id="rd-print" type="button">${ICON.printer}<span>طباعة / حفظ PDF</span></button>` : ''}</div></div>`;
  const pb = $('#rd-print'); if (pb) pb.onclick = () => printRep(fileSafe('مرتجع_' + r.no + '_' + r.name));
};
screens.retList = (p, v) => {
  const tot = round2(db.returns.reduce((s, r) => s + r.net, 0));
  v.innerHTML = subHead('مرتجعات المبيعات') + `<section class="panel"><div class="stats" style="margin-bottom:16px"><div class="stat neg"><span>عدد المرتجعات</span><b>${db.returns.length}</b></div><div class="stat"><span>إجمالي قيمة المرتجعات</span><b>${money(tot)}</b></div></div>
    <div class="tbl-wrap"><table class="grid"><thead><tr><th>الرقم</th><th>التاريخ</th><th>العميل</th><th>الفاتورة</th><th>القيمة</th><th>عرض</th></tr></thead><tbody>${db.returns.slice().reverse().map(r => `<tr><td>${esc(r.no)}</td><td class="muted">${dateTimeAr(r.date)}</td><td>${esc(r.name)}</td><td>${esc(r.invNo)}</td><td class="val">${fmt(r.net)}</td><td><button class="mini" data-rv="${esc(r.id)}">عرض</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">لا توجد مرتجعات.</td></tr>'}</tbody></table></div>
    ${db.returns.length ? docBar('ret') : ''}</section>`;
  $$('[data-rv]', v).forEach(b => b.onclick = () => go('retDetail', { id: b.dataset.rv }));
};

/* ===== cash count & period close ===== */
const lastCount = before => db.closings.filter(c => c.date < before).sort((a, b) => a.date.localeCompare(b.date)).pop();
/* the cash that left or came into the drawer by a withdrawal / transfer / handover recorded after the count of its own day (8.45): the next day starts from what is really left in the drawer */
const afterCount = pv => pv ? round2(db.pmoves.filter(x => ymd(x.date) === pv.date && x.date > pv.at).reduce((t, x) => t + (x.to !== 'mgmt' && pmKey(x.to) === 'cash' ? x.amount : 0) - (x.from !== 'mgmt' && pmKey(x.from) === 'cash' ? x.amount : 0), 0)) : 0;

/* 8.49: the count and the close take in all four places (the drawer, InstaPay, the wallet, the bank account): what every place held when the day began, everything that came in and went out of it, and what it holds now. The drawer is the only one that is counted by hand; the other three are the program's figure. */
const dayShift = (d, n) => { const t = new Date(d + 'T12:00:00'); t.setDate(t.getDate() + n); return ymd(t); };
const CL_SEC = { inn: 'تحصيلات ومبيعات', cin: 'داخل (رأس المال / دعم الإدارة)', xin: 'تحويل داخل', out: 'مصروفات ومدفوعات ومرتجعات', tip: 'إكراميات', xout: 'تحويل خارج', mg: 'تسليم للإدارة' }, CL_IN = ['inn', 'cin', 'xin'], CL_OUT = ['out', 'tip', 'xout', 'mg'];
const CL_SHORT = { cash: 'نقدي', insta: 'إنستا باي', wallet: 'محفظة', bank: 'بنك' };
function dayPlaces(d) {
  const L = ledger(d, d), M = {}; Object.keys(CL_SEC).forEach(s => { M[s] = mixOf(L[s]); });
  const P = dayShift(d, -1), A = ledger('0000-01-01', P), ai = mixOf(A.inn.concat(A.cin, A.xin)), ao = mixOf(A.out.concat(A.tip, A.mg, A.xout)), pv = lastCount(d), mi = mixOf(L.inn.concat(L.cin)), ks = {};
  let cashOpen = round2(ai.cash - ao.cash);
  if (pv) { const F = ledger(dayShift(pv.date, 1), P), fi = mixOf(F.inn.concat(F.cin, F.xin)), fo = mixOf(F.out.concat(F.tip, F.mg, F.xout)); cashOpen = round2(pv.counted + afterCount(pv) + fi.cash - fo.cash); } /* the drawer starts from the last count plus everything that moved after it, up to the day before */
  Object.keys(CIN_PM).forEach(k => { const open = k === 'cash' ? cashOpen : round2(ai[k] - ao[k]), i = round2(CL_IN.reduce((s, q) => s + M[q][k], 0)), o = round2(CL_OUT.reduce((s, q) => s + M[q][k], 0)); ks[k] = { open, i, o, e: round2(open + i - o) }; });
  return { L, M, ks, hasPv: !!pv, innX: round2(mi.bank + mi.insta + mi.wallet) };
}
/* every operation of the day in time order, each with its place — what the count paper lists under the table (upTo: nothing recorded after the count) */
const dayLines = (L, upTo) => { const o = []; Object.keys(CL_SEC).forEach(s => L[s].forEach(e => { if (!upTo || e.d <= upTo) o.push({ d: e.d, w: e.w, a: e.a, k: pmKey(e.m), io: CL_IN.includes(s) ? 'i' : 'o' }); })); return o.sort((a, b) => a.d.localeCompare(b.d)); };
const clPlaces = c => c.places || { cash: { open: c.opening, i: round2((c.inn || 0) + (c.cin || 0) + (c.xin || 0)), o: round2((c.out || 0) + (c.tip || 0) + (c.xout || 0) + (c.mg || 0)), e: c.expected } }; /* a count saved before 8.49 knows the drawer only */
const clTime = d => { const t = new Date(d); return isNaN(t) ? '' : t.toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' }); };
/* the paper of one count: the four places, the drawer's count, what was handed over, the day's operations, the signatures */
function closePaper(c) {
  const P = clPlaces(c), ks = Object.keys(CIN_PM).filter(k => P[k]), sum = f => round2(ks.reduce((s, k) => s + P[k][f], 0)), H = c.hand, cash = P.cash || { e: c.expected };
  const ln = (a, b, k = '') => `<div class="l${k ? ' ' + k : ''}"><span>${a}</span><b>${b}</b></div>`;
  const left = round2(ks.reduce((s, k) => s + Math.max(k === 'cash' ? c.counted : P[k].e, 0), 0));
  const rows = ks.map(k => `<tr><td>${CIN_PM[k]}</td><td>${fmt(P[k].open)}</td><td>${P[k].i ? fmt(P[k].i) : '—'}</td><td>${P[k].o ? fmt(P[k].o) : '—'}</td><td>${fmt(P[k].e)}</td></tr>`).join('') + `<tr class="plh"><td>الإجمالي</td><td>${fmt(sum('open'))}</td><td>${fmt(sum('i'))}</td><td>${fmt(sum('o'))}</td><td>${fmt(sum('e'))}</td></tr>`;
  const lines = dayLines(ledger(c.date, c.date), c.at), det = lines.map(x => `<tr><td>${clTime(x.d)}</td><td class="nm">${esc(x.w)}</td><td>${CL_SHORT[x.k]}</td><td>${x.io === 'i' ? fmt(x.a) : ''}</td><td>${x.io === 'o' ? fmt(x.a) : ''}</td></tr>`).join('');
  const dif = c.diff === 0 ? ln('الفرق:', 'مطابق', 'big') : ln(c.diff > 0 ? 'زيادة:' : 'عجز:', money(Math.abs(c.diff)), 'big');
  const boxB = H ? ks.filter(k => H.by && H.by[k] > 0).map(k => ln('سُلِّم من ' + CL_SHORT[k] + ':', money(H.by[k]))).join('') + ln('إجمالي المسلَّم للإدارة:', money(H.total), 'big') : ln('الأرصدة المتبقية (تبدأ منها الغد):', money(left), 'big');
  const sg = [['أمين الصندوق', c.cashier || c.by || ''], ...(H ? [['المستلم (الإدارة)', H.who]] : []), ['المدير المالي', (db.settings.vch || {}).fm || '']];
  return paper(letterhead(letterOf()) + `<div class="rt"><h3>محضر جرد وإقفال الخزينة</h3></div>` +
    `<div class="ibox"><span>اليوم: <b><bdi dir="ltr">${esc(c.date)}</bdi></b></span><span>وقت الجرد: <b><bdi dir="ltr">${esc(clTime(c.at))}</bdi></b></span>${c.cashier || c.by ? `<span>أمين الصندوق: <b>${esc(c.cashier || c.by)}</b></span>` : ''}${H ? `<span>المستلم: <b>${esc(H.who)}</b></span>` : ''}</div>` +
    `<table class="itbl lst"><colgroup><col style="width:26%"><col style="width:19%"><col style="width:18%"><col style="width:18%"><col style="width:19%"></colgroup><thead><tr><th>المكان</th><th>رصيد أول اليوم</th><th>داخل</th><th>خارج</th><th>المتوقع</th></tr></thead><tbody>${rows}</tbody></table>` +
    `<div class="isum"><div class="ic">${ln('المتوقع في الدرج (نقدي):', money(cash.e))}${ln('الفعلي في الدرج:', money(c.counted))}${dif}</div><div class="ic">${boxB}</div></div>` +
    (H ? `<p class="qnt">تم تسليم المبلغ للإدارة، وتبدأ كل الأماكن (الدرج وإنستا باي والمحفظة والحساب البنكي) من صفر في اليوم التالي.</p>` : '') + (c.note ? `<p class="qnt">${esc(c.note)}</p>` : '') +
    `<div class="sigs">${sg.map(([k, n]) => `<div><span>${k}</span>${n ? `<small>${esc(n)}</small>` : ''}</div>`).join('')}</div>` +
    (lines.length ? `<div class="rt" style="margin-top:22px"><h3>مرفق: تفاصيل عمليات اليوم</h3></div><table class="itbl lst"><colgroup><col style="width:13%"><col style="width:43%"><col style="width:16%"><col style="width:14%"><col style="width:14%"></colgroup><thead><tr><th>الوقت</th><th>البيان</th><th>المكان</th><th>داخل</th><th>خارج</th></tr></thead><tbody>${det}</tbody></table>` : ''), 'lstp');
}
const closeFile = c => 'جرد_الخزينة_' + c.date;
screens.cashClose = (p, v) => {
  const today = ymd(new Date()), S = db.settings, V = S.vch || {};
  v.innerHTML = subHead('جرد الخزينة والإقفال') + `<div class="stack">
    <section class="panel"><h2 class="panel-t">جرد وإقفال اليوم</h2>
      <p class="lbl" style="margin:0 0 14px">بيجمع كل حركة اليوم في الأماكن الأربعة (الدرج نقدي، إنستا باي، المحفظة، الحساب البنكي): الداخل من مبيعات وتحصيلات ورأس المال ودعم الإدارة وتحويلات، والخارج من مصروفات وموردين ومرتجعات وتحويلات وتسليم، وبيطلّع لك المبلغ اللي هتطلعه لإقفال الخزنة. الدرج بس هو اللي بتعدّه بإيدك، وباقي الأماكن بتتحسب من البرنامج.</p>
      <div class="form-grid">
        <div class="field"><label for="c-date">اليوم</label><input id="c-date" class="inp" type="date" value="${today}" max="${today}"></div>
        <div class="field" id="c-opw"><label for="c-open">رصيد أول اليوم في الدرج (جنيه)</label><input id="c-open" class="inp" inputmode="decimal" value="0" autocomplete="off"></div>
        <div class="field"><label for="c-cnt">النقدية الفعلية في الدرج (جنيه)</label><div class="c-cw"><input id="c-cnt" class="inp" inputmode="decimal" placeholder="0" autocomplete="off"><button class="btn ghost" id="c-same" type="button">نفس المتوقع</button></div></div>
        <div class="field"><label for="c-note">ملاحظة</label><input id="c-note" class="inp" maxlength="120" autocomplete="off"></div></div>
      <div class="tbl-wrap" style="margin-top:14px"><table class="grid"><colgroup><col style="width:24%"><col style="width:19%"><col style="width:19%"><col style="width:19%"><col style="width:19%"></colgroup>
        <thead><tr><th>المكان</th><th>رصيد أول اليوم</th><th>داخل</th><th>خارج</th><th>المتوقع</th></tr></thead><tbody id="c-pl"></tbody></table></div>
      <div class="stats" id="c-st" style="margin:16px 0"></div>
      <div class="c-out" id="c-out"></div>
      <div class="actions" style="margin:0 0 12px"><button class="btn ghost" id="c-tg" type="button">تفاصيل كل عمليات اليوم</button></div>
      <div id="c-ln" hidden><div class="tbl-wrap"><table class="grid"><colgroup><col style="width:14%"><col style="width:42%"><col style="width:16%"><col style="width:14%"><col style="width:14%"></colgroup><thead><tr><th>الوقت</th><th>البيان</th><th>المكان</th><th>داخل</th><th>خارج</th></tr></thead><tbody id="c-lines"></tbody></table></div></div>
      <div id="c-hw" style="margin-top:6px">
        <label class="chk"><input type="checkbox" id="c-hand" checked><i>${ICON.check}</i><span>تسليم المبلغ للإدارة وتصفير الخزنة (اليوم اللي بعده يبدأ من صفر)</span></label>
        <div class="form-grid" id="c-hf" style="margin:12px 0">
          <div class="field"><label for="c-who">المستلم (الإدارة / صاحب المنشأة)</label><input id="c-who" class="inp" maxlength="60" value="${esc(S.closeWho || '')}" autocomplete="off"></div>
          <div class="field"><label for="c-cashier">أمين الصندوق</label><input id="c-cashier" class="inp" maxlength="60" value="${esc(V.cashier || (CUR_USER ? CUR_USER.name : ''))}" autocomplete="off"></div></div></div>
      <label class="chk"><input type="checkbox" id="c-lock" checked><i>${ICON.check}</i><span>إقفال اليوم بعد الجرد (منع إلغاء أو تعديل فواتير هذا اليوم وما قبله)</span></label>
      <div class="actions" style="margin-top:16px"><button class="btn" id="c-pdf" type="button">${ICON.save}<span>حفظ الجرد وإصدار PDF</span></button><button class="btn outline" id="c-save" type="button"><span>حفظ الجرد فقط</span></button></div></section>
    <section class="panel"><h2 class="panel-t">الفترات المقفولة</h2><p class="lbl" style="margin:0 0 12px" id="c-lk"></p>
      <div class="actions"><div class="field" style="margin:0"><label for="c-ld">إقفال كل ما قبل وحتى</label><input id="c-ld" class="inp" type="date" max="${today}"></div><button class="btn outline" id="c-setlk" type="button">إقفال الفترة</button><button class="btn ghost" id="c-unlk" type="button">فتح الفترات</button></div></section>
    <section class="panel"><h2 class="panel-t">سجل الجرد</h2><div class="tbl-wrap"><table class="grid"><colgroup><col style="width:22%"><col style="width:18%"><col style="width:18%"><col style="width:16%"><col style="width:16%"><col style="width:10%"></colgroup><thead><tr><th>اليوم</th><th>المتوقع</th><th>الفعلي</th><th>الفرق</th><th>سُلِّم للإدارة</th><th>PDF</th></tr></thead><tbody id="c-rows"></tbody></table></div>
      ${docBar('close')}</section></div>`;
  ['c-open', 'c-cnt'].forEach(id => $('#' + id).addEventListener('input', e => { e.target.value = cleanNum(e.target.value); calc(); }));
  const day = () => $('#c-date').value || today;
  let B = null; /* B: the day's figures, worked out once per day and kept while the count is typed */
  const base = () => { const d = day(); if (!B || B.d !== d) { B = Object.assign({ d }, dayPlaces(d)); $('#c-opw').hidden = B.hasPv; $('#c-open').value = String(B.ks.cash.open); } return B; };
  const calc = () => {
    const b = base(), ks = {}; Object.keys(CIN_PM).forEach(k => { ks[k] = Object.assign({}, b.ks[k]); });
    if (!b.hasPv) { ks.cash.open = num($('#c-open').value); ks.cash.e = round2(ks.cash.open + ks.cash.i - ks.cash.o); } /* no earlier count: the opening of the drawer is the program's figure, and it can be corrected by hand */
    const cnt = $('#c-cnt').value === '' ? null : num($('#c-cnt').value), diff = cnt == null ? null : round2(cnt - ks.cash.e), isToday = b.d === today, take = {};
    Object.keys(CIN_PM).forEach(k => { take[k] = Math.max(k === 'cash' ? (cnt == null ? ks.cash.e : cnt) : ks[k].e, 0); }); /* what leaves: the drawer as counted, the other places as the program shows them (only a positive balance can be handed over) */
    const total = round2(Object.values(take).reduce((s, x) => s + x, 0)), sI = round2(Object.values(ks).reduce((s, x) => s + x.i, 0)), sO = round2(Object.values(ks).reduce((s, x) => s + x.o, 0)), sE = round2(Object.values(ks).reduce((s, x) => s + x.e, 0)), sP = round2(Object.values(ks).reduce((s, x) => s + x.open, 0));
    $('#c-pl').innerHTML = Object.keys(CIN_PM).map(k => `<tr><td><span class="pill info">${CIN_PM[k]}</span></td><td>${fmt(ks[k].open)}</td><td style="color:var(--green);font-weight:800">${ks[k].i ? fmt(ks[k].i) : ''}</td><td style="color:var(--red-t);font-weight:800">${ks[k].o ? fmt(ks[k].o) : ''}</td><td class="val">${fmt(ks[k].e)}</td></tr>`).join('') +
      `<tr class="c-tot"><td>الإجمالي</td><td>${fmt(sP)}</td><td style="color:var(--green)">${fmt(sI)}</td><td style="color:var(--red-t)">${fmt(sO)}</td><td class="val">${fmt(sE)}</td></tr>`;
    $('#c-st').innerHTML = `<div class="stat pos"><span>إجمالي الداخل (كل الأماكن)</span><b>${money(sI)}</b></div><div class="stat neg"><span>إجمالي الخارج (كل الأماكن)</span><b>${money(sO)}</b></div><div class="stat blue"><span>المتوقع في الدرج (نقدي)</span><b>${money(ks.cash.e)}</b></div>${diff == null ? '' : `<div class="stat ${diff === 0 ? 'pos' : 'neg'}"><span>${diff === 0 ? 'الدرج مطابق' : diff > 0 ? 'زيادة في الدرج' : 'عجز في الدرج'}</span><b>${money(Math.abs(diff))}</b></div>`}`;
    $('#c-out').innerHTML = `<small>${isToday ? 'المبلغ اللي هتطلعه لإقفال الخزنة' : 'إجمالي الأرصدة المتوقعة آخر اليوم'}</small><b class="cot">${money(total)}</b><div class="cps">${Object.keys(CIN_PM).map(k => `<span>${CIN_PM[k]}: <b>${fmt(take[k])}</b></span>`).join('')}</div>${isToday ? '<small>بعد التسليم بتبدأ كل الأماكن من صفر في اليوم التالي.</small>' : '<small>التسليم للإدارة متاح لجرد اليوم الحالي فقط.</small>'}`;
    const hw = $('#c-hand'); hw.disabled = !isToday; if (!isToday) hw.checked = false; $('#c-hf').hidden = !hw.checked;
    $('#c-lines').innerHTML = dayLines(b.L).map(x => `<tr><td class="muted">${clTime(x.d)}</td><td>${esc(x.w)}</td><td><span class="pill info">${CL_SHORT[x.k]}</span></td><td style="color:var(--green);font-weight:800">${x.io === 'i' ? fmt(x.a) : ''}</td><td style="color:var(--red-t);font-weight:800">${x.io === 'o' ? fmt(x.a) : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">لا توجد عمليات في هذا اليوم.</td></tr>';
    return { d: b.d, ks, cnt, diff, take, total, isToday, inn: round2(b.M.inn.cash), cin: round2(b.M.cin.cash), xin: round2(b.M.xin.cash), xout: round2(b.M.xout.cash), mg: round2(b.M.mg.cash), out: round2(b.M.out.cash), tip: round2(b.M.tip.cash), opening: ks.cash.open, expected: ks.cash.e, innX: b.innX };
  };
  const draw = () => {
    $('#c-lk').textContent = lockDate() ? `الفترات المقفولة حتى ${lockDate()}` : 'لا توجد فترات مقفولة.';
    $('#c-rows').innerHTML = db.closings.slice().sort((a, b) => b.date.localeCompare(a.date)).map(c => `<tr><td><bdi dir="ltr">${esc(c.date)}</bdi>${c.note ? `<small class="muted" style="display:block">${esc(c.note)}</small>` : ''}</td><td>${fmt(c.expected)}</td><td class="val">${fmt(c.counted)}</td><td><span class="pill ${c.diff === 0 ? 'ok' : 'bad'}">${c.diff === 0 ? 'مطابق' : (c.diff > 0 ? '+' : '−') + ' ' + fmt(Math.abs(c.diff))}</span></td><td>${c.hand ? fmt(c.hand.total) : '—'}</td><td>${window.claude ? '' : `<button class="mini" data-cpdf="${esc(c.id)}" type="button">PDF</button>`}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">لا يوجد جرد مسجّل.</td></tr>';
    $$('[data-cpdf]', v).forEach(b => b.onclick = async () => { const c = db.closings.find(x => x.id === b.dataset.cpdf); if (c) await pdfSave(closePaper(c), 'جرد الخزينة', c.date); });
  };
  $('#c-date').addEventListener('change', () => { B = null; calc(); });
  $('#c-same').onclick = () => { $('#c-cnt').value = String(calc().expected); calc(); };
  $('#c-hand').addEventListener('change', calc);
  $('#c-tg').onclick = () => { const e = $('#c-ln'); e.hidden = !e.hidden; };
  /* the count: the drawer as counted, the other places as the program shows them; with the handover ticked, everything is handed to the management and every place is left at zero for the next day */
  const doSave = async withPdf => {
    const r = calc(), b = B; if (r.cnt == null) return toast('اكتب النقدية الفعلية (أو اضغط «نفس المتوقع»)');
    if (r.d > today) return toast('لا يمكن جرد يوم في المستقبل');
    if (isLocked(r.d) && !db.closings.some(c => c.date === r.d)) return toast('هذا اليوم في فترة مقفولة');
    const hand = $('#c-hand').checked && r.isToday && r.total > 0, who = $('#c-who').value.trim(), cashier = $('#c-cashier').value.trim();
    if (hand && !who) return toast('اكتب اسم المستلم');
    if (hand && !(await confirmBox('تسليم المبلغ للإدارة', `سيُسلَّم ${money(r.total)} للإدارة (${Object.keys(CIN_PM).filter(k => r.take[k] > 0).map(k => CIN_PM[k] + ' ' + money(r.take[k])).join('، ')}) وتبقى كل الأماكن صفر في اليوم التالي. تكمل؟`, 'تسليم وحفظ', false))) return;
    if (!await requireAdmin('اكتب الرقم السري للمسؤول لحفظ الجرد')) return;
    const old = db.closings.find(c => c.date === r.d), at = new Date().toISOString(), places = {}, cat = {};
    Object.keys(CIN_PM).forEach(k => { const x = r.ks[k]; places[k] = { open: x.open, i: x.i, o: x.o, e: x.e }; });
    Object.keys(CL_SEC).forEach(s => { const a = round2(Object.values(b.M[s]).reduce((q, z) => q + z, 0)); if (a) cat[s] = a; });
    const rec = { id: uid(), date: r.d, opening: r.opening, inn: r.inn, ...(r.cin ? { cin: r.cin } : {}), ...(r.xin ? { xin: r.xin } : {}), ...(r.xout ? { xout: r.xout } : {}), ...(r.mg ? { mg: r.mg } : {}), ...(r.innX ? { innX: r.innX } : {}), out: r.out, tip: r.tip, expected: r.expected, counted: r.cnt, diff: r.diff, note: $('#c-note').value.trim(), at, by: CUR_USER ? CUR_USER.name : '', cashier, places, cat };
    if (old && old.hand) rec.hand = old.hand; /* a count made again after the handover keeps the handover it follows */
    db.closings = db.closings.filter(c => c.date !== r.d); db.closings.push(rec);
    if ($('#c-lock').checked && r.d > lockDate()) db.settings.lockDate = r.d;
    if (hand) { /* every place with a positive balance goes to the management (the drawer holds what was counted): one line per place, dated just after the count, so the drawer's next opening is zero */
      const bal = placeBal(), grp = uid(), stamp = new Date(Math.max(Date.now(), +new Date(at) + 1)).toISOString(), by = {}; let tot = 0;
      Object.keys(CIN_PM).forEach(k => { if (bal[k] > 0.004) { by[k] = bal[k]; tot = round2(tot + bal[k]); db.pmoves.push({ id: uid(), date: stamp, from: k, to: 'mgmt', amount: bal[k], who, note: 'جرد وإقفال يوم ' + r.d, grp, by: CUR_USER ? CUR_USER.name : '' }); } });
      if (tot > 0) { rec.hand = { who, total: round2((old && old.hand ? old.hand.total : 0) + tot), by, grp }; logA('pm_settle', MG_TO, money(tot), who, 'جرد وإقفال يوم ' + r.d); }
      db.settings.closeWho = who;
    }
    if (cashier) db.settings.vch = Object.assign({}, db.settings.vch, { cashier });
    logA('close', `جرد يوم ${r.d}`, r.diff === 0 ? 'مطابق' : r.diff > 0 ? 'زيادة' : 'عجز', r.diff === 0 ? '' : money(Math.abs(r.diff))); save(); autoBackup(true);
    $('#c-cnt').value = ''; $('#c-note').value = ''; B = null; calc(); draw(); toast(rec.hand && hand ? 'تم حفظ الجرد وتسليم المبلغ للإدارة' : 'تم حفظ الجرد', 'ok');
    if (withPdf) await pdfSave(closePaper(rec), 'جرد الخزينة', rec.date);
  };
  $('#c-save').onclick = () => doSave(false);
  $('#c-pdf').onclick = () => doSave(true);
  $('#c-setlk').onclick = async () => {
    const d = $('#c-ld').value; if (!d) return toast('اختر تاريخ الإقفال'); if (d > today) return toast('لا يمكن إقفال تاريخ في المستقبل'); if (d <= lockDate()) return toast('هذه الفترة مقفولة بالفعل');
    if (!await requireAdmin('اكتب الرقم السري للمسؤول لإقفال الفترة')) return;
    db.settings.lockDate = d; logA('close', `إقفال الفترات حتى ${d}`); save(); draw(); toast('تم إقفال الفترة', 'ok');
  };
  $('#c-unlk').onclick = async () => {
    if (!lockDate()) return toast('لا توجد فترات مقفولة');
    if (!await confirmBox('', 'سيُسمح بإلغاء وتعديل فواتير الفترات المقفولة. هل تريد المتابعة؟', 'فتح')) return;
    if (!await requireAdmin('اكتب الرقم السري للمسؤول لفتح الفترات')) return;
    logA('unlock', `فتح الفترات المقفولة حتى ${lockDate()}`); db.settings.lockDate = ''; save(); draw(); toast('تم فتح الفترات', 'ok');
  };
  calc(); draw();
};

/* ===== audit log ===== */
const trParts = s => LANG === 'en' ? String(s).split(' — ').map(trText).join(' — ') : s; /* the saved text is Arabic; each piece is translated when shown */
let gateOk = false; /* set for the one render that follows a correct PIN (render() would lock the screen again) */
const gated = (v, title, why, fn) => { /* the admin PIN opens the screen */
  if (adminOpen() || gateOk) return fn();
  v.innerHTML = subHead(title) + `<section class="panel"><p class="lbl" style="margin:0 0 14px">${esc(why)}</p><div class="actions"><button class="btn" id="g-open" type="button">إدخال الرقم السري</button></div></section>`;
  $('#g-open').onclick = async () => { if (await requireAdmin(why)) { gateOk = true; try { render(); } finally { gateOk = false; } } };
};
/* What a line of the log points to. It is read from the line's own text (a document number or a name), so the old lines work as well as the new ones, and it only finds what still exists. */
function audTargets(e) {
  const x = String(e.x || ''), P = x.split(' — '), out = [];
  const add = (l, to, p) => { if (!out.some(o => o.to === to && JSON.stringify(o.p) === JSON.stringify(p || {}))) out.push({ l, to, p: p || {} }); };
  const nos = re => { const o = []; x.replace(re, (m, n) => { if (o.indexOf(n) < 0) o.push(n); return m; }); return o; };
  const addInv = (n, kind) => { const i = db.invoices.find(r => r.no === n); if (i) add((kind === 'new' ? `الفاتورة الجديدة ${n}` : kind === 'old' ? `الفاتورة القديمة ${n}` : `فاتورة ${n}`) + (i.status === 'void' ? ' (ملغاة)' : ''), 'invDetail', { id: i.id }); };
  const del = /_del$/.test(e.a) && e.a !== 'sup_goods_del'; /* something that was deleted is gone: a name could now belong to another one */
  const by = (list, n) => !del && n ? list.find(r => r.name === n) : null;
  if (e.a === 'inv_edit' && /←/.test(x)) { const n = nos(/فاتورة\s+(\d+)/g); if (n.length > 1) { addInv(n[1], 'new'); addInv(n[0], 'old'); } }
  if (e.a === 'pay_in') { const c = by(db.customers, P[0]); if (c) add(`كشف حساب العميل ${c.name}`, 'custDetail', { id: c.id }); (P[2] || '').split(/\s+/).filter(Boolean).forEach(n => addInv(n)); }
  else nos(/فاتورة\s+(\d+)/g).forEach(n => addInv(n));
  nos(/عرض سعر\s+(\d+)/g).forEach(n => { const q = db.quotes.find(r => r.no === n); if (q) add(`عرض سعر ${n}`, 'quoteDetail', { id: q.id }); });
  nos(/إيصال استلام نقدية\s+(\d+)/g).forEach(n => { const r = db.vouchers.find(z => z.kind === 'in' && z.no === n); if (r) add(`إيصال استلام نقدية ${n}`, 'vchDetail', { id: r.id }); });
  nos(/إيصال استلام نقدية من المكتب\s+(\d+)/g).forEach(n => { const r = db.vouchers.find(z => z.kind === 'out' && z.no === n); if (r) add(`إيصال استلام نقدية من المكتب ${n}`, 'vchDetail', { id: r.id }); });
  nos(/مرتجع\s+(\d+)/g).forEach(n => { const r = db.returns.find(z => z.no === n); if (r) add(`مرتجع ${n}`, 'retDetail', { id: r.id }); });
  if (/^(cust_add|cust_edit|cust_place|cust_xfer)$/.test(e.a)) { const c = by(db.customers, P[0]); if (c) add(`كشف حساب العميل ${c.name}`, 'custDetail', { id: c.id }); }
  if (/^(pay_out|sup_add|sup_edit|sup_goods|sup_goods_edit|sup_goods_del)$/.test(e.a)) { const s = by(db.suppliers, P[0]); if (s) add(`كشف حساب المورد ${s.name}`, 'supDetail', { id: s.id }); }
  if (/^(item_add|item_price|item_min|item_cost|item_home|stock_add|dmg|dmg_undo|xfer)$/.test(e.a)) { const it = by(db.items, P[0]); if (it) add(`كارت الصنف ${it.name}`, 'itemCard', { id: it.id }); }
  if (/^(emp_add|emp_edit|sal_pay|sal_unpay|att_save|adv_add)$/.test(e.a)) { const m = by(db.emps, P[0]); if (m) add(`كشف الموظف ${m.name}`, 'empSheet', Object.assign({ id: m.id }, /^\d{4}-\d{2}$/.test(P[1] || '') && e.a !== 'adv_add' ? { ym: P[1] } : {})); }
  if (/^(dl_add|dl_edit)$/.test(e.a)) { const inv = nos(/فاتورة\s+(\d+)/g)[0], d = db.deliveries.find(r => r.name === P[0] && (!inv || r.invNo === inv)); if (d) add(`توصيل ${d.name}`, 'delivDetail', { id: d.id }); }
  if (/^chq_/.test(e.a) && db.cheques.length) add('الشيكات', 'cheques');
  if (e.a === 'exp_add') add('المصروفات', 'expLog');
  if (e.a === 'cin_add' || /^pm_/.test(e.a)) add('داخل من الدرج / الخزينة / رأس المال', 'cashIn');
  if (/^(bk_add|bk_ref)$/.test(e.a) && db.bookings.length) add('الحجوزات', 'bookings');
  if (e.a === 'rem_save') add('المنبّهات', 'reminders');
  if (e.a === 'close' || e.a === 'unlock') add('الجرد والإقفال', 'cashClose');
  if (e.a === 'count') add('جرد المخزن', 'stockCount');
  return out;
}
let audKeep = null; /* the filter of the log, kept while one of its lines is open, so Back returns to the same list */
screens.auditLog = (p, v) => gated(v, 'سجل التعديلات', 'هذا السجل يُعرض بالرقم السري للمسؤول', () => {
  v.innerHTML = subHead('سجل التعديلات') + `<section class="panel"><div class="form-grid">
    <div class="field"><label for="a-act">النوع</label><div class="sel"><select id="a-act"><option value="">الكل</option>${Object.entries(AUD).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></div></div>
    <div class="field"><label for="a-q">بحث</label><input id="a-q" class="inp" autocomplete="off"></div></div>
    <p class="lbl" style="margin:10px 0">اضغط على أي عملية لفتح الفاتورة أو المستند الخاص بها.</p>
    <div class="tbl-wrap"><table class="grid"><colgroup><col style="width:22%"><col style="width:16%"><col style="width:16%"><col style="width:46%"></colgroup><thead><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>التفاصيل</th></tr></thead><tbody id="a-rows"></tbody></table></div>
    <p class="lbl" id="a-more" style="margin:12px 0 0" hidden></p>${docBar('audit')}</section>`;
  let tg = [];
  const draw = () => {
    const a = $('#a-act').value, q = $('#a-q').value.trim(), list = db.audit.slice().reverse().filter(e => (!a || e.a === a) && (!q || e.x.includes(q) || (e.u || '').includes(q)));
    tg = list.slice(0, 300).map(audTargets);
    $('#a-rows').innerHTML = list.slice(0, 300).map((e, i) => { const t = tg[i]; return `<tr${t.length ? ` class="aud-go" data-act="aud" data-i="${i}" role="button" tabindex="0"` : ''}><td class="muted">${dateTimeAr(e.t)}</td><td>${esc(e.u || '—')}${e.ap ? `<br><small class="muted">بموافقة ${esc(e.ap)}</small>` : ''}</td><td><span class="pill info">${esc(AUD[e.a] || e.a)}</span></td><td>${esc(trParts(e.x))}${t.length ? `<span class="aud-hint">${t.length === 1 ? `فتح ${esc(t[0].l)}` : 'اضغط للفتح'}</span>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="4" class="empty">لا توجد عمليات مسجلة.</td></tr>';
    const m = $('#a-more'); m.hidden = list.length <= 300; m.textContent = `يظهر آخر 300 من ${list.length} عملية. صدّر الملف لرؤية الكل.`;
  };
  const open = ts => {
    const go1 = t => { audKeep = { a: $('#a-act').value, q: $('#a-q').value }; go(t.to, t.p); };
    if (ts.length === 1) return go1(ts[0]);
    modal(`<h3>اختر ما تريد فتحه</h3><div class="stack">${ts.map((t, k) => `<button class="btn outline" type="button" data-k="${k}">${esc(t.l)}</button>`).join('')}</div><div class="actions"><button class="btn ghost" type="button" data-no>إغلاق</button></div>`, (d, close) => {
      $$('[data-k]', d).forEach(b => b.onclick = () => { close(); go1(ts[+b.dataset.k]); }); $('[data-no]', d).onclick = close;
    });
  };
  const pick = ev => { const tr = ev.target.closest('tr[data-i]'); if (tr && tg[+tr.dataset.i]) open(tg[+tr.dataset.i]); };
  $('#a-rows').addEventListener('click', pick);
  $('#a-rows').addEventListener('keydown', ev => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('tr[data-i]')) { ev.preventDefault(); pick(ev); } });
  $('#a-act').addEventListener('change', draw); $('#a-q').addEventListener('input', draw);
  const k = audKeep; audKeep = null; if (k) { $('#a-act').value = k.a; $('#a-q').value = k.q; }
  draw();
});

/* ===== tax switch (off by default) ===== */
screens.setTax = (p, v) => {
  const S = db.settings;
  v.innerHTML = setHead() + `<section class="panel"><h2 class="panel-t">الضرائب</h2>
    <p class="lbl" style="margin:0 0 14px;line-height:1.9">فعّل هذا الخيار وقت الحاجة. عند التفعيل يظهر: خيار القيمة المضافة في الفاتورة، والرقم الضريبي والسجل التجاري في ترويسة الفواتير والتقارير، وأقسام القيمة المضافة في التقارير، وتقرير القيمة المضافة. عند الإيقاف تختفي كلها وتبقى بياناتك كما هي.</p>
    <label class="chk"><input type="checkbox" id="t-on"${S.taxOn ? ' checked' : ''}><i>${ICON.check}</i><span>تفعيل الضرائب</span></label>
    <div id="t-box" class="form-grid" style="margin-top:16px"${S.taxOn ? '' : ' hidden'}>
      <div class="field"><label for="t-vat">نسبة القيمة المضافة (%)</label><input id="t-vat" class="inp" inputmode="decimal" value="${S.vat}" autocomplete="off"></div>
      <div class="field"><label for="t-no">الرقم الضريبي</label><input id="t-no" class="inp" inputmode="numeric" value="${esc(S.taxNo)}" maxlength="30" autocomplete="off"></div>
      <div class="field"><label for="t-cr">السجل التجاري</label><input id="t-cr" class="inp" inputmode="numeric" value="${esc(S.crNo)}" maxlength="30" autocomplete="off"></div></div>
    <div class="actions" style="margin-top:18px"><button class="btn" id="t-save" type="button">${ICON.save}<span>حفظ</span></button></div></section>`;
  $('#t-on').onchange = () => { $('#t-box').hidden = !$('#t-on').checked; };
  $('#t-save').onclick = async () => {
    const on = $('#t-on').checked, vat = num($('#t-vat').value);
    if (on && (vat < 0 || vat > 100)) return toast('نسبة القيمة المضافة بين 0 و 100');
    if (!await requireAdmin()) return;
    S.taxOn = on; if (on) { S.vat = vat; S.taxNo = toLat($('#t-no').value).trim(); S.crNo = toLat($('#t-cr').value).trim(); }
    logA('set', on ? 'تفعيل الضرائب' : 'إيقاف الضرائب'); save(); back(); toast(on ? 'تم تفعيل الضرائب' : 'تم إيقاف الضرائب', 'ok');
  };
};
/* VAT report: the invoices that carry VAT, less the VAT of returns */
function vatData(from, to) {
  const inR = d => { const k = ymd(d); return k >= from && k <= to; }, rows = [];
  liveInvoices().filter(i => i.vatOn && inR(i.date)).forEach(i => rows.push({ d: i.date, no: i.no, w: i.name, base: round2(i.subtotal - i.discAmt), vat: i.vatAmt }));
  db.returns.filter(r => r.vatAmt && inR(r.date)).forEach(r => rows.push({ d: r.date, no: r.no, w: 'مرتجع: ' + r.name, base: -round2(r.subtotal - r.discAmt), vat: -r.vatAmt }));
  rows.sort((a, b) => a.d.localeCompare(b.d)); return rows;
}
function vatPaper(from, to) {
  const rows = vatData(from, to), base = round2(rows.reduce((s, x) => s + x.base, 0)), vat = round2(rows.reduce((s, x) => s + x.vat, 0));
  return paper(repHeader('A', 'تقرير القيمة المضافة', from, to) + `<section class="rsec"><table class="rtbl"><thead><tr><th>التاريخ</th><th>الرقم</th><th>البيان</th><th>قبل الضريبة</th><th>القيمة المضافة</th></tr></thead><tbody>${rows.map(x => `<tr><td><bdi dir="ltr">${ymd(x.d)}</bdi></td><td>${esc(x.no)}</td><td>${esc(x.w)}</td><td class="amt"><bdi>${fmt(x.base)}</bdi></td><td class="amt"><bdi>${fmt(x.vat)}</bdi></td></tr>`).join('') || '<tr><td colspan="5">لا توجد فواتير بقيمة مضافة في هذه الفترة.</td></tr>'}</tbody>
    <tfoot><tr><td colspan="3" class="tl">الإجمالي (الصافي بعد المرتجعات)</td><td class="tv">${fmt(base)} جنيه</td><td class="tv">${fmt(vat)} جنيه</td></tr></tfoot></table></section>`);
}
screens.repVat = (p, v) => repScreen(v, { title: 'تقرير القيمة المضافة', make: vatPaper, csv: (a, b) => ({ name: 'تقرير_القيمة_المضافة_' + a + '_' + b, head: ['التاريخ', 'الرقم', 'البيان', 'قبل الضريبة', 'القيمة المضافة'], rows: vatData(a, b).map(x => [ymd(x.d), x.no, x.w, x.base, x.vat]), sum: [3, 4] }), file: (a, b) => `القيمة_المضافة_${a}_الى_${b}` });

/* ===== Excel (CSV) export hub ===== */
const custNet = cid => round2(customerDebt(cid) - db.bookings.filter(b => b.customerId === cid).reduce((s, b) => s + bkOpen(b), 0)); /* what he owes (+) or what we owe him (−): his open invoices less the deposits he still holds with us — the same balance his statement ends on */
const fj = v => ({ v: round2(v), unit: 'جنيه' }); /* a money cell with its unit (the summary boxes of the reports) */
const EXPORTS = {
  inv: q => { const m = settledMap(), t = toLat(String(q || '').trim()), list = db.invoices.filter(r => !t || r.no.includes(t) || r.name.includes(t) || (r.place || '').includes(t)), live = list.filter(i => i.status !== 'void'); return { name: 'الفواتير', head: ['الرقم', 'التاريخ', 'العميل', 'المكان', 'الموبايل', 'النوع', 'الحالة', 'الإجمالي', 'الخصم', 'القيمة المضافة', 'الصافي', 'المدفوع عند الإصدار', 'تحصيلات لاحقة', 'مرتجعات', 'المتبقي', 'نقل'],
    rows: list.map(i => [i.no, ymd(i.date), i.name, placeOf(i), i.phone || '', i.kind === 'cash' ? 'نقدي' : 'آجل', i.status === 'void' ? 'ملغاة' : 'سارية', i.subtotal, i.discAmt, i.vatAmt, i.net, i.paid, m[i.id] || 0, invRetNet(i), i.status === 'void' ? 0 : invLeft(i, m), i.transport || 0]),
    info: [['تاريخ التقرير', ymd(new Date())], ['عدد الفواتير', list.length], ...(t ? [['بحث', t]] : [])],
    foot: [[['عدد الفواتير السارية', live.length], ['عدد الفواتير الملغاة', list.length - live.length]], [['إجمالي المبيعات (الصافي)', fj(live.reduce((a, i) => a + i.net, 0))], ['إجمالي المتبقي على العملاء', fj(live.reduce((a, i) => a + invLeft(i, m), 0))]]] }; },
  invLines: () => ({ name: 'أصناف_الفواتير', head: ['الفاتورة', 'التاريخ', 'العميل', 'الصنف', 'الوحدة', 'الكمية', 'السعر', 'الإجمالي', 'التكلفة', 'الكمية المرتجعة'], rows: db.invoices.filter(i => i.status !== 'void').flatMap(i => retLines(i).map(x => [i.no, ymd(i.date), i.name, x.l.name, x.l.unit, x.l.qty, x.l.price, x.l.total, x.l.cost || 0, x.done])) }),
  cust: q => { /* names under each other, who owes («عليه») and who has credit («له»), with the totals */
    q = String(q || '').trim(); const list = db.customers.filter(c => !q || c.name.includes(q) || (c.phone || '').includes(toLat(q)) || (c.code || '').includes(cleanCode(q))).slice().sort((a, b) => a.name.localeCompare(b.name, LANG === 'en' ? 'en' : 'ar'));
    const ds = list.map(c => custNet(c.id)), up = ds.filter(d => d > 0), dn = ds.filter(d => d < 0);
    return { name: 'العملاء', head: ['الاسم', 'الكود', 'الموبايل', 'العنوان', 'إجمالي المشتريات', 'عليه (مدين)', 'له (دائن)'],
      rows: list.map((c, i) => [c.name, c.code || '', c.phone || '', c.address || '', customerTotal(c.id), ds[i] > 0 ? ds[i] : '', ds[i] < 0 ? -ds[i] : '']), sum: [4, 5, 6],
      info: [['تاريخ التقرير', ymd(new Date())], ['عدد العملاء', list.length], ...(q ? [['بحث', q]] : [])],
      foot: [[['عملاء عليهم فلوس', up.length], ['إجمالي المديونية (عليهم)', fj(up.reduce((a, d) => a + d, 0))]], [['عملاء لهم فلوس', dn.length], ['إجمالي رصيد العملاء (لهم)', fj(-dn.reduce((a, d) => a + d, 0))]]] };
  },
  stmt: id => custSheet(db.customers.find(x => x.id === id) || { id: '', name: '' }),
  supp: q => { q = String(q || '').trim(); const list = db.suppliers.filter(x => !q || x.name.includes(q) || (x.code || '').includes(cleanCode(q))), owed = list.reduce((a, s) => a + Math.max(supBal(s.id), 0), 0);
    return { name: 'الموردين', head: ['المورد', 'الكود', 'الموبايل', 'المشتريات', 'المدفوع', 'المتبقي له'], rows: list.map(s => [s.name, s.code || '', s.phone || '', supBought(s.id), supPaid(s.id), supBal(s.id)]),
      info: [['تاريخ التقرير', ymd(new Date())], ['عدد الموردين', list.length], ...(q ? [['بحث', q]] : [])], foot: [[['إجمالي المتبقي للموردين', fj(owed)]]] }; },
  suppGoods: sid => { const L = db.spurch.filter(x => !sid || x.supplierId === sid); return { name: 'بضاعة_الموردين', head: ['التاريخ', 'المورد', 'الصنف', 'الوحدة', 'الكمية', 'سعر الشراء', 'الإجمالي', 'رقم فاتورة المورد', 'ملاحظة'], rows: L.map(x => [ymd(x.date), (supById(x.supplierId) || {}).name || '', x.name, x.unit || '', x.qty, x.cost, x.total, x.ref || '', x.note || ''])  }; },
  stock: () => { /* the balances of every item; the purchase price and the stock value only for whoever works the stock */
    const cs = can('stock'), low = i => i.min > 0 && i.qty <= i.min, nLow = db.items.filter(low).length;
    const mk = db.items.some(i => itemMakers(i).length);
    return { name: 'المخزن', head: ['الصنف', ...(mk ? ['المصنع'] : []), 'الوحدة', 'الكمية', ...(cs ? ['سعر الشراء'] : []), 'سعر البيع', ...(cs ? ['قيمة المخزون'] : []), 'الحالة'],
      rows: db.items.map(i => [i.name, ...(mk ? [itemMakers(i).join(' - ')] : []), i.unit, i.qty, ...(cs ? [i.cost] : []), i.price, ...(cs ? [round2(i.qty * i.cost)] : []), low(i) ? 'تحت الحد' : '']), sum: cs ? [5 + (mk ? 1 : 0)] : [],
      info: [['تاريخ التقرير', ymd(new Date())], ['عدد الأصناف', db.items.length]],
      foot: [[['عدد الأصناف', db.items.length], ['أصناف تحت الحد', nLow]], [...(cs ? [['قيمة المخزون (بسعر الشراء)', fj(stockValue())]] : []), ['قيمة المخزون (بسعر البيع)', fj(db.items.reduce((a, i) => a + i.qty * i.price, 0))]]] };
  },
  exp: () => ({ name: 'المصروفات', head: ['التاريخ', 'البند', 'النوع', 'المبلغ', 'ملاحظة', 'يُدفع من'], rows: db.expenses.map(e => [ymd(e.date), e.title, CATS[e.cat] || CATS.misc, e.amount, e.note || '', CIN_PM[pmKey(e.pm)]]) }),
  cin: () => ({ name: 'داخل_للدرج', head: ['التاريخ', 'المصدر', 'المبلغ', 'ملاحظة', 'دخل في'], rows: db.cashin.map(x => [ymd(x.date), CIN[x.src] || CIN.drawer, x.amount, x.note || '', CIN_PM[pmKey(x.pm)]]) }),
  pmv: () => ({ name: 'سحب_وتحويل', head: ['التاريخ', 'من', 'إلى', 'المبلغ', 'المستلم', 'ملاحظة'], rows: db.pmoves.map(x => [ymd(x.date), pmFrom(x), pmTo(x), x.amount, x.who || '', x.note || '']) }),
  plc: arg => { /* the day-by-day statement of the four places; arg = «from|to» (empty = every day) */
    const [f, t] = String(arg || '').split('|'), R = placeDays().filter(r => (!f || r.d >= f) && (!t || r.d <= t)), bal = placeBal(), tot = round2(Object.values(bal).reduce((s, x) => s + x, 0));
    return { name: 'كشف_أرصدة_الأماكن', head: ['التاريخ', 'المكان', 'رصيد أول اليوم', 'داخل', 'خارج', 'فرق الجرد', 'رصيد آخر اليوم'], noFilter: true, rows: R.map(r => [r.d, CIN_PM[r.k], r.open, r.i || '', r.o || '', r.adj || '', r.close]),
      info: [['من تاريخ', f || 'أول حركة'], ['إلى تاريخ', t || ymd(new Date())], ['تاريخ التقرير', ymd(new Date())]],
      foot: [[[CIN_PM.cash, fj(bal.cash)], [CIN_PM.insta, fj(bal.insta)]], [[CIN_PM.wallet, fj(bal.wallet)], [CIN_PM.bank, fj(bal.bank)]], [['إجمالي الأرصدة الآن', fj(tot)]]] };
  },
  pay: () => ({ name: 'التحصيلات', head: ['التاريخ', 'العميل', 'المبلغ', 'الفواتير'], rows: db.payments.map(x => [ymd(x.date), custName(x.customerId), x.amount, (x.alloc || []).map(a => a.no).join(' ')]) }),
  ret: () => ({ name: 'المرتجعات', head: ['الرقم', 'التاريخ', 'العميل', 'الفاتورة', 'القيمة', 'خُصم من المتبقي', 'رُدَّ نقداً', 'السبب'], rows: db.returns.map(r => [r.no, ymd(r.date), r.name, r.invNo, r.net, r.credit, r.refund, r.reason || '']) }),
  bk: () => ({ name: 'الحجوزات', head: ['التاريخ', 'العميل', 'المكان', 'البيان', 'العربون', 'المستخدم', 'المردود', 'المتبقي'], rows: db.bookings.map(b => [ymd(b.date), b.name, placeOf(b), b.desc, b.amount, bkUsed(b), bkRef(b), bkOpen(b)]) }),
  close: () => ({ name: 'جرد_الخزينة', head: ['اليوم', 'رصيد أول اليوم', 'داخل', 'خارج', 'المتوقع', 'الفعلي', 'الفرق', 'ملاحظة', 'إجمالي الأرصدة المتوقعة (كل الأماكن)', 'سُلِّم للإدارة', 'المستلم'], rows: db.closings.map(c => [c.date, c.opening, round2(c.inn + (c.cin || 0) + (c.xin || 0)), round2(c.out + c.tip + (c.xout || 0) + (c.mg || 0)), c.expected, c.counted, c.diff, c.note || '', round2(Object.values(clPlaces(c)).reduce((q, x) => q + x.e, 0)), c.hand ? c.hand.total : '', c.hand ? c.hand.who : '']) }),
  audit: () => ({ name: 'سجل_التعديلات', head: ['الوقت', 'المستخدم', 'العملية', 'التفاصيل', 'بموافقة'], rows: db.audit.map(e => [e.t.replace('T', ' ').slice(0, 19), e.u || '', AUD[e.a] || e.a, e.x, e.ap || '']) }),
};
/* the columns that get a total row in the Excel file (a list the user can filter: the total follows the filter) */
const EXP_SUM = { invLines: [7], cust: [4, 5, 6], supp: [3, 4, 5], suppGoods: [6], stock: [5], exp: [3], cin: [2], pmv: [3], pay: [2], ret: [4, 5, 6], bk: [4, 5, 6, 7], close: [2, 3, 6], shop: [6], counts: [8], damages: [6], deliveries: [7] };
const EXP_LIST = [['inv', 'الفواتير'], ['invLines', 'أصناف الفواتير'], ['cust', 'العملاء وأرصدتهم'], ['supp', 'الموردين وأرصدتهم'], ['suppGoods', 'بضاعة الموردين (يدوي)'], ['stock', 'المخزن'], ['exp', 'المصروفات'], ['cin', CIN_T], ['pmv', 'سحب وتحويل وتسليم للإدارة'], ['plc', 'كشف أرصدة الأماكن اليومي'], ['pay', 'التحصيلات'], ['ret', 'المرتجعات'], ['bk', 'الحجوزات'], ['close', 'جرد الخزينة'], ['audit', 'سجل التعديلات']];
screens.setExport = (p, v) => {
  v.innerHTML = setHead() + `<section class="panel"><h2 class="panel-t">تصدير إلى Excel</h2><p class="lbl" style="margin:0 0 14px">اختر ما تريد تصديره. يُحمَّل ملف يفتحه Excel مباشرة (أرقام وتواريخ جاهزة للفرز والجمع).</p>
    <div class="wipe">${EXP_LIST.map(([k, t]) => `<div class="wipe-row"><span>${t}</span><button class="btn ghost sm" data-exp="${k}" type="button">تصدير</button></div>`).join('')}</div></section>`;
};
