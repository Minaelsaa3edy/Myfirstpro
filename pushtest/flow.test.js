const crypto = require('crypto'); const { makeKeys, makeServer, makeToken, b64u, unb64u } = require('./gas.js');
const TPL = '/home/claude/accounts-app/tools/server.gs.tpl';
const res = []; const chk = (n, c, extra) => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (c && extra === undefined ? '' : extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); };
const keys = makeKeys(); const S = makeServer(TPL, keys); const { call, st, props } = S;
const T0 = Date.UTC(2026, 10, 15, 10, 0, 0); S.setNow(T0); const nm0 = Math.floor(T0 / 60000);
const EP = 'https://fcm.googleapis.com/fcm/send/abcDEF123456:APA91bExampleToken_xyz-123';
const dev = () => b64u(crypto.randomBytes(12));
const b36 = a => a.map(m => m.toString(36)).join('.');
const tok = (o) => makeToken(keys, Object.assign({ v: 2, p: 'r', i: 'TID' + crypto.randomBytes(3).toString('hex'), c: T0 - 1000, m: 0, s: 'a' }, o || {}));
// --- public key
{ const r = call({ a: 'pk' }); chk('pk returns the VAPID public key', r.ok === 1 && r.pk === keys.vapPub && r.v === 3, r.pk && r.pk.length); }
// --- registration: who may
{ const d = dev(); let r = call({ a: 'preg', d, ep: EP, w: b36([nm0 + 5]) });
  chk('no credentials → refused', r.ok === 0 && r.e === 'auth', r);
  r = call({ a: 'preg', d, ep: EP, w: b36([nm0 + 5]), ak: 'wrong' }); chk('wrong admin key → refused', r.e === 'key', r);
  r = call({ a: 'preg', d, ep: EP, w: b36([nm0 + 9, nm0 + 5]), ak: keys.admin }); chk('admin key → registered, times sorted', r.ok === 1 && r.n === 2 && JSON.parse(props['pu_' + d]).w.join() === [nm0 + 5, nm0 + 9].join(), r);
  r = call({ a: 'preg', d, ep: 'https://evil.example.com/fcm/send/aaaaaaaaaaaa', w: b36([nm0 + 5]), ak: keys.admin }); chk('address of another site → refused', r.e === 'endpoint', r);
  r = call({ a: 'preg', d, ep: 'http://fcm.googleapis.com/fcm/send/aaaaaaaaaaaa', w: '', ak: keys.admin }); chk('plain http → refused', r.e === 'endpoint', r);
  r = call({ a: 'preg', d, ep: 'https://fcm.googleapis.com.evil.com/fcm/send/aaaaaaaaaaaa', w: '', ak: keys.admin }); chk('look-alike host → refused', r.e === 'endpoint', r);
  r = call({ a: 'preg', d, ep: 'https://evil.com/?x=https://fcm.googleapis.com/fcm/send/aaaaaaaaaa', w: '', ak: keys.admin }); chk('host hidden in the query → refused', r.e === 'endpoint', r);
  for (const ep of ['https://updates.push.services.mozilla.com/wpush/v2/gAAAAABexample', 'https://web.push.apple.com/QGexampleexampleexample', 'https://wns2-par02p.notify.windows.com/w/?token=BQYAAAexample', 'https://jmt17.google.com/x']) { const r2 = call({ a: 'preg', d: dev(), ep, w: '', ak: keys.admin }); chk('endpoint ' + ep.slice(8, 40), (r2.ok === 1) === !/jmt17/.test(ep), r2); }
  r = call({ a: 'preg', d: 'short', ep: EP, ak: keys.admin }); chk('bad device id → refused', r.e === 'device', r);
  r = call({ a: 'preg', d: 'x'.repeat(40), ep: EP, ak: keys.admin }); chk('too long device id → refused', r.e === 'device', r); }
