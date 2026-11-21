/* ---------- Expenses, tips & suppliers ---------- */
const supById = id => db.suppliers.find(s => s.id === id);
const supBoughtStock = id => round2(db.purchases.filter(x => x.supplierId === id).reduce((s, x) => s + x.total, 0)); /* bought through «إضافة بضاعة» in the warehouse */
const supBoughtManual = id => round2(db.spurch.filter(x => x.supplierId === id).reduce((s, x) => s + x.total, 0)); /* typed by hand in the Suppliers section */
const supBought = id => round2(supBoughtStock(id) + supBoughtManual(id));
const supPaid = id => round2(db.spay.filter(x => x.supplierId === id).reduce((s, x) => s + x.amount, 0));
const supBal = id => round2(supBought(id) - supPaid(id));
const CATS = { misc: 'مصروف', tip: 'إكرامية / خصم' };
/* 8.43: money that came into the drawer and is not a sale or a collection — from the drawer, from the safe, or the owner's capital. It is its own section in the reports. */
const CIN = { drawer: 'من الدرج', safe: 'من الخزينة', capital: 'رأس المال', bank: 'من البنك' }, CIN_W = { drawer: 'داخل من الدرج', safe: 'داخل من الخزينة', capital: 'داخل من رأس المال', bank: 'داخل من البنك' }, CIN_T = 'داخل من الدرج / الخزينة / رأس المال', CIN_TD = 'تفاصيل داخل من الدرج / الخزينة / رأس المال', CIN_TT = 'إجمالي داخل من الدرج / الخزينة / رأس المال', CIN_DAY = { drawer: 'داخل من الدرج اليوم', safe: 'داخل من الخزينة اليوم', capital: 'داخل من رأس المال اليوم', bank: 'داخل من البنك اليوم' };
/* 8.44: where the money sits — the drawer (cash) or a bank-like account; the same four places an invoice can be paid into */
const CIN_PM = { cash: 'الدرج (نقدي)', insta: 'إنستا باي', wallet: 'محفظة', bank: 'حساب بنكي' };
const pmBtns = (id, label, sel = 'cash') => `<div class="pm" id="${id}" data-pm="${sel}"><div class="pm-l">${label}</div><div class="pm-b" role="group" aria-label="${label}">${Object.entries(CIN_PM).map(([k, n]) => `<button type="button" class="pmb${k === sel ? ' on' : ''}" data-k="${k}" aria-pressed="${k === sel}">${n}</button>`).join('')}</div></div>`;
function pmBtnsWire(root, id) { const el = $('#' + id, root); if (el) el.addEventListener('click', e => { const b = e.target.closest('.pmb'); if (!b) return; el.dataset.pm = b.dataset.k; $$('.pmb', el).forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); }); }); return () => (el ? pmKey(el.dataset.pm) : 'cash'); }
const pmReset = id => { const el = $('#' + id); if (el) { el.dataset.pm = 'cash'; $$('.pmb', el).forEach(x => { x.classList.toggle('on', x.dataset.k === 'cash'); x.setAttribute('aria-pressed', String(x.dataset.k === 'cash')); }); } };
const cinWhat = x => (CIN_W[x.src] || CIN_W.drawer) + (x.note ? ' — ' + x.note : '');

function addSupplierModal(done, ed) { /* ed: an existing supplier -> the same box edits his name, code and mobile */
  modal(`<h3>${ed ? 'تعديل بيانات المورد' : 'إضافة مورد'}</h3>
    <div class="field"><label for="m-name">اسم المورد</label><input id="m-name" class="inp" autocomplete="off" value="${ed ? esc(ed.name) : ''}"></div>
    <div class="field"><label for="m-code">كود المورد</label><input id="m-code" class="inp" dir="ltr" autocomplete="off" value="${ed ? esc(ed.code || '') : nextCode(db.suppliers, 'S')}"></div>
    <div class="field"><label for="m-phone">رقم الموبايل (اختياري)</label><input id="m-phone" class="inp" inputmode="tel" autocomplete="off" value="${ed ? esc(ed.phone || '') : ''}"></div>
    <div class="actions"><button class="btn" data-ok>حفظ</button><button class="btn ghost" data-no>إلغاء</button></div>`, (d, close) => {
    $('[data-no]', d).onclick = close;
    $('[data-ok]', d).onclick = () => {
      const name = $('#m-name').value.trim(); if (!name) return toast('اكتب اسم المورد');
      if (db.suppliers.some(x => x !== ed && x.name === name)) return toast('هذا المورد مسجّل بالفعل');
      const code = cleanCode($('#m-code').value) || (ed && ed.code) || nextCode(db.suppliers, 'S'); if (db.suppliers.some(x => x !== ed && x.code === code)) return toast('هذا الكود مستخدم لمورد آخر');
      if (ed) { /* his name is also written on his payments: keep them in step */
        db.spay.forEach(x => { if (x.supplierId === ed.id) x.name = name; });
        Object.assign(ed, { name, code, phone: toLat($('#m-phone').value).trim() }); logA('sup_edit', name, code); save(); close(); toast('تم حفظ بيانات المورد', 'ok'); if (done) done(ed); return;
      }
      const s = { id: uid(), code, name, phone: toLat($('#m-phone').value).trim() };
      db.suppliers.push(s); logA('sup_add', name); save(); close(); toast('تمت إضافة المورد', 'ok'); if (done) done(s);
    };
  });
}

screens.expenses = (p, v) => {
  v.innerHTML = subHead('المصروفات والموردين') + `<div class="menu">
    <button class="opt" style="--ac:var(--red)" data-act="go" data-to="expLog">${ICON.expenses}<span>تسجيل مصروف أو إكرامية</span></button>
    <button class="opt" style="--ac:var(--blue)" data-act="go" data-to="suppliers">${ICON.truck}<span>الموردين ودفعاتهم</span></button>
    <button class="opt" style="--ac:var(--green)" data-act="go" data-to="supGoods">${ICON.stock}<span>إضافة بضاعة بالأجل</span></button>
    <button class="opt" style="--ac:var(--purple)" data-act="go" data-to="supLog">${ICON.reports}<span>سجل المشتريات</span></button>
  </div>`;
};

