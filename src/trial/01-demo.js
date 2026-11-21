/* ---------- Trial build: made-up sample data (invented names, never real customers) ---------- */
function seedDemo() {
  const now = Date.now(), day0 = new Date(); day0.setHours(0, 0, 0, 0);
  /* a moment on day (today - daysAgo) at the given hour; today's moments never lie in the future */
  const at = (daysAgo, hour) => {
    const t = day0.getTime() - daysAgo * 864e5 + hour * 36e5;
    return new Date(daysAgo ? t : Math.max(day0.getTime() + 6e4, Math.min(t, now - 6e4))).toISOString();
  };
  const I = {
    fe: { name: 'حديد', unit: 'طن', cost: 36000, price: 38500, base: 60 },
    ce: { name: 'أسمنت', unit: 'طن', cost: 3200, price: 3500, base: 150 },
    sa: { name: 'رمل', unit: 'م³', cost: 180, price: 220, base: 300 },
    gr: { name: 'زلط', unit: 'م³', cost: 300, price: 360, base: 200 },
    br: { name: 'طوب أحمر', unit: 'ألف', cost: 2500, price: 2800, base: 40 },
  };
  Object.values(I).forEach(i => { i.id = uid(); i.sold = 0; });
  const C = [
    { id: uid(), name: 'شركة النهضة للمقاولات (تجريبي)', phone: '01000000001', address: 'المنطقة الصناعية' },
    { id: uid(), name: 'مؤسسة الأمل للإنشاءات (تجريبي)', phone: '01000000002', address: 'الحي الأول' },
    { id: uid(), name: 'مقاول الحي (تجريبي)', phone: '01000000003', address: 'شارع السوق' },
  ];
  C[0].limit = 50000; C[1].prices = { [I.ce.id]: 3400 }; /* a credit limit and a special price, to show both in the demo */
  const S = [{ id: uid(), name: 'مورد الحديد (تجريبي)', phone: '01000000011' }, { id: uid(), name: 'مورد الأسمنت (تجريبي)', phone: '01000000012' }];
  let seq = 0;
  const mkInv = (date, c, lines, o = {}) => {
    const rows = lines.map(([k, q, price]) => { const it = I[k], p = price == null ? it.price : price; it.sold += q; return { itemId: it.id, name: it.name, unit: it.unit, qty: q, price: p, cost: it.cost, total: round2(q * p) }; });
    const sub = round2(rows.reduce((s, r) => s + r.total, 0)), discPct = o.disc || 0, discAmt = round2(sub * discPct / 100);
    const vatOn = !!o.vat, vatAmt = vatOn ? round2((sub - discAmt) * 14 / 100) : 0, net = round2(sub - discAmt + vatAmt), dep = o.deposit || 0;
    const paid = o.paid == null ? round2(net - dep) : o.paid;
    seq += 1;
    return { id: uid(), no: String(seq).padStart(4, '0'), date, customerId: c ? c.id : null, name: c ? c.name : 'مبيعات نقدية مباشرة', phone: c ? c.phone : '', addr: c ? c.address : '',
      rows, subtotal: sub, discPct, discAmt, vatOn, vatPct: 14, vatAmt, net, paid, deposit: dep, kind: c ? 'credit' : 'cash', remaining: round2(Math.max(net - dep - paid, 0)) };
  };
  const invoices = [
    mkInv(at(2, 11), C[0], [['fe', 1]], { paid: 20000 }),
    mkInv(at(1, 10), C[1], [['ce', 20]], { disc: 3 }),
    mkInv(at(1, 13), null, [['sa', 5]]),
    mkInv(at(0, 9), C[0], [['fe', 2]], { vat: true, paid: 60000 }),
    mkInv(at(0, 10), C[1], [['ce', 10], ['gr', 20]], { disc: 5 }),
    mkInv(at(0, 11), null, [['sa', 3], ['gr', 2]]),
  ];
  const b1 = { id: uid(), customerId: C[2].id, name: C[2].name, phone: C[2].phone, desc: 'حجز حديد', amount: 5000, date: at(1, 15), uses: [], refunds: [] };
  const inv7 = mkInv(at(0, 12), C[2], [['fe', 1]], { deposit: 5000 });
  b1.uses.push({ a: 5000, inv: inv7.no, date: inv7.date });
  const b2 = { id: uid(), customerId: C[1].id, name: C[1].name, phone: C[1].phone, desc: 'حجز أسمنت', amount: 3000, date: at(0, 8), uses: [], refunds: [] };
  invoices.push(inv7, mkInv(at(0, 13), C[2], [['gr', 10, 290]])); /* sold below cost on purpose: shows up under "losses" */
  const purchases = [
    { id: uid(), supplierId: S[0].id, itemId: I.fe.id, name: 'حديد', qty: 5, cost: 36000, total: 180000, date: at(2, 9) },
    { id: uid(), supplierId: S[1].id, itemId: I.ce.id, name: 'أسمنت', qty: 50, cost: 3200, total: 160000, date: at(2, 10) },
  ];
  const spay = [
    { id: uid(), supplierId: S[0].id, name: S[0].name, amount: 120000, date: at(2, 9), kind: 'pay', note: 'مشتريات: حديد' },
    { id: uid(), supplierId: S[1].id, name: S[1].name, amount: 160000, date: at(2, 10), kind: 'pay', note: 'مشتريات: أسمنت' },
    { id: uid(), supplierId: S[0].id, name: S[0].name, amount: 20000, date: at(0, 12), kind: 'settle', note: '' },
  ];
  const E = (date, title, amount, cat) => ({ id: uid(), date, title, amount, note: '', cat });
  const o = {
    v: 2, demo: true, seq,
    settings: { company: '', nameVer: 3, vat: 14, theme: '', zoom: 100, logo: '', address: '', phones: '', adminPin: null, loginPin: null },
    items: Object.values(I).map(i => ({ id: i.id, name: i.name, unit: i.unit, qty: round2(i.base - i.sold), cost: i.cost, price: i.price })),
  };
  ARR.forEach(k => { o[k] = []; });
  o.customers = C; o.suppliers = S; o.invoices = invoices; o.purchases = purchases; o.spay = spay; o.bookings = [b1, b2];
  o.payments = [{ id: uid(), customerId: C[0].id, amount: 10000, date: at(0, 13) }];
  const due = n => ymd(new Date(day0.getTime() + n * 864e5)), chq = (kind, no, bank, P, amount, n) => ({ id: uid(), kind, no, bank, partyId: P.id, name: P.name, amount, due: due(n), note: '', status: 'pending', created: at(0, 9), doneAt: '', payId: '' });
  o.cheques = [chq('in', '458213', 'بنك تجريبي', C[0], 5000, 2), chq('out', '770145', 'بنك تجريبي', S[1], 20000, 9)];
  const qrow = (it, qty, price) => ({ itemId: it.id, name: it.name, unit: it.unit, qty, price, total: round2(qty * price) }), qrows = [qrow(I.ce, 40, 3400), qrow(I.sa, 20, 220)], qsub = round2(qrows.reduce((t, r) => t + r.total, 0));
  o.quotes = [{ id: uid(), no: '0001', date: at(0, 10), status: 'open', invNo: '', by: '', customerId: C[1].id, name: C[1].name, phone: C[1].phone || '', addr: '', rows: qrows, subtotal: qsub, discPct: 0, discAmt: 0, vatOn: false, vatPct: 14, vatAmt: 0, net: qsub, valid: due(5), note: '' }]; o.qseq = 1;
  if (invoices.length) o.deliveries = [{ id: uid(), status: 'pending', created: at(0, 10), outAt: '', doneAt: '', expId: '', invId: invoices[0].id, invNo: invoices[0].no, name: invoices[0].name, phone: invoices[0].phone || '', addr: 'العنوان التجريبي', date: due(0), driver: 'سائق تجريبي', vehicle: 'عربية 1', fee: 150, exp: true, note: '' }];
  o.expenses = [E(at(1, 9), 'عمالة', 600, 'misc'), E(at(0, 9), 'نقل بضاعة', 250, 'misc'), E(at(0, 10), 'كهرباء', 400, 'misc'), E(at(0, 11), 'إكرامية سائق', 50, 'tip')];
  return o;
}
