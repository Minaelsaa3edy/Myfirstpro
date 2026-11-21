// Seals a finished page (AES-256-GCM) inside a tiny login page, so it can sit on a PUBLIC host (GitHub Pages)
// and still reveal nothing without a code / password.
//   gate page (customers, any code):  node tools/seal.mjs --kind gate --out index.html --vid ID --srv URL
//                                       --blob d:demo.html:KEY --blob r:real.html:KEY      (KEY = base64url 32 bytes; d = demo program, r = real program)
//   developer page:                   node tools/seal.mjs --kind dev --in page.html --out dev.html --vid ID --k KEY --passenv NAME [--iters N]
// The code server (Apps Script web app, --srv) holds the short-code slots. Content keys are kept stable between releases so devices that already unlocked keep working.
import { webcrypto as c } from 'node:crypto';
import fs from 'node:fs';
const args = process.argv.slice(2), A = {}, blobs = [];
for (let i = 0; i < args.length; i++) { if (!args[i].startsWith('--')) continue; const k = args[i].slice(2), v = args[i + 1]; i++; if (k === 'blob') blobs.push(v); else A[k] = v; }
const die = m => { console.error('seal:', m); process.exit(1); };
if (!['gate', 'dev'].includes(A.kind) || !A.out || !A.vid) die('need --kind gate|dev --out --vid');
const b64u = u => Buffer.from(u).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => new Uint8Array(Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
const rnd = n => c.getRandomValues(new Uint8Array(n));
async function seal(file, kb) { /* -> {iv, ct} */
  const K = unb64u(kb); if (K.length !== 32) die('keys must be 32 bytes (base64url)');
  const iv = rnd(12), key = await c.subtle.importKey('raw', K, 'AES-GCM', false, ['encrypt']);
  return { iv: b64u(iv), ct: b64u(new Uint8Array(await c.subtle.encrypt({ name: 'AES-GCM', iv }, key, fs.readFileSync(file)))) };
}
async function wrap(secret, K, it) {
  const s = rnd(16), iv = rnd(12);
  const mat = await c.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveKey']);
  const wk = await c.subtle.deriveKey({ name: 'PBKDF2', salt: s, iterations: it, hash: 'SHA-256' }, mat, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  return { s: b64u(s), iv: b64u(iv), c: b64u(new Uint8Array(await c.subtle.encrypt({ name: 'AES-GCM', iv }, wk, K))), it };
}
let D;
if (A.kind === 'gate') {
  if (!A.srv || !/^(https:\/\/[\w./-]+|http:\/\/(localhost|127\.0\.0\.1):\d+\/[\w./-]*)$/.test(A.srv)) die('gate pages need --srv (https URL of the code server; http only for localhost tests)');
  D = { vid: A.vid, kind: 'gate', b: {}, srv: A.srv };
  for (const x of blobs) { const [p, file, kb] = x.split(':'); if (!['d', 'r'].includes(p) || !file || !kb) die('--blob must be d|r:FILE:KEY'); D.b[p] = await seal(file, kb); }
  if (!D.b.d || !D.b.r) die('need both --blob d:… and --blob r:…');
} else {
  if (!A.in || !A.k || !(A.passenv || A['pass-from'])) die('dev pages need --in --k and --passenv (a new password slot) or --pass-from OLD_dev.html (keep the password slot of the page already published, without needing the password)');
  let pass;
  if (A['pass-from']) { /* same content key => the old password slot still opens the new page; proven here by opening the old page with the key */
    const m = /\nconst D = (\{.*\});\n/.exec(fs.readFileSync(A['pass-from'], 'utf8')); if (!m) die('cannot read the old page');
    const old = JSON.parse(m[1]); if (!old.pass || old.kind !== 'dev' || old.vid !== A.vid) die('the old page is not a developer page with this id');
    try { await c.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(old.iv) }, await c.subtle.importKey('raw', unb64u(A.k), 'AES-GCM', false, ['decrypt']), unb64u(old.ct)); } catch (e) { die('the content key does not open the old page, so its password slot cannot be kept (use --passenv)'); }
    pass = old.pass;
  } else { const pw = process.env[A.passenv]; if (!pw || pw.length < 12) die(`${A.passenv} must hold a password of 12+ characters`); pass = await wrap(pw, unb64u(A.k), +A.iters || 600000); }
  D = Object.assign({ vid: A.vid, kind: 'dev' }, await seal(A.in, A.k), { slots: [], pass });
}
const rd = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const VERSION = rd('../version.txt').trim();
/* the host page: animated glass gate (shared scene/css/mark from src/), the program version in its footer, then the sealed data last */
const tpl = rd('./loader.html').replace('@@SCENE_CSS@@', () => rd('../src/scene.css')).replace('@@SCENE@@', () => rd('../src/scene.html').trim()).replace('@@MARK@@', () => rd('../src/mark.html').trim()).replace('@@ICONS@@', () => rd('../src/icons.html').trim()).replace('@@VER@@', () => VERSION);
fs.writeFileSync(A.out, (A.kind === 'dev' ? tpl.replace('href="manifest.webmanifest"', 'href="manifest-dev.webmanifest"').replace('apple-mobile-web-app-title" content="المحاسبات"', 'apple-mobile-web-app-title" content="Mina.Dev"') : tpl).replace('@@DATA@@', () => JSON.stringify(D)));  /* the designer's page is its own home-screen app (Mina.Dev, opens dev.html) */
console.log(JSON.stringify({ out: A.out, bytes: fs.statSync(A.out).size }));
