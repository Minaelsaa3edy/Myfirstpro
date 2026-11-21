/* ---------- Customers ---------- */
screens.customers = (p, v) => {
  v.innerHTML = subHead('العملاء') + `<section class="panel">
    <div class="toolbar"><input id="q" class="inp" placeholder="ابحث بالاسم أو الكود أو الموبايل" aria-label="بحث" autocomplete="off"><button class="btn" id="addC" type="button">${ICON.plus}<span>إضافة عميل</span></button><button class="btn outline" data-act="go" data-to="receipts" type="button">${ICON.rcpt}<span>صور وإشعارات العملاء</span></button></div>
    ${db.customers.length ? docBar('cust', '', true) : ''}
    <div class="tbl-wrap"><table class="grid w7"><colgroup><col style="width:9%"><col style="width:18%"><col style="width:14%"><col style="width:14%"><col style="width:15%"><col style="width:14%"><col style="width:16%"></colgroup>
    <thead><tr><th>كود العميل</th><th>الاسم</th><th>الموبايل</th><th>العنوان</th><th>إجمالي المشتريات</th><th>المتبقي</th><th>إجراء</th></tr></thead><tbody id="rows"></tbody></table></div></section>`;
  const draw = () => {
    const q = $('#q').value.trim();
    const list = db.customers.filter(c => !q || c.name.includes(q) || (c.phone || '').includes(toLat(q)) || (c.code || '').includes(cleanCode(q)));
    $('#rows').innerHTML = list.map(c => { const d = customerDebt(c.id), nt = custNet(c.id); return `<tr>
      <td class="code" dir="ltr"><b>${esc(c.code || '')}</b></td><td><button class="lnk" data-cs="${c.id}">${esc(c.name)}</button></td><td class="muted">${esc(c.phone)}</td><td class="muted">${esc(c.address)}</td>
      <td class="val">${fmt(customerTotal(c.id))}</td><td>${nt > 0 ? `<span class="pill bad">${fmt(nt)}</span>` : nt < 0 ? `<span class="pill ok">${owe(nt)}</span>` : '<span class="pill ok">لا يوجد</span>'}${c.limit > 0 ? `<br><small class="muted">الحد ${fmt(c.limit)}</small>${d > c.limit ? ' <span class="pill info">تجاوز الحد</span>' : ''}` : ''}</td>
      <td><div class="actions" style="justify-content:center;gap:6px"><button class="mini" data-cs="${c.id}">كشف الحساب</button>${d ? `<button class="mini" data-pay="${c.id}">تحصيل</button>` : ''}<button class="edit" data-ed="${c.id}" aria-label="تعديل بيانات ${esc(c.name)}">${ICON.edit}</button><button class="del" data-rm="${c.id}" aria-label="حذف ${esc(c.name)}">${ICON.trash}</button></div></td></tr>`; }).join('')
      || `<tr><td colspan="7" class="empty">${db.customers.length ? 'لا توجد نتائج' : 'السجل فارغ. أضف عميلاً أو فعّل «حفظ في السجل» عند إصدار فاتورة.'}</td></tr>`;
    $$('[data-pay]', v).forEach(b => b.onclick = () => collectModal(b.dataset.pay, null, draw));
    $$('[data-cs]', v).forEach(b => b.onclick = () => go('custDetail', { id: b.dataset.cs }));
    $$('[data-ed]', v).forEach(b => b.onclick = () => go('custEdit', { id: b.dataset.ed }));
    $$('[data-rm]', v).forEach(b => b.onclick = async () => {
      const c = db.customers.find(x => x.id === b.dataset.rm);
      if (c && await confirmBox('حذف العميل', `سيُحذف «${c.name}» من السجل. تبقى فواتيره القديمة كما هي.`)) {
        db.customers = db.customers.filter(x => x.id !== c.id); logA('cust_del', c.name); save(); draw(); toast('تم حذف العميل', 'ok');
      }
    });
  };
  $('#q').addEventListener('input', draw);
  $('#addC').onclick = () => modal(`<h3>إضافة عميل</h3>
    <div class="field"><label for="m-name">اسم العميل</label><input id="m-name" class="inp" autocomplete="off"></div>
    <div class="field"><label for="m-code">كود العميل</label><input id="m-code" class="inp" dir="ltr" value="${nextCode(db.customers, 'C')}" autocomplete="off"></div>
    <div class="field"><label for="m-phone">رقم الموبايل</label><input id="m-phone" class="inp" inputmode="tel" autocomplete="off"></div>
    <div class="field"><label for="m-addr">العنوان</label><input id="m-addr" class="inp" autocomplete="off"></div>
    <div class="field"><label for="m-lim">الحد الائتماني (جنيه) — اتركه فارغاً لعدم التحديد</label><input id="m-lim" class="inp" inputmode="decimal" autocomplete="off"></div>
    <div class="actions"><button class="btn" data-ok>حفظ</button><button class="btn ghost" data-no>إلغاء</button></div>`, (d, close) => {
    $('[data-no]', d).onclick = close;
    $('#m-lim').addEventListener('input', e => { e.target.value = cleanNum(e.target.value); });
    $('[data-ok]', d).onclick = () => {
      const name = $('#m-name').value.trim(); if (!name) return toast('اكتب اسم العميل');
      const code = cleanCode($('#m-code').value) || nextCode(db.customers, 'C'); if (db.customers.some(x => x.code === code)) return toast('هذا الكود مستخدم لعميل آخر');
      db.customers.push({ id: uid(), code, name, phone: toLat($('#m-phone').value).trim(), address: $('#m-addr').value.trim(), limit: round2(num($('#m-lim').value)), prices: {} });
      logA('cust_add', name); save(); close(); draw(); toast('تمت إضافة العميل', 'ok');
    };
  });
  draw();
};

/* collect money from a customer: split over his open invoices (oldest first), or put on one given invoice; with several places he can pick the one the money is for */
function collectModal(cid, invId, done) {
  const c = db.customers.find(x => x.id === cid); if (!c) return;
  const inv = invId ? db.invoices.find(x => x.id === invId) : null;
  const openIn = pl => db.invoices.filter(i => i.customerId === cid && i.status !== 'void' && placeOf(i) === pl && invLeft(i) > 0);
  const leftIn = pl => round2(openIn(pl).reduce((s, i) => s + invLeft(i), 0));
  const withOpen = custPlaces(c).filter(x => openIn(x).length), noPl = openIn('').length > 0, multi = !inv && withOpen.length > 0 && (withOpen.length > 1 || noPl);
  const maxFor = sel => sel === '*' ? (inv ? Math.min(invLeft(inv), customerDebt(cid)) : customerDebt(cid)) : leftIn(sel);
  const max = maxFor('*');
  if (max <= 0) return toast('لا يوجد متبقٍ للتحصيل');
  modal(`<h3>تحصيل من ${esc(c.name)}</h3>
    <p>${inv ? `على الفاتورة رقم <b>${esc(inv.no)}</b>${placeOf(inv) ? ` — ${esc(placeOf(inv))}` : ''}` : 'يُسجَّل على فواتير العميل المفتوحة من الأقدم إلى الأحدث'}</p>
    ${multi ? `<div class="field"><label for="m-pl">المكان</label><div class="sel"><select id="m-pl"><option value="*">كل الأماكن (من الأقدم)</option>${withOpen.map(x => `<option value="${esc(x)}">${esc(x)} — ${money(leftIn(x))}</option>`).join('')}${noPl ? `<option value="">بدون مكان — ${money(leftIn(''))}</option>` : ''}</select></div></div>` : ''}
    <p>المتبقي: <b id="m-left">${money(max)}</b></p>
    <div class="field"><label for="m-amt">المبلغ المحصّل (جنيه)</label><input id="m-amt" class="inp" inputmode="decimal" value="${max}" autocomplete="off"></div>
    ${pmHTML('m-pm')}
    <div class="actions"><button class="btn" data-ok>تسجيل التحصيل</button><button class="btn ghost" data-no>إلغاء</button></div>`, (d, close) => {
    const sel = () => multi ? $('#m-pl').value : '*';
    $('#m-amt').addEventListener('input', e => { e.target.value = cleanNum(e.target.value); });
    const mpm = pmWire(d, 'm-pm');
    if (multi) $('#m-pl').addEventListener('change', () => { const mx = maxFor(sel()); $('#m-left').textContent = money(mx); $('#m-amt').value = mx; });
    $('[data-no]', d).onclick = close;
    $('[data-ok]', d).onclick = () => {
      const a = num($('#m-amt').value), pl = sel(), mx = maxFor(pl);
      if (a <= 0) return toast('اكتب مبلغاً أكبر من صفر');
      if (a > mx + 0.004) return toast(inv ? 'المبلغ أكبر من المتبقي على الفاتورة' : pl !== '*' ? 'المبلغ أكبر من المتبقي على هذا المكان' : 'المبلغ أكبر من المتبقي على العميل');
      const alloc = allocate(cid, a, invId, pl === '*' ? null : pl);
      const s = pmGet(mpm), pid = uid();
      db.payments.push({ id: pid, customerId: cid, amount: round2(a), date: new Date().toISOString(), alloc, ...(pmIs(s.pm) ? { pm: s.pm } : {}) });
      logA('pay_in', custName(cid), money(round2(a)), alloc.length ? alloc.map(x => x.no).join(' ') : '', ...(pl !== '*' ? [pl || 'بدون مكان'] : []), ...(pmIs(s.pm) ? [pmName(s.pm)] : [])); rcFromPm(s, { cid, name: custName(cid), a: round2(a), k: 'pay', ref: pid }); save(); close(); toast(alloc.length ? `تم التحصيل وسُجّل على فاتورة ${alloc.map(x => x.no).join('، ')}` : 'تم تسجيل التحصيل', 'ok'); if (done) done();
    };
  });
}

