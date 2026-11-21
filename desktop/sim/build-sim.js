#!/usr/bin/env node
'use strict';
/* Builds the browser simulator: node sim/build-sim.js  ->  sim/dist/sim.html (the page content to publish) and sim/dist/sim.test.html (same page wrapped for a local browser).
   The simulator uses THROWAWAY keys made here (sim/sim-keys.json). They are unrelated to the real release keys, so a simulator code never works in the real program. */
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..'); const R = path.join(ROOT, 'src', 'renderer');
const { compose } = require('../tools/compose-renderer');

const KF = path.join(__dirname, 'sim-keys.json');
if (!fs.existsSync(KF)) {
  const mk = () => { const k = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }); const pub = k.publicKey.export({ format: 'jwk' }), priv = k.privateKey.export({ format: 'jwk' }); return { pub: { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y }, priv: { kty: priv.kty, crv: priv.crv, x: priv.x, y: priv.y, d: priv.d }, pk: crypto.randomBytes(32).toString('base64url') }; };
  fs.writeFileSync(KF, JSON.stringify({ production: mk(), developer: mk() }, null, 1));
}
const keys = JSON.parse(fs.readFileSync(KF, 'utf8'));
/* optional: the REAL release PUBLIC keys (never private keys or vaults), so codes from the real generator are accepted too: REAL_KEYS=<dir with production/public.json and developer/public.json> */
if (process.env.REAL_KEYS) for (const c of ['production', 'developer']) {
  const j = JSON.parse(fs.readFileSync(path.join(process.env.REAL_KEYS, c, 'public.json'), 'utf8')); if (j.channel !== c) throw new Error('public.json belongs to another channel');
  const jwk = crypto.createPublicKey(j.licenseKey).export({ format: 'jwk' }); keys[c].real = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
}

const font = f => 'data:font/woff2;base64,' + fs.readFileSync(path.join(R, 'fonts', f)).toString('base64');
const FONTS = { 'fonts/cairo-arabic-wght-normal.woff2': font('cairo-arabic-wght-normal.woff2'), 'fonts/cairo-latin-wght-normal.woff2': font('cairo-latin-wght-normal.woff2') };
const inlineFonts = s => s.replace(/url\("(fonts\/[a-z0-9-]+\.woff2)"\)/g, (m, f) => 'url("' + FONTS[f] + '")');
/* the program pages talk to the simulator page only through postMessage (works even when the frame cannot reach its parent, as in a sandboxed viewer) */
const API = {
  activation: "{status:function(){return call('status');},activate:function(t){return call('activate',[t]);},exportData:function(){return call('exportData');},quit:function(){send('quit');},devLogin:function(p){return call('devLogin',[p]);},openIssuer:function(){send('openIssuer');}}",
  issuer: "{unlock:function(p){return call('unlock',[p]);},issue:function(o){return call('issue',[o]);},list:function(){return call('list');},lock:function(){send('lock');},copy:function(t){send('copy',[t]);},save:function(){return call('save');}}",
  app: "{snapshot:SNAP,persist:function(s){send('persist',[s]);}}"
};
const POLY = "try{void window.localStorage.length;}catch(e){var m={},k0=(SNAP&&SNAP.keys)||{};Object.keys(k0).forEach(function(k){m[k]=k0[k];});var t=0;function sch(){if(!t)t=setTimeout(function(){t=0;send('persist',[JSON.stringify(m)]);},400);}var poly={getItem:function(k){return Object.prototype.hasOwnProperty.call(m,k)?m[k]:null;},setItem:function(k,v){m[String(k)]=String(v);sch();},removeItem:function(k){delete m[k];sch();},clear:function(){m={};sch();},key:function(i){return Object.keys(m)[i]||null;}};Object.defineProperty(poly,'length',{get:function(){return Object.keys(m).length;}});try{Object.defineProperty(window,'localStorage',{value:poly,configurable:true});}catch(e2){}}";
const hook = (name, html) => { const i = html.indexOf('<meta charset="utf-8">'); if (i < 0) throw new Error('no meta charset in ' + name); const at = i + '<meta charset="utf-8">'.length;
  const stub = '<script>(function(){var P=window.parent,NAME=' + JSON.stringify(name) + ',pend={},n=0;addEventListener("message",function(e){var d=e.data;if(d&&typeof d==="object"&&e.source===P){if(d.simFill!=null){var kb=document.getElementById("key");if(kb){kb.value=String(d.simFill);kb.focus();}}if(d.simExec){try{document.execCommand(d.simExec);}catch(x){}}}if(!d||typeof d!=="object"||d.simRes==null)return;var p=pend[d.simRes];if(!p)return;delete pend[d.simRes];if(d.err)p.rej(new Error(d.err));else p.res(d.val);});' +
    'function call(m,a){return new Promise(function(res,rej){var id=++n;pend[id]={res:res,rej:rej};P.postMessage({sim:NAME,id:id,m:m,a:a},"*");});}function send(m,a){P.postMessage({sim:NAME,m:m,a:a},"*");}' +
    'var SNAP=/*@@SNAP@@*/null;' + (name === 'app' ? POLY : '') + 'window.MPD=' + API[name] + ';})();</script>';
  return html.slice(0, at) + stub + html.slice(at); };
const page = name => {
  let h = fs.readFileSync(path.join(R, name + '.html'), 'utf8');
  const css = inlineFonts(fs.readFileSync(path.join(R, name + '.css'), 'utf8')), js = fs.readFileSync(path.join(R, name + '.js'), 'utf8');
  h = h.replace('<link rel="stylesheet" href="' + name + '.css">', () => '<style>' + css + '</style>').replace('<script src="' + name + '.js"></script>', () => '<script>' + js.replace(/<\/script/gi, '<\\/script') + '</script>');
  if (/href="[a-z]+\.css"|src="[a-z]+\.js"/.test(h)) throw new Error('unresolved asset in ' + name);
  return hook(name, h);
};
const { html: appHtml, webVersion } = compose();
const pages = { activation: page('activation'), issuer: page('issuer'), app: hook('app', inlineFonts(appHtml)) };
if (/url\("fonts\//.test(pages.app)) throw new Error('font url left in app page');

const svg = fs.readFileSync(path.join(R, 'activation.html'), 'utf8').match(/<svg[\s\S]*?<\/svg>/)[0].replace(/ width="64" height="64" aria-hidden="true"/, '');
const logo = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
const safe = o => JSON.stringify(o).replace(/</g, '\\u003c').split(String.fromCharCode(0x2028)).join('\\u2028').split(String.fromCharCode(0x2029)).join('\\u2029');

let t = fs.readFileSync(path.join(__dirname, 'sim.template.html'), 'utf8');
t = t.split('__LOGO__').join(logo).split('__VER__').join(webVersion).split('__KEYS__').join(safe(keys)).split('__PAGES__').join(safe(pages));
const out = path.join(__dirname, 'dist'); fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'sim.html'), t);
fs.writeFileSync(path.join(out, 'sim.test.html'), '<!doctype html><html lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style></head><body>' + t + '</body></html>');
console.log('built sim.html', (t.length / 1024).toFixed(0) + ' KB; web version', webVersion);