// --- registration with a code's token
{ const t1 = tok(), d = dev();
  let r = call({ a: 'preg', d, ep: EP, w: b36([nm0 + 3]), tk: t1 }); chk('genuine real-program token → registered', r.ok === 1 && JSON.parse(props['pu_' + d]).i.length > 3, r);
  const wrong = makeKeys(); r = call({ a: 'preg', d: dev(), ep: EP, w: '', tk: makeToken(wrong, { v: 2, p: 'r', i: 'FAKE1234', c: 1, m: 0, s: 'a' }) }); chk('token signed by someone else → refused', r.e === 'auth', r);
  r = call({ a: 'preg', d: dev(), ep: EP, w: '', tk: tok({ p: 'd' }) }); chk('trial-type token → refused', r.e === 'auth', r);
  r = call({ a: 'preg', d: dev(), ep: EP, w: '', tk: tok({ v: 1 }) }); chk('old token version → refused', r.e === 'auth', r);
  const [pl, sg] = t1.split('.'); const forged = b64u(Buffer.from(JSON.stringify(Object.assign(JSON.parse(unb64u(pl).toString()), { m: 0, i: 'OTHERTID' })))) + '.' + sg; r = call({ a: 'preg', d: dev(), ep: EP, w: '', tk: forged }); chk('edited token → refused', r.e === 'auth', r);
  r = call({ a: 'preg', d: dev(), ep: EP, w: '', tk: 'garbage' }); chk('garbage token → refused', r.e === 'auth', r);
  const tid = 'REVK' + crypto.randomBytes(2).toString('hex'); props['r_' + tid] = String(T0 + 86400000); r = call({ a: 'preg', d: dev(), ep: EP, w: '', tk: tok({ i: tid }) }); chk('stopped code → refused', r.e === 'revoked', r);
  r = call({ a: 'preg', d: dev(), ep: EP, w: '', tk: tok({ i: 'EXPR' + crypto.randomBytes(2).toString('hex'), m: 60, c: T0 - 3 * 3600000 }) }); chk('finished code → refused', r.e === 'expired', r);
  r = call({ a: 'preg', d: dev(), ep: EP, w: '', tk: tok({ i: 'LIVE' + crypto.randomBytes(2).toString('hex'), m: 600, c: T0 - 3600000 }) }); chk('running timed code → accepted', r.ok === 1, r);
  // a code that starts at first use and has not been seen is not "finished"
  r = call({ a: 'preg', d: dev(), ep: EP, w: '', tk: tok({ i: 'FRST' + crypto.randomBytes(2).toString('hex'), m: 60, s: 'r', c: T0 - 99 * 3600000 }) }); chk('first-use timed code never opened yet → accepted', r.ok === 1, r);
  const tid2 = 'SEEN' + crypto.randomBytes(2).toString('hex'); props['o_' + tid2] = JSON.stringify({ e: T0 - 5000, l: T0 - 9000 }); r = call({ a: 'preg', d: dev(), ep: EP, w: '', tk: tok({ i: tid2, m: 60, s: 'r' }) }); chk('first-use code whose end has passed → refused', r.e === 'expired', r); }
// --- caps
{ const tid = 'CAPS' + crypto.randomBytes(2).toString('hex'), ds = []; const tk = tok({ i: tid });
  for (let i = 0; i < 7; i++) { S.setNow(T0 + i * 1000); const d = dev(); ds.push(d); call({ a: 'preg', d, ep: EP, w: '', tk }); }
  S.setNow(T0); const alive = ds.filter(d => props['pu_' + d]); chk('one code keeps at most 5 phones (oldest dropped)', alive.length === 5 && !props['pu_' + ds[0]] && !props['pu_' + ds[1]] && !!props['pu_' + ds[6]], alive.length);
  const many = []; for (let i = 0; i < 300; i++) many.push(nm0 + 10 + i); const d = dev(); const r = call({ a: 'preg', d, ep: EP, w: b36(many), ak: keys.admin }); chk('at most 150 times kept per phone', r.ok === 1 && r.n === 150, r.n);
  const r2 = call({ a: 'preg', d: dev(), ep: EP, w: '0.-5.abc.zz!.' + b36([nm0 + 1]), ak: keys.admin }); chk('junk entries in the times list are ignored', r2.ok === 1, r2);
  // fill to the server limit
  for (const k of Object.keys(props)) if (k.indexOf('pu_') === 0) delete props[k]; for (let i = 0; i < 150; i++) props['pu_' + 'f'.repeat(15) + i.toString().padStart(3, '0')] = JSON.stringify({ e: EP, i: 'x' + i, w: [], u: T0, c: T0, lt: 0 });
  const rf = call({ a: 'preg', d: dev(), ep: EP, w: '', ak: keys.admin }); chk('server full → refused', rf.e === 'full', rf);
  const exist = 'pu_' + 'f'.repeat(15) + '000'; const rf2 = call({ a: 'preg', d: 'f'.repeat(15) + '000', ep: EP, w: b36([nm0 + 2]), ak: keys.admin }); chk('a phone already known can still update when full', rf2.ok === 1, rf2);
  for (const k of Object.keys(props)) if (k.indexOf('pu_') === 0) delete props[k]; }
