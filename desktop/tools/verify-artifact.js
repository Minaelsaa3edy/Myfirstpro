#!/usr/bin/env node
'use strict';
/* node tools/verify-artifact.js --channel production|developer --dir dist/<channel> [--keys-dir keys (needs DEVPW: also proves the payload key is not in any file)]
   Opens what was really built (the installer folder, the app.asar, the exe) and fails on anything that should never ship. */
const fs = require('fs');
const path = require('path');
const os = require('os');
const asar = require('@electron/asar');
const fuses = require('@electron/fuses');
const ResEdit = require('resedit');
const cu = require('../src/main/lib/cu');
const V = require('./lib/vault');
const ROOT = path.resolve(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const channel = arg('--channel'), dir = path.resolve(arg('--dir', ''));
const ch = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'channels.json'), 'utf8'))[channel];
let fails = 0; const chk = (n, c, x) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  -> ' + (x === undefined ? '' : JSON.stringify(x)))); };
const walk = (d, o = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p, o) : o.push(p); } return o; };

const setup = path.join(dir, ch.slug + (process.argv.includes('--wine-test') ? '-WINETEST' : '') + '-Setup-' + JSON.parse(fs.readFileSync(path.join(ROOT, 'build', channel, 'app', 'package.json'), 'utf8')).version + '.exe');
const unpacked = path.join(dir, 'win-unpacked'), exe = path.join(unpacked, ch.productName + '.exe'), asarFile = path.join(unpacked, 'resources', 'app.asar');
chk('installer exists and is a Windows NSIS executable', fs.existsSync(setup) && fs.statSync(setup).size > 40e6 && (() => { const b = fs.readFileSync(setup); return b.subarray(0, 2).toString() === 'MZ' && b.includes(Buffer.from('Nullsoft')); })());
chk('installer file name has no spaces and carries the channel', !/\s/.test(path.basename(setup)) && (channel === 'developer') === /Developer/.test(path.basename(setup)), path.basename(setup));
chk('program exe exists with the channel product name', fs.existsSync(exe), exe);
chk('no loose app folder next to the asar (only app.asar is loadable)', fs.existsSync(asarFile) && !fs.existsSync(path.join(unpacked, 'resources', 'app')));

