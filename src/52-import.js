/* ---------- Import attendance from a spreadsheet ----------
   Employees → «استيراد من Excel». The file is read here, in the browser (nothing is uploaded): .xlsx (a zip of xml), .csv / .txt, or an html table saved as .xls.
   The columns are guessed (name, date, in, out, status, one punch time) and can be changed by hand; the names are matched with the employees;
   nothing is saved before the preview is approved. The days go into db.att exactly like a sheet typed by hand: {empId, date, type, in, out, note}. */

/* ---- a small zip reader (an xlsx file is a zip); the browser's own inflate is used when there is one ---- */
const Z_LB = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258], Z_LE = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const Z_DB = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577], Z_DE = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const zU16 = (b, o) => b[o] | b[o + 1] << 8, zU32 = (b, o) => (b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24) >>> 0;
function impInflateJS(src) { /* raw deflate, written out (used when the browser has no DecompressionStream) */
  let pos = 0, bit = 0, out = new Uint8Array(Math.max(src.length * 4, 1024)), op = 0;
  const bits = n => { let v = 0; for (let i = 0; i < n; i++) { if (pos >= src.length) throw new Error('zip'); v |= ((src[pos] >> bit) & 1) << i; if (++bit === 8) { bit = 0; pos++; } } return v; };
  const huff = lens => { const cnt = new Uint16Array(16), offs = new Uint16Array(16), sym = new Uint16Array(lens.length); lens.forEach(l => cnt[l]++); cnt[0] = 0; for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + cnt[i - 1]; lens.forEach((l, s) => { if (l) sym[offs[l]++] = s; }); return { cnt, sym }; };
  const dec = h => { let code = 0, first = 0, idx = 0; for (let len = 1; len < 16; len++) { code |= bits(1); const c = h.cnt[len]; if (code - c < first) return h.sym[idx + (code - first)]; idx += c; first = (first + c) << 1; code <<= 1; } throw new Error('zip'); };
  const put = b => { if (op >= out.length) { const o = new Uint8Array(out.length * 2); o.set(out); out = o; } out[op++] = b; };
  let fin;
  do {
    fin = bits(1); const t = bits(2);
    if (t === 0) { if (bit) { bit = 0; pos++; } const len = src[pos] | src[pos + 1] << 8; pos += 4; for (let i = 0; i < len; i++) put(src[pos++]); }
    else if (t === 3) throw new Error('zip');
    else {
      let L, D;
      if (t === 1) { const l = new Uint8Array(288); l.fill(8, 0, 144); l.fill(9, 144, 256); l.fill(7, 256, 280); l.fill(8, 280); L = huff(l); D = huff(new Uint8Array(30).fill(5)); }
      else {
        const nl = bits(5) + 257, nd = bits(5) + 1, nc = bits(4) + 4, ord = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15], cl = new Uint8Array(19);
        for (let i = 0; i < nc; i++) cl[ord[i]] = bits(3);
        const C = huff(cl), ls = new Uint8Array(nl + nd);
        for (let i = 0; i < nl + nd;) { const s = dec(C); if (s < 16) ls[i++] = s; else { let rep, v = 0; if (s === 16) { v = ls[i - 1]; rep = 3 + bits(2); } else if (s === 17) rep = 3 + bits(3); else rep = 11 + bits(7); while (rep--) ls[i++] = v; } }
        L = huff(ls.subarray(0, nl)); D = huff(ls.subarray(nl));
      }
      for (;;) { const s = dec(L); if (s < 256) put(s); else if (s === 256) break; else { const li = s - 257, len = Z_LB[li] + bits(Z_LE[li]), di = dec(D), dist = Z_DB[di] + bits(Z_DE[di]); if (dist > op) throw new Error('zip'); for (let i = 0; i < len; i++) put(out[op - dist]); } }
    }
  } while (!fin);
  return out.subarray(0, op);
}
let impNoDS = false; /* true = always use the written-out inflate (the tests flip it) */
async function impInflate(u8) {
  if (typeof DecompressionStream === 'function' && !impNoDS) {
    try { const ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter(); w.write(u8).catch(() => {}); w.close().catch(() => {}); return new Uint8Array(await new Response(ds.readable).arrayBuffer()); } catch (e) { /* an older browser: the written-out one below */ }
  }
  return impInflateJS(u8);
}
async function impUnzip(buf) { /* -> { name: async () => bytes } */
  const b = new Uint8Array(buf); let e = b.length - 22; while (e >= 0 && e > b.length - 66000 && zU32(b, e) !== 0x06054b50) e--;
  if (e < 0 || zU32(b, e) !== 0x06054b50) throw new Error('zip');
  const n = zU16(b, e + 10), files = {}; let p = zU32(b, e + 16);
  for (let i = 0; i < n; i++) {
    if (zU32(b, p) !== 0x02014b50) throw new Error('zip');
    const meth = zU16(b, p + 10), csz = zU32(b, p + 20), nl = zU16(b, p + 28), xl = zU16(b, p + 30), cl = zU16(b, p + 32), lo = zU32(b, p + 42), name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
    files[name] = async () => { const q = lo + 30 + zU16(b, lo + 26) + zU16(b, lo + 28), d = b.subarray(q, q + csz); if (meth === 0) return d; if (meth === 8) return impInflate(d); throw new Error('zip'); };
  }
  return files;
}

