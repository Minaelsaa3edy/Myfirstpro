// v6.7 — tools/sw.js: the same file serves the customer program (scope = the site folder) and the designer's page (scope = pushdev/).
// Runs the worker in a fake service-worker scope: which windows hear about an alarm, which one is focused, what is opened when none is open, which storage it reads.
const fs = require('fs'), vm = require('vm');
const SRC = fs.readFileSync('/home/claude/accounts-app/tools/sw.js', 'utf8').replace('@@VER@@', 'test');
let pass = 0, fail = 0; const chk = (n, c, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); };
const mkWin = u => { const w = { url: u, msgs: [], focused: 0, postMessage: m => w.msgs.push(m), focus: async () => { w.focused++; } }; return w; };
function boot(scope, wins) {
  const L = {}, opened = [], shown = [], dbs = [];
  const store = {};
  const idb = { open: name => { dbs.push(name); const q = {}; setTimeout(() => { const st = store[name] = store[name] || {}; q.result = { createObjectStore() { }, close() { }, transaction: () => ({ objectStore: () => ({ get: k => { const r = {}; setTimeout(() => { r.result = st[k]; r.onsuccess && r.onsuccess(); }); return r; }, put: (v, k) => { st[k] = v; setTimeout(() => { t.oncomplete && t.oncomplete(); }); } }) , set oncomplete(f) { t.oncomplete = f; } }) }; const t = {}; q.onupgradeneeded && q.onupgradeneeded(); q.onsuccess && q.onsuccess(); }); return q; } };
  const self = { registration: { scope, showNotification: async (t, o) => { shown.push({ t, o }); } }, clients: { matchAll: async () => wins, claim: async () => { }, openWindow: async u => { opened.push(u); } }, addEventListener: (e, f) => { L[e] = f; }, skipWaiting() { } };
  vm.runInNewContext(SRC, { self, indexedDB: idb, Date, URL, setTimeout, Promise, Array, Math, console });
  return { L, opened, shown, dbs, store };
}
const run = async (h, e, ev) => { let p; ev.waitUntil = x => { p = x; }; h.L[e](ev); await p; };
(async () => {
  const base = 'https://x.github.io/Myfirstpro/';
  const cust = () => mkWin(base + 'index.html'), cust2 = () => mkWin(base), dev = () => mkWin(base + 'dev.html'), dev2 = () => mkWin(base + 'dev.html#x');
  // customer worker
  let c1 = cust(), c2 = cust2(), d1 = dev(); let h = boot(base, [c1, c2, d1]);
  await run(h, 'push', {});
  chk('customer worker: tells the customer windows only, never the designer page', c1.msgs.length === 1 && c2.msgs.length === 1 && d1.msgs.length === 0, [c1.msgs.length, c2.msgs.length, d1.msgs.length]);
  chk('customer worker reads/writes the customer storage (rm-push)', h.dbs.length > 0 && h.dbs.every(n => n === 'rm-push'), h.dbs);
  chk('a notice is always shown', h.shown.length === 1);
  const n = { close() { }, data: {} }; c1 = cust(); d1 = dev(); h = boot(base, [d1, c1]);
  await run(h, 'notificationclick', { notification: n });
  chk('customer click: focuses the customer window, not the designer page', c1.focused === 1 && d1.focused === 0 && h.opened.length === 0);
  h = boot(base, [dev()]); await run(h, 'notificationclick', { notification: n });
  chk('customer click with only the designer page open: opens the customer program (the scope), leaves the designer page alone', h.opened.length === 1 && h.opened[0] === base, h.opened);
  // designer worker
  const ds = base + 'pushdev/'; c1 = cust(); d1 = dev(); let d2 = dev2(); h = boot(ds, [c1, d1, d2]);
  await run(h, 'push', {});
  chk('designer worker: tells the designer windows only', d1.msgs.length === 1 && d2.msgs.length === 1 && c1.msgs.length === 0, [d1.msgs.length, d2.msgs.length, c1.msgs.length]);
  chk('designer worker reads/writes its own storage (rm-push-dev)', h.dbs.length > 0 && h.dbs.every(n2 => n2 === 'rm-push-dev'), h.dbs);
  c1 = cust(); d1 = dev(); h = boot(ds, [c1, d1]); await run(h, 'notificationclick', { notification: n });
  chk('designer click: focuses dev.html, not the customer window', d1.focused === 1 && c1.focused === 0 && h.opened.length === 0);
  h = boot(ds, [cust()]); await run(h, 'notificationclick', { notification: n });
  chk('designer click with nothing of its own open: opens dev.html (not the empty pushdev/ folder)', h.opened.length === 1 && h.opened[0] === base + 'dev.html', h.opened);
  // other pages of the same site (same address, another folder) are not windows of the program
  const other = mkWin('https://x.github.io/Myfirstpro-other/index.html'), root = mkWin('https://x.github.io/'); c1 = cust(); h = boot(base, [other, root, c1]);
  await run(h, 'push', {});
  chk('customer worker: a page of another folder on the same site hears nothing', other.msgs.length === 0 && root.msgs.length === 0 && c1.msgs.length === 1, [other.msgs.length, root.msgs.length, c1.msgs.length]);
  c1 = cust(); h = boot(base, [other, root, c1]); await run(h, 'notificationclick', { notification: n });
  chk('customer click: focuses the program, not another page of the same site', c1.focused === 1 && other.focused === 0 && root.focused === 0 && h.opened.length === 0);
  h = boot(base, [other]); await run(h, 'notificationclick', { notification: n });
  chk('customer click with only another page of the site open: opens the program', h.opened.length === 1 && h.opened[0] === base, h.opened);
  console.log(`${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
})();
