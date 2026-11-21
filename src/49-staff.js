/* ---------- Employees: one sheet per employee per month, typed by hand from the notebook ----------
   db.emps  {id, name, job, kind: 'm' monthly | 'd' daily wage, salary, in, out (his fixed times)}
   db.att   {id, empId, date 'YYYY-MM-DD', type: p present | a absent | x permission | v leave, in, out, note}
   db.adv   {id, empId, date, amount, note}  money he took in advance: taken off the salary after the days and the minutes
   db.settings.hr  the default times and the rules the salary is worked out with. Nothing here touches the cash, the expenses or the reports. */
const HR0 = { in: '08:00', out: '17:00', grace: 0, div: 30, off: 5, paidOff: true, late: true, ot: true, pre: true, excuse: true, clock: 12 }; /* clock: how times are written — 12 (ص / م) or 24 (17:10) */
const hr = () => Object.assign({}, HR0, db.settings.hr || {});
const empById = id => db.emps.find(e => e.id === id);
const ATT = { p: 'حضور', a: 'غياب', x: 'استئذان', v: 'إجازة' };
const WDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const hm = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
const durHM = m => m > 0 ? Math.floor(m / 60) + ':' + String(Math.round(m % 60)).padStart(2, '0') : '—';
const ymNow = () => ymd(new Date()).slice(0, 7);
const ymLabel = ym => new Date(ym + '-01T12:00:00').toLocaleDateString(LOC, { month: 'long', year: 'numeric' });
const ymDays = ym => new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
const ymDate = (ym, d) => ym + '-' + String(d).padStart(2, '0');
/* the month box of the employee screens: ‹ previous | month | year | next › — every month from 2000 to 2050, the past and the future (it is a list he opens, not the browser's own month box:
   a Mac Safari shows that one as plain text and an iPhone as a wheel that stops at the current month) */
const YM_MIN = 2000, YM_MAX = 2050;
const ymMon = i => new Date(2026, i, 1).toLocaleDateString(LOC, { month: 'long' });
const ymAdd = (ym, n) => { const t = +ym.slice(0, 4) * 12 + (+ym.slice(5, 7) - 1) + n; return Math.floor(t / 12) + '-' + String(t % 12 + 1).padStart(2, '0'); };
const ymPick = (id, ym) => {
  const y = +ym.slice(0, 4), m = +ym.slice(5, 7), rtl = LANG !== 'en', yr = [];
  for (let k = Math.min(YM_MIN, y); k <= Math.max(YM_MAX, y); k++) yr.push(k);
  return `<div class="ympick" id="${id}" data-v="${ym}"><button class="ym-b" type="button" dir="ltr" data-n="-1" aria-label="الشهر السابق">${rtl ? '›' : '‹'}</button><div class="sel"><select data-r="m" aria-label="الشهر">${[...Array(12)].map((_, i) => `<option value="${i + 1}"${i + 1 === m ? ' selected' : ''}>${ymMon(i)}</option>`).join('')}</select></div><div class="sel"><select data-r="y" aria-label="السنة">${yr.map(k => `<option value="${k}"${k === y ? ' selected' : ''}>${k}</option>`).join('')}</select></div><button class="ym-b" type="button" dir="ltr" data-n="1" aria-label="الشهر التالي">${rtl ? '‹' : '›'}</button></div>`;
};
const ymBind = (id, fn) => {
  const box = $('#' + id), M = $('[data-r=m]', box), Y = $('[data-r=y]', box), B = $$('.ym-b', box);
  const show = ym => { M.value = +ym.slice(5, 7); Y.value = +ym.slice(0, 4); box.dataset.v = ym; B[0].disabled = ym <= YM_MIN + '-01'; B[1].disabled = ym >= YM_MAX + '-12'; };
  const pick = ym => { if (ym === box.dataset.v) return; show(ym); fn(ym); };
  M.onchange = Y.onchange = () => pick(Y.value + '-' + String(M.value).padStart(2, '0'));
  B.forEach(b => { b.onclick = () => { const n = ymAdd(box.dataset.v, +b.dataset.n); if (n >= YM_MIN + '-01' && n <= YM_MAX + '-12') pick(n); }; });
  show(box.dataset.v);
};
const wdayOf = date => new Date(date + 'T12:00:00').getDay();
/* his fixed times: they change with the season (summer / winter), so each month of each employee keeps its own; a new month starts from the last ones chosen */
const empTimes = (e, ym) => { const H = hr(), s = e && e.sched && ym ? e.sched[ym] : null; return { in: (s && s.in) || (e && e.in) || H.in, out: (s && s.out) || (e && e.out) || H.out }; };
const t12 = t => { const m = hm(t); if (m == null) return t || ''; const h = Math.floor(m / 60) % 24; if (+hr().clock === 24) return String(h).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); return (h % 12 || 12) + ':' + String(m % 60).padStart(2, '0') + ' ' + (LANG === 'en' ? (h < 12 ? 'AM' : 'PM') : (h < 12 ? 'ص' : 'م')); }; /* 17:10 -> 5:10 م */
/* a time typed by hand -> 'HH:MM'. He types the hour the way it is written in the notebook (8:10, 810, 2, 5.30): morning or evening is worked out
   by itself — 7 to 11 is the morning, 12 and 1 to 6 the evening; only a time right at the fixed time of that box (ref, within two hours) is read the other way.
   13–23 is taken as it is, and ص / م (am / pm) written after the number wins. '' = empty, null = not a time */