screens.expLog = (p, v) => {
  v.innerHTML = subHead('تسجيل مصروف') + `<div class="stack">
  <section class="panel"><h2 class="panel-t">إضافة مصروف</h2>
    <div class="form-grid">
      <div class="field"><label for="e-title">البند</label><input id="e-title" class="inp" placeholder="مثال: نقل، عمالة، كهرباء" autocomplete="off"></div>
      <div class="field"><label for="e-amt">المبلغ (جنيه)</label><input id="e-amt" class="inp" inputmode="decimal" placeholder="0" autocomplete="off"></div>
      <div class="field"><label for="e-cat">النوع</label><div class="sel"><select id="e-cat">${Object.entries(CATS).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></div></div>
      <div class="field"><label for="e-note">ملاحظة</label><input id="e-note" class="inp" autocomplete="off"></div>
      <div style="grid-column:1/-1">${pmBtns('e-pm', 'يُدفع من')}</div>
      <div><button class="btn" id="e-add" type="button">${ICON.plus}<span>إضافة</span></button></div>
    </div></section>
  <section class="panel"><div class="stats" id="e-stats" style="margin-bottom:16px"></div>
    ${db.expenses.length ? docBar('exp', '', true) : ''}
    <div class="tbl-wrap"><table class="grid"><colgroup><col style="width:22%"><col style="width:22%"><col style="width:16%"><col style="width:16%"><col style="width:16%"><col style="width:8%"></colgroup>
    <thead><tr><th>التاريخ</th><th>البند</th><th>النوع</th><th>المبلغ</th><th>ملاحظة</th><th>حذف</th></tr></thead><tbody id="rows"></tbody></table></div></section></div>`;
  $('#e-amt').addEventListener('input', e => { e.target.value = cleanNum(e.target.value); });
  const epm = pmBtnsWire(v, 'e-pm');
  const draw = () => {
    const now = new Date(), isMonth = e => { const d = new Date(e.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); };
    const sum = a => a.reduce((s, e) => s + e.amount, 0);
    $('#e-stats').innerHTML = `<div class="stat neg"><span>مصروفات اليوم</span><b>${money(sum(db.expenses.filter(e => e.cat !== 'tip' && sameDay(e.date))))}</b></div>
      <div class="stat"><span>مصروفات الشهر</span><b>${money(sum(db.expenses.filter(e => e.cat !== 'tip' && isMonth(e))))}</b></div>
      <div class="stat"><span>إكراميات وخصومات اليوم</span><b>${money(sum(db.expenses.filter(e => e.cat === 'tip' && sameDay(e.date))))}</b></div>`;
    $('#rows').innerHTML = db.expenses.slice().reverse().map(e => `<tr><td class="muted">${dateTimeAr(e.date)}</td><td>${esc(e.title)}${pmBadge(e.pm)}</td><td><span class="pill ${e.cat === 'tip' ? 'info' : ''}">${CATS[e.cat] || CATS.misc}</span></td><td class="val">${fmt(e.amount)}</td><td class="muted">${esc(e.note)}</td>
      <td><button class="del" data-rm="${e.id}" aria-label="حذف المصروف">${ICON.trash}</button></td></tr>`).join('') || `<tr><td colspan="6" class="empty">لا توجد مصروفات مسجلة.</td></tr>`;
    $$('[data-rm]', v).forEach(b => b.onclick = async () => {
      const ex = db.expenses.find(x => x.id === b.dataset.rm); if (!ex) return;
      if (isLocked(ex.date)) return toast('هذا المصروف في فترة مقفولة ولا يمكن حذفه');
      if (ex.advId && db.adv.some(a => a.id === ex.advId)) return toast('هذا المصروف سلفة موظف — احذفها من كشف الموظف');
      if (ex.payEmp && db.emps.some(e => e.id === ex.payEmp && e.paid && e.paid[ex.payYm] && e.paid[ex.payYm].expId === ex.id)) return toast('هذا المصروف راتب مصروف — ألغِ الصرف من كشف الموظف');
      if (await confirmBox('حذف المصروف', 'سيُحذف هذا المصروف من السجل.')) { db.expenses = db.expenses.filter(x => x.id !== ex.id); logA('exp_del', ex.title, money(ex.amount)); save(); draw(); }
    });
  };
  $('#e-add').onclick = () => {
    const title = $('#e-title').value.trim(), amount = num($('#e-amt').value);
    if (!title) return toast('اكتب بند المصروف');
    if (amount <= 0) return toast('اكتب مبلغاً أكبر من صفر');
    const pm = epm();
    db.expenses.push({ id: uid(), date: new Date().toISOString(), title, amount: round2(amount), note: $('#e-note').value.trim(), cat: $('#e-cat').value, ...(pmIs(pm) ? { pm } : {}) });
    logA('exp_add', title, money(round2(amount)), pmIs(pm) ? CIN_PM[pm] : ''); save(); $('#e-title').value = ''; $('#e-amt').value = ''; $('#e-note').value = ''; pmReset('e-pm'); draw(); toast('تمت الإضافة', 'ok');
  };
  draw();
};

/* 8.45: the running balance of each place (drawer / InstaPay / wallet / bank account): everything that ever came in (collections, deposits, the amounts typed in «داخل», transfers in) minus everything that went out (expenses paid from it, refunds, transfers out, what was handed over to the management). A part can be withdrawn and the rest stays; the settlement hands every balance over and leaves zero. */
const MG_TO = 'الإدارة (صاحب المنشأة)';
/* 8.46: «من» of a withdrawal / transfer can be the management too (it supports the business with money that goes into a place: it comes in like the capital) — from / to names of a record */
const pmFrom = x => x.from === 'mgmt' ? MG_TO : CIN_PM[pmKey(x.from)], pmTo = x => x.to === 'mgmt' ? MG_TO : CIN_PM[pmKey(x.to)];
const placeBal = () => {
  const L = ledger('0000-01-01', '9999-12-31'), a = mixOf(L.inn.concat(L.cin, L.xin)), b = mixOf(L.out.concat(L.tip, L.mg, L.xout)), o = {}; Object.keys(CIN_PM).forEach(k => { o[k] = round2(a[k] - b[k]); });
  const pv = lastCount('9999-12-31'); /* the drawer: once it has been counted, what is really in it (the last count) plus what moved after it, the same way the next day's opening is worked out */
  if (pv) { const t = new Date(pv.date + 'T12:00:00'); t.setDate(t.getDate() + 1); const F = ledger(ymd(t), '9999-12-31'); o.cash = round2(pv.counted + afterCount(pv) + mixOf(F.inn.concat(F.cin, F.xin)).cash - mixOf(F.out.concat(F.tip, F.mg, F.xout)).cash); }
  return o;
};

/* 8.47: the day-by-day statement of the four places: for every day that had a movement — opening + in − out = closing, per place. On a counted day the drawer is set to what was really counted (the gap shows as «فرق الجرد»), the same rule the drawer card follows. */
const placeDays = () => {
  const L = ledger('0000-01-01', '9999-12-31'), days = {}, put = (a, f) => a.forEach(e => { const d = ymd(e.d), k = pmKey(e.m), t = (days[d] = days[d] || {})[k] = (days[d] || {})[k] || { i: 0, o: 0 }; t[f] = round2(t[f] + e.a); });
  put(L.inn.concat(L.cin, L.xin), 'i'); put(L.out.concat(L.tip, L.mg, L.xout), 'o'); db.closings.forEach(c => { days[c.date] = days[c.date] || {}; });
  const bal = { cash: 0, insta: 0, wallet: 0, bank: 0 }, rows = [];
  Object.keys(days).sort().forEach(d => { const cl = db.closings.find(c => c.date === d);
    Object.keys(CIN_PM).forEach(k => { const t = days[d][k] || { i: 0, o: 0 }, open = bal[k]; let close = round2(open + t.i - t.o), adj = 0;
      if (k === 'cash' && cl) { const real = round2(cl.counted + afterCount(cl)); adj = round2(real - close); close = real; }
      bal[k] = close; if (t.i || t.o || adj) rows.push({ d, k, open, i: t.i, o: t.o, adj, close }); }); });
  return rows;
};

