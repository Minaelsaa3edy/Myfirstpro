/* ---------- Language: Arabic (default, right to left) or English (left to right).
   The program is written in Arabic. In English mode every text the page shows is translated as it appears, from the table in i18n/en.json
   (tools/i18n_extract.mjs lists every text): a text matches exactly, or matches a pattern whose {1} {2} … parts (numbers, names) are kept as they are. ---------- */
const EN = /*I18N*/null;
const LANG = db.settings.lang === 'en' && EN ? 'en' : 'ar';
const LOC = LANG === 'en' ? 'en-GB' : 'ar-EG'; /* date and time formats */
const AR_RE = /[؀-ۿ]/;
let I_EX = null, I_PAT = null;
const I_CACHE = new Map();
function i18nPrep() {
  I_EX = new Map(); I_PAT = [];
  const L = '\u0621-\u065F'; /* Arabic letters and their marks (not the Arabic comma, question mark or digits) */
  for (const k in EN) {
    if (!/\{\d+\}/.test(k)) { I_EX.set(k, EN[k]); continue; }
    const parts = k.split(/(\{\d+\})/); let src = '', lit = 0;
    parts.forEach((p, i) => {
      const m = /^\{(\d+)\}$/.exec(p);
      if (!m) { src += p.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&'); lit += p.length; return; }
      const before = parts[i - 1] || '', after = parts[i + 1] || '';
      /* a value glued to Arabic letters (not to a space or a sign) must not start / end with a letter, or a longer ordinary word would match; "سعر ال{1}" is the one that is meant to be glued */
      const gl = before && new RegExp('[' + L + ']$').test(before) && !/[ال]ل$/.test(before) ? `(?![${L}])` : '', gr = after && new RegExp('^[' + L + ']').test(after) ? `(?<![${L}])` : '';
      src += gl + '(.*?)' + gr;
    });
    I_PAT.push({ re: new RegExp('^' + src + '$'), en: EN[k], lit });
  }
  I_PAT.sort((a, b) => b.lit - a.lit);
}
function trCore(c, depth) {
  const e = I_EX.get(c); if (e !== undefined) return e;
  if (depth > 2) return null;
  for (const p of I_PAT) {
    const m = p.re.exec(c); if (!m) continue;
    return p.en.replace(/\{(\d+)\}/g, (_, i) => { const g = m[+i] || '', t = g.trim(); if (!t || !AR_RE.test(t)) return g; const r = trCore(t.replace(/\s+/g, ' '), depth + 1); return r == null ? g : g.slice(0, g.indexOf(t)) + r + g.slice(g.indexOf(t) + t.length); });
  }
  const q = /^(-?[\d.,٠-٩]+) (\S.*)$/.exec(c); /* a number followed by a known word, such as a quantity and its unit ("2 طن") */
  if (q) { const u = I_EX.get(q[2]); if (u !== undefined) return q[1] + ' ' + u; }
  return null;
}
function trText(s) { /* one piece of text (a text node, an attribute) -> English when it is a known Arabic text, otherwise unchanged */
  if (LANG !== 'en' || !s || !AR_RE.test(s)) return s;
  const hit = I_CACHE.get(s); if (hit !== undefined) return hit;
  if (!I_EX) i18nPrep();
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s), r = trCore(m[2].replace(/\s+/g, ' '), 0), out = r == null ? s : m[1] + r + m[3];
  if (I_CACHE.size > 6000) I_CACHE.clear();
  I_CACHE.set(s, out); return out;
}
const I_SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1 }, I_ATTR = ['placeholder', 'title', 'aria-label', 'alt', 'data-l'];
function trAttr(n, a) { const v = n.getAttribute(a); if (v && AR_RE.test(v)) { const t = trText(v); if (t !== v) n.setAttribute(a, t); } }
function trNode(n) {
  if (n.nodeType === 3) { if (n.parentNode && I_SKIP[n.parentNode.nodeName]) return; const v = trText(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; return; }
  if (n.nodeType !== 1 || n.nodeName === 'SCRIPT' || n.nodeName === 'STYLE') return;
  I_ATTR.forEach(a => trAttr(n, a));
  if (n.nodeName === 'TEXTAREA') return; /* what is typed or pasted in a box stays as it is, but its placeholder / label are translated */
  for (let c = n.firstChild; c; c = c.nextSibling) trNode(c);
}
if (LANG === 'en') {
  root.lang = 'en'; root.dir = 'ltr';
  ['app', 'toasts', 'modals'].forEach(id => { const e = document.getElementById(id); if (e) { e.lang = 'en'; e.dir = 'ltr'; } });
  new MutationObserver(ms => { for (const m of ms) { if (m.type === 'childList') m.addedNodes.forEach(trNode); else if (m.type === 'characterData') trNode(m.target); else trAttr(m.target, m.attributeName); } })
    .observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: I_ATTR });
  trNode(root);
}
const setLang = l => { db.settings.lang = l === 'en' ? 'en' : 'ar'; save(); location.reload(); };
