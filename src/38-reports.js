/* ---------- Reports: today's movement, detailed report, shift closing (modelled on the printed reports) ---------- */
const custName = id => (db.customers.find(c => c.id === id) || {}).name || 'عميل';
const sumA = a => round2(a.reduce((s, x) => s + x.a, 0));

/* every money movement between two local dates (YYYY-MM-DD, inclusive), split into the report sections */
function ledger(from, to) {
  const inR = d => { const k = ymd(d); return k >= from && k <= to; };
  const L = { cin: [], inn: [], out: [], tip: [], mg: [], xin: [], xout: [], vat: [], gain: [], loss: [] }; /* cin = money put into the drawer from the drawer / the safe / the capital (8.43): its own section, apart from the collections.
     mg = what was handed over to the management (the owner) and xin / xout = moved from one place to another (8.45): xin / xout are not a gain or a loss, they only move the balance of a place and the cash count */
  const P = (arr, d, w, a, m) => { if (a > 0) arr.push({ d, w, a: round2(a), ...(pmIs(m) ? { m } : {}) }); }; /* m = the method when the money did not go into the drawer (bank / InstaPay / wallet) */
  const PN = (arr, d, w, a) => { if (a) arr.push({ d, w, a: round2(a) }); }; /* may be negative: a reversal of an earlier entry */
  const prof = (d, w, pr) => { if (pr > 0) P(L.gain, d, 'ربح من: ' + w, pr); else if (pr < 0) P(L.loss, d, 'خسارة في: ' + w, -pr); };
  const unprof = (d, w, pr) => { if (pr > 0) P(L.loss, d, 'عكس ربح: ' + w, pr); else if (pr < 0) P(L.gain, d, 'عكس خسارة: ' + w, -pr); };
  db.invoices.filter(i => inR(i.date)).forEach(i => {
    const nc = invCash(i).filter(c => !c.over && c.a > 0 && pmIs(c.pm)); let ncLeft = i.paid; /* the part of what he paid that came by bank / InstaPay / wallet */
    nc.forEach(c => { const a = Math.min(c.a, ncLeft); ncLeft = round2(ncLeft - a); P(L.inn, i.date, 'فاتورة العميل: ' + i.name, a, c.pm); });
    P(L.inn, i.date, 'فاتورة العميل: ' + i.name, ncLeft);
    if (i.vatOn) P(L.vat, i.date, 'قيمة مضافة: ' + i.name, i.vatAmt);
    prof(i.date, i.name, invProfit(i)); /* recognised on the invoice total, whatever part was paid in cash */
  });
  db.invoices.filter(i => i.status === 'void' && i.void && inR(i.void.at)).forEach(i => { /* a cancelled invoice is reversed on the day it was cancelled */
    const w = 'إلغاء فاتورة ' + i.no + ': ' + i.name;
    let pl = i.paid; invCash(i).filter(c => !c.over && c.a > 0 && pmIs(c.pm)).forEach(c => { const a = Math.min(c.a, pl); pl = round2(pl - a); P(L.out, i.void.at, w, a, c.pm); }); P(L.out, i.void.at, w, pl); /* it goes back the way it came: a bank payment is not paid back from the drawer */
    const wc = 'رد التحصيلات اللاحقة — إلغاء فاتورة ' + i.no + ': ' + i.name; let cl = i.void.coll || 0; /* the instalments he paid after issue go back to him */
    invPays(i).filter(x => pmIs(x.pm)).forEach(x => { const a = Math.min(x.a, cl); cl = round2(cl - a); P(L.out, i.void.at, wc, a, x.pm); }); P(L.out, i.void.at, wc, cl);
    if (i.vatOn) PN(L.vat, i.void.at, 'قيمة مضافة ملغاة: ' + i.name, -i.vatAmt);
    unprof(i.void.at, w, invProfit(i));
  });
  db.returns.filter(r => inR(r.date)).forEach(r => { /* a return: cash given back, VAT and profit taken back */
    const w = 'مرتجع ' + r.no + ' — فاتورة ' + r.invNo + ': ' + r.name;
    P(L.out, r.date, 'مرتجع مبيعات — فاتورة ' + r.invNo + ': ' + r.name, r.refund);
    if (r.vatAmt) PN(L.vat, r.date, 'قيمة مضافة مرتجعة: ' + r.name, -r.vatAmt);
    unprof(r.date, w, round2(r.subtotal - r.discAmt - r.cost));
  });
  db.payments.filter(x => inR(x.date)).forEach(x => P(L.inn, x.date, 'تحصيل من العميل: ' + custName(x.customerId) + ((x.alloc || []).length ? ' (فاتورة ' + x.alloc.map(a => a.no).join('، ') + ')' : ''), x.amount, x.pm));
  db.bookings.forEach(b => {
    if (inR(b.date) && !b.xfer) P(L.inn, b.date, 'إيداع حجز - ' + b.desc, b.amount, b.pm); /* a balance moved to another place (xfer) is money already counted when it came in */
    b.refunds.filter(r => inR(r.date)).forEach(r => P(L.out, r.date, 'رد حجز - ' + b.desc + ': ' + b.name, r.a));
  });
  db.expenses.filter(e => inR(e.date)).forEach(e => P(e.cat === 'tip' ? L.tip : L.out, e.date, e.title, e.amount, e.pm)); /* e.pm: paid from InstaPay / wallet / the bank instead of the drawer */
  db.cashin.filter(x => inR(x.date)).forEach(x => P(L.cin, x.date, cinWhat(x), x.amount, x.pm));
  db.pmoves.filter(x => inR(x.date)).forEach(x => {
    const nt = x.note ? ' — ' + x.note : '';
    if (x.from === 'mgmt') P(L.cin, x.date, 'دعم من الإدارة' + (x.who ? ' — المُسلِّم: ' + x.who : '') + nt, x.amount, x.to); /* the management supports the business: the money comes into a place like the capital (8.46) */
    else if (x.to === 'mgmt') P(L.mg, x.date, 'تسليم للإدارة من ' + CIN_PM[pmKey(x.from)] + (x.who ? ' — المستلم: ' + x.who : '') + nt, x.amount, x.from);
    else { P(L.xout, x.date, 'تحويل إلى ' + CIN_PM[pmKey(x.to)] + nt, x.amount, x.from); P(L.xin, x.date, 'تحويل من ' + CIN_PM[pmKey(x.from)] + nt, x.amount, x.to); }
  });
  db.spay.filter(x => inR(x.date)).forEach(x => P(L.out, x.date, (x.kind === 'settle' ? 'سداد دفعة للمورد: ' : 'دفعة لمورد: ') + ((supById(x.supplierId) || {}).name || x.name), x.amount));
  Object.values(L).forEach(a => a.sort((p, q) => p.d.localeCompare(q.d)));
  return L;
}

/* ----- menu ----- */
screens.reports = (p, v) => {
  v.innerHTML = subHead('التقارير وحركة اليوم') + `<div class="menu">
    <button class="opt" style="--ac:var(--teal)" data-act="go" data-to="cashIn">${ICON.cashin}<span>${CIN_T}</span></button>
    <button class="opt" style="--ac:var(--green)" data-act="go" data-to="repDaily">${ICON.reports}<span>اليومية (داخل / خارج / متبقي)</span></button>
    <button class="opt" style="--ac:var(--purple)" data-act="go" data-to="repToday">${ICON.repDetail}<span>حركة اليوم التفصيلية</span></button>
    <button class="opt" style="--ac:var(--blue)" data-act="go" data-to="repDetail">${ICON.repDetail}<span>تقرير تفصيلي للحركة</span></button>
    <button class="opt" style="--ac:var(--amber)" data-act="go" data-to="repShift">${ICON.shift}<span>تقفيل وردية</span></button>
    <button class="opt" style="--ac:var(--green)" data-act="go" data-to="cashClose">${ICON.cashbox}<span>جرد الخزينة والإقفال</span></button>
    <button class="opt" style="--ac:var(--green)" data-act="go" data-to="vchIn">${ICON.vin}<span>إيصال استلام نقدية من عميل</span></button>
    <button class="opt" style="--ac:var(--amber)" data-act="go" data-to="vchOut">${ICON.vout}<span>إيصال استلام نقدية من المكتب للعميل</span></button>
    <button class="opt" style="--ac:var(--sky)" data-act="go" data-to="repMonth">${ICON.income}<span>قائمة الدخل الشهرية</span></button>
    <button class="opt" style="--ac:var(--purple)" data-act="go" data-to="retList">${ICON.ret}<span>مرتجعات المبيعات</span></button>
    <button class="opt" style="--ac:var(--teal)" data-act="go" data-to="receipts">${ICON.rcpt}<span>صور وإشعارات العملاء</span></button>
    ${taxOn() ? `<button class="opt" style="--ac:var(--teal)" data-act="go" data-to="repVat">${ICON.tax}<span>تقرير القيمة المضافة</span></button>` : ''}
  </div>`;
};