function parseClock(str, ref) {
  let t = toLat(str).trim().toLowerCase(); if (!t) return '';
  const pm = /م|pm|p\.m|مساء/.test(t), am = !pm && /ص|am|a\.m|صباح/.test(t); t = t.replace(/[^0-9:.,٫\s]/g, '').trim();
  let h, m, k = /^(\d{1,2})\s*[:.,٫\s]\s*(\d{1,2})$/.exec(t);
  if (k) { h = +k[1]; m = +k[2]; } else if (/^\d{1,2}$/.test(t)) { h = +t; m = 0; } else if (/^\d{3,4}$/.test(t)) { h = +t.slice(0, -2); m = +t.slice(-2); } else return null;
  if (h > 23 || m > 59) return null;
  if (h >= 13 || h === 0 || (+hr().clock === 24 && !pm && !am)) { /* 24-hour: as written */ }
  else if (pm) h = h === 12 ? 12 : h + 12; else if (am) h = h === 12 ? 0 : h;
  else { const a = h === 12 ? 0 : h, b = h === 12 ? 12 : h + 12, r = hm(ref), d = x => { const v = Math.abs(x * 60 + m - r); return Math.min(v, 1440 - v); };
    const def = h >= 7 && h <= 11 ? a : b, alt = def === a ? b : a; /* 7–11 morning, 12 and 1–6 evening … unless the other reading sits right at his fixed time (within two hours) and this one does not */
    h = r != null && d(alt) <= 120 && d(def) > 120 ? alt : def; }
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
/* the time box of a day: hours : minutes (and ص / م on the 12-hour clock), each its own little field — faded 00 until something is typed,
   Tab moves hours → minutes → ص/م; in the ص/م field any key just flips between the two (ص or م typed picks that one) */
const PM_L = () => LANG === 'en' ? ['AM', 'PM'] : ['ص', 'م'];
function tboxHTML(id, i, k, val, dis) {
  const c24 = +hr().clock === 24, m = hm(val), h = m == null ? '' : Math.floor(m / 60), d = x => String(x).padStart(2, '0');
  const hv = m == null ? '' : d(c24 ? h : (h % 12 || 12)), mv = m == null ? '' : d(m % 60), pv = m == null ? '' : PM_L()[h < 12 ? 0 : 1], D = dis ? ' disabled' : '';
  return `<div class="inp tbox${dis ? ' off' : ''}" id="${id}" dir="ltr" data-i="${i}" data-k="${k}"><input class="tseg" id="${id}-h" data-i="${i}" data-k="${k}" data-s="h" inputmode="numeric" maxlength="2" placeholder="00" autocomplete="off" aria-label="${k === 'in' ? 'ساعة الحضور' : 'ساعة الانصراف'}" value="${hv}"${D}><span class="tcol">:</span><input class="tseg" id="${id}-m" data-i="${i}" data-k="${k}" data-s="m" inputmode="numeric" maxlength="2" placeholder="00" autocomplete="off" aria-label="الدقائق" value="${mv}"${D}>${c24 ? '' : `<input class="tseg tp" id="${id}-p" data-i="${i}" data-k="${k}" data-s="p" maxlength="2" placeholder="${PM_L()[k === 'in' ? 0 : 1]}" autocomplete="off" aria-label="صباحاً أو مساءً" value="${pv}" data-v="${pv}"${D}>`}</div>`;
}
const hrRange = t => `من ${t12(t.in)} إلى ${t12(t.out)}`;
/* a list to pick a time from (every quarter of an hour; a time typed before that is not on the list stays in it) */
const timeOpts = val => { const L = []; for (let m = 0; m < 1440; m += 15) L.push(String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')); if (val && !L.includes(val)) { L.push(val); L.sort(); } return L.map(x => `<option value="${x}"${x === val ? ' selected' : ''}>${t12(x)}</option>`).join(''); };
const timeSel = (id, val) => `<div class="sel"><select id="${id}">${timeOpts(val)}</select></div>`;
/* the minutes of a working day (a shift that ends after midnight is counted through the night) */
function schedOf(e) { const t = empTimes(e), a = hm(t.in) ?? 480; let b = hm(t.out) ?? 1020; if (b <= a) b += 1440; return { a, b, len: b - a }; }
/* one line against his fixed times: minutes late (came after the time), minutes left early, minutes of overtime (stayed after the time) */
function attCalc(e, r) {
  if (!r || (r.type !== 'p' && r.type !== 'x')) return { late: 0, early: 0, ot: 0, pre: 0 };
  const S = schedOf(e), H = hr(), i = hm(r.in); let o = hm(r.out);
  if (o != null && o < (i ?? S.a)) o += 1440;
  const lateRaw = i == null ? 0 : Math.max(0, i - S.a);
  return { late: lateRaw > (+H.grace || 0) ? lateRaw : 0, early: o == null ? 0 : Math.max(0, S.b - o), ot: o == null ? 0 : Math.max(0, o - S.b), pre: i == null ? 0 : Math.max(0, S.a - i) }; /* pre: came before his fixed time */
}
/* the days of a month he was employed: from the start date (if it falls in this month) to the last working day (settlement) */
function empSpan(e, ym) {
  const n = ymDays(ym), dn = s => s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
  const st = dn(e.start), en = dn(e.end);
  const a = st && st.slice(0, 7) === ym ? +st.slice(8, 10) : st && st.slice(0, 7) > ym ? n + 1 : 1;
  const z = en && en.slice(0, 7) === ym ? +en.slice(8, 10) : en && en.slice(0, 7) < ym ? 0 : n;
  return { a, z, n, partial: a > 1 || z < n, none: a > z };
}
/* a month of one employee: the days, the minutes, what is taken off, what is added, his advances, and what he gets.
   recs / advs: lines still on the screen (not saved yet) can be given instead of the saved ones */
function empMonth(e, ym, recs, advs) {
  if (e.sched !== null) e = Object.assign({}, e, empTimes(e, ym), { sched: null }); /* the times of THIS month (sched: null = already the ones to use) */
  const H = hr(), S = schedOf(e), sp = empSpan(e, ym), inSp = dt => +dt.slice(8, 10) >= sp.a && +dt.slice(8, 10) <= sp.z;
  recs = (recs || db.att.filter(r => r.empId === e.id && r.date.slice(0, 7) === ym)).filter(r => inSp(r.date)).sort((a, b) => a.date.localeCompare(b.date)); /* days outside his employment (before the start, after the last day) are not counted */
  advs = advs || db.adv.filter(a => a.empId === e.id && a.date.slice(0, 7) === ym);
  let work = 0; for (let d = 1, n = ymDays(ym); d <= n; d++) if (wdayOf(ymDate(ym, d)) !== +H.off) work++;
  const daily = e.kind === 'd', dayRate = daily ? +e.salary || 0 : (+e.salary || 0) / (+H.div > 0 ? +H.div : Math.max(work, 1)), minRate = dayRate / Math.max(S.len, 1);
  const c = { p: 0, a: 0, x: 0, v: 0 }; let late = 0, early = 0, ot = 0, pre = 0, xDays = 0, paidDays = 0;
  recs.forEach(r => {
    c[r.type] = (c[r.type] || 0) + 1;
    const timed = !!(r.in || r.out), k = attCalc(e, r);
    if (r.type === 'p') { late += k.late; early += k.early; ot += k.ot; pre += k.pre; paidDays++; }
    else if (r.type === 'x') {
      if (timed) { paidDays++; ot += k.ot; pre += k.pre; if (!H.excuse) { late += k.late; early += k.early; } } /* came with a permission: the minutes are forgiven unless the rule says otherwise */
      else if (H.excuse) paidDays++; else xDays++; /* a whole day with a permission */
    }
  });
  /* the weekly day off is paid: a monthly salary already covers it; a daily wage gets it for every week he worked in (days that have come, with nothing written on them) */
  let offPaid = 0; if (daily && H.paidOff && +H.off >= 0 && paidDays > 0) { const has = new Set(recs.map(r => r.date)), lim = ymd(new Date()); for (let d = sp.a, n = Math.min(sp.z, ymDays(ym)); d <= n; d++) { const dt = ymDate(ym, d); if (dt <= lim && wdayOf(dt) === +H.off && !has.has(dt)) offPaid++; } }
  paidDays += offPaid;
  let spanCal = 0, spanWork = 0; for (let d = sp.a; d <= sp.z; d++) { spanCal++; if (wdayOf(ymDate(ym, d)) !== +H.off) spanWork++; }
  /* a monthly salary is for the days he was there: a whole month = the salary; leaving (or joining) mid-month = the daily rate × his days (calendar days on ÷30, working days on the other rules) */
  const spanDays = +H.div === 30 ? spanCal : spanWork, gross = round2(daily ? paidDays * dayRate : sp.none ? 0 : sp.partial ? Math.min(+e.salary || 0, dayRate * spanDays) : +e.salary || 0);
  const dedAbs = round2(daily ? 0 : (c.a + xDays) * dayRate), dedLate = round2(H.late ? (late + early) * minRate : 0), dedL = round2(H.late ? late * minRate : 0), dedE = round2(dedLate - dedL), otPay = round2(H.ot ? ot * minRate : 0), prePay = round2(H.pre ? pre * minRate : 0), adv = round2(advs.reduce((s, a) => s + (+a.amount || 0), 0));
  const due = round2(gross - dedAbs - dedLate + otPay + prePay); /* after the days, the hours and the minutes */
  return { recs, advs, c, offPaid, paidDays, times: { in: e.in, out: e.out }, late, early, ot, pre, sp, spanDays, gross, dedAbs, dedLate, dedL, dedE, minRate, absDays: c.a + xDays, otPay, prePay, addPay: round2(otPay + prePay), ded: round2(dedAbs + dedLate), due, adv, net: round2(due - adv), dayRate: round2(dayRate), daily };
}
const empPayLabel = e => e.kind === 'd' ? 'يومية' : 'شهري';
/* the employee's net, never with a minus sign: more than zero = he is owed it (له, green); below zero = his advances were more than he earned, so HE owes the difference (عليه, red) */
const netOwes = n => round2(n) < 0, netTxt = n => netOwes(n) ? 'عليه ' + money(-n) : money(n), netCell = n => netOwes(n) ? `<span class="owe-t">عليه ${fmt(-n)}</span>` : fmt(n);

screens.empMenu = (p, v) => {
  const ym = ymNow(), L = db.emps.map(e => empMonth(e, ym)), net = round2(L.reduce((s, m) => s + m.net, 0)), adv = round2(L.reduce((s, m) => s + m.adv, 0));
  v.innerHTML = subHead('الموظفين') + `<div class="stats" style="margin-bottom:16px"><div class="stat"><span>عدد الموظفين</span><b>${db.emps.length}</b></div><div class="stat"><span>سلف ${ymLabel(ym)}</span><b>${money(adv)}</b></div><div class="stat"><span>صافي رواتب ${ymLabel(ym)} حتى الآن</span><b>${netTxt(net)}</b></div></div>
  <div class="menu">
    <button class="opt" style="--ac:var(--orange)" data-act="go" data-to="emps">${ICON.staff}<span>الموظفين وكشوف الحضور والانصراف</span></button>
    <button class="opt" style="--ac:var(--teal)" data-act="go" data-to="empPay">${ICON.docs}<span>كشف الرواتب</span></button>
    <button class="opt" style="--ac:var(--blue)" data-act="go" data-to="empSet">${ICON.settings}<span>المواعيد الافتراضية وقواعد الحساب</span></button>
  </div>`;
};

function empModal(ed, done) {
  const H = hr(), t = ed ? empTimes(ed, ymNow()) : H;
  modal(`<h3>${ed ? 'تعديل بيانات الموظف' : 'إضافة موظف'}</h3>
    <div class="field"><label for="e-name">اسم الموظف</label><input id="e-name" class="inp" autocomplete="off" value="${ed ? esc(ed.name) : ''}"></div>
    <div class="field"><label for="e-job">الوظيفة (اختياري)</label><input id="e-job" class="inp" autocomplete="off" value="${ed ? esc(ed.job || '') : ''}"></div>
    <div class="field"><label for="e-kind">نوع الراتب</label><div class="sel"><select id="e-kind"><option value="m">شهري (مرتب ثابت في الشهر)</option><option value="d"${ed && ed.kind === 'd' ? ' selected' : ''}>يومية (أجر عن كل يوم حضور)</option></select></div></div>
    <div class="field"><label for="e-sal" id="e-sal-l">الراتب الأساسي (جنيه)</label><input id="e-sal" class="inp" inputmode="decimal" autocomplete="off" value="${ed ? ed.salary || '' : ''}"></div>
    <div class="field"><label for="e-in">ميعاد الحضور الثابت</label>${timeSel('e-in', t.in)}</div>
    <div class="field"><label for="e-out">ميعاد الانصراف الثابت</label>${timeSel('e-out', t.out)}</div>
    <div class="actions"><button class="btn" data-ok>حفظ</button><button class="btn ghost" data-no>إلغاء</button></div>`, (d, close) => {
    const lab = () => { $('#e-sal-l').textContent = $('#e-kind').value === 'd' ? 'أجر اليوم (جنيه)' : 'الراتب الأساسي (جنيه)'; };
    $('#e-kind').onchange = lab; lab();
    $('#e-sal').addEventListener('input', e => { e.target.value = cleanNum(e.target.value); });
    $('[data-no]', d).onclick = close;
    $('[data-ok]', d).onclick = () => {
      const name = $('#e-name').value.trim(); if (!name) return toast('اكتب اسم الموظف');
      if (db.emps.some(x => x !== ed && x.name === name)) return toast('هذا الموظف مسجّل بالفعل');
      const salary = round2(num($('#e-sal').value)); if (salary <= 0) return toast('اكتب الراتب بقيمة أكبر من صفر');
      const a = $('#e-in').value || H.in, b = $('#e-out').value || H.out; if (a === b) return toast('ميعاد الحضور والانصراف متساويان');
      const o = { name, job: $('#e-job').value.trim(), kind: $('#e-kind').value === 'd' ? 'd' : 'm', salary, in: a, out: b };
      let e = ed; if (ed) { Object.assign(ed, o); if (ed.sched) ed.sched[ymNow()] = { in: a, out: b }; logA('emp_edit', name, money(salary)); } else { e = Object.assign({ id: uid() }, o); db.emps.push(e); logA('emp_add', name, money(salary)); }
      save(); close(); toast(ed ? 'تم حفظ بيانات الموظف' : 'تمت إضافة الموظف', 'ok'); if (done) done(e);
    };
  });
}

screens.emps = (p, v) => {
  const ym = ymNow();
  v.innerHTML = subHead('الموظفين') + `<section class="panel">
    <div class="toolbar"><input id="q" class="inp" placeholder="ابحث باسم الموظف" aria-label="بحث" autocomplete="off"><button class="btn" id="e-add" type="button">${ICON.plus}<span>إضافة موظف</span></button><label class="btn outline" for="e-impf">${ICON.docs}<span>استيراد حضور من Excel</span></label><input id="e-impf" type="file" accept=".xlsx,.xlsm,.xls,.csv,.tsv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" class="sr"></div>
    ${db.emps.length ? docBar('emps', '', true) : ''}
    <div class="tbl-wrap"><table class="grid cardt"><colgroup><col style="width:24%"><col style="width:16%"><col style="width:20%"><col style="width:16%"><col style="width:24%"></colgroup>
    <thead><tr><th>الموظف</th><th>الراتب الأساسي</th><th>مواعيده الثابتة</th><th>صافي ${ymLabel(ym)}</th><th>إجراء</th></tr></thead><tbody id="rows"></tbody></table></div></section>`;
  const draw = () => {
    const q = $('#q').value.trim();
    $('#rows').innerHTML = db.emps.filter(e => !q || e.name.includes(q)).map(e => `<tr><td class="full" data-l="الموظف"><button class="lnk" data-sh="${e.id}">${esc(e.name)}</button>${e.job ? `<br><small class="muted">${esc(e.job)}</small>` : ''}${e.end ? `<br><small class="muted">آخر يوم عمل: <bdi dir="ltr">${esc(e.end)}</bdi></small>` : ''}</td>
      <td class="val" data-l="الراتب الأساسي">${fmt(e.salary)} <small class="muted">${empPayLabel(e)}</small></td><td data-l="مواعيده الثابتة">${hrRange(empTimes(e, ym))}</td><td class="val" data-l="الصافي">${netCell(empMonth(e, ym).net)}</td>
      <td class="full" data-l="إجراء"><div class="actions" style="justify-content:center;gap:6px"><button class="mini" data-sh="${e.id}">كشف الحضور</button><button class="edit" data-ed="${e.id}" aria-label="تعديل بيانات ${esc(e.name)}">${ICON.edit}</button><button class="del" data-rm="${e.id}" aria-label="حذف ${esc(e.name)}">${ICON.trash}</button></div></td></tr>`).join('')
      || `<tr><td colspan="5" class="empty">${db.emps.length ? 'لا توجد نتائج' : 'لا يوجد موظفين. أضف أول موظف باسمه وراتبه ومواعيده.'}</td></tr>`;
    $$('[data-sh]', v).forEach(b => b.onclick = () => go('empSheet', { id: b.dataset.sh, ym }));
    $$('[data-ed]', v).forEach(b => b.onclick = () => { const e = empById(b.dataset.ed); if (e) empModal(e, draw); });
    $$('[data-rm]', v).forEach(b => b.onclick = async () => {
      const e = empById(b.dataset.rm); if (!e) return; const n = db.att.filter(r => r.empId === e.id).length;
      if (await confirmBox('حذف الموظف', `سيُحذف «${e.name}»${n ? ` ومعه ${n} يوم مسجّل من الحضور والانصراف` : ''} وسلفه. لا يمكن التراجع.`)) {
        db.emps = db.emps.filter(x => x.id !== e.id); db.att = db.att.filter(r => r.empId !== e.id); db.adv = db.adv.filter(a => a.empId !== e.id); logA('emp_del', e.name); save(); draw(); toast('تم حذف الموظف', 'ok');
      }
    });
  };
  const fi = $('#e-impf'); if (fi) fi.onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) impStart(f); };
  $('#q').addEventListener('input', draw); $('#e-add').onclick = () => empModal(null, e => go('empSheet', { id: e.id, ym }));
  draw();
};

/* ---- the printed sheet: the whole month on one page (every day with its times), the salary on top, the result at the bottom ---- */
function empPaper(e, ym, recs, advs) {
  const m = empMonth(e, ym, recs, advs), H = hr(), t = m.times, by = {}; e = Object.assign({}, e, t, { sched: null }); m.recs.forEach(r => { by[r.date] = r; });
  const ln = (a, b, k = '') => `<div class="l${k ? ' ' + k : ''}"><span>${a}</span><b>${b}</b></div>`, T = x => `<bdi dir="ltr">${x}</bdi>`;
  let rows = '';
  const sg = (x, any) => x ? `<span class="${x > 0 ? 'pl' : 'mn'}">\u200E${x > 0 ? '+' : '−'}${fmt(Math.abs(x))}</span>` : any ? '0' : '—', eff = k => round2(((H.ot ? k.ot : 0) + (H.pre ? k.pre : 0)) * m.minRate - (H.late ? k.late + k.early : 0) * m.minRate); /* what the day adds (+) or takes off (−) */
  for (let d = 1, n = ymDays(ym); d <= n; d++) {
    const date = ymDate(ym, d), r = by[date], wd = wdayOf(date), k0 = attCalc(e, r), k = r && r.type === 'x' && H.excuse ? { late: 0, early: 0, ot: k0.ot, pre: k0.pre } : k0, /* a permission: the minutes are not counted */ day = `<td class="bn">${WDAYS[wd]}</td><td class="dt">${T(d + '/' + +ym.slice(5, 7))}</td>`, mm = x => x ? T(durHM(x)) : '—';
    if (d < m.sp.a || d > m.sp.z) rows += `<tr class="nil">${day}<td>خارج مدة العمل</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td class="bn"></td></tr>`;
    else if (!r) rows += `<tr class="${wd === +H.off ? 'off' : 'nil'}">${day}<td>${wd === +H.off ? 'إجازة أسبوعية' : '—'}</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td class="bn">${wd === +H.off && H.paidOff ? 'مدفوعة الأجر' : ''}</td></tr>`;
    else if (r.type === 'a' || r.type === 'v') rows += `<tr class="${r.type === 'a' ? 'abs' : 'off'}">${day}<td><b>${ATT[r.type]}</b></td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>${r.type === 'a' && !m.daily ? sg(-m.dayRate) : '—'}</td><td class="bn">${esc(r.note || '')}</td></tr>`;
    else rows += `<tr${r.type === 'x' ? ' class="exc"' : ''}>${day}<td>${r.in ? t12(r.in) : '—'}</td><td>${r.out ? t12(r.out) : '—'}</td><td>${mm(k.late)}</td><td>${mm(k.pre)}</td><td>${mm(k.early)}</td><td>${mm(k.ot)}</td><td>${sg(eff(k), k.late || k.early || k.ot || k.pre)}</td><td class="bn">${r.type === 'x' ? 'تم الاستئذان' + (r.note ? ' — ' : '') : ''}${esc(r.note || '')}</td></tr>`;
  }
  return paper(letterhead(letterOf()) + `<div class="rt"><h3>كشف حضور وانصراف وراتب</h3></div>` +
    `<div class="ibox hrh"><span class="w">اسم الموظف: <b>${esc(e.name)}</b>${e.job ? ` <small>(${esc(e.job)})</small>` : ''}</span><span class="w">${m.daily ? 'أجر اليوم' : 'الراتب الأساسي'}: <b>${money(e.salary)}</b></span><span>مواعيد العمل الثابتة: <b>${hrRange(t)}</b></span><span>الشهر: <b>${ymLabel(ym)}</b></span>${m.sp.partial && !m.sp.none ? `<span>مدة العمل: <b>من ${m.sp.a}/${+ym.slice(5, 7)} إلى ${m.sp.z}/${+ym.slice(5, 7)}</b></span>` : ''}</div>` +
    `<table class="itbl st hrd"><colgroup><col style="width:8%"><col style="width:7%"><col style="width:9%"><col style="width:9%"><col style="width:8%"><col style="width:9%"><col style="width:9%"><col style="width:8%"><col style="width:10%"><col style="width:23%"></colgroup><thead><tr><th>يوم</th><th>التاريخ</th><th>الحضور</th><th>الانصراف</th><th>تأخير</th><th>حضور مبكر</th><th>انصراف مبكر</th><th>إضافي</th><th>الأثر (جنيه)</th><th>ملاحظة</th></tr></thead><tbody>${rows}</tbody></table>` +
    `<div class="isum"><div class="ic">${ln('أيام الحضور:', fmt(m.c.p))}${ln('أيام الغياب:', fmt(m.c.a))}${ln('أيام الاستئذان:', fmt(m.c.x))}${ln('إجمالي التأخير:', T(durHM(m.late)))}${ln('إجمالي الحضور المبكر:', T(durHM(m.pre)))}${ln('إجمالي الانصراف المبكر:', T(durHM(m.early)))}${ln('إجمالي الإضافي:', T(durHM(m.ot)))}</div>` +
    `<div class="ic">${ln(m.daily ? `المستحق عن ${m.paidDays} يوم${m.offPaid ? ` (منها ${m.offPaid} إجازة أسبوعية)` : ''}:` : m.sp.partial ? `المستحق عن مدة العمل (${m.spanDays} يوم):` : 'الراتب الأساسي:', money(m.gross))}${m.daily ? '' : ln(`خصم الغياب (${m.absDays} يوم):`, '− ' + money(m.dedAbs))}${ln(`خصم التأخير (${durHM(m.late)}):`, H.late ? '− ' + money(m.dedL) : 'غير مفعّل')}${ln(`خصم الانصراف المبكر (${durHM(m.early)}):`, H.late ? '− ' + money(m.dedE) : 'غير مفعّل')}${ln(`قيمة الحضور المبكر (${durHM(m.pre)}):`, H.pre ? '+ ' + money(m.prePay) : 'غير مفعّل')}${ln(`قيمة الإضافي (${durHM(m.ot)}):`, H.ot ? '+ ' + money(m.otPay) : 'غير مفعّل')}${ln('السلف:', '− ' + money(m.adv))}${netOwes(m.net) ? ln('المتبقي على الموظف (عليه):', money(-m.net), 'big mn') : ln(m.net > 0 ? 'صافي الراتب (له):' : 'صافي الراتب:', money(m.net), 'big' + (m.net > 0 ? ' pl' : ''))}</div></div>`, 'inv hrp');
}
function payPaper(ym) {
  const L = db.emps.map(e => ({ e, m: empMonth(e, ym) })), T = k => round2(L.reduce((s, x) => s + x.m[k], 0));
  const ln = (a, b, k = '') => `<div class="l${k ? ' ' + k : ''}"><span>${a}</span><b>${b}</b></div>`;
  const rows = L.map(({ e, m }) => `<tr><td class="bn">${esc(e.name)}</td><td>${fmt(e.salary)}${m.daily ? ' <small>يومية</small>' : ''}</td><td>${m.c.p}</td><td>${m.c.a}</td><td><bdi dir="ltr">${durHM(m.late + m.early)}</bdi></td><td>${fmt(m.ded)}</td><td>${fmt(m.addPay)}</td><td>${fmt(m.adv)}</td><td class="bl">${netCell(m.net)}</td></tr>`).join('') || '<tr><td colspan="9">لا يوجد موظفين.</td></tr>';
  return paper(letterhead(letterOf()) + `<div class="rt"><h3>كشف الرواتب</h3></div>` +
    `<div class="ibox"><span>الشهر: <b>${ymLabel(ym)}</b></span><span>عدد الموظفين: <b>${L.length}</b></span><span>التاريخ: <b><bdi dir="ltr">${ymd(new Date())}</bdi></b></span></div>` +
    `<table class="itbl st hrt"><thead><tr><th>الموظف</th><th>الراتب</th><th>حضور</th><th>غياب</th><th>تأخير</th><th>الخصم</th><th>إضافي</th><th>سلف</th><th>الصافي</th></tr></thead><tbody>${rows}</tbody></table>` +
    `<div class="isum"><div class="ic">${ln('إجمالي المستحق قبل الخصم:', money(T('gross')))}${ln('إجمالي الخصومات:', money(T('ded')))}${ln('إجمالي الإضافي:', money(T('addPay')))}</div><div class="ic">${ln('إجمالي السلف:', money(T('adv')))}${L.some(x => netOwes(x.m.net)) ? ln('صافي الرواتب (له):', money(round2(L.reduce((s, x) => s + Math.max(x.m.net, 0), 0))), 'big pl') + ln('المتبقي على الموظفين (عليه):', money(round2(L.reduce((s, x) => s + Math.max(-x.m.net, 0), 0))), 'big mn') : ln('صافي الرواتب:', money(T('net')), 'big')}</div></div>`, 'inv');
}
const hrFile = (base, x) => (base + '_' + x).replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_');

/* ---- the employee's page: his salary and fixed times on top, then the whole month day by day, his advances, and the result ---- */
screens.empSheet = (p, v) => {
  const e = empById(p.id); if (!e) return back();
  const today = ymd(new Date()), canPrint = !window.claude; let ym = p.ym || ymNow(), rows = [], t0 = empTimes(e, ym), openI = -1; /* openI: the one day open for editing on a phone */
  v.innerHTML = subHead('كشف حضور وانصراف وراتب') + `<div class="stack">
  <section class="panel noprint"><h2 class="panel-t big">${ICON.staff}<span>${esc(e.name)}</span>${e.job ? `<small class="muted" style="font-weight:600"> — ${esc(e.job)}</small>` : ''}</h2>
    <div class="form-grid">
      <div class="field"><label for="s-sal">${e.kind === 'd' ? 'أجر اليوم (جنيه)' : 'الراتب الأساسي (جنيه)'}</label><input id="s-sal" class="inp" inputmode="decimal" autocomplete="off" value="${e.salary || ''}"></div>
      <div class="field"><label>الشهر</label>${ymPick('s-ym', ym)}</div>
      <div class="field"><label for="s-in">ميعاد الحضور الثابت (لهذا الشهر)</label>${timeSel('s-in', t0.in)}</div>
      <div class="field"><label for="s-out">ميعاد الانصراف الثابت (لهذا الشهر)</label>${timeSel('s-out', t0.out)}</div>
      <div class="field"><label for="s-end">آخر يوم عمل — لتصفية الموظف (يُحسب راتبه حتى هذا اليوم)</label><input id="s-end" class="inp" type="date" value="${esc(e.end || '')}"></div>
      <div class="field"><label for="s-start">تاريخ بدء العمل — لمن بدأ في منتصف الشهر (اختياري)</label><input id="s-start" class="inp" type="date" value="${esc(e.start || '')}"></div>
      <div class="field"><label for="s-clock">نظام كتابة الوقت</label><div class="sel"><select id="s-clock"><option value="12">12 ساعة (5:10 م)</option><option value="24"${+hr().clock === 24 ? ' selected' : ''}>24 ساعة (17:10)</option></select></div></div>
    </div>
    <div class="note noprint" id="s-span" hidden style="margin-top:12px"></div>
    <div class="actions" style="margin-top:14px"><button class="mini" id="s-fill" type="button">تعبئة الأيام الفارغة حضور بالمواعيد</button></div></section>
  <section class="panel noprint"><div class="tbl-wrap"><table class="grid sh-t"><colgroup><col style="width:17%"><col style="width:15%"><col style="width:15%"><col style="width:15%"><col style="width:16%"><col style="width:22%"></colgroup>
    <thead><tr><th>يوم</th><th>الحالة</th><th>الحضور</th><th>الانصراف</th><th>تأخير / إضافي</th><th>ملاحظة</th></tr></thead><tbody id="s-rows"></tbody></table></div></section>
  <div class="two noprint">
    <section class="panel"><h2 class="panel-t big">${ICON.coins}<span>السلف</span></h2><div id="s-advs"></div><div class="actions" style="margin-top:12px;justify-content:flex-start"><button class="btn" id="s-adv" type="button">+ إضافة سلفة</button></div></section>
    <section class="panel"><h2 class="panel-t big blue">${ICON.docDollar}<span>حساب الراتب</span></h2><div id="s-sum"></div><div id="s-pay" style="margin-top:12px"></div></section>
  </div>
  ${fsBar('حجم خط الطباعة وملف PDF')}
  <div class="submit noprint"><button class="btn lg" id="s-save" type="button">${ICON.save}<span>حفظ الكشف</span></button>
    <button class="btn ghost" id="s-pdf" type="button">${ICON.pdf}<span>تصدير PDF</span></button>${canPrint ? `<button class="btn ghost" id="s-print" type="button">${ICON.printer}<span>طباعة</span></button>` : ''}</div>
  <div id="paper" class="ponly"></div></div>`;
  const cur = () => Object.assign({}, e, { salary: round2(num($('#s-sal').value)), in: $('#s-in').value || t0.in, out: $('#s-out').value || t0.out, start: $('#s-start').value || '', end: $('#s-end').value || '', sched: null }); /* what is typed on top right now */
  const recsNow = () => rows.filter(r => r.type).map(r => ({ empId: e.id, date: r.date, type: r.type, in: r.type === 'p' || r.type === 'x' ? r.in : '', out: r.type === 'p' || r.type === 'x' ? r.out : '', note: r.note.trim() }));
  const advsNow = () => db.adv.filter(a => a.empId === e.id && a.date.slice(0, 7) === ym);
  const diff = r => { if (r.type !== 'p' && r.type !== 'x') return r.type === 'a' ? 'خصم يوم' : '—'; const k = attCalc(cur(), r), o = []; if (r.type === 'x' && hr().excuse) return 'استئذان بدون خصم' + (k.pre ? ' • حضور مبكر ' + durHM(k.pre) : '') + (k.ot ? ' • إضافي ' + durHM(k.ot) : ''); if (k.pre) o.push('حضور مبكر ' + durHM(k.pre)); if (k.late) o.push('تأخير ' + durHM(k.late)); if (k.early) o.push('انصراف مبكر ' + durHM(k.early)); if (k.ot) o.push('إضافي ' + durHM(k.ot)); return o.map(x => trText(x)).join(' • ') || (r.in || r.out ? 'في الميعاد' : '—'); };
  /* a phone shows each day as one small line (status, times, minutes late / extra); a tap on it opens that day's fields */
  const stHTML = r => r.type ? `<span class="dst ${r.type}">${ATT[r.type]}</span>` : '<span class="dst nil">—</span>';
  const lnHTML = r => { if (r.type !== 'p' && r.type !== 'x') return r.type === 'a' ? diff(r) : ''; const d = diff(r), T = x => x ? `<bdi dir="ltr">${t12(x)}</bdi>` : '—', tm = r.in || r.out ? `${T(r.in)} – ${T(r.out)}` : ''; /* each time on its own, so ص / م stays beside its hour */ return [tm, d && d !== '—' ? d : ''].filter(Boolean).join(' • '); };
  const upS = i => { const r = rows[i], a = $('#sh' + i + '-st'), b = $('#sh' + i + '-s'); if (!r) return; if (a) a.innerHTML = stHTML(r); if (b) b.innerHTML = lnHTML(r); };
  const sum = () => {
    const c = cur(), m = empMonth(c, ym, recsNow(), advsNow()), H = hr(), row = (a, b, k = '') => `<div class="sum-row${k}"><span>${a}</span><b>${b}</b></div>`;
    const mo = +ym.slice(5, 7);
    $('#s-sum').innerHTML = (m.sp.partial && !m.daily ? row('الراتب الأساسي الشهري:', money(c.salary)) + row(m.sp.none ? 'خارج مدة العمل في هذا الشهر' : `المستحق عن مدة العمل (${m.spanDays} يوم من ${m.sp.a}/${mo} إلى ${m.sp.z}/${mo}):`, m.sp.none ? '' : money(m.gross)) : row(m.daily ? 'المستحق عن أيام الحضور:' : 'الراتب الأساسي:', money(m.gross))) + row(`الأيام: حضور ${m.c.p} • غياب ${m.c.a} • استئذان ${m.c.x}`, '') +
      (m.daily && m.offPaid ? row(`إجازة أسبوعية مدفوعة: ${m.offPaid} يوم`, '') : '') + (m.daily ? '' : row('خصم الغياب:', money(m.dedAbs))) + row(`خصم التأخير (${durHM(m.late)}):`, H.late ? money(m.dedL) : 'غير مفعّل') + row(`خصم الانصراف المبكر (${durHM(m.early)}):`, H.late ? money(m.dedE) : 'غير مفعّل') + row(`قيمة الحضور المبكر (${durHM(m.pre)}):`, H.pre ? money(m.prePay) : 'غير مفعّل') + row(`قيمة الإضافي (${durHM(m.ot)}):`, H.ot ? money(m.otPay) : 'غير مفعّل') +
      row('السلف:', money(m.adv)) + (netOwes(m.net) ? `<div class="rem" id="s-net"><span>${ICON.history}<i>على الموظف (عليه)</i></span><b>${money(-m.net)}</b></div>` : `<div class="rem clear" id="s-net"><span>${ICON.history}<i>${m.net > 0 ? 'صافي الراتب (له)' : 'صافي الراتب'}</i></span><b>${money(m.net)}</b></div>`);
    /* paying the salary writes it in the expenses (the advances are already there, so only the net goes out now) */
    const pd = e.paid && e.paid[ym];
    $('#s-pay').innerHTML = pd ? `<div class="note" style="display:block"><b>تم صرف الراتب: ${money(pd.amount)}</b> — <bdi dir="ltr">${ymd(pd.date)}</bdi> — مسجَّل في المصروفات.${Math.abs(pd.amount - m.net) > 0.004 ? `<br>الصافي الحالي ${money(m.net)} يختلف عن المصروف. ألغِ الصرف ثم اصرف من جديد لتصحيحه.` : ''}</div><div class="actions" style="margin-top:10px;justify-content:flex-start"><button class="btn ghost" id="s-unpay" type="button">إلغاء الصرف</button></div>`
      : m.net <= 0 ? '' : `<div class="actions" style="justify-content:flex-start"><button class="btn" id="s-dopay" type="button">${ICON.coins}<span>صرف الراتب وتسجيله في المصروفات</span></button></div>`;
    const dp = $('#s-dopay'), up = $('#s-unpay');
    if (dp) dp.onclick = async () => {
      if (!commit(true)) return; const net = empMonth(e, ym).net; if (net <= 0) return toast('لا يوجد صافي مستحق للصرف');
      if (isLocked(today)) return toast('هذا التاريخ في فترة مقفولة');
      if (!await confirmBox('صرف الراتب', `سيُسجَّل صافي راتب «${e.name}» عن ${ymLabel(ym)} بمبلغ ${money(net)} في المصروفات بتاريخ اليوم.`, 'صرف', false)) return;
      const ex = { id: uid(), date: new Date().toISOString(), title: `راتب ${ymLabel(ym)} — ${e.name}`, amount: net, note: '', cat: 'misc', payEmp: e.id, payYm: ym };
      db.expenses.push(ex); e.paid = e.paid || {}; e.paid[ym] = { amount: net, date: ex.date, expId: ex.id }; logA('sal_pay', e.name, ym, money(net)); save(); sum(); toast('تم صرف الراتب وتسجيله في المصروفات', 'ok');
    };
    if (up) up.onclick = async () => {
      if (isLocked(pd.date)) return toast('صرف هذا الراتب في فترة مقفولة ولا يمكن إلغاؤه');
      if (!await confirmBox('إلغاء صرف الراتب', `سيُحذف مبلغ ${money(pd.amount)} من المصروفات ويعود راتب ${ymLabel(ym)} غير مصروف.`, 'إلغاء الصرف')) return;
      db.expenses = db.expenses.filter(x => x.id !== pd.expId); delete e.paid[ym]; logA('sal_unpay', e.name, ym, money(pd.amount)); save(); sum(); toast('تم إلغاء صرف الراتب', 'ok');
    };
  };
  const drawAdv = () => {
    const A = advsNow().sort((a, b) => a.date.localeCompare(b.date));
    $('#s-advs').innerHTML = (A.map(a => `<div class="sum-row"><span><bdi dir="ltr">${a.date}</bdi>${a.note ? ' — ' + esc(a.note) : ''}</span><b>${money(a.amount)} <button class="del" data-ad="${a.id}" aria-label="حذف السلفة" style="margin-inline-start:6px">${ICON.trash}</button></b></div>`).join('') || '<p class="lbl" style="margin:0">لا توجد سلف في هذا الشهر.</p>') +
      `<p class="lbl" style="margin:10px 0 0;line-height:1.9">السلفة تُسجَّل في المصروفات وقت إضافتها، وتُخصم من الراتب بعد حساب الأيام والساعات والدقائق.</p>`;
    $$('[data-ad]', v).forEach(b => b.onclick = async () => { const a = db.adv.find(x => x.id === b.dataset.ad); if (a && isLocked(a.date)) return toast('هذه السلفة في فترة مقفولة ولا يمكن حذفها'); if (a && await confirmBox('حذف السلفة', `سيُحذف مبلغ ${money(a.amount)} من سلف «${e.name}» ومن المصروفات.`)) { db.adv = db.adv.filter(x => x.id !== a.id); db.expenses = db.expenses.filter(x => x.advId !== a.id); logA('adv_del', e.name, money(a.amount)); save(); drawAdv(); sum(); toast('تم حذف السلفة', 'ok'); } });
  };
  const draw = () => {
    const sn = $('#s-span'), cc = cur(), SN = empSpan(cc, ym), mo = +ym.slice(5, 7);
    if (sn) { /* what is counted this month, and a way out when the start date was meant as the last day */
      if (!cc.start && !cc.end) sn.hidden = true;
      else { sn.hidden = false; sn.innerHTML = `<span>${SN.none ? 'هذا الشهر خارج مدة عمل الموظف: لا راتب له فيه.' : `مدة العمل المحسوبة لهذا الشهر: من ${SN.a}/${mo} إلى ${SN.z}/${mo} — الأيام خارجها لا تُحسب في الراتب.`}</span>${cc.start && cc.start.slice(0, 7) === ym && SN.a > 1 ? ` <button class="mini" id="s-swap" type="button">كان قصدي أنه آخر يوم عمل (تصفية)</button>` : ''}`;
        const sw = $('#s-swap'); if (sw) sw.onclick = () => { $('#s-end').value = $('#s-start').value; $('#s-start').value = ''; draw(); };
      }
    }
    const H = hr(), SP = empSpan(cur(), ym), outS = r => +r.date.slice(8, 10) < SP.a || +r.date.slice(8, 10) > SP.z;
    $('#s-rows').innerHTML = rows.map((r, i) => { const wd = wdayOf(r.date), fut = r.date > today || outS(r), off = fut || !(r.type === 'p' || r.type === 'x');
      return `<tr class="${wd === +H.off ? 'off' : ''}${fut ? ' fut' : ''}${!fut && i === openI ? ' open' : ''}"><td><button type="button" class="dtog" data-t="${i}" aria-expanded="${!fut && i === openI}"${fut ? ' disabled' : ''}><span class="dn"><b>${WDAYS[wd]}</b> <bdi dir="ltr" class="muted">${+r.date.slice(8)}/${+r.date.slice(5, 7)}</bdi></span><span id="sh${i}-st">${fut ? '' : stHTML(r)}</span><i class="chev"></i><span class="dline" id="sh${i}-s">${outS(r) ? 'خارج مدة العمل' : fut ? '' : lnHTML(r)}</span></button></td>
      <td><div class="sel"><select id="sh${i}-type" data-i="${i}" data-k="type" aria-label="الحالة"${fut ? ' disabled' : ''}><option value="">—</option>${Object.entries(ATT).map(([k, t]) => `<option value="${k}"${r.type === k ? ' selected' : ''}>${t}</option>`).join('')}</select></div></td>
      <td>${tboxHTML('sh' + i + '-in', i, 'in', r.in, fut || r.type === 'a' || r.type === 'v')}</td>
      <td>${tboxHTML('sh' + i + '-out', i, 'out', r.out, fut || r.type === 'a' || r.type === 'v')}</td>
      <td class="muted" id="sh${i}-d">${outS(r) ? 'خارج مدة العمل' : fut ? '—' : diff(r)}</td>
      <td><input id="sh${i}-note" class="inp ctr" data-i="${i}" data-k="note" aria-label="ملاحظة" value="${esc(r.note)}" placeholder="${r.type === 'x' ? 'تم الاستئذان' : ''}" autocomplete="off"${fut ? ' disabled' : ''}></td></tr>`; }).join('');
    sum();
  };
  const load = () => {
    const by = {}; db.att.filter(r => r.empId === e.id && r.date.slice(0, 7) === ym).forEach(r => { by[r.date] = r; });
    t0 = empTimes(e, ym); $('#s-in').innerHTML = timeOpts(t0.in); $('#s-out').innerHTML = timeOpts(t0.out); /* the times this month was worked with */
    openI = -1; rows = []; for (let d = 1, n = ymDays(ym); d <= n; d++) { const date = ymDate(ym, d), r = by[date]; rows.push({ date, type: r ? r.type : '', in: r ? r.in || '' : '', out: r ? r.out || '' : '', note: r ? r.note || '' : '' }); }
    draw(); drawAdv();
  };
  const tb = $('#s-rows'), refresh = () => { const SP = empSpan(cur(), ym); rows.forEach((r, i) => { const c = $('#sh' + i + '-d'), dd = +r.date.slice(8, 10); if (c && r.date <= today && dd >= SP.a && dd <= SP.z) { c.textContent = diff(r); upS(i); } }); sum(); };
  tb.addEventListener('click', ev => { /* phone: a tap on a day opens its fields (one day at a time) and closes the one before */
    const b = ev.target.closest && ev.target.closest('.dtog'); if (!b || b.disabled || !matchMedia('(max-width: 780px)').matches) return;
    const tr = b.closest('tr'), was = tr.classList.contains('open');
    $$('tr.open', tb).forEach(x => { x.classList.remove('open'); const q = x.querySelector('.dtog'); if (q) q.setAttribute('aria-expanded', 'false'); });
    openI = was ? -1 : +b.dataset.t; if (!was) { tr.classList.add('open'); b.setAttribute('aria-expanded', 'true'); tr.scrollIntoView({ block: 'nearest' }); }
  });
  /* read one time box into its row: '' while the hour is empty, null when it is not a time; auto = pick ص / م by itself (the hour was just typed) */
  const readBox = (i, k, auto) => {
    const g = x => $('#sh' + i + '-' + k + '-' + x), hs = g('h').value, ms = g('m').value, P = g('p'), c24 = +hr().clock === 24;
    if (!hs) return '';
    let H = +hs; const M = ms ? +ms : 0; if (H > 23 || M > 59) return null;
    if (!c24 && H >= 1 && H <= 12) {
      let pm;
      if (auto || !P.value) { const c = cur(), v = parseClock(H + ':' + M, k === 'in' ? c.in : c.out); pm = hm(v) >= 720; P.value = P.dataset.v = PM_L()[pm ? 1 : 0]; }
      else pm = P.value === PM_L()[1];
      H = pm ? (H === 12 ? 12 : H + 12) : (H === 12 ? 0 : H);
    } else if (!c24 && P) P.value = P.dataset.v = PM_L()[H >= 12 ? 1 : 0]; /* 13–23 or 0 typed on the 12-hour clock */
    return String(H).padStart(2, '0') + ':' + String(M).padStart(2, '0');
  };
  const apply = (i, k, auto) => {
    const r = rows[i], v = readBox(i, k, auto); r[k] = v || '';
    if (r[k] && !r.type) { r.type = 'p'; $('#sh' + i + '-type').value = 'p'; } /* a time typed on an empty day: he was present */
    const c = $('#sh' + i + '-d'); if (c) c.textContent = diff(r); upS(i); sum(); return v;
  };
  const flipP = (t, ch) => { const L = PM_L(), prev = t.dataset.v || t.placeholder; let nx;
    if (ch === L[0] || ch === 'ص' || /^a$/i.test(ch)) nx = L[0]; else if (ch === L[1] || ch === 'م' || /^p$/i.test(ch)) nx = L[1]; else nx = prev === L[0] ? L[1] : L[0];
    t.value = t.dataset.v = nx; apply(+t.dataset.i, t.dataset.k, false); t.select(); };
  tb.addEventListener('keydown', ev => {
    const t = ev.target; if (!t.classList || !t.classList.contains('tseg')) return;
    if (t.dataset.s === 'p') { if (ev.key && ev.key.length === 1 || ev.key === 'ArrowUp' || ev.key === 'ArrowDown') { ev.preventDefault(); flipP(t, ev.key.length === 1 ? ev.key : ''); } else if (ev.key === 'Backspace') { ev.preventDefault(); $('#' + t.id.replace(/-p$/, '-m')).focus(); } return; }
    if (t.dataset.s === 'm' && ev.key === 'Backspace' && !t.value) { ev.preventDefault(); const h = $('#' + t.id.replace(/-m$/, '-h')); h.focus(); h.select(); }
    if (ev.key === ':' || ev.key === '.' || ev.key === ' ') { if (t.dataset.s === 'h') { ev.preventDefault(); const m = $('#' + t.id.replace(/-h$/, '-m')); m.focus(); m.select(); } }
  });
  tb.addEventListener('mouseup', ev => { const t = ev.target; if (t.classList && t.classList.contains('tseg')) { ev.preventDefault(); t.select(); } }); /* a click selects the field, so typing replaces it (Tab already does) */
  tb.addEventListener('input', ev => { const t = ev.target; if (t.dataset.i == null || t.dataset.k === 'type') return; const i = +t.dataset.i, r = rows[i], k = t.dataset.k;
    if (k === 'note') { r.note = t.value; return; }
    if (t.dataset.s === 'p') { const prev = t.dataset.v || '', ch = t.value.replace(prev, '').slice(-1) || t.value.slice(-1); flipP(t, ch); return; } /* phones that send no key name */
    const dg = toLat(t.value).replace(/\D/g, '').slice(0, 2); if (dg !== t.value) t.value = dg;
    apply(i, k, t.dataset.s === 'h');
  });
  tb.addEventListener('change', ev => {
    const t = ev.target;
    if (t.classList && t.classList.contains('tseg')) { if (t.dataset.s === 'p') return; const i = +t.dataset.i, k = t.dataset.k, v = apply(i, k, false);
      if (v === null) { toast(+hr().clock === 24 ? 'الساعة من 0 إلى 23 والدقائق من 0 إلى 59' : 'الساعة من 1 إلى 12 والدقائق من 0 إلى 59'); ['h', 'm', 'p'].forEach(x => { const f = $('#sh' + i + '-' + k + '-' + x); if (f) { f.value = ''; f.dataset.v = ''; } }); apply(i, k, false); return; }
      if (v) { const m = hm(v), H = Math.floor(m / 60), d = x => String(x).padStart(2, '0'); $('#sh' + i + '-' + k + '-h').value = d(+hr().clock === 24 ? H : (H % 12 || 12)); const mf = $('#sh' + i + '-' + k + '-m'); if (mf.value) mf.value = d(m % 60); } /* 8 -> 08, 5 -> 05; empty minutes stay a faded 00 */
      return; }
    if (t.dataset.k !== 'type') return; const r = rows[+t.dataset.i]; r.type = t.value;
    if (r.type === 'p' && !r.in && !r.out) { const c = cur(); r.in = c.in; r.out = c.out; } /* present: starts from his fixed times, he corrects what the notebook says */
    if (r.type === 'a' || r.type === 'v' || !r.type) { r.in = ''; r.out = ''; }
    draw();
  });
  ['s-in', 's-out'].forEach(id => $('#' + id).addEventListener('change', refresh));
  $('#s-clock').onchange = () => { /* the same times, written the other way — everywhere (lists, boxes, the printed sheet) */
    const c = cur(); db.settings.hr = Object.assign(hr(), { clock: +$('#s-clock').value === 24 ? 24 : 12 }); logA('hr_set', +hr().clock === 24 ? '24 ساعة' : '12 ساعة'); save();
    $('#s-in').innerHTML = timeOpts(c.in); $('#s-out').innerHTML = timeOpts(c.out); draw(); toast(+hr().clock === 24 ? 'الوقت يُكتب بنظام 24 ساعة' : 'الوقت يُكتب بنظام 12 ساعة (ص / م)', 'ok');
  };
  $('#s-sal').addEventListener('input', ev => { ev.target.value = cleanNum(ev.target.value); sum(); });
  ['s-start', 's-end'].forEach(id => $('#' + id).addEventListener('change', () => { const a = $('#s-start').value, z = $('#s-end').value; if (a && z && a > z) { toast('آخر يوم عمل قبل تاريخ البدء'); $('#' + id).value = ''; } draw(); }));
  $('#s-fill').onclick = () => { const H = hr(), c = cur(); let n = 0; const SP = empSpan(c, ym); rows.forEach(r => { const dd = +r.date.slice(8, 10); if (!r.type && r.date <= today && dd >= SP.a && dd <= SP.z && wdayOf(r.date) !== +H.off) { r.type = 'p'; r.in = c.in; r.out = c.out; n++; } }); draw(); toast(n ? `تمت تعبئة ${n} يوم — عدّل ما يختلف في الدفتر ثم احفظ` : 'لا توجد أيام فارغة', n ? 'ok' : undefined); };
  const commit = quiet => { /* -> true when everything on the screen is saved */
    const c = cur(); if (c.salary <= 0) { toast('اكتب الراتب بقيمة أكبر من صفر'); return false; }
    if (c.in === c.out) { toast('ميعاد الحضور والانصراف الثابتان متساويان'); return false; }
    const bad = rows.find(r => (r.type === 'p' || r.type === 'x') && r.in && r.out && r.in === r.out); if (bad) { toast(`ميعاد الحضور والانصراف متساويان يوم ${+bad.date.slice(8)}`); return false; }
    const R = recsNow(); e.salary = c.salary; if (c.start) e.start = c.start; else delete e.start; if (c.end) e.end = c.end; else delete e.end; e.sched = e.sched || {}; e.sched[ym] = { in: c.in, out: c.out };
    if (!Object.keys(e.sched).some(k => k > ym)) { e.in = c.in; e.out = c.out; } /* the latest month sets what the next one starts from */
    db.att = db.att.filter(r => !(r.empId === e.id && r.date.slice(0, 7) === ym)).concat(R.map(r => Object.assign({ id: uid() }, r)));
    logA('att_save', e.name, ym, `${R.length} يوم`); save(); if (!quiet) toast(`تم حفظ كشف ${ymLabel(ym)} — ${R.length} يوم`, 'ok'); return true;
  };
  $('#s-save').onclick = () => { commit(); };
  ymBind('s-ym', v => { ym = v; load(); });
  $('#s-adv').onclick = () => modal(`<h3>سلفة للموظف ${esc(e.name)}</h3>
    <div class="field"><label for="v-amt">مبلغ السلفة (جنيه)</label><input id="v-amt" class="inp" inputmode="decimal" autocomplete="off"></div>
    <div class="field"><label for="v-date">التاريخ</label><input id="v-date" class="inp" type="date" value="${ym === ymNow() ? today : ymDate(ym, ymDays(ym))}" min="${ymDate(ym, 1)}" max="${ym === ymNow() ? today : ymDate(ym, ymDays(ym))}"></div>
    <div class="field"><label for="v-note">ملاحظة (اختياري)</label><input id="v-note" class="inp" autocomplete="off"></div>
    <div class="actions"><button class="btn" data-ok>تسجيل السلفة</button><button class="btn ghost" data-no>إلغاء</button></div>`, (d, close) => {
    $('#v-amt').addEventListener('input', ev => { ev.target.value = cleanNum(ev.target.value); });
    $('[data-no]', d).onclick = close;
    $('[data-ok]', d).onclick = () => {
      const a = round2(num($('#v-amt').value)); if (a <= 0) return toast('اكتب مبلغاً أكبر من صفر');
      const dt = $('#v-date').value; if (!dt || dt.slice(0, 7) !== ym) return toast('اختر تاريخاً داخل شهر الكشف');
      if (isLocked(dt)) return toast('هذا التاريخ في فترة مقفولة');
      const adv = { id: uid(), empId: e.id, date: dt, amount: a, note: $('#v-note').value.trim() }, ex = { id: uid(), date: dt === today ? new Date().toISOString() : new Date(dt + 'T12:00:00').toISOString(), title: 'سلفة موظف — ' + e.name, amount: a, note: adv.note, cat: 'misc', advId: adv.id };
      adv.expId = ex.id; db.adv.push(adv); db.expenses.push(ex); /* money that left the cash: it shows in the expenses and the day's report */
      logA('adv_add', e.name, money(a)); save(); close(); drawAdv(); sum(); toast('تم تسجيل السلفة في المصروفات — تُخصم من صافي الراتب', 'ok');
    };
  });
  $('#s-pdf').onclick = () => { if (commit(true)) pdfSave(empPaper(e, ym), 'كشف حضور وراتب ' + e.name, ym); };
  const pr = $('#s-print'); if (pr) pr.onclick = () => { if (!commit(true)) return; $('#paper').innerHTML = empPaper(e, ym); printRep(hrFile('كشف_حضور_وراتب_' + e.name, ym)); };
  load();
};

screens.empPay = (p, v) => {
  let ym = p.ym || ymNow(); const canPrint = !window.claude;
  v.innerHTML = subHead('كشف الرواتب') + `<div class="stack">
    <section class="panel noprint"><div class="form-grid"><div class="field"><label>الشهر</label>${ymPick('p-ym', ym)}</div></div>
      <div class="actions" style="margin-top:14px"><button class="btn ghost" id="p-pdf" type="button">${ICON.pdf}<span>تصدير PDF</span></button>${canPrint ? `<button class="btn ghost" id="p-print" type="button">${ICON.printer}<span>طباعة</span></button>` : ''}</div></section>
    <div id="paper"></div>
    <section class="panel noprint"><h2 class="panel-t">كشف حضور وراتب كل موظف</h2><div class="actions" id="p-emps" style="justify-content:flex-start;gap:8px;flex-wrap:wrap"></div></section></div>`;
  const draw = () => {
    $('#paper').innerHTML = payPaper(ym); docWarm(payPaper(ym), 'كشف الرواتب', ym); /* the PDF is made while the screen is open: the buttons answer at once */
    $('#p-emps').innerHTML = db.emps.map(e => `<button class="mini" data-sh="${e.id}">${esc(e.name)}</button>`).join('') || '<span class="muted">لا يوجد موظفين.</span>';
    $$('[data-sh]', v).forEach(b => b.onclick = () => go('empSheet', { id: b.dataset.sh, ym }));
  };
  ymBind('p-ym', v => { ym = v; draw(); });
  $('#p-pdf').onclick = () => pdfSave(payPaper(ym), 'كشف الرواتب', ym);
  const pr = $('#p-print'); if (pr) pr.onclick = () => printRep(hrFile('كشف_الرواتب_' + ym, '').replace(/_$/, ''), payPaper(ym), 'كشف الرواتب', ym);
  draw();
};

screens.empSet = (p, v) => {
  const H = hr(), yn = (id, on, a, b) => `<div class="sel"><select id="${id}"><option value="1"${on ? ' selected' : ''}>${a}</option><option value="0"${on ? '' : ' selected'}>${b}</option></select></div>`;
  v.innerHTML = subHead('المواعيد الافتراضية وقواعد الحساب') + `<div class="stack">
  <section class="panel"><h2 class="panel-t">المواعيد الافتراضية للموظف الجديد</h2><div class="form-grid">
    <div class="field"><label for="h-in">ميعاد الحضور</label>${timeSel('h-in', H.in)}</div>
    <div class="field"><label for="h-out">ميعاد الانصراف</label>${timeSel('h-out', H.out)}</div>
    <div class="field"><label for="h-grace">سماح التأخير (دقائق) — لا يُحسب التأخير إن لم يتجاوزه</label><input id="h-grace" class="inp" inputmode="numeric" value="${+H.grace || 0}" autocomplete="off"></div>
    <div class="field"><label for="h-off">الإجازة الأسبوعية</label><div class="sel"><select id="h-off">${WDAYS.map((d, i) => `<option value="${i}"${+H.off === i ? ' selected' : ''}>${d}</option>`).join('')}<option value="-1"${+H.off === -1 ? ' selected' : ''}>لا يوجد</option></select></div></div>
    <div class="field"><label for="h-poff">يوم الإجازة الأسبوعية</label>${yn('h-poff', H.paidOff, 'مدفوع الأجر', 'بدون أجر (لأصحاب اليومية)')}</div></div>
    <p class="lbl" style="margin:12px 0 0;line-height:1.9">مواعيد كل موظف تُختار أعلى كشفه لكل شهر (صيفي / شتوي)، وتبدأ من هذه المواعيد. يوم الإجازة الأسبوعية لا يُخصم من الراتب الشهري.</p></section>
  <section class="panel"><h2 class="panel-t">قواعد حساب الراتب</h2><div class="form-grid">
    <div class="field"><label for="h-div">قيمة اليوم للراتب الشهري</label><div class="sel"><select id="h-div"><option value="30"${+H.div === 30 ? ' selected' : ''}>الراتب ÷ 30 يوم</option><option value="26"${+H.div === 26 ? ' selected' : ''}>الراتب ÷ 26 يوم</option><option value="0"${+H.div === 0 ? ' selected' : ''}>الراتب ÷ أيام العمل الفعلية في الشهر</option></select></div></div>
    <div class="field"><label for="h-late">التأخير والانصراف المبكر</label>${yn('h-late', H.late, 'يُخصم بالدقيقة من الراتب', 'يُسجَّل فقط بدون خصم')}</div>
    <div class="field"><label for="h-ot">الوقت الإضافي بعد ميعاد الانصراف</label>${yn('h-ot', H.ot, 'يُضاف للراتب بالدقيقة', 'يُسجَّل فقط بدون إضافة')}</div>
    <div class="field"><label for="h-pre">الحضور المبكر قبل ميعاد الحضور</label>${yn('h-pre', H.pre, 'يُضاف للراتب بالدقيقة', 'يُسجَّل فقط بدون إضافة')}</div>
    <div class="field"><label for="h-ex">الاستئذان</label>${yn('h-ex', H.excuse, 'بدون خصم', 'يُخصم مثل التأخير والغياب')}</div></div>
    <p class="lbl" style="margin:12px 0 0;line-height:1.9">قيمة الدقيقة = قيمة اليوم ÷ دقائق يوم العمل. يوم الغياب يُخصم بقيمة يوم كامل. اليوم الذي لم يُسجَّل له شيء لا يُخصم. صاحب اليومية يأخذ أجر أيام حضوره فقط. السلف تُخصم في الآخر.</p></section>
  <div class="submit"><button class="btn lg" id="h-save" type="button">${ICON.save}<span>حفظ</span></button></div></div>`;
  $('#h-grace').addEventListener('input', e => { e.target.value = cleanNum(e.target.value).replace(/\..*/, ''); });
  $('#h-save').onclick = () => {
    const a = $('#h-in').value, b = $('#h-out').value; if (!a || !b) return toast('اكتب ميعاد الحضور وميعاد الانصراف');
    if (a === b) return toast('ميعاد الحضور والانصراف متساويان');
    db.settings.hr = { clock: +hr().clock === 24 ? 24 : 12, in: a, out: b, grace: Math.min(Math.round(num($('#h-grace').value)), 240), off: +$('#h-off').value, paidOff: $('#h-poff').value === '1', div: +$('#h-div').value, late: $('#h-late').value === '1', excuse: $('#h-ex').value === '1', ot: $('#h-ot').value === '1', pre: $('#h-pre').value === '1' };
    logA('hr_set', `${a} – ${b}`); save(); toast('تم حفظ المواعيد وقواعد الحساب', 'ok'); back();
  };
};
