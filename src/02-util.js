/* ---------- Shared tools: audit log, closed periods, Excel export, backup ---------- */
let BACKUP_OK = true; /* the trial build turns this off */

/* ----- audit log: who did what, and when (kept inside the program data, last 5000 entries) ----- */
const AUD = {
  inv_add: 'إصدار فاتورة', inv_void: 'إلغاء فاتورة', inv_edit: 'تعديل فاتورة', ret_add: 'مرتجع مبيعات', pay_in: 'تحصيل من عميل', pay_out: 'دفعة لمورد',
  exp_add: 'تسجيل مصروف', exp_del: 'حذف مصروف', cin_add: 'داخل للدرج (درج / خزينة / رأس مال)', cin_del: 'حذف داخل للدرج', pm_add: 'سحب أو تحويل أو دعم من الإدارة', pm_del: 'حذف سحب / تحويل', pm_settle: 'تصفية الأرصدة وتسليمها للإدارة', bk_add: 'إيداع حجز', bk_ref: 'رد عربون', bk_del: 'حذف حجز',
  item_add: 'إضافة صنف', item_edit: 'تعديل بيانات صنف', item_price: 'تعديل سعر البيع', item_del: 'حذف صنف', stock_add: 'إضافة بضاعة',
  cust_add: 'إضافة عميل', cust_del: 'حذف عميل', sup_add: 'إضافة مورد', sup_del: 'حذف مورد', sup_goods: 'بضاعة من مورد (يدوي)', sup_goods_del: 'حذف بضاعة مورد', sup_goods_edit: 'تعديل بضاعة مورد', sup_edit: 'تعديل بيانات مورد', emp_add: 'إضافة موظف', emp_edit: 'تعديل بيانات موظف', emp_del: 'حذف موظف', att_save: 'تسجيل حضور وانصراف', att_import: 'استيراد حضور وانصراف من Excel', adv_add: 'سلفة لموظف', adv_del: 'حذف سلفة', sal_pay: 'صرف راتب', sal_unpay: 'إلغاء صرف راتب', hr_set: 'مواعيد العمل وإعدادات الرواتب',
  rem_save: 'حفظ منبّه', rem_del: 'حذف منبّه', set: 'تغيير إعدادات', pin: 'الرقم السري', wipe: 'مسح بيانات', restore: 'استرجاع نسخة', backup: 'نسخة احتياطية',
  vch_add: 'إصدار إيصال نقدية', vch_del: 'حذف إيصال نقدية',
  close: 'جرد وإقفال', unlock: 'فتح فترة مقفولة', export: 'تصدير',
};
function logA(act, ...parts) { /* the pieces are joined with " — " so each one can be translated on its own when shown */
  if (!Array.isArray(db.audit)) db.audit = [];
  db.audit.push({ id: uid(), t: new Date().toISOString(), a: act, x: parts.filter(Boolean).join(' — '), u: CUR_USER ? CUR_USER.name : '', ap: approvedBy() });
  if (db.audit.length > 5000) db.audit.splice(0, db.audit.length - 5000);
}

/* ----- closed periods: documents dated on or before the lock date cannot be cancelled or edited ----- */
const lockDate = () => db.settings.lockDate || '';
const isLocked = d => { const l = lockDate(); return !!l && (/^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ymd(d)) <= l; };
const taxOn = () => !!db.settings.taxOn;

