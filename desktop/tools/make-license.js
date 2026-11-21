#!/usr/bin/env node
'use strict';
/* Issue activation codes from the command line (the Developer build has the same thing as a window: "المطوّر ← مولّد أكواد التفعيل").
   DEVPW=… node tools/make-license.js --channel production (--permanent | --minutes N | --hours N | --days N)
                                      [--within-days N (0 = no limit)] [--label "اسم العميل"] [--count N] [--keys-dir keys]
   The customer receives ONE code. A timed code counts from its first activation on the customer's computer. */
const fs = require('fs');
const path = require('path');
const cu = require('../src/main/lib/cu');
const L = require('../src/main/lib/license');
const { describe } = require('../src/main/issuer');
const V = require('./lib/vault');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const has = k => process.argv.includes(k);
const ROOT = path.resolve(__dirname, '..');
const die = m => { console.error(m); process.exit(1); };

const channel = arg('--channel');
if (!['production', 'developer'].includes(channel)) die('--channel production|developer');
let unit = null, value = 0;
if (has('--permanent')) unit = 'permanent';
for (const u of ['minutes', 'hours', 'days']) if (has('--' + u)) { if (unit) die('choose ONE of --permanent --minutes --hours --days'); unit = u; value = Math.floor(+arg('--' + u)); }
if (!unit) die('choose one of --permanent | --minutes N | --hours N | --days N');
if (unit !== 'permanent' && !(value >= 1 && value <= 65535)) die('duration must be 1..65535');
const count = has('--count') ? Math.floor(+arg('--count')) : 1; if (!(count >= 1 && count <= 50)) die('--count 1..50');
const within = has('--within-days') ? Math.floor(+arg('--within-days')) : (unit === 'permanent' ? 365 : 30);
const label = String(arg('--label', '')).replace(/[\u0000-\u001f]/g, ' ').slice(0, 60);
const keysDir = path.resolve(arg('--keys-dir', path.join(ROOT, 'keys')), channel);
const secrets = V.open(JSON.parse(fs.readFileSync(path.join(keysDir, 'vault.json'), 'utf8')), V.pw());
const payloadKey = cu.fromB64u(secrets.payloadKey), now = Date.now();
for (let i = 0; i < count; i++) {
  const code = L.issue({ channel, unit, value, payloadKey, now, withinDays: within }, secrets.licensePrivate);
  const info = L.parse(code).info, d = describe({ channel, unit, value, within, label, code });
  fs.appendFileSync(path.join(keysDir, 'issued.jsonl'), JSON.stringify({ t: now, id: info.id, channel, unit, value, within, label, code }) + '\n');
  console.log('\n# ' + info.id + ' — ' + d.summary + '\n' + (has('--message') ? d.message : code));
}
