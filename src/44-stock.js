/* ---------- Stock: minimum levels & shopping list, item card, stock count, damaged goods, warehouses, income statement ---------- */
Object.assign(AUD, { dmg: 'تسجيل تالف', dmg_undo: 'عكس تالف', count: 'جرد مخزن', xfer: 'تحويل بين مخازن', wh: 'إعداد المخازن', item_min: 'تعديل حد أدنى', item_cost: 'تعديل سعر الشراء', item_home: 'تغيير مخزن الصنف' });
const MV = { add: 'إضافة بضاعة', dmg: 'تالف', cnt: 'تسوية جرد', xo: 'تحويل إلى', xi: 'تحويل من' };
const multiWh = () => !!db.settings.whOn && db.warehouses.length > 1;
const whSelect = (id, sel = '', extra = '') => `<div class="sel"><select id="${id}"${extra}>${db.warehouses.map(w => `<option value="${esc(w.id)}"${w.id === sel ? ' selected' : ''}>${esc(w.name)}</option>`).join('')}</select></div>`;
const itemOpts = (sel = '') => db.items.map(i => `<option value="${i.id}"${i.id === sel ? ' selected' : ''}>${esc(itemLbl(i))} (${esc(i.unit)})</option>`).join('');
const nowGuard = () => { const l = lockDate(); return !!l && ymd(new Date()) <= l; }; /* today inside a closed period: nothing new may be dated today */

/* ===== minimum level & shopping list ===== */
const shopItems = () => db.items.filter(i => i.min > 0 && i.qty <= i.min);
const lastBuy = id => db.purchases.filter(p => p.itemId === id).sort((a, b) => b.date.localeCompare(a.date))[0] || null;
const shopQty = i => Math.max(round3(i.min * 2 - i.qty), 0); /* suggestion: refill up to twice the minimum */
function shopRows(qtys = {}) {
  return shopItems().map(i => { const lb = lastBuy(i.id), q = qtys[i.id] != null ? qtys[i.id] : shopQty(i), unitCost = lb ? lb.cost : i.cost, sup = lb ? (supById(lb.supplierId) || {}).name || '' : ''; return { i, q, unitCost, sup, total: round2(q * unitCost) }; });
}
screens.shopList = (p, v) => {
  const qtys = {};
  const draw = () => {
    const R = shopRows(qtys), tot = round2(R.reduce((s, x) => s + x.total, 0));
    $('#sh-rows').innerHTML = R.map(x => `<tr><td>${esc(x.i.name)}<small class="whs">${esc(x.i.unit)}</small></td><td class="qty">${fmtq(x.i.qty)}</td><td class="muted">${fmtq(x.i.min)}</td>
      <td><input class="ctr" data-sq="${x.i.id}" inputmode="decimal" value="${x.q}" aria-label="الكمية المطلوبة" autocomplete="off"></td><td class="muted">${esc(x.sup) || '—'}</td><td class="val" id="sh-t-${x.i.id}">${fmt(x.total)}</td></tr>`).join('')
      || '<tr><td colspan="6" class="empty">لا توجد أصناف تحت الحد الأدنى. حدّد الحد الأدنى لكل صنف من «إدارة الأصناف والأسعار».</td></tr>';
    $('#sh-tot').textContent = money(tot);
    $$('[data-sq]', v).forEach(inp => inp.addEventListener('input', () => {
      inp.value = cleanNum(inp.value); qtys[inp.dataset.sq] = num(inp.value);
      const x = shopRows(qtys).find(y => y.i.id === inp.dataset.sq); $('#sh-t-' + inp.dataset.sq).textContent = fmt(x.total); $('#sh-tot').textContent = money(round2(shopRows(qtys).reduce((s, y) => s + y.total, 0)));
    }));
  };
  v.innerHTML = subHead('قائمة المشتريات') + `<section class="panel"><p class="lbl" style="margin:0 0 14px;line-height:1.9">الأصناف التي وصل رصيدها للحد الأدنى أو أقل. الكمية المقترحة تُكمل الرصيد إلى ضعف الحد الأدنى، وتقدر تعدّلها. التكلفة المتوقعة على آخر سعر شراء.</p>
    <div class="tbl-wrap"><table class="grid"><colgroup><col style="width:24%"><col style="width:14%"><col style="width:14%"><col style="width:18%"><col style="width:16%"><col style="width:14%"></colgroup>
    <thead><tr><th>الصنف</th><th>الرصيد</th><th>الحد الأدنى</th><th>الكمية المطلوبة</th><th>آخر مورد</th><th>التكلفة المتوقعة</th></tr></thead><tbody id="sh-rows"></tbody></table></div>
    <div class="total-box" style="margin-top:14px">إجمالي التكلفة المتوقعة: <b id="sh-tot">0 جنيه</b></div>
    <div class="actions" style="margin-top:14px"><button class="btn ghost" id="sh-copy" type="button"><span>نسخ القائمة</span></button>${docBtns('shop')}<button class="btn outline" data-act="go" data-to="invAdd" type="button"><span>إضافة بضاعة</span></button></div></section>`;
  draw();
  $('#sh-copy').onclick = async () => {
    const R = shopRows(qtys); if (!R.length) return toast('القائمة فارغة');
    const txt = 'قائمة المشتريات — ' + ymd(new Date()) + '\n' + R.map(x => `• ${x.i.name}: ${fmtq(x.q)} ${x.i.unit}`).join('\n');
    try { await navigator.clipboard.writeText(txt); toast('تم نسخ القائمة', 'ok'); } catch (e) { toast('تعذّر النسخ'); }
  };
};

