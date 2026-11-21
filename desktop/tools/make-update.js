#!/usr/bin/env node
'use strict';
/* DEVPW=… node tools/make-update.js --channel production --installer dist/production/Myfirstpro-Desktop-Setup-1.0.1.exe --version 1.0.1
        [--url https://…/Setup.exe] [--notes "…"] [--min 1.0.0] [--revoke LIC-A,LIC-B] [--seq N] [--out updates] [--keys-dir keys]
   Writes update.json (signed manifest, for the online check) and <installer>.mpupdate (single file for "تحديث من ملف", works with no internet). */
const fs = require('fs');
const path = require('path');
const U = require('../src/main/lib/update');
const V = require('./lib/vault');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ROOT = path.resolve(__dirname, '..');
(async () => {
  const channel = arg('--channel');
  if (!['production', 'developer'].includes(channel)) throw new Error('--channel production|developer');
  const inst = path.resolve(arg('--installer', ''));
  if (!fs.existsSync(inst) || !inst.endsWith('.exe')) throw new Error('--installer must be an existing .exe');
  const version = arg('--version', ''); if (!/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(version)) throw new Error('--version a.b.c');
  const keysDir = path.resolve(arg('--keys-dir', path.join(ROOT, 'keys')), channel);
  const seqFile = path.join(keysDir, 'update-seq.txt');
  const seq = arg('--seq') ? +arg('--seq') : (fs.existsSync(seqFile) ? +fs.readFileSync(seqFile, 'utf8') : 0) + 1;
  const secrets = V.open(JSON.parse(fs.readFileSync(path.join(keysDir, 'vault.json'), 'utf8')), V.pw());
  const url = arg('--url'); if (url && !/^https:\/\//.test(url)) throw new Error('--url must be https');
  const m = await U.makeManifest({ channel, version, seq, installerPath: inst, url, notes: arg('--notes', ''), min: arg('--min'), revoke: (arg('--revoke', '') || '').split(',').map(s => s.trim()).filter(Boolean) });
  const env = U.signManifest(m, secrets.updatePrivate);
  const out = path.resolve(arg('--out', path.join(ROOT, 'updates', channel))); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'update.json'), JSON.stringify(env));
  const pkg = path.join(out, path.basename(inst).replace(/\.exe$/, '.mpupdate')); await U.writeContainer(pkg, env, inst);
  fs.writeFileSync(seqFile, String(seq));
  console.log('update', version, 'seq', seq, '\n ', path.join(out, 'update.json'), '\n ', pkg, '\n  sha512', m.file.sha512.slice(0, 24) + '…', 'size', m.file.size);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
