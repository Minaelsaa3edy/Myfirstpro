/* ---------- A report in every section (8.25): print / PDF / Excel from one data model ----------
   EXPORTS[key](arg) is the one place that knows what a list holds. The Excel file, the printed paper and the PDF file are all made from it,
   so the three always show the same names and numbers. The paper is a normal A4 sheet: the letterhead, the title, an info box, the table
   (with its totals) and the summary boxes — drawn by the same PDF drawer as the invoice. */
const LST_TITLE = {
  inv: 'قائمة الفواتير', cust: 'كشف العملاء وأرصدتهم', supp: 'كشف الموردين وأرصدتهم', suppGoods: 'بضاعة الموردين', stock: 'تقرير المخزن والأرصدة الحالية',
  exp: 'تقرير المصروفات', cin: 'تقرير الداخل للدرج', pmv: 'تقرير السحب والتحويل والتسليم للإدارة', plc: 'كشف أرصدة الأماكن اليومي', pay: 'تقرير التحصيلات', ret: 'تقرير المرتجعات', bk: 'تقرير الحجوزات', close: 'جرد الخزينة', audit: 'سجل التعديلات',
  aging: 'أعمار الديون', emps: 'كشف الموظفين', shop: 'قائمة المشتريات', counts: 'تقرير جرد المخزن', damages: 'تقرير التالف', cheques: 'تقرير الشيكات', quotes: 'عروض الأسعار', deliveries: 'تقرير التوصيل',
};
/* the columns the paper shows (an A4 sheet fits about seven); Excel always has all of them */
const LST_PC = {
  inv: [0, 1, 2, 5, 6, 10, 14], suppGoods: [0, 1, 2, 4, 5, 6], ret: [0, 1, 2, 3, 4, 5, 6], bk: [0, 1, 3, 4, 5, 6, 7], close: [0, 1, 2, 3, 4, 5, 6],
  aging: [0, 2, 3, 4, 5, 6], counts: [0, 2, 3, 4, 5, 6, 8], damages: [0, 1, 2, 4, 6, 7], cheques: [0, 1, 2, 3, 4, 5, 6], quotes: [0, 1, 2, 4, 5, 6], deliveries: [0, 3, 4, 5, 7, 8],
};
/* the model of one list: what Excel, the paper and the PDF are all made from */
const expModel = (key, arg) => { const x = EXPORTS[key](arg); return { sum: EXP_SUM[key], title: LST_TITLE[key], pcols: LST_PC[key], ...x }; };
const lstTitle = x => x.title || String(x.name).replace(/(_\d{4}-\d{2}-\d{2})+$/, '').replace(/_/g, ' ');
/* a list with a search box on its screen: the report follows what the box says */
const lstQ = () => { const q = $('#q'); return q ? q.value.trim() : ''; };
const DOC_ARG = { cust: lstQ, inv: lstQ, supp: lstQ, emps: lstQ, suppGoods: () => { const s = $('#sl-sup'); return s ? s.value : ''; } };
const docArg = b => { const f = DOC_ARG[b.dataset.exp || b.dataset.dk]; return f ? f() : b.dataset.arg; };

