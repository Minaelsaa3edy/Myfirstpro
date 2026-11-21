'use strict';
/* A vault holds secrets (private keys, payload key) sealed with AES-256-GCM under a key derived (scrypt) from the developer password.
   Used by the build tools, and by the Developer build's code generator (which opens the vault only after the password is typed). */
const crypto = require('crypto');
const cu = require('./cu');

const NEW = { N: 1 << 17, r: 8, p: 1 }; /* 128 MiB / ~0.3 s per guess: a strong password cannot be guessed offline */
const MAXMEM = 320 * 1024 * 1024;
const AAD = 'MPD-VAULT-v1';
const okParams = v => v && Number.isInteger(v.N) && v.N >= (1 << 14) && v.N <= (1 << 18) && (v.N & (v.N - 1)) === 0 && v.r === 8 && v.p === 1;
const opts = P => ({ N: P.N, r: P.r, p: P.p, maxmem: MAXMEM });

function create(password, secrets) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 32, opts(NEW));
  const blob = cu.seal(key, Buffer.from(JSON.stringify(secrets)), AAD);
  return { v: 1, kdf: 'scrypt', N: NEW.N, r: NEW.r, p: NEW.p, salt: cu.b64u(salt), ct: cu.b64u(blob) };
}
const unseal = (vault, key) => {
  try { return JSON.parse(cu.open(key, cu.fromB64u(vault.ct), AAD).toString()); }
  catch (e) { throw new Error('wrong password or damaged vault'); }
};
const check = vault => { if (!vault || vault.v !== 1 || vault.kdf !== 'scrypt' || !okParams(vault) || typeof vault.salt !== 'string' || typeof vault.ct !== 'string') throw new Error('bad vault'); };
function open(vault, password) {
  check(vault);
  return unseal(vault, crypto.scryptSync(String(password), cu.fromB64u(vault.salt), 32, opts(vault)));
}
function openAsync(vault, password) { /* does not freeze the window while the (deliberately slow) key derivation runs */
  return new Promise((res, rej) => {
    try { check(vault); } catch (e) { return rej(e); }
    crypto.scrypt(String(password), cu.fromB64u(vault.salt), 32, opts(vault), (err, key) => {
      if (err) return rej(err);
      try { res(unseal(vault, key)); } catch (e) { rej(e); }
    });
  });
}
const fingerprint = pem => crypto.createHash('sha256').update(pem).digest('hex').slice(0, 16).toUpperCase().match(/.{4}/g).join('-');
module.exports = { create, open, openAsync, fingerprint };
