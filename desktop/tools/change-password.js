#!/usr/bin/env node
'use strict';
/* Change the developer password WITHOUT creating new keys (nothing already installed at customers is affected):
   OLDPW=… NEWPW=… node tools/change-password.js [--keys-dir keys]
   Re-encrypts keys/<channel>/vault.json for both channels. Rebuild the Developer installer afterwards (it carries the vaults). */
const fs = require('fs');
const path = require('path');
const V = require('../src/main/lib/vault');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const { OLDPW, NEWPW } = process.env;
if (!OLDPW || !NEWPW || NEWPW.length < 10) { console.error('Set OLDPW and NEWPW (new password: at least 10 characters) in the environment.'); process.exit(2); }
const dir = path.resolve(arg('--keys-dir', path.join(__dirname, '..', 'keys')));
const out = [];
for (const c of ['production', 'developer']) {
  const f = path.join(dir, c, 'vault.json'); if (!fs.existsSync(f)) continue;
  const secrets = V.open(JSON.parse(fs.readFileSync(f, 'utf8')), OLDPW); /* throws if the old password is wrong: nothing is written */
  out.push([f, V.create(NEWPW, secrets)]);
}
if (!out.length) { console.error('no vaults found in ' + dir); process.exit(1); }
for (const [f, v] of out) { fs.copyFileSync(f, f + '.bak'); fs.writeFileSync(f, JSON.stringify(v)); }
console.log('password changed for', out.length, 'vault(s). Old files kept as vault.json.bak — delete them after you confirm the new password works.');
