'use strict';
const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('fs'); const os = require('os'); const path = require('path');
const https = require('https'); const http = require('http'); const crypto = require('crypto'); const { execFileSync } = require('child_process');
const cu = require('../../src/main/lib/cu'); const U = require('../../src/main/lib/update');
const kp = cu.genKeyPair(), other = cu.genKeyPair();
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mpd-up-'));
const ctx = { channel: 'production', version: '1.0.0', plat: 'win32', arch: 'x64', lastSeq: 1 };
const inst = (d, ver, size) => { const f = path.join(d, 'Myfirstpro-Desktop-Setup-' + ver + '.exe'); fs.writeFileSync(f, crypto.randomBytes(size || 100000)); return f; };
async function pack(d, o) {
  const f = inst(d, o.version || '1.0.1');
  const m = await U.makeManifest(Object.assign({ channel: 'production', version: '1.0.1', seq: 2, installerPath: f }, o));
  return { f, m, env: U.signManifest(m, kp.privateKey) };
}
const rejects = (p, code) => assert.rejects(p, e => e.code === code, 'expected ' + code);

test('signature and validation rules', async () => {
  const d = tmp(); const { m, env } = await pack(d, {});
  assert.equal(U.validate(U.parseEnvelope(env, kp.publicKey), ctx).ver, '1.0.1');
  assert.throws(() => U.parseEnvelope(env, other.publicKey), e => e.code === 'BAD_SIGNATURE');
  assert.throws(() => U.parseEnvelope({ body: env.body.replace('1.0.1', '9.9.9'), sig: env.sig }, kp.publicKey), e => e.code === 'BAD_SIGNATURE');
  const v = (patch, c) => assert.throws(() => U.validate(Object.assign(JSON.parse(JSON.stringify(m)), patch), ctx), e => e.code === c, c);
  v({ ch: 'developer' }, 'WRONG_CHANNEL'); v({ plat: 'darwin' }, 'WRONG_PLATFORM'); v({ ver: '1.0.0' }, 'SAME_VERSION'); v({ ver: '0.9.0' }, 'DOWNGRADE');
  v({ seq: 0 }, 'ROLLBACK'); v({ min: '1.0.5' }, 'NEEDS_INTERMEDIATE'); v({ ver: '1.x' }, 'MALFORMED'); v({ revoke: [1] }, 'MALFORMED');
  v({ file: Object.assign({}, m.file, { name: '..\\evil.exe' }) }, 'MALFORMED'); v({ file: Object.assign({}, m.file, { name: 'a.msi' }) }, 'MALFORMED');
  v({ file: Object.assign({}, m.file, { size: 10 }) }, 'MALFORMED'); v({ file: Object.assign({}, m.file, { size: 9e9 }) }, 'MALFORMED');
  v({ file: Object.assign({}, m.file, { url: 'http://x/y.exe' }) }, 'INSECURE_URL'); v({ file: Object.assign({}, m.file, { sha512: 'AAAA' }) }, 'MALFORMED');
  assert.throws(() => U.parseEnvelope({ body: 5, sig: 'x' }, kp.publicKey), e => e.code === 'MALFORMED');
  assert.throws(() => U.parseEnvelope(null, kp.publicKey), e => e.code === 'MALFORMED');
});
test('offline .mpupdate container: good, tampered, truncated, wrong key, downgrade', async () => {
  const d = tmp(); const { f, env } = await pack(d, {}); const c = path.join(d, 'u.mpupdate'); await U.writeContainer(c, env, f);
  const r = await U.readContainer(c, kp.publicKey, ctx, path.join(d, 'w')); assert.equal(r.manifest.ver, '1.0.1'); await U.reverify(r.file, r.manifest);
  assert.ok(fs.readFileSync(r.file).equals(fs.readFileSync(f)));
  const bad = Buffer.from(fs.readFileSync(c)); bad[bad.length - 5] ^= 1; fs.writeFileSync(path.join(d, 'bad.mpupdate'), bad);
  await rejects(U.readContainer(path.join(d, 'bad.mpupdate'), kp.publicKey, ctx, path.join(d, 'w2')), 'HASH_MISMATCH');
  assert.equal(fs.existsSync(path.join(d, 'w2', 'Myfirstpro-Desktop-Setup-1.0.1.exe')), false, 'a rejected installer is not left behind as a final file');
  fs.writeFileSync(path.join(d, 'short.mpupdate'), fs.readFileSync(c).subarray(0, bad.length - 100));
  await rejects(U.readContainer(path.join(d, 'short.mpupdate'), kp.publicKey, ctx, path.join(d, 'w3')), 'SIZE_MISMATCH');
  await rejects(U.readContainer(c, other.publicKey, ctx, path.join(d, 'w4')), 'BAD_SIGNATURE');
  await rejects(U.readContainer(c, kp.publicKey, Object.assign({}, ctx, { version: '1.0.1' }), path.join(d, 'w5')), 'SAME_VERSION');
  await rejects(U.readContainer(c, kp.publicKey, Object.assign({}, ctx, { version: '2.0.0' }), path.join(d, 'w6')), 'DOWNGRADE');
  fs.writeFileSync(path.join(d, 'junk.mpupdate'), 'hello world'); await rejects(U.readContainer(path.join(d, 'junk.mpupdate'), kp.publicKey, ctx, d), 'MALFORMED');
  fs.writeFileSync(r.file, crypto.randomBytes(100000)); await rejects(U.reverify(r.file, r.manifest), 'HASH_MISMATCH');
});

