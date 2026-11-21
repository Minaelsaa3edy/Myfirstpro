/* ---------- Home ---------- */
/* TILES is declared in 98-nav.js */

/* Greeting text based on time of day */
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'صباح الخير';
  if (h < 17) return 'النهار الجميل';
  if (h < 20) return 'مساء الخير';
  return 'مساء النور';
}

function tickClock() {
  const c = $('#clk'); if (!c) return;
  const d = new Date();
  const [t, ap] = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false }).split(' ');
  c.textContent = t; if ($('#ampm')) $('#ampm').textContent = ap || ''; if ($('#dt')) $('#dt').textContent = dateAr(d);
}
setInterval(tickClock, 1000);

/* Build bar-chart SVG for last 6 months income/expense */
function homeChart() {
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ y: d.getFullYear(), m: d.getMonth(), label: d.toLocaleDateString('ar-EG', { month: 'short' }) });
  }
  const data = months.map(mo => {
    const inAmt = db.invoices.filter(inv => inv.status !== 'void' && inv.date && new Date(inv.date).getFullYear() === mo.y && new Date(inv.date).getMonth() === mo.m).reduce((s, inv) => s + (inv.net || 0), 0);
    const outAmt = (db.expenses || []).filter(e => e.date && new Date(e.date).getFullYear() === mo.y && new Date(e.date).getMonth() === mo.m).reduce((s, e) => s + (e.amount || 0), 0);
    return { label: mo.label, in: inAmt, out: outAmt };
  });
  const maxVal = Math.max(...data.map(d => Math.max(d.in, d.out)), 1);
  const fmtK = v => v >= 1000 ? Math.round(v / 1000) + 'k' : Math.round(v);
  const W = 480, H = 160, PAD = 10, BAR_W = 28, GAP = (W - PAD * 2) / 6;
  const bars = data.map((d, i) => {
    const x = PAD + i * GAP + (GAP - BAR_W * 2 - 4) / 2;
    const hIn = Math.round((d.in / maxVal) * (H - 30));
    const hOut = Math.round((d.out / maxVal) * (H - 30));
    return `<rect x="${x}" y="${H - 20 - hIn}" width="${BAR_W}" height="${hIn}" rx="3" fill="var(--chart-in)"/>
      <rect x="${x + BAR_W + 4}" y="${H - 20 - hOut}" width="${BAR_W}" height="${hOut}" rx="3" fill="var(--chart-out)"/>
      <text x="${x + BAR_W}" y="${H - 4}" text-anchor="middle" font-size="10" fill="var(--fg2)">${d.label}</text>`;
  }).join('');
  const grid = [maxVal, maxVal / 2, 0].map(v => {
    const y = H - 20 - Math.round((v / maxVal) * (H - 30));
    return `<line x1="${PAD}" y1="${y}" x2="${W - PAD}" y2="${y}" stroke="var(--line)" stroke-dasharray="3,3"/>
      <text x="${PAD - 2}" y="${y + 4}" text-anchor="end" font-size="9" fill="var(--fg3)">${fmtK(v)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${grid}${bars}</svg>`;
}

screens.home = (p, v) => {
  const nl = notifications(), n = nl.length;

  /* ── KPI data ── */
  const totalDebt = db.customers.reduce((s, c) => s + customerDebt(c.id), 0);
  const activeCustomers = db.customers.filter(c => customerDebt(c.id) > 0).length;
  const thirtyDays = new Date(); thirtyDays.setDate(thirtyDays.getDate() + 30);
  const due30 = db.invoices.filter(i => i.status !== 'void' && i.dueDate && new Date(i.dueDate) <= thirtyDays).reduce((s, i) => s + (i.remaining || 0), 0);
  const latePay = db.invoices.filter(i => i.status !== 'void' && i.dueDate && new Date(i.dueDate) < new Date() && (i.remaining || 0) > 0).reduce((s, i) => s + (i.remaining || 0), 0);
  const lateCount = db.invoices.filter(i => i.status !== 'void' && i.dueDate && new Date(i.dueDate) < new Date() && (i.remaining || 0) > 0).length;
  const cashIn = db.payments.reduce((s, p) => s + (p.amount || 0), 0);
  const cashOut = (db.expenses || []).reduce((s, e) => s + (e.amount || 0), 0);
  const cashBalance = cashIn - cashOut;

  /* ── Chart ── */
  const chart = homeChart();

  v.innerHTML = `<div class="dash-page">

    <!-- Top header: greeting + time + date + action buttons -->
    <div class="dash-header">
      <div class="dash-greeting">
        <div class="dash-greet-text">${greeting()}</div>
        <div class="dash-clock-row"><span class="dash-time" id="clk">00:00</span></div>
        <div class="dash-date" id="dt"></div>
      </div>
      <div class="dash-actions">
        <button class="dash-act-btn dash-act-in" data-act="go" data-to="invMenu">
          <span class="dab-icon">+</span> وارد
        </button>
        <button class="dash-act-btn dash-act-out" data-act="go" data-to="expenses">
          <span class="dab-icon">−</span> صادر
        </button>
        <button class="dash-act-btn dash-act-new" data-act="go" data-to="invForm" data-p='{"mode":"new"}'>
          <span class="dab-icon">+</span> عميل جديد
        </button>
      </div>
    </div>

    ${backupDue() ? `<div class="note" style="margin:0 0 12px"><span>${backupDays() === Infinity ? 'لم تحمّل نسخة احتياطية من بياناتك بعد.' : `مرّ ${backupDays()} يوم على آخر نسخة احتياطية.`}</span><button class="mini" data-act="bkNow" type="button">تحميل نسخة الآن</button></div>` : ''}
    <div id="bk-perm"></div>

    <!-- 4 KPI cards -->
    <div class="kpi-row">
      <div class="kpi-card kpi-debt" data-act="go" data-to="debts" role="button" tabindex="0">
        <div class="kpi-top">
          <span class="kpi-label">متبقي عند العملاء</span>
          <span class="kpi-icon kpi-ic-blue">${ICON.debts}</span>
        </div>
        <div class="kpi-num">${fmt(totalDebt)}</div>
        <div class="kpi-unit">جنيه</div>
        <div class="kpi-sub">${activeCustomers} عميل نشط</div>
      </div>
      <div class="kpi-card kpi-due30" data-act="go" data-to="debts" role="button" tabindex="0">
        <div class="kpi-top">
          <span class="kpi-label">مستحق خلال 30 يوم</span>
          <span class="kpi-icon kpi-ic-teal">${ICON.cheque}</span>
        </div>
        <div class="kpi-num">${fmt(due30)}</div>
        <div class="kpi-unit">جنيه</div>
        <div class="kpi-sub">${due30 > 0 ? 'أقساط جاية من العملاء' : 'مفيش أقساط جاية'}</div>
      </div>
      <div class="kpi-card kpi-late" data-act="go" data-to="debts" role="button" tabindex="0">
        <div class="kpi-top">
          <span class="kpi-label">أقساط متأخرة</span>
          <span class="kpi-icon kpi-ic-red">${ICON.docs}</span>
        </div>
        <div class="kpi-num">${fmt(latePay)}</div>
        <div class="kpi-unit">جنيه</div>
        <div class="kpi-sub">${lateCount > 0 ? `${lateCount} فاتورة متأخرة` : 'مفيش متأخرات'}</div>
      </div>
      <div class="kpi-card kpi-cash" data-act="go" data-to="reports" role="button" tabindex="0">
        <div class="kpi-top">
          <span class="kpi-label">رصيد الخزنة</span>
          <span class="kpi-icon kpi-ic-gold">${ICON.reports}</span>
        </div>
        <div class="kpi-num">${fmt(cashBalance)}</div>
        <div class="kpi-unit">جنيه</div>
        <div class="kpi-sub">وارد ${fmt(cashIn)} · صادر ${fmt(cashOut)}</div>
      </div>
    </div>

    <!-- Notifications + Chart -->
    <div class="dash-bottom">
      <section class="dash-notif" aria-label="التنبيهات">
        <div class="dash-panel-head">
          <span>${ICON.bell} التنبيهات</span>
          ${n ? `<b class="notif-cnt">${n}</b>` : ''}
        </div>
        <div class="notif-list">${n
          ? nl.slice(0, 8).map(x => `<button class="notif-item" data-act="go" data-to="${x.to}"><i class="notif-dot" style="background:${x.c}"></i><span>${esc(x.t)}</span></button>`).join('')
          : '<div class="notif-empty">لا توجد تنبيهات</div>'}</div>
      </section>
      <section class="dash-chart" aria-label="المبيعات والمصروفات">
        <div class="dash-panel-head"><span>الوارد والصادر آخر 6 شهور</span></div>
        <div class="chart-wrap">${chart}</div>
        <div class="chart-legend">
          <span><i class="leg-dot" style="background:var(--chart-in)"></i> وارد</span>
          <span><i class="leg-dot" style="background:var(--chart-out)"></i> صادر</span>
        </div>
      </section>
    </div>
  </div>`;

  tickClock();
  /* make KPI cards keyboard-navigable */
  $$('.kpi-card[data-act]', v).forEach(c => { c.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); c.click(); } }; });
  if (BACKUP_OK && db.settings.autoDir) folderState().then(st => { const b = $('#bk-perm'); if (b && !st.ok) b.innerHTML = `<div class="note"><span>النسخ التلقائي متوقف حتى تسمح للمتصفح بالوصول للمجلد.</span><button class="mini" data-act="bkAllow" type="button">السماح</button></div>`; });
};