// --- unregister / test
{ const d = dev(); call({ a: 'preg', d, ep: EP, w: '', ak: keys.admin }); let r = call({ a: 'punreg', d }); chk('punreg removes the phone', r.ok === 1 && !props['pu_' + d], r);
  r = call({ a: 'ptest', d: dev() }); chk('test for an unknown phone → unknown', r.e === 'unknown', r);
  call({ a: 'preg', d, ep: EP, w: '', ak: keys.admin }); st.fetches.length = 0; st.handler = () => ({ code: 201, body: '' });
  r = call({ a: 'ptest', d }); chk('test sends one push and reports the answer', r.ok === 1 && r.c === 201 && st.fetches.length === 1, r);
  const q = st.fetches[0]; const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(q.headers.Authorization);
  chk('request is an empty POST with TTL and urgency', q.url === EP && q.method === 'post' && q.payload === '' && q.headers.TTL === '600' && q.headers.Urgency === 'high' && !!m, q.headers);
  if (m) { const hd = JSON.parse(unb64u(m[1])), cl = JSON.parse(unb64u(m[2])); const pub = Buffer.from(unb64u(keys.vapPub));
    const pk = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33)) }, format: 'jwk' });
    chk('VAPID signature verifies with the public key (Node crypto)', crypto.verify('sha256', Buffer.from(m[1] + '.' + m[2]), { key: pk, dsaEncoding: 'ieee-p1363' }, unb64u(m[3])));
    chk('VAPID claims: aud = push service, exp ≤ 24 h, sub = site', hd.alg === 'ES256' && cl.aud === 'https://fcm.googleapis.com' && cl.exp > T0 / 1000 + 3600 && cl.exp <= T0 / 1000 + 86400 && /^https:\/\//.test(cl.sub), cl);
    chk('k= is the public key', m[4] === keys.vapPub); }
  r = call({ a: 'ptest', d }); chk('second test within 15 s → rate', r.e === 'rate', r);
  S.setNow(T0 + 20000); st.handler = () => ({ code: 410, body: 'gone' }); r = call({ a: 'ptest', d }); chk('410 → phone forgotten', r.c === 410 && !props['pu_' + d], r); S.setNow(T0); }
