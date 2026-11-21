/* ---------- Helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const round2 = n => Math.round((+n || 0) * 100) / 100;
const round3 = n => Math.round((+n || 0) * 1000) / 1000; /* quantities keep three decimals (tons, metres) */
const fmt = n => round2(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
const fmtq = n => round3(n).toLocaleString('en-US', { maximumFractionDigits: 3 });
const toLat = s => String(s ?? '').replace(/[٠-٩]/g, d => d.charCodeAt(0) - 0x660).replace(/[۰-۹]/g, d => d.charCodeAt(0) - 0x6F0).replace(/٫/g, '.').replace(/[٬,]/g, '');
const num = s => { const v = parseFloat(toLat(s)); return isFinite(v) ? v : 0; };
const cleanNum = s => toLat(s).replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const money = n => `${fmt(n)} جنيه`;
const owe = n => { n = round2(n); return n > 0 ? `عليه ${fmt(n)}` : n < 0 ? `له ${fmt(-n)}` : 'خالص'; }; /* a balance in words instead of a signed number: «عليه» = the customer owes us, «له» = we owe him */
const ymd = v => { const d = v instanceof Date ? v : new Date(v); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const sameDay = (iso, d = new Date()) => { const a = new Date(iso); return a.getFullYear() === d.getFullYear() && a.getMonth() === d.getMonth() && a.getDate() === d.getDate(); };
const dateAr = (d = new Date()) => d.toLocaleDateString(LOC, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(/،/g, '');
const dateTimeAr = iso => { const d = new Date(iso); return d.toLocaleDateString(LOC, { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' }); };

/* ---------- Storage (localStorage, falls back to memory) ---------- */
const APP_L1 = 'النسخة الأولى التجريبية', APP_L2 = 'لبرنامج المحاسبات لمواد البناء';
const APP_NAME = APP_L1 + ' ' + APP_L2;
const KEY = 'accounts.trial.v1';
const ARR = ['customers', 'invoices', 'expenses', 'payments', 'suppliers', 'spay', 'purchases', 'bookings', 'returns', 'closings', 'damages', 'counts', 'moves', 'cheques', 'quotes', 'deliveries', 'spurch', 'emps', 'att', 'adv', 'reminders', 'receipts', 'cashin', 'pmoves', 'vouchers']; /* every list kept in the database (spurch = goods typed by hand in the Suppliers section: they never touch the warehouses; cashin = money put into the drawer from the drawer / the safe / the capital; pmoves = withdrawals and transfers between the four places of the money, and what is handed over to the management) */
const WH0 = 'main'; /* the first warehouse always exists */
const seed = () => {
  const o = {
    v: 2, demo: true, seq: 0,
    settings: { company: '', nameVer: 3, vat: 14, theme: '', zoom: 100, logo: '', address: '', phones: '', adminPin: null, loginPin: null },
    audit: [], rseq: 0, qseq: 0, vseq: { in: 0, out: 0 }, warehouses: [{ id: WH0, name: 'المخزن الرئيسي' }],
    items: [{ id: uid(), name: 'حديد', unit: 'طن', qty: 100, cost: 1000, price: 1100, min: 0, wh: { [WH0]: 100 } }],
  };
  ARR.forEach(k => { o[k] = []; });
  return o;
};
function loadDB() {
  try {
    let r = localStorage.getItem(KEY);
    if (!r) { /* one-time move of data saved by the earlier build */ const old = Object.keys(localStorage).find(k => k.endsWith('.accounts.v1')); if (old) { r = localStorage.getItem(old); localStorage.removeItem(old); } }
    if (r) return JSON.parse(r);
  } catch (e) { /* storage blocked */ }
  return null;
}
let db = loadDB() || seed();
if (!db.settings) db.settings = {};
function migrateSettings(S) {
  if (S.nameVer !== 3) { /* one-time: the facility name starts empty; a plain-text login PIN from older builds becomes a hashed one */
    if (!S.company || S.company === APP_NAME) S.company = '';
    if (S.pin) S.loginPin = makePin(String(S.pin));
    delete S.pin; S.nameVer = 3;
  }
  if (S.vat == null) S.vat = 14;
  S.theme = S.theme || ''; S.zoom = S.zoom || 100; S.logo = S.logo || ''; S.adminPin = S.adminPin || null; S.loginPin = S.loginPin || null;
  S.address = S.address || ''; S.phones = S.phones || ''; S.sound = S.sound !== false;
  if (S.taxOn === undefined) S.taxOn = (db.invoices || []).some(i => i.vatOn); /* the tax switch: on at once for books that already use VAT, off for new ones */
  S.taxOn = !!S.taxOn; S.taxNo = S.taxNo || ''; S.crNo = S.crNo || ''; S.lockDate = S.lockDate || '';
  S.backupEvery = S.backupEvery == null ? 1 : +S.backupEvery; S.lastBackup = S.lastBackup || '';
  S.whOn = !!S.whOn; /* several warehouses: off until switched on in Settings */
}
/* every customer and every supplier has a short code (C-001, S-001 …): given automatically wherever one is created, and he can change it */
const nextCode = (list, pre) => { let n = 0; list.forEach(x => { const m = /^([A-Za-z])-(\d+)$/.exec(x.code || ''); if (m && m[1].toUpperCase() === pre) n = Math.max(n, +m[2]); }); return pre + '-' + String(n + 1).padStart(3, '0'); };
const cleanCode = s => toLat(s).trim().toUpperCase().replace(/\s+/g, '').slice(0, 12);
function ensureCodes(d) { [['customers', 'C'], ['suppliers', 'S']].forEach(([k, pre]) => (d[k] || []).forEach(x => { if (!x.code) x.code = nextCode(d[k], pre); })); }
function upgradeDB(d) { /* older saves: add the lists the reports need and tag old records */
  if (!Array.isArray(d.items)) d.items = [];
  ARR.forEach(k => { if (!Array.isArray(d[k])) d[k] = []; });
  ensureCodes(d);
  d.adv.forEach(a => { if (!a.expId) { const e = d.emps.find(x => x.id === a.empId), ex = { id: uid(), date: new Date(a.date + 'T12:00:00').toISOString(), title: 'سلفة موظف — ' + (e ? e.name : ''), amount: +a.amount || 0, note: a.note || '', cat: 'misc', advId: a.id }; d.expenses.push(ex); a.expId = ex.id; } }); /* advances saved before 4.2 were not in the expenses */
  if (!Array.isArray(d.audit)) d.audit = [];
  d.rseq = d.rseq || d.returns.length;
  d.expenses.forEach(e => { if (!e.cat) e.cat = 'misc'; });
  d.invoices.forEach(i => { if (!i.kind) i.kind = 'credit'; if (i.deposit == null) i.deposit = 0; i.over = Math.max(+i.over || 0, 0); }); /* over = what the customer paid above the invoice (kept as his deposit) */
  if (!Array.isArray(d.warehouses) || !d.warehouses.length) d.warehouses = [{ id: WH0, name: 'المخزن الرئيسي' }];
  d.warehouses.forEach(w => { w.id = String(w.id); w.name = String(w.name || ''); });
  if (!d.warehouses.some(w => w.id === WH0)) d.warehouses.unshift({ id: WH0, name: 'المخزن الرئيسي' });
  d.items.forEach(it => { /* the total quantity always equals the sum over the warehouses */
    it.min = Math.max(+it.min || 0, 0); it.qty = round3(it.qty); it.cost = Math.max(+it.cost || 0, 0); if (!d.warehouses.some(w => w.id === it.home)) it.home = ''; /* home = the warehouse the item is registered to */
    if (!it.wh || typeof it.wh !== 'object') it.wh = { [WH0]: it.qty };
    const sum = round3(Object.values(it.wh).reduce((s, x) => s + (+x || 0), 0));
    if (Math.abs(sum - it.qty) > 0.0004) it.wh[WH0] = round3((+it.wh[WH0] || 0) + it.qty - sum);
  });
  d.invoices.forEach(i => { if (!i.wh) i.wh = WH0; i.rows.forEach(l => { if (!l.wh) l.wh = i.wh; }); }); /* every line knows the warehouse it came out of */
  d.customers.forEach(c => { c.limit = Math.max(+c.limit || 0, 0); if (!c.prices || typeof c.prices !== 'object' || Array.isArray(c.prices)) c.prices = {}; }); /* credit limit (0 = none) and special prices {itemId: price} */
  d.cheques.forEach(c => { if (!c.status) c.status = 'pending'; });
  d.qseq = Math.max(+d.qseq || 0, d.quotes.length); /* quotation numbers */
  if (!d.vseq || typeof d.vseq !== 'object') d.vseq = {}; ['in', 'out'].forEach(k => { d.vseq[k] = Math.max(+d.vseq[k] || 0, d.vouchers.filter(x => x.kind === k).length); }); /* cash receipt numbers: one run for the receipts from customers, one for the receipts from the office (8.49) */
  d.quotes.forEach(q => { if (!q.status) q.status = 'open'; q.invNo = q.invNo || ''; });
  d.deliveries.forEach(x => { if (!x.status) x.status = 'pending'; x.fee = Math.max(+x.fee || 0, 0); x.expId = x.expId || ''; });
  if (!Array.isArray(d.users)) d.users = []; /* accounts with roles (empty = the program works as before) */
  d.v = 2;
}
migrateSettings(db.settings); upgradeDB(db);
let CUR_USER = null; /* the signed-in user, when accounts are used */
let guardFn = null; /* the trial build sets this: returns true once the trial is over */
var bkDirty = false; /* set by every save; the automatic backup writes its file only when something changed */
function save() { if (guardFn && guardFn()) return; if (!writeOk()) return; ensureCodes(db); bkDirty = true; try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* keep in memory */ } }
save();

/* ---------- Theme ---------- */
const root = document.documentElement;
function isDark() {
  const t = root.getAttribute('data-theme');
  if (t) return t === 'dark';
  return !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
}
function applyTheme() { if (db.settings.theme) root.setAttribute('data-theme', db.settings.theme); }
function toggleTheme() { db.settings.theme = isDark() ? 'light' : 'dark'; applyTheme(); save(); }
applyTheme();

/* ---------- Toast & modal ---------- */
function toast(msg, type = 'err') {
  const t = document.createElement('div');
  t.className = 'toast ' + type; t.setAttribute('role', 'status');
  t.innerHTML = `<span class="tx">${type === 'ok' ? ICON.check : ICON.x}</span><span>${esc(msg)}</span>`;
  $('#toasts').append(t);
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('in')));
  const kill = () => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); };
  $('.tx', t).onclick = kill; setTimeout(kill, 2800);
}
function modal(html, onMount, onDismiss) {
  const ov = document.createElement('div'); ov.className = 'ov';
  ov.innerHTML = `<div class="dlg" role="dialog" aria-modal="true">${html}</div>`;
  const close = () => ov.remove();
  const dismiss = () => { close(); if (onDismiss) onDismiss(); };
  ov.addEventListener('mousedown', e => { if (e.target === ov) dismiss(); });
  ov.addEventListener('keydown', e => { if (e.key === 'Escape') dismiss(); });
  $('#modals').append(ov);
  if (onMount) onMount($('.dlg', ov), close);
  const f = $('input,select,button.btn', ov); if (f) f.focus();
  return close;
}
function confirmBox(title, msg, okLabel = 'حذف', danger = true) {
  return new Promise(res => {
    modal(`${title ? `<h3>${esc(title)}</h3>` : ''}<p${title ? '' : ' class="msg"'}>${esc(msg)}</p><div class="actions"><button class="btn ${danger ? 'danger' : ''}" data-ok>${esc(okLabel)}</button><button class="btn outline" data-no>إلغاء</button></div>`, (d, close) => {
      $('[data-ok]', d).onclick = () => { close(); res(true); };
      $('[data-no]', d).onclick = () => { close(); res(false); };
    }, () => res(false));
  });
}

/* ---------- Admin PIN guard (client-side only: it keeps staff out of Settings, it is not real security) ---------- */
let adminUntil = 0;
const leaveHooks = []; /* run when the user leaves Settings (the developer section registers one to lock itself) */
const adminOpen = () => usersOn() ? !!(CUR_USER && CUR_USER.role === 'admin') || Date.now() < adminUntil : !db.settings.adminPin || Date.now() < adminUntil; /* with accounts, a manager is already signed in; anyone else needs a manager's PIN */
const cleanPin = s => toLat(s).replace(/\D/g, '').slice(0, 8);
const tries = {};
const waitSecs = k => { const t = tries[k]; return t && t.until > Date.now() ? Math.ceil((t.until - Date.now()) / 1000) : 0; };
const pinFail = k => { const t = tries[k] = tries[k] || { n: 0, until: 0 }; if (++t.n >= 5) { t.n = 0; t.until = Date.now() + 30000; } };
function requireAdmin(why = 'اكتب الرقم السري للمسؤول لحفظ التغييرات') {
  if (adminOpen()) return Promise.resolve(true);
  return new Promise(res => {
    modal(`<h3>الرقم السري للمسؤول</h3><p>${esc(why)}</p>${usersOn() ? '<p class="lbl">هذا الإجراء يحتاج موافقة مدير: يكتب المدير رقمه السري.</p>' : ''}<input id="adm-pin" class="inp" type="password" inputmode="numeric" maxlength="8" autocomplete="off" aria-label="الرقم السري للمسؤول"><div class="actions"><button class="btn ok" data-ok>تأكيد</button><button class="btn outline" data-no>إلغاء</button></div>`, (d, close) => {
      const inp = $('#adm-pin', d);
      const submit = () => {
        const w = waitSecs('admin'); if (w) return toast(`محاولات كثيرة. حاول بعد ${w} ثانية`);
        const pin = cleanPin(inp.value), by = usersOn() ? approveAdmin(pin) : (checkPin(pin, db.settings.adminPin) ? '*' : '');
        if (by) { delete tries.admin; if (by === '*') adminUntil = Date.now() + 10 * 60 * 1000; else noteApprover(by); close(); res(true); } /* with accounts a manager's PIN approves this one action only */
        else { pinFail('admin'); inp.value = ''; inp.focus(); toast('الرقم السري غير صحيح'); }
      };
      $('[data-ok]', d).onclick = submit; inp.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
      $('[data-no]', d).onclick = () => { close(); res(false); };
    }, () => res(false));
  });
}

/* ---------- Zoom & brand ---------- */
function applyZoom() { const z = Math.min(140, Math.max(80, +db.settings.zoom || 100)) / 100, a = $('#app'); if (a) { a.style.zoom = z; a.style.setProperty('--z', z); } }
function brandHTML() {
  const n = (db.settings.company || '').trim();
  if (!n) return ''; /* the place stays open for the facility name; the program name now lives in the footer next to the version number */
  const w = n.split(/\s+/), k = Math.floor(w.length / 2);
  return k ? `<span class="b1">${esc(w.slice(0, k).join(' '))}</span><span class="b2">${esc(w.slice(k).join(' '))}</span>` : `<span class="b2">${esc(n)}</span>`;
}

/* ---------- Router ---------- */
let stack = [];
let cur = { name: 'home', p: {} };
const screens = {};
/* The browser's Back / Forward buttons walk through the program's own screens (they no longer leave the program for the page that opened it).
   Every screen opened by go() is one browser history entry; entry 0 is a guard under the home screen, so Back on the home screen stays in the program. */
let HON = true, HS = Math.random().toString(36).slice(2), HN = 1, HL = [0, 1], HR = { 1: cur }, hPos = 1, hSkip = { n: 0, t: 0 };
const hTry = f => { try { f(); return true; } catch (e) { HON = false; return false; } };
function hInit() {
  if (!hTry(() => { history.scrollRestoration = 'manual'; history.replaceState({ ap: HS, e: 0 }, ''); history.pushState({ ap: HS, e: 1 }, ''); })) return;
  window.addEventListener('popstate', hPop);
}
function hNav(replace) { /* the browser entry follows go() */
  if (!HON) return;
  if (replace) { HR[HL[hPos]] = cur; return; }
  const e = ++HN; if (!hTry(() => history.pushState({ ap: HS, e }, ''))) return;
  HL.splice(hPos + 1).forEach(i => delete HR[i]); HL.push(e); hPos++; HR[e] = cur;
}
function hReset() { /* logout / lock: the old entries are forgotten (a stale one that is reached shows the home screen) */
  stack = []; cur = { name: 'home', p: {} }; if (!HON) return;
  const e = ++HN; if (!hTry(() => history.replaceState({ ap: HS, e }, ''))) return;
  HR = { [e]: cur }; HL = [0, e]; hPos = 1;
}
function hPop(ev) {
  if (hSkip.n && Date.now() - hSkip.t > 1500) hSkip.n = 0;
  if (hSkip.n) { hSkip.n--; return; } /* the echo of a Back done by the program's own back button */
  const s = ev.state, mine = !!s && s.ap === HS, base = mine && s.e === 0, known = mine && HR[s.e] !== undefined, pos = known ? HL.indexOf(s.e) : -1;
  if (known && pos === hPos) return;
  const ov = $('#modals') && $('#modals').lastElementChild, lock = !!$('.lock');
  if (lock || ov || popEl) { /* the lock screen stays; a dialog or the bell list is closed by Back — either way the position is kept */
    if (!lock) { if (ov) ov.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); else closePop(); }
    if (known) hTry(() => history.go(hPos - pos)); else if (base) hTry(() => history.forward());
    return;
  }
  if (base) { hTry(() => history.forward()); return; } /* Back on the home screen: stay in the program */
  if (!known) { /* an entry from an earlier visit or from before a logout: it becomes the home screen */
    const e = ++HN; hTry(() => history.replaceState({ ap: HS, e }, '')); cur = { name: 'home', p: {} }; stack = []; HR = { [e]: cur }; HL = [0, e]; hPos = 1;
  } else { hPos = pos; cur = HR[s.e]; stack = HL.slice(1, pos).map(i => HR[i]); }
  render(); window.scrollTo(0, 0);
}
function go(name, p = {}, opt = {}) {
  if (!canScreen(name)) return toast('ليس لديك صلاحية لفتح هذه الشاشة');
  if (!opt.replace) stack.push(cur);
  cur = { name, p };
  hNav(!!opt.replace);
  render(); window.scrollTo(0, 0);
}
function back() {
  if (HON && hPos > 1) { /* the screen changes now; the browser entry steps back with it */
    hPos--; cur = HR[HL[hPos]] || { name: 'home', p: {} }; stack = HL.slice(1, hPos).map(i => HR[i]);
    hSkip = { n: hSkip.n + 1, t: Date.now() }; if (!hTry(() => history.back())) hSkip.n = 0;
  } else cur = stack.pop() || { name: 'home', p: {} };
  render(); window.scrollTo(0, 0);
}
function render() {
  if (guardFn && guardFn()) return;
  closePop();
  if (!canScreen(cur.name)) cur = { name: 'home', p: {} };
  if (!/^set/.test(cur.name)) { adminUntil = 0; leaveHooks.forEach(f => f()); } /* leaving Settings locks it again */
  const v = $('#view'); v.innerHTML = '';
  (screens[cur.name] || screens.home)(cur.p, v);
}
const subHead = title => `<div class="sub-head"><h1>${esc(title)}</h1><button class="back" data-act="back" aria-label="رجوع">${ICON.back}</button></div>`;