/* the item card, the supplier's statement and the employees list: models of their own (the card and the statement take an id) */
EXPORTS.card = arg => { /* arg: «item id|warehouse id» */
  const [id, wid] = String(arg || '').split('|'), it = itemById(id) || { id: '', name: '', unit: '', cost: 0 }, c = it.id ? itemMovements(it, wid || '') : { open: 0, mv: [], cur: 0 };
  const inn = round3(c.mv.filter(m => m.q > 0).reduce((a, m) => a + m.q, 0)), out = round3(-c.mv.filter(m => m.q < 0).reduce((a, m) => a + m.q, 0));
  return { name: trText('كارت صنف') + '_' + trText(it.name), title: 'كارت الصنف', head: ['التاريخ', 'البيان', 'وارد', 'صادر', 'الرصيد'], noFilter: true,
    rows: [...(c.open !== 0 ? [['', 'رصيد سابق (قبل بدء التسجيل)', c.open > 0 ? c.open : '', c.open < 0 ? -c.open : '', c.open]] : []), ...c.mv.map(m => [ymd(m.d), m.t, m.q > 0 ? m.q : '', m.q < 0 ? -m.q : '', m.bal])],
    info: [['الصنف', it.name], ['الرصيد الحالي', fmtq(c.cur) + ' ' + it.unit], ...(wid ? [['المخزن', whName(wid)]] : []), ['تاريخ التقرير', ymd(new Date())]],
    foot: [[['إجمالي الوارد', inn], ['إجمالي الصادر', out]]] };
};
EXPORTS.supStmt = id => {
  const s = supById(id) || { id: '', name: '', code: '', phone: '' }, mv = s.id ? supLedger(s) : [], bal = s.id ? supBal(s.id) : 0;
  return { name: 'كشف_حساب_مورد_' + s.name, title: 'كشف حساب مورد', head: ['التاريخ', 'الصنف / البيان', 'الكمية', 'السعر', 'مشتريات', 'مدفوع', 'الرصيد'], noFilter: true,
    rows: mv.map(m => m.credit ? [ymd(m.d), m.t, '', '', '', m.credit, m.bal] : [ymd(m.d), m.name, { v: m.qty, unit: m.unit }, m.cost, m.debit, '', m.bal]), sum: [4, 5],
    info: [['اسم المورد', s.name], ...(s.code ? [['الكود', s.code]] : []), ...(s.phone ? [['الموبايل', s.phone]] : []), ['تاريخ التقرير', ymd(new Date())]],
    foot: [[['إجمالي المشتريات', fj(s.id ? supBought(s.id) : 0)], ['إجمالي المدفوع', fj(s.id ? supPaid(s.id) : 0)]], [bal < 0 ? ['مدفوع مقدّماً للمورد', fj(-bal)] : ['المتبقي للمورد', fj(bal)]]] };
};
EXPORTS.emps = q => {
  q = String(q || '').trim(); const ym = ymNow(), list = db.emps.filter(e => !q || e.name.includes(q)), net = list.reduce((a, e) => a + empMonth(e, ym).net, 0);
  return { name: 'الموظفين', title: 'كشف الموظفين', head: ['الموظف', 'الوظيفة', 'الراتب الأساسي', 'نوع الراتب', 'صافي ' + ymLabel(ym)],
    rows: list.map(e => [e.name, e.job || '', e.salary, empPayLabel(e), empMonth(e, ym).net]), sum: [2, 4],
    info: [['تاريخ التقرير', ymd(new Date())], ['عدد الموظفين', list.length], ...(q ? [['بحث', q]] : [])], foot: [[['صافي ' + ymLabel(ym), fj(net)]]] };
};

/* ----- one cell, one column ----- */
const LST_ID = /^(الرقم|رقم|الكود|كود|الفاتورة)$|^رقم /, LST_QTY = /^(الكمية|وارد|صادر|الرصيد)/, LST_DATE = /^\d{4}-\d{2}-\d{2}/;
const lstOf = c => c && typeof c === 'object' && !Array.isArray(c) ? c : { v: c };
const lstNum = (c, qty) => { const v = round3(c.v) || 0; let s = qty ? fmtq(v) : fmt(v); if (v < 0) s = '⁦' + s + '⁩'; return (c.lbl ? trText(c.lbl) + ' ' : '') + s + (c.unit ? ' ' + trText(c.unit) : ''); };
const lstTxt = (c, qty) => typeof c.v === 'number' ? (isFinite(c.v) ? lstNum(c, qty) : '') : c.v == null ? '' : LST_DATE.test(c.v) ? '\u2066' + c.v + '\u2069' : trText(String(c.v)); /* a date keeps its order (2026-11-17) inside right-to-left text */

