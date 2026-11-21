'use strict';
/* Builds the program page for the desktop edition from the customer build of the web program:
   - fonts come from the app folder (no Google Fonts request: the program works fully offline)
   - the storage bridge (mpd-shim.js) is added in front of the program's own script
   Nothing of the web source is changed. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');

const FONT_CSS = '<style>' +
  '@font-face{font-family:"Cairo";font-weight:200 1000;font-display:swap;src:url("fonts/cairo-arabic-wght-normal.woff2") format("woff2");unicode-range:U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0898-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC}' +
  '@font-face{font-family:"Cairo";font-weight:200 1000;font-display:swap;src:url("fonts/cairo-latin-wght-normal.woff2") format("woff2");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}' +
  '</style>';

function compose(opt) {
  opt = opt || {};
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mpd-web-'));
  execFileSync('python3', [path.join(ROOT, 'build.py'), '--customer', '--out', tmp], { cwd: ROOT, stdio: 'pipe' });
  let html = fs.readFileSync(path.join(tmp, 'standalone.html'), 'utf8');
  fs.rmSync(tmp, { recursive: true, force: true });
  const before = html.length;
  html = html.replace(/<link rel="preconnect" href="https:\/\/fonts\.(googleapis|gstatic)\.com"[^>]*>/g, '')
    .replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/g, FONT_CSS);
  const shim = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'mpd-shim.js'), 'utf8');
  if (!html.includes('<meta charset="utf-8">')) throw new Error('compose: unexpected page head');
  html = html.replace('<meta charset="utf-8">', () => '<meta charset="utf-8"><script>' + shim.replace(/<\/script/gi, '<\\/script') + '</script>');
  if (/fonts\.(googleapis|gstatic)\.com/.test(html)) throw new Error('compose: a font request is left');
  if (!html.includes('url("fonts/cairo-arabic-wght-normal.woff2")')) throw new Error('compose: local fonts not added');
  if (html.length === before) throw new Error('compose: nothing changed');
  /* the page loads nothing from the network: allow only the WhatsApp link strings that the program opens through the system browser */
  const urls = [...new Set((html.match(/https?:\/\/[^\s"'<>)\\]+/g) || []))];
  const bad = urls.filter(u => !/^https:\/\/wa\.me\/?$/.test(u));
  if (bad.length) throw new Error('compose: unexpected URLs in the page: ' + bad.join(', '));
  const webVersion = fs.readFileSync(path.join(ROOT, 'version.txt'), 'utf8').trim();
  return { html, webVersion };
}
module.exports = { compose };
if (require.main === module) { const r = compose(); console.log('composed', r.html.length, 'bytes, web version', r.webVersion); }