/* ---------- Business logic ---------- */
const itemById = id => db.items.find(i => i.id === id);
/* an item has three parts he types: الصنف (item.base) · النوع (item.type: an iron diameter, a cement kind…) · المصنع (item.maker: the factory that makes it).
   item.name stays the ONE joined name (base + type), so every list, invoice and report keeps reading it as before; the maker is kept beside it, and every maker he typed is remembered in db.makers. */
const itemJoin = (base, type) => [base, type].map(x => String(x || '').trim()).filter(Boolean).join(' ');
const itemLbl = i => i.name + (i.maker && db.items.filter(x => x.name === i.name).length > 1 ? ' — ' + i.maker : ''); /* the picker label: the plain name; the maker is added only when two items still carry the same name (v8.38: same name + unit = ONE item, its makers are per addition) */
const uniqStr = a => [...new Set(a.map(x => String(x || '').trim()).filter(Boolean))];
const rememberMaker = m => { m = String(m || '').trim(); if (!m) return; db.makers = db.makers || []; if (!db.makers.includes(m)) db.makers.push(m); };
const makerList = () => uniqStr([...(db.makers || []), ...db.items.map(i => i.maker)]);
const baseList = () => uniqStr(db.items.map(i => i.base || i.name));
const typeList = base => uniqStr(db.items.filter(i => !base || (i.base || i.name) === base).map(i => i.type));
const sameItem = (i, name, unit) => i.name === name && i.unit === unit; /* v8.38: the same name (item + type) and unit is ONE card whatever the factory: every addition is kept inside it with its own price and maker */
const dlOpts = a => a.map(x => `<option value="${esc(x)}">`).join('');
const itemMakers = it => uniqStr([...(it.lots || []).map(l => l.m), it.maker]); /* every factory this item came from (per addition), the latest typed one last */
/* every addition of an item, newest first: the lots kept since v8.38 (date, quantity, purchase price, sale price, maker, supplier, warehouse) and, for what was added before, the dated «إضافة» entries of the stock log (no prices were kept then) */
function itemAdds(it) {
  const lots = (it.lots || []).map(l => ({ ...l })), ids = new Set(lots.map(l => l.id));
  const old = db.moves.filter(m => m.itemId === it.id && m.type === 'add' && !ids.has(m.id)).map(m => ({ id: m.id, d: m.date, q: m.qty, s: m.ref || '', w: m.wh, old: 1 }));
  return lots.concat(old).sort((a, b) => String(b.d).localeCompare(String(a.d)));
}
const itemParts = (base, type, maker) => { const o = { base: String(base || '').trim() }; if (String(type || '').trim()) o.type = String(type).trim(); if (String(maker || '').trim()) o.maker = String(maker).trim(); return o; };
const stockValue = () => db.items.reduce((s, i) => s + i.qty * i.cost, 0);
/* warehouses: every item keeps its total (qty) and the part held in each warehouse (wh); stockMove is the only way stock changes */
const whName = id => { const w = db.warehouses.find(x => x.id === id); return w ? w.name : '—'; };
const whQty = (it, w) => round3((it.wh && it.wh[w]) || 0);
function pickWh(it) { /* the warehouse a sale draws from by default: the item's own warehouse when it has stock there, else the one holding the most */
  if (!it) return WH0; const home = it.home && db.warehouses.some(w => w.id === it.home) ? it.home : '';
  if (home && whQty(it, home) > 0) return home;
  let best = '', bq = 0; db.warehouses.forEach(w => { const q = whQty(it, w.id); if (q > bq) { bq = q; best = w.id; } });
  return best || home || WH0;
}
const invPaidAll = i => round2((i.paid || 0) + (i.over || 0)); /* what the customer handed over at issue (the part above the invoice is his deposit) */
/* the invoice as it stood at one moment (issue, or the moment of an edit that changed goods or money): kept in i.hist so the paper can show goods added later on the day they were added */
const invState = (o, d) => ({ d, rows: (o.rows || []).map(l => ({ itemId: l.itemId, name: l.name, unit: l.unit, qty: l.qty, price: l.price, total: l.total })), transport: o.transport || 0, discPct: o.discPct || 0, discCash: o.discCash || 0, discAmt: o.discAmt || 0, vatPct: o.vatPct || 0, vatAmt: o.vatAmt || 0, net: o.net, paid: o.paid || 0, over: o.over || 0 });
function invStates(r) {
  const h = (r.hist && r.hist.length ? r.hist : [invState(r, r.date)]).slice(), z = h[h.length - 1];
  if (round2(z.net) !== round2(r.net) || round2(z.paid) !== round2(r.paid || 0) || round2(z.over) !== round2(r.over || 0)) h.push(invState(r, ((r.edits || []).slice(-1)[0] || {}).at || r.date)); /* safety: the last state always equals the invoice as it is now */
  return h;
}
function stockMove(it, w, d) { it.wh = it.wh || {}; w = w || WH0; it.wh[w] = round3((+it.wh[w] || 0) + d); it.qty = round3(Object.values(it.wh).reduce((s, x) => s + x, 0)); }
function logMove(it, w, type, qty, ref) { const m = { id: uid(), date: new Date().toISOString(), itemId: it.id, wh: w || WH0, type, qty: round3(qty), ref: ref || '' }; db.moves.push(m); if (db.moves.length > 20000) db.moves.splice(0, db.moves.length - 20000); return m; }
const lowLimit = i => i.min > 0 ? i.min : 5; /* an item with no minimum of its own warns at 5, as before */
const dayNum = s => { const d = String(s).slice(0, 10).split('-'); return Date.UTC(+d[0], +d[1] - 1, +d[2]) / 864e5; };
const daysTo = s => Math.round(dayNum(s) - dayNum(ymd(new Date()))); /* whole days from today to a date (negative = in the past) */
const liveInvoices = () => db.invoices.filter(i => i.status !== 'void'); /* cancelled invoices stay on file but count for nothing */
const retCreditMap = () => { const m = {}; db.returns.forEach(r => { m[r.invId] = round2((m[r.invId] || 0) + (r.credit || 0)); }); return m; }; /* the part of each return taken off what the customer still owes */
const voidIds = () => new Set(db.invoices.filter(i => i.status === 'void').map(i => i.id));
const payVoided = (p, vd = voidIds()) => round2((p.alloc || []).filter(a => vd.has(a.inv)).reduce((s, a) => s + a.a, 0)); /* the part of a collection that sat on an invoice later cancelled: it went back to the customer, so it settles nothing */
function customerDebt(cid) {
  const rc = retCreditMap(), vd = voidIds();
  const inv = db.invoices.filter(i => i.customerId === cid && i.status !== 'void').reduce((s, i) => s + i.remaining - (rc[i.id] || 0), 0);
  const pay = db.payments.filter(p => p.customerId === cid).reduce((s, p) => s + p.amount - payVoided(p, vd), 0);
  return Math.max(round2(inv - pay), 0);
}
/* ---------- Collections are tied to invoices: every payment records which invoices it settled (oldest first) ---------- */
function settledMap() { const m = {}; db.payments.forEach(p => (p.alloc || []).forEach(a => { m[a.inv] = round2((m[a.inv] || 0) + a.a); })); return m; }
const invSettled = (i, m = settledMap()) => m[i.id] || 0; /* collected after the invoice was issued */
const invLeft = (i, m = settledMap(), rc = retCreditMap()) => i.status === 'void' ? 0 : Math.max(round2(i.remaining - (m[i.id] || 0) - (rc[i.id] || 0)), 0);
const invPaidNow = (i, m = settledMap()) => round2(i.paid + (m[i.id] || 0));
const byDate = (a, b) => String(a.date) < String(b.date) ? -1 : String(a.date) > String(b.date) ? 1 : 0;
/* places: a customer can buy for several places (sites); every invoice and every deposit may carry one ('' = no place) */
const placeOf = o => String((o && o.place) || '').trim();
function custPlaces(c) { /* the places he has saved, plus any place one of his invoices or deposits already uses */
  const out = [], add = p => { p = String(p || '').trim(); if (p && !out.includes(p)) out.push(p); };
  if (c) { (c.places || []).forEach(add); db.invoices.forEach(i => { if (i.customerId === c.id && i.status !== 'void') add(i.place); }); db.bookings.forEach(b => { if (b.customerId === c.id) add(b.place); }); }
  return out;
}
function allocate(cid, amount, onlyInv, place) { /* split a collection over the customer's open invoices, oldest first (place given = only the invoices of that place; '' = those with no place) */
  const m = settledMap(), out = []; let left = round2(amount);
  db.invoices.filter(i => i.customerId === cid && i.status !== 'void' && (!onlyInv || i.id === onlyInv) && (place == null || placeOf(i) === place)).sort(byDate).forEach(i => {
    const open = invLeft(i, m);
    if (open > 0 && left > 0) { const a = round2(Math.min(open, left)); out.push({ inv: i.id, no: i.no, a }); left = round2(left - a); }
  });
  return out;
}
function linkPayments() { const old = db.payments.filter(p => !Array.isArray(p.alloc)).sort(byDate); old.forEach(p => { p.alloc = allocate(p.customerId, p.amount); }); return old.length; }
const invPays = i => db.payments.flatMap(p => (p.alloc || []).filter(a => a.inv === i.id).map(a => ({ id: p.id, date: p.date, a: a.a, pm: p.pm })));
if (linkPayments()) save(); /* old collections get tied to the invoices they settled (runs once; later loads find alloc already set) */
const invCost = i => i.rows.reduce((s, l) => s + l.qty * (l.cost || 0), 0);
const invProfit = i => round2((i.subtotal - i.discAmt) - invCost(i)); /* sales after discount, before VAT, minus cost of goods */
const invRetNet = i => round2(db.returns.filter(r => r.invId === i.id).reduce((s, r) => s + r.net, 0)); /* value of what came back on this invoice */
const customerTotal = cid => round2(db.invoices.filter(i => i.customerId === cid && i.status !== 'void').reduce((s, i) => s + i.net - invRetNet(i), 0));
function notifications() {
  const out = [];
  db.items.filter(i => i.qty <= 0).forEach(i => out.push({ c: 'var(--red)', to: 'invView', t: `نفد الصنف «${i.name}» من المخزن` }));
  db.items.filter(i => i.qty > 0 && i.qty <= lowLimit(i)).forEach(i => out.push({ c: 'var(--amber)', to: i.min > 0 ? 'shopList' : 'invView', t: `رصيد «${i.name}» منخفض: ${fmtq(i.qty)} ${i.unit}${i.min > 0 ? ` (الحد الأدنى ${fmtq(i.min)})` : ''}` }));
  db.cheques.filter(c => c.status === 'pending' && daysTo(c.due) <= 3).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 8).forEach(c => {
    const n = daysTo(c.due), when = n < 0 ? `متأخر ${-n} يوم` : n === 0 ? 'يستحق اليوم' : `يستحق بعد ${n} يوم`;
    out.push({ c: n < 0 ? 'var(--red)' : 'var(--amber)', to: 'cheques', t: c.kind === 'in' ? `شيك وارد رقم ${c.no} من ${c.name} بمبلغ ${money(c.amount)}: ${when}` : `شيك صادر رقم ${c.no} إلى ${c.name} بمبلغ ${money(c.amount)}: ${when}` });
  });
  db.deliveries.filter(x => (x.status === 'pending' || x.status === 'out') && x.date && daysTo(x.date) <= 0).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6).forEach(x => {
    const n = daysTo(x.date), st = n < 0 ? `متأخر ${-n} يوم` : x.status === 'out' ? 'في الطريق اليوم' : 'موعده اليوم';
    out.push({ c: n < 0 ? 'var(--red)' : 'var(--amber)', to: 'deliveries', t: x.invNo ? `توصيل ${x.name} (فاتورة ${x.invNo}): ${st}` : `توصيل ${x.name}: ${st}` });
  });
  db.quotes.filter(q => q.status === 'open' && q.valid && daysTo(q.valid) >= 0 && daysTo(q.valid) <= 2).sort((a, b) => a.valid.localeCompare(b.valid)).slice(0, 4).forEach(q => {
    const n = daysTo(q.valid); out.push({ c: 'var(--amber)', to: 'quotes', t: `عرض السعر رقم ${q.no} لـ ${q.name}: ${n === 0 ? 'ينتهي اليوم' : `ينتهي بعد ${n} يوم`}` });
  });
  db.customers.filter(c => c.limit > 0 && customerDebt(c.id) > c.limit).forEach(c => out.push({ c: 'var(--red)', to: 'debts', t: `تجاوز ${c.name} حده الائتماني (${money(customerDebt(c.id))} من ${money(c.limit)})` }));
  db.customers.map(c => ({ c, d: customerDebt(c.id) })).filter(x => x.d > 0).sort((a, b) => b.d - a.d).slice(0, 6)
    .forEach(x => out.push({ c: 'var(--blue)', to: 'customers', t: `على ${x.c.name} مبلغ ${money(x.d)}` }));
  return out.filter(n => canScreen(n.to)); /* nobody is told about screens he cannot open */
}