screens.cashIn = (p, v) => {
  const today = ymd(new Date());
  v.innerHTML = subHead(CIN_T) + `<div class="stack">
  <section class="panel"><h2 class="panel-t">الرصيد حسب المكان</h2>
    <p class="lbl" style="margin:0 0 12px">رصيد كل مكان تراكمي: كل ما دخل فيه (تحصيلات، إيداعات، مبالغ مسجلة هنا، تحويلات) ناقص كل ما خرج منه (مصروفات، تحويلات، تسليم للإدارة). تقدر تسحب جزء وتسيب الباقي زي ما هو. رصيد الدرج بعد أي جرد بيبدأ من آخر جرد (الفعلي في الدرج). اضغط على أي كارت لمعرفة مصدر الفلوس في اليوم المختار.</p>
    <div class="stats ci-cards" id="ci-cards"></div>
    <div class="form-grid" style="margin:14px 0 0"><div class="field" style="max-width:260px"><label for="ci-d">اليوم</label><input id="ci-d" class="inp" type="date" value="${today}" max="${today}"></div></div>
    <div id="ci-det" style="margin-top:14px"></div></section>
  <section class="panel"><h2 class="panel-t">كشف الأماكن اليومي</h2>
    <p class="lbl" style="margin:0 0 12px">رصيد كل مكان يوم بيوم: رصيد أول اليوم + الداخل − الخارج = رصيد آخر اليوم. والدرج بعد أي جرد بيتظبط على الفعلي (الفرق في خانة «فرق الجرد»). اختار من تاريخ لتاريخ واطبع أو صدّر.</p>
    <div class="form-grid"><div class="field" style="max-width:220px"><label for="pl-f">من تاريخ</label><input id="pl-f" class="inp" type="date" value="${today.slice(0, 8)}01" max="${today}"></div>
      <div class="field" style="max-width:220px"><label for="pl-t">إلى تاريخ</label><input id="pl-t" class="inp" type="date" value="${today}" max="${today}"></div></div>
    <div class="actions docbar noprint" id="pl-doc" style="margin:14px 0"></div>
    <div class="tbl-wrap"><table class="grid"><colgroup><col style="width:15%"><col style="width:17%"><col style="width:15%"><col style="width:13%"><col style="width:13%"><col style="width:12%"><col style="width:15%"></colgroup>
    <thead><tr><th>التاريخ</th><th>المكان</th><th>رصيد أول اليوم</th><th>داخل</th><th>خارج</th><th>فرق الجرد</th><th>رصيد آخر اليوم</th></tr></thead><tbody id="pl-rows"></tbody></table></div></section>
  <section class="panel"><h2 class="panel-t">تسجيل مبلغ داخل</h2>
    <p class="lbl" style="margin:0 0 12px">مبلغ دخل وهو ليس بيعاً ولا تحصيلاً. «المصدر»: من الدرج أو من الخزينة أو رأس المال أو من البنك. «دخل في»: الدرج (نقدي) أو إنستا باي أو محفظة أو حساب بنكي. يزيد رصيد المكان ويظهر في قسم مستقل في حركة اليوم والتقارير، ولا يدخل في المبيعات ولا الأرباح. وتقدر تصرف منه من «المصروفات» (يُدفع من).</p>
    <div class="form-grid">
      <div class="field"><label for="ci-src">المصدر</label><div class="sel"><select id="ci-src">${Object.entries(CIN).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></div></div>
      <div class="field"><label for="ci-amt">المبلغ (جنيه)</label><input id="ci-amt" class="inp" inputmode="decimal" placeholder="0" autocomplete="off"></div>
      <div class="field"><label for="ci-note">ملاحظة (الغرض منه)</label><input id="ci-note" class="inp" maxlength="120" autocomplete="off"></div>
      <div style="grid-column:1/-1">${pmBtns('ci-pm', 'دخل في')}</div>
      <div><button class="btn" id="ci-add" type="button">${ICON.plus}<span>إضافة</span></button></div>
    </div></section>
  <section class="panel"><h2 class="panel-t">سحب أو تحويل</h2>
    <p class="lbl" style="margin:0 0 12px">لو الإدارة دعمتك بمبلغ: اختار «من» الإدارة و«إلى» الدرج (نقدي) أو إنستا باي أو المحفظة أو الحساب البنكي، واكتب الغرض بالظبط (هتشتري بيه إيه، هتحوله لإيه، هتطلعه لإيه) — بيدخل زي رأس المال في «داخل». أو اسحب جزء من رصيد إنستا باي / المحفظة / الحساب البنكي وسيب الباقي زي ما هو، أو حوّل بين الأماكن، أو سلّم للإدارة (صاحب المنشأة). التحويل بين الأماكن مش مصروف ولا ربح، وبيتسجل في حركة اليوم وجرد الدرج.</p>
    <div class="form-grid">
      <div class="field"><label for="pm-from">من</label><div class="sel"><select id="pm-from"><option value="mgmt">${MG_TO}</option>${['insta', 'wallet', 'bank'].map(k => `<option value="${k}">${CIN_PM[k]}</option>`).join('')}</select></div></div>
      <div class="field"><label for="pm-to">إلى</label><div class="sel"><select id="pm-to"></select></div></div>
      <div class="field"><label for="pm-amt">المبلغ (جنيه)</label><input id="pm-amt" class="inp" inputmode="decimal" placeholder="0" autocomplete="off"></div>
      <div class="field"><label for="pm-who">المستلم / المُسلِّم</label><input id="pm-who" class="inp" maxlength="60" autocomplete="off"></div>
      <div class="field" style="grid-column:1/-1"><label for="pm-note">الغرض (هتشتري بيه إيه / هتحوله لإيه / هتطلعه لإيه)</label><input id="pm-note" class="inp" maxlength="120" autocomplete="off"></div>
      <div class="lbl" style="grid-column:1/-1;margin:0" id="pm-avr"><span>المتاح في المكان المختار:</span> <b id="pm-av"></b></div>
      <div style="grid-column:1/-1;display:flex;gap:10px;flex-wrap:wrap"><button class="btn" id="pm-go" type="button">${ICON.plus}<span>تنفيذ</span></button><button class="btn outline" id="pm-all" type="button">الرصيد كله</button></div>
    </div></section>
  <section class="panel"><h2 class="panel-t">تصفية كل الأرصدة وتسليمها للإدارة</h2>
    <p class="lbl" style="margin:0 0 12px">لما الموظف أو المحاسب يسلّم: بيخرج كل الأرصدة (الدرج، إنستا باي، المحفظة، الحساب البنكي) لصاحب المنشأة أو الإدارة وتبقى كل الأماكن صفر. بيتسجل تسليم لكل مكان فيه رصيد، ويظهر في حركة اليوم والتقارير وجرد الدرج.</p>
    <div class="stats" id="st-tot" style="margin-bottom:14px"></div>
    <div class="form-grid">
      <div class="field"><label for="st-who">المستلم (صاحب المنشأة / الإدارة)</label><input id="st-who" class="inp" maxlength="60" autocomplete="off"></div>
      <div class="field"><label for="st-note">ملاحظة</label><input id="st-note" class="inp" maxlength="120" autocomplete="off"></div>
      <div><button class="btn danger" id="st-go" type="button">تصفية وتسليم الكل</button></div>
    </div></section>
  <section class="panel"><h2 class="panel-t">سجل السحب والتحويل والتسليم</h2>
    ${db.pmoves.length ? docBar('pmv', '', true) : ''}
    <div class="tbl-wrap"><table class="grid"><colgroup><col style="width:21%"><col style="width:17%"><col style="width:19%"><col style="width:14%"><col style="width:21%"><col style="width:8%"></colgroup>
    <thead><tr><th>التاريخ</th><th>من</th><th>إلى</th><th>المبلغ</th><th>المستلم / ملاحظة</th><th>حذف</th></tr></thead><tbody id="pm-rows"></tbody></table></div></section>
  <section class="panel"><div class="stats" id="ci-stats" style="margin-bottom:16px"></div>
    ${db.cashin.length ? docBar('cin', '', true) : ''}
    <div class="tbl-wrap"><table class="grid"><colgroup><col style="width:22%"><col style="width:22%"><col style="width:16%"><col style="width:32%"><col style="width:8%"></colgroup>
    <thead><tr><th>التاريخ</th><th>المصدر</th><th>المبلغ</th><th>ملاحظة</th><th>حذف</th></tr></thead><tbody id="ci-rows"></tbody></table></div></section></div>`;
  $('#ci-amt').addEventListener('input', e => { e.target.value = cleanNum(e.target.value); });
  $('#pm-amt').addEventListener('input', e => { e.target.value = cleanNum(e.target.value); });
  const cpm = pmBtnsWire(v, 'ci-pm'); let sel = '';
  const tm = d => new Date(d).toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' });
  /* the cards: the balance of each place now, and what moved in it on the chosen day; the details of the pressed card list who the money came from (collections, deposits, what was typed in) and where it went */
  const cards = () => {
    const d = $('#ci-d').value || today, L = ledger(d, d), IN = L.inn.concat(L.cin, L.xin), OUT = L.out.concat(L.tip, L.mg, L.xout), at = (a, k) => a.filter(e => pmKey(e.m) === k), bal = placeBal();
    $('#ci-cards').innerHTML = Object.entries(CIN_PM).map(([k, n]) => { const i = sumA(at(IN, k)), o = sumA(at(OUT, k)); return `<button type="button" class="stat ci-c${bal[k] > 0 ? ' pos' : ''}${bal[k] < 0 ? ' neg' : ''}${sel === k ? ' on' : ''}" data-k="${k}" aria-pressed="${sel === k}"><span>${n}</span><b>${money(bal[k])}</b><small class="ci-o"><span class="ci-l">اليوم</span>${i > 0 ? `<em class="ci-g">+ ${fmt(i)}</em>` : ''}${o > 0 ? `<em class="ci-r">− ${fmt(o)}</em>` : ''}${i > 0 || o > 0 ? '' : '<em>0</em>'}</small></button>`; }).join('') + `<div class="stat ci-t"><span>إجمالي الأرصدة</span><b>${money(round2(Object.values(bal).reduce((s, x) => s + x, 0)))}</b></div>`;
    $$('.ci-c', v).forEach(b => b.onclick = () => { sel = sel === b.dataset.k ? '' : b.dataset.k; cards(); });
    const el = $('#ci-det');
    if (!sel) { el.innerHTML = '<p class="lbl" style="margin:0">اضغط على أي كارت لمعرفة مصدر المبلغ الداخل.</p>'; return; }
    const ins = at(IN, sel).sort((a, b) => a.d.localeCompare(b.d)), outs = at(OUT, sel).sort((a, b) => a.d.localeCompare(b.d)), iT = sumA(ins), oT = sumA(outs);
    el.innerHTML = `<h3 class="panel-t" style="font-size:16px">تفاصيل الداخل في ${CIN_PM[sel]}</h3><div class="tbl-wrap"><table class="grid"><colgroup><col style="width:20%"><col style="width:56%"><col style="width:24%"></colgroup>
      <thead><tr><th>الوقت</th><th>البيان</th><th>المبلغ</th></tr></thead><tbody>${ins.map(m => `<tr><td class="muted">${tm(m.d)}</td><td>${esc(m.w)}</td><td style="color:var(--green);font-weight:800">+ ${fmt(m.a)}</td></tr>`).join('') || `<tr><td colspan="3" class="empty">لا توجد فلوس داخلة في هذا المكان في هذا اليوم.</td></tr>`}
      ${outs.length ? `<tr><td colspan="3" class="muted" style="font-weight:800">خرج منه</td></tr>` + outs.map(m => `<tr><td class="muted">${tm(m.d)}</td><td>${esc(m.w)}</td><td style="color:var(--red-t);font-weight:800">− ${fmt(m.a)}</td></tr>`).join('') : ''}</tbody>
      <tfoot><tr><td colspan="2" style="font-weight:800">إجمالي الداخل</td><td style="color:var(--green);font-weight:800">${fmt(iT)}</td></tr>${outs.length ? `<tr><td colspan="2" style="font-weight:800">إجمالي الخارج</td><td style="color:var(--red-t);font-weight:800">${fmt(oT)}</td></tr><tr><td colspan="2" style="font-weight:800">الباقي</td><td style="font-weight:800">${fmt(round2(iT - oT))}</td></tr>` : ''}<tr><td colspan="2" style="font-weight:800">الرصيد الآن</td><td style="font-weight:800">${fmt(bal[sel])}</td></tr></tfoot></table></div>`;
  };
  $('#ci-d').addEventListener('change', cards);
  /* «إلى»: the four places when the money comes from the management; the management + the other places when it comes from a place */
  const fillTo = () => { const f = $('#pm-from').value, keep = $('#pm-to').value, opts = (f === 'mgmt' ? [] : [['mgmt', MG_TO]]).concat(Object.entries(CIN_PM).filter(([k]) => k !== f)); $('#pm-to').innerHTML = opts.map(([k, n]) => `<option value="${k}">${n}</option>`).join(''); if (opts.some(o => o[0] === keep)) $('#pm-to').value = keep; };
  const avail = () => { const f = $('#pm-from').value, own = f !== 'mgmt'; $('#pm-avr').style.display = own ? '' : 'none'; $('#pm-all').style.display = own ? '' : 'none'; if (own) $('#pm-av').textContent = money(placeBal()[f]); };
  $('#pm-from').addEventListener('change', () => { fillTo(); avail(); });
  fillTo();
  $('#pm-all').onclick = () => { const b = placeBal()[$('#pm-from').value]; $('#pm-amt').value = b > 0 ? String(b) : ''; if (b <= 0) toast('لا يوجد رصيد في هذا المكان'); };
  const settleBox = () => {
    const bal = placeBal(), tot = round2(Object.values(bal).reduce((s, x) => s + Math.max(x, 0), 0));
    $('#st-tot').innerHTML = `<div class="stat${tot > 0 ? ' pos' : ''}"><span>إجمالي ما سيُسلَّم للإدارة</span><b>${money(tot)}</b></div>`;
  };
  const drawMv = () => {
    $('#pm-rows').innerHTML = db.pmoves.slice().sort((a, b) => b.date.localeCompare(a.date)).map(x => `<tr><td class="muted">${dateTimeAr(x.date)}</td><td><span class="pill ${x.from === 'mgmt' ? 'ok' : 'info'}">${pmFrom(x)}</span></td><td><span class="pill ${x.to === 'mgmt' ? 'ok' : 'info'}">${pmTo(x)}</span></td><td class="val">${fmt(x.amount)}</td><td class="muted">${esc([x.who, x.note].filter(Boolean).join(' — '))}</td>
      <td><button class="del" data-rmv="${x.id}" aria-label="حذف">${ICON.trash}</button></td></tr>`).join('') || `<tr><td colspan="6" class="empty">لا توجد سحوبات أو تحويلات مسجلة.</td></tr>`;
    $$('[data-rmv]', v).forEach(b => b.onclick = async () => {
      const x = db.pmoves.find(r => r.id === b.dataset.rmv); if (!x) return;
      if (isLocked(x.date)) return toast('هذا السحب في فترة مقفولة ولا يمكن حذفه');
      if (await confirmBox('حذف السحب / التحويل', 'سيُحذف من السجل ويرجع رصيد المكان كما كان.')) { db.pmoves = db.pmoves.filter(r => r.id !== x.id); logA('pm_del', pmFrom(x), pmTo(x), money(x.amount)); save(); all(); }
    });
  };
  const draw = () => {
    const now = new Date(), isMonth = x => { const d = new Date(x.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); };
    const sum = a => round2(a.reduce((s, x) => s + x.amount, 0)), td = db.cashin.filter(x => sameDay(x.date));
    $('#ci-stats').innerHTML = `<div class="stat pos"><span>داخل اليوم</span><b>${money(sum(td))}</b></div>` +
      Object.keys(CIN).filter(k => sum(td.filter(x => x.src === k)) > 0).map(k => `<div class="stat"><span>${CIN_DAY[k]}</span><b>${money(sum(td.filter(x => x.src === k)))}</b></div>`).join('') +
      `<div class="stat"><span>داخل الشهر</span><b>${money(sum(db.cashin.filter(isMonth)))}</b></div>`;
    $('#ci-rows').innerHTML = db.cashin.slice().sort((a, b) => b.date.localeCompare(a.date)).map(x => `<tr><td class="muted">${dateTimeAr(x.date)}</td><td><span class="pill info">${CIN[x.src] || CIN.drawer}</span>${pmBadge(x.pm)}</td><td class="val">${fmt(x.amount)}</td><td class="muted">${esc(x.note)}</td>
      <td><button class="del" data-rm="${x.id}" aria-label="حذف">${ICON.trash}</button></td></tr>`).join('') || `<tr><td colspan="5" class="empty">لا توجد مبالغ داخلة مسجلة.</td></tr>`;
    $$('[data-rm]', v).forEach(b => b.onclick = async () => {
      const x = db.cashin.find(r => r.id === b.dataset.rm); if (!x) return;
      if (isLocked(x.date)) return toast('هذا المبلغ في فترة مقفولة ولا يمكن حذفه');
      if (await confirmBox('حذف المبلغ', 'سيُحذف هذا المبلغ من السجل ومن نقدية اليوم.')) { db.cashin = db.cashin.filter(r => r.id !== x.id); logA('cin_del', CIN[x.src] || CIN.drawer, money(x.amount)); save(); all(); }
    });
  };
  /* the daily statement: the same rows the paper and the Excel file are made from */
  const plDraw = () => {
    const f = $('#pl-f').value, t = $('#pl-t').value, R = placeDays().filter(r => (!f || r.d >= f) && (!t || r.d <= t)), z = n => n ? fmt(n) : '';
    $('#pl-doc').innerHTML = window.claude ? '' : docBtns('plc', (f || '') + '|' + (t || ''));
    $('#pl-rows').innerHTML = R.map(r => `<tr><td class="muted"><bdi dir="ltr">${r.d}</bdi></td><td><span class="pill info">${CIN_PM[r.k]}</span></td><td>${fmt(r.open)}</td><td style="color:var(--green);font-weight:800">${z(r.i)}</td><td style="color:var(--red-t);font-weight:800">${z(r.o)}</td><td>${r.adj ? `<bdi dir="ltr">${r.adj > 0 ? '+ ' : '− '}${fmt(Math.abs(r.adj))}</bdi>` : ''}</td><td class="val">${fmt(r.close)}</td></tr>`).join('') || `<tr><td colspan="7" class="empty">لا توجد حركة في هذه الفترة.</td></tr>`;
  };
  $('#pl-f').addEventListener('change', plDraw); $('#pl-t').addEventListener('change', plDraw);
  const all = () => { draw(); drawMv(); cards(); avail(); settleBox(); plDraw(); };
  $('#ci-add').onclick = () => {
    const amount = num($('#ci-amt').value), src = $('#ci-src').value, pm = cpm();
    if (!CIN[src]) return toast('اختر المصدر');
    if (amount <= 0) return toast('اكتب مبلغاً أكبر من صفر');
    db.cashin.push({ id: uid(), date: new Date().toISOString(), src, amount: round2(amount), note: $('#ci-note').value.trim(), by: CUR_USER ? CUR_USER.name : '', ...(pmIs(pm) ? { pm } : {}) });
    logA('cin_add', CIN[src], money(round2(amount)), pmIs(pm) ? CIN_PM[pm] : '', $('#ci-note').value.trim()); save(); $('#ci-amt').value = ''; $('#ci-note').value = ''; pmReset('ci-pm'); $('#ci-d').value = today; all(); toast('تمت الإضافة', 'ok');
  };
  /* a withdrawal or a transfer: part of a balance goes to the management or to another place, the rest stays where it is */
  $('#pm-go').onclick = async () => {
    const from = $('#pm-from').value, to = $('#pm-to').value, amount = round2(num($('#pm-amt').value)), bal = placeBal();
    if ((from !== 'mgmt' && !CIN_PM[from]) || (to !== 'mgmt' && !CIN_PM[to])) return toast('اختر المكان');
    if (to === from) return toast('اختر مكانين مختلفين');
    if (amount <= 0) return toast('اكتب مبلغاً أكبر من صفر');
    if (from === 'mgmt' && !$('#pm-note').value.trim()) return toast('اكتب الغرض من المبلغ'); /* the management's support must say what it is for */
    if (from !== 'mgmt' && amount > bal[from] + 0.005 && !(await confirmBox('المبلغ أكبر من الرصيد', 'المبلغ المكتوب أكبر من رصيد هذا المكان، وهيبقى الرصيد بالسالب. تكمل؟', 'تكمل', false))) return;
    const who = $('#pm-who').value.trim(), note = $('#pm-note').value.trim();
    db.pmoves.push({ id: uid(), date: new Date().toISOString(), from, to, amount, who, note, by: CUR_USER ? CUR_USER.name : '' });
    logA('pm_add', pmFrom({ from }), pmTo({ to }), money(amount), who, note); save();
    $('#pm-amt').value = ''; $('#pm-who').value = ''; $('#pm-note').value = ''; fillTo(); all(); toast('تم التسجيل', 'ok');
  };
  /* the settlement: every positive balance goes to the management and every place is left at zero */
  $('#st-go').onclick = async () => {
    const bal = placeBal(), ks = Object.keys(CIN_PM).filter(k => bal[k] > 0), tot = round2(ks.reduce((s, k) => s + bal[k], 0));
    if (!ks.length) return toast('لا يوجد رصيد لتسليمه');
    const who = $('#st-who').value.trim(); if (!who) return toast('اكتب اسم المستلم');
    if (!(await confirmBox('تصفية الأرصدة', 'سيُسلَّم كل الرصيد الموجود في الدرج وإنستا باي والمحفظة والحساب البنكي للإدارة، وتبقى كل الأماكن صفر.', 'تسليم الكل', false))) return;
    const now = new Date().toISOString(), note = $('#st-note').value.trim(), grp = uid();
    ks.forEach(k => db.pmoves.push({ id: uid(), date: now, from: k, to: 'mgmt', amount: bal[k], who, note, grp, by: CUR_USER ? CUR_USER.name : '' }));
    logA('pm_settle', MG_TO, money(tot), who, note); save();
    $('#st-who').value = ''; $('#st-note').value = ''; all(); toast('تم تسليم الأرصدة للإدارة', 'ok');
  };
  all();
};

