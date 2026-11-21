// v6.8 — the server sends at the START of the alarm's minute (not up to a minute late): tick at 10:29:37 with a time for 10:30 waits 23 s and sends once.
const crypto = require('crypto'); const { makeKeys, makeServer, b64u } = require('./gas.js');
const TPL = '/home/claude/accounts-app/tools/server.gs.tpl';
let pass = 0, fail = 0; const chk = (n, c, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); };
const EP = 'https://fcm.googleapis.com/fcm/send/abcDEF123456:APA91bExampleToken_xyz-123';
const dev = () => b64u(crypto.randomBytes(12)), b36 = a => a.map(m => m.toString(36)).join('.');
const mk = () => { const keys = makeKeys(), S = makeServer(TPL, keys); return { keys, S }; };
const D0 = Date.UTC(2026, 10, 15, 10, 0, 0), M = m => Math.floor(D0 / 60000) + m;
const reg = (S, keys, d, mins) => S.call({ a: 'preg', d, ep: EP, w: b36(mins), ak: keys.admin });

{ const { keys, S } = mk(), d = dev(); S.setNow(D0 + 29 * 60000 + 37000); reg(S, keys, d, [M(30), M(90)]); S.st.fetches.length = 0; S.st.slept = 0;
  S.X.pushTick(); const t = S.st.now;
  chk('tick at 10:29:37 with a time for 10:30 → waits ~23 s then sends once', S.st.fetches.length === 1 && S.st.slept >= 22000 && S.st.slept <= 24000, { fetches: S.st.fetches.length, slept: S.st.slept });
  chk('…and it sent right after the minute started (within 1 s)', t - (D0 + 30 * 60000) >= 0 && t - (D0 + 30 * 60000) < 1000, t - (D0 + 30 * 60000));
  chk('the sent time is removed, the later one stays', JSON.parse(S.props['pu_' + d]).w.join() === String(M(90)));
  S.setNow(D0 + 30 * 60000 + 5000); S.X.pushTick(); chk('the next tick (10:30:05) does not send it again', S.st.fetches.length === 1, S.st.fetches.length);
  chk('log has one entry', JSON.parse(S.props.pl).length === 1); }
{ const { keys, S } = mk(), d = dev(); S.setNow(D0 + 29 * 60000 + 37000); reg(S, keys, d, [M(31)]); S.st.slept = 0; S.X.pushTick();
  chk('a time two minutes ahead → no waiting, nothing sent', S.st.slept === 0 && S.st.fetches.length === 0); }
{ const { keys, S } = mk(), d = dev(); S.setNow(D0 + 30 * 60000 + 2000); reg(S, keys, d, [M(30)]); S.st.slept = 0; S.X.pushTick();
  chk('already due (10:30:02) → sent at once, no waiting', S.st.fetches.length === 1 && S.st.slept === 0); }
{ const { keys, S } = mk(), d = dev(); S.setNow(D0 + 29 * 60000 + 59500); reg(S, keys, d, [M(30)]); S.st.slept = 0; S.X.pushTick();
  chk('tick at 10:29:59.5 → waits half a second only', S.st.fetches.length === 1 && S.st.slept <= 900, S.st.slept); }
{ const { keys, S } = mk(), d = dev(); S.setNow(D0 + 29 * 60000 + 10000); reg(S, keys, d, [M(30), M(31), M(32)]); S.st.slept = 0; S.X.pushTick();
  chk('three phones/times in a row: one tick sends only the coming minute', S.st.fetches.length === 1 && JSON.parse(S.props['pu_' + d]).w.join() === [M(31), M(32)].join()); }
{ const { keys, S } = mk(); S.setNow(D0 + 29 * 60000 + 20000); const ds = [dev(), dev(), dev()]; ds.forEach(d => reg(S, keys, d, [M(30)])); S.st.fetches.length = 0; S.X.pushTick();
  chk('three phones with the same minute → three pushes in the one wait', S.st.fetches.length === 3 && S.st.sleeps === 1, { f: S.st.fetches.length, s: S.st.sleeps }); }
// the daily limit on waiting: 40 minutes
{ const { keys, S } = mk(), d = dev(); S.setNow(D0 + 29 * 60000 + 0);
  let naps = 0, ok; do { ok = S.X.pushNap_(60000); if (ok) naps++; } while (ok && naps < 100);
  chk('waiting is limited per day (40 × 60 s)', naps === 40, naps);
  reg(S, keys, d, [M(30)]); S.st.slept = 0; S.X.pushTick();
  chk('past the limit: no waiting, nothing sent yet (the plain once-a-minute timing)', S.st.slept === 0 && S.st.fetches.length === 0);
  S.setNow(D0 + 30 * 60000 + 3000); S.X.pushTick(); chk('…and the next tick sends it', S.st.fetches.length === 1);
  S.setNow(D0 + 86400000 + 29 * 60000 + 10000); chk('the next day the limit starts again', S.X.pushNap_(30000) === true); }
// a code that was stopped must not wake the phone, even though the wait is spent
{ const { keys, S } = mk(), d = dev(); const tk = require('./gas.js').makeToken(keys, { v: 2, p: 'r', i: 'STOPPED1', c: D0 - 1000, m: 0, s: 'a' }); S.setNow(D0 + 29 * 60000 + 30000);
  let r = S.call({ a: 'preg', d, ep: EP, w: b36([M(30)]), tk }); S.props['r_STOPPED1'] = String(D0 + 1e12); S.st.fetches.length = 0; S.X.pushTick();
  chk('stopped code with a time next minute → nothing is sent, the phone is dropped', S.st.fetches.length === 0 && !('pu_' + d in S.props), r); }
// the push service answers an error during the wait-send: retried by the next tick
{ const { keys, S } = mk(), d = dev(); S.setNow(D0 + 29 * 60000 + 30000); reg(S, keys, d, [M(30)]); S.st.handler = () => ({ code: 503, body: 'busy' }); S.X.pushTick();
  chk('503 from the push service → the time stays for the next tick', JSON.parse(S.props['pu_' + d]).w.join() === String(M(30)));
  S.st.handler = () => ({ code: 201, body: '' }); S.setNow(D0 + 30 * 60000 + 10000); S.X.pushTick(); chk('…and the next tick sends it', JSON.parse(S.props['pu_' + d]).w.length === 0); }
console.log(`${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
