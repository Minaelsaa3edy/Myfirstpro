/* ---------- Payment methods (cash in hand / bank / InstaPay / e-wallet) and the customers' transfer notices ----------
   A payment carries `pm` (absent = cash in hand). Money that came through bank / InstaPay / wallet is not in the drawer:
   the cash count counts cash only, the reports show every method apart. The picture of the notice lives in its own IndexedDB
   (never in localStorage), the list of notices (db.receipts) is part of the data and of the backup. */
Object.assign(AUD, { rc_add: 'حفظ صورة / إشعار عميل', rc_del: 'حذف إشعار عميل' });
const PM = [['cash', 'نقدي'], ['bank', 'بنك'], ['insta', 'إنستا باي'], ['wallet', 'محفظة']];
const pmIs = k => k === 'bank' || k === 'insta' || k === 'wallet'; /* money that did not go into the drawer */
const pmKey = k => pmIs(k) ? k : 'cash';
const pmName = k => (PM.find(x => x[0] === pmKey(k)) || PM[0])[1];
const RC_KINDS = [['bank', 'بنك'], ['insta', 'إنستا باي'], ['wallet', 'محفظة'], ['paper', 'نقدي']]; /* a free notice: bank / InstaPay / wallet / a cash receipt (the kind id stays «paper» so saved notices keep working; it is written «نقدي») */
const rcTag = k => k === 'paper' ? 'نقدي' : pmName(k);
const mixOf = list => { const o = { cash: 0, bank: 0, insta: 0, wallet: 0 }; list.forEach(e => { const k = pmKey(e.m); o[k] = round2(o[k] + e.a); }); return o; }; /* a list of ledger entries by method */
const DRW = { bank: 'داخل بنك (خارج الدرج)', insta: 'داخل إنستا باي (خارج الدرج)', wallet: 'داخل محفظة (خارج الدرج)' }; /* in the cash count: money that never went into the drawer */
const MIXW = { cash: 'منها نقدي', bank: 'منها بنك', insta: 'منها إنستا باي', wallet: 'منها محفظة' };
const mixLines = list => { const o = mixOf(list); return round2(o.bank + o.insta + o.wallet) > 0 ? PM.filter(x => o[x[0]] > 0).map(x => `<div><span>${MIXW[x[0]]}:</span><b>${fmt(o[x[0]])} جنيه</b></div>`).join('') : ''; }; /* «of which cash / bank / …» under a total, only when part of it did not come in cash */
const pmBadge = k => pmIs(k) ? `<small class="pmt">${pmName(k)}</small>` : '';

/* ----- the pictures: one IndexedDB of their own, mirrored in memory ----- */
const RIMG = {}; let rcWarned = false;
const RC_OK = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const rcSrc = id => { const u = RIMG[id]; return typeof u === 'string' && u.length < 6e6 && RC_OK.test(u) ? u : ''; };
const rcDb = () => new Promise((res, rej) => { try { const r = indexedDB.open('accounts-receipts', 1); r.onupgradeneeded = () => r.result.createObjectStore('r'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } });
async function rcLoad() {
  try { const d = await rcDb(); await new Promise(ok => { const q = d.transaction('r').objectStore('r').openCursor(); q.onsuccess = () => { const c = q.result; if (c) { if (typeof c.value === 'string') RIMG[c.key] = c.value; c.continue(); } else ok(); }; q.onerror = () => ok(); }); } catch (e) { /* no storage: pictures stay in memory only */ }
  if (['receipts', 'invDetail', 'custDetail'].includes(cur.name) && !$('.ov')) render();
}
async function rcPut(id, url) {
  RIMG[id] = url;
  try { const d = await rcDb(); await new Promise((ok, no) => { const t = d.transaction('r', 'readwrite'); t.objectStore('r').put(url, id); t.oncomplete = ok; t.onerror = () => no(t.error); }); }
  catch (e) { if (!rcWarned) { rcWarned = true; toast('تعذّر حفظ الصورة في هذا المتصفح، ستبقى حتى إغلاق الصفحة فقط — حمّل نسخة احتياطية'); } }
}
async function rcDelImg(id) { delete RIMG[id]; try { const d = await rcDb(); await new Promise(ok => { const t = d.transaction('r', 'readwrite'); t.objectStore('r').delete(id); t.oncomplete = ok; t.onerror = ok; }); } catch (e) { /* nothing stored */ } }
async function rcReset(map) { /* a restored backup: the pictures of the file replace the ones kept here */
  Object.keys(RIMG).forEach(k => delete RIMG[k]);
  try { const d = await rcDb(); await new Promise(ok => { const t = d.transaction('r', 'readwrite'); t.objectStore('r').clear(); t.oncomplete = ok; t.onerror = ok; }); } catch (e) { /* nothing stored */ }
  const ids = new Set((db.receipts || []).map(x => x.id)), m = map && typeof map === 'object' ? map : {};
  for (const k of Object.keys(m)) if (ids.has(k) && typeof m[k] === 'string' && m[k].length < 6e6 && RC_OK.test(m[k])) await rcPut(k, m[k]);
}
const rcBackup = () => { const o = {}; (db.receipts || []).forEach(r => { if (r.img && RIMG[r.id]) o[r.id] = RIMG[r.id]; }); return o; };
/* a camera photo is cut down to ~1280px JPEG before it is kept */
function rcShrink(file) {
  return new Promise((res, rej) => {
    if (!file || !/^image\//.test(file.type || '')) return rej(new Error('type'));
    const u = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      try {
        const M = 1280, k = Math.min(1, M / Math.max(im.naturalWidth, im.naturalHeight, 1)), w = Math.max(1, Math.round(im.naturalWidth * k)), h = Math.max(1, Math.round(im.naturalHeight * k));
        const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(im, 0, 0, w, h);
        res(c.toDataURL('image/jpeg', 0.72));
      } catch (e) { rej(e); } finally { URL.revokeObjectURL(u); }
    };
    im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('decode')); };
    im.src = u;
  });
}