/* ----- اليومية: داخل / خارج / متبقي لكل مكان ----- */
screens.repDaily = (p, v) => {
  const today = ymd(new Date());
  v.innerHTML = subHead('اليومية') + `<div class="stack">
  <section class="panel">
    <h2 class="panel-t big">اليومية — ${dateAr()}</h2>
    <p class="lbl" style="margin:0 0 14px">ملخص بسيط: كل ما دخل في كل مكان، وكل ما خرج منه، والمتبقي. بدون تفاصيل.</p>
    <div id="rd-tbl"></div>
    <div id="rd-total" style="margin-top:16px"></div>
    <div class="actions noprint" style="margin-top:14px" id="rd-doc"></div>
  </section></div>`;

  const draw = () => {
    const t = today, L = ledger(t, t);
    const IN  = L.inn.concat(L.cin, L.xin);
    const OUT = L.out.concat(L.tip, L.mg, L.xout);
    const bal = placeBal();
    const pmK = k => IN.filter(e => pmKey(e.m) === k).reduce((s, e) => s + e.a, 0);
    const pmO = k => OUT.filter(e => pmKey(e.m) === k).reduce((s, e) => s + e.a, 0);
    /* table: one row per place */
    const rows = Object.entries(CIN_PM).map(([k, name]) => {
      const inn = pmK(k), out = pmO(k), left = round2(inn - out);
      return `<tr>
        <td style="font-weight:700">${name}</td>
        <td style="color:var(--green);font-weight:800;text-align:left" dir="ltr">+ ${fmt(inn)}</td>
        <td style="color:var(--red-t);font-weight:800;text-align:left" dir="ltr">− ${fmt(out)}</td>
        <td style="font-weight:800;text-align:left;color:${left >= 0 ? 'var(--green)' : 'var(--red-t)'};" dir="ltr">${fmt(left)}</td>
        <td style="color:var(--blue-t);font-weight:700;text-align:left" dir="ltr">${fmt(bal[k])}</td>
      </tr>`;
    });
    const totIn  = round2(Object.keys(CIN_PM).reduce((s, k) => s + pmK(k), 0));
    const totOut = round2(Object.keys(CIN_PM).reduce((s, k) => s + pmO(k), 0));
    const totLeft= round2(totIn - totOut);
    const totBal = round2(Object.values(bal).reduce((s, x) => s + x, 0));
    $('#rd-tbl').innerHTML = `<div class="tbl-wrap"><table class="grid"><colgroup>
      <col style="width:22%"><col style="width:20%"><col style="width:20%"><col style="width:18%"><col style="width:20%">
      </colgroup>
      <thead><tr><th>المكان</th><th>داخل اليوم</th><th>خارج اليوم</th><th>فرق اليوم</th><th>الرصيد الكلي</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
      <tfoot><tr>
        <td style="font-weight:800">الإجمالي</td>
        <td style="color:var(--green);font-weight:800;text-align:left" dir="ltr">+ ${fmt(totIn)}</td>
        <td style="color:var(--red-t);font-weight:800;text-align:left" dir="ltr">− ${fmt(totOut)}</td>
        <td style="font-weight:800;color:${totLeft >= 0 ? 'var(--green)' : 'var(--red-t)'};text-align:left" dir="ltr">${fmt(totLeft)}</td>
        <td style="color:var(--blue-t);font-weight:800;text-align:left" dir="ltr">${fmt(totBal)}</td>
      </tr></tfoot></table></div>`;
    $('#rd-total').innerHTML = `<div class="stats">
      <div class="stat pos"><span>إجمالي الداخل اليوم</span><b>${money(totIn)}</b></div>
      <div class="stat neg"><span>إجمالي الخارج اليوم</span><b>${money(totOut)}</b></div>
      <div class="stat ${totLeft >= 0 ? 'pos' : 'neg'}"><span>فرق اليوم (داخل − خارج)</span><b>${money(totLeft)}</b></div>
      <div class="stat blue"><span>إجمالي الأرصدة الكلية</span><b>${money(totBal)}</b></div>
    </div>`;
    $('#rd-doc').innerHTML = docBar('daily', '', false);
  };
  draw();
};