/* ---------- Inventory ---------- */
screens.inventory = (p, v) => {
  v.innerHTML = subHead('المخزن') + `<div class="menu">
    <button class="opt" style="--ac:var(--orange)" data-act="go" data-to="invAdd">${ICON.addStock}<span>إضافة بضاعة</span></button>
    <button class="opt" style="--ac:var(--teal)" data-act="go" data-to="invView">${ICON.viewStock}<span>عرض المخزن</span></button>
    <button class="opt" style="--ac:var(--sky)" data-act="go" data-to="itemCard">${ICON.card}<span>كارت الصنف</span></button>
    <button class="opt" style="--ac:var(--green)" data-act="go" data-to="stockCount">${ICON.count}<span>جرد المخزن</span></button>
    <button class="opt" style="--ac:var(--red)" data-act="go" data-to="damage">${ICON.damage}<span>تالف</span></button>
    <button class="opt" style="--ac:var(--amber)" data-act="go" data-to="shopList">${ICON.shop}<span>قائمة المشتريات${shopItems().length ? ` (${shopItems().length})` : ''}</span></button>
    ${db.settings.whOn && db.warehouses.length > 1 ? `<button class="opt" style="--ac:var(--purple)" data-act="go" data-to="transfer">${ICON.transfer}<span>تحويل بين المخازن</span></button>` : ''}
  </div>`;
};