/* ===== item card: every movement of one item with a running balance ===== */
function itemMovements(it, wid) {
  const mv = [], inW = w => !wid || (w || WH0) === wid;
  db.invoices.forEach(i => {
    i.rows.forEach(l => {
      if (l.itemId !== it.id || !inW(l.wh || i.wh)) return;
      mv.push({ d: i.date, t: `بيع — فاتورة ${i.no} (${i.name})`, q: -l.qty });
      if (i.status === 'void' && i.void) mv.push({ d: i.void.at, t: `إلغاء فاتورة ${i.no}`, q: l.qty });
    });
  });
  db.returns.forEach(r => { const iv = db.invoices.find(x => x.id === r.invId); r.rows.forEach(l => { if (l.itemId === it.id && inW(l.wh || (iv && iv.wh))) mv.push({ d: r.date, t: `مرتجع ${r.no} — فاتورة ${r.invNo}`, q: l.qty }); }); });
  db.moves.forEach(m => { if (m.itemId === it.id && inW(m.wh)) mv.push({ d: m.date, t: MV[m.type] + (m.ref ? ' — ' + m.ref : ''), q: m.qty }); });
  mv.sort(byDate);
  const cur = wid ? whQty(it, wid) : it.qty, open = round3(cur - mv.reduce((s, m) => s + m.q, 0));
  let run = open; mv.forEach(m => { run = round3(run + m.q); m.bal = run; });
  return { open, mv, cur };
}
screens.itemCard = (p, v) => {
  if (!db.items.length) { v.innerHTML = subHead('كارت الصنف') + '<section class="panel"><p class="empty">لا توجد أصناف في المخزن.</p></section>'; return; }
  let id = p.id && itemById(p.id) ? p.id : db.items[0].id, wid = '';
  v.innerHTML = subHead('كارت الصنف') + `<div class="stack"><section class="panel"><div class="form-grid">
    <div class="field"><label for="k-item">الصنف</label><div class="sel"><select id="k-item">${itemOpts(id)}</select></div></div>
    ${multiWh() ? `<div class="field"><label for="k-wh">المخزن</label><div class="sel"><select id="k-wh"><option value="">كل المخازن</option>${db.warehouses.map(w => `<option value="${esc(w.id)}">${esc(w.name)}</option>`).join('')}</select></div></div>` : ''}</div></section>
    <section class="panel"><div class="stats" id="k-st" style="margin-bottom:16px"></div><div class="tbl-wrap"><table class="grid"><thead><tr><th>التاريخ</th><th>البيان</th><th>وارد</th><th>صادر</th><th>الرصيد</th></tr></thead><tbody id="k-rows"></tbody></table></div>
    <div class="actions docbar noprint" id="k-bar" style="margin-top:14px"></div></section></div>`;
  const draw = () => {
    const it = itemById(id), c = itemMovements(it, wid), inn = round3(c.mv.filter(m => m.q > 0).reduce((s, m) => s + m.q, 0)), out = round3(-c.mv.filter(m => m.q < 0).reduce((s, m) => s + m.q, 0));
    $('#k-st').innerHTML = `<div class="stat"><span>الرصيد الحالي</span><b>${fmtq(c.cur)} ${esc(it.unit)}</b></div><div class="stat pos"><span>إجمالي الوارد</span><b>${fmtq(inn)}</b></div><div class="stat neg"><span>إجمالي الصادر</span><b>${fmtq(out)}</b></div><div class="stat blue"><span>متوسط التكلفة</span><b>${money(it.cost)}</b></div>`;
    $('#k-rows').innerHTML = (c.open !== 0 ? `<tr><td class="muted">—</td><td>رصيد سابق (قبل بدء التسجيل)</td><td>${c.open > 0 ? fmtq(c.open) : ''}</td><td>${c.open < 0 ? fmtq(-c.open) : ''}</td><td class="val">${fmtq(c.open)}</td></tr>` : '')
      + c.mv.map(m => `<tr><td class="muted">${dateTimeAr(m.d)}</td><td>${esc(m.t)}</td><td>${m.q > 0 ? fmtq(m.q) : ''}</td><td>${m.q < 0 ? fmtq(-m.q) : ''}</td><td class="val">${fmtq(m.bal)}</td></tr>`).join('')
      || '';
    if (!c.mv.length && c.open === 0) $('#k-rows').innerHTML = '<tr><td colspan="5" class="empty">لا توجد حركة على هذا الصنف.</td></tr>';
    $('#k-bar').innerHTML = docBtns('card', id + '|' + wid); /* the three buttons follow the item and the warehouse chosen */
  };
  $('#k-item').addEventListener('change', e => { id = e.target.value; draw(); });
  if ($('#k-wh')) $('#k-wh').addEventListener('change', e => { wid = e.target.value; draw(); });
  draw();
};

