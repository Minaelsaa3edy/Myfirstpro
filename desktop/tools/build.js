#!/usr/bin/env node
'use strict';
/* DEVPW=… node tools/build.js --channel production|developer [--version 1.0.0] [--keys-dir keys] [--out dist] [--stage-only]
   1 compose the program page from the web build   2 seal it (AES-256-GCM, key from the channel vault)
   3 stage the app folder (+ channel.json with the PUBLIC keys only)   4 electron-builder -> NSIS installer (asar + fuses)   5 verify the result */
const fs = require('fs');
const path = require('path');
const cu = require('../src/main/lib/cu');
const V = require('./lib/vault');
const { compose } = require('./compose-renderer');
const ROOT = path.resolve(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const has = k => process.argv.includes(k);

async function main() {
  const channel = arg('--channel');
  if (!['production', 'developer'].includes(channel)) throw new Error('--channel production|developer');
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const version = arg('--version', pkg.version);
  if (!/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(version)) throw new Error('version must be a.b.c');
  const keysDir = path.resolve(arg('--keys-dir', path.join(ROOT, 'keys')), channel);
  const out = path.resolve(arg('--out', path.join(ROOT, 'dist')), channel);
  const ch = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'channels.json'), 'utf8'))[channel];
  const pub = JSON.parse(fs.readFileSync(path.join(keysDir, 'public.json'), 'utf8'));
  if (pub.channel !== channel) throw new Error('public.json belongs to another channel');
  const secrets = V.open(JSON.parse(fs.readFileSync(path.join(keysDir, 'vault.json'), 'utf8')), V.pw());
  const payloadKey = cu.fromB64u(secrets.payloadKey);

  /* 1+2 page -> sealed payload */
  const { html, webVersion } = compose();
  if (/اولاد|أولاد|ميكي|\bمكي/.test(html)) throw new Error('forbidden name found in the page');
  const sealed = Buffer.concat([Buffer.from('MPE1'), cu.seal(payloadKey, Buffer.from(html, 'utf8'), 'MPD-PAYLOAD-v1')]);

  /* 3 stage */
  const stage = path.join(ROOT, 'build', channel, 'app');
  fs.rmSync(path.join(ROOT, 'build', channel), { recursive: true, force: true });
  fs.mkdirSync(path.join(stage, 'renderer'), { recursive: true });
  const cp = (a, b, filter) => fs.cpSync(a, b, { recursive: true, filter });
  /* the activation-code generator (main/issuer.js, main/lib/vault.js, renderer/issuer.*, vaults.json) goes into the Developer build ONLY */
  const dev = channel === 'developer', devOnly = /[\\/](issuer\.js|issuer\.html|issuer\.css|vault\.js)$/;
  cp(path.join(ROOT, 'src', 'main'), path.join(stage, 'main'), s => dev || !devOnly.test(s)); cp(path.join(ROOT, 'src', 'preload'), path.join(stage, 'preload'));
  cp(path.join(ROOT, 'src', 'renderer'), path.join(stage, 'renderer'), s => !s.endsWith('mpd-shim.js') && (dev || !devOnly.test(s))); /* the shim travels inside the sealed page */
  if (dev) { /* sealed vaults only (scrypt + AES-256-GCM): useless without the developer password */
    const vaults = {}, parent = path.dirname(keysDir);
    for (const c of ['production', 'developer']) { const f = path.join(parent, c, 'vault.json'); if (fs.existsSync(f)) vaults[c] = JSON.parse(fs.readFileSync(f, 'utf8')); else console.log('NOTE: no ' + c + ' vault in ' + parent + ' — the generator will not offer that channel'); }
    if (!vaults.developer) throw new Error('the developer vault is required for the Developer build');
    fs.writeFileSync(path.join(stage, 'renderer', 'vaults.json'), JSON.stringify(vaults));
  }
  fs.writeFileSync(path.join(stage, 'renderer', 'app.enc'), sealed);
  fs.copyFileSync(path.join(ROOT, 'assets', 'icon-512.png'), path.join(stage, 'icon.png'));
  const updateUrl = arg('--update-url', ch.updateUrl);
  if (updateUrl && !/^https:\/\//.test(updateUrl)) throw new Error('--update-url must be https');
  fs.writeFileSync(path.join(stage, 'channel.json'), JSON.stringify({
    channel, appId: ch.appId, productName: ch.productName, userDataName: ch.userDataName, version, webVersion,
    updateUrl, licenseKey: pub.licenseKey, updateKey: pub.updateKey
  }, null, 1));
  fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify({ name: ch.slug.toLowerCase(), productName: ch.productName, version, description: ch.productName, author: 'MINA.N.F', main: 'main/main.js', license: 'UNLICENSED' }, null, 1));
  console.log('staged', stage, '— web', webVersion, '— payload', sealed.length, 'bytes');
  if (has('--stage-only')) return { stage };

  /* 4 installer */
  const builder = require('electron-builder');
  /* --wine-test: only for trying the installer under Wine on the build server (Wine's tasklist/findstr cannot do the "is it running" check). Never shipped. */
  const wineTest = has('--wine-test');
  /* installer pages: welcome (big logo) -> folder -> install -> finish. Always per-user (no admin prompt, silent updates just work),
     so the English-only "all users / only me" page is removed. */
  const nshInclude = path.join(ROOT, 'build', channel, 'installer.nsh');
  fs.writeFileSync(nshInclude, '!macro customWelcomePage\n  !insertmacro MUI_PAGE_WELCOME\n!macroend\n!macro customInstallMode\n  StrCpy $isForceCurrentInstall "1"\n!macroend\n' +
    (wineTest ? '!macro customCheckAppRunning\n!macroend\n' : ''));
  if (wineTest) console.log('WARNING: --wine-test installer — NOT for release');
  const config = {
    appId: ch.appId, productName: ch.productName, copyright: 'MINA.N.F',
    directories: { app: stage, output: out, buildResources: path.join(ROOT, 'assets') },
    electronVersion: pkg.devDependencies.electron, asar: true, compression: 'normal', npmRebuild: false, nodeGypRebuild: false, buildDependenciesFromSource: false,
    artifactName: ch.slug + (has('--wine-test') ? '-WINETEST' : '') + '-Setup-${version}.${ext}', publish: null,
    electronFuses: { runAsNode: false, enableCookieEncryption: true, enableNodeOptionsEnvironmentVariable: false, enableNodeCliInspectArguments: false, enableEmbeddedAsarIntegrityValidation: true, onlyLoadAppFromAsar: true, grantFileProtocolExtraPrivileges: false },
    win: { target: [{ target: 'nsis', arch: ['x64'] }], icon: path.join(ROOT, 'assets', 'icon.ico'), requestedExecutionLevel: 'asInvoker' },
    nsis: {
      oneClick: false, perMachine: false, allowElevation: true, allowToChangeInstallationDirectory: true, createDesktopShortcut: true, createStartMenuShortcut: true,
      shortcutName: ch.productName, runAfterFinish: true, deleteAppDataOnUninstall: false, differentialPackage: false, language: '1025', installerLanguages: ['ar_SA'], displayLanguageSelector: false,
      uninstallDisplayName: ch.productName, include: nshInclude, installerIcon: path.join(ROOT, 'assets', 'icon.ico'), uninstallerIcon: path.join(ROOT, 'assets', 'icon.ico'), installerHeader: path.join(ROOT, 'assets', 'installerHeader.bmp'), installerSidebar: path.join(ROOT, 'assets', 'installerSidebar.bmp'), uninstallerSidebar: path.join(ROOT, 'assets', 'installerSidebar.bmp')
    }
  };
  await builder.build({ targets: builder.Platform.WINDOWS.createTarget('nsis', builder.Arch.x64), config, publish: 'never' });
  for (const f of fs.readdirSync(out)) if (/^latest.*\.yml$/.test(f) || f.endsWith('.blockmap')) fs.rmSync(path.join(out, f), { force: true }); /* we use our own signed updater */
  return { stage, out };
}
main().then(r => { console.log('build finished', JSON.stringify(r)); }).catch(e => { console.error('BUILD FAILED:', e && e.stack || e); process.exit(1); });
