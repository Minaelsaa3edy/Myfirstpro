// usage: DEVPW='...' node tools/mkkeys.mjs <out.json>
// Makes an ECDSA P-256 key pair. The PUBLIC key goes into the trial build (it can only verify).
// The PRIVATE key is encrypted with a key derived from the developer password (PBKDF2-SHA256 250k + AES-GCM)
// and baked into the main app: nobody can sign a trial link without the password; the password itself is never stored.
import { webcrypto as c } from 'node:crypto';
import fs from 'node:fs';
const pw = process.env.DEVPW, out = process.argv[2];
if (!pw || pw.length < 4 || !out) { console.error('need DEVPW (4+ chars) and an output path'); process.exit(1); }
const b64u = u => Buffer.from(u).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const kp = await c.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pubFull = await c.subtle.exportKey('jwk', kp.publicKey), priv = await c.subtle.exportKey('jwk', kp.privateKey);
const pub = { kty: pubFull.kty, crv: pubFull.crv, x: pubFull.x, y: pubFull.y };
const salt = c.getRandomValues(new Uint8Array(16)), iv = c.getRandomValues(new Uint8Array(12)), it = 250000;
const mat = await c.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
const key = await c.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: it, hash: 'SHA-256' }, mat, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const ct = new Uint8Array(await c.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(priv))));
fs.writeFileSync(out, JSON.stringify({ pub, dev: { it, s: b64u(salt), iv: b64u(iv), c: b64u(ct) } }));
console.log('keys written to', out);
