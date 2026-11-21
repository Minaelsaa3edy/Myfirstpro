const crypto = require('crypto'); const { makeKeys, makeServer, b64u, unb64u } = require('./gas.js');
const TPL = '/home/claude/accounts-app/tools/server.gs.tpl';
const res = []; const chk = (n, c, extra) => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); };
const keys = makeKeys(); const S = makeServer(TPL, keys); const X = S.X;
const hex = b => Buffer.from(b).toString('hex');
// 1) RFC 6979 appendix A.2.5 (P-256, SHA-256, message "sample")
{ const d = BigInt('0xC9AFA9D845BA75166B5C215767B1D6934E50C3DB36E89B127B8A622B120F6721'); const sig = X.ecSign_(d, Array.from(Buffer.from('sample')));
  chk('RFC 6979 test vector (r)', hex(sig.slice(0, 32)) === 'efd48b2aacb6a8fd1140dd9cd45e81d69d2c877b56aaf991c34d0ea84eaf3716', hex(sig.slice(0, 32)));
  chk('RFC 6979 test vector (s)', hex(sig.slice(32)) === 'f7cb1c942d657c41d436c7a1b6e29f65f3e900dbb9aff4064dc4ab2f843acda8', hex(sig.slice(32))); }
// 2) public key from private key = what Node computes
{ let ok = true; for (let i = 0; i < 25; i++) { const e = crypto.createECDH('prime256v1'); e.generateKeys(); const d = BigInt('0x' + e.getPrivateKey().toString('hex')); const pt = X.ecAff_(X.ecMulJ_(d, X.EC_G)); const pub = Buffer.concat([Buffer.from([4]), Buffer.from(X.bytes_(pt[0], 32)), Buffer.from(X.bytes_(pt[1], 32))]); if (!pub.equals(e.getPublicKey())) ok = false; } chk('25 random keys: public key matches Node', ok); }
// 3) our signature is accepted by Node, Node's by ours; tampering rejected
{ let a = 0, b = 0, t = 0, n = 25;
  for (let i = 0; i < n; i++) {
    const kp = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }), jw = kp.privateKey.export({ format: 'jwk' }), msg = crypto.randomBytes(1 + Math.floor(Math.random() * 300));
    const sig = Buffer.from(X.ecSign_(BigInt('0x' + unb64u(jw.d).toString('hex')), Array.from(msg)));
    if (crypto.verify('sha256', msg, { key: kp.publicKey, dsaEncoding: 'ieee-p1363' }, sig)) a++;
    const nsig = crypto.sign('sha256', msg, { key: kp.privateKey, dsaEncoding: 'ieee-p1363' }), Q = [BigInt('0x' + unb64u(jw.x).toString('hex')), BigInt('0x' + unb64u(jw.y).toString('hex'))];
    if (X.ecVerify_(Array.from(nsig), Array.from(msg), Q)) b++;
    const bad = Buffer.from(msg); bad[0] ^= 1; if (!X.ecVerify_(Array.from(nsig), Array.from(bad), Q) && !X.ecVerify_(Array.from(nsig), Array.from(msg), [Q[0], Q[1] ^ 1n])) t++;
  }
  chk('Node accepts 25/25 of our signatures', a === n, a); chk('we accept 25/25 of Node signatures', b === n, b); chk('altered message / wrong key are rejected 25/25', t === n, t); }
// 4) timing: one signature and one verify
{ const t0 = Date.now(); for (let i = 0; i < 10; i++) X.ecSign_(5n + BigInt(i), [1, 2, 3]); const ms = (Date.now() - t0) / 10; chk('a signature takes well under a second', ms < 500, Math.round(ms) + ' ms'); }
console.log(res.filter(x => x).length + '/' + res.length + ' passed');