/* ----- the picture box (a button, a preview and a remove button) ----- */
const ipHTML = () => `<div class="ip"><button type="button" class="mini ip-pick"><span>إرفاق صورة الإشعار</span></button><input type="file" class="ip-file" accept="image/*" hidden><img class="ip-prev" alt="" hidden><button type="button" class="mini ip-rm" hidden>إزالة الصورة</button></div>`;
function ipWire(root) {
  const el = $('.ip', root); if (!el) return null; const st = { img: null }, draw = () => {
    const im = $('.ip-prev', el); im.hidden = !st.img; if (st.img) im.src = st.img; $('.ip-rm', el).hidden = !st.img; $('.ip-pick span', el).textContent = st.img ? 'تغيير الصورة' : 'إرفاق صورة الإشعار';
  };
  $('.ip-pick', el).onclick = () => $('.ip-file', el).click();
  $('.ip-rm', el).onclick = () => { st.img = null; draw(); };
  $('.ip-file', el).addEventListener('change', async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { st.img = await rcShrink(f); draw(); } catch (x) { toast('تعذّرت قراءة الصورة، اختر صورة أخرى'); } });
  return st;
}

/* ----- the method buttons: cash / bank / InstaPay / wallet; bank-like methods show the picture box and a note ----- */
const pmHTML = (id, label = 'طريقة الدفع') => `<div class="pm" id="${id}" data-pm="cash"><div class="pm-l">${label}</div>
  <div class="pm-b" role="group" aria-label="${label}">${PM.map(([k, n]) => `<button type="button" class="pmb${k === 'cash' ? ' on' : ''}" data-k="${k}" aria-pressed="${k === 'cash'}">${n}</button>`).join('')}</div>
  <div class="pm-x" hidden>${ipHTML()}<input class="inp pm-note" maxlength="80" placeholder="رقم العملية أو ملاحظة (اختياري)" aria-label="ملاحظة" autocomplete="off"></div></div>`;
