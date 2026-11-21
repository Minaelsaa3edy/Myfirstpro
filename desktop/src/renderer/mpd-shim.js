/* Myfirstpro Desktop — bridge inside the program window (injected at build time before the program's own script).
   1) if the browser storage of the window was lost or damaged, the data saved by the main process is put back before the program starts;
   2) every change of the program's storage keys is also sent to the main process (atomic file + rotating backups);
   3) the browser-only "backup folder" feature is switched off: this edition makes its own automatic backups. */
(function () {
  'use strict';
  var M = window.MPD; if (!M) return;
  var RX = /^accounts\.[A-Za-z0-9._-]{1,40}$/, ls;
  try { ls = window.localStorage; } catch (e) { return; }
  try {
    var keys = M.snapshot && M.snapshot.keys;
    if (keys) Object.keys(keys).forEach(function (k) {
      if (!RX.test(k) || typeof keys[k] !== 'string') return;
      var cur = ls.getItem(k), good = false;
      if (cur != null) { try { JSON.parse(cur); good = true; } catch (e) { good = false; } }
      if (!good) ls.setItem(k, keys[k]);
    });
  } catch (e) { /* the program starts with whatever the window has */ }
  var timer = 0;
  function collect() { var o = {}; for (var i = 0; i < ls.length; i++) { var k = ls.key(i); if (RX.test(k)) o[k] = ls.getItem(k); } return o; }
  function push() { timer = 0; try { M.persist(JSON.stringify(collect())); } catch (e) { /* next change tries again */ } }
  function sched() { if (!timer) timer = setTimeout(push, 400); }
  function flush() { if (timer) { clearTimeout(timer); push(); } }
  var P = Storage.prototype, si = P.setItem, ri = P.removeItem, cl = P.clear;
  P.setItem = function (k) { var r = si.apply(this, arguments); if (this === ls && RX.test(String(k))) sched(); return r; };
  P.removeItem = function (k) { var r = ri.apply(this, arguments); if (this === ls && RX.test(String(k))) sched(); return r; };
  P.clear = function () { var r = cl.apply(this, arguments); if (this === ls) sched(); return r; };
  window.addEventListener('pagehide', flush); window.addEventListener('beforeunload', flush);
  try { window.showDirectoryPicker = undefined; } catch (e) { /* ignore */ }
  sched();
})();
