'use strict';
/* Small crypto helpers shared by the app (main process) and the developer tools.
   Only Node's built-in crypto is used: ECDSA P-256 / SHA-256 signatures, AES-256-GCM sealing, HKDF. */
const crypto = require('crypto');

const b64u = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = s => {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('BAD_B64');
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
};

function genKeyPair() {
  return crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
}

/* every signature is bound to a purpose string, so a licence signature can never pass as an update signature */
const sigInput = (purpose, data) => Buffer.concat([Buffer.from(purpose + '\n', 'utf8'), Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8')]);
function sign(purpose, text, privatePem) {
  return b64u(crypto.sign('sha256', sigInput(purpose, text), { key: privatePem, dsaEncoding: 'ieee-p1363' }));
}
function verify(purpose, text, sigB64u, publicPem) {
  try {
    const sig = fromB64u(sigB64u);
    if (sig.length !== 64) return false;
    return crypto.verify('sha256', sigInput(purpose, text), { key: publicPem, dsaEncoding: 'ieee-p1363' }, sig);
  } catch (e) { return false; }
}

/* AES-256-GCM: output = iv(12) | tag(16) | ciphertext */
function seal(key, plain, aad) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('BAD_KEY');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  if (aad) c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
}
function open(key, blob, aad) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('BAD_KEY');
  if (!Buffer.isBuffer(blob) || blob.length < 29) throw new Error('BAD_BLOB');
  const d = crypto.createDecipheriv('aes-256-gcm', key, blob.subarray(0, 12));
  d.setAuthTag(blob.subarray(12, 28));
  if (aad) d.setAAD(Buffer.from(aad));
  return Buffer.concat([d.update(blob.subarray(28)), d.final()]);
}

const hkdf = (ikm, salt, info) => Buffer.from(crypto.hkdfSync('sha256', Buffer.from(ikm), Buffer.from(salt), Buffer.from(info), 32));
const sha256hex = data => crypto.createHash('sha256').update(data).digest('hex');
const hmacHex = (key, data) => crypto.createHmac('sha256', key).update(data).digest('hex');
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

/* numeric a.b.c versions only (no pre-release tags): returns -1 / 0 / 1, or null when either is malformed */
function cmpVer(a, b) {
  const p = v => { const m = /^(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/.exec(String(v)); return m ? [+m[1], +m[2], +m[3]] : null; };
  const x = p(a), y = p(b);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

module.exports = { b64u, fromB64u, genKeyPair, sign, verify, seal, open, hkdf, sha256hex, hmacHex, safeEq, cmpVer };
