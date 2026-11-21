'use strict';
/* Activation code (offline). The developer gives the customer ONE code; the customer pastes it. Nothing else to exchange.
   A code is: permanent, or valid for N minutes / hours / days counted from its FIRST activation on that computer.
   Format:  MPD2.<base64url( body 16 bytes | wrapped payload key 32 bytes | ECDSA P-256 signature 64 bytes )>
   body = version(1) flags(1: channel + unit) id(5) value(u16) issued(u32 seconds since 2025-01-01) activateWithinDays(u16) reserved(1)
   The signature covers body + wrapped key, so nothing in a code can be changed. The wrapped key lets the program open its own sealed files. */
const crypto = require('crypto');
const cu = require('./cu');

const PURPOSE = 'MPD-LIC-v2';
const PREFIX = 'MPD2.';
const EPOCH_S = Date.UTC(2025, 0, 1) / 1000;
const UNITS = ['permanent', 'minutes', 'hours', 'days'];
const UNIT_MS = [0, 60e3, 3600e3, 86400e3];
const CH = ['production', 'developer'];
const LEN = 16 + 32 + 64;

const wrapMask = body => cu.hkdf(body, 'MPD-wk-v2', 'MPD payload wrap v2');
const xor = (a, b) => { const o = Buffer.alloc(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i] ^ b[i]; return o; };

/* developer side: o = { channel, unit:'permanent'|'minutes'|'hours'|'days', value, payloadKey, now, withinDays, id } */
function issue(o, privatePem) {
  const ch = CH.indexOf(o.channel), unit = UNITS.indexOf(o.unit);
  if (ch < 0) throw new Error('bad channel'); if (unit < 0) throw new Error('unit must be permanent|minutes|hours|days');
  const value = unit === 0 ? 0 : Math.floor(+o.value);
  if (unit && !(value >= 1 && value <= 65535)) throw new Error('duration must be 1..65535');
  if (unit === 3 && value > 3650) throw new Error('days must be at most 3650');
  const within = o.withinDays == null ? 365 : Math.floor(+o.withinDays);
  if (!(within >= 0 && within <= 65535)) throw new Error('bad activate-within');
  if (!Buffer.isBuffer(o.payloadKey) || o.payloadKey.length !== 32) throw new Error('payloadKey (32 bytes) required');
  const id = o.id ? Buffer.from(o.id, 'hex') : crypto.randomBytes(5); if (id.length !== 5) throw new Error('bad id');
  const body = Buffer.alloc(16); body[0] = 2; body[1] = ch | (unit << 2); id.copy(body, 2); body.writeUInt16BE(value, 7);
  body.writeUInt32BE(Math.floor(((o.now || Date.now()) / 1000) - EPOCH_S), 9); body.writeUInt16BE(within, 13);
  const wk = xor(o.payloadKey, wrapMask(body));
  const signed = Buffer.concat([body, wk]);
  const sig = cu.fromB64u(cu.sign(PURPOSE, signed, privatePem));
  return PREFIX + cu.b64u(Buffer.concat([signed, sig]));
}

function parse(input) {
  const s = String(input == null ? '' : input).replace(/[\s‎‏‪-‮​]+/g, '');
  if (!s.startsWith(PREFIX) || s.length > 400) return null;
  let raw; try { raw = cu.fromB64u(s.slice(PREFIX.length)); } catch (e) { return null; }
  if (raw.length !== LEN || raw[0] !== 2) return null;
  const body = raw.subarray(0, 16), flags = raw[1];
  if ((flags >> 4) !== 0) return null;
  const unit = (flags >> 2) & 3, ch = flags & 3;
  if (ch > 1) return null;
  const value = body.readUInt16BE(7);
  if ((unit === 0) !== (value === 0)) return null;
  return {
    signed: raw.subarray(0, 48), sig: cu.b64u(raw.subarray(48)), body, wk: raw.subarray(16, 48),
    info: { id: 'LIC-' + body.subarray(2, 7).toString('hex').toUpperCase(), channel: CH[ch], unit: UNITS[unit], value, issuedMs: (body.readUInt32BE(9) + EPOCH_S) * 1000, withinDays: body.readUInt16BE(13) }
  };
}
const durationMs = info => info.unit === 'permanent' ? 0 : info.value * UNIT_MS[UNITS.indexOf(info.unit)];

/* ctx = { pubKey, channel, now, revoked, used:{at,exp}|null (what this computer already recorded for this code), clockOk }
   -> { ok, code, info?, at?, exp?, fresh?, payloadKey? }
   code: OK MALFORMED BAD_SIGNATURE WRONG_CHANNEL REVOKED TOO_LATE EXPIRED CLOCK */
function check(input, ctx) {
  const p = parse(input);
  if (!p) return { ok: false, code: 'MALFORMED' };
  if (!cu.verify(PURPOSE, p.signed, p.sig, ctx.pubKey)) return { ok: false, code: 'BAD_SIGNATURE' };
  const info = p.info, now = ctx.now == null ? Date.now() : ctx.now;
  if (info.channel !== ctx.channel) return { ok: false, code: 'WRONG_CHANNEL', info };
  const rev = ctx.revoked instanceof Set ? ctx.revoked : new Set(ctx.revoked || []);
  if (rev.has(info.id)) return { ok: false, code: 'REVOKED', info };
  const rec = ctx.used || null;
  if (!rec && info.withinDays > 0 && now > info.issuedMs + info.withinDays * 86400e3) return { ok: false, code: 'TOO_LATE', info };
  const at = rec ? rec.at : now;
  const exp = info.unit === 'permanent' ? null : (rec ? rec.exp : now + durationMs(info));
  if (exp != null) {
    if (now > exp) return { ok: false, code: 'EXPIRED', info, at, exp };
    if (ctx.clockOk === false) return { ok: false, code: 'CLOCK', info, at, exp }; /* the computer's date was moved back */
  }
  return { ok: true, code: 'OK', info, at, exp, fresh: !rec, payloadKey: xor(p.wk, wrapMask(p.body)) };
}

module.exports = { PURPOSE, PREFIX, UNITS, issue, parse, check, durationMs };