/* ----- files for Excel: the .xlsx writer is in 03-xlsx.js (exportXLSX); this is the download itself ----- */
function downloadFile(name, text, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
const fileSafe = s => String(s).replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_');
const csvTr = c => typeof c === 'string' && LANG === 'en' ? trText(c) : c; /* in English every known Arabic text of the file becomes English (names typed by the user stay as typed) */
const exportBtn = (key, label = 'تصدير Excel') => `<button class="btn ghost" data-exp="${key}" type="button"><span>${label}</span></button>`;

/* ----- backup: a file to download, a reminder, and an optional folder that is written automatically ----- */
const backupObj = () => { const o = JSON.parse(JSON.stringify(db)); o.settings.adminPin = null; o.settings.loginPin = null; o.users = []; delete o.auto; o.rimgs = rcBackup(); return o; }; /* the accounts and their PINs stay on this device */
const stampNow = () => { const d = new Date(); return ymd(d) + '_' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0'); };
const hasData = () => db.invoices.length + db.expenses.length + db.payments.length + db.purchases.length + db.bookings.length + db.cashin.length + db.pmoves.length > 0;
const backupDays = () => db.settings.lastBackup ? Math.floor((Date.now() - new Date(db.settings.lastBackup).getTime()) / 864e5) : Infinity;
const backupDue = () => BACKUP_OK && hasData() && !!db.settings.backupEvery && backupDays() >= db.settings.backupEvery;
async function backupNow() {
  if (!BACKUP_OK) return;
  if (!await requireAdmin('اكتب الرقم السري للمسؤول لتحميل النسخة الاحتياطية')) return;
  downloadFile('نسخة_احتياطية_' + stampNow() + '.json', JSON.stringify(backupObj()), 'application/json');
  db.settings.lastBackup = new Date().toISOString(); logA('backup', 'تحميل ملف نسخة احتياطية'); save();
  toast('تم تحميل ملف النسخة الاحتياطية', 'ok'); if (cur.name === 'home' || cur.name === 'setBackup') render();
}
/* ids, numbers and dates are printed into the screens as they are: a backup whose such fields hold markup is refused */
const IDKEYS = /^(id|no|invId|invNo|customerId|supplierId|itemId|inv|date|at|t|a|cat|kind|status|lockDate|backupEvery)$/;
function hostile(o, depth = 0) {
  if (depth > 6 || o == null) return false;
  if (Array.isArray(o)) return o.some(x => hostile(x, depth + 1));
  if (typeof o !== 'object') return false;
  return Object.keys(o).some(k => { const v = o[k]; return (IDKEYS.test(k) && typeof v === 'string' && /[<>"'&`]/.test(v)) || hostile(v, depth + 1); });
}
/* restore from the text of a backup (pasted or read from a file) */
async function restoreFrom(text) {
  let o; try { o = JSON.parse(text); } catch (e) { return toast('النص غير صالح'); }
  if (!o || !Array.isArray(o.items) || !Array.isArray(o.invoices) || !o.settings) return toast('هذا النص ليس نسخة احتياطية للتطبيق');
  if (hostile(o)) return toast('الملف يحتوي على بيانات غير صالحة ولن يُسترجع');
  if (!await confirmBox('', 'ستُستبدل البيانات الحالية بالنسخة المختارة. هل تريد المتابعة؟', 'نعم')) return;
  if (!await requireAdmin()) return;
  const keep = db.settings, keepUsers = db.users, keepAuto = db.auto, rimgs = o.rimgs; delete o.rimgs;
  db = o; upgradeDB(db); db.users = keepUsers || []; if (keepAuto) db.auto = keepAuto; /* the n8n connection stays on this device */ linkPayments(); db.seq = db.seq || db.invoices.length;
  db.settings = Object.assign({ vat: 14, theme: '', zoom: 100, logo: '', company: '', address: '', phones: '' }, o.settings, { adminPin: keep.adminPin, loginPin: keep.loginPin, autoDir: keep.autoDir || '', lastAuto: keep.lastAuto || '', nameVer: 3 }); delete db.settings.pin;
  if (db.settings.company === APP_NAME) db.settings.company = '';
  migrateSettings(db.settings); await rcReset(rimgs); logA('restore', 'استرجاع نسخة احتياطية'); save(); applyTheme(); applyZoom(); toast('تم استرجاع البيانات', 'ok'); render();
}
/* automatic folder (Chrome / Edge on a computer): the folder handle lives in this browser's IndexedDB */
const canFolder = () => typeof window.showDirectoryPicker === 'function' && typeof indexedDB !== 'undefined';
const idbOpen = () => new Promise((res, rej) => { const r = indexedDB.open('accounts-backup', 1); r.onupgradeneeded = () => r.result.createObjectStore('h'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const idbGet = async k => { const d = await idbOpen(); return new Promise(res => { const q = d.transaction('h').objectStore('h').get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); };
const idbSet = async (k, v) => { const d = await idbOpen(); return new Promise((res, rej) => { const t = d.transaction('h', 'readwrite'); t.objectStore('h').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); };
async function folderState() {
  try { const h = await idbGet(KEY); if (!h) return { h: null, ok: false }; return { h, ok: (await h.queryPermission({ mode: 'readwrite' })) === 'granted' }; } catch (e) { return { h: null, ok: false }; }
}
async function pickBackupFolder() {
  try { const h = await window.showDirectoryPicker({ mode: 'readwrite' }); await idbSet(KEY, h); db.settings.autoDir = h.name; logA('backup', 'اختيار مجلد النسخ التلقائي'); save(); await autoBackup(true); return true; }
  catch (e) { return false; }
}
async function allowFolder() { try { const h = await idbGet(KEY); if (h && (await h.requestPermission({ mode: 'readwrite' })) === 'granted') { await autoBackup(true); return true; } } catch (e) { /* refused */ } return false; }
async function autoBackup(force) {
  if (!BACKUP_OK || !db.settings.autoDir || (!force && !bkDirty)) return false;
  const st = await folderState(); if (!st.ok) return false;
  try {
    const name = 'backup-' + ymd(new Date()) + '.json', f = await st.h.getFileHandle(name, { create: true }), w = await f.createWritable();
    await w.write(JSON.stringify(backupObj())); await w.close();
    const names = []; for await (const [n, e] of st.h.entries()) if (e.kind === 'file' && /^backup-\d{4}-\d{2}-\d{2}\.json$/.test(n)) names.push(n);
    names.sort().slice(0, Math.max(0, names.length - 14)).forEach(n => st.h.removeEntry(n).catch(() => {})); /* keep the newest 14 days */
    bkDirty = false; db.settings.lastBackup = new Date().toISOString(); db.settings.lastAuto = db.settings.lastBackup; try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* memory only */ }
    return true;
  } catch (e) { return false; }
}
setInterval(() => { if (BACKUP_OK && db.settings.autoDir) autoBackup(false); }, 5 * 60 * 1000);
setTimeout(() => { if (BACKUP_OK && db.settings.autoDir) autoBackup(true); }, 4000);

/* ----- the Export buttons (data-exp) ----- */
document.addEventListener('click', e => { const b = e.target.closest('[data-exp]'); if (b && EXPORTS[b.dataset.exp]) exportXLSX(expModel(b.dataset.exp, docArg(b))); });

/* ---------- Phone layout: a data table becomes a stack of cards on a narrow screen (CSS: table.cardt). Every plain table gets that class here and each cell its column title (data-l),
   so no screen has to be changed one by one and a phone of any size shows the whole row. Runs again whenever the page changes (a new screen, a redrawn list, a translated heading). ---------- */
function cardTables(scope) {
  (scope || document).querySelectorAll('table.grid:not(.imp-t), table.tbl:not(.items-t)').forEach(t => {
    const hr = t.querySelector('thead tr'); if (!hr) return;
    t.classList.add('cardt');
    const names = []; [...hr.children].forEach(h => { const n = (h.textContent || '').replace(/\s+/g, ' ').trim(); for (let k = 0, m = h.colSpan || 1; k < m; k++) names.push(n); });
    t.querySelectorAll('tbody > tr').forEach(r => {
      let i = 0;
      [...r.children].forEach(td => {
        const span = td.colSpan || 1;
        if (span === 1) { if (!td.hasAttribute('data-l') && names[i]) td.setAttribute('data-l', names[i]); }
        else td.classList.add('full');
        const act = !!td.querySelector('.actions') || (td.children.length > 0 && [...td.children].every(c => c.tagName === 'BUTTON'));
        if (act) td.classList.add('act', 'full');
        else if (td.querySelector('select, textarea, .sel') || (td.textContent || '').trim().length > 24) td.classList.add('full');
        else if ((td.textContent || '').trim().length > 10) td.classList.add('w2'); /* a date, a phone number, a long amount: two of the three small columns */
        td.classList.toggle('nil', !td.children.length && !(td.textContent || '').trim());
        i += span;
      });
    });
  });
}
/* A date / month box must never stick out of its frame (iPhone Safari sizes them by its own rules): measure it and pull it back inside when it does. */
function fitDates(scope) {
  (scope || document).querySelectorAll('input.inp[type=date], input.inp[type=month]').forEach(el => {
    const f = el.parentElement; if (!f || !f.clientWidth || !el.offsetWidth) return;
    if (el.dataset.fit) el.style.width = '';
    const over = Math.ceil(el.getBoundingClientRect().width - f.clientWidth);
    if (over > 1) { el.style.width = `calc(100% - ${over}px)`; el.dataset.fit = '1'; } else delete el.dataset.fit;
  });
}
(() => {
  let queued = false;
  const run = () => { queued = false; try { cardTables(document.body); fitDates(document.body); } catch (e) { /* layout only: never stop the program */ } };
  window.addEventListener('resize', () => { if (!queued) { queued = true; requestAnimationFrame(run); } });
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(run); } }).observe(document.body, { childList: true, subtree: true, characterData: true });
  queued = true; requestAnimationFrame(run);
})();

/* another tab changed the data: take the new copy so two tabs can never overwrite each other with an old one */
window.addEventListener('storage', e => {
  if (e.key !== KEY || !e.newValue) return;
  let o; try { o = JSON.parse(e.newValue); } catch (x) { return; }
  if (!o || !Array.isArray(o.invoices) || !o.settings) return;
  db = o; migrateSettings(db.settings); upgradeDB(db);
  if ($('.lock')) return; /* the lock screen stays; the screens read the new data once it is unlocked */
  const m = $('#modals'); if (m) m.innerHTML = '';
  if (cur.name === 'invForm') toast('تغيّرت البيانات من نافذة أخرى، راجع الكميات قبل إصدار الفاتورة'); else { render(); toast('تم تحديث البيانات بعد تغييرها من نافذة أخرى'); }
});
