'use strict';
const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('fs'); const os = require('os'); const path = require('path');
const { DataStore } = require('../../src/main/lib/store');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mpd-ds-'));
const K = n => ({ 'accounts.trial.v1': JSON.stringify({ n, name: 'عميل ' + n }) });

test('write then snapshot returns the same keys', () => {
  const d = tmp(), s = new DataStore(d, { delay: 0 }); s.writeNow(K(1));
  const r = new DataStore(d).snapshot(); assert.deepEqual(r.keys, K(1)); assert.equal(JSON.parse(r.keys['accounts.trial.v1']).name, 'عميل 1');
});
test('empty folder -> null', () => assert.equal(new DataStore(tmp()).snapshot(), null));
test('a damaged db.json falls back to the newest valid backup', () => {
  const d = tmp(); let t = 1e12; const s = new DataStore(d, { now: () => t, backupEveryMs: 0 });
  s.writeNow(K(1)); t += 2000; s.writeNow(K(2)); t += 2000; s.writeNow(K(3));
  fs.writeFileSync(path.join(d, 'db.json'), '{"v":1,"truncated');
  const r = new DataStore(d).snapshot(); assert.ok(r); assert.equal(JSON.parse(r.keys['accounts.trial.v1']).n, 2);
});
test('content edited by hand (hash mismatch) is rejected', () => {
  const d = tmp(), s = new DataStore(d); s.writeNow(K(1));
  const o = JSON.parse(fs.readFileSync(path.join(d, 'db.json'), 'utf8')); o.keys = o.keys.replace('عميل', 'غريب'); fs.writeFileSync(path.join(d, 'db.json'), JSON.stringify(o));
  assert.equal(new DataStore(d).snapshot(), null);
});
test('leftover temp file from a crash never replaces the good file', () => {
  const d = tmp(), s = new DataStore(d); s.writeNow(K(1)); fs.writeFileSync(path.join(d, 'db.json.tmp999'), 'garbage');
  assert.equal(JSON.parse(new DataStore(d).snapshot().keys['accounts.trial.v1']).n, 1);
});
test('backups are rate limited and pruned', () => {
  const d = tmp(); let t = 1e12; const s = new DataStore(d, { now: () => t, backupEveryMs: 1000, keep: 3 });
  for (let i = 0; i < 12; i++) { s.writeNow(K(i)); t += 1500; }
  const n = fs.readdirSync(path.join(d, 'backups')).filter(x => x.startsWith('auto-')).length; assert.equal(n, 3);
  const s2 = new DataStore(tmp(), { now: () => t, backupEveryMs: 1e9 }); for (let i = 0; i < 5; i++) s2.writeNow(K(i));
  assert.ok(fs.readdirSync(s2.bdir).length <= 1);
});
test('debounced write is flushed on demand', () => {
  const d = tmp(), s = new DataStore(d, { delay: 60000 }); s.write(K(1)); s.write(K(2)); assert.equal(new DataStore(d).snapshot(), null);
  s.flush(); assert.equal(JSON.parse(new DataStore(d).snapshot().keys['accounts.trial.v1']).n, 2);
});
test('export writes a readable file', () => {
  const d = tmp(), s = new DataStore(d); s.writeNow(K(5)); const f = path.join(d, 'out.json'); assert.equal(s.exportTo(f), true);
  assert.equal(JSON.parse(fs.readFileSync(f, 'utf8')).keys['accounts.trial.v1'].includes('عميل 5'), true);
  assert.equal(new DataStore(tmp()).exportTo(path.join(d, 'x.json')), false);
});
