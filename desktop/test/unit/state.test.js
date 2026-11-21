'use strict';
const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('fs'); const os = require('os'); const path = require('path');
const { SealedState, TOLERANCE_MS } = require('../../src/main/lib/state');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mpd-st-'));
const files = d => [path.join(d, 'a', 's.bin'), path.join(d, 'b', 's.bin')];

test('moving the clock back is detected, small corrections are not', () => {
  const d = tmp(); const s = new SealedState(files(d), 'M1'); s.load();
  const T = 1e12;
  assert.equal(s.tick(T).ok, true); assert.equal(s.tick(T + 1000).ok, true);
  assert.equal(s.tick(T + 1000 - TOLERANCE_MS + 5).ok, true);
  const r = s.tick(T - 3600e3); assert.equal(r.ok, false); assert.equal(r.lastSeen, T + 1000);
});
test('a fresh object reads what an earlier run saved', () => {
  const d = tmp(); const a = new SealedState(files(d), 'M1'); a.load(); a.tick(5e11); a.addRevoked(['LIC-1', 'LIC-2']); a.setSeq(7);
  const b = new SealedState(files(d), 'M1'); const m = b.load();
  assert.equal(m.lastSeen, 5e11); assert.deepEqual(m.revoked.sort(), ['LIC-1', 'LIC-2']); assert.equal(m.seq, 7);
});
test('one copy deleted or edited -> the other still counts; both gone -> witnesses still catch rollback', () => {
  const d = tmp(); const f = files(d); const a = new SealedState(f, 'M1'); a.load(); a.tick(9e11);
  fs.writeFileSync(f[0], '{"s":"{\\"lastSeen\\":1}","m":"00"}');
  assert.equal(new SealedState(f, 'M1').load().lastSeen, 9e11);
  fs.rmSync(f[1]);
  const c = new SealedState(f, 'M1'); c.load(); assert.equal(c.data.lastSeen, 0);
  assert.equal(c.tick(5e11, [9e11]).ok, false, 'a newer data file time proves the clock went back');
});
test('a state sealed on another computer is rejected', () => {
  const d = tmp(); const a = new SealedState(files(d), 'M1'); a.load(); a.tick(9e11);
  assert.equal(new SealedState(files(d), 'M2').load().lastSeen, 0);
});
test('revoked list ignores junk', () => {
  const d = tmp(); const a = new SealedState(files(d), 'M1'); a.load(); a.addRevoked([1, null, 'x'.repeat(100), 'LIC-OK']);
  assert.deepEqual(a.data.revoked, ['LIC-OK']);
});

test('used codes: first use is recorded once and never moves; copies merge to the earliest start/end', () => {
  const d = tmp(); const f = files(d); const a = new SealedState(f, 'M1'); a.load();
  assert.equal(a.markUsed('LIC-AABBCCDD01', 1000, 9000), true);
  assert.equal(a.markUsed('LIC-AABBCCDD01', 5000, 99000), false, 'a second use does not extend the time');
  assert.deepEqual(a.getUsed('LIC-AABBCCDD01'), { at: 1000, exp: 9000 });
  assert.equal(a.markUsed('LIC-AABBCCDD02', 2000, null), true); assert.equal(a.getUsed('LIC-AABBCCDD02').exp, null);
  assert.equal(a.markUsed('not-an-id', 1, 2), false);
  assert.deepEqual(new SealedState(f, 'M1').load().used['LIC-AABBCCDD01'], { at: 1000, exp: 9000 });
  /* one stale copy (older, longer) cannot give extra time */
  const b = new SealedState([f[0]], 'M1'); b.load(); b.data.used['LIC-AABBCCDD01'] = { at: 1000, exp: 50000 }; b.save();
  assert.equal(new SealedState(f, 'M1').load().used['LIC-AABBCCDD01'].exp, 9000);
});
test('program version: the newest record wins; used/ver survive a copy made on another computer? no', () => {
  const d = tmp(); const f = files(d); const a = new SealedState(f, 'M1'); a.load();
  assert.equal(a.data.ver, ''); a.setVer('1.0.0', 100); a.setVer('1.0.0', 200); assert.equal(a.data.verAt, 100, 'same version is not re-written');
  a.setVer('1.0.1', 300);
  const b = new SealedState(f, 'M1'); b.load(); assert.equal(b.data.ver, '1.0.1');
  assert.equal(new SealedState(f, 'M2').load().ver, '', 'state from another computer is ignored');
});
test('junk inside the sealed file is cleaned', () => {
  const d = tmp(); const f = files(d); const a = new SealedState(f, 'M1'); a.load();
  a.data.used = { 'LIC-AABBCCDD01': { at: 1, exp: 2 }, bad: { at: 1, exp: 2 }, 'LIC-AABBCCDD02': { at: 'x', exp: 1 }, 'LIC-AABBCCDD03': null }; a.data.ver = 'x'.repeat(100); a.data.verAt = 5; a.save();
  const m = new SealedState(f, 'M1').load(); assert.deepEqual(Object.keys(m.used), ['LIC-AABBCCDD01']); assert.equal(m.ver.length, 20);
});
