/* ---------- Accounts and roles ----------
   Browser-level: it keeps staff out of screens and actions that are not theirs and shows who did what.
   It is not server security: a person with technical skill and this very device can get around it. */
Object.assign(AUD, { user_on: 'تفعيل المستخدمين', user_off: 'إيقاف المستخدمين', user_add: 'إضافة مستخدم', user_edit: 'تعديل مستخدم', user_del: 'حذف مستخدم', u_login: 'دخول مستخدم' });

const ROLES = {
  admin: { n: 'مدير', d: 'كل شيء: الإعدادات والمستخدمون والنسخ والمسح، ويوافق على الإجراءات الحساسة', p: ['sell', 'collect', 'spend', 'stock', 'reports', 'admin'] },
  acc: { n: 'محاسب', d: 'المبيعات والتحصيل والمصروفات والمخزن والتقارير، بدون الإعدادات', p: ['sell', 'collect', 'spend', 'stock', 'reports'] },
  cashier: { n: 'كاشير / مبيعات', d: 'الفواتير وعروض الأسعار والتوصيل والعملاء والتحصيل', p: ['sell', 'collect'] },
  store: { n: 'أمين مخزن', d: 'المخزن والجرد والتالف والتحويل ومتابعة التوصيل', p: ['stock'] },
  view: { n: 'مشاهدة فقط', d: 'يرى التقارير والقوائم ولا يحفظ أي تعديل', p: ['reports'] },
};
const usersOn = () => Array.isArray(db.users) && db.users.length > 0;
const roleOf = u => ROLES[u && u.role] || ROLES.view;

/* which screens each kind of permission opens ('*' = everyone; anything not listed is for the manager only) */
const SCR = {};
[[['*'], 'home settings setZoom setLang reminders'],
 [['stock', 'sell', 'reports'], 'inventory invView itemCard'],
 [['stock'], 'invAdd stockCount damage transfer'],
 [['stock', 'reports'], 'shopList'],
 [['sell'], 'invMenu invPick invForm invReturn bookings custEdit quoteForm'],
 [['sell', 'reports'], 'invList invDetail retList retDetail quotes quoteDetail'],
 [['sell', 'stock', 'reports'], 'deliveries delivDetail'],
 [['spend', 'reports'], 'expenses expLog cashIn suppliers supDetail supMenu supGoods supLog'],
 [['spend'], 'cashClose'],
 [['reports'], 'reports repToday repDaily repDetail repShift repVat repMonth repAging dashboard setExport'],
 [['sell', 'collect', 'reports'], 'customers custDetail bkDetail receipts'],
 [['collect', 'reports'], 'debts'],
 [['collect', 'spend', 'reports'], 'cheques vchIn vchOut vchDetail'],
].forEach(([perms, names]) => names.split(' ').forEach(n => { SCR[n] = perms; }));
function canScreen(name) {
  if (!usersOn()) return true;
  if (!CUR_USER) return name === 'home';
  const need = SCR[name] || ['admin'], mine = roleOf(CUR_USER).p;
  return need.includes('*') || need.some(x => mine.includes(x));
}
const can = perm => !usersOn() || !!(CUR_USER && roleOf(CUR_USER).p.includes(perm));

/* the safety net: every change is written to the audit log first; a signed-in user whose role does not cover a logged action gets the saved copy back */
const APERM = {};
[[['sell'], 'inv_add inv_void inv_edit ret_add bk_add bk_ref bk_del cust_edit cust_del limit_over q_add q_edit q_inv q_void q_del dl_add dl_edit dl_st dl_del'],
 [['sell', 'collect'], 'cust_add cust_xfer cust_place'],
 [['collect'], 'pay_in'],
 [['collect', 'spend'], 'vch_add vch_del chq_add chq_clear chq_bounce chq_back chq_void chq_del chq_undo'],
 [['spend'], 'pay_out exp_add exp_del cin_add cin_del pm_add pm_del pm_settle sup_del sup_edit sup_goods sup_goods_del sup_goods_edit close'],
 [['spend', 'stock'], 'sup_add'],
 [['stock'], 'item_add item_price item_min item_cost item_home item_del stock_add count dmg dmg_undo xfer wh'],
 [['admin'], 'set pin wipe restore unlock user_on user_off user_add user_edit user_del emp_add emp_edit emp_del att_save att_import adv_add adv_del sal_pay sal_unpay hr_set auto_save'],
 [['*'], 'backup export wa u_login rem_save rem_del auto_send'],
].forEach(([perms, acts]) => acts.split(' ').forEach(a => { APERM[a] = perms; }));

