'use strict';
/* Secure updates.
   - The manifest is signed (ECDSA P-256) with the UPDATE key of the channel; the installer is pinned in it by size and SHA-512.
   - Online: HTTPS only (no downgrade to http, redirects stay on https). Offline: a single .mpupdate file carrying manifest + installer.
   - An update must be for this channel and platform, newer than the installed version, and its sequence number never goes back. */
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const cu = require('./cu');

const PURPOSE = 'MPD-UPD-v1';
const MAGIC = Buffer.from('MPU1');
const MAX_INSTALLER = 700 * 1024 * 1024;
const MIN_INSTALLER = 64 * 1024;

class UpdateError extends Error { constructor(code, msg) { super(msg || code); this.code = code; } }

/* ---- developer side ---- */
function signManifest(body, privatePem) {
  const text = JSON.stringify(body);
  return { body: text, sig: cu.sign(PURPOSE, text, privatePem) };
}
function sha512File(file) {
  return new Promise((res, rej) => {
    const h = crypto.createHash('sha512'); const s = fs.createReadStream(file);
    s.on('data', d => h.update(d)); s.on('error', rej); s.on('end', () => res(h.digest('base64')));
  });
}
async function makeManifest(o) { /* o: {channel, version, seq, notes, installerPath, url, min, revoke} */
  const st = fs.statSync(o.installerPath);
  return {
    v: 1, ch: o.channel, plat: 'win32', arch: 'x64', ver: o.version, seq: o.seq, date: new Date(o.now || Date.now()).toISOString(),
    notes: String(o.notes || '').slice(0, 2000), min: o.min || '0.0.0', revoke: o.revoke || [],
    file: Object.assign({ name: path.basename(o.installerPath), size: st.size, sha512: await sha512File(o.installerPath) }, o.url ? { url: o.url } : {})
  };
}
async function writeContainer(outFile, envelope, installerPath) {
  const m = Buffer.from(JSON.stringify(envelope), 'utf8');
  const head = Buffer.alloc(8); MAGIC.copy(head, 0); head.writeUInt32BE(m.length, 4);
  await new Promise((res, rej) => {
    const w = fs.createWriteStream(outFile); w.on('error', rej); w.on('finish', res);
    w.write(head); w.write(m);
    const r = fs.createReadStream(installerPath); r.on('error', rej); r.pipe(w);
  });
}

/* ---- app side ---- */
function parseEnvelope(env, pubKey) {
  if (!env || typeof env.body !== 'string' || typeof env.sig !== 'string' || env.body.length > 20000) throw new UpdateError('MALFORMED');
  if (!cu.verify(PURPOSE, env.body, env.sig, pubKey)) throw new UpdateError('BAD_SIGNATURE');
  let b; try { b = JSON.parse(env.body); } catch (e) { throw new UpdateError('MALFORMED'); }
  if (!b || b.v !== 1 || !b.file || typeof b.file !== 'object') throw new UpdateError('MALFORMED');
  return b;
}
/* ctx = { channel, version, plat, arch, lastSeq } */
function validate(b, ctx) {
  if (b.ch !== ctx.channel) throw new UpdateError('WRONG_CHANNEL');
  if (b.plat !== ctx.plat || b.arch !== ctx.arch) throw new UpdateError('WRONG_PLATFORM');
  const c = cu.cmpVer(b.ver, ctx.version);
  if (c === null) throw new UpdateError('MALFORMED');
  if (c <= 0) throw new UpdateError(c === 0 ? 'SAME_VERSION' : 'DOWNGRADE');
  if (!Number.isInteger(b.seq) || b.seq < (ctx.lastSeq || 0)) throw new UpdateError('ROLLBACK');
  if (b.min && cu.cmpVer(b.min, ctx.version) === 1) throw new UpdateError('NEEDS_INTERMEDIATE');
  const f = b.file;
  if (!/^[A-Za-z0-9._-]{1,100}\.exe$/.test(f.name || '')) throw new UpdateError('MALFORMED');
  if (!Number.isInteger(f.size) || f.size < MIN_INSTALLER || f.size > MAX_INSTALLER) throw new UpdateError('MALFORMED');
  if (typeof f.sha512 !== 'string' || Buffer.from(f.sha512, 'base64').length !== 64) throw new UpdateError('MALFORMED');
  if (f.url != null && !/^https:\/\/[^\s"'<>]+$/.test(f.url)) throw new UpdateError('INSECURE_URL');
  if (!Array.isArray(b.revoke) || b.revoke.some(x => typeof x !== 'string')) throw new UpdateError('MALFORMED');
  return b;
}

async function readContainer(file, pubKey, ctx, workDir) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const head = Buffer.alloc(8);
    if (size < 8 || fs.readSync(fd, head, 0, 8, 0) !== 8 || !head.subarray(0, 4).equals(MAGIC)) throw new UpdateError('MALFORMED');
    const ml = head.readUInt32BE(4);
    if (ml < 10 || ml > 30000 || 8 + ml > size) throw new UpdateError('MALFORMED');
    const mb = Buffer.alloc(ml); fs.readSync(fd, mb, 0, ml, 8);
    let env; try { env = JSON.parse(mb.toString('utf8')); } catch (e) { throw new UpdateError('MALFORMED'); }
    const b = validate(parseEnvelope(env, pubKey), ctx);
    const start = 8 + ml;
    if (size - start !== b.file.size) throw new UpdateError('SIZE_MISMATCH');
    fs.mkdirSync(workDir, { recursive: true });
    const out = path.join(workDir, b.file.name + '.part');
    const h = crypto.createHash('sha512');
    await new Promise((res, rej) => {
      const r = fs.createReadStream(file, { start }); const w = fs.createWriteStream(out);
      r.on('data', d => h.update(d)); r.on('error', rej); w.on('error', rej); w.on('finish', res); r.pipe(w);
    });
    if (h.digest('base64') !== b.file.sha512) { fs.rmSync(out, { force: true }); throw new UpdateError('HASH_MISMATCH'); }
    const fin = path.join(workDir, b.file.name); fs.renameSync(out, fin);
    return { manifest: b, file: fin };
  } finally { fs.closeSync(fd); }
}

