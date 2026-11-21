'use strict';
const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('fs'); const os = require('os'); const path = require('path'); const crypto = require('crypto');
const cu = require('../../src/main/lib/cu'); const V = require('../../src/main/lib/vault'); const L = require('../../src/main/lib/license'); const I = require('../../src/main/issuer');
const mk = () => { const k = cu.genKeyPair(), u = cu.genKeyPair(), pk = crypto.randomBytes(32); return { k, pk, v: V.create('right-password-1', { licensePrivate: k.privateKey, updatePrivate: u.privateKey, payloadKey: cu.b64u(pk) }) }; };
const P = mk(), Dv = mk(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpd-iss-')), vf = path.join(dir, 'vaults.json'), lf = path.join(dir, 'issued.jsonl');
fs.writeFileSync(vf, JSON.stringify({ production: P.v, developer: Dv.v }));
let clock = Date.parse('2026-06-01T00:00:00Z');
const gen = () => I.create({ vaultsFile: vf, logFile: lf, now: () => clock });

test('vault: right password opens, wrong fails, nothing readable inside', () => {
  assert.equal(V.open(P.v, 'right-password-1').payloadKey, cu.b64u(P.pk));
  assert.throws(() => V.open(P.v, 'wrong-password-1'), /wrong password/);
  assert.ok(!JSON.stringify(P.v).includes('PRIVATE') && P.v.N >= 1 << 17);
  assert.throws(() => V.open(Object.assign({}, P.v, { N: 1 << 25 }), 'right-password-1'), /bad vault/, 'absurd cost parameters are refused');
});
test('generator: locked until the password is right; issues codes the program accepts; logs them', async () => {
  const g = gen();
  assert.equal(g.issue({ channel: 'production', unit: 'hours', value: 1, count: 1 }).code, 'NOT_UNLOCKED');
  assert.equal((await g.unlock('wrong-password-1')).code, 'BAD_PASSWORD'); assert.equal(g.isUnlocked(), false);
  assert.deepEqual((await g.unlock('right-password-1')).channels.sort(), ['developer', 'production']);
  const r = g.issue({ channel: 'production', unit: 'hours', value: 24, label: 'عميل\nاختبار', count: 3 });
  assert.equal(r.ok, true); assert.equal(r.items.length, 3); assert.equal(new Set(r.items.map(i => i.id)).size, 3);
  const c = L.check(r.items[0].code, { pubKey: P.k.publicKey, channel: 'production', now: clock + 1000 });
  assert.equal(c.ok, true); assert.equal(c.info.unit, 'hours'); assert.equal(c.info.value, 24); assert.ok(c.payloadKey.equals(P.pk));
  assert.equal(L.check(r.items[0].code, { pubKey: Dv.k.publicKey, channel: 'developer', now: clock }).ok, false);
  assert.match(r.items[0].message, /احتفظ بالكود/); assert.match(r.items[0].message, /24 ساعة/); assert.ok(r.items[0].message.includes(r.items[0].code)); assert.ok(!/\n.*\n.*عميل\nاختبار/.test(r.items[0].message));
  const d = g.issue({ channel: 'developer', unit: 'permanent', count: 1 }); assert.equal(L.check(d.items[0].code, { pubKey: Dv.k.publicKey, channel: 'developer', now: clock }).ok, true);
  assert.equal(g.list().rows.length, 4);
  for (const bad of [{ channel: 'production', unit: 'days', value: 0, count: 1 }, { channel: 'production', unit: 'weeks', value: 1, count: 1 }, { channel: 'production', unit: 'hours', value: 1, count: 51 }, { channel: 'x', unit: 'hours', value: 1, count: 1 }, null, 'x'])
    assert.equal(g.issue(bad).ok, false, JSON.stringify(bad));
  g.lock(); assert.equal(g.issue({ channel: 'production', unit: 'permanent', count: 1 }).code, 'NOT_UNLOCKED'); assert.equal(g.list().ok, false);
  assert.equal(fs.readFileSync(lf, 'utf8').trim().split('\n').length, 4);
});
test('generator: five wrong passwords cause a pause; developer sign-in uses only the developer vault', async () => {
  const g = gen();
  for (let i = 0; i < 5; i++) assert.equal((await g.unlock('nope-nope-nope')).code, 'BAD_PASSWORD');
  assert.equal((await g.unlock('right-password-1')).code, 'LOCKED_WAIT');
  const g2 = gen(); const k = await g2.devPayloadKey('right-password-1'); assert.ok(k.ok && k.payloadKey.equals(Dv.pk));
  assert.equal((await g2.devPayloadKey('nope-nope-nope')).code, 'BAD_PASSWORD');
});
test('generator without vaults offers nothing', async () => {
  const g = I.create({ vaultsFile: path.join(dir, 'missing.json'), logFile: lf, now: () => clock });
  assert.equal(g.hasVaults(), false); assert.equal((await g.unlock('right-password-1')).code, 'NO_VAULT');
});