/* move money the customer HAS with us («له»: a deposit / extra payment, kept per place) to where he OWES («عليه»): one open invoice, or all the open invoices of a place. Nothing else — no «held balance» destinations.
   Putting a deposit on an open invoice lowers what he owes by that amount (the cash came in when he paid it). */
async function transferModal(c, done, pre) {
  if (!await requireAdmin('اكتب الرقم السري للمسؤول لترحيل رصيد العميل')) return;
  const live = db.invoices.filter(i => i.customerId === c.id && i.status !== 'void'), plN = x => x || 'بدون مكان';
  /* only money the customer HAS with us can be moved («له»: a deposit or an extra payment, kept per place) — and only to where he OWES («عليه»: an open invoice, all the open invoices of a place) */
  const src = db.bookings.filter(b => b.customerId === c.id && bkOpen(b) > 0).map(b => ({ b, id: b.id, amt: bkOpen(b), pl: placeOf(b), lbl: b.desc ? `${plN(placeOf(b))} — له ${money(bkOpen(b))} — ${b.desc}` : `${plN(placeOf(b))} — له ${money(bkOpen(b))}` }));
  if (!src.length) return toast('لا يوجد رصيد «له» للعميل (عربون أو زيادة مدفوعة) لترحيله');
  if (!live.some(i => invLeft(i) > 0)) return toast('لا توجد فواتير عليها متبقٍ لترحيل الرصيد إليها');
  const netOf = p => { const sm = settledMap(); return round2(live.filter(i => placeOf(i) === p).reduce((t, i) => t + invLeft(i, sm), 0) - db.bookings.filter(k => k.customerId === c.id && placeOf(k) === p).reduce((t, k) => t + bkOpen(k), 0)); }; /* what he stands at in one place: «عليه» (owes) or «له» (credit) */
  const dests = () => { /* where this money can go: only where he owes */
    const out = [], sm = settledMap(), opens = live.filter(i => invLeft(i, sm) > 0).sort(byDate);
    opens.forEach(i => out.push({ inv: i, left: invLeft(i, sm), lbl: `فاتورة ${i.no} (${plN(placeOf(i))}) — عليه ${money(invLeft(i, sm))}` }));
    if (custPlaces(c).length) [...custPlaces(c), ''].forEach(x => { const l = opens.filter(i => placeOf(i) === x); if (l.length > 1) out.push({ list: l, pl: x, left: round2(l.reduce((t, i) => t + invLeft(i, sm), 0)), lbl: `كل فواتير ${plN(x)} المفتوحة (من الأقدم) — عليه ${money(round2(l.reduce((t, i) => t + invLeft(i, sm), 0)))}` }); });
    return out;
  };
  modal(`<h3>ترحيل رصيد — ${esc(c.name)}</h3>
    <p class="muted"><small>انقل مبلغاً من رصيد العميل «له» (عربون أو زيادة مدفوعة) إلى فاتورة «عليه» فيها متبقٍ.</small></p>
    <div class="field"><label for="x-src">من (له)</label><div class="sel"><select id="x-src"><option value="">— اختر الرصيد —</option>${src.map((s, k) => `<option value="${k}">${esc(s.lbl)}</option>`).join('')}</select></div></div>
    <div class="field"><label for="x-dst">إلى</label><div class="sel"><select id="x-dst"></select></div></div>
    <div class="field"><label for="x-amt">المبلغ (جنيه)</label><input id="x-amt" class="inp" inputmode="decimal" placeholder="0" autocomplete="off"></div>
    <div class="xfer-sum" id="x-sum" hidden></div>
    <div class="actions"><button class="btn" data-ok>ترحيل</button><button class="btn ghost" data-no>إلغاء</button></div>`, (d, close) => {
    /* both lists start empty (he opens the arrow and picks); the amount fills itself once both are chosen */
    let cur = null; const ds = dests(), pickS = () => { const v = $('#x-src').value; return v === '' ? null : src[+v]; }, pickD = () => { const v = $('#x-dst').value; return v === '' ? null : ds[+v]; };
    $('#x-dst').innerHTML = '<option value="">— اختر الفاتورة —</option>' + ds.map((x, k) => `<option value="${k}">${esc(x.lbl)}</option>`).join('');
    const sum = () => {
      const el = $('#x-sum'), x = pickD(), a = round2(num($('#x-amt').value)); el.hidden = !cur || !x || !(a > 0);
      if (!cur || !x || !(a > 0)) return;
      const dpl = x.list ? x.pl : placeOf(x.inv), net = netOf;
      const after = cur.pl !== dpl ? `<br><span>بعد الترحيل: ${esc(plN(cur.pl))} — ${owe(net(cur.pl) + a)} · ${esc(plN(dpl))} — ${owe(net(dpl) - a)}</span>` : ''; /* where the customer stands in each place once it is moved, in words */
      el.innerHTML = `<span>${money(a)} من رصيد العميل تُخصم من ${x.list ? 'فواتير ' + esc(plN(x.pl)) : 'فاتورة ' + esc(x.inv.no)}، فتقلّ مديونيته ${money(a)}.</span>` + after;
    };
    const pick = () => { cur = pickS(); const x = pickD(); $('#x-amt').value = cur && x ? Math.min(cur.amt, x.left) : ''; sum(); }; /* the most that can move: the balance or what the invoice(s) still owe, whichever is smaller */
    if (pre) { const k = src.findIndex(x => x.id === pre); if (k >= 0) { $('#x-src').value = String(k); cur = src[k]; } } /* opened from a card: that balance is already the source */
    $('#x-src').addEventListener('change', pick); $('#x-dst').addEventListener('change', pick);
    $('#x-amt').addEventListener('input', e => { e.target.value = cleanNum(e.target.value); sum(); });
    $('[data-no]', d).onclick = close;
    $('[data-ok]', d).onclick = () => {
      const x = pickD(), a = round2(num($('#x-amt').value)); cur = pickS();
      if (!cur) return toast('اختر الرصيد الذي تريد ترحيله');
      if (!x) return toast('اختر الفاتورة التي تريد الترحيل إليها');
      if (!(a > 0)) return toast('اكتب مبلغاً أكبر من صفر');
      if (a > cur.amt + 0.004) return toast('المبلغ أكبر من الرصيد المتاح للترحيل');
      if (a > x.left + 0.004) return toast(x.list ? 'المبلغ أكبر من المتبقي على فواتير هذا المكان' : 'المبلغ أكبر من المتبقي على الفاتورة');
      const now = new Date().toISOString(), b = cur.b; let left = a; /* put on the open invoice(s): what he owes on them drops */
      (x.list || [x.inv]).forEach(i => { const k = round2(Math.min(left, invLeft(i))); if (k > 0) { b.uses.push({ a: k, inv: i.no, date: now, late: 1 }); i.deposit = round2((i.deposit || 0) + k); i.remaining = round2(i.remaining - k); (i.depLate = i.depLate || []).push({ a: k, date: now }); left = round2(left - k); } });
      const to = x.list ? `فواتير ${plN(x.pl)}` : `فاتورة ${x.inv.no}`;
      logA('cust_xfer', c.name, money(a), `من رصيد مفتوح (${plN(cur.pl)})`, `إلى ${to}`); save(); close(); toast('تم ترحيل الرصيد', 'ok'); if (done) done();
    };
  });
}