screens.suppliers = (p, v) => {
  v.innerHTML = subHead('الموردين') + `<section class="panel">
    <div class="toolbar"><input id="q" class="inp" placeholder="ابحث باسم المورد أو الكود" aria-label="بحث" autocomplete="off"><button class="btn" id="s-add" type="button">${ICON.plus}<span>إضافة مورد</span></button></div>
    <div class="stats" id="s-stats" style="margin-bottom:16px"></div>
    ${db.suppliers.length ? docBar('supp', '', true) : ''}
    <div class="tbl-wrap"><table class="grid w7"><colgroup><col style="width:9%"><col style="width:19%"><col style="width:13%"><col style="width:15%"><col style="width:13%"><col style="width:13%"><col style="width:18%"></colgroup>
    <thead><tr><th>كود المورد</th><th>المورد</th><th>الموبايل</th><th>المشتريات</th><th>المدفوع</th><th>المتبقي له</th><th>إجراء</th></tr></thead><tbody id="rows"></tbody></table></div></section>`;
  const draw = () => {
    const q = $('#q').value.trim(), owed = db.suppliers.reduce((s, x) => s + Math.max(supBal(x.id), 0), 0);
    $('#s-stats').innerHTML = `<div class="stat neg"><span>إجمالي المتبقي للموردين</span><b>${money(owed)}</b></div><div class="stat"><span>عدد الموردين</span><b>${db.suppliers.length}</b></div>`;
    $('#rows').innerHTML = db.suppliers.filter(x => !q || x.name.includes(q) || (x.code || '').includes(cleanCode(q))).map(x => { const b = supBal(x.id); return `<tr><td class="code" dir="ltr"><b>${esc(x.code || '')}</b></td><td>${esc(x.name)}</td><td class="muted">${esc(x.phone)}</td><td class="val">${fmt(supBought(x.id))}</td><td>${fmt(supPaid(x.id))}</td>
      <td>${b > 0 ? `<span class="pill bad">${fmt(b)}</span>` : b < 0 ? `<span class="pill info">مقدّم ${fmt(-b)}</span>` : '<span class="pill ok">مسدّد</span>'}</td>
      <td><div class="actions" style="justify-content:center;gap:6px"><button class="mini" data-pay="${x.id}">دفعة</button><button class="mini" data-st="${x.id}">كشف</button><button class="edit" data-ed="${x.id}" aria-label="تعديل بيانات ${esc(x.name)}">${ICON.edit}</button><button class="del" data-rm="${x.id}" aria-label="حذف ${esc(x.name)}">${ICON.trash}</button></div></td></tr>`; }).join('')
      || `<tr><td colspan="7" class="empty">${db.suppliers.length ? 'لا توجد نتائج' : 'لا يوجد موردين. أضف مورداً أو اختره عند «إضافة بضاعة».'}</td></tr>`;
    $$('[data-pay]', v).forEach(b => b.onclick = () => payModal(b.dataset.pay, draw));
    $$('[data-st]', v).forEach(b => b.onclick = () => go('supDetail', { id: b.dataset.st }));
    $$('[data-ed]', v).forEach(b => b.onclick = () => { const s = supById(b.dataset.ed); if (s) addSupplierModal(draw, s); });
    $$('[data-rm]', v).forEach(b => b.onclick = async () => {
      const s = supById(b.dataset.rm); if (!s) return;
      if (db.purchases.some(x => x.supplierId === s.id) || db.spurch.some(x => x.supplierId === s.id) || db.spay.some(x => x.supplierId === s.id)) return toast('للمورد حركات مسجّلة ولا يمكن حذفه');
      if (await confirmBox('حذف المورد', `سيُحذف «${s.name}» من السجل.`)) { db.suppliers = db.suppliers.filter(x => x.id !== s.id); logA('sup_del', s.name); save(); draw(); toast('تم حذف المورد', 'ok'); }
    });
  };
  $('#q').addEventListener('input', draw);
  $('#s-add').onclick = () => addSupplierModal(draw);
  draw();
};

