'use strict';
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var msg = $('msg'), busy = false, last = [];
  function show(text, kind) { msg.hidden = !text; msg.textContent = text || ''; msg.className = 'msg ' + (kind || 'info'); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(text, fn, cls) { var b = el('button', cls || 'ghost', text); b.type = 'button'; b.onclick = fn; return b; }
  function copy(t, what) { MPD.copy(t); show('تم نسخ ' + what + '.', 'ok'); }

  var PRESETS = [['تجريبي 30 دقيقة', 'minutes', 30], ['ساعة', 'hours', 1], ['24 ساعة', 'hours', 24], ['3 أيام', 'days', 3], ['7 أيام', 'days', 7], ['30 يومًا', 'days', 30], ['سنة', 'days', 365], ['دائم', 'permanent', 0]];
  PRESETS.forEach(function (p) { $('presets').appendChild(btn(p[0], function () { $('unit').value = p[1]; if (p[2]) $('value').value = p[2]; sync(); }, 'chip')); });
  function sync() {
    var perm = $('unit').value === 'permanent';
    $('valbox').hidden = perm;
    $('hint').textContent = perm ? 'كود دائم: بدون انتهاء. مهلة التفعيل التلقائية 365 يومًا (اكتب 0 لبدون حد).' : 'كود مؤقت: تبدأ المدة من لحظة أول تفعيل على جهاز العميل، ولا تتجدد عند إدخال نفس الكود بعد التحديث. مهلة التفعيل التلقائية 30 يومًا (اكتب 0 لبدون حد).';
  }
  $('unit').onchange = sync; sync();

  function setBusy(on) { busy = on; ['unlock', 'issue', 'pw'].forEach(function (i) { $(i).disabled = on; }); }
  function unlock() {
    if (busy) return; var p = $('pw').value; if (!p) return show('اكتب كلمة مرور المطوّر.', 'err');
    setBusy(true); show('جاري فتح المفاتيح…', 'info');
    MPD.unlock(p).then(function (r) {
      setBusy(false);
      if (!r.ok) return show(r.message || 'تعذّر الفتح.', 'err');
      $('pw').value = ''; $('lockbox').hidden = true; $('tool').hidden = false; show('', 'info');
      var has = {}; (r.channels || []).forEach(function (c) { has[c] = 1; });
      Array.prototype.forEach.call($('channel').options, function (o) { o.disabled = !has[o.value]; }); if (!has.production && has.developer) $('channel').value = 'developer';
      history_();
    }, function () { setBusy(false); show('حدث خطأ غير متوقع.', 'err'); });
  }
  $('unlock').onclick = unlock; $('pw').addEventListener('keydown', function (e) { if (e.key === 'Enter') unlock(); });
  $('lock').onclick = function () { MPD.lock(); $('tool').hidden = true; $('out').hidden = true; $('lockbox').hidden = false; last = []; show('تم قفل المولّد.', 'info'); };

  function renderItems() {
    var box = $('items'); box.textContent = '';
    last.forEach(function (it) {
      var d = el('div', 'item'); d.appendChild(el('div', 'sum', it.summary + ' — ' + it.id));
      d.appendChild(el('code', 'code', it.code));
      var r = el('div', 'row'); r.appendChild(btn('نسخ الكود', function () { copy(it.code, 'الكود'); })); r.appendChild(btn('نسخ رسالة جاهزة للعميل', function () { copy(it.message, 'الرسالة'); }));
      d.appendChild(r); box.appendChild(d);
    });
    $('out').hidden = !last.length; $('bulk').hidden = last.length < 2;
  }
  $('copyall').onclick = function () { copy(last.map(function (i) { return i.code; }).join('\n'), 'كل الأكواد'); };
  $('saveall').onclick = function () { MPD.save(last.map(function (i) { return i.id + '\t' + i.code; }).join('\r\n'), 'codes').then(function (r) { if (r.ok) show('تم حفظ الملف.', 'ok'); else if (r.message) show(r.message, 'err'); }); };

  $('issue').onclick = function () {
    if (busy) return; setBusy(true);
    MPD.issue({ channel: $('channel').value, unit: $('unit').value, value: $('value').value, withinDays: $('within').value, label: $('label').value, count: $('count').value }).then(function (r) {
      setBusy(false);
      if (!r.ok) { if (r.code === 'NOT_UNLOCKED') { $('tool').hidden = true; $('lockbox').hidden = false; } return show(r.message || 'تعذّر الإصدار.', 'err'); }
      last = r.items; renderItems(); show('تم إصدار ' + r.items.length + ' كود. انسخه وأرسله للعميل.', 'ok'); history_();
    }, function () { setBusy(false); show('حدث خطأ غير متوقع.', 'err'); });
  };

  function history_() {
    MPD.list().then(function (r) {
      var h = $('hist'); h.textContent = '';
      if (!r.ok || !r.rows.length) { h.appendChild(el('p', 'hint', 'لا توجد أكواد مُصدرة بعد.')); return; }
      r.rows.slice(0, 40).forEach(function (x) {
        var d = el('div', 'h'), l = el('div'); var b = el('b', null, x.id); l.appendChild(b);
        l.appendChild(el('div', 't', (x.label ? x.label + ' · ' : '') + x.dur + (x.channel === 'developer' ? ' · مطوّر' : '') + ' · ' + x.when));
        d.appendChild(l); d.appendChild(btn('نسخ', function () { copy(x.code, 'الكود'); })); h.appendChild(d);
      });
    });
  }
  window.addEventListener('beforeunload', function () { MPD.lock(); });
})();