/* «فواتير لها رصيد»: everything the customer has money in with us (a deposit, an extra payment), one card under another like the invoices with a balance owed; «ترحيل» moves it when he asks */
function creditPanel(c) {
  const bs = db.bookings.filter(b => b.customerId === c.id && bkOpen(b) > 0).sort(byDate), canGo = db.invoices.some(i => i.customerId === c.id && i.status !== 'void' && invLeft(i) > 0); /* «ترحيل» only makes sense when there is an invoice with a balance owed to move it to */
  const head = '<section class="panel noprint" id="cr-panel"><h2 class="panel-t">فواتير لها رصيد</h2>';
  if (!bs.length) return head + '<p class="muted" style="margin:0"><small>لا توجد فواتير لها رصيد. لما يدفع العميل عربوناً أو زيادة تظهر هنا لترحّلها لو طلب.</small></p></section>';
  return head + `<p style="margin:0 0 10px">إجمالي رصيد العميل: <span class="pill ok">${owe(-round2(bs.reduce((t, b) => t + bkOpen(b), 0)))}</span></p>${canGo ? '' : '<p class="muted" style="margin:0 0 10px"><small>لا توجد فواتير عليها متبقٍ لترحيل الرصيد إليها.</small></p>'}<div class="tbl-wrap"><table class="grid cr-t"><colgroup><col style="width:14%"><col style="width:18%"><col style="width:18%"><col style="width:18%"><col style="width:32%"></colgroup>
    <thead><tr><th>المصدر</th><th>التاريخ</th><th>المكان</th><th>الرصيد</th><th>إجراء</th></tr></thead><tbody>${bs.map(b => { const iv = bkSrcInv(b); /* the invoice this balance came out of */
      const dd = b.desc && b.desc !== 'حجز' && b.desc !== 'عربون — ' + placeOf(b) ? b.desc : ''; /* a note he typed; the automatic ones say nothing new */
      return `<tr class="clk" data-bkrow="${esc(b.id)}"><td>${iv ? `${esc(`فاتورة رقم ${iv.no}`)}${dd ? `<br><small class="muted">${esc(dd)}</small>` : ''}` : esc(dd || 'عربون')}${bkTrail(b)}</td><td class="muted"><bdi dir="ltr">${ymd(b.date)}</bdi></td><td>${placeOf(b) ? esc(placeOf(b)) : 'بدون مكان'}</td><td><span class="pill ok">${owe(-bkOpen(b))}</span></td>
      <td><div class="actions" style="justify-content:center;gap:6px"><button class="mini" data-bk="${esc(b.id)}">عرض</button>${canGo ? `<button class="mini" data-crx="${esc(b.id)}">ترحيل</button>` : ''}${plRenBtn(placeOf(b))}</div></td></tr>`; }).join('')}</tbody></table></div></section>`;
}
/* «إضافة مكان»: just a small form — a new place for the customer and, if he types an amount, the money he puts down in it (into the cash box, recorded in «الحجوزات» under his name and that place, and shown in «فواتير لها رصيد»). No list of places here: renaming sits on the cards of the invoices with a balance owed / with credit */
function placesPanel(c) {
  return `<section class="panel noprint" id="plc-panel"><h2 class="panel-t">إضافة مكان</h2>
    <p class="muted" style="margin:0 0 10px"><small>اكتب اسم المكان الجديد، ولو العميل دفع مبلغاً فيه اكتبه: يدخل الخزنة ويُسجَّل في «الحجوزات» باسم العميل، ويظهر في «فواتير لها رصيد» لترحّله (له / عليه) عند الطلب.</small></p>
    <div class="plc-add"><input id="pl-new" class="inp" maxlength="60" list="pl-dl" placeholder="اسم المكان" aria-label="اسم المكان" autocomplete="off"><datalist id="pl-dl">${custPlaces(c).map(x => `<option value="${esc(x)}">`).join('')}</datalist><input id="pl-amt" class="inp" inputmode="decimal" placeholder="المبلغ (اختياري)" aria-label="المبلغ (اختياري)" autocomplete="off"><button class="btn outline" id="pl-add" type="button">${ICON.plus}<span>إضافة مكان</span></button></div><div id="pl-pmw" hidden>${pmHTML('pl-pm', 'طريقة دفع المبلغ')}</div></section>`;
}
/* the rename button shown on the cards (invoices with a balance owed / with credit): it renames that place for this customer everywhere */
const plRenBtn = pl => pl ? `<button class="mini" data-plren="${esc(pl)}" title="تغيير اسم المكان" aria-label="تغيير اسم المكان">تسمية</button>` : '';
function placesWire(v, c) {
  const add = $('#pl-add'); if (!add) return;
  const amt = $('#pl-amt'); amt.addEventListener('input', e => { e.target.value = cleanNum(e.target.value); $('#pl-pmw').hidden = !(num(e.target.value) > 0); }); /* the method is asked only when an amount is typed */
  const ppm = pmWire(v, 'pl-pm');
  add.onclick = () => {
    const nm = $('#pl-new').value.trim(); if (!nm) return toast('اكتب اسم المكان');
    const raw = amt.value.trim(), amount = raw ? round2(num(raw)) : 0; if (raw && amount <= 0) return toast('اكتب المبلغ');
    const had = custPlaces(c).includes(nm);
    if (had && !amount) return toast('المكان موجود بالفعل');
    if (!had) { c.places = c.places || []; c.places.push(nm); logA('cust_place', c.name, 'إضافة مكان', nm); }
    if (amount) { const s = pmGet(ppm), bid = uid(); db.bookings.push({ id: bid, customerId: c.id, name: c.name, phone: c.phone || '', desc: `عربون — ${nm}`, amount, date: new Date().toISOString(), uses: [], refunds: [], place: nm, ...(pmIs(s.pm) ? { pm: s.pm } : {}) }); logA('bk_add', c.name, money(amount), nm, ...(pmIs(s.pm) ? [pmName(s.pm)] : [])); rcFromPm(s, { cid: c.id, name: c.name, a: amount, k: 'bk', ref: bid }); }
    save(); render(); toast(amount ? 'تم الإيداع: دخل الخزنة وسُجّل في «الحجوزات» باسم العميل في هذا المكان' : 'تمت إضافة المكان', 'ok');
  };
  [$('#pl-new'), amt].forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add.click(); } }));
  $$('[data-plren]', v).forEach(b => b.onclick = async () => {
    const old = b.dataset.plren; if (!await requireAdmin('اكتب الرقم السري للمسؤول لتغيير اسم المكان')) return;
    modal(`<h3>تغيير اسم المكان</h3><p class="muted" style="margin:0 0 10px"><small>الاسم الجديد يتغيّر في كل فواتير وحجوزات العميل في هذا المكان.</small></p><div class="field"><label for="pr-name">الاسم الجديد</label><input id="pr-name" class="inp" maxlength="60" value="${esc(old)}" autocomplete="off"></div>
      <div class="actions"><button class="btn" data-ok>حفظ</button><button class="btn ghost" data-no>إلغاء</button></div>`, (d, close) => {
      $('[data-no]', d).onclick = close;
      $('[data-ok]', d).onclick = () => {
        const nm = $('#pr-name').value.trim(); if (!nm) return toast('اكتب اسم المكان');
        if (nm === old) return close();
        if (custPlaces(c).includes(nm)) return toast('يوجد مكان بهذا الاسم');
        c.places = (c.places || []).map(x => x === old ? nm : x);
        db.invoices.forEach(i => { if (i.customerId === c.id && i.place === old) i.place = nm; });
        db.bookings.forEach(k => { if (k.customerId === c.id && k.place === old) { k.place = nm; if (k.desc === 'عربون — ' + old) k.desc = 'عربون — ' + nm; } }); /* the automatic note follows the new name */
        logA('cust_place', c.name, 'تغيير اسم مكان', `${old} ← ${nm}`); save(); close(); render();
      };
    });
  });
}

