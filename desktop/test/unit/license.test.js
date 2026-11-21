'use strict';
const test = require('node:test'); const assert = require('node:assert/strict'); const crypto = require('crypto');
const cu = require('../../src/main/lib/cu'); const L = require('../../src/main/lib/license');
const kp = cu.genKeyPair(), other = cu.genKeyPair(), PK = crypto.randomBytes(32);
const T0 = Date.parse('2026-06-01T00:00:00Z'), H = 3600e3, D = 86400e3;
const base = { pubKey: kp.publicKey, channel: 'production', now: T0 };
const mk = o => L.issue(Object.assign({ channel: 'production', unit: 'permanent', payloadKey: PK, now: T0 }, o), kp.privateKey);

test('code is short, prefixed and carries everything in itself', () => {
  const c = mk({}); assert.match(c, /^MPD2\.[A-Za-z0-9_-]{150}$/); assert.ok(c.length < 160);
  const p = L.parse(c); assert.equal(p.info.unit, 'permanent'); assert.equal(p.info.channel, 'production'); assert.match(p.info.id, /^LIC-[0-9A-F]{10}$/);
  assert.notEqual(mk({}), mk({}), 'every code is unique');
});
test('permanent code passes, returns the payload key, never expires', () => {
  const c = mk({}), r = L.check(c, Object.assign({}, base, { now: T0 + D }));
  assert.equal(r.ok, true); assert.equal(r.fresh, true); assert.equal(r.exp, null); assert.ok(r.payloadKey.equals(PK));
  const later = L.check(c, Object.assign({}, base, { now: T0 + 4000 * D, used: { at: r.at, exp: null } }));
  assert.equal(later.ok, true, 'a permanent code that was activated keeps working for ever'); assert.equal(later.fresh, false);
});
test('timed codes: minutes / hours / days all count from the FIRST activation', () => {
  for (const [unit, value, ms] of [['minutes', 30, 30 * 60e3], ['hours', 24, 24 * H], ['days', 7, 7 * D]]) {
    const c = mk({ unit, value }), at = T0 + 3 * D;
    const r = L.check(c, Object.assign({}, base, { now: at }));
    assert.equal(r.ok, true, unit); assert.equal(r.at, at); assert.equal(r.exp, at + ms); assert.equal(r.fresh, true); assert.equal(L.durationMs(r.info), ms);
    /* typing the same code again later (e.g. after an update) keeps the original end — it does not restart */
    const rec = { at: r.at, exp: r.exp };
    const again = L.check(c, Object.assign({}, base, { now: at + ms / 2, used: rec }));
    assert.equal(again.ok, true); assert.equal(again.fresh, false); assert.equal(again.exp, at + ms);
    assert.equal(L.check(c, Object.assign({}, base, { now: at + ms + 1, used: rec })).code, 'EXPIRED');
    assert.equal(L.check(c, Object.assign({}, base, { now: at + ms, used: rec })).ok, true, 'the last instant is still valid');
  }
});
test('the activation window: a code must be activated in time, but a code already used is not affected', () => {
  const c = mk({ unit: 'hours', value: 2, withinDays: 3 });
  assert.equal(L.check(c, Object.assign({}, base, { now: T0 + 2 * D })).ok, true);
  assert.equal(L.check(c, Object.assign({}, base, { now: T0 + 4 * D })).code, 'TOO_LATE');
  assert.equal(L.check(c, Object.assign({}, base, { now: T0 + 4 * D + H, used: { at: T0 + D, exp: T0 + 4 * D + 2 * H } })).ok, true);
  assert.equal(L.check(mk({ withinDays: 0 }), Object.assign({}, base, { now: T0 + 3000 * D })).ok, true, '0 = no limit');
});
test('clock moved back: timed codes lock, permanent codes do not care', () => {
  assert.equal(L.check(mk({ unit: 'days', value: 3 }), Object.assign({}, base, { clockOk: false })).code, 'CLOCK');
  assert.equal(L.check(mk({}), Object.assign({}, base, { clockOk: false })).ok, true);
});
test('wrong channel, revoked (array or Set)', () => {
  assert.equal(L.check(mk({}), Object.assign({}, base, { channel: 'developer' })).code, 'WRONG_CHANNEL');
  const c = mk({ id: 'AABBCCDD01' });
  assert.equal(L.check(c, Object.assign({}, base, { revoked: ['LIC-AABBCCDD01'] })).code, 'REVOKED');
  assert.equal(L.check(c, Object.assign({}, base, { revoked: new Set(['LIC-AABBCCDD01']) })).code, 'REVOKED');
  assert.equal(L.check(c, Object.assign({}, base, { revoked: ['LIC-OTHER'] })).ok, true);
});
test('tampering: any changed byte, truncation, a foreign key, a signature from another purpose', () => {
  const c = mk({ unit: 'hours', value: 1 }), raw = cu.fromB64u(c.slice(5));
  for (const i of [0, 1, 2, 7, 8, 9, 13, 16, 30, 47, 48, 80, 111]) {
    const b = Buffer.from(raw); b[i] ^= 1;
    const r = L.check('MPD2.' + cu.b64u(b), base); assert.equal(r.ok, false, 'byte ' + i); assert.ok(['BAD_SIGNATURE', 'MALFORMED'].includes(r.code), 'byte ' + i + ' ' + r.code);
  }
  /* e.g. turning "1 hour" into "65535 hours" or "permanent" by editing the body must fail */
  const up = Buffer.from(raw); up[1] = 0; up.writeUInt16BE(0, 7); assert.equal(L.check('MPD2.' + cu.b64u(up), base).ok, false);
  assert.equal(L.check(c.slice(0, -4), base).code, 'MALFORMED');
  assert.equal(L.check(L.issue({ channel: 'production', unit: 'permanent', payloadKey: PK, now: T0 }, other.privateKey), base).code, 'BAD_SIGNATURE');
  const forged = cu.sign('MPD-UPD-v1', raw.subarray(0, 48), kp.privateKey); /* a valid signature, but for the UPDATE purpose */
  assert.equal(L.check('MPD2.' + cu.b64u(Buffer.concat([raw.subarray(0, 48), cu.fromB64u(forged)])), base).code, 'BAD_SIGNATURE');
});
test('input cleaning: spaces, line breaks, invisible direction marks, junk', () => {
  const c = mk({}), wrapped = c.match(/.{1,40}/g).join('\r\n  ') + '‏‪';
  assert.equal(L.check(wrapped, base).ok, true); assert.equal(L.check('  ' + c + '\n', base).ok, true);
  for (const x of [null, undefined, '', '   ', 'hello', 'MPD2.', 'MPD1.' + c.slice(5), 'MPD2.' + '!'.repeat(150), 'MPD2.' + 'A'.repeat(500), 12345, {}]) assert.equal(L.check(x, base).code, 'MALFORMED', String(x).slice(0, 20));
});
test('payload key is wrapped: different codes wrap it differently, and it is not visible in the code', () => {
  const a = mk({}), b = mk({}); assert.ok(!cu.fromB64u(a.slice(5)).includes(PK));
  assert.ok(!cu.fromB64u(a.slice(5)).subarray(16, 48).equals(cu.fromB64u(b.slice(5)).subarray(16, 48)));
  assert.ok(L.check(b, base).payloadKey.equals(PK));
});
test('issue() refuses impossible requests', () => {
  for (const o of [{ unit: 'weeks', value: 1 }, { unit: 'hours', value: 0 }, { unit: 'minutes', value: 70000 }, { unit: 'days', value: 4000 }, { unit: 'hours', value: 1.5 + 0.5 - 2 }, { channel: 'staging' }, { payloadKey: Buffer.alloc(5) }, { withinDays: -1 }, { id: 'AB' }])
    assert.throws(() => mk(o), undefined, JSON.stringify(o));
  assert.equal(L.parse(mk({ unit: 'hours', value: 48 })).info.value, 48);
});