/* ---- online, against a local HTTPS server with a throw-away CA-less certificate trusted only inside this test ---- */
function startServer(routes) {
  const d = tmp();
  execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', path.join(d, 'k.pem'), '-out', path.join(d, 'c.pem'), '-days', '2', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
  const cert = fs.readFileSync(path.join(d, 'c.pem'));
  const srv = https.createServer({ key: fs.readFileSync(path.join(d, 'k.pem')), cert }, (q, s) => { const r = routes[q.url]; if (!r) { s.statusCode = 404; return s.end(); } r(q, s); });
  return new Promise(res => srv.listen(0, '127.0.0.1', () => res({ srv, cert, port: srv.address().port })));
}
test('online check + download over HTTPS; http, bad hash, oversize and unsafe redirects are refused', async () => {
  const d = tmp(); const { f, env, m } = await pack(d, {}); const bin = fs.readFileSync(f);
  const evil = crypto.randomBytes(bin.length);
  const S = await startServer({
    '/update.json': (q, s) => s.end(JSON.stringify(env)),
    '/Myfirstpro-Desktop-Setup-1.0.1.exe': (q, s) => s.end(bin),
    '/evil/update.json': (q, s) => s.end(JSON.stringify(env)),
    '/evil/Myfirstpro-Desktop-Setup-1.0.1.exe': (q, s) => s.end(evil),
    '/big/update.json': (q, s) => s.end(JSON.stringify(env)),
    '/big/Myfirstpro-Desktop-Setup-1.0.1.exe': (q, s) => s.end(Buffer.concat([bin, Buffer.alloc(5000)])),
    '/redir/update.json': (q, s) => { s.statusCode = 302; s.setHeader('Location', 'http://127.0.0.1:1/update.json'); s.end(); },
    '/fake.json': (q, s) => s.end(JSON.stringify(U.signManifest(m, other.privateKey)))
  });
  const old = https.globalAgent.options.ca; https.globalAgent.options.ca = S.cert;
  try {
    const base = 'https://127.0.0.1:' + S.port;
    const c = await U.checkOnline(base + '/update.json', kp.publicKey, ctx); assert.equal(c.newer, true);
    const got = await U.downloadInstaller(c.manifest, base + '/update.json', path.join(d, 'dl')); await U.reverify(got, c.manifest); assert.ok(fs.readFileSync(got).equals(bin));
    assert.equal((await U.checkOnline(base + '/update.json', kp.publicKey, Object.assign({}, ctx, { version: '1.0.1' }))).newer, false);
    await rejects(U.downloadInstaller(c.manifest, base + '/evil/update.json', path.join(d, 'dl2')), 'HASH_MISMATCH');
    await rejects(U.downloadInstaller(c.manifest, base + '/big/update.json', path.join(d, 'dl3')), 'SIZE_MISMATCH');
    assert.deepEqual(fs.readdirSync(path.join(d, 'dl2')), [], 'no partial file is left');
    await rejects(U.checkOnline('http://127.0.0.1:1/update.json', kp.publicKey, ctx), 'INSECURE_URL');
    await rejects(U.checkOnline(base + '/redir/update.json', kp.publicKey, ctx), 'INSECURE_URL');
    await rejects(U.checkOnline(base + '/fake.json', kp.publicKey, ctx), 'BAD_SIGNATURE');
    await rejects(U.checkOnline(base + '/missing.json', kp.publicKey, ctx), 'NETWORK');
  } finally { https.globalAgent.options.ca = old; S.srv.close(); }
});