let auditMark = '', APPROVER = null;
const markAudit = () => { auditMark = db.audit.length ? db.audit[db.audit.length - 1].id : ''; };
function writeOk() {
  if (!CUR_USER || !usersOn()) return true;
  const r = roleOf(CUR_USER), i = db.audit.findIndex(e => e.id === auditMark), fresh = i >= 0 ? db.audit.slice(i + 1) : db.audit.slice(-10);
  const bad = fresh.find(e => { const need = APERM[e.a]; return need && !need.includes('*') && !need.some(x => r.p.includes(x)); });
  if (!bad) { markAudit(); return true; }
  let o = null; try { o = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* storage blocked */ }
  if (o && Array.isArray(o.invoices) && o.settings) { db = o; migrateSettings(db.settings); upgradeDB(db); }
  markAudit(); toast('ليس لديك صلاحية لهذا الإجراء، ولم يُحفظ شيء');
  return false;
}
/* a manager's PIN approves a sensitive action done by someone else; the audit log then names the approver */
function approveAdmin(pin) { const u = db.users.filter(x => x.role === 'admin').find(x => checkPin(pin, x.pin)); return u ? u.name : ''; }
const noteApprover = n => { APPROVER = { n, t: Date.now() }; };
const approvedBy = () => APPROVER && Date.now() - APPROVER.t < 15000 && CUR_USER && CUR_USER.role !== 'admin' ? APPROVER.n : '';
const needLogin = () => usersOn() || !!db.settings.loginPin;
const whoChip = () => usersOn() && CUR_USER ? `<span class="dt who">${esc(CUR_USER.name)} · <span>${esc(roleOf(CUR_USER).n)}</span></span>` : '';

/* ===== Settings: users and roles ===== */
const userForm = (u, others) => `<div class="field"><label for="u-name">اسم المستخدم</label><input id="u-name" class="inp" maxlength="40" value="${esc(u ? u.name : '')}" autocomplete="off"></div>
  <div class="field"><label for="u-role">الدور</label><div class="sel"><select id="u-role">${Object.entries(ROLES).map(([k, r]) => `<option value="${k}"${u && u.role === k ? ' selected' : ''}>${r.n}</option>`).join('')}</select></div></div>
  ${pinInput('u-pin', u ? 'رقم سري جديد (اتركه فارغاً بدون تغيير)' : 'الرقم السري (4 إلى 8 أرقام)')}${pinInput('u-pin2', 'تأكيد الرقم')}`;
const lastAdmin = u => u.role === 'admin' && db.users.filter(x => x.role === 'admin').length <= 1;

function userModal(u) {
  modal(`<h3>${u ? 'تعديل مستخدم' : 'إضافة مستخدم'}</h3>${userForm(u)}<div class="actions"><button class="btn" data-ok>حفظ</button><button class="btn ghost" data-no>إلغاء</button></div>`, (d, close) => {
    bindPin(d); $('[data-no]', d).onclick = close;
    $('[data-ok]', d).onclick = async () => {
      const name = $('#u-name').value.trim(), role = $('#u-role').value, pin = cleanPin($('#u-pin').value), pin2 = cleanPin($('#u-pin2').value);
      if (!name) return toast('اكتب اسم المستخدم');
      if (db.users.some(x => x.name === name && (!u || x.id !== u.id))) return toast('هذا الاسم مستخدم بالفعل');
      if (!u && pin.length < 4) return toast('الرقم السري من 4 إلى 8 أرقام');
      if (pin && (pin.length < 4 || pin !== pin2)) return toast(pin.length < 4 ? 'الرقم السري من 4 إلى 8 أرقام' : 'تأكيد الرقم غير مطابق');
      if (u && u.role === 'admin' && role !== 'admin' && lastAdmin(u)) return toast('لا بد أن يبقى مدير واحد على الأقل');
      if (!await requireAdmin()) return;
      if (u) { u.name = name; u.role = role; if (pin) u.pin = makePin(pin); if (CUR_USER && CUR_USER.id === u.id) { CUR_USER.name = name; CUR_USER.role = role; } logA('user_edit', name, ROLES[role].n); }
      else { db.users.push({ id: uid(), name, role, pin: makePin(pin), created: new Date().toISOString(), last: '' }); logA('user_add', name, ROLES[role].n); }
      save(); close(); render(); toast('تم حفظ المستخدم', 'ok');
    };
  });
}