/* ===== stock count: the real quantities against the books ===== */
screens.stockCount = (p, v) => {
  let wid = WH0;
  v.innerHTML = subHead('جرد المخزن') + `<div class="stack"><section class="panel"><p class="lbl" style="margin:0 0 14px;line-height:1.9">اكتب الكمية الفعلية الموجودة لكل صنف. الأصناف التي تتركها فارغة لا تدخل في الجرد. الفروق تُسجَّل كتسوية بسعر متوسط التكلفة.</p>
    ${multiWh() ? `<div class="field" style="max-width:320px;margin-bottom:14px"><label for="n-wh">المخزن</label>${whSelect('n-wh', wid)}</div>` : ''}
    <div class="tbl-wrap"><table class="grid"><thead><tr><th>الصنف</th><th>الوحدة</th><th>بالدفاتر</th><th>الفعلي</th><th>الفرق</th></tr></thead><tbody id="n-rows"></tbody></table></div>
    <div class="total-box" style="margin-top:14px">قيمة الفروق: <b id="n-val">0 جنيه</b></div>
    <div class="actions" style="margin-top:14px"><button class="btn" id="n-save" type="button">${ICON.save}<span>اعتماد الجرد</span></button></div></section>
    <section class="panel"><h2 class="panel-t">سجل الجرد</h2><div class="tbl-wrap"><table class="grid"><thead><tr><th>التاريخ</th><th>المخزن</th><th>أصناف</th><th>الفروق</th><th>القيمة</th></tr></thead><tbody id="n-hist"></tbody></table></div>
    ${docBar('counts')}</section></div>`;
  const vals = () => { const o = {}; $$('[data-cn]', v).forEach(i => { if (i.value !== '') o[i.dataset.cn] = round3(num(i.value)); }); return o; };
  const diffs = () => { const o = vals(), r = []; Object.keys(o).forEach(k => { const it = itemById(k); if (it) r.push({ it, sys: whQty(it, wid), act: o[k], diff: round3(o[k] - whQty(it, wid)) }); }); return r; };
  const paint = () => { const d = diffs(); $$('[data-cd]', v).forEach(c => { const x = d.find(y => y.it.id === c.dataset.cd); c.textContent = x ? (x.diff > 0 ? '+' : '') + fmtq(x.diff) : ''; c.className = 'val ' + (x && x.diff < 0 ? 'neg' : ''); }); $('#n-val').textContent = money(round2(d.reduce((s, x) => s + x.diff * x.it.cost, 0))); };
  const rows = () => {
    $('#n-rows').innerHTML = db.items.map(i => `<tr><td>${esc(i.name)}</td><td class="muted">${esc(i.unit)}</td><td class="qty">${fmtq(whQty(i, wid))}</td><td><input class="ctr" data-cn="${i.id}" inputmode="decimal" placeholder="—" aria-label="الكمية الفعلية" autocomplete="off"></td><td data-cd="${i.id}"></td></tr>`).join('') || '<tr><td colspan="5" class="empty">لا توجد أصناف.</td></tr>';
    $$('[data-cn]', v).forEach(i => i.addEventListener('input', () => { i.value = cleanNum(i.value); paint(); })); paint();
  };
  const hist = () => { $('#n-hist').innerHTML = db.counts.slice().sort((a, b) => b.date.localeCompare(a.date)).map(c => `<tr><td class="muted">${dateTimeAr(c.date)}</td><td>${esc(whName(c.wh))}</td><td>${c.rows.length}</td><td>${c.rows.filter(r => r.diff !== 0).length}</td><td class="val">${fmt(c.value)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">لم يتم جرد بعد.</td></tr>'; };
  if ($('#n-wh')) $('#n-wh').addEventListener('change', e => { wid = e.target.value; rows(); });
  $('#n-save').onclick = async () => {
    const d = diffs(); if (!d.length) return toast('اكتب الكمية الفعلية لصنف واحد على الأقل');
    const val = round2(d.reduce((s, x) => s + x.diff * x.it.cost, 0)), n = d.filter(x => x.diff !== 0).length;
    if (!await confirmBox('', n ? `سيتم تعديل رصيد ${n} صنف حسب الجرد بقيمة ${money(val)}. هل تريد المتابعة؟` : 'كل الكميات مطابقة للدفاتر. هل تريد تسجيل الجرد؟', 'اعتماد', false)) return;
    if (!await requireAdmin('اكتب الرقم السري للمسؤول لاعتماد الجرد')) return;
    const rec = { id: uid(), date: new Date().toISOString(), wh: wid, value: val, rows: d.map(x => ({ itemId: x.it.id, name: x.it.name, unit: x.it.unit, sys: x.sys, actual: x.act, diff: x.diff, cost: x.it.cost })) };
    d.forEach(x => { if (x.diff !== 0) { stockMove(x.it, wid, x.diff); logMove(x.it, wid, 'cnt', x.diff, 'جرد'); } });
    db.counts.push(rec); logA('count', `جرد ${whName(wid)}`, n ? `${n} فرق` : 'مطابق', money(val)); save(); toast('تم اعتماد الجرد', 'ok'); render();
  };
  rows(); hist();
};

/* ===== damaged goods ===== */
screens.damage = (p, v) => {
  const reasons = ['كسر', 'تلف', 'انتهاء صلاحية', 'سرقة أو فقد', 'تشوين خاطئ'];
  const tot = round2(db.damages.reduce((s, x) => s + x.value, 0));
  v.innerHTML = subHead('تالف') + `<div class="stack"><section class="panel"><h2 class="panel-t">تسجيل بضاعة تالفة</h2><div class="form-grid">
    <div class="field"><label for="d-item">الصنف</label><div class="sel"><select id="d-item"><option value="">اختر الصنف</option>${itemOpts()}</select></div></div>
    ${multiWh() ? `<div class="field"><label for="d-wh">المخزن</label>${whSelect('d-wh')}</div>` : ''}
    <div class="field"><label for="d-qty">الكمية التالفة</label><input id="d-qty" class="inp" inputmode="decimal" placeholder="0" autocomplete="off"><small class="lbl" id="d-av"></small></div>
    <div class="field"><label for="d-why">السبب</label><input id="d-why" class="inp" list="d-whys" maxlength="80" autocomplete="off"><datalist id="d-whys">${reasons.map(x => `<option value="${x}">`).join('')}</datalist></div></div>
    <p class="lbl" id="d-val" style="margin:14px 0 0" hidden></p>
    <div class="actions" style="margin-top:16px"><button class="btn danger" id="d-save" type="button"><span>تسجيل التالف</span></button></div></section>
    <section class="panel"><h2 class="panel-t">سجل التالف</h2><div class="total-box" style="margin-bottom:14px">إجمالي خسائر التالف: <b>${money(tot)}</b></div>
    <div class="tbl-wrap"><table class="grid"><thead><tr><th>التاريخ</th><th>الصنف</th><th>الكمية</th><th>الخسارة</th><th>السبب</th><th></th></tr></thead><tbody>${db.damages.slice().sort((a, b) => b.date.localeCompare(a.date)).map(x => `<tr><td class="muted">${dateTimeAr(x.date)}</td><td>${esc(x.name)}${multiWh() ? `<small class="whs">${esc(whName(x.wh))}</small>` : ''}</td><td>${fmtq(x.qty)} ${esc(x.unit)}</td><td class="val">${fmt(x.value)}</td><td class="muted">${esc(x.reason)}</td><td><button class="mini" data-undo="${x.id}" type="button">عكس</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">لا يوجد تالف مسجَّل.</td></tr>'}</tbody></table></div>
    ${db.damages.length ? docBar('damages') : ''}</section></div>`;
  const wid = () => $('#d-wh') ? $('#d-wh').value : WH0;
  const info = () => {
    const it = itemById($('#d-item').value), q = num($('#d-qty').value);
    $('#d-av').textContent = it ? `المتاح: ${fmtq(whQty(it, wid()))} ${it.unit}` : '';
    const b = $('#d-val'); b.hidden = !(it && q > 0); if (it && q > 0) b.textContent = `قيمة الخسارة بسعر التكلفة: ${money(round2(q * it.cost))}`;
  };
  ['d-item', 'd-wh'].forEach(id => { const e = $('#' + id); if (e) e.addEventListener('change', info); });
  $('#d-qty').addEventListener('input', e => { e.target.value = cleanNum(e.target.value); info(); });
  $('#d-save').onclick = async () => {
    const it = itemById($('#d-item').value), q = round3(num($('#d-qty').value)), why = $('#d-why').value.trim();
    if (!it) return toast('اختر الصنف'); if (q <= 0) return toast('اكتب كمية أكبر من صفر');
    if (q > whQty(it, wid()) + 1e-9) return toast(`الكمية أكبر من المتاح (${fmtq(whQty(it, wid()))})`);
    if (!why) return toast('اكتب سبب التلف');
    if (nowGuard()) return toast('اليوم داخل فترة مقفولة');
    if (!await requireAdmin('اكتب الرقم السري للمسؤول لتسجيل التالف')) return;
    const w = wid(), rec = { id: uid(), date: new Date().toISOString(), itemId: it.id, name: it.name, unit: it.unit, qty: q, cost: it.cost, value: round2(q * it.cost), wh: w, reason: why };
    stockMove(it, w, -q); logMove(it, w, 'dmg', -q, why); db.damages.push(rec); logA('dmg', it.name, fmtq(q) + ' ' + it.unit, why, money(rec.value)); save(); toast('تم تسجيل التالف وخصمه من المخزن', 'ok'); render();
  };
  $$('[data-undo]', v).forEach(b => b.onclick = async () => {
    const x = db.damages.find(y => y.id === b.dataset.undo), it = x && itemById(x.itemId); if (!x) return;
    if (!it) return toast('الصنف لم يعد موجوداً'); if (isLocked(x.date)) return toast('هذا السجل في فترة مقفولة');
    if (!await confirmBox('', 'ستعود الكمية إلى المخزن ويُمسح سجل التالف. هل تريد المتابعة؟', 'عكس')) return;
    if (!await requireAdmin('اكتب الرقم السري للمسؤول لعكس التالف')) return;
    stockMove(it, x.wh, x.qty); logMove(it, x.wh, 'dmg', x.qty, 'عكس تالف'); db.damages = db.damages.filter(y => y.id !== x.id); logA('dmg_undo', x.name, fmtq(x.qty) + ' ' + x.unit); save(); toast('تم عكس التالف', 'ok'); render();
  });
  info();
};

/* ===== transfer between warehouses ===== */
screens.transfer = (p, v) => {
  if (!multiWh()) return back();
  v.innerHTML = subHead('تحويل بين المخازن') + `<div class="stack"><section class="panel"><div class="form-grid">
    <div class="field"><label for="t-item">الصنف</label><div class="sel"><select id="t-item"><option value="">اختر الصنف</option>${itemOpts()}</select></div></div>
    <div class="field"><label for="t-from">من مخزن</label>${whSelect('t-from', WH0)}<small class="lbl" id="t-av"></small></div>
    <div class="field"><label for="t-to">إلى مخزن</label>${whSelect('t-to', (db.warehouses.find(w => w.id !== WH0) || {}).id)}</div>
    <div class="field"><label for="t-qty">الكمية</label><input id="t-qty" class="inp" inputmode="decimal" placeholder="0" autocomplete="off"></div></div>
    <div class="actions" style="margin-top:16px"><button class="btn" id="t-save" type="button"><span>تنفيذ التحويل</span></button></div></section>
    <section class="panel"><h2 class="panel-t">آخر التحويلات</h2><div class="tbl-wrap"><table class="grid"><thead><tr><th>التاريخ</th><th>الصنف</th><th>الكمية</th><th>من</th><th>إلى</th></tr></thead><tbody>${db.moves.filter(m => m.type === 'xo').slice(-30).reverse().map(m => { const it = itemById(m.itemId); return `<tr><td class="muted">${dateTimeAr(m.date)}</td><td>${esc(it ? it.name : '—')}</td><td>${fmtq(-m.qty)} ${esc(it ? it.unit : '')}</td><td>${esc(whName(m.wh))}</td><td>${esc(m.ref)}</td></tr>`; }).join('') || '<tr><td colspan="5" class="empty">لا توجد تحويلات.</td></tr>'}</tbody></table></div></section></div>`;
  const info = () => { const it = itemById($('#t-item').value); $('#t-av').textContent = it ? `المتاح: ${fmtq(whQty(it, $('#t-from').value))} ${it.unit}` : ''; };
  ['t-item', 't-from'].forEach(id => $('#' + id).addEventListener('change', info));
  $('#t-qty').addEventListener('input', e => { e.target.value = cleanNum(e.target.value); });
  $('#t-save').onclick = async () => {
    const it = itemById($('#t-item').value), a = $('#t-from').value, b = $('#t-to').value, q = round3(num($('#t-qty').value));
    if (!it) return toast('اختر الصنف'); if (a === b) return toast('اختر مخزنين مختلفين'); if (q <= 0) return toast('اكتب كمية أكبر من صفر');
    if (q > whQty(it, a) + 1e-9) return toast(`الكمية أكبر من المتاح في ${whName(a)} (${fmtq(whQty(it, a))})`);
    if (!await requireAdmin('اكتب الرقم السري للمسؤول لتنفيذ التحويل')) return;
    stockMove(it, a, -q); stockMove(it, b, q); logMove(it, a, 'xo', -q, whName(b)); logMove(it, b, 'xi', q, whName(a));
    logA('xfer', it.name, fmtq(q) + ' ' + it.unit, `${whName(a)} ← ${whName(b)}`); save(); toast('تم التحويل', 'ok'); render();
  };
  info();
};

/* ===== warehouses (Settings) ===== */
screens.setWh = (p, v) => {
  const S = db.settings, hasMove = w => db.invoices.some(i => i.rows.some(l => (l.wh || i.wh || WH0) === w.id)) || db.moves.some(m => m.wh === w.id) || db.damages.some(x => x.wh === w.id) || db.counts.some(c => c.wh === w.id);
  const heldElsewhere = () => db.items.some(i => Object.keys(i.wh).some(k => k !== WH0 && whQty(i, k) !== 0));
  v.innerHTML = setHead() + `<section class="panel"><h2 class="panel-t">المخازن</h2>
    <p class="lbl" style="margin:0 0 14px;line-height:1.9">فعّل هذا الخيار لو عندك أكثر من مخزن. عند التفعيل تختار المخزن عند إضافة البضاعة وعند الفاتورة، ويظهر رصيد كل مخزن، وتقدر تحوّل بضاعة بين المخازن. عند الإيقاف يعمل البرنامج بمخزن واحد.</p>
    <label class="chk"><input type="checkbox" id="w-on"${S.whOn ? ' checked' : ''}><i>${ICON.check}</i><span>تفعيل تعدد المخازن</span></label>
    <div id="w-box" style="margin-top:16px"${S.whOn ? '' : ' hidden'}>
      <div class="tbl-wrap"><table class="grid"><thead><tr><th>المخزن</th><th>قيمة البضاعة</th><th>حذف</th></tr></thead><tbody>${db.warehouses.map(w => `<tr><td><input class="inp" data-wn="${esc(w.id)}" value="${esc(w.name)}" maxlength="40" aria-label="اسم المخزن" autocomplete="off"></td><td class="val">${money(db.items.reduce((s, i) => s + whQty(i, w.id) * i.cost, 0))}</td><td>${w.id === WH0 ? '' : `<button class="del" data-wd="${esc(w.id)}" type="button" aria-label="حذف المخزن">${ICON.trash}</button>`}</td></tr>`).join('')}</tbody></table></div>
      <div class="actions" style="margin-top:14px"><div class="field" style="margin:0;flex:1;min-width:200px"><input id="w-new" class="inp" placeholder="اسم مخزن جديد" maxlength="40" aria-label="اسم مخزن جديد" autocomplete="off"></div><button class="btn outline" id="w-add" type="button"><span>إضافة مخزن</span></button></div></div>
    <div class="actions" style="margin-top:18px"><button class="btn" id="w-save" type="button">${ICON.save}<span>حفظ</span></button></div></section>`;
  const names = () => $$('[data-wn]', v).map(i => [i.dataset.wn, i.value.trim()]);
  $('#w-on').onchange = () => { $('#w-box').hidden = !$('#w-on').checked; };
  $('#w-add').onclick = async () => {
    const n = $('#w-new').value.trim(); if (!n) return toast('اكتب اسم المخزن');
    if (db.warehouses.some(w => w.name === n)) return toast('يوجد مخزن بنفس الاسم');
    if (!await requireAdmin()) return;
    db.warehouses.push({ id: uid(), name: n }); S.whOn = true; logA('wh', 'إضافة مخزن', n); save(); render(); /* adding a warehouse means the option is on */
  };
  $$('[data-wd]', v).forEach(b => b.onclick = async () => {
    const w = db.warehouses.find(x => x.id === b.dataset.wd); if (!w) return;
    if (db.items.some(i => whQty(i, w.id) !== 0)) return toast('هذا المخزن فيه بضاعة، حوّلها أولاً');
    if (hasMove(w)) return toast('عليه حركة مسجلة ولا يمكن حذفه');
    if (!await confirmBox('', `حذف المخزن «${w.name}»؟`)) return; if (!await requireAdmin()) return;
    db.warehouses = db.warehouses.filter(x => x.id !== w.id); db.items.forEach(i => { delete i.wh[w.id]; }); logA('wh', 'حذف مخزن', w.name); save(); render();
  });
  $('#w-save').onclick = async () => {
    const on = $('#w-on').checked, ns = names();
    if (ns.some(([, n]) => !n)) return toast('اسم المخزن لا يكون فارغاً');
    if (new Set(ns.map(([, n]) => n)).size !== ns.length) return toast('يوجد مخزنان بنفس الاسم');
    if (!on && heldElsewhere()) return toast('في مخازن أخرى بضاعة، حوّلها للمخزن الرئيسي قبل إيقاف الخيار');
    if (!await requireAdmin()) return;
    ns.forEach(([id, n]) => { const w = db.warehouses.find(x => x.id === id); if (w) w.name = n; });
    S.whOn = on; logA('wh', on ? 'تفعيل تعدد المخازن' : 'إيقاف تعدد المخازن'); save(); back(); toast('تم الحفظ', 'ok');
  };
};

/* ===== income statement ===== */
function incomeData(from, to) {
  const inR = d => { const k = ymd(d); return k >= from && k <= to; };
  const live = liveInvoices().filter(i => inR(i.date)), rets = db.returns.filter(r => inR(r.date));
  const sales = round2(live.reduce((s, i) => s + i.subtotal - i.discAmt, 0)), retV = round2(rets.reduce((s, r) => s + r.subtotal - r.discAmt, 0));
  const cogs = round2(live.reduce((s, i) => s + invCost(i), 0) - rets.reduce((s, r) => s + (r.cost || 0), 0));
  const by = {}; db.expenses.filter(e => inR(e.date)).forEach(e => { const k = (e.cat === 'tip' ? 'إكراميات وخصومات: ' : '') + (e.title || CATS[e.cat] || CATS.misc); by[k] = round2((by[k] || 0) + e.amount); });
  let exp = Object.entries(by).sort((a, b) => b[1] - a[1]); if (exp.length > 14) { const rest = round2(exp.slice(13).reduce((s, x) => s + x[1], 0)); exp = exp.slice(0, 13).concat([['مصروفات أخرى', rest]]); }
  const expT = round2(exp.reduce((s, x) => s + x[1], 0));
  const dmg = round2(db.damages.filter(x => inR(x.date)).reduce((s, x) => s + x.value, 0)), cnt = round2(db.counts.filter(c => inR(c.date)).reduce((s, c) => s + c.value, 0));
  const netSales = round2(sales - retV), gross = round2(netSales - cogs), net = round2(gross - expT - dmg + cnt);
  const vat = round2(live.filter(i => i.vatOn).reduce((s, i) => s + i.vatAmt, 0) - rets.reduce((s, r) => s + (r.vatAmt || 0), 0));
  return { sales, retV, netSales, cogs, gross, exp, expT, dmg, cnt, net, vat, nInv: live.length, nRet: rets.length };
}
function incomeLines(from, to) {
  const d = incomeData(from, to), L = [], pct = d.netSales ? ` (${fmt(d.gross / d.netSales * 100)}%)` : '';
  L.push(['المبيعات (بعد الخصم وقبل الضريبة)', d.sales]); L.push(['− مرتجعات المبيعات', -d.retV]); L.push(['صافي المبيعات', d.netSales, 'sub']);
  L.push(['− تكلفة البضاعة المباعة', -d.cogs]); L.push(['مجمل الربح' + pct, d.gross, 'sub']);
  d.exp.forEach(([k, a]) => L.push(['− ' + k, -a, 'ind'])); L.push(['− إجمالي المصروفات', -d.expT]);
  if (d.dmg) L.push(['− خسائر التالف', -d.dmg]);
  if (d.cnt) L.push([d.cnt < 0 ? '− عجز الجرد' : '+ زيادة الجرد', d.cnt]);
  L.push(['صافي الربح', d.net, 'sub fin']);
  return { d, L };
}
function incomePaper(from, to) {
  const { d, L } = incomeLines(from, to);
  return paper(repHeader('A', 'قائمة الدخل', from, to) + `<section class="rsec"><table class="rtbl inc"><thead><tr><th>البند</th><th>المبلغ (جنيه)</th></tr></thead><tbody>${L.map(([t, a, c]) => `<tr${c ? ` class="${c}"` : ''}><td>${esc(t)}</td><td class="amt"><bdi>${a < 0 ? '(' + fmt(-a) + ')' : fmt(a)}</bdi></td></tr>`).join('')}</tbody></table>
    <p class="inote">عدد الفواتير: ${d.nInv} • عدد المرتجعات: ${d.nRet}</p>${taxOn() ? `<p class="inote">القيمة المضافة المحصَّلة (صافي): ${fmt(d.vat)} جنيه (لا تدخل في الأرباح)</p>` : ''}</section>`);
}
const incomeCSV = (a, b) => ({ name: 'قائمة_الدخل_' + a + '_' + b, head: ['البند', 'المبلغ'], rows: incomeLines(a, b).L.map(([t, x]) => [t.replace(/^[−+] /, ''), x]) });
screens.repMonth = (p, v) => repScreen(v, { title: 'قائمة الدخل', month: true, make: incomePaper, csv: incomeCSV, file: (a, b) => `قائمة_الدخل_${a}_الى_${b}` });

/* ===== Excel datasets ===== */
Object.assign(EXPORTS, {
  shop: () => ({ name: 'قائمة_المشتريات', head: ['الصنف', 'الوحدة', 'الرصيد', 'الحد الأدنى', 'الكمية المقترحة', 'آخر مورد', 'التكلفة المتوقعة'], rows: shopRows().map(x => [x.i.name, x.i.unit, x.i.qty, x.i.min, x.q, x.sup, x.total]) }),
  counts: () => ({ name: 'جرد_المخزن', head: ['التاريخ', 'المخزن', 'الصنف', 'الوحدة', 'بالدفاتر', 'الفعلي', 'الفرق', 'التكلفة', 'قيمة الفرق'], rows: db.counts.flatMap(c => c.rows.map(r => [ymd(c.date), whName(c.wh), r.name, r.unit, r.sys, r.actual, r.diff, r.cost, round2(r.diff * r.cost)])) }),
  damages: () => ({ name: 'التالف', head: ['التاريخ', 'الصنف', 'الوحدة', 'المخزن', 'الكمية', 'التكلفة', 'الخسارة', 'السبب'], rows: db.damages.map(x => [ymd(x.date), x.name, x.unit, whName(x.wh), x.qty, x.cost, x.value, x.reason]) }),
});
EXP_LIST.push(['counts', 'جرد المخزن'], ['damages', 'التالف'], ['shop', 'قائمة المشتريات']);