/* edit an item's prices, home warehouse and minimum level (shared by the warehouse view and Settings → items) */
function itemEdit(it) {
  modal(`<h3>تعديل (${esc(it.name)}):</h3>
    <div class="field"><label for="e-base">الصنف</label><input id="e-base" class="inp" list="e-bases" value="${esc(it.base || it.name)}" autocomplete="off"><datalist id="e-bases">${dlOpts(baseList())}</datalist></div>
    <div class="field"><label for="e-type">النوع (القطر / النوع)</label><input id="e-type" class="inp" list="e-types" value="${esc(it.type || '')}" autocomplete="off"><datalist id="e-types">${dlOpts(typeList(it.base || ''))}</datalist></div>
    <div class="field"><label for="e-maker">اسم مصنع المنتج</label><input id="e-maker" class="inp" list="e-makers" value="${esc(it.maker || '')}" autocomplete="off"><datalist id="e-makers">${dlOpts(makerList())}</datalist></div>
    <div class="field"><label for="e-cost">سعر الشراء</label><input id="e-cost" class="inp" inputmode="decimal" value="${it.cost || 0}" autocomplete="off"></div>
    <div class="field"><label for="e-price">سعر البيع</label><input id="e-price" class="inp" inputmode="decimal" value="${it.price}" autocomplete="off"></div>
    <div class="field"><label for="e-wh">مخزن الصنف</label><div class="sel"><select id="e-wh">${db.warehouses.map(w => `<option value="${esc(w.id)}"${w.id === (it.home || WH0) ? ' selected' : ''}>${esc(w.name)}</option>`).join('')}</select></div></div>
    <div class="field"><label for="e-min">الحد الأدنى للمخزون (0 = بدون)</label><input id="e-min" class="inp" inputmode="decimal" value="${it.min || 0}" autocomplete="off"></div><div class="actions"><button class="btn ok" data-ok>تأكيد</button><button class="btn outline" data-no>إلغاء</button></div>`, (d, close) => {
    const inp = $('#e-price', d); setTimeout(() => inp.select(), 0);
    const mn = $('#e-min', d), cs = $('#e-cost', d); [inp, mn, cs].forEach(x => x.addEventListener('input', () => { x.value = cleanNum(x.value); }));
    const ok = async () => {
      const val = num(inp.value), m = Math.max(round3(num(mn.value)), 0), c = Math.max(round2(num(cs.value)), 0), h = $('#e-wh', d).value || WH0; if (val <= 0) return toast('اكتب سعر بيع أكبر من صفر');
      const base = $('#e-base', d).value.trim(), type = $('#e-type', d).value.trim(), maker = $('#e-maker', d).value.trim(), nm = itemJoin(base, type);
      if (!base) return toast('اكتب اسم الصنف');
      if (db.items.some(x => x.id !== it.id && sameItem(x, nm, it.unit))) return toast('هذا الصنف مسجل بالفعل بنفس الوحدة');
      close(); if (!await requireAdmin()) return;
      if (nm !== it.name || maker !== (it.maker || '') || type !== (it.type || '')) { logA('item_edit', it.name, nm + (maker ? ' — ' + maker : '')); it.name = nm; it.base = base; if (type) it.type = type; else delete it.type; if (maker) it.maker = maker; else delete it.maker; rememberMaker(maker); } /* the name change only renames the shelf item: invoices already issued keep the name they were written with */
      if (round2(val) !== it.price) logA('item_price', it.name, money(round2(val))); if (m !== (it.min || 0)) logA('item_min', it.name, fmtq(m));
      if (c !== (it.cost || 0)) logA('item_cost', it.name, money(c)); if (h !== (it.home || WH0)) logA('item_home', it.name, whName(h));
      it.price = round2(val); it.min = m; it.cost = c; it.home = h; save(); render(); toast('تم التعديل بنجاح', 'ok');
    };
    $('[data-ok]', d).onclick = ok; [inp, mn, cs].forEach(x => onEnter(x, ok)); $('[data-no]', d).onclick = close;
  });
}