// --- the minute tick
const reg = (w, who) => { const d = dev(); call(Object.assign({ a: 'preg', d, ep: EP, w: b36(w) }, who || { tk: tok() })); return d; }; // every phone gets its own code, like real life (one code keeps at most 5 phones)
const rec = d => props['pu_' + d] ? JSON.parse(props['pu_' + d]) : null;
for (const k of Object.keys(props)) if (k.indexOf('pu_') === 0) delete props[k];
{ // due now → sent once, then removed from list; future kept
  const d = reg([nm0 + 1, nm0 + 60]); S.setNow(T0 + 60000); st.fetches.length = 0; st.handler = () => ({ code: 201, body: '' });
  S.X.pushTick(); chk('alarm minute reached → one push', st.fetches.length === 1 && st.fetches[0].url === EP, st.fetches.length); chk('sent time removed, later time kept', rec(d).w.join() === String(nm0 + 60), rec(d).w);
  st.fetches.length = 0; S.setNow(T0 + 90000); S.X.pushTick(); chk('same minute again → nothing sent', st.fetches.length === 0); }
{ // two phones, one tick → both sent (batch)
  for (const k of Object.keys(props)) if (k.indexOf('pu_') === 0) delete props[k];
  const ds = []; for (let i = 0; i < 65; i++) ds.push(reg([nm0 + 1])); S.setNow(T0 + 60000); st.fetches.length = 0; S.X.pushTick(); chk('65 phones due → 65 pushes (in chunks of 30)', st.fetches.length === 65 && ds.every(d => rec(d).w.length === 0), st.fetches.length); }
{ // 404 / 410 / 400 / 401 / 403 → forgotten; 429 / 500 / no answer → retried; late → dropped
  for (const k of Object.keys(props)) if (k.indexOf('pu_') === 0) delete props[k];
  const codes = { gone404: 404, gone410: 410, bad400: 400, bad401: 401, bad403: 403, busy429: 429, err500: 500, none0: 'throw' }; const D = {}; for (const n in codes) D[n] = reg([nm0 + 1, nm0 + 100]);
  const epOf = {}; // every phone has the same endpoint here, so answer by call order
  const order = Object.keys(codes); let i = 0; st.handler = () => { const c = codes[order[i++ % order.length]]; return c === 'throw' ? new Error('Exception: DNS error') : { code: c, body: 'x' }; };
  S.setNow(T0 + 60000); S.X.pushTick();
  const gone = n => !rec(D[n]); chk('404/410/400/401/403 → phone forgotten', ['gone404', 'gone410', 'bad400', 'bad401', 'bad403'].every(gone));
  chk('429/500/no answer → kept and the alarm is kept for another try', ['busy429', 'err500', 'none0'].every(n => rec(D[n]) && rec(D[n]).w.includes(nm0 + 1)));
  st.fetches.length = 0; st.handler = () => ({ code: 201 }); S.setNow(T0 + 2 * 60000); S.X.pushTick(); chk('retry next minute succeeds and clears it', ['busy429', 'err500', 'none0'].every(n => rec(D[n]).w.join() === String(nm0 + 100)) && st.fetches.length === 3, st.fetches.length);
  // dropped when too late
  const dl = reg([nm0 + 200]); S.setNow(T0 + 206 * 60000); st.fetches.length = 0; S.X.pushTick(); chk('alarm 6 minutes late is not pushed', st.fetches.length === 0 && rec(dl).w.length === 0, st.fetches.length);
  const dl2 = reg([nm0 + 300]); S.setNow(T0 + 305 * 60000); st.fetches.length = 0; S.X.pushTick(); chk('alarm 5 minutes late still is', st.fetches.length === 1, st.fetches.length); }
{ // fetchAll throws → falls back to single fetches
  for (const k of Object.keys(props)) if (k.indexOf('pu_') === 0) delete props[k]; const d = reg([nm0 + 400]); S.setNow(T0 + 400 * 60000); st.fetchAllThrows = true; st.fetches.length = 0; st.handler = () => ({ code: 201 }); S.X.pushTick(); st.fetchAllThrows = false; chk('fetchAll failure → single fetch fallback works', st.fetches.length === 1 && rec(d).w.length === 0); }
{ // stopped code stops its phones; admin phones unaffected
  for (const k of Object.keys(props)) if (k.indexOf('pu_') === 0) delete props[k]; const tid = 'STOP' + crypto.randomBytes(2).toString('hex'); const d1 = reg([nm0 + 500], { tk: tok({ i: tid }) }), d2 = reg([nm0 + 500]);
  props['r_' + tid] = String(T0 + 600 * 60000 + 86400000); S.setNow(T0 + 500 * 60000); st.fetches.length = 0; S.X.pushTick(); chk('code stopped after registering → its phone is dropped and not pushed', !rec(d1) && st.fetches.length === 1 && !!rec(d2) || (!rec(d1) && st.fetches.length === 1), st.fetches.length); }
{ // a code that ends while the phone is registered stops pushing by itself
  for (const k of Object.keys(props)) if (k.indexOf('pu_') === 0) delete props[k]; const tid = 'ENDS' + crypto.randomBytes(2).toString('hex'); S.setNow(T0);
  const d = reg([nm0 + 10, nm0 + 45], { tk: tok({ i: tid, m: 60, s: 'a', c: T0 - 30 * 60000 }) }); st.handler = () => ({ code: 201 });
  S.setNow(T0 + 10 * 60000); st.fetches.length = 0; S.X.pushTick(); chk('code still alive → pushed', st.fetches.length === 1 && rec(d).w.join() === String(nm0 + 45), st.fetches.length);
  S.setNow(T0 + 45 * 60000); st.fetches.length = 0; S.X.pushTick(); chk('code ended meanwhile → not pushed and the phone is forgotten', st.fetches.length === 0 && !rec(d), st.fetches.length); }
{ // a first-use code ends when its program reports the end
  for (const k of Object.keys(props)) if (k.indexOf('pu_') === 0) delete props[k]; const tid = 'FUSE' + crypto.randomBytes(2).toString('hex'); S.setNow(T0);
  const d = reg([nm0 + 20], { tk: tok({ i: tid, m: 60, s: 'r', c: T0 - 99 * 3600000 }) }); props['o_' + tid] = JSON.stringify({ e: T0 + 5 * 60000, l: T0 });
  S.setNow(T0 + 20 * 60000); st.fetches.length = 0; S.X.pushTick(); chk('first-use code past its reported end → not pushed', st.fetches.length === 0 && !rec(d)); }
{ // log + plog
  const r = call({ a: 'plog', k: keys.admin }); chk('plog needs the admin key', call({ a: 'plog' }).e === 'key'); chk('plog lists devices and the last sends', r.ok === 1 && Array.isArray(r.log) && r.log.length > 0 && r.log.length <= 40 && typeof r.devices === 'number', r.log.length);
  chk('log has no endpoint / secrets', !JSON.stringify(r).includes('fcm.googleapis') && !JSON.stringify(r).includes(keys.vapPriv));
  chk('chk reports push on', call({ a: 'chk', k: keys.admin }).push === 1); }
{ // jwt reuse (one signature per service per 12 h)
  for (const k of Object.keys(props)) if (k.indexOf('pu_') === 0) delete props[k]; const a = reg([nm0 + 700]), b = reg([nm0 + 700]); S.setNow(T0 + 700 * 60000); st.fetches.length = 0; S.X.pushTick(); const t = st.fetches.map(f => f.headers.Authorization.split(',')[0]); chk('the signed pass is reused across phones of one service', t.length === 2 && t[0] === t[1]); }
