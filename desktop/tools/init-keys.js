#!/usr/bin/env node
'use strict';
/* One-time creation of a channel's keys:  DEVPW=… node tools/init-keys.js --channel production|developer [--keys-dir keys]
   licence key pair + update key pair + payload key. Public parts go to <keys>/<channel>/public.json (safe to ship),
   private parts only into <keys>/<channel>/vault.json (sealed under the developer password; never shipped). */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cu = require('../src/main/lib/cu');
const V = require('./lib/vault');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const channel = arg('--channel');
if (!['production', 'developer'].includes(channel)) { console.error('--channel production|developer'); process.exit(1); }
const dir = path.resolve(arg('--keys-dir', path.join(__dirname, '..', 'keys')), channel);
const vf = path.join(dir, 'vault.json');
if (fs.existsSync(vf) && !process.argv.includes('--force')) { console.error('Keys for "' + channel + '" already exist. Replacing them would stop every installed copy from accepting new licences and updates. Use --force only if that is intended.'); process.exit(3); }
const password = V.pw();
const lic = cu.genKeyPair(), upd = cu.genKeyPair(), payloadKey = crypto.randomBytes(32);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(vf, JSON.stringify(V.create(password, { licensePrivate: lic.privateKey, updatePrivate: upd.privateKey, payloadKey: cu.b64u(payloadKey) })));
fs.writeFileSync(path.join(dir, 'public.json'), JSON.stringify({ channel, licenseKey: lic.publicKey, updateKey: upd.publicKey, createdAt: new Date().toISOString() }, null, 1));
console.log('keys created for', channel, '\n  licence key  ', V.fingerprint(lic.publicKey), '\n  update key   ', V.fingerprint(upd.publicKey));