/* customer statement: one tidy paper (same look as the invoice, printable) + the invoices still open with quick actions */
screens.custDetail = (p, v) => {
  const c = db.customers.find(x => x.id === p.id); if (!c) return back();
  const m = settledMap(), debt = customerDebt(c.id), canPrint = !window.claude;
  const open = db.invoices.filter(i => i.customerId === c.id && invLeft(i, m) > 0).sort(byDate);
  const bks = db.bookings.filter(b => b.customerId === c.id && bkOpen(b) > 0); /* deposits and extra payments he still has with us */
  const canXfer = bks.length > 0 && open.length > 0; /* only a balance he has with us («له») can be moved, and only to an invoice he owes on */
  v.innerHTML = subHead('كشف حساب عميل') + `<div class="stack">${custPaper(c)}
    ${open.length ? `<section class="panel noprint"><h2 class="panel-t">فواتير عليها متبقي</h2><div class="tbl-wrap"><table class="grid"><colgroup><col style="width:14%"><col style="width:18%"><col style="width:17%"><col style="width:17%"><col style="width:34%"></colgroup>
      <thead><tr><th>الرقم</th><th>التاريخ</th><th>الصافي</th><th>المتبقي</th><th>إجراء</th></tr></thead><tbody>${open.map(i => `<tr><td>${esc(i.no)}${placeOf(i) ? `<br><small class="muted">${esc(placeOf(i))}</small>` : ''}</td><td class="muted"><bdi dir="ltr">${ymd(i.date)}</bdi></td><td class="val">${fmt(i.net)}</td><td><span class="pill bad">${fmt(invLeft(i, m))}</span></td>
      <td><div class="actions" style="justify-content:center;gap:6px"><button class="mini" data-view="${esc(i.id)}">عرض</button><button class="mini" data-payinv="${esc(i.id)}">تحصيل</button>${plRenBtn(placeOf(i))}</div></td></tr>`).join('')}</tbody></table></div></section>` : ''}
    ${creditPanel(c)}
    ${rcPanel(db.receipts.filter(r => r.customerId === c.id).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 12), 'صور وإشعارات العميل', c.id)}
    ${placesPanel(c)}
    <div class="actions noprint" style="justify-content:center">
      ${debt ? `<button class="btn" id="cd-pay" type="button">تحصيل من العميل</button><button class="btn outline" id="cd-wa" type="button">${ICON.chat}<span>تذكير بالسداد (واتساب + PDF)</span></button><button class="btn outline" id="cd-rm" type="button">${ICON.alarm}<span>منبّه تحصيل</span></button>` : ''}
      ${canXfer ? `<button class="btn outline" id="cd-xf" type="button">ترحيل رصيد</button>` : ''}
      <button class="btn ghost" data-act="go" data-to="custEdit" data-p='${JSON.stringify({ id: c.id })}'>بيانات العميل</button>
      <button class="btn ghost" data-act="go" data-to="customers">كل العملاء</button>
      ${canPrint ? `<button class="btn ghost" id="cd-print" type="button">${ICON.printer}<span>طباعة / حفظ PDF</span></button><button class="btn ghost" id="cd-pdf" type="button">${ICON.pdf}<span>تصدير PDF</span></button><button class="btn ghost" data-exp="stmt" data-arg="${c.id}" type="button"><span>تصدير Excel</span></button>` : ''}
    </div></div>`;
  $$('[data-view]', v).forEach(b => b.onclick = () => go('invDetail', { id: b.dataset.view }));
  $$('[data-payinv]', v).forEach(b => b.onclick = () => collectModal(c.id, b.dataset.payinv, () => render()));
  const pb = $('#cd-pay'); if (pb) pb.onclick = () => collectModal(c.id, null, () => render());
  const xf = $('#cd-xf'); if (xf) xf.onclick = () => transferModal(c, () => render());
  $$('[data-crx]', v).forEach(b => b.onclick = () => transferModal(c, () => render(), b.dataset.crx));
  $$('[data-bk]', v).forEach(b => b.onclick = () => go('bkDetail', { id: b.dataset.bk })); /* the balance as an invoice-like page */
  $$('#cr-panel tr[data-bkrow]', v).forEach(tr => tr.onclick = e => { if (!e.target.closest('button, a, .lnk')) go('bkDetail', { id: tr.dataset.bkrow }); });
  placesWire(v, c);
  const rmb = $('#cd-rm'); if (rmb) rmb.onclick = () => alarmCollect(c.id, '');
  const wb = $('#cd-wa'); if (wb) { wb.onclick = () => waRemind(c); docWarm(custPaper(c), 'كشف حساب عميل', c.name); }
  const cpdf = $('#cd-pdf'); if (cpdf) cpdf.onclick = () => pdfSave(custPaper(c), 'كشف حساب عميل', c.name);
  const pr = $('#cd-print'); if (pr) pr.onclick = () => printRep(('كشف_حساب_' + c.name + '_' + ymd(new Date())).replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_'));
};

/* ---------- Settings: a menu of tiles (as in the second video) + sub-screens ---------- */
const SET_TILES = [
  ['setItem', 'إضافة صنف جديد', 'addItem'], ['setItems', 'إدارة الأصناف والأسعار', 'manage'], ['setZoom', 'تغيير حجم الموقع', 'zoom'], ['setWipe', 'خيارات مسح البيانات', 'wipe'],
  ['setCo', 'بيانات المنشأة', 'company'], ['setSec', 'الأمان والرقم السري', 'shield'], ['setBackup', 'نسخة احتياطية', 'backup'], ['setLang', 'اللغة / Language', 'lang'],
  ['setExport', 'تصدير إلى Excel', 'export'], ['auditLog', 'سجل التعديلات', 'audit'], ['setTax', 'الضرائب', 'tax'], ['setWh', 'المخازن', 'wh'],
  ['setUsers', 'المستخدمون والصلاحيات', 'users'], ['setAuto', 'أتمتة الواتساب (n8n)', 'chat'],
];
const setHead = () => subHead('الإعدادات');
const pinInput = (id, label, ph = '') => `<div class="field"><label for="${id}">${label}</label><input id="${id}" class="inp" type="password" inputmode="numeric" maxlength="8" placeholder="${ph}" autocomplete="off"></div>`;
const bindPin = v => $$('input[type=password]', v).forEach(i => i.addEventListener('input', () => { i.value = cleanPin(i.value); }));
const onEnter = (el, fn) => el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); fn(); } });

screens.settings = (p, v) => {
  v.innerHTML = setHead() + (db.settings.adminPin || usersOn() ? '' : `<div class="note"><span>الإعدادات مفتوحة لأي مستخدم. عيّن رقماً سرياً للمسؤول ليُطلب عند حفظ أي تغيير.</span><button class="mini" data-act="go" data-to="setSec">تعيين الآن</button></div>`)
    + `<div class="tiles sm">${SET_TILES.filter(t => canScreen(t[0])).map(([to, label, ic]) => `<button class="tile" data-act="go" data-to="${to}">${ICON[ic]}<span>${label}</span></button>`).join('')}</div>`;
};

