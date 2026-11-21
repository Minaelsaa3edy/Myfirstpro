/* ---------- PIN hashing: salted SHA-256 (sync, pure JS) so PINs are never stored as plain text ---------- */
const sha256 = (() => {
  const K = [], H0 = [];
  for (let n = 2, c = 0; c < 64; n++) {
    let p = true; for (let d = 2; d * d <= n; d++) if (n % d === 0) { p = false; break; }
    if (!p) continue;
    if (c < 8) H0[c] = Math.floor((Math.sqrt(n) % 1) * 4294967296);
    K[c] = Math.floor((Math.cbrt(n) % 1) * 4294967296); c++;
  }
  const rr = (x, n) => (x >>> n) | (x << (32 - n));
  return function (str) {
    const b = new TextEncoder().encode(str), l = b.length, n = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(n);
    m.set(b); m[l] = 0x80;
    const dv = new DataView(m.buffer); dv.setUint32(n - 8, Math.floor(l / 536870912)); dv.setUint32(n - 4, (l << 3) >>> 0);
    const h = H0.slice(), w = new Array(64);
    for (let o = 0; o < n; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let [a, bb, c, d, e, f, g, hh] = h;
      for (let i = 0; i < 64; i++) {
        const t1 = (hh + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
      }
      [a, bb, c, d, e, f, g, hh].forEach((v, i) => { h[i] = (h[i] + v) | 0; });
    }
    return h.map(v => (v >>> 0).toString(16).padStart(8, '0')).join('');
  };
})();
const pinHash = (pin, salt) => { let h = salt + ':' + pin; for (let i = 0; i < 3000; i++) h = sha256(h + salt); return h; };
const newSalt = () => { try { return [...crypto.getRandomValues(new Uint8Array(12))].map(x => x.toString(16).padStart(2, '0')).join(''); } catch (e) { return Math.random().toString(36).slice(2) + Date.now().toString(36); } };
const makePin = pin => { const s = newSalt(); return { s, h: pinHash(pin, s) }; };
const checkPin = (pin, rec) => !!(rec && rec.s && rec.h) && pinHash(pin, rec.s) === rec.h;