function payModal(sid, done) {
  const s = supById(sid); if (!s) return;
  const bal = supBal(sid);
  modal(`<h3>دفعة للمورد ${esc(s.name)}</h3><p>${bal > 0 ? `المتبقي له: <b>${money(bal)}</b>` : 'لا يوجد متبقٍّ له حالياً — ستُسجَّل كدفعة مقدّمة.'}</p>
    <div class="field"><label for="m-amt">المبلغ المدفوع (جنيه)</label><input id="m-amt" class="inp" inputmode="decimal" value="${bal > 0 ? bal : ''}" autocomplete="off"></div>
    <div class="field"><label for="m-note">ملاحظة (اختياري)</label><input id="m-note" class="inp" autocomplete="off"></div>
    <div class="actions"><button class="btn" data-ok>تسجيل الدفعة</button><button class="btn ghost" data-no>إلغاء</button></div>`, (d, close) => {
    $('#m-amt').addEventListener('input', e => { e.target.value = cleanNum(e.target.value); });
    $('[data-no]', d).onclick = close;
    $('[data-ok]', d).onclick = () => {
      const a = round2(num($('#m-amt').value)); if (a <= 0) return toast('اكتب مبلغاً أكبر من صفر');
      /* a payment against an outstanding balance is a "settlement"; otherwise it is a plain payment */
      db.spay.push({ id: uid(), supplierId: sid, name: s.name, amount: a, date: new Date().toISOString(), kind: bal > 0 ? 'settle' : 'pay', note: $('#m-note').value.trim() });
      logA('pay_out', s.name, money(a)); save(); close(); done(); toast('تم تسجيل الدفعة', 'ok');
    };
  });
}