function pmWire(root, id, onChange) {
  const el = $('#' + id, root); if (!el) return null; const st = ipWire(el);
  const set = k => { k = pmKey(k); el.dataset.pm = k; $$('.pmb', el).forEach(b => { const on = b.dataset.k === k; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); $('.pm-x', el).hidden = !pmIs(k); if (onChange) onChange(k); };
  el.addEventListener('click', e => { const b = e.target.closest('.pmb'); if (b) set(b.dataset.k); });
  el._st = st; el._set = set; return el;
}
const pmGet = el => el ? { pm: pmKey(el.dataset.pm), img: el._st ? el._st.img : null, note: ($('.pm-note', el).value || '').trim() } : { pm: 'cash', img: null, note: '' };

/* ----- the notices ----- */
function rcAdd(o) { /* o: {cid, name, pm, a, k: inv|pay|bk|free, ref, note, img} — added in the same step as the payment it belongs to, before save() */
  const r = { id: uid(), at: new Date().toISOString(), customerId: o.cid || null, name: o.name || '', pm: o.pm, a: round2(o.a || 0), k: o.k || 'free', ref: o.ref || '', note: o.note || '', img: o.img ? 1 : 0, by: CUR_USER ? CUR_USER.name : '' };
  db.receipts.push(r); if (o.img) rcPut(r.id, o.img); return r;
}
/* a payment by bank / InstaPay / wallet: its notice is kept (with or without the picture, which can be added later) */
function rcFromPm(s, base) {
  if (!pmIs(s.pm)) return null;
  const r = rcAdd({ ...base, pm: s.pm, note: s.note, img: s.img });
  if (!s.img) toast(`سُجّل الدفع (${pmName(s.pm)}) بدون صورة إشعار — يمكنك إضافتها من «صور وإشعارات العملاء»`);
  return r;
}
const rcRefTxt = r => r.k === 'inv' ? `فاتورة ${r.ref}` : r.k === 'pay' ? 'تحصيل' : r.k === 'bk' ? 'إيداع حجز' : 'بدون ربط بحركة مالية';
function rcForInv(i) { /* the notices of the money taken on this invoice: at issue and by collections */
  const ids = new Set(db.payments.filter(p => (p.alloc || []).some(a => a.inv === i.id)).map(p => p.id));
  return db.receipts.filter(r => (r.k === 'inv' && r.ref === i.no) || (r.k === 'pay' && ids.has(r.ref)));
}
const rcThumbs = list => list.length ? `<div class="rc-th">${list.map(r => `<button type="button" class="rc-t" data-rcv="${esc(r.id)}" title="${esc(rcTag(r.pm))}">${rcSrc(r.id) ? `<img src="${rcSrc(r.id)}" alt="">` : `<i>${r.img ? '…' : '—'}</i>`}<span><b>${esc(rcTag(r.pm))}</b>${r.a ? `<em>${fmt(r.a)}</em>` : ''}</span></button>`).join('')}</div>` : '';
const rcPanel = (list, title = 'صور وإشعارات الدفع', cid = '') => list.length ? `<section class="panel noprint"><h2 class="panel-t">${title}</h2>${rcThumbs(list)}${cid ? `<div class="actions" style="margin-top:12px"><button class="btn ghost" type="button" data-act="go" data-to="receipts" data-p='${JSON.stringify({ cid })}'>عرض كل الصور والإشعارات</button></div>` : ''}</section>` : '';
document.addEventListener('click', e => { const b = e.target.closest('[data-rcv]'); if (b) rcView(b.dataset.rcv); });

function rcView(id) { /* the picture, full size */
  const r = db.receipts.find(x => x.id === id); if (!r) return;
  const src = rcSrc(id), who = r.name || custName(r.customerId);
  modal(`<h3>${esc(who)} — ${esc(rcTag(r.pm))}</h3>
    ${src ? `<img class="rc-big" src="${src}" alt="">` : `<p class="lbl">${r.img ? 'الصورة غير متاحة على هذا الجهاز.' : 'لم تُرفق صورة لهذا الإشعار بعد.'}</p>`}
    <p class="lbl" style="margin:10px 0 0">${r.a ? `المبلغ: <b>${money(r.a)}</b> — ` : ''}${dateTimeAr(r.at)} — ${esc(rcRefTxt(r))}${r.note ? ` — ${esc(r.note)}` : ''}</p>
    <div class="actions" style="margin-top:14px">${src ? `<a class="btn outline" download="receipt-${esc(r.id.slice(0, 6))}.jpg" href="${src}">تحميل الصورة</a>` : ''}<button class="btn ghost" data-no>إغلاق</button></div>`, (d, close) => { $('[data-no]', d).onclick = close; });
}
function rcAttach(id, done) { /* a notice that was kept without its picture */
  const r = db.receipts.find(x => x.id === id); if (!r) return;
  modal(`<h3>إضافة صورة الإشعار</h3>${ipHTML()}<div class="actions" style="margin-top:14px"><button class="btn" data-ok>حفظ الصورة</button><button class="btn ghost" data-no>إلغاء</button></div>`, (d, close) => {
    const st = ipWire(d); $('[data-no]', d).onclick = close;
    $('[data-ok]', d).onclick = async () => { if (!st.img) return toast('اختر صورة أولاً'); r.img = 1; await rcPut(r.id, st.img); logA('rc_add', r.name || custName(r.customerId), 'إضافة صورة إشعار'); save(); close(); toast('تم حفظ الصورة', 'ok'); if (done) done(); };
  });
}
function rcFree(cid, done) { /* a notice with no accounting effect: a bank / InstaPay / wallet screenshot or a photo of a paper transfer */
  let kind = 'bank';
  modal(`<h3>إضافة صورة / إشعار عميل</h3><p class="lbl" style="margin:0 0 12px">للاحتفاظ بصورة إشعار تحويل أو إيصال نقدي. لا تدخل في الحسابات ولا تغيّر أي رصيد.</p>
    <div class="field"><label for="rf-c">العميل</label><div class="sel"><select id="rf-c"><option value="">— غير مسجَّل (اكتب الاسم) —</option>${db.customers.map(c => `<option value="${esc(c.id)}"${c.id === cid ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div></div>
    <div class="field" id="rf-nw"><label for="rf-n">اسم العميل</label><input id="rf-n" class="inp" maxlength="60" autocomplete="off"></div>
    <div class="pm" id="rf-k"><div class="pm-l">نوع الإشعار</div><div class="pm-b" role="group" aria-label="نوع الإشعار">${RC_KINDS.map(([k, n]) => `<button type="button" class="pmb${k === kind ? ' on' : ''}" data-k="${k}" aria-pressed="${k === kind}">${n}</button>`).join('')}</div></div>
    <div class="field"><label for="rf-a">المبلغ (اختياري)</label><input id="rf-a" class="inp" inputmode="decimal" autocomplete="off"></div>
    <div class="field"><label for="rf-t">ملاحظة (اختياري)</label><input id="rf-t" class="inp" maxlength="80" autocomplete="off"></div>
    ${ipHTML()}<div class="actions" style="margin-top:14px"><button class="btn" data-ok>حفظ</button><button class="btn ghost" data-no>إلغاء</button></div>`, (d, close) => {
    const st = ipWire(d), sel = $('#rf-c', d), nw = $('#rf-nw', d); nw.hidden = !!sel.value; sel.onchange = () => { nw.hidden = !!sel.value; };
    $('#rf-a', d).addEventListener('input', e => { e.target.value = cleanNum(e.target.value); });
    $('#rf-k', d).addEventListener('click', e => { const b = e.target.closest('.pmb'); if (!b) return; kind = b.dataset.k; $$('#rf-k .pmb', d).forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); }); });
    $('[data-no]', d).onclick = close;
    $('[data-ok]', d).onclick = () => {
      const c = sel.value ? custById(sel.value) : null, name = c ? c.name : $('#rf-n', d).value.trim();
      if (!name) return toast('اختر العميل أو اكتب اسمه');
      if (!st.img) return toast('اختر صورة الإشعار');
      const r = rcAdd({ cid: c ? c.id : null, name, pm: kind, a: num($('#rf-a', d).value), k: 'free', note: $('#rf-t', d).value.trim(), img: st.img });
      logA('rc_add', name, rcTag(kind), ...(r.a ? [money(r.a)] : [])); save(); close(); toast('تم حفظ الإشعار', 'ok'); if (done) done();
    };
  });
}

/* ----- the section: «صور وإشعارات العملاء» ----- */
screens.receipts = (p, v) => {
  const F = { q: '', m: '', c: p && p.cid ? p.cid : '' };
  v.innerHTML = subHead('صور وإشعارات العملاء') + `<div class="stack">
    <section class="panel"><div class="toolbar"><input id="rc-q" class="inp" placeholder="ابحث باسم العميل أو رقم الفاتورة أو الملاحظة" aria-label="بحث" autocomplete="off"><button class="btn" id="rc-add" type="button">${ICON.plus}<span>إضافة صورة / إشعار</span></button></div>
      <div class="pm-b rc-f" id="rc-m" role="group" aria-label="النوع"><button type="button" class="pmb on" data-k="">الكل</button>${RC_KINDS.map(([k, n]) => `<button type="button" class="pmb" data-k="${k}">${n}</button>`).join('')}</div>
      <p class="lbl" id="rc-cf" style="margin:10px 0 0" hidden></p>
      <div class="stats" id="rc-st" style="margin-top:14px"></div></section>
    <section class="panel"><div class="rc-grid" id="rc-g"></div></section></div>`;
  const list = () => db.receipts.filter(r => (!F.m || r.pm === F.m) && (!F.c || r.customerId === F.c) && (!F.q || (r.name || custName(r.customerId)).includes(F.q) || String(r.ref).includes(toLat(F.q)) || (r.note || '').includes(F.q))).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const draw = () => {
    const L = list(), cf = $('#rc-cf'); cf.hidden = !F.c; if (F.c) cf.innerHTML = `العميل: <b>${esc(custName(F.c))}</b> <button class="lnk" id="rc-cx" type="button">عرض كل العملاء</button>`;
    $('#rc-st').innerHTML = RC_KINDS.map(([k, n]) => { const x = L.filter(r => r.pm === k); return x.length ? `<div class="stat"><span>${n} (${fmt(x.length)})</span><b>${x.some(r => r.a) ? money(sumA(x.map(r => ({ a: r.a })))) : '—'}</b></div>` : ''; }).join('') || '<div class="stat"><span>لا توجد إشعارات</span><b>0</b></div>';
    $('#rc-g').innerHTML = L.map(r => { const who = r.name || custName(r.customerId), src = rcSrc(r.id), inv = r.k === 'inv' ? db.invoices.find(i => i.no === r.ref) : null; return `<article class="rc" data-id="${esc(r.id)}">
      <button type="button" class="rc-img" data-rcv="${esc(r.id)}" aria-label="عرض">${src ? `<img src="${src}" alt="">` : `<i>${r.img ? 'جارٍ التحميل…' : 'بدون صورة'}</i>`}</button>
      <div class="rc-b"><b>${esc(who)}</b> <span class="pill info">${esc(rcTag(r.pm))}</span>
        <div class="muted">${dateTimeAr(r.at)}</div>${r.a ? `<div class="val">${money(r.a)}</div>` : ''}
        <div class="muted">${inv ? `<button class="lnk" data-inv="${esc(inv.id)}" type="button">${esc(rcRefTxt(r))}</button>` : esc(rcRefTxt(r))}</div>${r.note ? `<div class="muted">${esc(r.note)}</div>` : ''}
        <div class="rc-a">${r.img ? '' : `<button class="mini" data-att="${esc(r.id)}" type="button">إضافة صورة</button>`}<button class="mini" data-del="${esc(r.id)}" type="button">حذف</button></div></div></article>`; }).join('') || '<p class="empty">لا توجد صور أو إشعارات بعد. تُحفظ هنا تلقائياً صور الإشعارات التي ترفقها عند الدفع بالبنك أو إنستا باي أو المحفظة.</p>';
  };
  $('#rc-q').addEventListener('input', e => { F.q = e.target.value.trim(); draw(); });
  $('#rc-m').addEventListener('click', e => { const b = e.target.closest('.pmb'); if (!b) return; F.m = b.dataset.k; $$('#rc-m .pmb').forEach(x => x.classList.toggle('on', x === b)); draw(); });
  $('#rc-add').onclick = () => rcFree(F.c, render);
  $('#rc-g').addEventListener('click', async e => {
    const iv = e.target.closest('[data-inv]'); if (iv) return go('invDetail', { id: iv.dataset.inv });
    const at = e.target.closest('[data-att]'); if (at) return rcAttach(at.dataset.att, render);
    const dl = e.target.closest('[data-del]'); if (!dl) return;
    const r = db.receipts.find(x => x.id === dl.dataset.del); if (!r) return;
    if (!await confirmBox('', 'سيُحذف هذا الإشعار وصورته فقط، ولا يتغيّر أي مبلغ أو رصيد. هل تريد المتابعة؟')) return;
    if (!await requireAdmin('اكتب الرقم السري للمسؤول لحذف الإشعار')) return;
    db.receipts = db.receipts.filter(x => x.id !== r.id); rcDelImg(r.id); logA('rc_del', r.name || custName(r.customerId), rcTag(r.pm), ...(r.a ? [money(r.a)] : [])); save(); draw(); toast('تم حذف الإشعار', 'ok');
  });
  v.addEventListener('click', e => { if (e.target.closest('#rc-cx')) { F.c = ''; draw(); } });
  draw();
};
rcLoad(); /* the pictures come in from their own store a moment after the page opens */
