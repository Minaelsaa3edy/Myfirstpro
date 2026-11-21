/* Trial-code server (Google Apps Script web app) - holds only ENCRYPTED slots, a list of stopped trials and the designer's own encrypted notes.
   Nothing here can open the program: a code's slot is unlocked only by the code itself, and the signing key never leaves the designer's page.
   Deploy: Deploy > New deployment > Web app > Execute as: Me > Who has access: Anyone. */
const ADMIN = '17doR5sEtoJcfKsNnvUyw3b2KSMDh-e6';            // the designer's private key for this server (do not share this file)
const DAY = 86400000, KEEP = 30 * DAY;    // a finished code is forgotten 30 days after it ends
const VAPID_PUB = 'BIhEs3KeGYe03IWOqG5Q5cAkaKZryM2SWIizIyjfTjI6nu3GitOT7NlonqOZUB63XvrfoU629MdY3Zi0W8-qvus', VAPID_PRIV = 'pUXjY1m9cl7vmcKIE8I_i-v1ZT8omQCoju5uGRIbU-8', VAPID_SUB = 'https://minaelsaa3edy.github.io/Myfirstpro/'; // Web Push identity of this server (the private half signs; it never leaves this file)
const TOK_X = 'hpCwtUjCMC33HXFOgEaMVhiNtEscYC24OkkVeSE0n0A', TOK_Y = '0tGPzY4j4dpqeHcXAy6dBC74rC1LTWiS_mkD1wEC4ho';   // the designer's PUBLIC key: used only to check that a phone really holds one of his codes

