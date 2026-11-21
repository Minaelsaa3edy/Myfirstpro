// A small stand-in for Google's Apps Script services, strict where Google is strict (signed bytes, padded base64),
// so the REAL server.gs.tpl code runs here exactly as it will run at Google.
const vm = require('vm'), fs = require('fs'), crypto = require('crypto');
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function makeKeys() {
  const des = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }), dj = des.publicKey.export({ format: 'jwk' });
  const vap = crypto.createECDH('prime256v1'); vap.generateKeys();
  return { designer: des, pubJwk: { x: dj.x, y: dj.y }, vapPub: b64u(vap.getPublicKey()), vapPriv: b64u(vap.getPrivateKey()), vapEcdh: vap, admin: 'ADMINKEY' + crypto.randomBytes(6).toString('hex') };
}
function signedBytes(a, what) { if (!Array.isArray(a)) throw new Error(what + ': Byte[] expected'); for (const v of a) if (!Number.isInteger(v) || v < -128 || v > 127) throw new Error(what + ': byte out of range ' + v); return a; }
const toSigned = buf => Array.from(buf, v => (v > 127 ? v - 256 : v));
const fromSigned = a => Buffer.from(a.map(v => (v < 0 ? v + 256 : v)));

function makeServer(tplPath, keys, opt = {}) {
  let src = fs.readFileSync(tplPath, 'utf8'); if (opt.ready) src = src; /* opt.ready: the file is already filled in (made by make_site) */
  const sub = opt.sub || 'https://minaelsaa3edy.github.io/Myfirstpro/';
  const noKeys = opt.noKeys;
  if (!opt.ready) src = src.replace(/@@ADMIN_KEY@@/g, keys.admin).replace(/@@VAPID_PUB@@/g, noKeys ? '@@VAPID_PUB@@' : keys.vapPub).replace(/@@VAPID_PRIV@@/g, noKeys ? '@@VAPID_PRIV@@' : keys.vapPriv)
    .replace(/@@VAPID_SUB@@/g, sub).replace(/@@PUBKEY_X@@/g, noKeys ? '@@PUBKEY_X@@' : keys.pubJwk.x).replace(/@@PUBKEY_Y@@/g, noKeys ? '@@PUBKEY_Y@@' : keys.pubJwk.y);
  const props = {}; const store = { getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: k => { delete props[k]; }, getProperties: () => Object.assign({}, props) };
  const st = { now: null, fetches: [], handler: () => ({ code: 201, body: '' }), triggers: [], logs: [], fetchAllThrows: false, locks: 0 };
  class FDate extends Date { constructor(...a) { if (a.length === 0 && st.now !== null) super(st.now); else super(...a); } static now() { return st.now !== null ? st.now : Date.now(); } }
  const Utilities = {
    sleep: ms => { st.slept = (st.slept || 0) + ms; st.sleeps = (st.sleeps || 0) + 1; if (st.now !== null) st.now += ms; else Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }, /* fake clock: waiting moves it; real clock: really waits */
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    base64EncodeWebSafe: b => b64u(fromSigned(signedBytes(b, 'base64EncodeWebSafe'))) + ['', '==', '=', ''][fromSigned(b).length % 3 === 0 ? 0 : fromSigned(b).length % 3 === 1 ? 1 : 2],
    base64DecodeWebSafe: s => { if (String(s).length % 4) throw new Error('base64DecodeWebSafe: bad padding'); return toSigned(unb64u(s)); },
    newBlob: v => { const buf = typeof v === 'string' ? Buffer.from(v, 'utf8') : fromSigned(signedBytes(v, 'newBlob')); return { getBytes: () => toSigned(buf), getDataAsString: () => buf.toString('utf8') }; },
    computeDigest: (alg, b) => { if (alg !== 'SHA_256') throw new Error('alg'); return toSigned(crypto.createHash('sha256').update(fromSigned(signedBytes(b, 'computeDigest'))).digest()); },
    computeHmacSha256Signature: (v, k) => toSigned(crypto.createHmac('sha256', typeof k === 'string' ? Buffer.from(k) : fromSigned(signedBytes(k, 'hmac key'))).update(typeof v === 'string' ? Buffer.from(v) : fromSigned(signedBytes(v, 'hmac value'))).digest()),
  };
  const mkResp = r => ({ getResponseCode: () => r.code, getContentText: () => r.body || '' });
  const UrlFetchApp = {
    fetch: (url, o) => { const req = Object.assign({ url }, o); st.fetches.push(req); const r = st.handler(req); if (r instanceof Error) throw r; return mkResp(r); },
    fetchAll: reqs => { if (st.fetchAllThrows) throw new Error('Exception: fetchAll failed'); return reqs.map(q => { if (!q.url) throw new Error('url missing'); st.fetches.push(q); const r = st.handler(q); if (r instanceof Error) throw r; return mkResp(r); }); },
  };
  const ScriptApp = { getProjectTriggers: () => st.triggers.slice(), deleteTrigger: t => { st.triggers = st.triggers.filter(x => x !== t); }, newTrigger: fn => { const t = { fn, getHandlerFunction: () => fn, every: 0 }; return { timeBased: () => ({ everyMinutes: n => ({ create: () => { t.every = n; st.triggers.push(t); return t; } }) }) }; } };
  const ctx = { console, JSON, Date: FDate, Math, Object, Number, String, isFinite, parseInt, Error, RegExp, Array, BigInt, Utilities, UrlFetchApp, ScriptApp, Logger: { log: m => st.logs.push(m) },
    PropertiesService: { getScriptProperties: () => store },
    ContentService: { MimeType: { JAVASCRIPT: 'js', JSON: 'json' }, createTextOutput: t => ({ t, mt: '', setMimeType(m) { this.mt = m; return this; } }) },
    LockService: { getScriptLock: () => ({ waitLock() { st.locks++; }, releaseLock() { st.locks--; } }) } };
  vm.createContext(ctx); vm.runInContext(src + '\n;this.__x = { doGet, pushTick, pushRun_, pushNap_, pushSetup, ecSign_, ecVerify_, ecMulJ_, ecAff_, EC_G, big_, bytes_, b64e_, b64d_, utf8_, tokCheck_, rfc6979_, sha256_, pushEpOk_, PUSH_OK };', ctx);
  const X = ctx.__x;
  const call = p => { const o = X.doGet({ parameter: p }); return JSON.parse(o.t); };
  return { ctx, X, st, props, call, setNow: n => { st.now = n; }, keys };
}
// the designer's page makes a token like this (06-token.js verifies it)
function makeToken(keys, payload) { const p = Buffer.from(JSON.stringify(payload)); const sig = crypto.sign('sha256', p, { key: keys.designer.privateKey, dsaEncoding: 'ieee-p1363' }); return b64u(p) + '.' + b64u(sig); }
module.exports = { makeKeys, makeServer, makeToken, b64u, unb64u };
