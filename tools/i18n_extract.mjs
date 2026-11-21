// Lists every Arabic text the program can show (so each one gets an English translation in i18n/en.json).
//   node tools/i18n_extract.mjs            -> writes i18n/keys.json (all keys) and prints how many still lack a translation
// A key is the text as it appears in the page: whitespace collapsed; every ${…} / concatenated value becomes {1}, {2} …
// (a key with {n} is a pattern: the parts that are not fixed text — numbers, names — are kept as they are when the sentence is translated).
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const require = createRequire(process.env.ACORN_DIR ? process.env.ACORN_DIR + '/' : import.meta.url);
const acorn = require('acorn'), walk = require('acorn-walk');
const root = new URL('..', import.meta.url).pathname;
const files = [];
for (const d of ['src', 'src/trial', 'src/real']) for (const f of fs.readdirSync(path.join(root, d))) if (f.endsWith('.js')) files.push(path.join(d, f)); // dev/ stays Arabic-only
const AR = /[؀-ۿ]/, M = '\u0001', T = '\u0002';
const ENT = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&laquo;': '«', '&raquo;': '»', '&middot;': '·', '&hellip;': '…' };
const norm = s => s.replace(/&[#\w]+;/g, e => ENT[e] ?? e).replace(/\s+/g, ' ').trim();
const keys = new Map(); // key -> first file
function addSeg(s, f) {
  let n = 0; s = norm(s.replace(new RegExp(M, 'g'), () => `\u0003${++n}\u0003`)).replace(/\u0003(\d+)\u0003/g, '{$1}');
  const lit = s.replace(/\{\d+\}/g, ''); if (!AR.test(lit)) return;
  if (!keys.has(s)) keys.set(s, f);
}
function addString(s, f) { // a string that may hold HTML: pull out attribute texts and the text between tags
  for (const m of s.matchAll(/\b(?:placeholder|title|aria-label|alt|data-l)\s*=\s*"([^"]*)"/g)) addSeg(m[1], f);
  for (const m of s.matchAll(/\b(?:placeholder|title|aria-label|alt|data-l)\s*=\s*'([^']*)'/g)) addSeg(m[1], f);
  const body = s.replace(/<[^>]*>/g, T);
  for (const part of body.split(T)) addSeg(part, f);
}
for (const f of files) {
  const src = fs.readFileSync(path.join(root, f), 'utf8');
  const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script', allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true });
  const flat = n => n.type === 'Literal' && typeof n.value === 'string' ? n.value
    : n.type === 'TemplateLiteral' ? n.quasis.map((q, i) => q.value.cooked + (i < n.expressions.length ? M : '')).join('')
    : n.type === 'BinaryExpression' && n.operator === '+' ? flat(n.left) + flat(n.right) : M;
  walk.fullAncestor(ast, (n, _s, anc) => {
    if (n.type === 'Literal' && typeof n.value === 'string' && AR.test(n.value)) addString(n.value, f);
    else if (n.type === 'TemplateLiteral' && n.quasis.some(q => AR.test(q.value.cooked))) addString(flat(n), f);
    else if (n.type === 'BinaryExpression' && n.operator === '+') { const p = anc[anc.length - 2]; if (!(p && p.type === 'BinaryExpression' && p.operator === '+')) { const s = flat(n); if (AR.test(s)) addString(s, f); } }
  });
}
// texts that live outside the scripts (page shell built by build.py / build_trial.py, texts patched in by the demo build)
const extra = JSON.parse(fs.readFileSync(path.join(root, 'i18n/extra-keys.json'), 'utf8'));
for (const k of extra) keys.set(norm(k), 'extra');
const ign = new Set(JSON.parse(fs.readFileSync(path.join(root, 'i18n/ignore-keys.json'), 'utf8'))); // risky or meaningless keys that must not be translated
const all = [...keys.keys()].filter(k => !ign.has(k));
fs.writeFileSync(path.join(root, 'i18n/keys.json'), JSON.stringify(all, null, 0));
const en = fs.existsSync(path.join(root, 'i18n/en.json')) ? JSON.parse(fs.readFileSync(path.join(root, 'i18n/en.json'), 'utf8')) : {};
const missing = all.filter(k => !(k in en)), unused = Object.keys(en).filter(k => !keys.has(k));
console.log(JSON.stringify({ keys: all.length, patterns: all.filter(k => /\{\d+\}/.test(k)).length, missing: missing.length, unused: unused.length }));
if (process.argv.includes('--todo')) fs.writeFileSync(path.join(root, 'i18n/todo.txt'), missing.map((k, i) => `${i + 1}\t${k}`).join('\n') + '\n');
if (process.argv.includes('--unused')) console.log(unused.join('\n'));