/* asar content */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mpd-verify-')); asar.extractAll(asarFile, tmp);
const files = walk(tmp).map(f => path.relative(tmp, f).replace(/\\/g, '/'));
const DEVFILES = ['main/issuer.js', 'main/lib/vault.js', 'renderer/issuer.html', 'renderer/issuer.js', 'renderer/issuer.css', 'renderer/vaults.json'];
const allowed = f => ['package.json', 'channel.json', 'icon.png'].includes(f) || /^(main|preload|renderer)\//.test(f);
chk('asar holds only the program files', files.every(allowed), files.filter(f => !allowed(f)));
chk('asar has no tools, keys, licences, tests or build scripts', !files.some(f => !DEVFILES.includes(f) && /(^|\/)(tools|keys|licenses|updates|test|build|vault|node_modules)(\/|\.|$)/i.test(f)), files);
if (channel === 'production') chk('production build has NO code generator (no issuer, no vault code, no vaults)', !files.some(f => DEVFILES.includes(f) || /issuer|vault/i.test(f)), files.filter(f => /issuer|vault/i.test(f)));
else {
  chk('developer build has the code generator and the sealed vaults', DEVFILES.every(f => files.includes(f)), DEVFILES.filter(f => !files.includes(f)));
  const vj = JSON.parse(fs.readFileSync(path.join(tmp, 'renderer/vaults.json'), 'utf8'));
  chk('vaults are sealed (scrypt + AES-GCM) and hold no readable key text', Object.keys(vj).length >= 1 && Object.values(vj).every(v => v.v === 1 && v.kdf === 'scrypt' && v.N >= 32768 && typeof v.ct === 'string') && !/PRIVATE|BEGIN/.test(JSON.stringify(vj)), Object.keys(vj));
}
const mainSrc = fs.readFileSync(path.join(tmp, 'main/main.js'), 'utf8');
chk('no machine-code flow is left in the program or its activation page', !/machineCode|MPL1\.|كود الجهاز/.test(mainSrc + fs.readFileSync(path.join(tmp, 'renderer/activation.html'), 'utf8') + fs.readFileSync(path.join(tmp, 'renderer/activation.js'), 'utf8')));
chk('developer-only handlers are registered only when the build channel is developer', /if \(!DEV\) return;/.test(mainSrc) && /channel\.dev \? require\('\.\/issuer'\) : null/.test(mainSrc));
chk('page is shipped only sealed (app.enc), never as html', files.includes('renderer/app.enc') && !files.some(f => /app\.html$/.test(f)));
const enc = fs.readFileSync(path.join(tmp, 'renderer/app.enc'));
chk('sealed page has the magic and no readable program text', enc.subarray(0, 4).toString() === 'MPE1' && !enc.includes(Buffer.from('النسخة الأولى')) && !enc.includes(Buffer.from('<html')) && !enc.includes(Buffer.from('localStorage')));
const cj = JSON.parse(fs.readFileSync(path.join(tmp, 'channel.json'), 'utf8'));
chk('channel.json matches the channel', cj.channel === channel && cj.appId === ch.appId && cj.productName === ch.productName && cj.userDataName === ch.userDataName, cj);
chk('channel.json holds public keys only', /BEGIN PUBLIC KEY/.test(cj.licenseKey) && /BEGIN PUBLIC KEY/.test(cj.updateKey) && !/PRIVATE/.test(JSON.stringify(cj)));
chk('production build cannot be mistaken for developer (ids differ)', channel !== 'production' || (!/dev/i.test(cj.appId) && !/Developer/i.test(cj.productName + cj.userDataName)));
chk('update address is https', !cj.updateUrl || /^https:\/\//.test(cj.updateUrl), cj.updateUrl);
let leak = [];
const sens = [/PRIVATE KEY/, /DEVPW/, /licensePrivate/, /updatePrivate/, /vault\.json/];
const sensOk = rel => rel === 'main/issuer.js'; /* the generator names the fields of the unlocked vault; it holds no key material */
const names = Buffer.from('اولاد'), names2 = Buffer.from('أولاد'), names3 = Buffer.from('ميكي'), names4 = Buffer.from('مكي');
for (const f of walk(tmp)) { const b = fs.readFileSync(f), rel = path.relative(tmp, f); if (f.endsWith('app.enc') || f.endsWith('.woff2') || f.endsWith('.png')) continue; const t = b.toString('utf8'); sens.forEach(r => { if (r.test(t) && !(sensOk(rel.replace(/\\/g, '/')) && /licensePrivate|updatePrivate/.test(String(r)))) leak.push(rel + ' ~ ' + r); }); [names, names2, names3, names4].forEach(n => { if (b.includes(n)) leak.push(rel + ' ~ name'); }); }
chk('no private-key material, password variable or forbidden name inside the app', leak.length === 0, leak);
chk('test-only switches exist only behind the developer-channel guard', (() => { const m = fs.readFileSync(path.join(tmp, 'main/main.js'), 'utf8'); return /const denv = k => \(DEV \?/.test(m) && !/process\.env\.MPD_TEST_(NOW|USERDATA)/.test(m.replace(/denv\('MPD_TEST_[A-Z_]+'\)/g, '')); })());
if (process.env.DEVPW && arg('--keys-dir')) {
  for (const c of ['production', 'developer']) {
    const vf = path.join(path.resolve(arg('--keys-dir')), c, 'vault.json'); if (!fs.existsSync(vf)) continue;
    const s = V.open(JSON.parse(fs.readFileSync(vf, 'utf8')), process.env.DEVPW);
    const pk = Buffer.from(s.payloadKey), raw = cu.fromB64u(s.payloadKey), pr = Buffer.from(s.licensePrivate.split('\n')[1] || '#', 'utf8'), up = Buffer.from(s.updatePrivate.split('\n')[1] || '#', 'utf8');
    const hit = [...walk(tmp), exe, asarFile].filter(f => { const b = fs.readFileSync(f); return b.includes(pk) || b.includes(raw) || b.includes(pr) || b.includes(up); });
    chk('[' + c + '] payload key and private keys are in no shipped file (only sealed in the developer vaults)', hit.length === 0, hit);
  }
}
fs.rmSync(tmp, { recursive: true, force: true });

/* exe: fuses + version info + integrity resource */
(async () => {
  const cfg = await fuses.getCurrentFuseWire(exe), F = fuses.FuseV1Options, S = { ENABLE: 49, DISABLE: 48 }; /* wire bytes are the characters '1' and '0' */
  const want = { [F.RunAsNode]: S.DISABLE, [F.EnableCookieEncryption]: S.ENABLE, [F.EnableNodeOptionsEnvironmentVariable]: S.DISABLE, [F.EnableNodeCliInspectArguments]: S.DISABLE, [F.EnableEmbeddedAsarIntegrityValidation]: S.ENABLE, [F.OnlyLoadAppFromAsar]: S.ENABLE, [F.GrantFileProtocolExtraPrivileges]: S.DISABLE };
  const bad = Object.keys(want).filter(k => cfg[k] !== want[k]).map(k => F[k] + '=' + String.fromCharCode(cfg[k]));
  chk('security fuses are set (no run-as-node, no inspect, asar-only, integrity on)', bad.length === 0, bad);
  const pe = ResEdit.NtExecutableResource.from(ResEdit.NtExecutable.from(fs.readFileSync(exe)));
  const vi = ResEdit.Resource.VersionInfo.fromEntries(pe.entries)[0], lang = vi.getAllLanguagesForStringValues()[0], sv = vi.getStringValues(lang);
  chk('exe version info carries the product name and owner', sv.ProductName === ch.productName && /MINA\.N\.F/.test(sv.LegalCopyright || sv.CompanyName || ''), sv);
  chk('exe embeds the asar integrity hash', pe.entries.some(e => String(e.type).toUpperCase() === 'INTEGRITY' && String(e.id).toUpperCase() === 'ELECTRONASAR'), pe.entries.map(e => e.type).filter((v, i, a) => a.indexOf(v) === i));
  console.log(fails ? '\n' + fails + ' CHECK(S) FAILED' : '\nall artifact checks passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('VERIFY CRASH', e); process.exit(2); });