screens.setUsers = (p, v) => {
  const on = usersOn();
  v.innerHTML = setHead() + `<div class="stack">
  <section class="panel"><h2 class="panel-t">المستخدمون والصلاحيات <span class="badge ${on ? 'on' : ''}">${on ? 'مفعّل' : 'غير مفعّل'}</span></h2>
    <p class="lbl" style="margin:0 0 14px;line-height:1.9">${on ? 'كل مستخدم يدخل باسمه ورقمه السري، ولا يرى إلا الشاشات المسموحة لدوره، ويُسجَّل اسمه في سجل التعديلات. الإجراءات الحساسة (إلغاء فاتورة، مرتجع، تجاوز الحد الائتماني…) تحتاج موافقة مدير.' : 'فعّل المستخدمين ليدخل كل موظف باسمه ورقمه السري وبصلاحيات حسب دوره (كاشير، محاسب، أمين مخزن، مشاهدة فقط). ابدأ بإنشاء حساب المدير.'}</p>
    ${on ? `<div class="tbl-wrap"><table class="grid cardt"><thead><tr><th>الاسم</th><th>الدور</th><th>آخر دخول</th><th>تعديل</th><th>حذف</th></tr></thead><tbody>${db.users.map(u => `<tr><td class="full">${esc(u.name)}${CUR_USER && CUR_USER.id === u.id ? ' <span class="pill ok">أنت</span>' : ''}</td><td data-l="الدور"><span class="pill info">${esc(roleOf(u).n)}</span></td><td class="muted" data-l="آخر دخول">${u.last ? dateTimeAr(u.last) : '—'}</td>
      <td data-l="تعديل"><button class="edit" data-ue="${u.id}" aria-label="تعديل ${esc(u.name)}">${ICON.edit}</button></td><td data-l="حذف"><button class="del" data-ud="${u.id}" aria-label="حذف ${esc(u.name)}">${ICON.trash}</button></td></tr>`).join('')}</tbody></table></div>
      <div class="actions" style="margin-top:14px"><button class="btn" id="u-add" type="button">${ICON.plus}<span>إضافة مستخدم</span></button><button class="btn danger" id="u-off" type="button">إيقاف المستخدمين</button></div>`
    : `<div class="form-grid"><div class="field"><label for="f-name">اسم المدير</label><input id="f-name" class="inp" maxlength="40" autocomplete="off"></div>${pinInput('f-pin', 'الرقم السري للمدير (4 إلى 8 أرقام)')}${pinInput('f-pin2', 'تأكيد الرقم')}</div>
      <div class="actions" style="margin-top:18px"><button class="btn" id="u-on" type="button">${ICON.save}<span>تفعيل المستخدمين</span></button></div>`}</section>
  <section class="panel"><h2 class="panel-t">ماذا يستطيع كل دور؟</h2><div class="tbl-wrap"><table class="grid cardt"><thead><tr><th>الدور</th><th>الصلاحيات</th></tr></thead><tbody>${Object.values(ROLES).map(r => `<tr><td class="full"><b>${r.n}</b></td><td class="muted" data-l="الصلاحيات">${r.d}</td></tr>`).join('')}</tbody></table></div></section>
  <p class="lbl note-s">ملاحظة: الحماية هنا على مستوى المتصفح؛ تمنع الموظف العادي من فتح شاشات أو حفظ إجراءات ليست من دوره، لكنها ليست تأميناً كاملاً. من يملك خبرة تقنية وجهاز الكمبيوتر نفسه يمكنه تجاوزها. التأمين الكامل يحتاج سيرفر.</p></div>`;
  bindPin(v);
  if (!on) {
    $('#u-on').onclick = async () => {
      const name = $('#f-name').value.trim(), pin = cleanPin($('#f-pin').value), pin2 = cleanPin($('#f-pin2').value);
      if (!name) return toast('اكتب اسم المدير');
      if (pin.length < 4) return toast('الرقم السري من 4 إلى 8 أرقام');
      if (pin !== pin2) return toast('تأكيد الرقم غير مطابق');
      if (!await requireAdmin()) return;
      const u = { id: uid(), name, role: 'admin', pin: makePin(pin), created: new Date().toISOString(), last: new Date().toISOString() };
      db.users = [u]; CUR_USER = { id: u.id, name: u.name, role: u.role }; markAudit(); adminUntil = 0;
      logA('user_on', name); save(); render(); toast('تم تفعيل المستخدمين، وأنت داخل باسم ' + name, 'ok');
    };
    return;
  }
  $('#u-add').onclick = () => userModal(null);
  $$('[data-ue]', v).forEach(b => b.onclick = () => userModal(db.users.find(x => x.id === b.dataset.ue)));
  $$('[data-ud]', v).forEach(b => b.onclick = async () => {
    const u = db.users.find(x => x.id === b.dataset.ud); if (!u) return;
    if (CUR_USER && CUR_USER.id === u.id) return toast('لا يمكنك حذف المستخدم الذي دخلت به');
    if (lastAdmin(u)) return toast('لا بد أن يبقى مدير واحد على الأقل');
    if (!await confirmBox('', `هل تريد حذف المستخدم «${u.name}»؟ تبقى عملياته السابقة في سجل التعديلات.`, 'حذف')) return;
    if (!await requireAdmin()) return;
    db.users = db.users.filter(x => x.id !== u.id); logA('user_del', u.name); save(); render(); toast('تم حذف المستخدم', 'ok');
  });
  $('#u-off').onclick = async () => {
    if (!await confirmBox('', 'سيعود البرنامج للعمل بالرقم السري للمسؤول ورقم الدخول فقط، وتُحذف حسابات المستخدمين. هل تريد المتابعة؟', 'إيقاف')) return;
    if (!await requireAdmin()) return;
    logA('user_off', 'إيقاف المستخدمين'); db.users = []; CUR_USER = null; save(); render(); toast('تم إيقاف المستخدمين', 'ok');
  };
};