/* the table: a serial number column when it is short, the shown columns sized by what they hold, group headings, totals */
function lstTable(x) {
  const blocks = x.blocks || [{ t: '', rows: x.rows }], all = blocks.flatMap(b => b.rows), CWP = 718; /* the width of the A4 sheet inside its margins (px) */
  let pc = x.pcols && x.pcols.length ? x.pcols : x.head.map((_, j) => j); if (pc.length > 8) pc = pc.slice(0, 8);
  const ser = pc.length <= 6 && all.length > 1, off = ser ? 1 : 0, N = pc.length + off;
  const meta = pc.map(j => {
    const h0 = String(x.head[j]), vals = all.map(r => lstOf(r[j])).filter(c => c.v !== '' && c.v != null);
    const nums = vals.filter(c => typeof c.v === 'number'), strs = vals.filter(c => typeof c.v === 'string');
    const id = LST_ID.test(h0), qty = LST_QTY.test(h0) || vals.some(c => c.unit);
    const kind = nums.length && !strs.length ? 'num' : strs.length && !nums.length && strs.every(c => LST_DATE.test(c.v)) ? 'dt' : 'txt';
    const txt = vals.map(c => lstTxt(c, qty)), hd = trText(h0);
    const len = txt.reduce((m, s) => Math.max(m, s.length), 0), avg = txt.length ? txt.reduce((a, s) => a + s.length, 0) / txt.length : 0;
    const word = txt.reduce((m, s) => Math.max(m, ...s.split(/\s+/).map(w => w.length)), 0), hw = Math.max(...hd.split(/\s+/).map(w => w.length), 1);
    const fixed = kind !== 'txt' || id, min = Math.max(hw * 7.8, word * 6.8) + 14, want = fixed ? len * 6.8 + 14 : Math.min(Math.max(avg * 1.2, 6), 32) * 6.6 + 14;
    return { j, hd, qty, kind, cls: kind === 'num' ? 'nu' : kind === 'txt' && !id && avg > 9 ? 'nm' : '', min, ideal: Math.max(min, want, Math.min(hd.length * 7.8 + 14, min * 1.6)) };
  });
  const mins = [...(ser ? [34] : []), ...meta.map(m => m.min)], ideals = [...(ser ? [34] : []), ...meta.map(m => m.ideal)];
  const sMin = mins.reduce((a, b) => a + b, 0), sIdeal = ideals.reduce((a, b) => a + b, 0);
  const wpx = sIdeal <= CWP ? ideals.map(v => v + (CWP - sIdeal) * v / sIdeal) : sMin >= CWP ? mins.map(v => v * CWP / sMin) : mins.map((v, i) => v + (ideals[i] - v) * (CWP - sMin) / (sIdeal - sMin));
  const pct = wpx.map(v => Math.round(v / CWP * 1000) / 10); pct[N - 1] = Math.round((100 - pct.slice(0, N - 1).reduce((a, b) => a + b, 0)) * 10) / 10;
  const sj = (x.sum || []).filter(j => pc.includes(j)), spos = sj.map(j => pc.indexOf(j) + off), first = spos.length ? Math.min(...spos) : 0;
  const totRow = (label, rows) => {
    if (!spos.length || first < 1 || !rows.length) return '';
    let cs = `<td colspan="${first}">${esc(trText(label))}</td>`;
    for (let p = first; p < N; p++) {
      const i = spos.indexOf(p); if (i < 0) { cs += '<td></td>'; continue; }
      const t = round3(rows.reduce((s, r) => { const c = lstOf(r[sj[i]]); return s + (typeof c.v === 'number' && isFinite(c.v) ? c.v : 0); }, 0));
      cs += `<td>${esc(lstNum({ v: t }, meta[p - off].qty))}</td>`;
    }
    return `<tr class="plh">${cs}</tr>`;
  };
  let k = 0; const body = [];
  blocks.forEach(b => {
    if (b.t) body.push(`<tr class="plh"><td colspan="${N}">${esc(trText(b.t))}</td></tr>`);
    b.rows.forEach(r => { k++; body.push('<tr>' + (ser ? `<td>${k}</td>` : '') + meta.map(m => { const s = lstTxt(lstOf(r[m.j]), m.qty); return `<td${m.cls ? ` class="${m.cls}"` : ''}>${esc(s)}</td>`; }).join('') + '</tr>'); });
    if (blocks.length > 1) body.push(totRow('الإجمالي', b.rows));
  });
  if (blocks.length === 1) body.push(totRow('الإجمالي', all));
  if (!all.length) body.push(`<tr><td colspan="${N}" class="empty">${esc(trText('لا توجد بيانات'))}</td></tr>`);
  return `<table class="itbl lst"><colgroup>${pct.map(p => `<col style="width:${p}%">`).join('')}</colgroup><thead><tr>${ser ? `<th>${LANG === 'en' ? '#' : 'م'}</th>` : ''}${meta.map(m => `<th>${esc(m.hd)}</th>`).join('')}</tr></thead><tbody>${body.join('')}</tbody></table>`;
}
const lstInfo = (x, cnt) => `<div class="ibox">${(x.info || [['تاريخ التقرير', ymd(new Date())], ['عدد السجلات', cnt]]).filter(Boolean).map(([k, v]) => `<span>${esc(trText(k))}: <b>${esc(lstTxt(lstOf(v), false))}</b></span>`).join('')}</div>`;
const lstFoot = x => { const f = (x.foot || []).filter(b => b && b.length); return f.length ? `<div class="isum">${f.map(box => `<div class="ic">${box.map(([k, c], i) => `<div class="l${i === box.length - 1 ? ' big' : ''}"><span>${esc(trText(k))}:</span><b>${esc(lstTxt(lstOf(c), false))}</b></div>`).join('')}</div>`).join('')}</div>` : ''; };
/* the whole paper */
function listPaper(x) {
  const cnt = x.blocks ? x.blocks.reduce((s, b) => s + b.rows.length, 0) : x.rows.length;
  return paper(letterhead(letterOf()) + `<div class="rt"><h3>${esc(trText(lstTitle(x)))}</h3></div>` + lstInfo(x, cnt) + lstTable(x) + lstFoot(x), 'lstp');
}

