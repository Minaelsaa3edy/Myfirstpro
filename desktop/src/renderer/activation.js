'use strict';
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var msg = $('msg'), busy = false;
  function show(text, kind) { msg.hidden = !text; msg.textContent = text || ''; msg.className = 'msg ' + (kind || 'info'); }
  function lock(on) { busy = on; ['go', 'export', 'devgo', 'issuer', 'key', 'pw'].forEach(function (i) { $(i).disabled = on; }); }
  function fail() { lock(false); show('حدث خطأ غير متوقع.', 'err'); }
  MPD.status().then(function (s) {
    $('pname').textContent = s.productName; $('ver').textContent = 'Version ' + s.version;
    if (s.notice) $('keep').textContent = s.notice;
    if (s.dev) { $('devbar').hidden = false; $('dev').hidden = false; $('issuer').hidden = !s.canIssue; }
    $('export').hidden = !s.hasData;
    if (s.message) show(s.message, s.kind); else show('البرنامج غير مفعّل بعد. الصق كود التفعيل الذي أرسله لك المطوّر.', 'info');
    $('key').focus();
  });
  function done(r) {
    lock(false);
    if (r.ok) { $('key').value = ''; $('pw').value = ''; show('تم التفعيل بنجاح' + (r.summary ? ' — ' + r.summary : '') + '. جاري فتح البرنامج…', 'ok'); }
    else if (r.code !== 'CANCEL') show(r.message || 'تعذّر التفعيل.', 'err');
  }
  function go() { if (busy) return; var t = $('key').value; if (!t.trim()) return show('الصق كود التفعيل أولًا.', 'err'); lock(true); MPD.activate(t).then(done, fail); }
  $('go').onclick = go;
  $('key').addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || !e.shiftKey)) { e.preventDefault(); go(); } });
  $('devgo').onclick = function () { if (busy) return; var p = $('pw').value; if (!p) return show('اكتب كلمة مرور المطوّر.', 'err'); lock(true); show('جاري التحقق…', 'info'); MPD.devLogin(p).then(done, fail); };
  $('pw').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('devgo').onclick(); });
  $('issuer').onclick = function () { MPD.openIssuer(); };
  $('export').onclick = function () { MPD.exportData().then(function (r) { if (r.ok) show('تم حفظ نسخة البيانات.', 'ok'); else if (r.code === 'NO_DATA') show(r.message, 'info'); else if (r.code !== 'CANCEL') show(r.message || 'تعذّر الحفظ.', 'err'); }); };
  $('quit').onclick = function () { MPD.quit(); };
})();