/* ---------- The red dot on the bell means "something new you have not seen": opening the bell marks what is listed as seen (kept on this device only); a different alert makes it come back ---------- */
const SEEN_KEY = KEY + '.seenNotif';
let notifSeen = new Set();
const nKey = n => n.to + '|' + n.t;
const seenSet = () => { try { const r = localStorage.getItem(SEEN_KEY); return r ? new Set(JSON.parse(r)) : notifSeen; } catch (e) { return notifSeen; } };
const unseenCount = list => { const s = seenSet(); return list.filter(n => !s.has(nKey(n))).length; };
function markSeen(list) { const keys = list.map(nKey); notifSeen = new Set(keys); try { localStorage.setItem(SEEN_KEY, JSON.stringify(keys)); } catch (e) { /* kept in memory */ } }

/* ---------- Popover (bell) ---------- */
let popEl = null;
function closePop() { if (popEl) { popEl.remove(); popEl = null; } }
document.addEventListener('mousedown', e => { if (popEl && !popEl.contains(e.target) && !e.target.closest('[data-act="bell"]')) closePop(); });

/* ---------- Click sound: the dry little "tok" of a key on the iPhone keyboard, made from numbers with the Web Audio API (no audio files); can be muted from the home bar ----------
   About 25 ms: a sharp tap, a small wooden body near 1.25 kHz that dies in ~12 ms, a bright overtone and just a hint of weight underneath. The same on every device. */
