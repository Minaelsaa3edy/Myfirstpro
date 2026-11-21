'use strict';
/* Small sealed state kept next to the licence:
   - lastSeen : the latest date the program has seen (moving the computer's clock back cannot revive an expired code)
   - used     : for every activation code, when it was first used on this computer and when it ends ({at, exp}), so a timed code
                keeps counting from its FIRST use and typing the same code again after an update does not restart the time
   - ver      : the program version that last accepted a code (a different version means "an update happened" -> ask for the code again)
   - revoked  : stopped code ids (delivered by signed updates);  seq : last update sequence number accepted
   Up to three copies are kept in different folders; each is signed with an HMAC bound to this computer.
   Deleting all copies only resets the "latest date seen" (newest data-file time stamps are a second witness). */
const fs = require('fs');
const path = require('path');
const cu = require('./cu');

const TOLERANCE_MS = 10 * 60 * 1000; /* the clock may be corrected by a few minutes without a lock */
const MAX_USED = 500;
const ID_RE = /^LIC-[0-9A-F]{10}$/;

const cleanUsed = u => {
  const o = {};
  if (u && typeof u === 'object') for (const k of Object.keys(u).slice(0, MAX_USED)) {
    const v = u[k];
    if (ID_RE.test(k) && v && Number.isFinite(+v.at) && (v.exp === null || Number.isFinite(+v.exp))) o[k] = { at: +v.at, exp: v.exp === null ? null : +v.exp };
  }
  return o;
};

class SealedState {
  constructor(files, secret) {
    this.files = files; /* absolute file paths, one per folder */
    this.key = cu.hkdf(secret, 'mpd-state', 'MPD sealed state v2');
    this.data = { lastSeen: 0, revoked: [], seq: 0, used: {}, ver: '', verAt: 0 };
  }
  _seal(d) { const s = JSON.stringify(d); return JSON.stringify({ s, m: cu.hmacHex(this.key, s) }); }
  _read(file) {
    try {
      const o = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!o || typeof o.s !== 'string' || !cu.safeEq(cu.hmacHex(this.key, o.s), o.m)) return null;
      const d = JSON.parse(o.s);
      return {
        lastSeen: +d.lastSeen || 0, seq: +d.seq || 0, used: cleanUsed(d.used), ver: typeof d.ver === 'string' ? d.ver.slice(0, 20) : '', verAt: +d.verAt || 0,
        revoked: Array.isArray(d.revoked) ? d.revoked.filter(x => typeof x === 'string').slice(0, 5000) : []
      };
    } catch (e) { return null; }
  }
  load() {
    const all = this.files.map(f => this._read(f)).filter(Boolean);
    const m = { lastSeen: 0, revoked: [], seq: 0, used: {}, ver: '', verAt: 0 };
    const rev = new Set();
    all.forEach(d => {
      m.lastSeen = Math.max(m.lastSeen, d.lastSeen); m.seq = Math.max(m.seq, d.seq); d.revoked.forEach(x => rev.add(x));
      if (d.verAt > m.verAt) { m.verAt = d.verAt; m.ver = d.ver; }
      for (const id of Object.keys(d.used)) { /* the copy that remembers the EARLIEST start and the EARLIEST end wins: an old copy never gives extra time */
        const a = m.used[id], b = d.used[id];
        m.used[id] = !a ? b : { at: Math.min(a.at, b.at), exp: a.exp === null ? b.exp : (b.exp === null ? a.exp : Math.min(a.exp, b.exp)) };
      }
    });
    m.revoked = [...rev];
    this.data = m;
    return m;
  }
  save() {
    const txt = this._seal(this.data);
    this.files.forEach(f => {
      try { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = f + '.tmp'; fs.writeFileSync(t, txt); fs.renameSync(t, f); } catch (e) { /* a read-only location is fine: the other copies remain */ }
    });
  }
  /* now: current clock; witnesses: other times that prove "at least this late" (e.g. data file modification times).
     returns { ok, lastSeen }. The latest date is moved forward only when the clock is sane. */
  tick(now, witnesses) {
    const w = Math.max(this.data.lastSeen, ...(witnesses || []).filter(x => Number.isFinite(x)), 0);
    const ok = now + TOLERANCE_MS >= w;
    if (ok && now > this.data.lastSeen) { this.data.lastSeen = now; this.save(); }
    return { ok, lastSeen: w };
  }
  addRevoked(ids) {
    const s = new Set(this.data.revoked); let ch = false;
    (ids || []).forEach(x => { if (typeof x === 'string' && x.length <= 40 && !s.has(x)) { s.add(x); ch = true; } });
    if (ch) { this.data.revoked = [...s]; this.save(); }
  }
  setSeq(n) { if (n > this.data.seq) { this.data.seq = n; this.save(); } }
  getUsed(id) { const u = this.data.used[id]; return u ? { at: u.at, exp: u.exp } : null; }
  /* the first use is recorded once; later calls never move the start or the end */
  markUsed(id, at, exp) {
    if (!ID_RE.test(id) || this.data.used[id]) return false;
    const ids = Object.keys(this.data.used);
    if (ids.length >= MAX_USED) delete this.data.used[ids[0]];
    this.data.used[id] = { at, exp: exp == null ? null : exp };
    this.save();
    return true;
  }
  setVer(v, at) { if (this.data.ver !== v) { this.data.ver = String(v).slice(0, 20); this.data.verAt = Math.max(at || 0, this.data.verAt + 1); this.save(); } }
}

module.exports = { SealedState, TOLERANCE_MS };