/* supplier statement: the same paper as the customer's (printable, PDF) — every purchase (debit) and every payment (credit) with a running balance */
function supLedger(s) {
  const mv = [
    ...db.purchases.filter(x => x.supplierId === s.id).map(x => ({ d: x.date, t: `شراء: ${x.name} (${fmtq(x.qty)})`, debit: x.total, credit: 0, name: x.name, qty: x.qty, unit: '', cost: x.cost != null ? x.cost : (x.qty ? round2(x.total / x.qty) : 0) })),
    ...db.spurch.filter(x => x.supplierId === s.id).map(x => ({ d: x.date, t: `شراء: ${x.name} (${fmtq(x.qty)}${x.unit ? ' ' + x.unit : ''} × ${fmt(x.cost)})`, debit: x.total, credit: 0, name: x.name, qty: x.qty, unit: x.unit || '', cost: x.cost })),
    ...db.spay.filter(x => x.supplierId === s.id).map(x => ({ d: x.date, t: (x.kind === 'settle' ? 'سداد دفعة' : 'دفعة') + supPayNote(x.note), debit: 0, credit: x.amount })),
  ].sort((a, b) => String(a.d).localeCompare(String(b.d)));
  let run = 0; mv.forEach(m => { run = round2(run + m.debit - m.credit); m.bal = run; });
  return mv;
}
/* the note of a payment as the statement shows it: the payment that came with goods typed by hand reads «بضاعة» (+ the supplier's invoice no.), without the word «يدوي» */
const supPayNote = n => { if (!n) return ''; const m = /^بضاعة يدوي\s*(.*)$/.exec(n); return m ? ' — بضاعة' + (m[1] ? ' — ' + m[1] : '') : ' — ' + n; };
function supPaper(s) {
  const mv = supLedger(s), bought = supBought(s.id), paid = supPaid(s.id), bal = supBal(s.id);
  const nBuy = db.purchases.filter(x => x.supplierId === s.id).length + new Set(db.spurch.filter(x => x.supplierId === s.id).map(x => x.bid)).size;
  const ln = (a, b, k = '') => `<div class="l${k ? ' ' + k : ''}"><span>${a}</span><b>${b}</b></div>`;
  /* columns: date, item, quantity, price, total price — a payment takes one line across the middle with its amount (minus) in the total column */
  const rows = mv.map(m => m.credit
    ? `<tr class="sp-pay"><td class="dt"><bdi dir="ltr">${ymd(m.d)}</bdi></td><td class="bn" colspan="3">${esc(m.t)}</td><td class="bl"><bdi dir="ltr">-${fmt(m.credit)}</bdi></td></tr>`
    : `<tr><td class="dt"><bdi dir="ltr">${ymd(m.d)}</bdi></td><td class="bn">${esc(m.name)}</td><td>${fmtq(m.qty)}${m.unit ? ' ' + esc(m.unit) : ''}</td><td>${fmt(m.cost)}</td><td class="bl">${fmt(m.debit)}</td></tr>`).join('') || '<tr><td colspan="5">لا توجد حركة لهذا المورد.</td></tr>';
  return paper(letterhead(letterOf()) + `<div class="rt"><h3>كشف حساب مورد</h3></div>` +
    `<div class="ibox"><span>اسم المورد: <b>${esc(s.name)}</b></span>${s.code ? `<span>الكود: <b><bdi dir="ltr">${esc(s.code)}</bdi></b></span>` : ''}${s.phone ? `<span>الموبايل: <b><bdi dir="ltr">${esc(s.phone)}</bdi></b></span>` : ''}<span>التاريخ: <b><bdi dir="ltr">${ymd(new Date())}</bdi></b></span></div>` +
    `<table class="itbl st sp"><colgroup><col style="width:17%"><col style="width:33%"><col style="width:17%"><col style="width:15%"><col style="width:18%"></colgroup><thead><tr><th>التاريخ</th><th>الصنف</th><th>الكمية</th><th>السعر</th><th>إجمالي السعر</th></tr></thead><tbody>${rows}</tbody></table>` +
    `<div class="isum"><div class="ic">${ln('إجمالي المشتريات:', money(bought))}${ln('إجمالي المدفوع:', money(paid), 'big')}</div><div class="ic">${ln('عدد عمليات الشراء:', fmt(nBuy))}${bal < 0 ? ln('مدفوع مقدّماً للمورد:', money(-bal), 'big') : ln('المتبقي للمورد:', money(bal), 'big')}</div></div>`, 'inv');
}