screens.invView = (p, v) => {
  const multi = db.settings.whOn && db.warehouses.length > 1, edit = can('stock'), cost = edit; /* the purchase price and the edit button are for whoever works the stock; the sale price is shown to everyone who opens this screen */
  /* a small card per item (v8.38): name, quantity, the two prices and the two buttons; pressing the card opens the date of every addition with its own prices */
  const rows = db.items.map(i => { const mk = itemMakers(i); return `<tr class="clk iv${cost ? '' : ' nc'}" data-it="${i.id}" tabindex="0" role="button" aria-label="سجل إضافات ${esc(i.name)}">
    <td class="iv-n">${esc(i.name)}${i.min > 0 && i.qty <= i.min ? ' <span class="pill bad">تحت الحد</span>' : ''}${mk.length ? `<small class="whs"><span>المصنع: ${esc(mk.join(' - '))}</span></small>` : ''}</td><td class="muted iv-u">${esc(i.unit)}</td><td class="qty iv-q">${fmtq(i.qty)}<small class="iv-uu"> ${esc(i.unit)}</small>${multi ? `<small class="whs">${db.warehouses.filter(w => whQty(i, w.id) !== 0).map(w => `<span>${esc(w.name)}: ${fmtq(whQty(i, w.id))}</span>`).join(' · ')}</small>` : ''}</td>
    ${cost ? `<td class="val iv-c" data-l="شراء">${i.cost > 0 ? `${fmt(i.cost)}<small class="cur"> جنيه</small>` : '—'}</td>` : ''}<td class="val iv-p" data-l="بيع">${fmt(i.price)}<small class="cur"> جنيه</small></td>
    <td class="iv-a">${edit ? `<button class="edit" data-edit="${i.id}" aria-label="تعديل ${esc(i.name)}">${ICON.edit}</button> ` : ''}<button class="del" data-del="${i.id}" aria-label="حذف ${esc(i.name)}">${ICON.trash}</button></td></tr>`; }).join('');
  const cols = cost ? [20, 9, 19, 19, 19, 14] : [26, 12, 26, 22, 14];
  v.innerHTML = subHead('المخزن') + `<section class="panel">
    <h2 class="panel-t">عرض المخزن (الأرصدة الحالية)</h2>
    ${db.items.length ? `<p class="lbl" style="margin:0 0 12px"><span>اضغط على الصنف لتشوف تاريخ كل إضافة وسعرها.</span>${edit ? ' <span>ولتغيير سعر البيع أو الشراء اضغط زر التعديل جنب الصنف.</span>' : ''}</p>` : ''}
    ${db.items.length ? docBar('stock', '', true) : ''}
    <div class="tbl-wrap"><table class="grid inv-t">
      <colgroup>${cols.map(x => `<col style="width:${x}%">`).join('')}</colgroup>
      <thead><tr><th>الصنف</th><th>الوحدة</th><th>الكمية المتاحة</th>${cost ? '<th>سعر الشراء</th>' : ''}<th>سعر البيع</th><th>إجراء</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="${cols.length}" class="empty">المخزن فارغ. أضف بضاعة من «إضافة بضاعة».</td></tr>`}</tbody>
    </table></div></section>`;
  $$('tr[data-it]', v).forEach(r => { const open = () => { const it = itemById(r.dataset.it); if (it) itemHistory(it); }; r.onclick = e => { if (!e.target.closest('button')) open(); }; r.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === r) { e.preventDefault(); open(); } }; });
  $$('[data-edit]', v).forEach(b => b.onclick = () => { const it = itemById(b.dataset.edit); if (it) itemEdit(it); });
  $$('[data-del]', v).forEach(b => b.onclick = async () => {
    const it = itemById(b.dataset.del); if (!it) return;
    if (await confirmBox('حذف الصنف', `سيتم حذف «${it.name}» ورصيده (${fmtq(it.qty)} ${it.unit}) من المخزن.`)) {
      db.items = db.items.filter(x => x.id !== it.id); logA('item_del', it.name); save(); render(); toast('تم حذف الصنف', 'ok');
    }
  });
};

/* the date of every addition of one item, newest first, each with its own quantity, prices, maker and supplier (the prices change from one delivery to the next) */
function itemHistory(it) {
  const adds = itemAdds(it), cost = can('stock'), multi = db.settings.whOn && db.warehouses.length > 1, tot = round3(adds.reduce((s, x) => s + x.q, 0)), open = itemMovements(it, '').open;
  const line = x => `<div class="lot"><div class="lot-h"><b>${dateTimeAr(x.d)}</b><span class="lot-q">+ ${fmtq(x.q)} ${esc(it.unit)}</span></div>
    <div class="lot-p">${x.old ? '<span class="muted">الأسعار غير مسجلة (إضافة قبل التحديث)</span>' : `${cost ? `<span>سعر الشراء <b>${money(x.c)}</b></span>` : ''}<span>سعر البيع <b>${money(x.p)}</b></span>`}</div>
    ${x.m || x.s || (multi && x.w) ? `<small class="whs">${[x.m ? `<span>المصنع: ${esc(x.m)}</span>` : '', x.s ? `<span>المورد: ${esc(x.s)}</span>` : '', multi && x.w ? `<span>المخزن: ${esc(whName(x.w))}</span>` : ''].filter(Boolean).join(' · ')}</small>` : ''}</div>`;
  modal(`<h3>${esc(it.name)}</h3>
    <div class="lot-sum"><span>الرصيد الحالي <b>${fmtq(it.qty)} ${esc(it.unit)}</b></span>${cost ? `<span>متوسط الشراء <b>${it.cost > 0 ? money(it.cost) : '—'}</b></span>` : ''}<span>سعر البيع الحالي <b>${money(it.price)}</b></span></div>
    <h4 class="lot-t"><span>تواريخ الإضافة</span>${adds.length ? ` <span>(${adds.length})</span>` : ''}</h4>
    <div class="lots">${adds.length ? adds.map(line).join('') : '<p class="empty">لا توجد إضافات مسجلة لهذا الصنف قبل هذا التحديث. من الآن كل إضافة بتتسجل هنا بتاريخها وسعرها.</p>'}${open > 0.0004 ? `<div class="lot"><div class="lot-h"><b>رصيد سابق (قبل بدء التسجيل)</b><span class="lot-q">${fmtq(open)} ${esc(it.unit)}</span></div></div>` : ''}</div>
    ${adds.length > 1 ? `<p class="lbl" style="margin:0">إجمالي الإضافات المسجلة: <b>${fmtq(tot)} ${esc(it.unit)}</b></p>` : ''}
    <div class="actions"><button class="btn outline" data-no>إغلاق</button></div>`, (d, close) => { $('[data-no]', d).onclick = close; });
}

screens.invAdd = (p, v) => {
  const units = ['طن', 'كيس', 'شكارة', 'متر', 'م³', 'قطعة', 'كجم', 'لتر', 'عبوة'];
  v.innerHTML = subHead('إضافة بضاعة') + `<section class="panel">
    <h2 class="panel-t">بيانات الصنف</h2>
    <div class="form-grid">
      <div class="field"><label for="a-name">الصنف</label><input id="a-name" class="inp" list="a-names" placeholder="مثال: حديد، أسمنت" autocomplete="off"><datalist id="a-names">${dlOpts(baseList())}</datalist></div>
      <div class="field"><label for="a-type">النوع (القطر / النوع)</label><input id="a-type" class="inp" list="a-types" placeholder="مثال: قطر 12، بورتلاند" autocomplete="off"><datalist id="a-types">${dlOpts(typeList(''))}</datalist></div>
      <div class="field"><label for="a-maker">اسم مصنع المنتج</label><input id="a-maker" class="inp" list="a-makers" placeholder="مثال: عز" autocomplete="off"><datalist id="a-makers">${dlOpts(makerList())}</datalist></div>
      <div class="field"><label for="a-unit">الوحدة</label><input id="a-unit" class="inp" list="a-units" placeholder="طن" autocomplete="off"><datalist id="a-units">${units.map(u => `<option value="${u}">`).join('')}</datalist></div>
      <div class="field"><label for="a-qty">الكمية</label><input id="a-qty" class="inp" inputmode="decimal" placeholder="0" autocomplete="off"></div>
      <div class="field"><label for="a-cost">سعر الشراء للوحدة (جنيه)</label><input id="a-cost" class="inp" inputmode="decimal" placeholder="0" autocomplete="off"></div>
      <div class="field"><label for="a-price">سعر البيع للوحدة (جنيه)</label><input id="a-price" class="inp" inputmode="decimal" placeholder="0" autocomplete="off"></div>
      <div class="field"><label for="a-sup">المورد (اختياري)</label><div class="sel"><select id="a-sup"><option value="">بدون مورد</option>${db.suppliers.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}<option value="__new">+ مورد جديد</option></select></div></div>
      ${db.settings.whOn && db.warehouses.length > 1 ? `<div class="field"><label for="a-wh">المخزن</label><div class="sel"><select id="a-wh">${db.warehouses.map(w => `<option value="${esc(w.id)}">${esc(w.name)}</option>`).join('')}</select></div></div>` : ''}
      <div class="field" id="a-paidw" hidden><label for="a-paid">المدفوع للمورد الآن (جنيه)</label><input id="a-paid" class="inp" inputmode="decimal" placeholder="0" autocomplete="off"></div>
    </div>
    <p class="lbl" id="a-hint" style="margin:14px 0 0" hidden></p>
    <div class="actions" style="margin-top:20px"><button class="btn" id="a-save">${ICON.plus}<span>حفظ البضاعة</span></button></div>
  </section>`;
  let paidTouched = false;
  const buyTotal = () => round2(num($('#a-qty').value) * num($('#a-cost').value));
  const syncBuy = () => {
    const sid = $('#a-sup').value, on = sid && sid !== '__new';
    $('#a-paidw').hidden = !on; $('#a-hint').hidden = !on;
    if (!on) return;
    if (!paidTouched) $('#a-paid').value = buyTotal() || '';
    const left = Math.max(round2(buyTotal() - num($('#a-paid').value)), 0);
    $('#a-hint').textContent = `إجمالي المشتريات ${money(buyTotal())}${left > 0 ? ` — يبقى للمورد ${money(left)}` : ' — مدفوعة بالكامل'}`;
  };
  ['a-qty', 'a-cost', 'a-price', 'a-paid'].forEach(id => $('#' + id).addEventListener('input', e => { e.target.value = cleanNum(e.target.value); if (id === 'a-paid') paidTouched = true; syncBuy(); }));
  $('#a-sup').addEventListener('change', () => {
    if ($('#a-sup').value === '__new') {
      $('#a-sup').value = '';
      addSupplierModal(sup => { $('#a-sup').insertAdjacentHTML('beforeend', `<option value="${sup.id}">${esc(sup.name)}</option>`); $('#a-sup').value = sup.id; paidTouched = false; syncBuy(); });
      return;
    }
    paidTouched = false; syncBuy();
  });
  const aName = () => itemJoin($('#a-name').value, $('#a-type').value);
  $('#a-name').addEventListener('input', () => { $('#a-types').innerHTML = dlOpts(typeList($('#a-name').value.trim())); }); /* the types offered follow the item typed */
  const fillKnown = () => { /* an item already in the shelf brings its unit, prices and warehouse (the one of the maker typed when there are several) */
    const nm = aName(), mk = $('#a-maker').value.trim(), it = db.items.find(i => i.name === nm);
    if (!it) return;
    $('#a-unit').value = it.unit; $('#a-cost').value = it.cost; $('#a-price').value = it.price; if (!mk && it.maker) $('#a-maker').value = it.maker;
    if ($('#a-wh') && it.home && db.warehouses.some(w => w.id === it.home)) $('#a-wh').value = it.home;
  };
  ['a-name', 'a-type', 'a-maker'].forEach(id => $('#' + id).addEventListener('change', fillKnown));
  $('#a-save').onclick = () => {
    const base = $('#a-name').value.trim(), type = $('#a-type').value.trim(), maker = $('#a-maker').value.trim(), name = itemJoin(base, type), unit = $('#a-unit').value.trim() || 'وحدة';
    const qty = num($('#a-qty').value), cost = num($('#a-cost').value), price = num($('#a-price').value);
    if (!base) return toast('اكتب اسم الصنف');
    if (qty <= 0) return toast('اكتب كمية أكبر من صفر');
    if (price <= 0) return toast('اكتب سعر البيع');
    const sid = $('#a-sup').value, sup = sid && sid !== '__new' ? supById(sid) : null, total = round2(qty * cost);
    let paid = sup ? round2(num($('#a-paid').value)) : 0;
    if (sup && paid > total + 0.004) return toast('المدفوع للمورد أكبر من إجمالي المشتريات');
    const wid = $('#a-wh') ? $('#a-wh').value : WH0;
    let it = db.items.find(i => sameItem(i, name, unit));
    if (it) { it.cost = round2((it.qty * it.cost + qty * cost) / (it.qty + qty)); it.price = price; if (maker) it.maker = maker; }
    else { it = { id: uid(), name, ...itemParts(base, type, maker), unit, qty: 0, cost, price, min: 0, wh: {}, home: wid }; db.items.push(it); }
    rememberMaker(maker);
    stockMove(it, wid, qty); const mv = logMove(it, wid, 'add', qty, sup ? sup.name : '');
    (it.lots = it.lots || []).push({ id: mv.id, d: mv.date, q: round3(qty), c: round2(cost), p: round2(price), ...(maker ? { m: maker } : {}), ...(sup ? { s: sup.name } : {}), w: wid }); /* this delivery stays inside the item's card with its own date, quantity and prices */
    if (sup && total > 0) {
      const now = new Date().toISOString();
      db.purchases.push({ id: uid(), supplierId: sup.id, itemId: it.id, name, qty, cost, total, date: now });
      if (paid > 0) db.spay.push({ id: uid(), supplierId: sup.id, name: sup.name, amount: paid, date: now, kind: 'pay', note: 'مشتريات: ' + name });
    }
    logA('stock_add', name, fmtq(qty) + ' ' + unit, sup && sup.name); save(); toast(`تمت إضافة «${name}» للمخزن`, 'ok');
    /* he stays on this form for the next item (it used to jump to «عرض المخزن»): the type, quantity, prices and payment are emptied; the item, unit, maker, supplier and warehouse stay (the next iron diameter of the same factory…) */
    ['a-type', 'a-qty', 'a-cost', 'a-price', 'a-paid'].forEach(id => { const el = $('#' + id); if (el) el.value = ''; });
    paidTouched = false; syncBuy();
    $('#a-names').innerHTML = dlOpts(baseList()); $('#a-types').innerHTML = dlOpts(typeList(base)); $('#a-makers').innerHTML = dlOpts(makerList());
    $('#a-type').focus();
  };
};

/* ---------- New invoice: menu & customer picker ---------- */
screens.invMenu = (p, v) => {
  v.innerHTML = subHead('إصدار فاتورة جديدة') + `<div class="menu">
    <button class="opt" style="--ac:var(--amber)" data-act="go" data-to="invForm" data-p='{"mode":"new"}'>${ICON.userPlus}<span>عميل جديد</span></button>
    <button class="opt" style="--ac:var(--sky)" data-act="go" data-to="invPick">${ICON.userCheck}<span>عميل مسجل مسبقاً</span></button>
    <button class="opt" style="--ac:var(--green)" data-act="go" data-to="invForm" data-p='{"mode":"cash"}'>${ICON.cashSale}<span>بيع نقدي مباشر</span></button>
    <button class="opt" style="--ac:var(--purple)" data-act="go" data-to="bookings">${ICON.booking}<span>إيداع حجز</span></button>
    <button class="opt" style="--ac:var(--slate)" data-act="go" data-to="invList">${ICON.docs}<span>فواتير</span></button>
    <button class="opt" style="--ac:var(--blue)" data-act="go" data-to="quotes">${ICON.docDollar}<span>عروض الأسعار</span></button>
    <button class="opt" style="--ac:var(--teal)" data-act="go" data-to="deliveries">${ICON.truck}<span>التوصيل</span></button>
    <button class="opt" style="--ac:var(--sky)" data-act="go" data-to="receipts">${ICON.rcpt}<span>صور وإشعارات العملاء</span></button>
  </div>`;
};

screens.invPick = (p, v) => {
  v.innerHTML = subHead('اختيار العميل') + `<section class="panel">
    <div class="toolbar"><input id="q" class="inp" placeholder="اكتب كود العميل (مثل C-001) أو الاسم أو الموبايل ثم Enter" autocomplete="off" aria-label="بحث" autofocus></div>
    <div class="tbl-wrap"><table class="grid"><colgroup><col style="width:10%"><col style="width:24%"><col style="width:18%"><col style="width:20%"><col style="width:16%"><col style="width:12%"></colgroup>
    <thead><tr><th>كود العميل</th><th>الاسم</th><th>الموبايل</th><th>العنوان</th><th>المتبقي عليه</th><th>اختيار</th></tr></thead><tbody id="rows"></tbody></table></div></section>`;
  const draw = () => {
    const q = $('#q').value.trim();
    const list = db.customers.filter(c => !q || c.name.includes(q) || (c.phone || '').includes(toLat(q)) || (c.code || '').includes(cleanCode(q)));
    $('#rows').innerHTML = list.map(c => `<tr><td class="code" dir="ltr"><b>${esc(c.code || '')}</b></td><td>${esc(c.name)}</td><td class="muted">${esc(c.phone)}</td><td class="muted">${esc(c.address)}</td>
      <td class="${customerDebt(c.id) ? '' : 'muted'}">${customerDebt(c.id) < 0 ? 'له ' + money(-customerDebt(c.id)) : money(customerDebt(c.id))}</td>
      <td><button class="mini" data-pick="${c.id}">اختيار</button></td></tr>`).join('')
      || `<tr><td colspan="6" class="empty">${db.customers.length ? 'لا توجد نتائج' : 'لا يوجد عملاء مسجلون. أصدر فاتورة «عميل جديد» وفعّل «حفظ في السجل».'}</td></tr>`;
    $$('[data-pick]', v).forEach(b => b.onclick = () => go('invForm', { mode: 'existing', cid: b.dataset.pick }, { replace: true }));
  };
  $('#q').addEventListener('input', draw); draw();
  /* Enter on a code picks that customer straight away (an exact code, or the only match) */
  $('#q').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return; const q = $('#q').value.trim(); if (!q) return;
    const cc = cleanCode(q), hit = db.customers.find(c => c.code && c.code === cc) || (() => { const l = db.customers.filter(c => c.name.includes(q) || (c.code || '').includes(cc) || (c.phone || '').includes(toLat(q))); return l.length === 1 ? l[0] : null; })();
    if (hit) { e.preventDefault(); go('invForm', { mode: 'existing', cid: hit.id }, { replace: true }); } else toast('لا يوجد عميل بهذا الكود');
  });
  setTimeout(() => { const q = $('#q'); if (q) q.focus(); }, 60);
};
