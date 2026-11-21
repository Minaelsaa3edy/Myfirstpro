/* ---------- Trial links: a small payload signed with the developer's private key (ECDSA P-256).
   Anyone can VERIFY it with the public key built into the page; nobody can make or change one without the developer password. ---------- */
const PUBKEY = /*PUBKEY*/null;
const TXT_E = new TextEncoder(), TXT_D = new TextDecoder();
const b64u = u => { let s = ''; u.forEach(c => { s += String.fromCharCode(c); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = s => { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
/* -> the payload {v:2, p:'d'|'r' (demo or real program), i, c, m (minutes, 0 = permanent), s, o, n} when the signature is genuine, otherwise null */
async function tokVerify(raw) {
  try {
    const [p, g] = String(raw).trim().split('.'); if (!p || !g || !PUBKEY) return null;
    const key = await crypto.subtle.importKey('jwk', PUBKEY, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    if (!await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, unb64u(g), unb64u(p))) return null;
    const o = JSON.parse(TXT_D.decode(unb64u(p)));
    return o && o.v === 2 && (o.p === 'd' || o.p === 'r') && typeof o.i === 'string' && typeof o.m === 'number' && o.m >= 0 && (o.s === 'a' || o.s === 'r') ? o : null;
  } catch (e) { return null; }
}
/* pull the code out of a full link (…#t=CODE) or a bare code */
const tokPick = s => { const m = /(?:^|[#&?\s])t=([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/.exec(String(s)) || /^\s*([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\s*$/.exec(String(s)); return m ? m[1] : ''; };
const arN = (n, one, two, few, many) => n === 1 ? one : n === 2 ? two : n <= 10 ? `${n} ${few}` : `${n} ${many}`;
function fmtDur(mins, lang = LANG) { /* 'ar' for the designer's own screens */
  if (lang === 'en') {
    if (!mins) return 'Permanent';
    const pl = (n, w) => n + ' ' + w + (n === 1 ? '' : 's'), y = Math.floor(mins / 525600), r = mins % 525600, d = Math.floor(r / 1440), h = Math.floor(r % 1440 / 60), m = Math.round(r % 60), o = [];
    if (y) o.push(pl(y, 'year')); if (d) o.push(pl(d, 'day')); if (h) o.push(pl(h, 'hour')); if (m) o.push(pl(m, 'minute'));
    return o.join(' and ') || '0';
  }
  if (!mins) return 'دائم';
  const y = Math.floor(mins / 525600), r = mins % 525600, d = Math.floor(r / 1440), h = Math.floor(r % 1440 / 60), m = Math.round(r % 60), o = [];
  if (y) o.push(arN(y, 'سنة', 'سنتان', 'سنوات', 'سنة')); if (d) o.push(arN(d, 'يوم', 'يومان', 'أيام', 'يوماً')); if (h) o.push(arN(h, 'ساعة', 'ساعتان', 'ساعات', 'ساعة')); if (m) o.push(arN(m, 'دقيقة', 'دقيقتان', 'دقائق', 'دقيقة'));
  return o.join(' و') || '0';
}