let AC = null, lastTick = 0, tickBuf = null, tickRate = 0;
function tickWave(sr) { /* the samples of one click at sample rate sr (peak 0.5) */
  const n = Math.round(sr * .06), d = new Float32Array(n); let seed = 20261116, ph = 0, prev = 0, pk = 0;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2147483648 - 1; }; /* the same noise every time */
  for (let i = 0; i < n; i++) {
    const t = i / sr, atk = 1 - Math.exp(-t / .0002); /* 0.2 ms rise: no pop at the very start */
    const x = rnd(), tap = (x - prev) * Math.exp(-t / .0012); prev = x; /* the tap: noise with the lows taken out, gone in ~3 ms */
    ph += 2 * Math.PI * 1250 * (1 + .12 * Math.exp(-t / .008)) / sr; /* the body: 1.25 kHz, starts a little higher */
    d[i] = atk * (.9 * Math.sin(ph) * Math.exp(-t / .006) + .3 * Math.sin(2 * Math.PI * 2800 * t) * Math.exp(-t / .0035) + .12 * Math.sin(2 * Math.PI * 220 * t) * Math.exp(-t / .006)) + .55 * tap;
    pk = Math.max(pk, Math.abs(d[i]));
  }
  const fade = Math.round(sr * .006); for (let i = 0; i < fade; i++) d[n - 1 - i] *= i / fade; /* the last 6 ms fade out: no click at the end */
  for (let i = 0; i < n; i++) d[i] = d[i] / pk * .5;
  return d;
}
function playTick() {
  if (db.settings.sound === false) return;
  const now = performance.now(); if (now - lastTick < 60) return; lastTick = now; /* a label click also fires a second click on its input */
  try {
    const A = window.AudioContext || window.webkitAudioContext; if (!A) return;
    AC = AC || new A(); if (AC.state === 'suspended') AC.resume();
    if (!tickBuf || tickRate !== AC.sampleRate) { const w = tickWave(AC.sampleRate); tickBuf = AC.createBuffer(1, w.length, AC.sampleRate); tickBuf.getChannelData(0).set(w); tickRate = AC.sampleRate; }
    const s = AC.createBufferSource(), g = AC.createGain(); s.buffer = tickBuf; g.gain.value = .8;
    s.connect(g); g.connect(AC.destination); s.start(AC.currentTime);
  } catch (e) { /* no audio available: stay silent */ }
}
document.addEventListener('click', e => {
  if (!e.isTrusted) return;
  const el = e.target.closest('button, [data-act], label.btn, label.chk, .lnk'); if (!el || el.disabled || el.closest('[disabled]')) return;
  playTick();
}, true);