function out_(o, cb) {
  const txt = JSON.stringify(o);
  if (cb && /^[A-Za-z_$][\w$]{0,40}$/.test(cb)) return ContentService.createTextOutput(cb + '(' + txt + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(txt).setMimeType(ContentService.MimeType.JSON);
}
const okId_ = s => /^[A-Z0-9]{4}$/.test(s || '');
const okTid_ = s => /^[\w-]{4,24}$/.test(s || '');
const num_ = s => { const n = Number(s); return isFinite(n) && n > 0 ? Math.floor(n) : 0; };
const json_ = (s, max) => { s = String(s || ''); if (!s || s.length > max) throw new Error('bad size'); return JSON.parse(s); };

function doGet(e) {
  const p = (e && e.parameter) || {}, cb = p.cb, P = PropertiesService.getScriptProperties(), now = Date.now();
  try {
    /* ---- public (the trial gate page and the running trial) ---- */
    if (p.a === 'ping') return out_({ ok: 1, t: now }, cb);
    if (p.a === 'slot') {
      if (!okId_(p.id)) return out_({ ok: 1, slot: null }, cb);
      const v = P.getProperty('s_' + p.id); if (!v) return out_({ ok: 1, slot: null }, cb);
      const o = JSON.parse(v); return out_({ ok: 1, slot: o.u && o.u < now ? null : o.slot }, cb);
    }
    if (p.a === 'rv') {
      const ids = [], all = P.getProperties();
      for (const k in all) if (k.indexOf('r_') === 0 && Number(all[k]) >= now) ids.push(k.slice(2));
      return out_({ ok: 1, ids: ids }, cb);
    }
    if (p.a === 'seen') { /* a running program says: this code is open on a device, and when it ends there (0 = no end). Only times are kept. */
      if (!okTid_(p.i)) return out_({ ok: 1 }, cb);
      const k = 'o_' + p.i, v = P.getProperty(k); let o = null; try { o = v ? JSON.parse(v) : null; } catch (x) { o = null; }
      if (!o) { if (Object.keys(P.getProperties()).filter(x => x.indexOf('o_') === 0).length >= 400) return out_({ ok: 1 }, cb); o = { f: now, n: 0 }; }
      o.l = now; o.e = num_(p.e); if (p.n === '1') o.n = (o.n || 0) + 1;
      P.setProperty(k, JSON.stringify(o)); return out_({ ok: 1, t: now }, cb);
    }
    if (p.a === 'pk') return out_(PUSH_OK ? { ok: 1, pk: VAPID_PUB, v: 3 } : { ok: 0, e: 'nopush' }, cb);
    if (p.a === 'preg' || p.a === 'punreg' || p.a === 'ptest') return out_(pushApi_(p, P, now), cb); // alarms that ring on a locked phone (Web Push)
    /* ---- the designer only ---- */
    if (!p.k || p.k !== ADMIN) return out_({ ok: 0, e: 'key' }, cb);
    const lock = LockService.getScriptLock(); lock.waitLock(15000);
    try {
      if (p.a === 'chk') return out_({ ok: 1, t: now, v: 3, push: PUSH_OK ? 1 : 0 }, cb);
      if (p.a === 'plog') { let n = 0; const all = P.getProperties(); for (const k in all) if (k.indexOf('pu_') === 0) n++; let lg = []; try { lg = JSON.parse(all.pl || '[]'); } catch (x) { lg = []; } return out_({ ok: 1, devices: n, log: lg, t: now }, cb); }
      if (p.a === 'put') {
        if (!okId_(p.id)) throw new Error('id');
        const slot = json_(p.slot, 2500); if (!slot.s || !slot.iv || !slot.c) throw new Error('slot');
        P.setProperty('s_' + p.id, JSON.stringify({ slot: slot, u: num_(p.u) }));
        if (p.m) P.setProperty('m_' + p.id, JSON.stringify({ m: json_(p.m, 2500), u: num_(p.u) }));
        const all = P.getProperties(); /* forget what ended long ago */
        for (const k in all) { if (k.indexOf('s_') === 0 || k.indexOf('m_') === 0) { try { const o = JSON.parse(all[k]); if (o.u && o.u + KEEP < now) P.deleteProperty(k); } catch (x) { P.deleteProperty(k); } } else if (k.indexOf('r_') === 0 && Number(all[k]) + KEEP < now) P.deleteProperty(k); else if (k.indexOf('o_') === 0) { try { if (JSON.parse(all[k]).l + KEEP < now) P.deleteProperty(k); } catch (x) { P.deleteProperty(k); } } }
        return out_({ ok: 1 }, cb);
      }
      if (p.a === 'stop') { if (!okTid_(p.i)) throw new Error('id'); P.setProperty('r_' + p.i, String(num_(p.u) || now + 90 * DAY)); return out_({ ok: 1 }, cb); }
      if (p.a === 'unstop') { if (!okTid_(p.i)) throw new Error('id'); P.deleteProperty('r_' + p.i); return out_({ ok: 1 }, cb); }
      if (p.a === 'del') { if (!okId_(p.id)) throw new Error('id'); P.deleteProperty('s_' + p.id); P.deleteProperty('m_' + p.id); if (okTid_(p.i)) P.deleteProperty('o_' + p.i); return out_({ ok: 1 }, cb); }
      if (p.a === 'list') {
        const items = [], rv = [], op = [], all = P.getProperties();
        for (const k in all) {
          if (k.indexOf('m_') === 0) { try { const o = JSON.parse(all[k]); items.push({ id: k.slice(2), m: o.m, u: o.u }); } catch (x) { /* skip */ } }
          else if (k.indexOf('r_') === 0) rv.push({ i: k.slice(2), u: Number(all[k]) });
          else if (k.indexOf('o_') === 0) { try { const o = JSON.parse(all[k]); op.push({ i: k.slice(2), f: o.f, l: o.l, e: o.e, n: o.n }); } catch (x) { /* skip */ } }
        }
        return out_({ ok: 1, items: items, rv: rv, op: op, t: now, v: 2 }, cb);
      }
      return out_({ ok: 0, e: 'action' }, cb);
    } finally { lock.releaseLock(); }
  } catch (err) { return out_({ ok: 0, e: String((err && err.message) || err) }, cb); }
}
/* =====================================================================================================
   Web Push — makes an alarm reach a phone that is locked or a browser that is closed.
   The phone gives this server its "push address" and the times of its next alarms (times only: the names of the alarms
   never leave the phone). Every minute pushTick() sends an EMPTY push to the phones whose alarm time has come; the
   phone's service worker wakes up and shows the notice from what it keeps on the phone itself.
   Setup (once, by the designer, in the Apps Script editor): choose the function  pushSetup  and press Run, allow the
   permissions it asks for, then Deploy > Manage deployments > edit > New version > Deploy.
   ===================================================================================================== */
const PUSH_OK = VAPID_PUB.charAt(0) !== '@' && VAPID_PRIV.charAt(0) !== '@' && TOK_X.charAt(0) !== '@';
const PUSH_LATE = 5;            // minutes: an alarm that could not be sent within 5 minutes of its time is dropped (the phone shows it as missed when opened)
const PUSH_DEV_MAX = 150, PUSH_PER_TID = 5, PUSH_ENT_MAX = 150;

/* ---- bytes (Apps Script wants signed bytes -128..127; everything here works with 0..255) ---- */
/* BigInt numbers are written BigInt(..): the Apps Script editor does not accept the short literal spelling */
const B0 = BigInt(0), B1 = BigInt(1), B2 = BigInt(2), B3 = BigInt(3), B4 = BigInt(4), B8 = BigInt(8), B255 = BigInt(255);
const sgn_ = a => { const o = new Array(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i] > 127 ? a[i] - 256 : a[i]; return o; };
const uns_ = a => { const o = new Array(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i] < 0 ? a[i] + 256 : a[i]; return o; };
const b64e_ = a => Utilities.base64EncodeWebSafe(sgn_(a)).replace(/=+$/, '');
const b64d_ = s => { s = String(s); while (s.length % 4) s += '='; return uns_(Utilities.base64DecodeWebSafe(s)); };
const utf8_ = s => uns_(Utilities.newBlob(String(s)).getBytes());
const sha256_ = a => uns_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, sgn_(a)));
const hmac_ = (k, d) => uns_(Utilities.computeHmacSha256Signature(sgn_(d), sgn_(k)));
const big_ = a => { let n = B0; for (let i = 0; i < a.length; i++) n = (n << B8) | BigInt(a[i]); return n; };
const bytes_ = (n, len) => { const o = new Array(len); for (let i = len - 1; i >= 0; i--) { o[i] = Number(n & B255); n >>= B8; } return o; };