/* ----- the three buttons ----- */
const docBtns = (key, arg = '') => window.claude ? '' :
  `<button class="btn" data-doc="print" data-dk="${key}" data-arg="${esc(arg)}" type="button">${ICON.printer}<span>طباعة / حفظ PDF</span></button>` +
  `<button class="btn ghost" data-doc="pdf" data-dk="${key}" data-arg="${esc(arg)}" type="button"><span>تصدير PDF</span></button>` +
  `<button class="btn ghost" data-exp="${key}" data-arg="${esc(arg)}" type="button"><span>تصدير Excel</span></button>`;
const docBar = (key, arg = '', up = false) => window.claude ? '' : `<div class="actions docbar noprint" style="margin:${up ? '0 0 14px' : '14px 0 0'}">${docBtns(key, arg)}</div>`; /* up: above a long list, so it is seen without scrolling past every row */

/* print: the paper goes into a host that is the only thing the printer sees (the screen behind it is hidden while printing) */
function lstPrint(html, name) {
  if (printBroken()) { const t = document.createElement('div'); t.innerHTML = html; const fb = $('.fsbar', t); if (fb) fb.remove(); return printShare(name, t.innerHTML); } /* Home Screen program on iPhone: no print dialog, the share sheet instead */
  const old = $('#phost'); if (old) old.remove();
  const host = document.createElement('div'); host.id = 'phost'; host.innerHTML = html; const fb = $('.fsbar', host); if (fb) fb.remove();
  document.body.appendChild(host); document.body.classList.add('plp');
  const clean = () => { window.removeEventListener('afterprint', clean); document.body.classList.remove('plp'); host.remove(); };
  window.addEventListener('afterprint', clean); setTimeout(clean, 600000);
  printRep(name);
}
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-doc]'); if (!b || b.disabled || !EXPORTS[b.dataset.dk]) return;
  const x = expModel(b.dataset.dk, docArg(b)), html = listPaper(x), title = lstTitle(x), day = ymd(new Date());
  if (b.dataset.doc === 'print') return lstPrint(html, fileSafe(trText(title)) + '_' + day);
  b.disabled = true;
  try { await pdfSave(html, title, day); logA('export', trText(title) + ' (PDF)'); save(); } finally { b.disabled = false; }
});