/* ---- the xlsx itself ---- */
const impXml = u8 => new DOMParser().parseFromString(new TextDecoder().decode(u8), 'application/xml');
const impEls = (n, name) => Array.from(n.getElementsByTagNameNS('*', name));
const impCol = ref => { let n = 0; for (const ch of String(ref).replace(/[^A-Za-z]/g, '').toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
const impHM = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
function impSerial(v, d1904) { /* an Excel date / time number -> '2026-03-05 08:05' | '2026-03-05' | '08:05' */
  v = +v + (d1904 ? 1462 : 0); let days = Math.floor(v), secs = Math.round((v - days) * 86400); if (secs >= 86400) { days++; secs -= 86400; }
  const dt = new Date(Date.UTC(1899, 11, 30) + days * 864e5), d = dt.getUTCFullYear() + '-' + String(dt.getUTCMonth() + 1).padStart(2, '0') + '-' + String(dt.getUTCDate()).padStart(2, '0'), t = impHM(Math.floor(secs / 60));
  return days > 0 ? (secs > 0 ? d + ' ' + t : d) : t;
}
const IMP_BDATE = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
const impFmtDate = code => { const s = String(code).replace(/"[^"]*"/g, '').replace(/\[(?:\$[^\]]*|red|blue|green|black|white|cyan|magenta|yellow|color\d+|[<>=][^\]]*)\]/gi, '').replace(/\\./g, ''); return !/^\s*general\s*$/i.test(s) && (/[dy]/i.test(s) || /[hs]/i.test(s) || /am\/pm|a\/p/i.test(s)); };
function impSheetXml(doc, SS, xfDate, d1904) {
  const rows = [];
  for (const r of impEls(doc, 'row')) {
    const ri = (+r.getAttribute('r') || rows.length + 1) - 1; if (ri > 300000) break;
    const row = rows[ri] = rows[ri] || []; let ci = 0;
    for (const c of impEls(r, 'c')) {
      const ref = c.getAttribute('r'), col = ref ? impCol(ref) : ci; ci = col + 1;
      const t = c.getAttribute('t'), vEl = impEls(c, 'v')[0], vt = vEl ? vEl.textContent : ''; let val = '';
      if (t === 's') val = SS[+vt] ?? '';
      else if (t === 'inlineStr') val = impEls(c, 't').map(x => x.textContent).join('');
      else if (t === 'str' || t === 'e') val = vt;
      else if (t === 'b') val = vt === '1' ? 'TRUE' : 'FALSE';
      else if (vt !== '') { const n = +vt; val = isFinite(n) ? (xfDate[+c.getAttribute('s')] ? impSerial(n, d1904) : n) : vt; }
      if (val !== '') row[col] = val;
    }
  }
  return Array.from(rows, r => r ? Array.from(r, x => x ?? '') : []);
}
async function impReadXlsx(buf) {
  const Z = await impUnzip(buf); if (!Z['xl/workbook.xml']) throw new Error('unreadable');
  const get = async n => Z[n] ? impXml(await Z[n]()) : null, wb = await get('xl/workbook.xml'), rels = await get('xl/_rels/workbook.xml.rels');
  const pr = impEls(wb, 'workbookPr')[0], d1904 = !!pr && /^(1|true)$/i.test(pr.getAttribute('date1904') || ''), relT = {};
  if (rels) impEls(rels, 'Relationship').forEach(r => { relT[r.getAttribute('Id')] = r.getAttribute('Target'); });
  const SS = [], ssd = await get('xl/sharedStrings.xml'); if (ssd) impEls(ssd, 'si').forEach(si => SS.push(impEls(si, 't').filter(t => t.parentNode.localName !== 'rPh').map(t => t.textContent).join('')));
  const xfDate = [], sty = await get('xl/styles.xml'); /* which cell styles show a date or a time */
  if (sty) { const fm = {}; impEls(sty, 'numFmt').forEach(f => { fm[f.getAttribute('numFmtId')] = f.getAttribute('formatCode'); }); const cx = impEls(sty, 'cellXfs')[0]; if (cx) Array.from(cx.children).forEach(x => { const id = x.getAttribute('numFmtId'); xfDate.push(fm[id] != null ? impFmtDate(fm[id]) : IMP_BDATE.has(+id)); }); }
  const out = [];
  for (const s of impEls(wb, 'sheet')) {
    if (/hidden/i.test(s.getAttribute('state') || '')) continue;
    const rid = s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || s.getAttribute('r:id'); let tg = relT[rid]; if (!tg) continue;
    tg = tg.replace(/^\//, ''); const path = tg.startsWith('xl/') ? tg : 'xl/' + tg; if (!Z[path]) continue;
    out.push({ name: s.getAttribute('name') || path, rows: impSheetXml(impXml(await Z[path]()), SS, xfDate, d1904) });
  }
  return out;
}

/* ---- an old Excel file (xls, Excel 97-2003 and 95): an OLE container holding the BIFF records ---- */
function impOle(u8) { /* -> {streamName(lower case): () => Uint8Array} */
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), g32 = o => dv.getUint32(o, true), g16 = o => dv.getUint16(o, true), END = 0xFFFFFFFA;
  if (u8.length < 512 || g32(0) !== 0xE011CFD0 || g32(4) !== 0xE11AB1A1) throw new Error('xls');
  const ss = 1 << g16(0x1E), ms = 1 << g16(0x20), nFat = g32(0x2C), dirStart = g32(0x30), cutoff = g32(0x38), mfStart = g32(0x3C), dfStart = g32(0x44), nDf = g32(0x48);
  if (ss < 128 || ss > 65536) throw new Error('xls');
  const fatSecs = []; for (let i = 0; i < 109; i++) { const v = g32(0x4C + i * 4); if (v < END) fatSecs.push(v); }
  for (let df = dfStart, n = 0; df < END && n++ <= nDf; ) { const o = (df + 1) * ss; if (o + ss > u8.length) break; for (let i = 0; i < ss / 4 - 1; i++) { const v = g32(o + i * 4); if (v < END) fatSecs.push(v); } df = g32(o + ss - 4); }
  const FAT = []; for (const f of fatSecs.slice(0, nFat || undefined)) { const o = (f + 1) * ss; if (o + ss > u8.length) break; for (let i = 0; i < ss / 4; i++) FAT.push(g32(o + i * 4)); }
  const chain = (st, fat) => { const out = []; for (let s = st, n = 0; s < END && n++ < 4e6; s = fat[s]) { out.push(s); if (fat[s] === undefined) break; } return out; };
  const big = (st, size) => { const ch = chain(st, FAT), out = new Uint8Array(ch.length * ss); ch.forEach((c, i) => { const o = (c + 1) * ss; if (o < u8.length) out.set(u8.subarray(o, Math.min(o + ss, u8.length)), i * ss); }); return size == null ? out : out.subarray(0, size); };
  const dir = big(dirStart), ent = [], dd = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
  for (let o = 0; o + 128 <= dir.length; o += 128) { const nl = dd.getUint16(o + 64, true), type = dir[o + 66]; if (!type) continue; ent.push({ name: new TextDecoder('utf-16le').decode(dir.subarray(o, o + Math.max(0, nl - 2))).toLowerCase(), type, st: dd.getUint32(o + 116, true), size: dd.getUint32(o + 120, true) }); }
  const root = ent.find(e => e.type === 5); let mini = null, MF = null;
  const small = (st, size) => { if (!mini) { if (!root) throw new Error('xls'); mini = big(root.st, root.size); const mf = big(mfStart), md = new DataView(mf.buffer, mf.byteOffset, mf.byteLength); MF = []; for (let i = 0; i + 4 <= mf.length; i += 4) MF.push(md.getUint32(i, true)); } const ch = chain(st, MF), out = new Uint8Array(ch.length * ms); ch.forEach((c, i) => { out.set(mini.subarray(c * ms, c * ms + ms), i * ms); }); return out.subarray(0, size); };
  const S = {}; ent.forEach(e => { if (e.type === 2) S[e.name] = () => e.size < cutoff ? small(e.st, e.size) : big(e.st, e.size); });
  return S;
}
function impReadXls(buf) { /* -> [{name, rows}] ; throws Error('xls' | 'xlspass') */
  const S = impOle(new Uint8Array(buf)), f = S.workbook || S.book; if (!f) throw new Error('xls');
  const b = f(), dv = new DataView(b.buffer, b.byteOffset, b.byteLength), g16 = o => dv.getUint16(o, true), g32 = o => dv.getUint32(o, true), recs = [], at = new Map();
  for (let p = 0; p + 4 <= b.length; ) { const len = g16(p + 2); if (p + 4 + len > b.length) break; at.set(p, recs.length); recs.push({ id: g16(p), p: p + 4, len }); p += 4 + len; }
  if (!recs.length || recs[0].id !== 0x809) throw new Error('xls');
  const bf8 = g16(recs[0].p) >= 0x600; let cp = 1252, d1904 = false;
  const ldec = u => { try { return new TextDecoder(cp === 1256 ? 'windows-1256' : cp === 1252 ? 'windows-1252' : 'windows-' + cp).decode(u); } catch (e) { return new TextDecoder('windows-1252').decode(u); } };
  const wdec = (o, n) => { let t = ''; for (let i = 0; i < n; i++) t += String.fromCharCode(g16(o + i * 2)); return t; };
  const str8 = (o, n, wide) => wide ? wdec(o, n) : Array.from(b.subarray(o, o + n), c => String.fromCharCode(c)).join(''); /* a compressed Unicode string: one byte per letter */
  const rstr = (o, lenBytes) => { /* a string written inside a record: length, [flags], letters */
    const n = lenBytes === 2 ? g16(o) : b[o]; o += lenBytes; if (!bf8) return ldec(b.subarray(o, o + n));
    const fl = b[o]; o++; if (fl & 8) o += 2; if (fl & 4) o += 4; return str8(o, n, fl & 1);
  };
  const fmt = {}, xf = [], sheets = [], sst = []; let sstDone = false;
  for (let k = 0; k < recs.length; k++) {
    const r = recs[k]; if (k > 0 && r.id === 0x809 && g16(r.p + 2) !== 5) break; /* the first sheet: the globals are over */
    if (r.id === 0x2F) throw new Error('xlspass');
    else if (r.id === 0x42) cp = g16(r.p);
    else if (r.id === 0x22) d1904 = g16(r.p) === 1;
    else if (r.id === 0x41E) fmt[g16(r.p)] = rstr(r.p + 2, bf8 ? 2 : 1);
    else if (r.id === 0xE0) xf.push(g16(r.p + 2));
    else if (r.id === 0x85) { const st = (b[r.p + 4] || 0) & 3, ty = b[r.p + 5]; sheets.push({ off: g32(r.p), hidden: st !== 0, ty, name: bf8 ? rstr(r.p + 6, 1) : ldec(b.subarray(r.p + 7, r.p + 7 + b[r.p + 6])) }); }
    else if (r.id === 0xFC && !sstDone) { /* the shared strings: one record then CONTINUE records, a string may be cut between two of them */
      sstDone = true; const ch = [[r.p + 8, r.p + r.len]], uniq = g32(r.p + 4); for (let j = k + 1; j < recs.length && recs[j].id === 0x3C; j++) ch.push([recs[j].p, recs[j].p + recs[j].len]);
      let ci = 0, pos = ch[0][0], end = ch[0][1];
      const nxt = () => { if (ci + 1 >= ch.length) return false; ci++; pos = ch[ci][0]; end = ch[ci][1]; return true; };
      const rb = () => { if (pos >= end && !nxt()) return 0; return b[pos++]; }, r16 = () => { const a = rb(); return a | rb() << 8; };
      const skip = n => { while (n > 0) { if (pos >= end && !nxt()) return; const t = Math.min(n, end - pos); pos += t; n -= t; } };
      for (let i = 0; i < uniq && (pos < end || ci + 1 < ch.length); i++) {
        let left = r16(); const fl = rb(); let runs = 0, ext = 0; if (fl & 8) runs = r16(); if (fl & 4) { ext = r16(); ext += r16() * 65536; }
        let wide = fl & 1, t = '';
        while (left > 0) {
          if (pos >= end) { if (!nxt()) break; wide = b[pos++] & 1; } /* a string cut here goes on after a flags byte */
          const take = Math.min(left, wide ? (end - pos) >> 1 : end - pos); if (take <= 0) { pos = end; continue; }
          t += str8(pos, take, wide); pos += take * (wide ? 2 : 1); left -= take;
        }
        skip(runs * 4 + ext); sst.push(t);
      }
    }
  }
  const xfDate = xf.map(id => fmt[id] != null ? impFmtDate(fmt[id]) : IMP_BDATE.has(id));
  const rk = v => { let x; if (v & 2) x = (v | 0) >> 2; else { const t = new DataView(new ArrayBuffer(8)); t.setUint32(4, (v & 0xFFFFFFFC) >>> 0, true); x = t.getFloat64(0, true); } return v & 1 ? x / 100 : x; };
  const out = [];
  for (const sh of sheets) {
    if (sh.hidden || sh.ty !== 0 || !at.has(sh.off)) continue;
    const rows = [], put = (r, c, v) => { if (v === '' || v == null || r > 300000) return; (rows[r] = rows[r] || [])[c] = v; }, num = (x, n) => isFinite(n) ? (xfDate[x] ? impSerial(n, d1904) : n) : '';
    let depth = 0, fcell = null;
    for (let k = at.get(sh.off); k < recs.length; k++) {
      const r = recs[k], p = r.p; if (r.id === 0x809) { depth++; continue; } if (r.id === 0x0A) { if (--depth <= 0) break; continue; } if (depth !== 1) continue;
      if (r.id === 0xFD) put(g16(p), g16(p + 2), sst[g32(p + 6)] ?? '');
      else if (r.id === 0x203) put(g16(p), g16(p + 2), num(g16(p + 4), dv.getFloat64(p + 6, true)));
      else if (r.id === 0x27E) put(g16(p), g16(p + 2), num(g16(p + 4), rk(g32(p + 6))));
      else if (r.id === 0xBD) { const row = g16(p), c0 = g16(p + 2), n = (r.len - 6) >> 2; for (let i = 0; i < Math.floor((r.len - 6) / 6); i++) put(row, c0 + i, num(g16(p + 4 + i * 6), rk(g32(p + 6 + i * 6)))); }
      else if (r.id === 0x204) put(g16(p), g16(p + 2), bf8 ? rstr(p + 6, 2) : ldec(b.subarray(p + 8, p + 8 + g16(p + 6))));
      else if (r.id === 0x205 && b[p + 7] === 0) put(g16(p), g16(p + 2), b[p + 6] ? 'TRUE' : 'FALSE');
      else if (r.id === 0x06) { /* a formula: the value it last worked out */
        const row = g16(p), col = g16(p + 2), x = g16(p + 4);
        if (b[p + 12] === 0xFF && b[p + 13] === 0xFF) { const ty = b[p + 6]; if (ty === 0) fcell = [row, col]; else if (ty === 1) put(row, col, b[p + 8] ? 'TRUE' : 'FALSE'); }
        else put(row, col, num(x, dv.getFloat64(p + 6, true)));
      }
      else if (r.id === 0x207 && fcell) { put(fcell[0], fcell[1], bf8 ? rstr(p, 2) : ldec(b.subarray(p + 2, p + 2 + g16(p)))); fcell = null; }
    }
    out.push({ name: sh.name || 'Sheet', rows: Array.from(rows, r => r ? Array.from(r, v => v ?? '') : []) });
  }
  return out;
}

/* ---- csv / text / html table ---- */
function impDecode(u8) {
  let enc = 'utf-8'; if (u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) u8 = u8.subarray(3); else if (u8[0] === 0xFF && u8[1] === 0xFE) enc = 'utf-16le'; else if (u8[0] === 0xFE && u8[1] === 0xFF) enc = 'utf-16be';
  try { return new TextDecoder(enc, { fatal: true }).decode(u8); } catch (e) { try { return new TextDecoder('windows-1256').decode(u8); } catch (e2) { return new TextDecoder().decode(u8); } }
}
function impCSV(txt) {
  txt = txt.replace(/^sep=.\r?\n/i, ''); const head = txt.split(/\r?\n/, 6).join('\n'), cnt = d => head.split(d).length - 1;
  const sep = [',', ';', '\t', '|'].reduce((a, b) => cnt(b) > cnt(a) ? b : a, ','), rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (q) { if (ch === '"') { if (txt[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"' && !cur) q = true;
    else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && txt[i + 1] === '\n') i++; row.push(cur); cur = ''; rows.push(row); row = []; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.map(r => r.map(c => c.trim()));
}
const impHtml = txt => Array.from(new DOMParser().parseFromString(txt, 'text/html').querySelectorAll('table')).map((t, i) => ({ name: 'Table ' + (i + 1), rows: Array.from(t.rows).map(r => Array.from(r.cells).map(c => c.textContent.trim())) })).filter(t => t.rows.length > 1);
function impReadFile(file) { /* -> [{name, rows}] ; throws Error('xls' | 'empty' | 'unreadable' | 'zip') */
  return new Promise((res, rej) => { const r = new FileReader(); r.onerror = () => rej(new Error('unreadable')); r.onload = () => res(r.result); r.readAsArrayBuffer(file); }).then(async buf => {
    const u8 = new Uint8Array(buf); if (!u8.length) throw new Error('empty'); let tabs;
    if (u8[0] === 0x50 && u8[1] === 0x4B) tabs = await impReadXlsx(buf);
    else if (u8[0] === 0xD0 && u8[1] === 0xCF && u8[2] === 0x11) { try { tabs = impReadXls(buf); } catch (e) { throw new Error(e && e.message === 'xlspass' ? 'xlspass' : 'xls'); } } /* Excel 97-2003 */
    else if (u8[0] === 0x25 && u8[1] === 0x50) throw new Error('unreadable'); /* a pdf */
    else { const txt = impDecode(u8); tabs = /<table[\s>]/i.test(txt) ? impHtml(txt) : [{ name: 'CSV', rows: impCSV(txt) }]; }
    tabs.forEach(t => { t.rows = t.rows.map(r => r.map(c => typeof c === 'string' && !c.trim() ? '' : c)); }); /* a cell with only a space is an empty cell */
    tabs = tabs.filter(t => t.rows.some(r => r.some(c => c !== '' && c != null))); if (!tabs.length) throw new Error('empty'); return tabs;
  });
}

/* ---- reading the cells: names, dates, times, status words ---- */
const A_ = String.fromCharCode; /* the plain letter an Arabic variant becomes (alef, yaa, haa, waw) */
const impNrm = s => toLat(String(s ?? '')).toLowerCase().replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[\u0623\u0625\u0622\u0671]/g, A_(0x627)).replace(/\u0649/g, A_(0x64A)).replace(/\u0629/g, A_(0x647)).replace(/\u0624/g, A_(0x648)).replace(/\u0626/g, A_(0x64A)).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const IMP_MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12, يناير: 1, فبراير: 2, مارس: 3, ابريل: 4, مايو: 5, يونيو: 6, يونيه: 6, يوليو: 7, يوليه: 7, اغسطس: 8, سبتمبر: 9, اكتوبر: 10, نوفمبر: 11, ديسمبر: 12 };
const impOk = (y, m, d) => y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= new Date(y, m, 0).getDate();
const impIso = (y, m, d) => impOk(y, m, d) ? y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0') : '';
let IMP_YR = 0; /* the year given to a date written without one (1/10, 5 اكتوبر); 0 = such dates are not read */
function impDate(v, ord) { /* -> 'YYYY-MM-DD' | '' ; ord: 'dmy' (day first, the default here) | 'mdy' */
  if (v == null || v === '') return '';
  if (typeof v === 'number') return v > 20000 && v < 80000 ? impSerial(v, false).slice(0, 10) : '';
  const s = toLat(String(v)).trim(); let m;
  if ((m = /(\d{4})\s*[-\/.\\]\s*(\d{1,2})\s*[-\/.\\]\s*(\d{1,2})(?!\d)/.exec(s))) return impIso(+m[1], +m[2], +m[3]);
  if ((m = /(?:^|\D)(\d{1,2})\s*([-\/\\])\s*(\d{1,2})\s*\2\s*(\d{4}|\d{2})(?!\d)/.exec(s)) || (m = /(?:^|\D)(\d{1,2})\s*(\.)\s*(\d{1,2})\s*\2\s*(\d{4})(?!\d)/.exec(s))) { const a = +m[1], b = +m[3]; let y = +m[4]; if (y < 100) y += 2000; return ord === 'mdy' ? impIso(y, a, b) : impIso(y, b, a); }
  if ((m = /(\d{1,2})\s+([^\d\s,.\-]{3,})\.?,?\s+(\d{4})/.exec(s))) { const k = impNrm(m[2]), mo = IMP_MON[k] || IMP_MON[k.slice(0, 3)]; return mo ? impIso(+m[3], mo, +m[1]) : ''; }
  if ((m = /([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(s))) { const mo = IMP_MON[m[1].toLowerCase().slice(0, 3)]; return mo ? impIso(+m[3], mo, +m[2]) : ''; }
  if (IMP_YR) { /* no year written: the sheet's year (a weekday name may come first) */
    if ((m = /^(?:[^\d\s]+\s+)?(\d{1,2})\s*[-\/\\]\s*(\d{1,2})$/.exec(s))) return ord === 'mdy' ? impIso(IMP_YR, +m[1], +m[2]) : impIso(IMP_YR, +m[2], +m[1]);
    if ((m = /^(?:[^\d\s]+\s+)?(\d{1,2})\s+([^\d\s,.\-]{3,})\.?$/.exec(s))) { const k = impNrm(m[2]), mo = IMP_MON[k] || IMP_MON[k.slice(0, 3)]; return mo ? impIso(IMP_YR, mo, +m[1]) : ''; }
  }
  return '';
}
/* two times in one cell: 9:00 - 17:00 / 9ص الى 5م -> ['09:00', '17:00'] | null */
function impRange(v) {
  if (typeof v !== 'string') return null; const m = /(\d{1,2}\s*[:.]\s*\d{2}\s*(?:a\.?m\.?|p\.?m\.?|ص|م)?)\s*(?:-|–|—|الي|الى|إلى|to|\/|\\)\s*(\d{1,2}\s*[:.]\s*\d{2}\s*(?:a\.?m\.?|p\.?m\.?|ص|م)?)/i.exec(toLat(v)); if (!m) return null;
  const a = impTime(m[1]), b = impTime(m[2]); if (!a || !b) return null; return [a, b < a && !/[ap]\.?m|ص|م/i.test(m[2]) && +b.slice(0, 2) < 12 ? impHM(hm(b) + 720) : b];
}
const IMP_ENM = { january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
/* the year of a sheet: the one most dates carry, else one written in its name / title, else this year (or last year when that would put the dates in the future) */
function impYear(t) {
  const cnt = {}, add = y => { if (y >= 1990 && y <= 2100) cnt[y] = (cnt[y] || 0) + 1; }, keep = IMP_YR; let less = 0, mx = '';
  const rows = t.rows.slice(0, 800), cy = new Date().getFullYear();
  IMP_YR = 0; const noY = [];
  rows.forEach(r => r.forEach(v => { if (v === '' || v == null) return; const d = impDate(v, t.ord); if (d) add(+d.slice(0, 4)); else if (typeof v === 'string') noY.push(v); }));
  IMP_YR = cy; noY.forEach(v => { const d = impDate(v, t.ord); if (d) { less++; if (d > mx) mx = d; } });
  [t.name, ...rows.slice(0, 12).flat()].forEach(v => { if (typeof v !== 'string') return; const m = /(?:^|\D)(20\d\d)(?!\d)/.exec(toLat(v)); if (m) add(+m[1]); });
  IMP_YR = keep; const ys = Object.keys(cnt).sort((p, q) => cnt[q] - cnt[p]);
  if (ys.length) return { yr: +ys[0], less, src: 'file' };
  return { yr: mx && Date.parse(mx) > Date.now() + 45 * 864e5 ? cy - 1 : cy, less, src: 'guess' };
}
/* a month written in the sheet's name or above its table (أكتوبر 2026, شهر 10, 10/2026) -> 'YYYY-MM' | '' */
function impMonthHint(t, yr) {
  for (const raw of [t.name, ...t.rows.slice(0, 12).flat()]) {
    if (typeof raw !== 'string' || !raw.trim() || impDate(raw, 'dmy')) continue; const s = impNrm(raw), lat = toLat(raw); let mo = 0, y = 0, m;
    for (const w of s.split(' ')) { mo = IMP_MON[w] || IMP_ENM[w] || (w.length === 3 ? IMP_MON[w] : 0); if (mo) break; }
    if (!mo && (m = /(?:شهر|month)\s*(\d{1,2})(?!\d)/i.exec(lat))) mo = +m[1];
    if (!mo && (m = /(?:^|\D)(1[0-2]|0?[1-9])\s*[\/\-.]\s*(20\d\d)(?!\d)/.exec(lat))) { mo = +m[1]; y = +m[2]; }
    if (!mo && (m = /(20\d\d)\s*[\/\-.]\s*(1[0-2]|0?[1-9])(?![\d\/\-.])/.exec(lat))) { mo = +m[2]; y = +m[1]; }
    if (mo >= 1 && mo <= 12) { if (!y && (m = /(?:^|\D)(20\d\d)(?!\d)/.exec(lat))) y = +m[1]; return (y || yr) + '-' + String(mo).padStart(2, '0'); }
  }
  return '';
}
function impTime(v, loose) { /* -> 'HH:MM' | '' ; loose: also 0805 / 805 written without a colon */
  if (v == null || v === '') return '';
  if (typeof v === 'number') { if (v >= 0 && v < 1) return impHM(Math.round(v * 1440) % 1440); if (v > 20000 && v < 80000 && v % 1) return impHM(Math.round((v % 1) * 1440) % 1440); return ''; }
  const s = toLat(String(v)).trim().toLowerCase().replace(/\d{4}\s*[-\/.\\]\s*\d{1,2}\s*[-\/.\\]\s*\d{1,2}/g, ' ').replace(/\d{1,2}\s*[-\/\\]\s*\d{1,2}\s*[-\/\\]\s*\d{2,4}/g, ' ').replace(/\d{1,2}\.\d{1,2}\.\d{4}/g, ' ');
  let m = /(\d{1,2})\s*[:.]\s*(\d{2})(?:\s*[:.]\s*\d{2}(?:\.\d+)?)?\s*(a\.?m\.?|p\.?m\.?|ص|م)?/.exec(s), h, mi, ap = '';
  if (m) { h = +m[1]; mi = +m[2]; ap = m[3] || ''; }
  else if (loose && (m = /^(\d{1,2})(\d{2})$/.exec(s.trim()))) { h = +m[1]; mi = +m[2]; }
  else return '';
  if (/^(p|م)/.test(ap) && h < 12) h += 12; else if (/^(a|ص)/.test(ap) && h === 12) h = 0;
  return h > 23 || mi > 59 ? '' : impHM(h * 60 + mi);
}
function impStatus(v) { /* p present | a absent | x permission | v leave | off (a day off: nothing to record) | '' */
  const s = impNrm(v); if (!s || typeof v === 'number') return '';
  if (/^(حاضر|حضر|present)/.test(s) || s === 'p') return 'p';
  if (/^(غائب|غايب|غياب|absent)/.test(s) || s === 'a' || s === 'ab') return 'a';
  if (/^(تم )?(ال)?(استيذان|استاذان|مستيذن|مستاذن)|^(اذن|permission|excuse)/.test(s) || s === 'x') return 'x';
  if (/^(راحه|off|عطله|weekend)|^(اجازه )?(اسبوعيه|اسبوعي)|^weekly/.test(s)) return 'off';
  if (/^(اجاز|leave|vacation|holiday|sick|مرض|عارض)/.test(s) || s === 'v') return 'v';
  return '';
}

/* ---- finding the columns ---- */
const IMP_ROLES = [['', '— تجاهل —'], ['name', 'اسم الموظف'], ['date', 'التاريخ'], ['in', 'الحضور'], ['out', 'الانصراف'], ['dt', 'وقت البصمة'], ['status', 'الحالة'], ['note', 'ملاحظة'], ['salary', 'الراتب']];
function impHeadRole(h) { /* the word on top of a column -> its role ('code' = a number to ignore) */
  if (typeof h !== 'string' && typeof h !== 'number') return ''; const s = impNrm(h), c = s.replace(/ /g, ''); if (!s) return '';
  const has = re => re.test(s) || re.test(c);
  if (has(/تاريخ|date/) && has(/وقت|time/)) return 'dt';
  if (has(/انصراف|خروج|checkout|clockout|timeout|departure/) || /(^| )(out|الي)( |$)/.test(s)) return 'out';
  if (has(/حضور|دخول|checkin|clockin|timein|arrival/) || /(^| )(in|من)( |$)/.test(s)) return 'in';
  if (has(/تاريخ|^date|date$/) || /^(ال)?(يوم|day)$/.test(s)) return 'date';
  if (has(/حاله|status|attendancestate|^type$/)) return 'status';
  if (has(/ملا[حخ]ظ|note|remark|comment|بيان/)) return 'note';
  if (has(/راتب|مرتب|salary|wage|اجر|يوميه/)) return 'salary';
  if (has(/كود|code|badge|userid|empid|empno|رقم|^id$|^no$/)) return 'code';
  if (has(/اسم|name|موظف|employee|staff|worker/)) return 'name';
  if (has(/وقت|time|بصمه|punch|توقيت|timestamp|clock/)) return 'dt';
  return '';
}
function impStats(rows, from, c, ord, loose) {
  const S = { ne: 0, d: 0, t: 0, both: 0, tx: 0, st: 0, nm: 0 };
  for (let i = from, k = 0; i < rows.length && k < 300; i++) {
    const v = rows[i] && rows[i][c]; if (v === '' || v == null) continue; k++; S.ne++;
    const d = impDate(v, ord), t = impTime(v, loose);
    if (d && t) S.both++; else if (d) S.d++; else if (t) S.t++; else if (typeof v === 'number' || /^\d+([.,]\d+)?$/.test(String(v).trim())) S.nm++; else { S.tx++; if (impStatus(v)) S.st++; }
  }
  return S;
}
function impOrd(rows) { /* day first unless the file proves month first (a second number above 12) */
  let dmy = false, mdy = false;
  for (let i = 0; i < Math.min(rows.length, 2000); i++) for (const v of rows[i]) { if (typeof v !== 'string') continue; const m = /^\s*(\d{1,2})\s*[\/\-.\\]\s*(\d{1,2})\s*[\/\-.\\]\s*\d{2,4}/.exec(toLat(v)); if (m) { if (+m[1] > 12) dmy = true; if (+m[2] > 12) mdy = true; } }
  return mdy && !dmy ? 'mdy' : 'dmy';
}
const impDays = (rows, from, c) => { let k = 0, ok = 0; for (let i = from; i < rows.length && k < 300; i++) { const v = rows[i] && rows[i][c]; if (v === '' || v == null) continue; k++; const n = typeof v === 'number' ? v : /^\d{1,2}$/.test(toLat(String(v)).trim()) ? +toLat(String(v)).trim() : 0; if (Number.isInteger(n) && n >= 1 && n <= 31) ok++; } return k >= 3 && ok / k >= .9; };
function impRoles(t) { /* the role of every column, from its title and from what is inside it */
  t.dayOnly = false; IMP_YR = t.yrless ? t.yr : 0;
  const rows = t.rows, nc = Math.max(0, ...rows.slice(0, 400).map(r => r.length)), from = t.head + 1, roles = Array(nc).fill(''), hr = c => t.head >= 0 ? impHeadRole(rows[t.head][c]) : '';
  const S = [], has = k => roles.includes(k);
  for (let c = 0; c < nc; c++) S[c] = impStats(rows, from, c, t.ord, false);
  for (let c = 0; c < nc; c++) {
    const h = hr(c), s = S[c]; if (!s.ne) continue; let r = '';
    if (h === 'in' || h === 'out' || h === 'dt') { const L = impStats(rows, from, c, t.ord, true); r = (L.t + L.both) / L.ne >= .5 ? h : (L.st / L.ne >= .5 ? 'status' : ''); }
    else if (h === 'date') { r = (s.d + s.both) / s.ne >= .6 ? 'date' : ''; if (!r && s.nm / s.ne >= .7 && !roles.includes('date') && !Array.from({ length: nc }, (_, k) => k).some(k => hr(k) === 'date' && S[k].ne && (S[k].d + S[k].both) / S[k].ne >= .6) && impDays(rows, from, c)) { r = 'date'; t.dayOnly = true; } } /* only the day of the month is written: the month comes from the title */
    else if (h === 'status' || h === 'note' || h === 'name' || h === 'salary') r = h;
    roles[c] = r;
  }
  const free = c => !roles[c] && !hr(c) && S[c].ne;
  for (let c = 0; c < nc; c++) if (free(c) && !has('date') && S[c].d / S[c].ne >= .7) roles[c] = 'date';
  if (!has('dt') && !has('in') && !has('out')) for (let c = 0; c < nc; c++) if (free(c) && S[c].both / S[c].ne >= .7) { roles[c] = 'dt'; break; }
  if (!has('dt')) {
    const tc = []; for (let c = 0; c < nc; c++) if (free(c) && S[c].t / S[c].ne >= .7) tc.push(c);
    if (!has('in') && !has('out')) { if (tc.length >= 2) { roles[tc[0]] = 'in'; roles[tc[1]] = 'out'; } else if (tc.length === 1) roles[tc[0]] = 'dt'; }
    else if (!has('out') && tc.length) roles[tc[0]] = 'out'; else if (!has('in') && tc.length) roles[tc[0]] = 'in';
  }
  for (let c = 0; c < nc; c++) if (free(c) && !has('status') && S[c].st / S[c].ne >= .5) roles[c] = 'status';
  for (let c = 0; c < nc; c++) if (free(c) && !has('name') && S[c].tx / S[c].ne >= .7 && S[c].st / S[c].ne < .5) { roles[c] = 'name'; break; }
  return roles;
}
function impGuess(t) { /* the title row (the first one with two or more known words), then the roles */
  let head = -1, bs = 1; for (let i = 0; i < Math.min(t.rows.length, 25); i++) { const sc = t.rows[i].filter(c => c !== '' && impHeadRole(c)).length; if (sc > bs) { bs = sc; head = i; } }
  t.head = head; t.roles = impRoles(t);
}
const impCols = t => { const o = { name: -1, date: -1, in: -1, out: -1, dt: -1, status: -1, note: -1, salary: -1 }; t.roles.forEach((r, c) => { if (r && o[r] === -1) o[r] = c; }); return o; };

/* ---- the days of one sheet: {name, date, times[], in, out, st, note}, grouped by employee + date ---- */
/* a line like «اسم الموظف: X» or «المرتب 5000» above the days of a month -> {k: 'name' | 'sal', v} */
function impLabel(r) {
  const ne = []; r.forEach((c, j) => { if (c !== '' && c != null) ne.push(j); }); if (ne.length < 1 || ne.length > 4 || typeof r[ne[0]] !== 'string') return null;
  if (ne.length === 1) { /* «اسم الموظف: X» / «المرتب: 5000» in one cell */
    const m = /^\s*([^:：]{2,24}?)\s*[:：]\s*(.+?)\s*$/.exec(toLat(r[ne[0]])); if (!m) return null; const k = impNrm(m[1]);
    if (/^(اسم (ال)?(موظف|عامل|مستخدم)|(ال)?(اسم|موظف|عامل)|employee( name)?|staff name|name)$/.test(k)) return m[2] && !impHeadRole(m[2]) && !impDate(m[2], 'dmy') && !/^[\d\s.,]+$/.test(m[2]) ? { k: 'name', v: m[2] } : null;
    if (/^((ال)?(مرتب|راتب)( (ال)?(اساسي|شهري|ثابت))?|(basic )?salary)$/.test(k)) { const n = num(cleanNum(m[2])); return n > 0 ? { k: 'sal', v: n } : null; }
    return null;
  }
  if (ne.length < 2) return null;
  const s = impNrm(r[ne[0]]), v = r[ne[1]];
  if (/^(اسم (ال)?(موظف|عامل|مستخدم)|(ال)?(اسم|موظف|عامل)|employee( name)?|staff name|name)$/.test(s)) { const nm = typeof v === 'string' ? v.trim() : ''; return nm && !impHeadRole(nm) && !impDate(nm, 'dmy') ? { k: 'name', v: nm } : null; }
  if (/^((ال)?(مرتب|راتب)( (ال)?(اساسي|شهري|ثابت))?|(basic )?salary)$/.test(s)) { const n = typeof v === 'number' ? v : num(cleanNum(String(v ?? ''))); return n > 0 ? { k: 'sal', v: n } : null; }
  return null;
}
const IMP_ADV = /^(الواصل|واصل|المسحوب|مسحوب|مسحوبات|السلف|سلف|السلفه|سلفه|advances?)$/;
/* the days of one sheet: {name, date, times[], in, out, st, note, sal, hrs}, grouped by employee + date; advs: the money written on the «الواصل» line of a month (no dates in the file: the last day written in that month) */
function impRows(t) {
  IMP_YR = t.yrless ? t.yr : 0;
  const K = impCols(t), days = new Map(), fixes = [], pl = []; let ignored = 0, last = '', curName = '', curSal = 0, prev = '', pend = null;
  const dm0 = () => { const [y, m] = String(t.ym || '').split('-').map(Number), n = new Date(); return { y: y || n.getFullYear(), m: m || n.getMonth() + 1, last: 0 }; }; let dm = dm0(); /* day numbers only: the month of the title, moving on when the days start again */
  const hc = t.head >= 0 ? t.rows[t.head].findIndex(h => typeof h === 'string' && /^ساعات (ال)?(يوم|دوام)|hours per day|daily hours|required hours/.test(impNrm(h))) : -1; /* «ساعات اليوم»: the hours of his day */
  const yc = {}; if (K.date >= 0) for (let i = t.head + 1; i < t.rows.length; i++) { const d = impDate(t.rows[i] && t.rows[i][K.date], t.ord); if (d) yc[d.slice(0, 4)] = (yc[d.slice(0, 4)] || 0) + 1; }
  const Y = +(Object.keys(yc).sort((p, q) => yc[q] - yc[p])[0] || 0), dd = (p, q) => Math.abs(Date.parse(p) - Date.parse(q)) / 864e5;
  for (let i = 0; i < t.rows.length; i++) {
    const r = t.rows[i]; if (!r || !r.some(c => c !== '' && c != null)) continue;
    const lb = i !== t.head ? impLabel(r) : null; if (lb) { if (lb.k === 'name') { if (lb.v !== curName) dm = dm0(); curName = lb.v; pend = null; } else curSal = lb.v; continue; }
    const aj = i !== t.head && K.name < 0 ? r.findIndex(c => typeof c === 'string' && IMP_ADV.test(impNrm(c))) : -1;
    if (aj >= 0 && !r.slice(0, aj).some(c => c !== '' && impDate(c, t.ord))) { const am = r.slice(aj + 1).map(x => typeof x === 'number' ? x : /^\d+([.,]\d+)?$/.test(String(x ?? '').trim()) ? num(cleanNum(String(x))) : 0).filter(x => x > 0); if (am.length) pl.push(pend = { name: t.fixedEmp ? '#' + t.fixedEmp : (curName || String(t.name || '')).trim(), amounts: am, last: '' }); else pend = null; continue; }
    if (i <= t.head) continue;
    let nm = t.fixedEmp ? '#' + t.fixedEmp : K.name >= 0 ? String(r[K.name] ?? '').trim() : (curName || String(t.name || '')).trim();
    if (K.name >= 0 && !t.fixedEmp) { if (!nm && last) nm = last; else if (nm) last = nm; }
    let date = K.date >= 0 ? impDate(r[K.date], t.ord) : '', tin = '', tout = '', punch = '';
    if (K.dt >= 0) { const c = r[K.dt]; if (!date) date = impDate(c, t.ord); const rg = impRange(c); if (rg) { tin = rg[0]; tout = rg[1]; } else punch = impTime(c, true); }
    if (!date && t.dayOnly && K.date >= 0) { const dv = r[K.date], n = typeof dv === 'number' ? dv : /^\d{1,2}$/.test(toLat(String(dv ?? '')).trim()) ? +toLat(String(dv).trim()) : 0; if (Number.isInteger(n) && n >= 1 && n <= 31) { if (dm.last && n < dm.last - 15) { dm.m++; if (dm.m > 12) { dm.m = 1; dm.y++; } } dm.last = n; date = impIso(dm.y, dm.m, n); } }
    if (K.in >= 0) { const c = r[K.in]; if (!date) date = impDate(c, t.ord); tin = impTime(c, true); }
    if (K.out >= 0) { const c = r[K.out]; if (!date) date = impDate(c, t.ord); tout = impTime(c, true); }
    if (K.in >= 0 && K.out < 0 && !tout) { const rg = impRange(r[K.in]); if (rg) { tin = rg[0]; tout = rg[1]; } } /* «9:00 - 17:00» in one cell */
    if (tin === '00:00' && (!tout || tout === '00:00')) { tin = ''; tout = ''; } /* 0:00 and 0:00 = nothing written (a day marked absent) */
    if (date && Y && K.date >= 0 && +date.slice(0, 4) !== Y) { const c = impIso(Y, +date.slice(5, 7), +date.slice(8, 10)); if (c && prev && dd(c, prev) <= 45 && dd(date, prev) > 45) { fixes.push(date + '>' + c); date = c; } } /* a year typed wrong (31\10\2027 between two days of 2026) */
    if (date) prev = date;
    if (!date || !nm) { ignored++; continue; }
    const note = K.note >= 0 ? String(r[K.note] ?? '').trim() : '', st = (K.status >= 0 ? impStatus(r[K.status]) : '') || (K.note >= 0 ? impStatus(note) : '');
    if (pend && date && (tin || tout || punch || st) && date > pend.last) pend.last = date;
    const sal = (K.salary >= 0 ? num(cleanNum(String(r[K.salary] ?? ''))) : 0) || curSal, key = nm + '\0' + date, hrs = hc >= 0 ? (hm(impTime(r[hc], true)) || 0) : 0;
    const d = days.get(key) || { name: nm, date, times: [], in: '', out: '', st: '', note: '', sal: 0, hrs: 0 }; days.set(key, d); if (sal > 0) d.sal = sal; if (hrs) d.hrs = hrs;
    if (punch) d.times.push(punch); if (tin && (!d.in || tin < d.in)) d.in = tin; if (tout && (!d.out || tout > d.out)) d.out = tout; if (st && !d.st) d.st = st; if (note) d.note = note;
  }
  return { days: [...days.values()], ignored, fixes, advs: pl.filter(p => p.last).flatMap(p => p.amounts.map(a => ({ name: p.name, date: p.last, amount: a }))) };
}
function impFinal(d, e) { /* one day -> what goes into the sheet ({type, in, out, note}) or null when there is nothing to record */
  if (d.st === 'off') return null;
  let ti = d.in, to = d.out; const ts = [...new Set(d.times)].sort();
  if (!ti && !to && ts.length) {
    const a = hm(ts[0]), z = hm(ts[ts.length - 1]);
    if (ts.length === 1 || z - a <= 5) { const S = e ? empTimes(e, d.date.slice(0, 7)) : null; if (S && Math.abs(a - hm(S.out)) < Math.abs(a - hm(S.in))) to = ts[0]; else ti = ts[0]; } /* one punch: the nearer of his two fixed times */
    else { ti = ts[0]; to = ts[ts.length - 1]; }
  }
  if (ti && to && ti === to) { const S = e ? empTimes(e, d.date.slice(0, 7)) : null; if (S && Math.abs(hm(ti) - hm(S.out)) < Math.abs(hm(ti) - hm(S.in))) ti = ''; else to = ''; }
  const type = d.st || (ti || to ? 'p' : ''); if (!type) return null; const nt = d.note && impStatus(d.note) && type !== 'v' ? '' : d.note; /* «غياب» written in the notes of an absent day is not repeated */
  return type === 'a' || type === 'v' ? { type, in: '', out: '', note: nt } : { type, in: ti, out: to, note: nt };
}

/* ---- a table of attendance: an employee on every line, the days of the month across the top (1 2 3 ... 31) ---- */
function impGridFind(rows) { /* -> {hr, days: [{c, d, iso}], nameCol} | null */
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const r = rows[i] || [], cs = []; r.forEach((v, c) => { if (v === '' || v == null) return; const n = typeof v === 'number' ? v : /^\d{1,2}$/.test(toLat(String(v)).trim()) ? +toLat(String(v)).trim() : 0; if (Number.isInteger(n) && n >= 1 && n <= 31) cs.push({ c, d: n, iso: '' }); else { const d = typeof v === 'string' || (typeof v === 'number' && v > 20000) ? impDate(v, 'dmy') : ''; if (d) cs.push({ c, d: +d.slice(8, 10), iso: d }); } });
    if (cs.length < 10) continue; let up = 0; for (let k = 1; k < cs.length; k++) if (cs[k].d === cs[k - 1].d + 1 || (cs[k].d === 1 && cs[k - 1].d >= 28)) up++; if (up / (cs.length - 1) < .85) continue;
    let nameCol = -1, bn = 0; for (let c = 0; c < cs[0].c; c++) { let n = 0; for (let k = i + 1; k < Math.min(rows.length, i + 200); k++) { const v = rows[k] && rows[k][c]; if (typeof v === 'string' && v.trim() && !/^[\d\s.,]+$/.test(v) && !impHeadRole(v)) n++; } if (n > bn) { bn = n; nameCol = c; } }
    if (nameCol >= 0) return { hr: i, days: cs, nameCol };
  }
  return null;
}
/* one cell of such a table -> {st, in, out} | null (nothing / a day off) */
function impGridCell(v) {
  if (v === '' || v == null) return null; if (typeof v === 'number') return v > 0 && v <= 24 ? { st: 'p' } : null;
  const raw = String(v).trim(), rg = impRange(raw); if (rg) return { st: 'p', in: rg[0], out: rg[1] };
  const t1 = impTime(raw); if (t1 && /^[\d:.\s apm]+(ص|م)?$/i.test(toLat(raw))) return { st: 'p', in: t1 };
  const st = impStatus(raw); if (st === 'off') return null; if (st) return { st };
  if (/^[✓✔√☑]$/.test(raw)) return { st: 'p' }; if (/^[✗✘×☒]$/.test(raw)) return { st: 'a' };
  if (/^[إأ]$|^ذ$/.test(raw)) return { st: 'x' };
  const k = impNrm(raw).replace(/ /g, ''), M = { 'ح': 'p', p: 'p', 'غ': 'a', a: 'a', 'ا': 'v', 'ج': 'v', 'ع': 'v', v: 'v', l: 'v', 'ذ': 'x', x: 'x' };
  return M[k] ? { st: M[k] } : null;
}
/* the table as plain lines: employee, date, in, out, status */
function impGridRows(t) {
  const g = t.grid, out = [['اسم الموظف', 'التاريخ', 'الحضور', 'الانصراف', 'الحالة']]; let [y, m] = String(t.ym || '').split('-').map(Number), last = 0; if (!y) { const n = new Date(); y = n.getFullYear(); m = n.getMonth() + 1; }
  const dates = g.days.map(x => { if (x.iso) return x.iso; if (last && x.d < last - 15) { m++; if (m > 12) { m = 1; y++; } } last = x.d; return impIso(y, m, x.d); });
  for (let i = g.hr + 1; i < t.src.length; i++) {
    const r = t.src[i] || [], nm = typeof r[g.nameCol] === 'string' ? r[g.nameCol].trim() : ''; if (!nm || impHeadRole(nm) || /^(اجمالي|الاجمالي|المجموع|مجموع|total|sum)/.test(impNrm(nm))) continue;
    g.days.forEach((x, k) => { const c = impGridCell(r[x.c]); if (c && dates[k]) out.push([nm, dates[k], c.in || '', c.out || '', c.st || '']); });
  }
  return out;
}
/* the first look at a sheet: its year, its month, a table of days made into lines, the columns */
function impPrep(o) {
  o.ord = impOrd(o.rows); IMP_YR = 0; const y = impYear(o); o.yr = y.yr; o.yrless = y.less; o.yrSrc = y.src; o.ym = impMonthHint(o, o.yr); o.ymSrc = o.ym ? 'title' : 'guess';
  const g = impGridFind(o.rows), cm = ymd(new Date()).slice(0, 7);
  if (g) { o.grid = g; o.src = o.rows; if (!o.ym) o.ym = cm; o.rows = impGridRows(o); o.head = 0; o.roles = ['name', 'date', 'in', 'out', 'status']; o.fixedEmp = ''; return o; }
  impGuess(o); if (o.dayOnly && !o.ym) o.ym = cm; return o;
}

/* ---- matching the names of the file with the employees ---- */
function impLev(a, b) { const m = a.length, n = b.length; if (Math.abs(m - n) > 1) return 9; let p = Array.from({ length: n + 1 }, (_, j) => j); for (let i = 1; i <= m; i++) { const c = [i]; for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; } return p[n]; }
function impMatch(name) { /* -> {id, kind: 'exact' | 'sug' | ''} */
  const n = impNrm(name); if (!n) return { id: '', kind: '' };
  const E = db.emps.map(e => ({ e, n: impNrm(e.name) })), tk = s => s.split(' ').filter(Boolean), a = tk(n); let m = E.filter(x => x.n === n);
  if (m.length === 1) return { id: m[0].e.id, kind: 'exact' };
  m = E.filter(x => { const b = tk(x.n), s = a.length <= b.length ? a : b, l = a.length <= b.length ? b : a; return s.length && s.every(w => l.includes(w)); }); if (m.length === 1) return { id: m[0].e.id, kind: 'sug' };
  if (n.length >= 6) { m = E.filter(x => impLev(n, x.n) <= 1); if (m.length === 1) return { id: m[0].e.id, kind: 'sug' }; }
  return { id: '', kind: '' };
}

/* ---- everything the preview shows, worked out from the sheets and the choices made so far ---- */
let IMP = null; /* {file, tables:[{name, rows, ord, head, roles, fixedEmp, on}], cur, map:{fileName: empId}, mode:'skip'|'over'} */
function impBuild() {
  const B = { names: [], list: [], ignored: 0, add: 0, rep: 0, same: 0, paid: 0, skipEx: 0, fixes: [], advList: [], advRecs: [], advNew: 0, order: [], months: new Set() }, INF = {}, byName = new Map(), idx = new Map(), NW = IMP.nw = IMP.nw || {}; /* NW: employees to be added from the file (not in the program yet) */
  Object.values(NW).forEach(v => { v.salary = 0; });
  const virt = name => { const k = impNrm(name), f = INF[k], o = NW[k] = NW[k] || { id: '+' + k, name: name.trim(), salary: 0, _new: true }; o.in = f ? f.in : hr().in; o.out = f ? f.out : hr().out; o.inf = !!f; return o; }; /* a new employee's fixed times: worked out from the file when it says enough */
  db.att.forEach(r => idx.set(r.empId + '|' + r.date, r));
  IMP.tables.forEach((t, ti) => {
    if (!t.on) return; const R = impRows(t); B.ignored += R.ignored; B.fixes.push(...R.fixes); B.advList.push(...R.advs);
    R.days.forEach(d => {
      let n = byName.get(d.name); if (!n) { n = { key: d.name, name: d.name, fixed: d.name[0] === '#', days: 0, sheets: new Set() }; if (n.fixed) { const fe = empById(d.name.slice(1)); n.name = fe ? fe.name : '—'; } else if (!(d.name in IMP.map)) IMP.map[d.name] = impMatch(d.name).id || '+'; /* a name nobody here has: a new employee (the person can pick someone else or skip it) */ byName.set(d.name, n); B.names.push(n); }
      n.days++; n.sheets.add(t.name); d.ti = ti;
    });
    B.list.push(...R.days);
  });
  /* the fixed times of an employee who is not in the program yet: the usual arrival (the most common one, to the nearest half hour) and the length of his day written in the file («ساعات اليوم»), else the program's own length of a day */
  const IA = {}; B.list.forEach(d => { if (IMP.map[d.name] !== '+') return; const k = impNrm(d.name), f = impFinal(d, null), a = IA[k] = IA[k] || { ins: [], hrs: [] }; if (f && f.type === 'p' && f.in) a.ins.push(hm(f.in)); if (d.hrs) a.hrs.push(d.hrs); });
  const mode = a => { const c = {}; a.forEach(x => { c[x] = (c[x] || 0) + 1; }); const k = Object.keys(c).sort((p, q) => c[q] - c[p] || p - q)[0]; return k == null ? null : +k; };
  Object.keys(IA).forEach(k => { const a = IA[k]; if (a.ins.length < 3) return; const ar = mode(a.ins.map(x => Math.round(x / 30) * 30)), len = mode(a.hrs) || ((hm(hr().out) - hm(hr().in) + 1440) % 1440 || 540); INF[k] = { in: impHM(ar % 1440), out: impHM((ar + len) % 1440) }; });
  const fin = new Map();
  B.list.forEach(d => {
    const n = byName.get(d.name), ch = n.fixed ? d.name.slice(1) : IMP.map[d.name], e = ch === '+' ? virt(d.name) : empById(ch); if (!e) return;
    if (!B.order.includes(e.id)) B.order.push(e.id); /* the order of the file: the first sheet first */
    if (e._new && d.sal && !e.salary) e.salary = d.sal;
    const f = impFinal(d, e); if (!f) { B.ignored++; return; }
    const ym = d.date.slice(0, 7), ex = idx.get(e.id + '|' + d.date); let st = 'new';
    if (e.paid && e.paid[ym]) st = 'paid'; else if (ex) st = ex.type === f.type && (ex.in || '') === f.in && (ex.out || '') === f.out ? 'same' : 'ex';
    fin.set(e.id + '|' + d.date, { e, date: d.date, f, st, ex });
  });
  B.recs = [...fin.values()].sort((a, b) => a.e.name.localeCompare(b.e.name, 'ar') || a.date.localeCompare(b.date));
  B.recs.forEach(r => { B.months.add(r.date.slice(0, 7)); if (r.st === 'new') B.add++; else if (r.st === 'ex') { if (IMP.mode === 'over') B.rep++; else B.skipEx++; } else if (r.st === 'same') B.same++; else B.paid++; });
  B.emps = new Set(B.recs.filter(r => r.st === 'new' || (r.st === 'ex' && IMP.mode === 'over')).map(r => r.e.id)).size;
  B.todo = B.add + B.rep;
  const nw = new Set(B.recs.filter(r => r.e._new && r.st === 'new').map(r => r.e)); B.newEmps = nw.size; B.newZero = [...nw].filter(e => !e.salary).length;
  /* the advances of the file: each one is a line of the employee's month (taken off his salary); a month already paid, a closed period or one that is already there is not touched again */
  const today = ymd(new Date()), AX = new Set(db.adv.map(x => x.empId + '|' + x.date + '|' + round2(x.amount)));
  B.advRecs = IMP.adv === 'off' ? [] : B.advList.map(a => {
    const ch = a.name[0] === '#' ? a.name.slice(1) : IMP.map[a.name], e = ch === '+' ? virt(a.name) : empById(ch); if (!e) return null;
    const date = a.date > today ? today : a.date, ym = date.slice(0, 7); let st = 'new';
    if (e.paid && e.paid[ym]) st = 'paid'; else if (isLocked(date)) st = 'locked'; else if (AX.has(e.id + '|' + date + '|' + round2(a.amount))) st = 'same';
    return { e, date, amount: round2(a.amount), st };
  }).filter(Boolean);
  B.advNew = B.advRecs.filter(r => r.st === 'new').length; B.advSum = round2(B.advRecs.filter(r => r.st === 'new').reduce((z, r) => z + r.amount, 0));
  return B;
}
/* the preview, one employee at a time: who is in it, and every month of his as the sheet will look after the import */
function impSheets(B) {
  const M = new Map(); [...B.recs, ...B.advRecs].forEach(r => { let x = M.get(r.e.id); if (!x) M.set(r.e.id, x = { id: r.e.id, name: r.e.name, e: r.e, months: new Set() }); x.months.add(r.date.slice(0, 7)); });
  const o = id => { const i = B.order.indexOf(id); return i < 0 ? 1e6 : i; };
  return [...M.values()].map(x => Object.assign(x, { months: [...x.months].sort() })).sort((a, b) => o(a.id) - o(b.id) || a.name.localeCompare(b.name, 'ar'));
}
function impPaper(B, x, ym) {
  const by = new Map(), e = x.e; if (!e._new) db.att.filter(a => a.empId === e.id && a.date.slice(0, 7) === ym).forEach(a => by.set(a.date, { date: a.date, type: a.type, in: a.in || '', out: a.out || '', note: a.note || '' }));
  B.recs.forEach(r => { if (r.e.id === e.id && r.date.slice(0, 7) === ym && (r.st === 'new' || r.st === 'same' || (r.st === 'ex' && IMP.mode === 'over'))) by.set(r.date, Object.assign({ date: r.date }, r.f)); }); /* what stays as it is (already there, a paid month) is kept, what comes from the file is laid over it */
  const advs = (e._new ? [] : db.adv.filter(a => a.empId === e.id && a.date.slice(0, 7) === ym)).concat(B.advRecs.filter(r => r.e.id === e.id && r.st === 'new' && r.date.slice(0, 7) === ym).map(r => ({ id: '', empId: e.id, date: r.date, amount: r.amount })));
  return empPaper(Object.assign({ kind: 'm' }, e), ym, [...by.values()], advs);
}
function impCommit(B) { /* writes the days; -> how many (B.created = the employees added from the file) */
  const idx = new Map(), real = {}; db.att.forEach(r => idx.set(r.empId + '|' + r.date, r)); let n = 0; B.created = 0;
  const emp = e => { if (!e._new) return e; let x = real[e.id]; if (!x) { x = db.emps.find(z => z.name === e.name); if (!x) { x = { id: uid(), name: e.name, job: '', kind: 'm', salary: e.salary || 0, in: e.in, out: e.out }; db.emps.push(x); logA('emp_add', x.name, money(x.salary)); B.created++; } real[e.id] = x; } return x; };
  B.recs.forEach(r => {
    if (r.st === 'new') { r.e = emp(r.e);
      const x = { id: uid(), empId: r.e.id, date: r.date, type: r.f.type, in: r.f.in, out: r.f.out, note: r.f.note || '' }; db.att.push(x); idx.set(r.e.id + '|' + r.date, x); n++; }
    else if (r.st === 'ex' && IMP.mode === 'over') { const x = idx.get(r.e.id + '|' + r.date); if (x) { x.type = r.f.type; x.in = r.f.in; x.out = r.f.out; if (r.f.note) x.note = r.f.note; n++; } }
  });
  B.advDone = 0;
  (B.advRecs || []).forEach(r => { if (r.st !== 'new') return; const e = emp(r.e), a = { id: uid(), empId: e.id, date: r.date, amount: r.amount, note: 'من ملف Excel' };
    if (IMP.adv !== 'only') { const x = { id: uid(), date: new Date(r.date + 'T12:00:00').toISOString(), title: 'سلفة موظف — ' + e.name, amount: r.amount, note: a.note, cat: 'misc', advId: a.id }; a.expId = x.id; db.expenses.push(x); } /* like an advance written from the employee's sheet: it is also money out of the cash */
    db.adv.push(a); logA('adv_add', e.name, money(r.amount)); B.advDone++; });
  return n;
}

/* ---- the screens ---- */
async function impStart(file) { /* a file picked on the employees screen */
  if (file.size > 25e6) return toast('الملف كبير جداً');
  let tabs; try { tabs = await impReadFile(file); } catch (e) {
    return toast(e.message === 'xls' ? 'تعذرت قراءة ملف Excel القديم (xls). افتحه في Excel واحفظه باسم جديد بصيغة xlsx ثم اختره هنا' : e.message === 'xlspass' ? 'الملف محمي بكلمة سر. افتحه في Excel وشيل الحماية واحفظه بصيغة xlsx ثم اختره هنا' : e.message === 'empty' ? 'الملف فاضي' : 'تعذرت قراءة الملف. اتأكد إنه ملف Excel أو CSV سليم');
  }
  const T = tabs.map(t => { const o = { name: t.name, rows: t.rows, ord: 'dmy', head: -1, roles: [], fixedEmp: '', on: false }; impPrep(o); o.on = impRows(o).days.length > 0; return o; });
  if (!T.some(t => t.on)) T[0].on = true;
  IMP = { file: file.name, tables: T, cur: Math.max(0, T.findIndex(t => t.on)), map: {}, mode: 'skip', adv: 'exp' };
  go('empImp');
}
const impShow = v => typeof v === 'number' ? (v > 0 && v < 1 ? esc(impTime(v)) : esc(String(Math.round(v * 1e6) / 1e6))) : esc(String(v ?? '').replace(/^(?:18\d\d|19[0-8]\d)-\d\d-\d\d(?: (\d\d:\d\d))?$/, (_, t) => t || '00:00')); /* a time kept as a date of 1899 / 1904 (how a 1904-style Excel file keeps hours) shows as the time */
screens.empImp = (p, v) => {
  if (!IMP) { v.innerHTML = subHead('استيراد حضور وانصراف من Excel') + `<section class="panel"><p class="lbl" style="margin:0">اختر الملف من شاشة «الموظفين» بزرار «استيراد حضور من Excel».</p></section>`; return; }
  v.innerHTML = subHead('استيراد حضور وانصراف من Excel') + '<div class="stack" id="imp-root"></div><div id="paper" class="ponly"></div>';
  const root = $('#imp-root'), cur = () => IMP.tables[IMP.cur];
  const fit = () => { /* a phone: the sheet is shrunk (a transform, not CSS zoom: the sheet already uses zoom for its font size and Safari mixes the two up) to the screen width so the whole of it is seen at once; «تكبير» shows it full size (it then scrolls sideways) */
    const box = root.querySelector('.imp-paper'), pp = box && box.querySelector('.paper'); if (!pp) return;
    if (root._ro) { root._ro.disconnect(); root._ro = null; }
    pp.style.transform = ''; pp.style.width = ''; pp.style.transformOrigin = ''; pp.style.boxSizing = ''; box.style.height = ''; box.removeAttribute('data-fit');
    const w = box.clientWidth; if (IMP.zoom === 'full' || !(w > 0 && w < 720)) return;
    const z = w / 720, h = () => { box.style.height = Math.ceil(pp.offsetHeight * z) + 'px'; };
    pp.style.boxSizing = 'border-box'; pp.style.width = '720px'; pp.style.transformOrigin = getComputedStyle(box).direction === 'rtl' ? 'top right' : 'top left'; pp.style.transform = 'scale(' + z.toFixed(4) + ')'; box.setAttribute('data-fit', '1'); h();
    if (window.ResizeObserver) { root._ro = new ResizeObserver(h); root._ro.observe(pp); } /* the sheet gets taller (fonts loaded, font size changed): the box follows */
  };
  const onRs = () => { if (!root.isConnected) return window.removeEventListener('resize', onRs); fit(); }; window.addEventListener('resize', onRs);
  const draw = () => {
    const y = window.scrollY, t = cur(), B = impBuild(), K = impCols(t), nc = t.roles.length, shown = []; for (let i = t.head + 1; i < t.rows.length && shown.length < 6; i++) if (t.rows[i].some(c => c !== '' && c != null)) shown.push(t.rows[i]);
    const emps = db.emps.slice().sort((a, b) => a.name.localeCompare(b.name, 'ar')), eo = sel => `<option value="">— تخطي —</option><option value="+"${sel === '+' ? ' selected' : ''}>+ إضافة كموظف جديد</option>` + emps.map(e => `<option value="${e.id}"${e.id === sel ? ' selected' : ''}>${esc(e.name)}</option>`).join('');
    const sheets = IMP.tables.length > 1 ? `<div class="actions" style="justify-content:flex-start;gap:8px;flex-wrap:wrap;margin-top:10px">${IMP.tables.map((x, i) => `<span class="imp-chip${i === IMP.cur ? ' on' : ''}"><input type="checkbox" data-on="${i}" aria-label="استيراد هذه الورقة"${x.on ? ' checked' : ''}><button type="button" class="mini${i === IMP.cur ? ' on' : ''}" data-tb="${i}">${esc(x.name)}</button></span>`).join('')}</div>` : '';
    const noName = K.name < 0, usable = (K.date >= 0 || K.dt >= 0 || K.in >= 0 || K.out >= 0);
    const map = `<section class="panel"><h2 class="panel-t">ربط الأعمدة${IMP.tables.length > 1 ? ' — ' + esc(t.name) : ''}</h2>
      <div class="form-grid">
        <div class="field"><label for="i-head">صف العناوين</label><div class="sel"><select id="i-head"><option value="-1"${t.head < 0 ? ' selected' : ''}>بدون عناوين</option>${Array.from({ length: Math.min(15, t.rows.length) }, (_, i) => `<option value="${i}"${t.head === i ? ' selected' : ''}>الصف ${i + 1}</option>`).join('')}</select></div></div>
        <div class="field"><label for="i-ord">ترتيب التاريخ في الملف</label><div class="sel"><select id="i-ord"><option value="dmy"${t.ord === 'dmy' ? ' selected' : ''}>يوم / شهر / سنة</option><option value="mdy"${t.ord === 'mdy' ? ' selected' : ''}>شهر / يوم / سنة</option></select></div></div>
        ${t.dayOnly || t.grid ? `<div class="field"><label for="i-ym">الشهر (الملف مكتوب فيه أيام بس)</label><input id="i-ym" class="inp" type="month" value="${esc(t.ym || '')}"></div>` : ''}
        ${t.yrless ? `<div class="field"><label for="i-yr">السنة (التواريخ مكتوبة من غير سنة)</label><input id="i-yr" class="inp" inputmode="numeric" value="${t.yr}"></div>` : ''}
        ${noName ? `<div class="field"><label for="i-fix">الموظف (مفيش عمود أسماء في الورقة)</label><div class="sel"><select id="i-fix"><option value="">من اسم الورقة (${esc(t.name)})</option>${emps.map(e => `<option value="${e.id}"${t.fixedEmp === e.id ? ' selected' : ''}>${esc(e.name)}</option>`).join('')}</select></div></div>` : ''}
      </div>
      <div class="tbl-wrap imp-wrap" style="margin-top:12px"><table class="grid imp-t"><thead><tr>${t.roles.map((r, c) => `<th><div class="sel"><select data-role="${c}" aria-label="نوع العمود">${IMP_ROLES.map(([k, l]) => `<option value="${k}"${k === r ? ' selected' : ''}>${l}</option>`).join('')}</select></div><small>${t.head >= 0 ? impShow(t.rows[t.head][c]) : `عمود ${c + 1}`}</small></th>`).join('')}</tr></thead>
        <tbody>${shown.map(r => `<tr>${t.roles.map((_, c) => `<td>${impShow(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      ${usable ? '' : `<div class="note" style="margin:12px 0 0;display:block">مقدرتش أعرف عمود التاريخ أو الحضور. اختار نوع كل عمود من القوائم فوق.</div>`}</section>`;
    const nwInfo = n => { const v = IMP.nw && IMP.nw[impNrm(n.name)]; return v ? `<br><small class="muted">${hrRange(v)}${v.salary ? ' · ' + fmt(v.salary) : ''}</small>` : ''; }; /* a new employee: his fixed times and the salary the file gives */
    const pill = n => { const ch = n.fixed ? '#' : IMP.map[n.key], m = n.fixed ? null : impMatch(n.name); return n.fixed ? '<span class="pill ok">ورقة موظف</span>' : ch === '+' ? '<span class="pill info">موظف جديد</span>' + nwInfo(n) : !ch ? '<span class="pill bad">هيتخطى</span>' : m.id === ch ? (m.kind === 'exact' ? '<span class="pill ok">مطابق</span>' : '<span class="pill info">مقترح — اتأكد</span>') : '<span class="pill ok">اخترته بنفسك</span>'; };
    const guess = IMP.tables.filter(x => x.on && (((x.dayOnly || (x.grid && x.grid.days.some(d => !d.iso))) && x.ymSrc === 'guess') || (x.yrless && x.yrSrc === 'guess'))); /* a month or a year that is not in the file */
    const warn = B.names.filter(n => { if (n.fixed) return false; const ch = IMP.map[n.key], m = impMatch(n.name); return ch === m.id && m.kind === 'sug'; }); /* names the person should look at: the guesses (a name skipped on purpose is not one) */
    const names = B.names.length ? `<section class="panel"><h2 class="panel-t">الموظفين في الملف</h2><div class="tbl-wrap"><table class="grid"><colgroup><col style="width:34%"><col style="width:12%"><col style="width:32%"><col style="width:22%"></colgroup><thead><tr><th>الاسم في الملف</th><th>أيام</th><th>الموظف عندنا</th><th>الحالة</th></tr></thead><tbody>${B.names.map((n, i) => `<tr><td class="nm">${esc(n.name)}</td><td>${n.days}</td><td>${n.fixed ? esc(n.name) : `<div class="sel"><select data-nm="${i}" aria-label="الموظف">${eo(IMP.map[n.key])}</select></div>`}</td><td>${pill(n)}</td></tr>`).join('')}</tbody></table></div></section>` : '';
    const stat = (a, b, k = '') => `<div class="stat ${k}"><span>${a}</span><b>${b}</b></div>`;
    const PE = B.recs.length ? impSheets(B) : [], pe = PE.find(x => x.id === IMP.pe) || PE[0], pm = pe ? (pe.months.includes(IMP.pm) ? IMP.pm : pe.months[0]) : '', nAll = PE.reduce((n, x) => n + x.months.length, 0);
    const go = `<div class="imp-go"><button class="btn lg" id="i-go" type="button"${B.todo || B.advNew ? '' : ' disabled'}>${ICON.save}<span>${B.advNew ? `استيراد ${B.todo} يوم و ${B.advNew} سلفة` : `استيراد ${B.todo} يوم`}</span></button><button class="btn ghost" id="i-no" type="button">إلغاء</button></div>`;
    const sumT = B.todo || B.advNew ? 'راجع الكشوف تحت وبعدين دوس استيراد. ما بيتحفظ حاجة قبل كده.' : B.recs.length ? 'كل الأيام اللي في الملف متسجلة قبل كده.' : 'مالقيتش حضور في الملف.';
    const gmsg = guess.map(x => x.ymSrc === 'guess' && (x.dayOnly || x.grid) ? `<div>الملف مش مكتوب فيه الشهر، فاخترت ${ymLabel(x.ym)}.</div>` : `<div>الملف مش مكتوب فيه السنة، فاخترت ${x.yr}.</div>`).join('');
    const advT = warn.length || !usable || guess.length ? 'الأعمدة والأسماء — محتاجة مراجعة' : 'الأعمدة والأسماء — اتظبطت تلقائي';
    const top = `<section class="panel imp-top"><h2 class="panel-t big blue">${ICON.docs}<span>${esc(IMP.file)}</span></h2>
      <p class="imp-sum">${sumT}${usable && !warn.length ? '' : ' افتح «الأعمدة والأسماء» تحت وظبطها.'}</p>
      ${go}
      <div class="stats">${B.emps ? stat('موظفين', B.emps, 'blue') : ''}${stat('أيام جديدة', B.add, 'pos')}${B.rep || B.skipEx ? stat(IMP.mode === 'over' ? 'أيام هتتعدّل' : 'أيام متسجلة هتتخطى', IMP.mode === 'over' ? B.rep : B.skipEx) : ''}${B.same ? stat('أيام زي ما هي', B.same) : ''}${B.paid ? stat('راتبها اتصرف (متخطاة)', B.paid, 'neg') : ''}${B.ignored ? stat('صفوف اتجاهلت', B.ignored) : ''}${B.advNew ? stat('سلف جديدة', B.advNew, 'blue') + stat('مبلغ السلف', money(B.advSum), 'neg') : ''}</div>
      <div class="form-grid" style="margin-top:14px"><div class="field"><label for="i-mode">لو اليوم متسجّل قبل كده</label><div class="sel"><select id="i-mode"><option value="skip"${IMP.mode === 'skip' ? ' selected' : ''}>سيبه زي ما هو</option><option value="over"${IMP.mode === 'over' ? ' selected' : ''}>اكتب فوقه بالجديد</option></select></div></div>
      ${B.advList.length ? `<div class="field"><label for="i-adv">السلف في الملف (خانة «الواصل»)</label><div class="sel"><select id="i-adv"><option value="exp"${IMP.adv === 'exp' ? ' selected' : ''}>سجّلها كسلف وفي المصروفات (زي تسجيل السلفة من كشف الموظف)</option><option value="only"${IMP.adv === 'only' ? ' selected' : ''}>سجّلها كسلف بس (من غير مصروفات)</option><option value="off"${IMP.adv === 'off' ? ' selected' : ''}>سيبها ومتسجلهاش</option></select></div></div>` : ''}</div>
      ${warn.length ? `<div class="note" style="margin:12px 0 0;display:block">في ${warn.length} اسم محتاج تتأكد منه. افتح «الأعمدة والأسماء» تحت.</div>` : ''}
      ${guess.length ? `<div class="note" style="margin:12px 0 0;display:block">${gmsg}<div>لو غلط غيّره من «الأعمدة والأسماء» تحت.</div></div>` : ''}
      ${B.newZero ? `<div class="note" style="margin:12px 0 0;display:block">الموظفين الجداد بيتضافوا براتب صفر لو الملف مفيهوش عمود راتب. اكتب راتب كل واحد من كشفه بعد الاستيراد.</div>` : ''}
      ${B.fixes.length ? `<div class="note" style="margin:12px 0 0;display:block">اتصحّحت سنة تاريخ مكتوب غلط عشان يطابق باقي الملف: <bdi dir="ltr">${esc([...new Set(B.fixes)].slice(0, 6).map(f => f.replace('>', ' → ')).join(' , '))}</bdi></div>` : ''}
      ${B.paid ? `<div class="note" style="margin:12px 0 0;display:block">في أيام تابعة لشهر اتصرف راتب الموظف فيه، فاتخطّيتها. ألغِ صرف الراتب من كشف الموظف لو عايز تعدّلها.</div>` : ''}
      ${B.advRecs.length ? `<div class="note" style="margin:12px 0 0;display:block">الملف مفيهوش تواريخ للسلف، فبتتسجل بتاريخ آخر يوم حضور مكتوب في كل شهر. لو عايز تاريخ تاني امسحها من كشف الموظف وسجّلها من جديد.</div>` : ''}</section>`;
    const per = pe ? `<section class="panel"><h2 class="panel-t">كشف كل موظف بعد الاستيراد</h2>
      <div class="actions imp-chips">${PE.map(x => `<button type="button" class="mini${x.id === pe.id ? ' on' : ''}" data-pe="${esc(x.id)}">${esc(x.name)}</button>`).join('')}</div>
      ${pe.months.length > 1 ? `<div class="actions imp-chips">${pe.months.map(m => `<button type="button" class="mini${m === pm ? ' on' : ''}" data-pm="${m}">${esc(ymLabel(m))}</button>`).join('')}</div>` : ''}
      <div class="actions imp-chips imp-btns"><button class="btn ghost imp-zoom" id="i-zoom" type="button"><span>${IMP.zoom === 'full' ? 'تصغير الكشف على الشاشة' : 'تكبير الكشف'}</span></button><button class="btn ghost" id="i-pdf" type="button">${ICON.pdf}<span>PDF الكشف ده</span></button>${nAll > 1 ? `<button class="btn ghost" id="i-pdfall" type="button">${ICON.pdf}<span>PDF كل الكشوف (${nAll})</span></button>` : ''}${window.claude ? '' : `<button class="btn ghost" id="i-prt" type="button">${ICON.printer}<span>طباعة</span></button>${nAll > 1 ? `<button class="btn ghost" id="i-prtall" type="button">${ICON.printer}<span>طباعة الكل</span></button>` : ''}`}</div>
      <div class="imp-paper" style="margin-top:14px">${impPaper(B, pe, pm)}</div></section>` : '';
    const adv = `<details class="imp-adv" data-k="a"${(IMP.advOpen != null ? IMP.advOpen : !usable || warn.length || guess.length || !B.recs.length) ? ' open' : ''}><summary>${advT}</summary><div class="stack">${IMP.tables.length > 1 ? `<section class="panel"><h2 class="panel-t">الأوراق في الملف</h2><p class="lbl" style="margin:0">علّم على الورقة اللي عايز تستوردها.</p>${sheets}</section>` : ''}${map}${names}</div></details>`;
    const more = B.recs.length || B.advRecs.length ? `<details class="imp-adv"><summary>تفاصيل الأيام والسلف</summary><div class="stack"><section class="panel">
      ${B.advRecs.length ? `<h3 class="panel-t">السلف</h3><div class="tbl-wrap"><table class="grid"><thead><tr><th>سلفة — الموظف</th><th>التاريخ</th><th>المبلغ</th><th>الوضع</th></tr></thead><tbody>${B.advRecs.slice(0, 30).map(r => `<tr><td class="nm">${esc(r.e.name)}</td><td><bdi dir="ltr">${r.date}</bdi></td><td>${money(r.amount)}</td><td>${r.st === 'new' ? '<span class="pill ok">جديدة</span>' : r.st === 'same' ? '<span class="pill info">موجودة</span>' : r.st === 'paid' ? '<span class="pill bad">راتب مصروف</span>' : '<span class="pill bad">فترة مقفولة</span>'}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${B.recs.length ? `<h3 class="panel-t"${B.advRecs.length ? ' style="margin-top:18px"' : ''}>الأيام</h3><div class="tbl-wrap"><table class="grid"><thead><tr><th>الموظف</th><th>التاريخ</th><th>الحالة</th><th>الحضور</th><th>الانصراف</th><th>الوضع</th></tr></thead><tbody>${B.recs.slice(0, 40).map(r => `<tr><td class="nm">${esc(r.e.name)}</td><td><bdi dir="ltr">${r.date}</bdi></td><td>${ATT[r.f.type]}</td><td>${r.f.in ? t12(r.f.in) : '—'}</td><td>${r.f.out ? t12(r.f.out) : '—'}</td><td>${r.st === 'new' ? '<span class="pill ok">جديد</span>' : r.st === 'same' ? '<span class="pill info">زي ما هو</span>' : r.st === 'paid' ? '<span class="pill bad">راتب مصروف</span>' : IMP.mode === 'over' ? '<span class="pill info">هيتعدّل</span>' : '<span class="pill bad">هيتخطى</span>'}</td></tr>`).join('')}</tbody></table></div>${B.recs.length > 40 ? `<p class="lbl" style="margin:10px 0 0">أول 40 يوم من ${B.recs.length}.</p>` : ''}` : ''}</section></div></details>` : '';
    root.innerHTML = top + per + adv + more + `<div class="submit"><button class="btn lg" id="i-go2" type="button"${B.todo || B.advNew ? '' : ' disabled'}>${ICON.save}<span>${B.advNew ? `استيراد ${B.todo} يوم و ${B.advNew} سلفة` : `استيراد ${B.todo} يوم`}</span></button><button class="btn ghost" id="i-no2" type="button">إلغاء</button></div>`;
    root._all = () => PE.flatMap(x => x.months.map(m => impPaper(B, x, m))); fit();
    window.scrollTo(0, y); root._B = B; root._pe = pe; root._pm = pm;
  };
  const regen = () => { const t = cur(); if (!t.grid) t.roles = impRoles(t); };
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-tb]'); if (b) { IMP.cur = +b.dataset.tb; return draw(); }
    if (e.target.closest('#i-zoom')) { IMP.zoom = IMP.zoom === 'full' ? '' : 'full'; return draw(); }
    if (e.target.closest('#i-pdf') && root._pe) return pdfSave(impPaper(root._B, root._pe, root._pm), 'كشف حضور وراتب ' + root._pe.name, root._pm);
    if (e.target.closest('#i-pdfall') && root._all) return pdfSave(root._all().join(''), 'كشوف حضور وراتب', IMP.file.replace(/\.[^.]+$/, ''));
    const pa = e.target.closest('#i-prt') || e.target.closest('#i-prtall');
    if (pa && root._pe) { const all = pa.id === 'i-prtall'; $('#paper').innerHTML = all ? root._all().join('') : impPaper(root._B, root._pe, root._pm); root.classList.add('noprint'); const un = () => root.classList.remove('noprint'); window.addEventListener('afterprint', un, { once: true }); setTimeout(un, 60000); return printRep(all ? 'كشوف_حضور_وراتب' : hrFile('كشف_حضور_وراتب_' + root._pe.name, root._pm)); } /* only the sheet is printed: the rest of the screen is hidden while the print dialog is open */
    const pb = e.target.closest('[data-pe]'); if (pb) { IMP.pe = pb.dataset.pe; IMP.pm = ''; return draw(); }
    const mb = e.target.closest('[data-pm]'); if (mb) { IMP.pm = mb.dataset.pm; return draw(); }
    if (e.target.closest('#i-no, #i-no2')) { IMP = null; return back(); }
    if (e.target.closest('#i-go, #i-go2')) {
      const B = root._B; if (!B || (!B.todo && !B.advNew)) return; const n = impCommit(B), f = IMP.file; logA('att_import', f, `${n} يوم`); save(); IMP = null; back(); toast(`تم استيراد ${n} يوم`, 'ok'); if (B.advDone) toast(`تمت إضافة ${B.advDone} سلفة`, 'ok'); if (B.created) toast(`تمت إضافة ${B.created} موظف جديد`, 'ok');
    }
  });
  root.addEventListener('toggle', e => { if (e.target.dataset && e.target.dataset.k === 'a') IMP.advOpen = e.target.open; }, true); /* the columns / names panel keeps its state while the screen is drawn again */
  root.addEventListener('change', e => {
    const t = e.target, T = cur();
    if (t.dataset.on != null) { IMP.tables[+t.dataset.on].on = t.checked; return draw(); }
    if (t.dataset.role != null) { T.roles[+t.dataset.role] = t.value; return draw(); }
    if (t.dataset.nm != null) { const n = root._B.names[+t.dataset.nm]; if (n) IMP.map[n.key] = t.value; return draw(); }
    if (t.id === 'i-head') { T.head = +t.value; regen(); T.on = impRows(T).days.length > 0 || T.on; return draw(); }
    if (t.id === 'i-ord') { T.ord = t.value; regen(); return draw(); }
    if (t.id === 'i-fix') { T.fixedEmp = t.value; return draw(); }
    if (t.id === 'i-ym') { if (/^\d{4}-\d{2}$/.test(t.value)) { T.ym = t.value; T.ymSrc = 'user'; if (T.grid) T.rows = impGridRows(T); T.on = impRows(T).days.length > 0 || T.on; } return draw(); }
    if (t.id === 'i-yr') { const y = Math.round(+toLat(t.value)); if (y >= 1990 && y <= 2100) { T.yr = y; T.yrSrc = 'user'; regen(); } return draw(); }
    if (t.id === 'i-adv') { IMP.adv = ['exp', 'only', 'off'].includes(t.value) ? t.value : 'exp'; return draw(); }
    if (t.id === 'i-mode') { IMP.mode = t.value === 'over' ? 'over' : 'skip'; return draw(); }
  });
  draw();
};