/* ---- ECDSA P-256 (BigInt): signs the VAPID token and checks the designer's signature on a code. Apps Script has no built-in ECDSA. ---- */
const EC_P = BigInt('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff');
const EC_N = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
const EC_B = BigInt('0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b');
const EC_G = [BigInt('0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296'), BigInt('0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5')];
const mod_ = (a, m) => { const r = a % m; return r >= B0 ? r : r + m; };
function inv_(a, m) { let r0 = mod_(a, m), r1 = m, s0 = B1, s1 = B0; while (r1 !== B0) { const q = r0 / r1; let t = r0 - q * r1; r0 = r1; r1 = t; t = s0 - q * s1; s0 = s1; s1 = t; } return mod_(s0, m); }
function ecDbl_(p) { /* Jacobian doubling, curve a = -3 */
  const X = p[0], Y = p[1], Z = p[2]; if (Z === B0 || Y === B0) return [B0, B1, B0];
  const ZZ = mod_(Z * Z, EC_P), YY = mod_(Y * Y, EC_P), S = mod_(B4 * X * YY, EC_P), M = mod_(B3 * (X - ZZ) * (X + ZZ), EC_P);
  const X3 = mod_(M * M - B2 * S, EC_P);
  return [X3, mod_(M * (S - X3) - B8 * YY * YY, EC_P), mod_(B2 * Y * Z, EC_P)];
}
function ecAdd_(p, q) {
  if (p[2] === B0) return q; if (q[2] === B0) return p;
  const Z1 = mod_(p[2] * p[2], EC_P), Z2 = mod_(q[2] * q[2], EC_P), U1 = mod_(p[0] * Z2, EC_P), U2 = mod_(q[0] * Z1, EC_P), S1 = mod_(p[1] * q[2] * Z2, EC_P), S2 = mod_(q[1] * p[2] * Z1, EC_P);
  if (U1 === U2) return S1 === S2 ? ecDbl_(p) : [B0, B1, B0];
  const H = mod_(U2 - U1, EC_P), R = mod_(S2 - S1, EC_P), HH = mod_(H * H, EC_P), HHH = mod_(H * HH, EC_P), V = mod_(U1 * HH, EC_P);
  const X3 = mod_(R * R - HHH - B2 * V, EC_P);
  return [X3, mod_(R * (V - X3) - S1 * HHH, EC_P), mod_(p[2] * q[2] * H, EC_P)];
}
function ecMulJ_(k, pt) { let R = [B0, B1, B0]; const A = [pt[0], pt[1], B1], bits = k.toString(2); for (let i = 0; i < bits.length; i++) { R = ecDbl_(R); if (bits.charAt(i) === '1') R = ecAdd_(R, A); } return R; }
function ecAff_(j) { if (j[2] === B0) return null; const zi = inv_(j[2], EC_P), z2 = mod_(zi * zi, EC_P); return [mod_(j[0] * z2, EC_P), mod_(j[1] * z2 * zi, EC_P)]; }
const ecOn_ = q => !!q && mod_(q[1] * q[1], EC_P) === mod_(q[0] * q[0] * q[0] - B3 * q[0] + EC_B, EC_P);
function rfc6979_(x, h1) { /* the nonce is derived from the key and the message (RFC 6979): never random, never repeated */
  const xb = bytes_(x, 32), hb = bytes_(mod_(big_(h1), EC_N), 32); let V = [], K = [];
  for (let i = 0; i < 32; i++) { V.push(1); K.push(0); }
  K = hmac_(K, V.concat([0], xb, hb)); V = hmac_(K, V); K = hmac_(K, V.concat([1], xb, hb)); V = hmac_(K, V);
  for (;;) { V = hmac_(K, V); const k = big_(V); if (k >= B1 && k < EC_N) return k; K = hmac_(K, V.concat([0])); V = hmac_(K, V); }
}
function ecSign_(d, msg) { /* -> 64 bytes r||s (what a JWT ES256 wants) */
  const h = sha256_(msg), e = big_(h), k = rfc6979_(d, h), r = mod_(ecAff_(ecMulJ_(k, EC_G))[0], EC_N);
  const s = mod_(inv_(k, EC_N) * (e + r * d), EC_N); if (r === B0 || s === B0) throw new Error('sign');
  return bytes_(r, 32).concat(bytes_(s, 32));
}
function ecVerify_(sig, msg, Q) {
  if (sig.length !== 64 || !ecOn_(Q)) return false;
  const r = big_(sig.slice(0, 32)), s = big_(sig.slice(32)); if (r < B1 || r >= EC_N || s < B1 || s >= EC_N) return false;
  const w = inv_(s, EC_N), e = big_(sha256_(msg)), pt = ecAff_(ecAdd_(ecMulJ_(mod_(e * w, EC_N), EC_G), ecMulJ_(mod_(r * w, EC_N), Q)));
  return !!pt && mod_(pt[0], EC_N) === r;
}
function tokCheck_(raw) { /* a code's signed token -> its payload when the designer's signature is genuine and it is a real-program code, else null */
  try {
    const parts = String(raw || '').trim().split('.'); if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const msg = b64d_(parts[0]), sig = b64d_(parts[1]);
    if (!ecVerify_(sig, msg, [big_(b64d_(TOK_X)), big_(b64d_(TOK_Y))])) return null;
    const o = JSON.parse(Utilities.newBlob(sgn_(msg)).getDataAsString());
    return o && o.v === 2 && o.p === 'r' && okTid_(o.i) ? o : null;
  } catch (e) { return null; }
}