/* HTTPS GET with a hard size limit, a timeout and https-only redirects */
function httpsGet(url, opt) {
  opt = opt || {};
  return new Promise((res, rej) => {
    let hops = 0;
    const go = u => {
      if (!/^https:\/\//i.test(u)) return rej(new UpdateError('INSECURE_URL'));
      const req = https.get(u, { timeout: opt.timeout || 20000, headers: { 'User-Agent': 'MyfirstproDesktop-Updater', Accept: '*/*' } }, r => {
        if ([301, 302, 303, 307, 308].includes(r.statusCode) && r.headers.location) {
          r.resume(); if (++hops > 5) return rej(new UpdateError('NETWORK', 'too many redirects'));
          return go(new URL(r.headers.location, u).toString());
        }
        if (r.statusCode !== 200) { r.resume(); return rej(new UpdateError('NETWORK', 'HTTP ' + r.statusCode)); }
        res(r);
      });
      req.on('timeout', () => req.destroy(new UpdateError('NETWORK', 'timeout')));
      req.on('error', e => rej(e instanceof UpdateError ? e : new UpdateError('NETWORK', e.message)));
    };
    go(url);
  });
}
async function getBuffer(url, max) {
  const r = await httpsGet(url); const ch = []; let n = 0;
  for await (const d of r) { n += d.length; if (n > max) { r.destroy(); throw new UpdateError('MALFORMED', 'too large'); } ch.push(d); }
  return Buffer.concat(ch);
}

/* check: fetch the signed manifest and decide whether it is a valid newer update. Returns null when up to date. */
async function checkOnline(manifestUrl, pubKey, ctx) {
  const buf = await getBuffer(manifestUrl, 40000);
  let env; try { env = JSON.parse(buf.toString('utf8')); } catch (e) { throw new UpdateError('MALFORMED'); }
  const b = parseEnvelope(env, pubKey);
  try { validate(b, ctx); } catch (e) { if (e.code === 'SAME_VERSION' || e.code === 'DOWNGRADE') return { manifest: b, newer: false }; throw e; }
  return { manifest: b, newer: true, base: manifestUrl };
}
async function downloadInstaller(manifest, manifestUrl, workDir, onProgress) {
  const f = manifest.file;
  const url = f.url ? f.url : new URL(f.name, manifestUrl).toString();
  fs.mkdirSync(workDir, { recursive: true });
  const part = path.join(workDir, f.name + '.part'); const fin = path.join(workDir, f.name);
  const r = await httpsGet(url, { timeout: 30000 });
  const h = crypto.createHash('sha512'); let n = 0;
  await new Promise((res, rej) => {
    const w = fs.createWriteStream(part);
    r.on('data', d => { n += d.length; if (n > f.size) { r.destroy(new UpdateError('SIZE_MISMATCH')); return; } h.update(d); if (onProgress) onProgress(n, f.size); });
    r.on('error', rej); w.on('error', rej); w.on('finish', res); r.pipe(w);
  }).catch(e => { fs.rmSync(part, { force: true }); throw e instanceof UpdateError ? e : new UpdateError('NETWORK', e.message); });
  if (n !== f.size) { fs.rmSync(part, { force: true }); throw new UpdateError('SIZE_MISMATCH'); }
  if (h.digest('base64') !== f.sha512) { fs.rmSync(part, { force: true }); throw new UpdateError('HASH_MISMATCH'); }
  fs.renameSync(part, fin);
  return fin;
}
/* the last check before the installer is started: file still has the signed size and hash */
async function reverify(file, manifest) {
  const st = fs.statSync(file);
  if (st.size !== manifest.file.size) throw new UpdateError('SIZE_MISMATCH');
  if (await sha512File(file) !== manifest.file.sha512) throw new UpdateError('HASH_MISMATCH');
  return true;
}

module.exports = { PURPOSE, UpdateError, signManifest, makeManifest, writeContainer, parseEnvelope, validate, readContainer, checkOnline, downloadInstaller, reverify, sha512File };