/* add a new item to the price list */
screens.setItem = (p, v) => {
  const units = ['طن', 'كيس', 'شكارة', 'متر', 'م³', 'قطعة', 'كجم', 'لتر', 'عبوة'];
  v.innerHTML = setHead() + `<section class="panel"><h2 class="panel-t">إضافة صنف جديد</h2>
    <div class="form-grid">
      <div class="field"><label for="n-name">الصنف</label><input id="n-name" class="inp" list="n-names" placeholder="مثال: حديد، أسمنت" autocomplete="off"><datalist id="n-names">${dlOpts(baseList())}</datalist></div>
      <div class="field"><label for="n-type">النوع (القطر / النوع)</label><input id="n-type" class="inp" list="n-types" placeholder="مثال: قطر 12، بورتلاند" autocomplete="off"><datalist id="n-types">${dlOpts(typeList(''))}</datalist></div>
      <div class="field"><label for="n-maker">اسم مصنع المنتج</label><input id="n-maker" class="inp" list="n-makers" placeholder="مثال: عز" autocomplete="off"><datalist id="n-makers">${dlOpts(makerList())}</datalist></div>
      <div class="field"><label for="n-unit">الوحدة</label><input id="n-unit" class="inp" list="n-units" autocomplete="off"><datalist id="n-units">${units.map(u => `<option value="${u}">`).join('')}</datalist></div>
      <div class="field"><label for="n-cost">سعر الشراء</label><input id="n-cost" class="inp" inputmode="decimal" placeholder="0" autocomplete="off"></div>
      <div class="field"><label for="n-price">سعر البيع</label><input id="n-price" class="inp" inputmode="decimal" autocomplete="off"></div>
      <div class="field"><label for="n-wh">مخزن الصنف</label><div class="sel"><select id="n-wh">${db.warehouses.map(w => `<option value="${esc(w.id)}">${esc(w.name)}</option>`).join('')}</select></div></div>
      <div class="field"><label for="n-min">الحد الأدنى للمخزون (اختياري)</label><input id="n-min" class="inp" inputmode="decimal" placeholder="0" autocomplete="off"></div>
    </div>
    ${db.warehouses.length > 1 ? '' : '<p class="lbl" style="margin:12px 0 0">لإضافة مخزن آخر للاختيار منه: الإعدادات ← المخازن.</p>'}
    <div class="actions" style="margin-top:18px"><button class="btn" id="n-save" type="button">${ICON.save}<span>حفظ في القائمة</span></button></div></section>`;
  ['n-cost', 'n-price', 'n-min'].forEach(id => $('#' + id).addEventListener('input', e => { e.target.value = cleanNum(e.target.value); }));
  $('#n-name').addEventListener('input', () => { $('#n-types').innerHTML = dlOpts(typeList($('#n-name').value.trim())); });
  const save1 = async () => {
    const base = $('#n-name').value.trim(), type = $('#n-type').value.trim(), maker = $('#n-maker').value.trim(), name = itemJoin(base, type), unit = $('#n-unit').value.trim() || 'وحدة', price = num($('#n-price').value), cost = Math.max(round2(num($('#n-cost').value)), 0), home = $('#n-wh').value || WH0;
    if (!base) return toast('اكتب اسم الصنف');
    if (price <= 0) return toast('اكتب سعر البيع');
    if (db.items.some(i => sameItem(i, name, unit))) return toast('هذا الصنف مسجل بالفعل بنفس الوحدة');
    if (!await requireAdmin()) return;
    rememberMaker(maker);
    db.items.push({ id: uid(), name, ...itemParts(base, type, maker), unit, qty: 0, cost, price, min: Math.max(round3(num($('#n-min').value)), 0), wh: {}, home }); logA('item_add', name); save(); back(); toast('تم حفظ الصنف', 'ok');
  };
  $('#n-save').onclick = save1; $$('.inp', v).forEach(i => onEnter(i, save1));
};