// --- pushSetup
{ st.triggers.length = 0; const r = S.X.pushSetup(); chk('pushSetup makes the 1-minute trigger', r === 'ok' && st.triggers.length === 1 && st.triggers[0].fn === 'pushTick' && st.triggers[0].every === 1);
  S.X.pushSetup(); chk('pushSetup twice → still one trigger', st.triggers.length === 1);
  const bad = makeServer(TPL, Object.assign({}, keys, { vapPub: makeKeys().vapPub })); let err = ''; try { bad.X.pushSetup(); } catch (e) { err = e.message; } chk('mismatched key pair is caught by pushSetup', /do not match/.test(err), err); }
// --- built without push keys: everything else still works, push says no
{ const n = makeServer(TPL, keys, { noKeys: true }); const c = n.call;
  chk('without keys: pk says nopush', c({ a: 'pk' }).e === 'nopush'); chk('without keys: preg says nopush', c({ a: 'preg', d: dev(), ep: EP, ak: keys.admin }).e === 'nopush');
  chk('without keys: chk works and push=0', (r => r.ok === 1 && r.push === 0)(c({ a: 'chk', k: keys.admin })));
  chk('without keys: ping/slot/rv still work', c({ a: 'ping' }).ok === 1 && c({ a: 'slot', id: 'AB12' }).slot === null && c({ a: 'rv' }).ok === 1);
  n.X.pushTick(); chk('without keys: pushTick does nothing', n.st.fetches.length === 0); }
// --- the old server behaviour is unchanged
{ const k = keys.admin; chk('put/list/stop still work', (() => { const slot = JSON.stringify({ s: 'a', iv: 'b', c: 'c' }); const r1 = call({ a: 'put', id: 'AB12', slot, k }), r2 = call({ a: 'stop', i: 'TIDX1234', k }), r3 = call({ a: 'list', k }); return r1.ok === 1 && r2.ok === 1 && r3.ok === 1 && r3.rv.some(x => x.i === 'TIDX1234'); })()); chk('designer actions still need the key', call({ a: 'list' }).e === 'key' && call({ a: 'list', k: 'x' }).e === 'key'); }
console.log(res.filter(x => x).length + '/' + res.length + ' passed'); process.exit(res.every(x => x) ? 0 : 1);