/* ----- today's dashboard ----- */
screens.repToday = (p, v) => {
  const t = ymd(new Date()), L = ledger(t, t), invs = liveInvoices().filter(i => sameYmd(i.date)), rets = db.returns.filter(r => sameYmd(r.date));
  const inn = sumA(L.inn), cin = sumA(L.cin), out = sumA(L.out), tip = sumA(L.tip), mg = sumA(L.mg), net = round2(inn + cin - out - tip - mg), pl = round2(sumA(L.gain) - sumA(L.loss)), mix = mixOf(L.inn), ncT = round2(mix.bank + mix.insta + mix.wallet);
  const debts = db.customers.reduce((s, c) => s + customerDebt(c.id), 0), owed = db.suppliers.reduce((s, x) => s + Math.max(supBal(x.id), 0), 0);
  const cinS = Object.entries(CIN).map(([k, t]) => [t, sumA(db.cashin.filter(x => sameYmd(x.date) && x.src === k).map(x => ({ a: x.amount })))]).filter(x => x[1] > 0); /* the day's money put in, by where it came from */
  const moves = [...L.inn.map(e => ({ ...e, pos: true })), ...L.out.concat(L.tip, L.mg).map(e => ({ ...e, pos: false }))].sort((a, b) => b.d.localeCompare(a.d));
  v.innerHTML = subHead('حركة اليوم') + `<div class="stack">
  <section class="panel"><h2 class="panel-t big">ملخص اليوم — ${dateAr()}</h2><div class="stats">
    <div class="stat blue"><span>مبيعات اليوم (${invs.length} فاتورة)</span><b>${money(invs.reduce((s, i) => s + i.net, 0))}</b></div>
    ${rets.length ? `<div class="stat neg"><span>مرتجعات اليوم (${rets.length})</span><b>${money(rets.reduce((s, r) => s + r.net, 0))}</b></div>` : ''}
    ${cin ? `<div class="stat pos"><span>${CIN_T}</span><b>${money(cin)}</b></div>${cinS.length > 1 ? cinS.map(x => `<div class="stat"><span>${x[0]}</span><b>${money(x[1])}</b></div>`).join('') : ''}` : ''}
    <div class="stat"><span>إجمالي الداخل (التحصيلات)</span><b>${money(inn)}</b></div>
    ${PM.filter(x => mix[x[0]] > 0 && ncT > 0).map(x => `<div class="stat"><span>${MIXW[x[0]]}</span><b>${money(mix[x[0]])}</b></div>`).join('')}
    <div class="stat neg"><span>إجمالي الخارج (مصروفات وموردين)</span><b>${money(out)}</b></div>
    ${tip ? `<div class="stat neg"><span>إكراميات وخصومات</span><b>${money(tip)}</b></div>` : ''}
    ${mg ? `<div class="stat neg"><span>تسليم للإدارة</span><b>${money(mg)}</b></div>` : ''}
    <div class="stat ${net >= 0 ? 'pos' : 'neg'}"><span>صافي الخزينة</span><b>${money(net)}</b></div>
    <div class="stat ${pl >= 0 ? 'pos' : 'neg'}"><span>${pl >= 0 ? 'ربح المبيعات' : 'خسارة المبيعات'}</span><b>${money(Math.abs(pl))}</b></div></div></section>
  <section class="panel"><h2 class="panel-t big">الوضع الحالي</h2><div class="stats">
    <div class="stat blue"><span>قيمة البضاعة بالمخزن (بسعر الشراء)</span><b>${money(stockValue())}</b></div>
    <div class="stat neg"><span>المتبقي على العملاء</span><b>${money(debts)}</b></div>
    <div class="stat neg"><span>المتبقي للموردين</span><b>${money(owed)}</b></div>
    <div class="stat"><span>عربون حجوزات مفتوح</span><b>${money(db.bookings.reduce((s, b) => s + bkOpen(b), 0))}</b></div></div></section>
  <section class="panel" id="rt-cin"><h2 class="panel-t big">${CIN_T}</h2><div class="tbl-wrap"><table class="grid"><colgroup><col style="width:22%"><col style="width:52%"><col style="width:26%"></colgroup>
    <thead><tr><th>الوقت</th><th>البيان</th><th>المبلغ</th></tr></thead>
    <tbody>${L.cin.slice().sort((a, b) => b.d.localeCompare(a.d)).map(m => `<tr><td class="muted">${new Date(m.d).toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' })}</td><td>${esc(m.w)}${pmBadge(m.m)}</td><td style="color:var(--green);font-weight:800">+ ${fmt(m.a)}</td></tr>`).join('') || `<tr><td colspan="3" class="empty">لا يوجد داخل من الدرج أو الخزينة أو رأس المال اليوم.</td></tr>`}</tbody>${L.cin.length ? `<tfoot><tr><td colspan="2" style="font-weight:800">${CIN_TT}</td><td style="color:var(--green);font-weight:800">+ ${fmt(cin)}</td></tr></tfoot>` : ''}</table></div></section>
  <section class="panel"><h2 class="panel-t big">حركة اليوم</h2><div class="tbl-wrap"><table class="grid"><colgroup><col style="width:22%"><col style="width:52%"><col style="width:26%"></colgroup>
    <thead><tr><th>الوقت</th><th>البيان</th><th>المبلغ</th></tr></thead>
    <tbody>${moves.map(m => `<tr><td class="muted">${new Date(m.d).toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' })}</td><td>${esc(m.w)}${pmBadge(m.m)}</td><td style="color:${m.pos ? 'var(--green)' : 'var(--red-t)'};font-weight:800">${m.pos ? '+' : '−'} ${fmt(m.a)}</td></tr>`).join('') || `<tr><td colspan="3" class="empty">لا توجد حركة اليوم بعد.</td></tr>`}</tbody></table></div></section></div>`;
};

/* ----- printable paper ----- */
const repPhones = () => db.settings.phones.split('\n').map(x => x.trim()).filter(Boolean).join(' | ');
/* the letterhead shared by invoices and reports: logo on both sides, name, phones, address, thick rule */
const taxLine = () => { const S = db.settings; return taxOn() ? [S.taxNo ? 'الرقم الضريبي: ' + S.taxNo : '', S.crNo ? 'السجل التجاري: ' + S.crNo : ''].filter(Boolean).join(' | ') : ''; };
const letterOf = () => { const S = db.settings; return { logo: S.logo, name: S.company.trim(), phones: repPhones(), addr: S.address.trim(), tax: taxLine() }; };
function letterhead(o, style = 'A') {
  const lg = o.logo ? `<img src="${o.logo}" alt="">` : '<i></i>', lp = o.phones ? `<p class="ph">${esc(o.phones)}</p>` : '', la = o.addr ? `<p class="ad">${esc(o.addr)}</p>` : '', lx = o.tax ? `<p class="ad">${esc(o.tax)}</p>` : '';
  return `<header class="rh"><div>${lg}</div><div class="rh-c">${o.name ? `<h2>${esc(o.name)}</h2>` : ''}${style === 'A' ? lp + la : la + lp}${lx}</div><div>${lg}</div></header>`;
}
function repHeader(style, title, from, to) {
  const rng = `من: ${from} إلى: ${to}`;
  return letterhead(letterOf(), style) +
    (style === 'A' ? `<div class="rt"><h3>${title}</h3><p>${rng}</p></div>` : `<div class="rbox"><b>${title} | ${rng}</b></div>`);
}
const repRows = (list, sign) => list.map(e => `<tr><td><bdi dir="ltr">${ymd(e.d)}</bdi></td><td>${esc(e.w)}${pmBadge(e.m)}</td><td class="amt">${sign ? `<span>(${e.s})</span> ` : ''}<bdi>${fmt(e.a)}</bdi></td></tr>`).join('');
const repTh = '<thead><tr><th>التاريخ</th><th>البيان</th><th>المبلغ</th></tr></thead>';
/* style A: the total sits in the table's last row */
const secA = (title, list, label, total, o = {}) => `<section class="rsec"><h4>${title}</h4><table class="rtbl">${repTh}<tbody>${repRows(list, o.sign)}</tbody><tfoot><tr><td colspan="2" class="tl">${label}</td><td class="tv">${fmt(total)} ${o.unit || 'جنيه'}</td></tr></tfoot></table></section>`;
/* style B: dashed total box under the table */
const secB = (title, list, label, total) => `<section class="rsec b"><h4>${title}</h4><table class="rtbl">${repTh}<tbody>${list.map(e => `<tr><td><bdi dir="ltr">${ymd(e.d)}</bdi></td><td>${esc(e.w)}${pmBadge(e.m)}</td><td class="amt">${fmt(e.a)} جنيه</td></tr>`).join('')}</tbody></table><div class="dtot"><span>${label}:</span><b>${fmt(total)} جنيه</b></div></section>`;
/* font size of every printed paper: one setting per device (5% steps), shared by the screen, the printer and the PDF file.
   The scale rides on the paper itself (--fs), so the same markup gives the same result everywhere. */
const FS_MIN = 0.6, FS_MAX = 1.8, FS_KEY = 'accounts.fs.v1'; let FS_V = null;
const fsGet = () => { if (FS_V === null) { try { FS_V = parseFloat(localStorage.getItem(FS_KEY)); } catch (e) { FS_V = NaN; } if (!(FS_V >= FS_MIN && FS_V <= FS_MAX)) FS_V = 1; } return FS_V; };
const fsBar = (lbl = 'حجم الخط') => { const v = fsGet(); return `<div class="fsbar noprint" role="group" aria-label="${lbl}"><span class="fst">${lbl}</span><button class="fsb" type="button" data-fs="-" aria-label="تصغير الخط"${v <= FS_MIN + 0.001 ? ' disabled' : ''}>A−</button><b class="fsv" aria-live="polite">${Math.round(v * 100)}%</b><button class="fsb" type="button" data-fs="+" aria-label="تكبير الخط"${v >= FS_MAX - 0.001 ? ' disabled' : ''}>A+</button><button class="fsb fsr" type="button" data-fs="0"${Math.abs(v - 1) < 0.001 ? ' disabled' : ''}>إعادة</button></div>`; };
const paper = (body, cls = '') => `<article class="paper${cls ? ' ' + cls : ''}" style="--fs:${fsGet()}">${fsBar()}${db.settings.logo ? `<img class="wm" src="${db.settings.logo}" alt="">` : ''}<div class="pp">${body}</div></article>`;
function fsSet(v) {
  FS_V = Math.min(FS_MAX, Math.max(FS_MIN, Math.round(v * 20) / 20)); try { localStorage.setItem(FS_KEY, String(FS_V)); } catch (e) { /* kept for this visit only */ }
  $$('article.paper').forEach(a => a.style.setProperty('--fs', FS_V));
  $$('.fsbar').forEach(b => { $('.fsv', b).textContent = Math.round(FS_V * 100) + '%'; $('[data-fs="-"]', b).disabled = FS_V <= FS_MIN + 0.001; $('[data-fs="+"]', b).disabled = FS_V >= FS_MAX - 0.001; $('[data-fs="0"]', b).disabled = Math.abs(FS_V - 1) < 0.001; });
  docRewarm(); /* the PDF behind the WhatsApp button follows the new size */
}
document.addEventListener('click', e => { const b = e.target.closest('[data-fs]'); if (!b || b.disabled) return; const d = b.dataset.fs; fsSet(d === '0' ? 1 : fsGet() + (d === '+' ? 0.05 : -0.05)); });

/* ----- the invoice as one running account: goods and money, every amount on its own dated line ----- */
const dIso = d => '⁦' + ymd(d) + '⁩'; /* keeps 2026-11-16 in order inside right-to-left text */
const sameYmd = (a, b) => ymd(a) === ymd(b);
const dsp = d => { const t = ymd(d), m = /^(\d{4}-)(\d\d-\d\d)$/.exec(t); return `<bdi dir="ltr">${m ? `<span class="dy">${m[1]}</span><span class="dy">${m[2]}</span>` : t}</bdi>`; }; /* a date in a narrow column breaks only between the year and the month-day */
const ng = (m, a) => m ? `<bdi dir="ltr">${m}${fmt(a)}</bdi>` : fmt(a); /* a reduction keeps its minus on the left of the number */
/* one line of the account: a = the amount shown (never negative), col = «بضاعة» (g) or «مدفوع» (p), e = what it does to what the customer still owes (+ more, − less, 0 = nothing) */
const flowEnt = (d, t, col, a, e, o = {}) => ({ d, t, col, a: round2(Math.abs(a)), e: round2(e), neg: col === 'g' && a < 0, ...o });
/* the goods side: the goods as they were at issue (a line each, with transport, discount and VAT), then every edit that changed them on the day it was made: goods added or taken off, transport, discount/VAT.
   Every line of it adds up to the invoice net, so the running «remaining» always lands on what the invoice owes. */
const pctD = s => round2((s.discAmt || 0) - (s.discCash || 0)); /* the % part of an invoice's discount (discAmt is the whole of it, the cash discount included) */
function invGoods(r) {
  const S = invStates(r), out = []; let prev = null;
  const key = l => l.itemId + '|' + l.price, ds = (l, q) => `${l.name} — ${fmtq(q)} ${l.unit} × ${fmt(l.price)}`;
  S.forEach((s, k) => {
    let sum = 0; const add = (t, a, kind, o) => { out.push({ ...flowEnt(s.d, t, 'g', a, a, o), kind, iss: !k }); sum = round2(sum + a); };
    /* a discount is something taken off the total, so it counts as PAID: it sits in the «مدفوع» column (small word «خصم»), never in «الإجمالي» (a cut in the discount raises what he owes again and sits in «الإجمالي» like any such line) */
    const addD = (t, a) => { out.push({ ...flowEnt(s.d, t, 'p', a, a, a < 0 ? { lbl: 'خصم' } : { lbl: 'تعديل', up: 1 }), kind: 'disc', iss: !k }); sum = round2(sum + a); };
    if (!k) {
      s.rows.forEach(l => add(ds(l, l.qty), l.total, 'item', { it: { n: l.name, q: l.qty, u: l.unit, p: l.price } }));
      if (s.transport) add('نقل', s.transport, 'tr');
      if (pctD(s) > 0.004) addD(`الخصم (${fmt(s.discPct)}%)`, -pctD(s));
      if (s.discCash > 0.004) addD('خصم نقدي', -s.discCash); /* the cash discount is its own dated line */
      if (s.vatAmt) add(`القيمة المضافة (${s.vatPct}%)`, s.vatAmt, 'vat');
    } else {
      const m = {}, acc = (st, sg) => st.rows.forEach(l => { const q = key(l), x = m[q] = m[q] || { l, q: 0, t: 0 }; x.q = round3(x.q + sg * l.qty); x.t = round2(x.t + sg * l.total); });
      acc(prev, -1); acc(s, 1);
      Object.values(m).forEach(x => { if (x.q > 1e-9) add(`إضافة بضاعة: ${ds(x.l, x.q)}`, x.t, 'add', { x: ds(x.l, x.q), it: { n: x.l.name, q: x.q, u: x.l.unit, p: x.l.price } }); else if (x.q < -1e-9) add(`تخفيض بضاعة: ${ds(x.l, -x.q)}`, x.t, 'less', { x: ds(x.l, -x.q), it: { n: x.l.name, q: -x.q, u: x.l.unit, p: x.l.price } }); else if (Math.abs(x.t) > 0.004) add('تعديل في قيمة الفاتورة', x.t, 'adj'); });
      const dt = round2(s.transport - prev.transport); if (Math.abs(dt) > 0.004) add('تعديل النقل', dt, 'tr2');
      const dd = round2(pctD(s) - pctD(prev)); if (dd > 0.004) addD(`زيادة الخصم${s.discPct ? ` (${fmt(s.discPct)}%)` : ''}`, -dd); else if (dd < -0.004) addD(`تخفيض الخصم${s.discPct ? ` (${fmt(s.discPct)}%)` : ''}`, -dd);
      const dc = round2((s.discCash || 0) - (prev.discCash || 0)); if (dc > 0.004) addD('زيادة الخصم النقدي', -dc); else if (dc < -0.004) addD('تخفيض الخصم النقدي', -dc);
      const dv = round2(s.vatAmt - prev.vatAmt); if (Math.abs(dv) > 0.004) add(`تعديل القيمة المضافة${s.vatPct ? ` (${s.vatPct}%)` : ''}`, dv, 'vat');
    }
    const res = round2(s.net - (prev ? prev.net : 0) - sum);
    if (Math.abs(res) > 0.004) add(s.discAmt || s.vatAmt || (prev && (prev.discAmt || prev.vatAmt)) ? 'تعديل الخصم والقيمة المضافة' : 'تعديل في قيمة الفاتورة', res, 'adj');
    prev = s;
  });
  return out;
}
/* the deposit on invoice i, one entry per balance it came from: taken off at issue, or moved onto it later (depLate); b = the balance (null when it cannot be traced) */
function invDeps(i) {
  const bks = i.customerId ? db.bookings.filter(b => b.customerId === i.customerId) : [], out = [];
  let ex = round2((i.deposit || 0) - round2((i.depLate || []).reduce((s, x) => s + x.a, 0)));
  bks.forEach(b => (b.uses || []).forEach(u => { if (u.inv === i.no && !u.late && ex > 0.004) { const a = round2(Math.min(u.a, ex)); out.push({ d: u.date, a, b, late: false }); ex = round2(ex - a); } }));
  if (ex > 0.004) out.push({ d: i.date, a: ex, b: null, late: false });
  (i.depLate || []).forEach(x => out.push({ d: x.date, a: x.a, b: bks.find(b => (b.uses || []).some(u => u.late && u.inv === i.no && u.date === x.date && u.a === x.a)) || null, late: true }));
  return out;
}
/* cash handed over on the invoice: at issue, and any more added by an edit (its own line on that day) */
function invCash(i) {
  const S = invStates(i), out = [];
  S.forEach((s, k) => { const pr = k ? S[k - 1] : { paid: 0, over: 0 }, dp = round2(s.paid - pr.paid), dv = round2(s.over - pr.over);
    const pm = pmKey(s.pm || (k ? '' : i.pm)); /* how the money of this step came in (cash unless a bank-like method was chosen) */
    if (dp > 0.004) out.push({ d: s.d, a: dp, k, over: false, pm }); else if (dp < -0.004) out.push({ d: s.d, a: dp, k, over: false, pm: 'cash' });
    if (dv > 0.004) out.push({ d: s.d, a: dv, k, over: true, pm }); });
  return out;
}
/* a «البيان» cell is the short text on its first line and small notes under it (the invoice, where a balance came from…): BL builds it (lines joined by a line break, empty ones dropped), bnH draws it, bnX writes it on one line (Excel, WhatsApp) — each piece is translated on its own */
const BL = (...a) => a.filter(Boolean).join('\n');
const bnE = x => esc(x).replace(/\d{4}-\d{2}-\d{2}/g, m => `<bdi dir="ltr" class="dy">${m}</bdi>`); /* a date inside the text keeps its order and is never cut in the middle */
const bnH = t => String(t).split('\n').map((x, k) => k ? ` <small class="bs">${bnE(x)}</small>` : bnE(x)).join('');
const bnX = t => String(t).split('\n').map(x => LANG === 'en' ? trText(x) : x).join(' — ');
const LB0 = ['مدفوع', 'مرتجع', 'رُدّ', 'مُرحَّل', 'تعديل', 'خصم'], lbN = x => !!x && !LB0.includes(x), bnL = (t, x) => lbN(x) ? BL(t, x) : t, lbA = x => lbN(x) ? '' : x; /* the small words over an amount are «مرتجع» / «رُدّ» / «مُرحَّل»; any other label is the way it was paid (bank / InstaPay / wallet) and is written under the «البيان», so the amount stays on the line of its row */
/* the money side: each deposit taken off (or moved onto it later), each cash payment, each collection with the moves of it, each return — a line each, with its own date.
   A «payment method» (cash in hand / bank / InstaPay / e-wallet) can ride on each of these lines later. */
function invMoney(r) {
  const out = [], pay = (d, t, a, lbl) => out.push(flowEnt(d, t, 'p', a, -a, { lbl: lbl || 'مدفوع' })), keep = (d, t, a, lbl) => out.push(flowEnt(d, t, 'p', a, 0, { lbl: lbl || 'مدفوع' })), back = (d, t, a, lbl) => out.push(flowEnt(d, t, 'p', a, a, { lbl, up: 1 })); /* lbl = the small word over the amount; up = it raises what he owes again */
  invDeps(r).forEach(x => pay(x.d, BL(x.late ? 'عربون مرحَّل' : 'عربون مخصوم', x.b && !sameYmd(x.b.date, x.d) ? `دُفع في ${dIso(x.b.date)}` : '', x.b ? `من ${bkS(x.b)}` : ''), x.a));
  invCash(r).forEach(c => { const nc = pmIs(c.pm), mw = nc ? pmName(c.pm) : undefined; if (c.over) keep(c.d, BL('دفعة زائدة عن الفاتورة', c.k ? 'عند التعديل' : '', 'صارت رصيداً للعميل'), c.a, mw); else if (c.a > 0) pay(c.d, nc ? (c.k ? 'دفعة عند التعديل' : 'دفعة عند الإصدار') : (c.k ? 'نقداً عند التعديل' : 'نقداً عند الإصدار'), c.a, mw); else back(c.d, 'تعديل المدفوع', -c.a, 'تعديل'); });
  db.payments.forEach(p => {
    const mv = p.moves || [], inn = mv.filter(m => m.to === r.id), outm = mv.filter(m => m.from === r.id), al = (p.alloc || []).filter(a => a.inv === r.id).reduce((s, a) => s + a.a, 0);
    if (!al && !inn.length && !outm.length) return;
    const orig = round2(al - inn.reduce((s, m) => s + m.a, 0) + outm.reduce((s, m) => s + m.a, 0)); /* what was taken on it before any move */
    if (orig > 0.004) pay(p.date, 'تحصيل', orig, pmIs(p.pm) ? pmName(p.pm) : undefined);
    inn.forEach(m => pay(m.date, BL('تحصيل مرحَّل', `من فاتورة ${m.fromNo}`), m.a));
    outm.forEach(m => back(m.date, BL('تحصيل رُحّل', `إلى فاتورة ${m.toNo}`), m.a, 'مُرحَّل'));
  });
  db.returns.filter(x => x.invId === r.id).forEach(x => { if (x.credit > 0) pay(x.date, BL(`مرتجع ${x.no}`, 'خُصم من المتبقي'), x.credit, 'مرتجع'); if (x.refund > 0) keep(x.date, BL(`مرتجع ${x.no}`, 'رُدّ نقداً للعميل'), x.refund, 'رُدّ'); });
  return out;
}
/* the whole account of one invoice in date order, goods and money together (ties keep their order: goods first); moves out of the extra payment this invoice created ride along as lines without a balance */
function invFlow(r) {
  const mvs = invMoves(r), info = mvs.outs.map(m => ({ d: m.date, info: 1, t: m.late ? BL(`رُحّل ${money(m.a)}`, `إلى ${invRef(m.to)}`) : BL(`خُصم ${money(m.a)}`, `في ${invRef(m.to)}`) }));
  const all = invGoods(r).concat(invMoney(r), info).map((x, k) => ({ x, k })).sort((a, b) => String(a.x.d) < String(b.x.d) ? -1 : String(a.x.d) > String(b.x.d) ? 1 : a.k - b.k).map(z => z.x);
  if (mvs.outs.length) all.push({ d: '', info: 1, t: `المتبقي من رصيد هذه الفاتورة: ${owe(-mvs.left)}` });
  return all;
}

/* the printed invoice (matches the reference sheet): client/date box, then ONE running account — the goods, every payment and every move one under another with its date and what is still owed after it — and the remaining at the bottom */
function invPaper(r) {
  const left = invLeft(r), isVoid = r.status === 'void';
  const cu = r.kind !== 'cash' && r.customerId ? db.customers.find(x => x.id === r.customerId) : null, who = esc(r.name) + (r.phone ? ' • ' + esc(r.phone) : '') + (r.addr ? ' • ' + esc(r.addr) : '');
  const ln = (a, b, c = '') => `<div class="l${c ? ' ' + c : ''}"><span>${a}</span><b>${b}</b></div>`;
  const mvs = invMoves(r), bal = r.over > 0 ? (mvs.outs.length ? mvs.left : r.over) : 0; /* what the customer still has with us from the extra this invoice took */
  let run = 0;
  const F0 = invFlow(r), dT = round2(-F0.filter(l => l.kind === 'disc').reduce((t, l) => t + l.e, 0)); /* F0 = the whole account; the discount is not a line of the table (v8.39): it is only the «الخصم» box under it */
  const F = F0.filter(l => l.kind !== 'disc'), tail = F.length && F[F.length - 1].info && !F[F.length - 1].d ? [F.pop()] : [];
  F.push(...tail); /* v8.39: the invoice table has NO discount line at all — the discount is only the red «الخصم» box under it (the remaining there already has it taken off) */
  const dt = l => `<td class="dt">${l.d ? dsp(l.d) : ''}</td>`, sg = l => l.neg ? '−' : '', lb = x => x ? `<small class="lb">${x}</small> ` : '';
  /* seven columns: date | what | quantity | selling price | total | paid | what is still owed. Every row has all seven cells, so every column keeps the same width from the first row to the last: «البيان» is one wide column (a long sentence goes on to a second line under itself, a word or two stays centred in it) and the numbers sit under each other. The goods fill quantity, price and total; a payment's amount sits in «مدفوع»; what raises the debt again (a collection moved away, a payment taken back) sits in «الإجمالي» with a small word */
  const E4 = '<td></td><td></td><td></td><td></td>';
  const rows = F.map(l => {
    if (l.info) return `<tr>${dt(l)}<td class="bn">${bnH(l.t)}</td>${E4}<td class="bl"></td></tr>`;
    run = round2(run + l.e);
    const bl = `<td class="bl">${fmt(Math.max(run, 0))}</td>`;
    if (l.it) return `<tr>${dt(l)}<td class="bn">${l.kind === 'add' ? 'إضافة بضاعة: ' : l.kind === 'less' ? 'تخفيض بضاعة: ' : ''}${esc(l.it.n)}</td><td>${fmtq(l.it.q)} <span class="u">${esc(l.it.u)}</span></td><td>${fmt(l.it.p)}</td><td>${ng(sg(l), l.a)}</td><td></td>${bl}</tr>`;
    if (l.col === 'g') return `<tr>${dt(l)}<td class="bn">${bnH(l.t)}</td><td></td><td></td><td>${ng(sg(l), l.a)}</td><td></td>${bl}</tr>`;
    if (l.up) return `<tr>${dt(l)}<td class="bn">${bnH(bnL(l.t, l.lbl))}</td><td></td><td></td><td>${lb(lbA(l.lbl))}${fmt(l.a)}</td><td></td>${bl}</tr>`;
    return `<tr>${dt(l)}<td class="bn">${bnH(bnL(l.t, l.lbl))}</td><td></td><td></td><td></td><td class="pd">${lb(l.lbl && l.lbl !== 'مدفوع' ? lbA(l.lbl) : '')}${fmt(l.a)}</td>${bl}</tr>`;
  }).join('');
  /* the totals at the bottom, each in its own box: the invoice, what was collected on it, (what was returned), and what is still owed */
  const money_ = F0.filter(l => l.col === 'p' && !l.info && l.kind !== 'disc'), discT = dT, goodsT = round2(F0.filter(l => l.col === 'g').reduce((t, l) => t + l.e, 0)), retT = round2(money_.filter(l => l.lbl === 'مرتجع').reduce((t, l) => t + l.a, 0)), collT = round2(-money_.filter(l => l.lbl !== 'مرتجع').reduce((t, l) => t + l.e, 0));
  return paper(letterhead(letterOf()) +
    `<div class="ibox"><span>اسم العميل: <b>${who}</b></span>${cu && cu.code ? `<span>كود العميل: <b><bdi dir="ltr">${esc(cu.code)}</bdi></b></span>` : ''}<span>فاتورة رقم: <b><bdi dir="ltr">${esc(r.no)}</bdi></b></span>${r.place ? `<span>المكان: <b>${esc(r.place)}</b></span>` : ''}<span>التاريخ: <b><bdi dir="ltr">${ymd(r.date)}</bdi></b></span></div>` +
    `<table class="itbl st ivt"><colgroup><col style="width:13%"><col style="width:30%"><col style="width:9%"><col style="width:11%"><col style="width:13%"><col style="width:12%"><col style="width:12%"></colgroup><thead><tr><th>التاريخ</th><th>البيان</th><th>الكمية</th><th>سعر البيع</th><th>الإجمالي</th><th>مدفوع</th><th>المتبقي</th></tr></thead><tbody>${rows}</tbody></table>` +
    `<div class="isum${discT > 0.004 || retT > 0 ? ' n4' : ''}"><div class="ic">${ln('إجمالي الفاتورة:', money(goodsT), 'big')}</div>${discT > 0.004 ? `<div class="ic dsc">${ln('الخصم:', money(discT), 'big')}</div>` : ''}<div class="ic">${ln('إجمالي التحصيلات:', money(collT), 'big')}</div>${retT > 0 ? `<div class="ic">${ln('المرتجع (مخصوم):', money(retT), 'big')}</div>` : ''}<div class="ic">${bal > 0 ? ln('رصيد العميل:', 'له ' + money(bal), 'big') : ln('المتبقي (أجل):', money(left), 'big')}</div></div>` +
    (isVoid ? `<div class="vstamp">ملغاة</div>` : ''), 'inv' + (isVoid ? ' void' : ''));
}

/* customer statement: every invoice (debit) and everything paid at issue or collected later (credit), with a running balance.
   Every row knows the place of its invoice (pl) and carries two balances: for the whole account (bal) and for its own place (pbal). */
function custLedger(c) {
  const mv = [], dsc = {}, vd = voidIds(), byId = id => db.invoices.find(x => x.id === id), liveInv = id => { const i = byId(id); return i && i.status !== 'void' ? i : null; };
  db.invoices.filter(i => i.customerId === c.id && i.status !== 'void').forEach(i => {
    const pl = placeOf(i), G = invGoods(i); G.filter(x => x.kind === 'disc').forEach(x => { dsc[pl] = round2((dsc[pl] || 0) - x.e); }); /* the discount is not a dated line: its total goes to ONE line at the end (v8.37) */
    G.filter(x => x.kind !== 'disc').filter(x => x.iss).forEach(x => mv.push({ d: x.d, t: BL(x.it ? x.it.n : x.t, `فاتورة ${i.no}`), debit: x.e > 0 ? x.e : 0, credit: x.e < 0 ? -x.e : 0, pl, g: x.kind === 'disc' ? 0 : 1, lbl: x.kind === 'disc' ? x.lbl : undefined, it: x.it })); /* every line of the invoice on its own row: the item with its quantity, price and total, then transport, discount, VAT */
    G.filter(x => x.kind !== 'disc').filter(x => !x.iss).forEach(x => { const t = BL(x.kind === 'add' ? `إضافة بضاعة: ${x.it.n}` : x.kind === 'less' ? `تخفيض بضاعة: ${x.it.n}` : x.kind === 'tr2' ? 'تعديل النقل' : x.kind === 'vat' ? 'تعديل القيمة المضافة' : x.t === 'تعديل الخصم والقيمة المضافة' ? 'تعديل الخصم والقيمة المضافة' : 'تعديل في قيمة الفاتورة', `فاتورة ${i.no}`); mv.push({ d: x.d, t, debit: x.e > 0 ? x.e : 0, credit: x.e < 0 ? -x.e : 0, pl, g: x.kind === 'disc' ? 0 : 1, lbl: x.kind === 'disc' ? x.lbl : undefined, it: x.it }); }); /* goods added (or taken off) by an edit are written on the day of the edit */
    invDeps(i).forEach(x => mv.push({ d: x.d, t: BL(x.late ? 'عربون مرحَّل' : 'عربون مخصوم', `فاتورة ${i.no}`, x.b ? `من ${bkS(x.b)}` : ''), debit: 0, credit: x.a, pl, lbl: 'مدفوع' })); /* each balance it came from on its own row, on the day it was taken off or moved onto the invoice */
    invCash(i).filter(c => !c.over).forEach(c => mv.push({ d: c.d, t: BL(c.a < 0 ? 'تعديل المدفوع' : pmIs(c.pm) ? (c.k ? 'دفعة عند التعديل' : 'دفعة عند الإصدار') : (c.k ? 'نقداً عند التعديل' : 'نقداً عند الإصدار'), `فاتورة ${i.no}`), debit: c.a < 0 ? -c.a : 0, credit: c.a > 0 ? c.a : 0, pl, lbl: c.a > 0 ? (pmIs(c.pm) ? pmName(c.pm) : 'مدفوع') : 'تعديل' }));
  });
  db.returns.filter(r => r.customerId === c.id).forEach(r => { /* the goods come back (credit), cash given back is a debit again */
    const pl = placeOf(byId(r.invId));
    mv.push({ d: r.date, t: BL('مرتجع', `فاتورة ${r.invNo}`), debit: 0, credit: r.net, pl, lbl: 'مرتجع' });
    if (r.refund > 0) mv.push({ d: r.date, t: BL('رد نقدي للعميل', `مرتجع ${r.no}`), debit: r.refund, credit: 0, pl, lbl: 'رُدّ' });
  });
  db.payments.filter(x => x.customerId === c.id).forEach(x => { /* a collection is shown as it was taken (before any move to another invoice), one row for each invoice it settled; the part that sat on a cancelled invoice went back to him, so it is not shown */
    const orig = {}; (x.alloc || []).forEach(a => { orig[a.inv] = round2((orig[a.inv] || 0) + a.a); });
    (x.moves || []).slice().reverse().forEach(m => { orig[m.to] = round2((orig[m.to] || 0) - m.a); orig[m.from] = round2((orig[m.from] || 0) + m.a); });
    Object.keys(orig).forEach(id => { const i = liveInv(id); if (i && orig[id] > 0.004) mv.push({ d: x.date, t: BL('تحصيل', `فاتورة ${i.no}`), debit: 0, credit: orig[id], pl: placeOf(i), lbl: pmIs(x.pm) ? pmName(x.pm) : 'مدفوع' }); }); /* one row per invoice it settled */
    const rest = round2(x.amount - (x.alloc || []).reduce((s, a) => s + a.a, 0)); if (rest > 0.004) mv.push({ d: x.date, t: 'تحصيل', debit: 0, credit: rest, pl: '', lbl: pmIs(x.pm) ? pmName(x.pm) : 'مدفوع' });
    (x.moves || []).forEach(m => { /* the move itself, on the day it was made: out of the first invoice's place, into the second one's */
      const fi = liveInv(m.from), ti = liveInv(m.to), pf = placeOf(byId(m.from)), pt = placeOf(byId(m.to));
      if (fi) mv.push({ d: m.date, t: BL('ترحيل تحصيل', pt && pt !== pf ? `إلى فاتورة ${m.toNo} (${pt})` : `إلى فاتورة ${m.toNo}`), debit: m.a, credit: 0, pl: pf, lbl: 'مُرحَّل' });
      if (ti) mv.push({ d: m.date, t: BL('ترحيل تحصيل', pf && pt !== pf ? `من فاتورة ${m.fromNo} (${pf})` : `من فاتورة ${m.fromNo}`), debit: 0, credit: m.a, pl: pt, lbl: 'مُرحَّل' });
    });
  });
  db.bookings.filter(b => b.customerId === c.id).forEach(b => { /* a deposit moved from one place to another: written on both places, no money moves so no debit or credit */
    const pn = x => { const p = x ? placeOf(x) : ''; return p ? 'مكان ' + p : 'بدون مكان'; };
    (b.uses || []).filter(u => u.inv === 'ترحيل').forEach(u => mv.push({ d: u.date, t: BL(`ترحيل عربون ${fmt(u.a)}`, `من ${pn(b)} إلى ${u.to ? 'مكان ' + u.to : 'بدون مكان'}`), debit: 0, credit: 0, pl: placeOf(b), info: 1 }));
    if (b.xfer) mv.push({ d: b.date, t: BL(`ترحيل عربون ${fmt(b.amount)}`, `من ${pn(db.bookings.find(x => x.id === b.from))} إلى ${pn(b)}`), debit: 0, credit: 0, pl: placeOf(b), info: 1 });
  });
  db.bookings.filter(b => b.customerId === c.id && bkOpen(b) > 0).forEach(b => mv.push({ d: b.date, t: BL('عربون مفتوح', b.desc === 'عربون — ' + placeOf(b) ? '' : b.desc, bkUsed(b) > 0 ? `الأصل ${fmt(b.amount)} — رُحّل منه ${fmt(bkUsed(b))}` : ''), debit: 0, credit: bkOpen(b), pl: placeOf(b), dep: 1 })); /* what he put down and is still with us is money paid in: a dated line under «مدفوع» that moves his balance to «دائن (له)» like any payment (the part already used on invoices shows on those invoices) */
  mv.sort((a, b) => String(a.d).localeCompare(String(b.d))); /* oldest first (equal times keep their order); byDate reads .date and would not sort these rows */
  mv.dsc = round2(Object.keys(dsc).reduce((t, pl) => t + dsc[pl], 0)); /* v8.40: the discount is no line of the statement (like the invoice): its total is only the red «الخصم» box under the table, the running balance in the table is without it */
  let run = 0; const pr = {}; mv.forEach(m => { run = round2(run + m.debit - m.credit); m.bal = run; pr[m.pl] = round2((pr[m.pl] || 0) + m.debit - m.credit); m.pbal = pr[m.pl]; });
  return mv;
}
function custPaper(c) {
  const mv = custLedger(c), total = customerTotal(c.id), nInv = db.invoices.filter(i => i.customerId === c.id && i.status !== 'void').length;
  const ln = (a, b, k = '') => `<div class="l${k ? ' ' + k : ''}"><span>${a}</span><b>${b}</b></div>`;
  /* every balance is written in words: «عليه X» (he owes us) or «له X» (we owe him / his deposit), never a minus sign */
  /* the same seven columns as the invoice: date | what | quantity | selling price | total | paid | balance (words) */
  const dtc = d => `<td class="dt">${d ? dsp(d) : ''}</td>`, lb = x => x ? `<small class="lb">${x}</small> ` : '';
  /* the balance is two columns, «دائن» (له: we owe him) first and then «مدين» (عليه: he owes us): the number goes under the one it belongs to, the other stays empty (a settled account shows 0 under «مدين») */
  const bcs = (bl, none) => { bl = round2(bl); return none ? '<td class="bl"></td><td class="bl"></td>' : bl < 0 ? `<td class="bl">${fmt(-bl)}</td><td class="bl"></td>` : `<td class="bl"></td><td class="bl">${fmt(bl)}</td>`; };
  const row = (m, bl) => {
    const bc = bcs(bl, m.info), am = m.debit || m.credit;
    if (m.info) return `<tr>${dtc(m.d)}<td class="bn">${bnH(m.t)}</td><td></td><td></td><td></td><td></td>${bc}</tr>`;
    if (m.it) return `<tr>${dtc(m.d)}<td class="bn">${bnH(m.t)}</td><td>${fmtq(m.it.q)} <span class="u">${esc(m.it.u)}</span></td><td>${fmt(m.it.p)}</td><td>${ng(m.credit ? '−' : '', am)}</td><td></td>${bc}</tr>`;
    if (m.g) return `<tr>${dtc(m.d)}<td class="bn">${bnH(m.t)}</td><td></td><td></td><td>${ng(m.credit ? '−' : '', am)}</td><td></td>${bc}</tr>`;
    if (m.credit) return `<tr>${dtc(m.d)}<td class="bn">${bnH(bnL(m.t, m.lbl))}</td><td></td><td></td><td></td><td class="pd">${lb(m.lbl && m.lbl !== 'مدفوع' ? lbA(m.lbl) : '')}${fmt(am)}</td>${bc}</tr>`;
    return `<tr>${dtc(m.d)}<td class="bn">${bnH(bnL(m.t, m.lbl))}</td><td></td><td></td><td>${lb(lbA(m.lbl))}${fmt(am)}</td><td></td>${bc}</tr>`; /* money that raises what he owes again (cash given back, a collection moved away) */
  };
  const D = mv.dsc > 0.004 ? mv.dsc : 0, last = round2((mv.length ? mv[mv.length - 1].bal : 0) - D), setl = round2(total - last), gross = round2(total + D); /* last: where he stands (+ he owes, − we owe him, deposits included, the discount off); setl: what he has paid in all (an overpayment and his deposits count too); gross: the purchases before the discount, so the boxes add up like the invoice's */
  const grouped = mv.some(m => m.pl); /* at least one invoice or deposit has a place: the statement is laid out place by place, otherwise it is the one plain table as always */
  let rows;
  if (!grouped) rows = mv.map(m => row(m, m.bal)).join('');
  else {
    const order = custPlaces(c).filter(p => mv.some(m => m.pl === p)); if (mv.some(m => !m.pl)) order.push('');
    /* no «إجمالي مكان …» line and no «الإجمالي العام» line: each place is its header and its rows, and where he stands is in the boxes under the table */
    rows = order.map(p => `<tr class="plh"><td colspan="8">${p ? `المكان: <b>${esc(p)}</b>` : '<b>بدون مكان</b>'}</td></tr>` + mv.filter(m => m.pl === p).map(m => row(m, m.pbal)).join('')).join('');
  }
  if (!rows) rows = '<tr><td colspan="8">لا توجد حركة لهذا العميل.</td></tr>';
  return paper(letterhead(letterOf()) + `<div class="rt"><h3>كشف حساب عميل</h3></div>` +
    `<div class="ibox"><span>اسم العميل: <b>${esc(c.name)}</b></span>${c.code ? `<span>الكود: <b><bdi dir="ltr">${esc(c.code)}</bdi></b></span>` : ''}${c.phone ? `<span>الموبايل: <b><bdi dir="ltr">${esc(c.phone)}</bdi></b></span>` : ''}${c.address ? `<span>العنوان: <b>${esc(c.address)}</b></span>` : ''}<span>عدد الفواتير: <b>${fmt(nInv)}</b></span><span>التاريخ: <b><bdi dir="ltr">${ymd(new Date())}</bdi></b></span></div>` +
    `<table class="itbl st ivt cst"><colgroup><col style="width:11%"><col style="width:29%"><col style="width:8%"><col style="width:10%"><col style="width:11%"><col style="width:10.5%"><col style="width:10.5%"><col style="width:10%"></colgroup><thead><tr><th>التاريخ</th><th>البيان</th><th>الكمية</th><th>سعر البيع</th><th>الإجمالي</th><th>مدفوع</th><th>دائن <small class="hs">(له)</small></th><th>مدين <small class="hs">(عليه)</small></th></tr></thead><tbody>${rows}</tbody></table>` +
    /* the boxes under the table are the invoice's: one box per line — the purchases, the discount (red, only when there is one), what he paid, where he stands */
    `<div class="isum${D ? ' n4' : ''}"><div class="ic">${ln('إجمالي المشتريات:', money(gross), 'big')}</div>${D ? `<div class="ic dsc">${ln('الخصم:', money(D), 'big')}</div>` : ''}<div class="ic">${ln('إجمالي المسدَّد:', money(setl), 'big')}</div><div class="ic">${last < -0.004 ? ln('رصيد العميل (له):', money(-last), 'big') : last > 0.004 ? ln('المتبقي على العميل (عليه):', money(last), 'big') : ln('المتبقي على العميل:', money(0), 'big')}</div></div>`, 'inv');
}

/* the statement as an Excel sheet, laid out like custPaper: the same columns, the place headings, the balance in «دائن (له)» or «مدين (عليه)», the boxes under the table */
function custSheet(c) {
  const mv = custLedger(c), total = customerTotal(c.id), nInv = db.invoices.filter(i => i.customerId === c.id && i.status !== 'void').length;
  const D = mv.dsc > 0.004 ? mv.dsc : 0, last = round2((mv.length ? mv[mv.length - 1].bal : 0) - D), setl = round2(total - last), gross = round2(total + D);
  const bcs = (bl, none) => { bl = round2(bl); return none ? ['', ''] : bl < 0 ? [{ v: -bl, b: 1 }, ''] : ['', { v: bl, b: 1 }]; }; /* the number goes under the column it belongs to; a settled account shows 0 under «مدين» */
  const row = (m, bl) => {
    const bc = bcs(bl, m.info), am = m.debit || m.credit, d = m.d ? ymd(m.d) : '';
    if (m.info) return [d, bnX(m.t), '', '', '', '', ...bc];
    if (m.it) return [d, bnX(m.t), { v: m.it.q, unit: m.it.u }, m.it.p, m.credit ? -am : am, '', ...bc];
    if (m.g) return [d, bnX(m.t), '', '', m.credit ? -am : am, '', ...bc];
    if (m.credit) return [d, bnX(bnL(m.t, m.lbl)), '', '', '', { v: am, lbl: m.lbl && m.lbl !== 'مدفوع' ? lbA(m.lbl) : '', b: 1, color: XL_GREEN }, ...bc];
    return [d, bnX(bnL(m.t, m.lbl)), '', '', { v: am, lbl: lbA(m.lbl) }, '', ...bc]; /* money that raises what he owes again (cash given back, a collection moved away) */
  };
  let blocks;
  if (!mv.some(m => m.pl)) blocks = [{ t: '', rows: mv.map(m => row(m, m.bal)) }];
  else { const order = custPlaces(c).filter(p => mv.some(m => m.pl === p)); if (mv.some(m => !m.pl)) order.push(''); blocks = order.map(p => ({ t: p ? 'المكان: ' + p : 'بدون مكان', rows: mv.filter(m => m.pl === p).map(m => row(m, m.pbal)) })); }
  const bal = last < -0.004 ? ['رصيد العميل (له)', -last] : last > 0.004 ? ['المتبقي على العميل (عليه)', last] : ['المتبقي على العميل', 0];
  return { name: 'كشف_حساب_' + c.name, title: 'كشف حساب عميل', blocks, noFilter: true,
    head: ['التاريخ', 'البيان', 'الكمية', 'سعر البيع', 'الإجمالي', 'مدفوع', 'دائن (له)', 'مدين (عليه)'],
    info: [['اسم العميل', c.name], c.code && ['الكود', c.code], c.phone && ['الموبايل', c.phone], c.address && ['العنوان', c.address], ['عدد الفواتير', nInv], ['التاريخ', ymd(new Date())]].filter(Boolean),
    foot: [[['إجمالي المشتريات', { v: gross, unit: 'جنيه' }], ...(D ? [['الخصم', { v: D, unit: 'جنيه', b: 1, color: XL_DISC }]] : []), ['إجمالي المسدَّد', { v: setl, unit: 'جنيه', b: 1 }]], [[bal[0], { v: bal[1], unit: 'جنيه', b: 1 }]]] };
}

function detailPaper(from, to) {
  const L = ledger(from, to), out = L.out.concat(L.tip).sort((a, b) => a.d.localeCompare(b.d));
  const inT = sumA(L.inn), cinT = sumA(L.cin), mgT = sumA(L.mg), outT = round2(sumA(out) + mgT);
  const mix = [...L.cin.map(e => ({ ...e, s: 'داخل' })), ...L.inn.map(e => ({ ...e, s: 'داخل' })), ...out.map(e => ({ ...e, s: 'خارج' })), ...L.mg.map(e => ({ ...e, s: 'خارج' }))];
  return paper(repHeader('A', 'تقرير تفصيلي للحركة', from, to) +
    (L.cin.length ? secA(CIN_TD, L.cin, CIN_TT, cinT) + (mixLines(L.cin) ? `<div class="rsum mx">${mixLines(L.cin)}</div>` : '') : '') +
    secA('تفاصيل الداخل (التحصيلات)', L.inn, 'إجمالي تفاصيل الداخل (التحصيلات)', inT) + (mixLines(L.inn) ? `<div class="rsum mx">${mixLines(L.inn)}</div>` : '') +
    secA('تفاصيل الخارج (المصروفات)', out, 'إجمالي تفاصيل الخارج (المصروفات)', sumA(out)) +
    (L.mg.length ? secA('تفاصيل التسليم للإدارة', L.mg, 'إجمالي التسليم للإدارة', mgT) + (mixLines(L.mg) ? `<div class="rsum mx">${mixLines(L.mg)}</div>` : '') : '') +
    (taxOn() ? secA('تفاصيل القيمة المضافة', L.vat, 'إجمالي تفاصيل القيمة المضافة', sumA(L.vat)) : '') +
    secA('تفاصيل الأرباح', L.gain, 'إجمالي تفاصيل الأرباح', sumA(L.gain)) +
    (L.loss.length ? secA('تفاصيل الخسائر', L.loss, 'إجمالي تفاصيل الخسائر', sumA(L.loss)) : '') +
    secA('تفاصيل صافي الخزينة', mix, 'إجمالي تفاصيل صافي الخزينة', round2(inT + cinT - outT), { sign: true }) +
    secA('تفاصيل الإجمالي الكلي للحركة', mix, 'إجمالي تفاصيل الإجمالي الكلي للحركة', round2(inT + cinT + outT), { sign: true, unit: 'حركة' }));
}

function shiftPaper(from, to, carry) {
  const L = ledger(from, to), inT = sumA(L.inn), cinT = sumA(L.cin), outT = sumA(L.out), tipT = sumA(L.tip), mgT = sumA(L.mg), net = round2(inT + cinT - outT - tipT - mgT - carry);
  return paper(repHeader('B', 'تقفيل وردية', from, to) +
    (L.cin.length ? secB(CIN_TD, L.cin, CIN_TT, cinT) : '') +
    secB('تفاصيل الداخل (التحصيلات)', L.inn, 'إجمالي الداخل (التحصيلات)', inT) +
    secB('تفاصيل الخارج (المصروفات ودفعات الموردين)', L.out, 'إجمالي الخارج (المصروفات ودفعات الموردين)', outT) +
    secB('تفاصيل الإكراميات والخصومات', L.tip, 'إجمالي الإكراميات والخصومات', tipT) +
    (L.mg.length ? secB('تفاصيل التسليم للإدارة', L.mg, 'إجمالي التسليم للإدارة', mgT) : '') +
    (taxOn() ? secB('تفاصيل القيمة المضافة', L.vat, 'إجمالي القيمة المضافة', sumA(L.vat)) : '') +
    secB('تفاصيل الأرباح', L.gain, 'إجمالي الأرباح', sumA(L.gain)) +
    secB('تفاصيل الخسائر', L.loss, 'إجمالي الخسائر', sumA(L.loss)) +
    `<div class="rsum">${cinT ? `<div><span>${CIN_T}:</span><b>${fmt(cinT)} جنيه</b></div>${mixLines(L.cin)}` : ''}<div><span>إجمالي الداخل:</span><b>${fmt(inT)} جنيه</b></div>${mixLines(L.inn)}<div><span>إجمالي الخارج:</span><b>${fmt(outT)} جنيه</b></div>` +
    (tipT ? `<div><span>الإكراميات والخصومات المدفوعة:</span><b>${fmt(tipT)} جنيه</b></div>` : '') + (mgT ? `<div><span>التسليم للإدارة:</span><b>${fmt(mgT)} جنيه</b></div>${mixLines(L.mg)}` : '') +
    `<div><span>الخصم المرحَّل للوردية التانية:</span><b>${fmt(carry)} جنيه</b></div><div class="fin"><span>الإجمالي الصافي:</span><b>${fmt(net)} جنيه</b></div></div>`);
}

/* window.print() does nothing in an iPhone / iPad program added to the Home Screen (no print dialog there), so the paper goes out as a PDF through the share sheet, which has «Print», «Save to Files»… */
const printBroken = () => { try { return (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) && (navigator.standalone === true || matchMedia('(display-mode: standalone)').matches); } catch (e) { return false; } };
const printPapers = () => { const h = $('#phost'), b = $('#paper'), L = h ? [...h.querySelectorAll('.paper')] : b && b.querySelector('.paper') ? [...b.querySelectorAll('.paper')] : [...document.querySelectorAll('.paper')].filter(p => !p.closest('.noprint, #modals')); return L.map(p => p.outerHTML).join(''); };
async function printShare(name, html, base, no) {
  html = html || printPapers(); if (!html) return window.print();
  base = base || name; no = no || ''; const key = pdfKey(base, no, html); let file = PDF_CACHE.get(key) || null;
  if (!file) { toast('جاري تجهيز الملف للطباعة…'); try { file = await paperPdf(html, pdfName(base, no)); PDF_CACHE.set(key, file); } catch (e) { return toast('تعذّر تجهيز ملف الطباعة'); } }
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file] }); return; } catch (e) { if (e && e.name === 'AbortError') return; /* not allowed after the wait: the file is saved instead */ } }
  downloadFile(file.name, file, 'application/pdf'); toast('تم تجهيز ملف PDF — افتحه واطبعه من زرار المشاركة', 'ok');
}
function printRep(name, html, base, no) { /* the PDF file name comes from the page title */
  if (printBroken()) return printShare(name, html, base, no);
  const t0 = document.title; document.title = trText(name); /* English UI: the saved-PDF name is English too */
  const done = () => { document.title = t0; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done); setTimeout(done, 60000);
  window.print();
}

/* both printable reports share the same date controls */
function repScreen(v, o) {
  const today = ymd(new Date()), first = o.month ? ymd(new Date(new Date().getFullYear(), new Date().getMonth(), 1)) : today; /* a monthly statement opens on this month */
  v.innerHTML = subHead(o.title) + `<div class="stack">
    <section class="panel noprint"><div class="form-grid">
      <div class="field"><label for="r-from">من تاريخ</label><input id="r-from" class="inp" type="date" value="${first}"></div>
      <div class="field"><label for="r-to">إلى تاريخ</label><input id="r-to" class="inp" type="date" value="${today}"></div>
      ${o.carry ? `<div class="field"><label for="r-carry">الخصم المرحَّل للوردية التانية (جنيه)</label><input id="r-carry" class="inp" inputmode="decimal" value="0" autocomplete="off"></div>` : ''}
    </div>
    <div class="actions" style="margin-top:14px"><button class="mini" data-q="today" type="button">اليوم</button><button class="mini" data-q="yday" type="button">أمس</button><button class="mini" data-q="month" type="button">هذا الشهر</button>${o.month ? '<button class="mini" data-q="pmonth" type="button">الشهر الماضي</button>' : ''}
      ${window.claude ? '' : `<button class="btn" id="r-print" type="button">${ICON.printer}<span>طباعة / حفظ PDF</span></button>`}${o.csv ? `<button class="btn ghost" id="r-exp" type="button"><span>تصدير Excel</span></button>` : ''}</div>
    ${window.claude ? '<p class="lbl" style="margin:12px 0 0">الطباعة وحفظ PDF متاحان من الملف الكامل للبرنامج.</p>' : ''}</section>
    <div id="paper"></div></div>`;
  const rng = () => { let a = $('#r-from').value || today, b = $('#r-to').value || today; if (a > b) [a, b] = [b, a]; return [a, b]; };
  const draw = () => { const [a, b] = rng(); $('#paper').innerHTML = o.make(a, b, o.carry ? num($('#r-carry').value) : 0); };
  ['r-from', 'r-to'].forEach(id => $('#' + id).addEventListener('change', draw));
  if (o.carry) $('#r-carry').addEventListener('input', e => { e.target.value = cleanNum(e.target.value); draw(); });
  $$('[data-q]', v).forEach(b => b.onclick = () => {
    const n = new Date(); let a = n, z = n;
    if (b.dataset.q === 'yday') a = z = new Date(n.getFullYear(), n.getMonth(), n.getDate() - 1);
    if (b.dataset.q === 'month') a = new Date(n.getFullYear(), n.getMonth(), 1);
    if (b.dataset.q === 'pmonth') { a = new Date(n.getFullYear(), n.getMonth() - 1, 1); z = new Date(n.getFullYear(), n.getMonth(), 0); }
    $('#r-from').value = ymd(a); $('#r-to').value = ymd(z); draw();
  });
  const pb = $('#r-print'); if (pb) pb.onclick = () => { const [a, b] = rng(); printRep(o.file(a, b)); };
  const xb = $('#r-exp'); if (xb) xb.onclick = () => { const [a, b] = rng(), x = o.csv(a, b); exportXLSX(x); };
  draw();
}
/* every line of the movement as a table for Excel: one block per section (money in, money out, ...), each with its own total */
function ledgerCSV(from, to, name) {
  const L = ledger(from, to), S = { cin: CIN_T, inn: 'داخل (تحصيلات)', out: 'خارج (مصروفات وموردين)', tip: 'إكراميات وخصومات', mg: 'تسليم للإدارة', vat: 'قيمة مضافة', gain: 'أرباح', loss: 'خسائر' };
  const blocks = []; Object.keys(S).forEach(k => { if (k === 'vat' && !taxOn()) return; if (L[k].length) blocks.push({ t: S[k], rows: L[k].map(e => [ymd(e.d), e.w + (pmIs(e.m) ? ' — ' + pmName(e.m) : ''), e.a]) }); });
  return { name: name + '_' + from + '_' + to, head: ['التاريخ', 'البيان', 'المبلغ'], blocks, sum: [2] };
}
screens.repDetail = (p, v) => repScreen(v, { title: 'تقرير تفصيلي للحركة', make: detailPaper, csv: (a, b) => ledgerCSV(a, b, 'تقرير_تفصيلي'), file: (a, b) => `تقرير_تفصيلي_${a}_الى_${b}` });
screens.repShift = (p, v) => repScreen(v, { title: 'تقفيل وردية', carry: true, make: shiftPaper, csv: (a, b) => ledgerCSV(a, b, 'تقفيل_وردية'), file: a => `تقفيل_${a}` });