/* ---- the push itself ---- */
const pushEpOk_ = ep => ep.length <= 700 && /^https:\/\/(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|[\w-]+(\.[\w-]+)*\.push\.services\.mozilla\.com|web\.push\.apple\.com|[\w-]+(\.[\w-]+)*\.push\.apple\.com|[\w-]+(\.[\w-]+)*\.notify\.windows\.com)\/[\w\-.~%+=&?:\/]{8,}$/.test(ep); // only the real push services: this server never calls any other address
const pushAud_ = ep => ep.match(/^https:\/\/[^\/]+/)[0];
function vapidJwt_(aud, P, now) { /* the signed pass for one push service: valid 12 h, kept and reused */
  const ck = 'vj_' + aud, c = P.getProperty(ck);
  if (c) { try { const o = JSON.parse(c); if (o.x > now + 3600000 && o.k === VAPID_PUB) return o.j; } catch (e) { /* make a new one */ } }
  const exp = Math.floor(now / 1000) + 12 * 3600, h = b64e_(utf8_('{"typ":"JWT","alg":"ES256"}')), cl = b64e_(utf8_(JSON.stringify({ aud: aud, exp: exp, sub: VAPID_SUB })));
  const j = h + '.' + cl + '.' + b64e_(ecSign_(big_(b64d_(VAPID_PRIV)), utf8_(h + '.' + cl)));
  P.setProperty(ck, JSON.stringify({ j: j, x: exp * 1000, k: VAPID_PUB })); return j;
}
function pushSend_(items, P, now) { /* items: [{k: property key, rec}] -> [{k, c: HTTP code (0 = no answer), b: short reply}] */
  const out = [];
  for (let i = 0; i < items.length; i += 30) {
    const part = items.slice(i, i + 30), reqs = part.map(it => ({ url: it.rec.e, method: 'post', headers: { Authorization: 'vapid t=' + vapidJwt_(pushAud_(it.rec.e), P, now) + ', k=' + VAPID_PUB, TTL: '600', Urgency: 'high' }, payload: '', muteHttpExceptions: true, followRedirects: false }));
    let res = null; try { res = UrlFetchApp.fetchAll(reqs); } catch (e) { res = null; }
    part.forEach((it, j) => {
      let r = res && res[j], c = 0, b = '';
      if (!r) { try { r = UrlFetchApp.fetch(reqs[j].url, reqs[j]); } catch (e) { r = null; b = String((e && e.message) || e).slice(0, 80); } }
      if (r) { c = r.getResponseCode(); if (c >= 300) b = String(r.getContentText() || '').slice(0, 120); }
      out.push({ k: it.k, c: c, b: b });
    });
  }
  return out;
}
function pushGone_(o, g, now) { /* a code that is stopped or finished must not keep pushing. o: { i: code id, m: minutes, s: 'a' | 'r', c: made at }, g: key -> stored text */
  if (Number(g('r_' + o.i)) >= now) return 'revoked';
  let end = 0;
  if (o.m > 0) { if (o.s === 'a') end = o.c + o.m * 60000; else { let seen = null; try { seen = JSON.parse(g('o_' + o.i) || 'null'); } catch (e) { seen = null; } end = seen && seen.e > 0 ? seen.e : 0; } }
  return end && end < now ? 'expired' : '';
}
function pushApi_(p, P, now) { /* register / forget / test one phone */
  if (!PUSH_OK) return { ok: 0, e: 'nopush' };
  const d = String(p.d || ''); if (!/^[A-Za-z0-9_-]{16,32}$/.test(d)) return { ok: 0, e: 'device' };
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    const key = 'pu_' + d, old = P.getProperty(key); let rec = null; try { rec = old ? JSON.parse(old) : null; } catch (x) { rec = null; }
    if (p.a === 'punreg') { P.deleteProperty(key); return { ok: 1 }; }
    if (p.a === 'ptest') { /* send one empty push right now and say what the push service answered */
      if (!rec) return { ok: 0, e: 'unknown' };
      if (rec.lt && now - rec.lt < 15000) return { ok: 0, e: 'rate' };
      rec.lt = now; P.setProperty(key, JSON.stringify(rec));
      const r = pushSend_([{ k: key, rec: rec }], P, now)[0]; if (r.c === 404 || r.c === 410) P.deleteProperty(key);
      return { ok: 1, c: r.c, b: r.b };
    }
    const ep = String(p.ep || ''); if (!pushEpOk_(ep)) return { ok: 0, e: 'endpoint' };
    let who = '', life = null;
    if (p.ak) { if (p.ak !== ADMIN) return { ok: 0, e: 'key' }; who = 'adm'; }
    else if (p.tk) { const o = tokCheck_(p.tk); if (!o) return { ok: 0, e: 'auth' }; const g = pushGone_(o, k => P.getProperty(k), now); if (g) return { ok: 0, e: g }; who = o.i; life = { m: o.m || 0, s: o.s || 'a', c: o.c || 0 }; }
    else return { ok: 0, e: 'auth' };
    const w = []; String(p.w || '').split('.').forEach(s => { const m = parseInt(s, 36); if (isFinite(m) && m > 0 && w.length < PUSH_ENT_MAX) w.push(m); }); w.sort((a, b) => a - b);
    const all = P.getProperties(), mine = []; let n = 0;
    for (const k in all) if (k.indexOf('pu_') === 0 && k !== key) { n++; try { const o = JSON.parse(all[k]); if (o.i === who) mine.push({ k: k, u: o.u || 0 }); } catch (x) { P.deleteProperty(k); } }
    if (!rec && n >= PUSH_DEV_MAX) return { ok: 0, e: 'full' };
    mine.sort((a, b) => a.u - b.u); while (mine.length >= PUSH_PER_TID) P.deleteProperty(mine.shift().k); // a leaked code cannot fill the server: the oldest phone of that code goes
    P.setProperty(key, JSON.stringify({ e: ep, i: who, w: w, u: now, c: rec ? rec.c : now, lt: rec ? rec.lt || 0 : 0, x: life })); /* x: how long its code lives, so a code that ended stops pushing even when the phone never says so */
    return { ok: 1, n: w.length, t: now };
  } finally { lock.releaseLock(); }
}
function pushTick() { /* runs every minute (a time trigger made by pushSetup): sends what is due; when a phone has a time in the NEXT minute it waits for that minute to start and sends at once, so the notice comes within seconds, not up to a minute late */
  if (!PUSH_OK) return;
  if (!pushRun_(true)) return;
  const t = Date.now(), wait = (Math.floor(t / 60000) + 1) * 60000 - t; /* ms until the next minute starts */
  if (wait > 0 && wait <= 61000 && pushNap_(wait)) { Utilities.sleep(wait + 300); pushRun_(false); }
}
function pushNap_(ms) { /* Google counts a running script against a daily total, so the waiting is limited to 40 minutes a day; past that it falls back to the plain once-a-minute timing */
  const P = PropertiesService.getScriptProperties(), d = new Date().toISOString().slice(0, 10); let o = null; try { o = JSON.parse(P.getProperty('nap') || 'null'); } catch (e) { o = null; }
  if (!o || o.d !== d) o = { d: d, s: 0 };
  if (o.s + ms / 1000 > 2400) return false;
  o.s += Math.ceil(ms / 1000); P.setProperty('nap', JSON.stringify(o)); return true;
}
function pushRun_(wantSoon) { /* one pass: sends what is due now. Returns true when (wantSoon) some phone has a time in the next minute */
  const P = PropertiesService.getScriptProperties(), now = Date.now(), nm = Math.floor(now / 60000), lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const all = P.getProperties(), jobs = []; let soon = false;
    for (const k in all) {
      if (k.indexOf('pu_') !== 0) continue;
      let rec = null; try { rec = JSON.parse(all[k]); } catch (x) { P.deleteProperty(k); continue; }
      if (wantSoon && rec.w.indexOf(nm + 1) >= 0) soon = true;
      const due = rec.w.filter(m => m <= nm), fresh = due.filter(m => nm - m <= PUSH_LATE), future = rec.w.filter(m => m > nm);
      if (fresh.length) { /* only a phone that is about to ring is checked: its code may have been stopped or have ended meanwhile */
        if (rec.i !== 'adm' && pushGone_({ i: rec.i, m: rec.x ? rec.x.m : 0, s: rec.x ? rec.x.s : 'a', c: rec.x ? rec.x.c : 0 }, q => (q in all ? all[q] : null), now)) { P.deleteProperty(k); continue; }
        jobs.push({ k: k, rec: rec, fresh: fresh, future: future });
      }
      else if (due.length) { rec.w = future; P.setProperty(k, JSON.stringify(rec)); } // too late to be useful
    }
    if (!jobs.length) return soon;
    const res = pushSend_(jobs, P, now), log = [];
    res.forEach((r, i) => {
      const j = jobs[i], rec = j.rec;
      if (r.c >= 200 && r.c < 300) { rec.w = j.future; P.setProperty(j.k, JSON.stringify(rec)); }
      else if (r.c === 404 || r.c === 410 || r.c === 400 || r.c === 401 || r.c === 403) P.deleteProperty(j.k); // the phone is gone, or it subscribed with another server key: it asks again the next time it opens the program
      else { rec.w = j.fresh.concat(j.future); P.setProperty(j.k, JSON.stringify(rec)); } // busy / no answer: try again next minute (until it is too late)
      log.push({ t: now, d: j.k.slice(3, 9), c: r.c });
    });
    let old = []; try { old = JSON.parse(all.pl || '[]'); } catch (x) { old = []; }
    P.setProperty('pl', JSON.stringify(old.concat(log).slice(-40)));
    return soon;
  } finally { lock.releaseLock(); }
}
function pushSetup() { /* run once from the editor: makes the every-minute trigger, asks Google for the permissions, checks the keys */
  if (!PUSH_OK) throw new Error('this file was made without push keys');
  const pub = ecAff_(ecMulJ_(big_(b64d_(VAPID_PRIV)), EC_G)), want = b64e_([4].concat(bytes_(pub[0], 32), bytes_(pub[1], 32)));
  if (want !== VAPID_PUB) throw new Error('the push keys in this file do not match each other');
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'pushTick').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('pushTick').timeBased().everyMinutes(1).create();
  UrlFetchApp.fetch('https://fcm.googleapis.com/', { muteHttpExceptions: true });
  Logger.log('Push is ready: the trigger runs every minute. Now: Deploy > Manage deployments > edit (pencil) > Version: New version > Deploy.');
  return 'ok';
}

