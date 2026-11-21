// usage: DEVPW='…' node tools/packdev.mjs <keys.json> <vault.json>
// Re-encrypts the developer blob (what the developer password unlocks) so that, besides the signing key, it also holds the two program keys
// (kt = demo program, kc = real program) and the code-server admin key. The signing key pair itself is kept unchanged.
import { webcrypto as c } from 'node:crypto';
import fs from 'node:fs';
const [, , kf, vf] = process.argv, pw = process.env.DEVPW;
if (!pw || !kf || !vf) { console.error('need DEVPW, <keys.json> <vault.json>'); process.exit(1); }
const K = JSON.parse(fs.readFileSync(kf, 'utf8')), V = JSON.parse(fs.readFileSync(vf, 'utf8'));
const u = s => new Uint8Array(Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
const b = x => Buffer.from(x).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const mat = await c.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
const dk = (salt, it, use) => c.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: it, hash: 'SHA-256' }, mat, { name: 'AES-GCM', length: 256 }, false, [use]);
const o = JSON.parse(new TextDecoder().decode(await c.subtle.decrypt({ name: 'AES-GCM', iv: u(K.dev.iv) }, await dk(u(K.dev.s), K.dev.it, 'decrypt'), u(K.dev.c))));
const jwk = o.kty ? o : o.k;
const plain = { k: jwk, kc: V.kc, kt: V.kt, ak: V.srvkey || '' };
const salt = c.getRandomValues(new Uint8Array(16)), iv = c.getRandomValues(new Uint8Array(12)), it = K.dev.it;
const ct = new Uint8Array(await c.subtle.encrypt({ name: 'AES-GCM', iv }, await dk(salt, it, 'encrypt'), new TextEncoder().encode(JSON.stringify(plain))));
fs.writeFileSync(kf, JSON.stringify({ pub: K.pub, dev: { it, s: b(salt), iv: b(iv), c: b(ct) } }));
console.log('packed keys into', kf);