/* ---------- Global click delegation ---------- */
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  const act = t.dataset.act;
  if (act === 'back') back();
  else if (act === 'go') go(t.dataset.to, t.dataset.p ? JSON.parse(t.dataset.p) : {});
  else if (act === 'theme') { toggleTheme(); render(); }
  else if (act === 'bell') {
    if (popEl) return closePop();
    const list = notifications(); markSeen(list); const dot = $('.dot', t); if (dot) dot.remove();
    popEl = document.createElement('div'); popEl.className = 'pop';
    popEl.innerHTML = `<h4>آخر التنبيهات</h4>` + (list.length ? list.map(n => `<button class="it" data-act="go" data-to="${n.to}"><i style="background:${n.c}"></i><span>${esc(n.t)}</span></button>`).join('') : `<div class="none">لا توجد تنبيهات</div>`);
    (t.closest('.top') || t).append(popEl); /* hang it from the header bar (not the bell) so it stays inside the screen */
  }
  else if (act === 'sound') { db.settings.sound = db.settings.sound === false; save(); render(); lastTick = 0; playTick(); toast(db.settings.sound === false ? 'تم كتم صوت الضغط' : 'تم تشغيل صوت الضغط', 'ok'); }
  else if (act === 'logout') lockScreen();
  else if (act === 'lang') setLang(LANG === 'en' ? 'ar' : 'en');
  else if (act === 'bkNow') backupNow();
  else if (act === 'bkAllow') allowFolder().then(ok => { toast(ok ? 'تم السماح، وتم حفظ نسخة' : 'لم يُمنح الإذن'); if (cur.name === 'home') render(); });
});