screens.supDetail = (p, v) => {
  const s = supById(p.id); if (!s) return back();
  const bal = supBal(s.id), canPrint = !window.claude;
  v.innerHTML = subHead('كشف حساب مورد') + `<div class="stack">${supPaper(s)}
    ${bal < 0 ? `<div class="note noprint"><span>للمورد مبلغ مدفوع مقدّماً <b>${money(-bal)}</b> يُخصم من مشترياته القادمة.</span></div>` : ''}
    <div class="actions noprint" style="justify-content:center">
      <button class="btn" id="sd-pay" type="button">دفعة للمورد</button>
      <button class="btn ghost" data-act="go" data-to="suppliers">كل الموردين</button>
      <button class="btn ghost" id="sd-pdf" type="button">${ICON.pdf}<span>تصدير PDF</span></button>
      ${canPrint ? `<button class="btn ghost" id="sd-print" type="button">${ICON.printer}<span>طباعة</span></button><button class="btn ghost" data-exp="supStmt" data-arg="${esc(s.id)}" type="button"><span>تصدير Excel</span></button>` : ''}
    </div></div>`;
  $('#sd-pay').onclick = () => payModal(s.id, () => render());
  docWarm(supPaper(s), 'كشف حساب مورد', s.name);
  $('#sd-pdf').onclick = () => pdfSave(supPaper(s), 'كشف حساب مورد', s.name);
  const pr = $('#sd-print'); if (pr) pr.onclick = () => printRep(('كشف_حساب_مورد_' + s.name + '_' + ymd(new Date())).replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_'));
};

/* ---------- Suppliers section: goods typed by hand at the purchase price ----------
   A separate home tile. Everything here lives in db.spurch / db.spay and the supplier's account; it NEVER touches the warehouses
   (no item, quantity or cost is changed) — the supplier handling inside «المخزن › إضافة بضاعة» stays exactly as it was. */
const spBatches = () => { /* one entry per saving (bid), newest first */
  const m = new Map(); db.spurch.forEach(x => { if (!m.has(x.bid)) m.set(x.bid, { bid: x.bid, supplierId: x.supplierId, date: x.date, ref: x.ref || '', note: x.note || '', lines: [] }); m.get(x.bid).lines.push(x); });
  return [...m.values()].map(b => Object.assign(b, { total: round2(b.lines.reduce((s, x) => s + x.total, 0)) })).sort((a, b) => b.date.localeCompare(a.date));
};

screens.supMenu = (p, v) => {
  const owed = db.suppliers.reduce((s, x) => s + Math.max(supBal(x.id), 0), 0);
  v.innerHTML = subHead('الموردين') + `<div class="stats" style="margin-bottom:16px"><div class="stat neg"><span>إجمالي المتبقي للموردين</span><b>${money(owed)}</b></div><div class="stat"><span>عدد الموردين</span><b>${db.suppliers.length}</b></div></div>
  <div class="menu">
    <button class="opt" style="--ac:var(--orange)" data-act="go" data-to="supGoods">${ICON.addStock}<span>إضافة بضاعة من مورد (يدوي)</span></button>
    <button class="opt" style="--ac:var(--blue)" data-act="go" data-to="suppliers">${ICON.truck}<span>الموردين ودفعاتهم</span></button>
    <button class="opt" style="--ac:var(--teal)" data-act="go" data-to="supLog">${ICON.docs}<span>سجل بضاعة الموردين</span></button>
  </div>`;
};

screens.supGoods = (p, v) => {
  const units = ['طن', 'كيس', 'شكارة', 'متر', 'م³', 'قطعة', 'كجم', 'لتر', 'عبوة'], today = ymd(new Date());
  const names = [...new Set(db.spurch.map(x => x.name))];
  /* edit mode: the same form, filled with an existing entry (p.bid) — quantities, prices, names, date, payment can all be changed */
  const ed = p.bid ? spBatches().find(b => b.bid === p.bid) : null;
  if (p.bid && !ed) return back();
  if (ed && ed.lines.some(x => isLocked(x.date))) { toast('هذه البضاعة في فترة مقفولة ولا يمكن تعديلها'); return back(); }
  const oldPaid = ed ? round2(db.spay.filter(x => x.bid === ed.bid).reduce((t, x) => t + x.amount, 0)) : 0;
  const blank = d => ({ date: d || today, name: '', unit: '', qty: '', cost: '' });
  const rows = ed ? ed.lines.map(x => ({ id: x.id, date: ymd(x.date), iso: x.date, name: x.name, unit: x.unit || '', qty: String(x.qty), cost: String(x.cost) })) : [blank()];
  let paidTouched = !!ed;
  const rowTotal = r => round2(num(r.qty) * num(r.cost)), grand = () => round2(rows.reduce((s, r) => s + rowTotal(r), 0));
  v.innerHTML = subHead(ed ? 'تعديل بضاعة مورد' : 'إضافة بضاعة من مورد') + `<div class="stack">
  <div class="note"><span>${ed ? 'تعديل هذا الإدخال يغيّر حساب المورد فقط، ولا يمس المخزن ولا كمياته.' : 'تُسجَّل البضاعة على حساب المورد بسعر الشراء فقط، ولا تدخل المخزن ولا تغيّر كمياته.'}</span></div>
  <section class="panel"><h2 class="panel-t">بيانات المورد</h2>
    <div class="form-grid">
      <div class="field"><label for="sg-sup">المورد</label><div class="sel"><select id="sg-sup"><option value="">اختر المورد</option>${db.suppliers.map(x => `<option value="${x.id}"${ed && ed.supplierId === x.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}<option value="__new">+ مورد جديد</option></select></div></div>
      <div class="field"><label for="sg-ref">رقم فاتورة المورد (اختياري)</label><input id="sg-ref" class="inp" autocomplete="off" value="${ed ? esc(ed.ref) : ''}"></div>
      <div class="field"><label for="sg-note">ملاحظة (اختياري)</label><input id="sg-note" class="inp" autocomplete="off" value="${ed ? esc(ed.note) : ''}"></div>
    </div></section>
  <section class="panel"><h2 class="panel-t">البضاعة</h2>
    <div class="tbl-wrap"><table class="tbl items-t sg-t">
      <colgroup><col style="width:19%"><col style="width:25%"><col style="width:20%"><col style="width:14%"><col style="width:14%"><col style="width:8%"></colgroup>
      <thead><tr><th>التاريخ</th><th>الصنف</th><th>الكمية</th><th>السعر</th><th>إجمالي السعر</th><th>حذف</th></tr></thead>
      <tbody id="sg-rows"></tbody></table></div>
    <datalist id="sg-names">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist><datalist id="sg-units">${units.map(u => `<option value="${u}">`).join('')}</datalist>
    <button class="add-row" id="sg-add" type="button">+ إضافة بضاعة أخرى</button>
  </section>
  <div class="two">
    <section class="panel"><h2 class="panel-t big">${ICON.coins}<span>الدفع للمورد</span></h2>
      <div class="pay"><div class="field"><label for="sg-paid">المدفوع للمورد الآن (جنيه)</label><div class="iconin"><input id="sg-paid" class="inp" inputmode="decimal" placeholder="0" autocomplete="off"><button class="mini" id="sg-full" type="button">سداد كامل</button></div></div></div>
    </section>
    <section class="panel"><h2 class="panel-t big blue">${ICON.docDollar}<span>ملخص الحساب</span></h2>
      <div class="sum-row"><span>إجمالي البضاعة:</span><b id="sg-s-tot">0 جنيه</b></div>
      <div class="sum-row"><span>المدفوع للمورد:</span><b id="sg-s-paid">0 جنيه</b></div>
      <div class="rem" id="sg-rem"><span>${ICON.history}<i>المتبقي للمورد</i></span><b id="sg-s-rem">0 جنيه</b></div>
    </section>
  </div>
  <div class="submit"><button class="btn lg" id="sg-save" type="button">${ed ? 'حفظ التعديل' : 'حفظ البضاعة'}</button></div>
  </div>`;
  const drawRows = () => {
    $('#sg-rows').innerHTML = rows.map((r, i) => `<tr>
      <td data-l="التاريخ"><input id="sg${i}-date" class="ctr" type="date" data-r="${i}" data-k="date" aria-label="التاريخ" value="${esc(r.date)}" max="${today}"></td>
      <td data-l="الصنف"><input id="sg${i}-name" class="ctr" data-r="${i}" data-k="name" list="sg-names" placeholder="مثال: رمل" aria-label="الصنف" value="${esc(r.name)}" autocomplete="off"></td>
      <td data-l="الكمية"><div class="qu"><input id="sg${i}-qty" class="ctr" data-r="${i}" data-k="qty" inputmode="decimal" placeholder="الكمية" aria-label="الكمية" value="${esc(r.qty)}" autocomplete="off"><input id="sg${i}-unit" class="ctr" data-r="${i}" data-k="unit" list="sg-units" placeholder="الوحدة" aria-label="الوحدة" value="${esc(r.unit)}" autocomplete="off"></div></td>
      <td data-l="السعر"><input id="sg${i}-cost" class="ctr" data-r="${i}" data-k="cost" inputmode="decimal" placeholder="السعر" aria-label="السعر" value="${esc(r.cost)}" autocomplete="off"></td>
      <td class="rt" data-l="إجمالي السعر" id="sg${i}-tot">${fmt(rowTotal(r))}</td>
      <td><button class="del" type="button" data-del-row="${i}" aria-label="حذف الصف">${ICON.trash}</button></td></tr>`).join('');
  };
  const calc = () => {
    const tot = grand(); rows.forEach((r, i) => { const c = $('#sg' + i + '-tot'); if (c) c.textContent = fmt(rowTotal(r)); });
    if (!paidTouched) $('#sg-paid').value = tot || '';
    const paid = round2(num($('#sg-paid').value)), left = round2(tot - paid);
    $('#sg-s-tot').textContent = money(tot); $('#sg-s-paid').textContent = money(paid); $('#sg-s-rem').textContent = money(Math.max(left, 0));
    $('#sg-rem').classList.toggle('clear', left <= 0.004);
  };
  const form = $('.stack', v);
  form.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'sg-paid') { t.value = cleanNum(t.value); paidTouched = true; return calc(); }
    if (t.dataset.r == null) return;
    const k = t.dataset.k; if (k === 'qty' || k === 'cost') t.value = cleanNum(t.value);
    rows[+t.dataset.r][k] = t.value; calc();
  });
  form.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.k === 'date') { rows[+t.dataset.r].date = t.value; return; }
    if (t.id === 'sg-sup' && t.value === '__new') { t.value = ''; return addSupplierModal(s => { t.insertAdjacentHTML('beforeend', `<option value="${s.id}">${esc(s.name)}</option>`); t.value = s.id; }); }
    if (t.dataset.k === 'name') { /* a goods name typed before: bring back its unit and last purchase price */
      const i = +t.dataset.r, r = rows[i], last = db.spurch.slice().reverse().find(x => x.name === t.value.trim());
      if (last) { if (!r.unit) { r.unit = last.unit || ''; $('#sg' + i + '-unit').value = r.unit; } if (!r.cost) { r.cost = String(last.cost); $('#sg' + i + '-cost').value = r.cost; } calc(); }
    }
  });
  form.addEventListener('click', e => {
    const d = e.target.closest('[data-del-row]');
    if (d) { if (rows.length > 1) rows.splice(+d.dataset.delRow, 1); else rows[0] = blank(); drawRows(); calc(); }
  });
  $('#sg-add').onclick = () => { rows.push(blank(rows[rows.length - 1].date)); drawRows(); calc(); const l = $('#sg' + (rows.length - 1) + '-name'); if (l) l.focus(); };
  $('#sg-full').onclick = () => { paidTouched = false; calc(); };
  $('#sg-save').onclick = () => {
    const sid = $('#sg-sup').value, sup = sid && sid !== '__new' ? supById(sid) : null;
    if (!sup) return toast('اختر المورد (أو أضفه من «+ مورد جديد»)');
    const part = rows.filter(r => r.name.trim() || num(r.qty) || num(r.cost));
    if (!part.length) return toast('أضف بضاعة واحدة على الأقل');
    if (part.some(r => !r.name.trim() || num(r.qty) <= 0 || num(r.cost) <= 0)) return toast('اكتب الصنف وكميته وسعره في كل صف');
    part.forEach(r => { if (!r.date) r.date = today; });
    if (part.some(r => r.date > today)) return toast('لا يمكن تسجيل بضاعة بتاريخ لم يأتِ بعد');
    if (part.some(r => isLocked(r.date))) return toast('هذا التاريخ في فترة مقفولة');
    const now = new Date().toISOString(), iso = r => r.iso && r.date === ymd(r.iso) ? r.iso : r.date === today ? now : new Date(r.date + 'T12:00:00').toISOString();
    const date = iso(part[0]); /* the entry's own date (its payment, its place in the log) is its first line's */
    const total = round2(part.reduce((s, r) => s + rowTotal(r), 0)), paid = round2(num($('#sg-paid').value));
    if (paid > total + 0.004) return toast('المدفوع للمورد أكبر من إجمالي البضاعة');
    const bid = ed ? ed.bid : uid(), ref = $('#sg-ref').value.trim(), note = $('#sg-note').value.trim();
    const lines = part.map(r => ({ id: r.id || uid(), bid, supplierId: sup.id, name: r.name.trim(), unit: r.unit.trim(), qty: num(r.qty), cost: num(r.cost), total: rowTotal(r), date: iso(r), ref, note }));
    const payNote = 'بضاعة يدوي' + (ref ? ' ' + ref : '');
    if (ed) { /* replace the entry's lines where they were; keep one payment row tied to it (update it, create it, or drop it when nothing is paid) */
      const at = db.spurch.findIndex(x => x.bid === bid); db.spurch = db.spurch.filter(x => x.bid !== bid); db.spurch.splice(Math.max(0, Math.min(at, db.spurch.length)), 0, ...lines);
      const pr = db.spay.find(x => x.bid === bid); db.spay = db.spay.filter(x => x.bid !== bid || x === pr);
      if (paid > 0) { if (pr) Object.assign(pr, { supplierId: sup.id, name: sup.name, amount: paid, date, note: payNote }); else db.spay.push({ id: uid(), supplierId: sup.id, name: sup.name, amount: paid, date, kind: 'pay', note: payNote, bid }); }
      else db.spay = db.spay.filter(x => x.bid !== bid);
      logA('sup_goods_edit', sup.name, `${lines.length} صنف`, `${money(ed.total)} ← ${money(total)}`); save(); toast('تم حفظ التعديل', 'ok'); return go('supLog', {}, { replace: true });
    }
    db.spurch.push(...lines);
    if (paid > 0) db.spay.push({ id: uid(), supplierId: sup.id, name: sup.name, amount: paid, date, kind: 'pay', note: payNote, bid });
    logA('sup_goods', sup.name, `${lines.length} صنف`, money(total)); save(); toast('تم تسجيل البضاعة على حساب المورد', 'ok'); go('supDetail', { id: sup.id }, { replace: true });
  };
  drawRows(); if (ed) $('#sg-paid').value = oldPaid || ''; calc();
};

screens.supLog = (p, v) => {
  v.innerHTML = subHead('سجل بضاعة الموردين') + `<section class="panel">
    <div class="toolbar"><div class="sel"><select id="sl-sup" aria-label="المورد"><option value="">كل الموردين</option>${db.suppliers.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></div><button class="btn" id="sl-add" type="button">${ICON.plus}<span>إضافة بضاعة</span></button></div>
    <div class="stats" id="sl-stats" style="margin-bottom:16px"></div>
    ${db.spurch.length ? docBar('suppGoods', '', true) : ''}
    <div class="tbl-wrap"><table class="grid cardt"><colgroup><col style="width:18%"><col style="width:18%"><col style="width:34%"><col style="width:14%"><col style="width:8%"><col style="width:8%"></colgroup>
    <thead><tr><th>التاريخ</th><th>المورد</th><th>البضاعة</th><th>الإجمالي</th><th>تعديل</th><th>حذف</th></tr></thead><tbody id="rows"></tbody></table></div></section>`;
  const draw = () => {
    const f = $('#sl-sup').value, list = spBatches().filter(b => !f || b.supplierId === f);
    $('#sl-stats').innerHTML = `<div class="stat"><span>إجمالي بضاعة الموردين (يدوي)</span><b>${money(round2(list.reduce((s, b) => s + b.total, 0)))}</b></div><div class="stat"><span>عدد الإدخالات</span><b>${list.length}</b></div>`;
    $('#rows').innerHTML = list.map(b => `<tr><td class="muted" data-l="التاريخ">${dateTimeAr(b.date)}</td><td data-l="المورد">${esc((supById(b.supplierId) || {}).name || '—')}</td>
      <td class="full" data-l="البضاعة">${b.lines.map(x => `${esc(x.name)} <small class="muted">(${fmtq(x.qty)}${x.unit ? ' ' + esc(x.unit) : ''} × ${fmt(x.cost)})</small>`).join('<br>')}${b.ref ? `<br><small class="muted">${esc(b.ref)}</small>` : ''}</td>
      <td class="val full" data-l="الإجمالي">${fmt(b.total)}</td><td data-l="تعديل"><button class="edit" data-ed="${b.bid}" aria-label="تعديل الإدخال">${ICON.edit}</button></td><td data-l="حذف"><button class="del" data-rm="${b.bid}" aria-label="حذف الإدخال">${ICON.trash}</button></td></tr>`).join('')
      || `<tr><td colspan="6" class="empty">لا توجد بضاعة مسجّلة من الموردين.</td></tr>`;
    $$('[data-ed]', v).forEach(b => b.onclick = () => {
      const e = spBatches().find(x => x.bid === b.dataset.ed); if (!e) return;
      if (isLocked(e.date)) return toast('هذه البضاعة في فترة مقفولة ولا يمكن تعديلها');
      go('supGoods', { bid: e.bid });
    });
    $$('[data-rm]', v).forEach(b => b.onclick = async () => {
      const e = spBatches().find(x => x.bid === b.dataset.rm); if (!e) return;
      if (isLocked(e.date)) return toast('هذه البضاعة في فترة مقفولة ولا يمكن حذفها');
      if (await confirmBox('حذف البضاعة', 'سيُحذف هذا الإدخال من حساب المورد، وتُحذف معه الدفعة المسجّلة وقت الإدخال إن وُجدت.')) {
        db.spurch = db.spurch.filter(x => x.bid !== e.bid); db.spay = db.spay.filter(x => x.bid !== e.bid);
        logA('sup_goods_del', (supById(e.supplierId) || {}).name, money(e.total)); save(); draw(); toast('تم حذف البضاعة', 'ok');
      }
    });
  };
  $('#sl-sup').addEventListener('change', draw); $('#sl-add').onclick = () => go('supGoods');
  draw();
};