/* manage items & prices */
screens.setItems = (p, v) => {
  const multi = db.warehouses.length > 1;
  const rows = db.items.map(i => `<tr><td>${esc(i.name)}${itemMakers(i).length ? `<small class="whs"><span>المصنع: ${esc(itemMakers(i).join(' - '))}</span></small>` : ''}</td><td class="muted">${esc(i.unit)}</td><td class="val">${i.cost > 0 ? fmt(i.cost) : '—'}</td><td class="val">${fmt(i.price)} جنيه</td>${multi ? `<td class="muted">${esc(whName(i.home || WH0))}</td>` : ''}<td class="muted">${i.min > 0 ? fmtq(i.min) : '—'}</td>
    <td><button class="edit" data-edit="${i.id}" aria-label="تعديل ${esc(i.name)}">${ICON.edit}</button></td>
    <td><button class="del" data-del="${i.id}" aria-label="حذف ${esc(i.name)}">${ICON.trash}</button></td></tr>`).join('');
  const cols = multi ? [20, 9, 12, 14, 15, 12, 9, 9] : [24, 11, 15, 17, 0, 13, 10, 10];
  v.innerHTML = setHead() + `<section class="panel"><h2 class="panel-t">قائمة الأصناف المسجلة</h2><div class="tbl-wrap"><table class="grid cat">
    <colgroup>${cols.filter(x => x).map(x => `<col style="width:${x}%">`).join('')}</colgroup>
    <thead><tr><th>الصنف</th><th>الوحدة</th><th>سعر الشراء</th><th>سعر البيع</th>${multi ? '<th>مخزن الصنف</th>' : ''}<th>الحد الأدنى</th><th>تعديل</th><th>حذف</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="${multi ? 8 : 7}" class="empty">لا توجد أصناف مسجلة. أضف صنفاً من «إضافة صنف جديد».</td></tr>`}</tbody></table></div></section>`;
  $$('[data-edit]', v).forEach(b => b.onclick = () => { const it = itemById(b.dataset.edit); if (it) itemEdit(it); });
  $$('[data-del]', v).forEach(b => b.onclick = async () => {
    const it = itemById(b.dataset.del); if (!it) return;
    if (!await confirmBox('', 'هل أنت متأكد من حذف هذا الصنف نهائياً؟' + (it.qty > 0 ? ` (رصيده بالمخزن ${fmtq(it.qty)} ${it.unit} سيُحذف معه)` : ''), 'نعم')) return;
    if (!await requireAdmin()) return;
    db.items = db.items.filter(x => x.id !== it.id); logA('item_del', it.name); save(); render(); toast('تم حذف الصنف', 'ok');
  });
};

/* site zoom (display only: per device, no admin PIN needed) */
screens.setZoom = (p, v) => {
  const steps = [80, 90, 100, 110, 120, 130, 140];
  v.innerHTML = setHead() + `<section class="panel"><h2 class="panel-t">تغيير حجم الموقع</h2>
    <p class="lbl" style="margin:0 0 14px">كبّر أو صغّر العرض ليناسب الشاشة. هذا الإعداد للعرض فقط ولا يحتاج رقم المسؤول.</p>
    <div class="zoom"><button class="btn ghost" id="z-up" type="button" aria-label="تكبير">+</button><b id="z-val" aria-live="polite"></b><button class="btn ghost" id="z-down" type="button" aria-label="تصغير">−</button></div>
    <div class="presets">${steps.map(n => `<button class="mini" data-z="${n}" type="button">${n}%</button>`).join('')}</div>
    <div class="actions" style="margin-top:18px;justify-content:center"><button class="btn outline" id="z-reset" type="button">إعادة الضبط (100%)</button></div></section>`;
  const set = z => { db.settings.zoom = Math.min(140, Math.max(80, z)); save(); applyZoom(); paint(); };
  const paint = () => { $('#z-val').textContent = Math.round(db.settings.zoom) + '%'; $$('[data-z]', v).forEach(b => b.classList.toggle('on', +b.dataset.z === Math.round(db.settings.zoom))); };
  $('#z-up').onclick = () => set(db.settings.zoom + 10); $('#z-down').onclick = () => set(db.settings.zoom - 10); $('#z-reset').onclick = () => set(100);
  $$('[data-z]', v).forEach(b => b.onclick = () => set(+b.dataset.z)); paint();
};

/* facility data: name (blank by default), logo (the VAT rate and tax numbers live in the Taxes switch) */
screens.setCo = (p, v) => {
  let logo = db.settings.logo;
  v.innerHTML = setHead() + `<section class="panel"><h2 class="panel-t">بيانات المنشأة</h2>
    <div class="form-grid">
      <div class="field"><label for="c-name">اسم المنشأة (يظهر أعلى الشاشة الرئيسية وفي الفاتورة والتقارير)</label><input id="c-name" class="inp" value="${esc(db.settings.company)}" placeholder="اكتب اسم المنشأة" maxlength="80" autocomplete="off"></div>
      <div class="field" style="grid-column:1/-1"><label for="c-addr">العنوان (يظهر في ترويسة التقارير)</label><input id="c-addr" class="inp" value="${esc(db.settings.address)}" maxlength="160" autocomplete="off"></div>
      <div class="field" style="grid-column:1/-1"><label for="c-phones">أرقام التواصل (سطر لكل رقم، ويمكن كتابة الاسم قبله مثل «المدير: 0100…»)</label><textarea id="c-phones" class="inp ta-s" rows="3" maxlength="400" autocomplete="off">${esc(db.settings.phones)}</textarea></div>
    </div>
    <div class="field" style="margin-top:16px"><span class="lbl">شعار المنشأة (اختياري) — يظهر على جانبي ترويسة الفاتورة والتقارير وكعلامة مائية خفيفة، وفي شاشة الخروج</span>
      <div class="logo-pick"><div class="logo-prev" id="c-prev"></div>
        <div class="actions"><label class="btn outline" for="c-file">اختيار صورة</label><input id="c-file" type="file" accept="image/*" class="sr"><button class="btn ghost" id="c-rm" type="button">إزالة الشعار</button></div></div></div>
    <div class="field" style="margin-top:16px"><span class="lbl">معاينة ترويسة الفاتورة</span><div class="paper pv inv" id="c-pv"></div></div>
    <div class="actions" style="margin-top:20px"><button class="btn" id="c-save" type="button">${ICON.save}<span>حفظ البيانات</span></button></div></section>`;
  const preview = () => letterhead({ logo, name: $('#c-name').value.trim() || 'اسم المنشأة', phones: toLat($('#c-phones').value).split('\n').map(x => x.trim()).filter(Boolean).join(' | '), addr: $('#c-addr').value.trim() });
  const paint = () => { $('#c-prev').innerHTML = logo ? `<img src="${logo}" alt="الشعار">` : `<span>بدون شعار</span>`; $('#c-rm').hidden = !logo; $('#c-pv').innerHTML = preview(); };
  paint(); ['#c-name', '#c-addr', '#c-phones'].forEach(q => $(q).addEventListener('input', paint));
  $('#c-rm').onclick = () => { logo = ''; paint(); };
  $('#c-file').onchange = e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    if (!/^image\//.test(f.type)) return toast('اختر ملف صورة');
    const r = new FileReader(); r.onerror = () => toast('تعذر قراءة الصورة');
    r.onload = () => {
      const im = new Image(); im.onerror = () => toast('تعذر قراءة الصورة');
      im.onload = () => {
        const w0 = im.naturalWidth || 300, h0 = im.naturalHeight || 300, k = Math.min(1, 520 / Math.max(w0, h0));
        const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
        const x = c.getContext('2d'); x.drawImage(im, 0, 0, c.width, c.height);
        let u = c.toDataURL('image/png');
        if (u.length > 300000) { x.globalCompositeOperation = 'destination-over'; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); u = c.toDataURL('image/jpeg', .85); }
        logo = u; paint();
      };
      im.src = r.result;
    };
    r.readAsDataURL(f);
  };
  $('#c-save').onclick = async () => {
    if (!await requireAdmin()) return;
    db.settings.company = $('#c-name').value.trim(); db.settings.logo = logo;
    db.settings.address = $('#c-addr').value.trim(); db.settings.phones = toLat($('#c-phones').value).split('\n').map(x => x.trim()).filter(Boolean).join('\n');
    logA('set', 'تعديل بيانات المنشأة'); save(); back(); toast('تم حفظ بيانات المنشأة', 'ok');
  };
};

/* security: admin PIN (guards saving in Settings) + optional login PIN (set by the admin only) */
screens.setSec = (p, v) => {
  const S = db.settings;
  if (usersOn()) { v.innerHTML = setHead() + `<section class="panel"><h2 class="panel-t">الأمان والرقم السري</h2><p class="lbl" style="margin:0 0 14px;line-height:1.9">المستخدمون مفعّلون: كل مستخدم له رقمه السري، وموافقة المدير تكون برقمه هو. تُدار الأرقام من «المستخدمون والصلاحيات».</p><div class="actions"><button class="btn" data-act="go" data-to="setUsers" type="button">فتح المستخدمين والصلاحيات</button></div></section>`; return; }
  v.innerHTML = setHead() + `<div class="stack">
  <section class="panel"><h2 class="panel-t">الرقم السري للمسؤول <span class="badge ${S.adminPin ? 'on' : ''}">${S.adminPin ? 'مفعّل' : 'غير مفعّل'}</span></h2>
    <p class="lbl" style="margin:0 0 14px">يُطلب عند حفظ أي تغيير في الإعدادات (الأصناف والأسعار، بيانات المنشأة، مسح البيانات، الاسترجاع). من 4 إلى 8 أرقام.</p>
    <div class="form-grid">${S.adminPin ? pinInput('a-old', 'الرقم الحالي') : ''}${pinInput('a-new', S.adminPin ? 'الرقم الجديد' : 'الرقم السري')}${pinInput('a-new2', 'تأكيد الرقم')}</div>
    <div class="actions" style="margin-top:18px"><button class="btn" id="a-save" type="button">${ICON.save}<span>حفظ الرقم السري</span></button>${S.adminPin ? '<button class="btn danger" id="a-off" type="button">إلغاء الرقم السري</button>' : ''}</div></section>
  <section class="panel"><h2 class="panel-t">رقم سري الدخول (اختياري) <span class="badge ${S.loginPin ? 'on' : ''}">${S.loginPin ? 'مفعّل' : 'غير مفعّل'}</span></h2>
    <p class="lbl" style="margin:0 0 14px">${S.adminPin ? 'لو عيّنته، يطلبه التطبيق عند الفتح وبعد تسجيل الخروج. المسؤول فقط يقدر يضيفه أو يغيّره.' : 'عيّن الرقم السري للمسؤول أولاً، ثم يمكنك تعيين رقم دخول اختياري.'}</p>
    <div class="form-grid">${pinInput('l-new', 'رقم الدخول')}${pinInput('l-new2', 'تأكيد الرقم')}</div>
    <div class="actions" style="margin-top:18px"><button class="btn" id="l-save" type="button" ${S.adminPin ? '' : 'disabled'}>${ICON.save}<span>حفظ رقم الدخول</span></button>${S.loginPin ? '<button class="btn danger" id="l-off" type="button">إلغاء رقم الدخول</button>' : ''}</div></section>
  <p class="lbl note-s">ملاحظة: الحماية هنا على مستوى المتصفح، تمنع المستخدم العادي من الدخول أو التعديل، لكنها ليست تأمينًا كاملاً. التأمين الكامل (حسابات ومستخدمين على سيرفر) خطوة لاحقة.</p></div>`;
  bindPin(v);
  const ok4 = x => x.length >= 4;
  const checkOld = () => {
    const w = waitSecs('admin'); if (w) { toast(`محاولات كثيرة. حاول بعد ${w} ثانية`); return false; }
    if (!checkPin(cleanPin($('#a-old').value), S.adminPin)) { pinFail('admin'); toast('الرقم الحالي غير صحيح'); return false; }
    delete tries.admin; return true;
  };
  $('#a-save').onclick = () => {
    const n = cleanPin($('#a-new').value), n2 = cleanPin($('#a-new2').value);
    if (S.adminPin && !checkOld()) return;
    if (!ok4(n)) return toast('الرقم السري من 4 إلى 8 أرقام');
    if (n !== n2) return toast('تأكيد الرقم غير مطابق');
    if (S.loginPin && checkPin(n, S.loginPin)) return toast('يجب أن يختلف عن رقم الدخول');
    S.adminPin = makePin(n); adminUntil = Date.now() + 10 * 60 * 1000; logA('pin', 'تعيين الرقم السري للمسؤول'); save(); render(); toast('تم حفظ الرقم السري للمسؤول', 'ok');
  };
  if (S.adminPin) $('#a-off').onclick = async () => {
    if (!checkOld()) return;
    if (!await confirmBox('', 'إلغاء الرقم السري يجعل الإعدادات مفتوحة لأي مستخدم. هل تريد المتابعة؟', 'نعم')) return;
    S.adminPin = null; adminUntil = 0; logA('pin', 'إلغاء الرقم السري للمسؤول'); save(); render(); toast('تم إلغاء الرقم السري للمسؤول', 'ok');
  };
  $('#l-save').onclick = async () => {
    const n = cleanPin($('#l-new').value), n2 = cleanPin($('#l-new2').value);
    if (!ok4(n)) return toast('رقم الدخول من 4 إلى 8 أرقام');
    if (n !== n2) return toast('تأكيد الرقم غير مطابق');
    if (checkPin(n, S.adminPin)) return toast('رقم الدخول يجب أن يختلف عن رقم المسؤول');
    if (!await requireAdmin()) return;
    S.loginPin = makePin(n); logA('pin', 'تعيين رقم الدخول'); save(); render(); toast('تم حفظ رقم الدخول', 'ok');
  };
  if (S.loginPin) $('#l-off').onclick = async () => {
    if (!await requireAdmin()) return;
    S.loginPin = null; logA('pin', 'إلغاء رقم الدخول'); save(); render(); toast('تم إلغاء رقم الدخول', 'ok');
  };
};

/* wipe options */
screens.setWipe = (p, v) => {
  const W = [
    ['مسح الفواتير', () => db.invoices.length, () => { db.invoices = []; db.returns = []; db.rseq = 0; }],
    ['مسح المصروفات', () => db.expenses.length, () => { db.expenses = []; }],
    ['مسح الداخل للدرج وسحوباته (درج / خزينة / رأس مال)', () => db.cashin.length + db.pmoves.length, () => { db.cashin = []; db.pmoves = []; }],
    ['مسح العملاء وتحصيلاتهم', () => db.customers.length, () => { db.customers = []; db.payments = []; db.receipts = []; rcReset({}); db.cheques = db.cheques.filter(x => x.kind !== 'in'); }],
    ['مسح الموردين ومشترياتهم ودفعاتهم', () => db.suppliers.length, () => { db.suppliers = []; db.purchases = []; db.spurch = []; db.spay = []; db.cheques = db.cheques.filter(x => x.kind !== 'out'); }],
    ['مسح إيصالات النقدية (استلام من عميل / من المكتب)', () => db.vouchers.length, () => { db.vouchers = []; db.vseq = { in: 0, out: 0 }; }],
    ['مسح الحجوزات', () => db.bookings.length, () => { db.bookings = []; }],
    ['مسح الموظفين وحضورهم وسلفهم', () => db.emps.length, () => { db.emps = []; db.att = []; db.adv = []; }],
    ['مسح المخزن والأصناف', () => db.items.length, () => { db.items = []; db.moves = []; db.counts = []; db.damages = []; }],
  ];
  v.innerHTML = setHead() + `<section class="panel"><h2 class="panel-t">خيارات مسح البيانات</h2>
    <p class="lbl" style="margin:0 0 6px">${db.demo ? 'يحتوي التطبيق الآن على صنف تجريبي (حديد، 100 طن). امسح البيانات قبل بدء العمل الفعلي.' : 'المسح نهائي ولا يمكن التراجع عنه. خذ نسخة احتياطية قبل المسح.'}</p>
    <div class="wipe">${W.map(([label, n], i) => `<div class="wipe-row"><span>${label}</span><small>${n()} عنصر</small><button class="btn danger sm" data-w="${i}" type="button">مسح</button></div>`).join('')}
    <div class="wipe-row all"><span>مسح كل البيانات</span><small>المخزن والعملاء والموردين والحجوزات والفواتير والمصروفات</small><button class="btn danger sm" id="w-all" type="button">مسح الكل</button></div></div>
    <div class="actions" style="margin-top:18px"><button class="btn outline" id="w-demo" type="button">استرجاع البيانات التجريبية</button></div></section>`;
  const run = async (msg, fn, done, what) => {
    if (!await confirmBox('', msg, 'نعم')) return;
    if (!await requireAdmin()) return;
    fn(); logA('wipe', what); save(); render(); toast(done, 'ok');
  };
  $$('[data-w]', v).forEach(b => b.onclick = () => { const w = W[+b.dataset.w]; run(`هل أنت متأكد من ${w[0]}؟ لا يمكن التراجع.`, w[2], 'تم المسح', w[0]); });
  $('#w-all').onclick = () => run('هل أنت متأكد من مسح كل البيانات؟ لا يمكن التراجع.', () => { db.items = []; ARR.forEach(k => { db[k] = []; }); rcReset({}); db.seq = 0; db.rseq = 0; db.demo = false; }, 'تم مسح كل البيانات', 'مسح كل البيانات');
  $('#w-demo').onclick = () => run('ستُستبدل كل البيانات الحالية بالبيانات التجريبية. هل تريد المتابعة؟', () => { const s = db.settings, a = db.audit; db = seed(); db.settings = s; db.audit = a; }, 'تم استرجاع البيانات التجريبية', 'استرجاع البيانات التجريبية');
};

/* backup & restore (copy / paste JSON) */
/* language: Arabic (default) or English; saved with the program settings, no admin PIN needed */
screens.setLang = (p, v) => {
  v.innerHTML = setHead() + `<section class="panel"><h2 class="panel-t">اللغة / Language</h2>
    <p class="lbl" style="margin:0 0 14px;line-height:1.9">اختر لغة واجهة البرنامج. العربية هي الأساس، والإنجليزية اختيارية، وتُحفظ على هذا الجهاز. Choose the program language: Arabic is the default and English is optional.</p>
    <div class="actions"><button class="btn${LANG === 'ar' ? '' : ' outline'}" data-lang="ar" type="button">العربية</button><button class="btn${LANG === 'en' ? '' : ' outline'}" data-lang="en" type="button">English</button></div></section>`;
  $$('[data-lang]', v).forEach(b => b.onclick = () => { if (b.dataset.lang !== LANG) setLang(b.dataset.lang); });
};

screens.setBackup = (p, v) => {
  const S = db.settings, d = backupDays(), EV = [[0, 'بدون تذكير'], [1, 'كل يوم'], [3, 'كل 3 أيام'], [7, 'كل أسبوع']];
  v.innerHTML = setHead() + `<div class="stack">
  <section class="panel"><h2 class="panel-t">نسخة احتياطية</h2>
    <p class="lbl" style="margin:0 0 10px;line-height:1.9">البيانات محفوظة في هذا المتصفح فقط، فاحتفظ بنسخة في مكان آخر. «تحميل نسخة» يحفظ ملفاً على الجهاز، ويمكنك استرجاعه في أي وقت. الأرقام السرية لا تدخل في النسخة.</p>
    <p class="lbl" style="margin:0 0 14px">${S.lastBackup ? `آخر نسخة: <b><bdi dir="ltr">${ymd(S.lastBackup)}</bdi></b> ${d >= 1 ? `(منذ ${d} يوم)` : '(اليوم)'}` : 'لم تُحمَّل أي نسخة احتياطية بعد.'}</p>
    <div class="actions"><button class="btn" id="b-dl" type="button">تحميل نسخة احتياطية</button><label class="btn outline" for="b-file">استرجاع من ملف</label><input id="b-file" type="file" accept=".json,application/json" class="sr"></div>
    <div class="field" style="margin-top:18px;max-width:320px"><label for="b-ev">تذكير بالنسخ الاحتياطي</label><div class="sel"><select id="b-ev">${EV.map(([k, t]) => `<option value="${k}"${(S.backupEvery || 0) === k ? ' selected' : ''}>${t}</option>`).join('')}</select></div></div></section>
  <section class="panel"><h2 class="panel-t">نسخ تلقائي في مجلد</h2>${canFolder() ? `
    <p class="lbl" style="margin:0 0 10px;line-height:1.9">اختر مجلداً على الكمبيوتر (يفضّل مجلد مزامن مع Google Drive أو OneDrive) ليحفظ فيه البرنامج نسخة تلقائياً كلما تغيّرت البيانات، مع الاحتفاظ بآخر 14 يوماً. يعمل والبرنامج مفتوح على Chrome أو Edge.</p>
    <p class="lbl" style="margin:0 0 14px" id="f-st"></p>
    <div class="actions"><button class="btn" id="f-pick" type="button">اختيار مجلد</button><button class="btn outline" id="f-allow" type="button" hidden>السماح بالوصول للمجلد</button><button class="btn danger" id="f-off" type="button" hidden>إيقاف</button></div>` : `
    <p class="lbl" style="margin:0;line-height:1.9">النسخ التلقائي في مجلد متاح على متصفح Chrome أو Edge في الكمبيوتر فقط. يمكنك استخدام «تحميل نسخة احتياطية» من أي جهاز.</p>`}</section>
  <section class="panel"><h2 class="panel-t">نسخ ولصق (طريقة بديلة)</h2>
    <p class="lbl" style="margin:0 0 10px">اضغط «نسخ نسخة احتياطية» واحفظ النص في ملف. لاسترجاعه الصقه في الخانة واضغط «استرجاع».</p>
    <textarea id="b-json" class="inp" aria-label="النسخة الاحتياطية" spellcheck="false" placeholder="هنا تظهر النسخة الاحتياطية، أو الصق نسخة سابقة للاسترجاع"></textarea>
    <div class="actions" style="margin-top:12px"><button class="btn ghost" id="b-copy" type="button">نسخ نسخة احتياطية</button><button class="btn outline" id="b-restore" type="button">استرجاع من النص</button></div></section></div>`;
  const ta = $('#b-json');
  $('#b-dl').onclick = () => backupNow();
  $('#b-file').onchange = e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    if (f.size > 40e6) return toast('الملف كبير جداً');
    const r = new FileReader(); r.onerror = () => toast('تعذرت قراءة الملف'); r.onload = () => restoreFrom(String(r.result)); r.readAsText(f);
  };
  $('#b-ev').onchange = e => { S.backupEvery = +e.target.value; logA('set', 'تذكير النسخ الاحتياطي'); save(); toast('تم الحفظ', 'ok'); };
  $('#b-copy').onclick = async () => {
    if (!await requireAdmin('اكتب الرقم السري للمسؤول لعرض النسخة الاحتياطية')) return;
    ta.value = JSON.stringify(backupObj());
    try { await navigator.clipboard.writeText(ta.value); toast('تم نسخ النسخة الاحتياطية', 'ok'); } catch (e) { ta.focus(); ta.select(); toast('حدّد النص وانسخه يدوياً'); }
  };
  $('#b-restore').onclick = () => restoreFrom(ta.value);
  if (canFolder()) {
    const paint = async () => {
      const st = await folderState(), on = !!S.autoDir;
      $('#f-st').innerHTML = !on ? 'غير مفعّل.' : st.ok ? `مفعّل — المجلد: <b>${esc(S.autoDir)}</b>${S.lastAuto ? ` · آخر نسخة تلقائية: <bdi dir="ltr">${ymd(S.lastAuto)}</bdi>` : ''}` : `المجلد <b>${esc(S.autoDir)}</b> يحتاج إذنك من جديد حتى يكمل النسخ.`;
      $('#f-allow').hidden = !(on && !st.ok); $('#f-off').hidden = !on; $('#f-pick').firstChild.textContent = on ? 'تغيير المجلد' : 'اختيار مجلد';
    };
    $('#f-pick').onclick = async () => { if (!await requireAdmin()) return; if (await pickBackupFolder()) toast('تم تفعيل النسخ التلقائي', 'ok'); paint(); };
    $('#f-allow').onclick = async () => { toast(await allowFolder() ? 'تم السماح، وتم حفظ نسخة' : 'لم يُمنح الإذن'); paint(); };
    $('#f-off').onclick = async () => { if (!await requireAdmin()) return; S.autoDir = ''; try { await idbSet(KEY, null); } catch (e) { /* nothing to clear */ } logA('backup', 'إيقاف النسخ التلقائي'); save(); paint(); toast('تم إيقاف النسخ التلقائي', 'ok'); };
    paint();
  }
};

/* ---------- Logout / lock screen & boot ---------- */
/* A program opened from the hosted code page (the gate) has a real exit: it forgets the code on this device and goes back to the code page.
   The business data stays on the device; the code (or the designer's password) is asked for again. The gate leaves its storage key in sessionStorage ('gx.ck'). */
function gateExit() {
  let ck = ''; try { ck = sessionStorage.getItem('gx.ck') || ''; } catch (e) { /* no storage */ }
  if (!ck) return false;
  confirmBox('الخروج', 'سيُغلق البرنامج ويطلب الكود عند الدخول مرة أخرى، فاحتفظ بالكود. بياناتك محفوظة على جهازك ولن تُمسح.', 'خروج', false).then(ok => {
    if (!ok) return;
    CUR_USER = null; adminUntil = 0; closePop();
    try { localStorage.removeItem(ck); sessionStorage.removeItem('gx.ck'); } catch (e) { /* storage blocked */ }
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* keep the address */ }
    Promise.resolve(typeof pushForget === 'function' ? pushForget() : 0).catch(() => 0).then(() => location.reload()); /* the gate page loads again and shows the code box (first this device stops getting phone alarms) */
  });
  return true;
}
function lockScreen() {
  if (!usersOn() && !db.settings.loginPin && gateExit()) return; /* no PIN / accounts: "exit" really leaves (a PIN or accounts keep the lock screen, which switches the user) */
  hReset(); adminUntil = 0; closePop(); CUR_USER = null;
  const S = db.settings, U = usersOn(), locked = U || !!S.loginPin, t0 = Date.now(), v = $('#view');
  let lastU = ''; try { lastU = localStorage.getItem(KEY + '.user') || ''; } catch (e) { /* no storage */ }
  v.innerHTML = `<div class="lock${locked ? '' : ' tap'}"${locked ? '' : ' tabindex="0" role="button" aria-label="اضغط للدخول"'}><div class="lock-in">
    <div class="lock-logo">${S.logo ? `<img src="${S.logo}" alt="">` : ICON.company}</div>
    <h2 class="brand lock-name">${brandHTML()}</h2>
    ${locked ? `<div class="lock-form">${U ? `<div class="sel"><select id="l-user" aria-label="المستخدم">${db.users.map(u => `<option value="${u.id}"${u.id === lastU ? ' selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div>` : ''}<input id="l-pin" class="inp" type="password" inputmode="numeric" maxlength="8" placeholder="الرقم السري" aria-label="الرقم السري" autocomplete="off"><button class="btn lg" id="l-go" type="button">دخول</button></div>` : `<p class="hint">اضغط في أي مكان للدخول</p>`}
  </div></div>`;
  const box = $('.lock', v);
  const enter = () => { box.classList.add('leave'); setTimeout(render, 240); };
  if (locked) {
    const inp = $('#l-pin'), submit = () => {
      const u = U ? db.users.find(x => x.id === $('#l-user').value) : null, k = U ? 'u' + (u ? u.id : '') : 'login';
      const w = waitSecs(k); if (w) return toast(`محاولات كثيرة. حاول بعد ${w} ثانية`);
      if (U ? u && checkPin(cleanPin(inp.value), u.pin) : checkPin(cleanPin(inp.value), S.loginPin)) {
        delete tries[k];
        if (u) { CUR_USER = { id: u.id, name: u.name, role: u.role }; u.last = new Date().toISOString(); markAudit(); logA('u_login', u.name, roleOf(u).n); save(); try { localStorage.setItem(KEY + '.user', u.id); } catch (e) { /* no storage */ } }
        enter();
      } else { pinFail(k); inp.value = ''; inp.focus(); toast('الرقم السري غير صحيح'); }
    };
    $('#l-go').onclick = submit; onEnter(inp, submit); inp.addEventListener('input', () => { inp.value = cleanPin(inp.value); }); inp.focus();
  } else {
    box.onclick = () => { if (Date.now() - t0 > 400) enter(); };
    box.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enter(); } });
    box.focus();
  }
}
