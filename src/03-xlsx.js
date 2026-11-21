/* ---------- Excel files (.xlsx) written right here, no library: a ZIP of a few XML parts.
   The sheet is laid out like the printed invoice: the letterhead (logo, name, phones, address), a title, the info box,
   a table with borders and a grey header row, one wide centred «البيان» column, equal number columns, real numbers and
   dates (sortable, summable), a total row, the summary boxes under the table, right-to-left, and an A4 print setup. ---------- */
const XL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XL_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', XL_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const XL_GREEN = 'FF1A7F4B', XL_DISC = 'FFC0392B', XL_HEAD = 'FFEEEEEE', XL_GROUP = 'FFE6E6E6';

/* ----- a ZIP file, stored without compression (the parts are small) ----- */
const XL_CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const xlCrc = u => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = XL_CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function xlZip(files) { /* files: [[path, Uint8Array]] */
  const enc = new TextEncoder(), now = new Date(), tm = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1), dd = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts = [], cen = []; let off = 0;
  for (const [path, data] of files) {
    const nm = enc.encode(path), crc = xlCrc(data), sz = data.length;
    const lh = new Uint8Array(30 + nm.length), v = new DataView(lh.buffer);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true); v.setUint16(8, 0, true); v.setUint16(10, tm, true); v.setUint16(12, dd, true);
    v.setUint32(14, crc, true); v.setUint32(18, sz, true); v.setUint32(22, sz, true); v.setUint16(26, nm.length, true); v.setUint16(28, 0, true); lh.set(nm, 30);
    const ch = new Uint8Array(46 + nm.length), w = new DataView(ch.buffer);
    w.setUint32(0, 0x02014b50, true); w.setUint16(4, 20, true); w.setUint16(6, 20, true); w.setUint16(8, 0x0800, true); w.setUint16(10, 0, true); w.setUint16(12, tm, true); w.setUint16(14, dd, true);
    w.setUint32(16, crc, true); w.setUint32(20, sz, true); w.setUint32(24, sz, true); w.setUint16(28, nm.length, true); w.setUint32(42, off, true); ch.set(nm, 46);
    parts.push(lh, data); cen.push(ch); off += lh.length + sz;
  }
  const cdSize = cen.reduce((s, a) => s + a.length, 0), end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
  const all = [...parts, ...cen, end], out = new Uint8Array(all.reduce((s, a) => s + a.length, 0)); let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}

const xlEsc = s => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const xlCol = i => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
const xlSerial = (y, m, d, hh = 0, mm = 0, ss = 0) => Date.UTC(y, m - 1, d, hh, mm, ss) / 86400000 + 25569; /* Excel day number */
const xlDateOk = (y, m, d) => { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; };
const XL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/, XL_DT = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;
const xlIsDate = s => { const m = XL_DATE.exec(s); return !!m && xlDateOk(+m[1], +m[2], +m[3]); };
const xlIsDt = s => { const m = XL_DT.exec(s); return !!m && xlDateOk(+m[1], +m[2], +m[3]) && +m[4] < 24 && +m[5] < 60; };

/* ----- the styles part: fonts, fills, borders, number formats, cell formats, each written once ----- */
function xlStyles() {
  const fonts = [], fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'], bords = [], nfs = [], xfs = [];
  const pick = (a, s) => { let i = a.indexOf(s); if (i < 0) i = a.push(s) - 1; return i; };
  const fontX = o => `<font>${o.b ? '<b/>' : ''}${o.i ? '<i/>' : ''}<sz val="${o.sz || 11}"/><color rgb="${o.color || 'FF111111'}"/><name val="Arial"/><family val="2"/></font>`;
  const side = (t, s) => s ? `<${t} style="${s}"><color rgb="FF111111"/></${t}>` : `<${t}/>`;
  pick(fonts, fontX({})); pick(bords, '<border><left/><right/><top/><bottom/><diagonal/></border>');
  xfs.push('<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>');
  const get = o => { /* o: {b,i,sz,color,fill,bd:{l,r,t,b},nf,h,wrap} */
    const f = pick(fonts, fontX(o)), fl = o.fill ? pick(fills, `<fill><patternFill patternType="solid"><fgColor rgb="${o.fill}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
    const bd = o.bd || {}, b = pick(bords, `<border>${side('left', bd.l)}${side('right', bd.r)}${side('top', bd.t)}${side('bottom', bd.b)}<diagonal/></border>`);
    const nf = !o.nf || o.nf === 'General' ? 0 : 164 + pick(nfs, o.nf);
    const al = `<alignment${o.h ? ` horizontal="${o.h}"` : ''} vertical="center"${o.wrap ? ' wrapText="1"' : ''}/>`;
    return pick(xfs, `<xf numFmtId="${nf}" fontId="${f}" fillId="${fl}" borderId="${b}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${al}</xf>`);
  };
  const xml = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${XL_NS}">` +
    (nfs.length ? `<numFmts count="${nfs.length}">${nfs.map((c, i) => `<numFmt numFmtId="${164 + i}" formatCode="${xlEsc(c)}"/>`).join('')}</numFmts>` : '') +
    `<fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="${bords.length}">${bords.join('')}</borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  return { get, xml };
}

/* the shop logo (a PNG or JPEG data URL) -> its bytes and size, or null */
function xlLogo(u) {
  const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(u || ''); if (!m) return null;
  try {
    const s = atob(m[2]), b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    let w = 0, h = 0;
    if (m[1] === 'png') { const dv = new DataView(b.buffer); w = dv.getUint32(16); h = dv.getUint32(20); }
    else { let p = 2; while (p + 9 < b.length) { if (b[p] !== 0xFF) { p++; continue; } const k = b[p + 1]; if (k >= 0xC0 && k <= 0xCF && k !== 0xC4 && k !== 0xC8 && k !== 0xCC) { h = (b[p + 5] << 8) | b[p + 6]; w = (b[p + 7] << 8) | b[p + 8]; break; } p += 2 + ((b[p + 2] << 8) | b[p + 3]); } }
    return w > 0 && h > 0 ? { ext: m[1], b, w, h } : null;
  } catch (e) { return null; }
}

/* the number format of one amount: whole numbers show no decimals, the rest show the digits they need; negatives are red; a label or a unit rides inside the format so the cell stays a number */
function xlNf(v, c, id, qty) {
  if (id) return 'General';
  const d = Number.isInteger(v) ? 0 : qty ? (Math.abs(v * 10 - Math.round(v * 10)) < 1e-6 ? 1 : Math.abs(v * 100 - Math.round(v * 100)) < 1e-6 ? 2 : 3) : Math.abs(v * 100 - Math.round(v * 100)) < 1e-6 ? 2 : 3, q = s => '"' + String(s).replace(/["\\]/g, '') + '"';
  const core = '#,##0' + (d ? '.' + '0'.repeat(d) : ''), pre = c.lbl ? q(c.lbl + ' ') : '', post = c.unit ? q(' ' + c.unit) : '';
  return `${pre}${core}${post};[Red]-${pre}${core}${post}`;
}

/* x: {title, head, rows | blocks:[{t, rows}], info:[[label, value]], foot:[[[label, cell]...], [[label, cell]...]], sum:[column numbers], letter:{logo,name,phones,addr,tax}, noFilter}
   a cell is a text, a number, or {v, lbl, unit, b, color, bg} */
function xlBuild(x) {
  const rtl = LANG !== 'en', tr = c => typeof c === 'string' ? csvTr(c) : c;
  const head = x.head.map(tr), n = head.length, blocks = x.blocks || [{ t: '', rows: x.rows }], L = x.letter || {};
  const cellOf = v => v && typeof v === 'object' && !Array.isArray(v) ? v : { v };
  const allRows = blocks.flatMap(b => b.rows);
  /* ---- what each column holds: dates, numbers, ids, text; and how wide it should be ---- */
  const cols = head.map((h, j) => {
    const h0 = String(x.head[j]), vals = allRows.map(r => cellOf(r[j])).filter(c => c.v !== '' && c.v != null);
    const strs = vals.filter(c => typeof c.v === 'string'), nums = vals.filter(c => typeof c.v === 'number');
    const date = strs.length > 0 && !nums.length && strs.every(c => xlIsDate(c.v)), dt = !date && strs.length > 0 && !nums.length && strs.every(c => xlIsDt(c.v));
    const id = /^(الرقم|رقم|الكود|كود|الفاتورة)$|^رقم /.test(h0), qty = /^(الكمية|وارد|صادر|الرصيد)/.test(h0), wide = /^(البيان|التفاصيل)$/.test(h0);
    let len = 0; vals.forEach(c => { len = Math.max(len, typeof c.v === 'number' ? fmt(c.v).length + (c.unit ? String(c.unit).length + 1 : 0) + (c.lbl ? String(c.lbl).length + 1 : 0) : String(c.v).split('\n').reduce((m, s) => Math.max(m, s.length), 0)); });
    const kind = date ? 'date' : dt ? 'dt' : nums.length && !strs.length && !id ? 'num' : 'txt';
    return { kind, id, qty, wide, len, hl: Math.max(...String(h).split(/\s+/).map(s => s.length), 0), hfull: String(h).length };
  });
  const numW = Math.min(20, Math.max(12, ...cols.filter(c => c.kind === 'num').map(c => c.len + 4)));
  cols.forEach(c => {
    if (c.kind === 'date') c.w = 13; else if (c.kind === 'dt') c.w = 21; else if (c.kind === 'num') c.w = numW;
    else if (c.wide) c.w = Math.min(64, Math.max(40, c.len * 1.05 + 4));
    else c.w = Math.min(42, Math.max(12, c.hfull + 3, c.len * 1.1 + 3, c.id ? 12 : 0));
    c.w = Math.max(c.w, c.hl + 3);
  });
  if (n < 6 && x.info) cols[0].w = Math.max(cols[0].w, ...x.info.filter(Boolean).map(i => String(tr(i[0])).length * 1.25 + 3));
  let tot = cols.reduce((s, c) => s + c.w, 0); if (tot < 62) { const k = cols.reduce((a, c, j) => c.w > cols[a].w ? j : a, 0); cols[k].w += 62 - tot; tot = 62; }
  const lns = (s, w) => String(s).split('\n').reduce((a, p) => a + Math.max(1, Math.ceil(p.length * 1.1 / Math.max(4, w - 2))), 0);

  const st = xlStyles(), rows = [], merges = [], last = n - 1;
  const BASE = { sz: 11, h: 'center', wrap: true };
  const THIN = { l: 'thin', r: 'thin', t: 'thin', b: 'thin' };
  const newRow = ht => { rows.push({ ht: ht || 21, cells: {} }); return rows.length - 1; };
  const put = (r, c, val, sp) => { rows[r].cells[c] = { val, sp: { ...sp, bd: { ...(sp.bd || {}) } } }; };
  const mergeRow = (r, c1, c2, val, sp) => { put(r, c1, val, sp); for (let c = c1 + 1; c <= c2; c++) put(r, c, null, sp); if (c2 > c1) merges.push(`${xlCol(c1)}${r + 1}:${xlCol(c2)}${r + 1}`); };
  const gap = ht => newRow(ht);

  /* ---- the letterhead: logo on both sides, name, phones, address, thick rule ---- */
  const logo = xlLogo(L.logo), twoLogos = !!logo && n >= 4, lc1 = twoLogos ? 1 : 0, lc2 = twoLogos ? last - 1 : last;
  const lines = [];
  if (L.name) lines.push([L.name, { sz: 18, b: true }, 30]);
  if (L.phones) lines.push([L.phones, { sz: 11 }, 20]);
  if (L.addr) lines.push([L.addr, { sz: 11 }, 20]);
  if (L.tax) lines.push([L.tax, { sz: 10 }, 18]);
  if (logo) while (lines.length < 3) lines.push(['', { sz: 11 }, 22]);
  lines.forEach(([t, o, ht], i) => {
    const r = newRow(ht), sp = { ...BASE, ...o, wrap: false, bd: i === lines.length - 1 ? { b: 'thick' } : {} };
    for (let c = 0; c <= last; c++) put(r, c, null, sp);
    mergeRow(r, lc1, lc2, t === '' ? null : tr(t), sp);
  });
  const letterRows = lines.length;
  if (letterRows) gap(8);
  /* ---- the title ---- */
  { const r = newRow(30); mergeRow(r, 0, last, tr(x.title), { ...BASE, sz: 15, b: true, wrap: false }); }
  gap(6);
  /* ---- the info box: a grey «label» cell and a «value» cell, two pairs to a row on a wide sheet, one pair to a row on a narrow one ---- */
  const info = (x.info || []).filter(Boolean), pairs = n >= 6, half = Math.ceil(n / 2);
  const labSp = { ...BASE, b: true, fill: 'FFF5F5F5', bd: THIN, wrap: false }, valSp = { ...BASE, b: true, bd: THIN };
  for (let i = 0; i < info.length; i += pairs ? 2 : 1) {
    const grp = info.slice(i, i + (pairs ? 2 : 1)); let ht = 24; const todo = [];
    grp.forEach(([lb, vl], k) => {
      const c1 = grp.length === 1 || !k ? 0 : half, c2 = grp.length === 1 ? last : k ? last : half - 1, w = c2 - c1 + 1;
      let ls = w >= 3 && cols[c1].w < String(tr(lb)).length * 1.25 + 3 ? 2 : 1; if (ls >= w) ls = Math.max(1, w - 1);
      let vw = 0; for (let c = c1 + ls; c <= c2; c++) vw += cols[c].w;
      ht = Math.max(ht, lns(vl, vw) > 1 ? 16 * lns(vl, vw) + 8 : 24); todo.push([c1, c2, ls, tr(lb), String(tr(vl))]);
    });
    const r = newRow(ht);
    todo.forEach(([c1, c2, ls, lb, vl]) => { mergeRow(r, c1, c1 + ls - 1, lb, labSp); mergeRow(r, c1 + ls, c2, vl, valSp); });
  }
  if (info.length) gap(8);
  /* ---- the table: header, then the blocks (each with its own heading and total when there are several) ---- */
  const hdr = newRow(Math.max(24, 18 * Math.max(...head.map((h, j) => lns(h, cols[j].w))) + 6));
  head.forEach((h, j) => put(hdr, j, h, { ...BASE, b: true, fill: XL_HEAD, bd: { ...THIN, t: 'medium' } }));
  const sum = x.sum || [], dataSpan = []; let tblLast = hdr, nData = 0;
  const dataRow = row => {
    const cells = {}; let lnMax = 1;
    for (let j = 0; j < n; j++) {
      const c = cellOf(row[j]), col = cols[j]; let v = c.v;
      const sp = { ...BASE, bd: THIN }; if (c.b) sp.b = true; if (c.color) sp.color = c.color; if (c.bg) sp.fill = c.bg;
      if (typeof v === 'number' && isFinite(v)) { v = round3(v); sp.nf = xlNf(v, { lbl: tr(c.lbl), unit: tr(c.unit) }, col.id, !!c.unit || col.qty); cells[j] = [v, sp]; }
      else if (v == null || v === '' || typeof v === 'number') cells[j] = [null, sp]; /* an empty cell (a number that is not a number is empty too) */
      else {
        v = String(tr(v));
        if (col.kind === 'date') { const m = XL_DATE.exec(v); cells[j] = [xlSerial(+m[1], +m[2], +m[3]), { ...sp, nf: 'yyyy-mm-dd' }]; }
        else if (col.kind === 'dt') { const m = XL_DT.exec(v); cells[j] = [xlSerial(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0)), { ...sp, nf: 'yyyy-mm-dd hh:mm:ss' }]; }
        else { cells[j] = [v.length > 32000 ? v.slice(0, 32000) : v, sp]; lnMax = Math.max(lnMax, lns(v, col.w)); }
      }
    }
    const r = newRow(lnMax > 1 ? 16 * lnMax + 8 : 21); Object.keys(cells).forEach(j => put(r, +j, cells[j][0], cells[j][1])); nData++; return r;
  };
  const sumRow = (label, from, to) => { /* SUBTOTAL(109) follows the filter, so the total changes when rows are filtered */
    const r = newRow(24), first = sum[0]; const sp = { ...BASE, b: true, fill: XL_HEAD, bd: THIN };
    for (let j = 0; j < n; j++) put(r, j, null, sp);
    if (first > 1) mergeRow(r, 0, first - 1, tr(label), sp); else put(r, 0, tr(label), sp);
    sum.forEach(j => {
      let t = 0; for (let q = from; q <= to; q++) { const c = rows[q].cells[j]; if (c && typeof c.val === 'number') t += c.val; }
      t = round3(t); put(r, j, { f: `SUBTOTAL(109,${xlCol(j)}${from + 1}:${xlCol(j)}${to + 1})`, v: t }, { ...sp, nf: xlNf(t, {}, false) });
    });
    return r;
  };
  if (!allRows.length) { const r = newRow(26); mergeRow(r, 0, last, tr('لا توجد بيانات'), { ...BASE, bd: THIN, color: 'FF666666' }); tblLast = r; }
  blocks.forEach(b => {
    if (b.t) { const r = newRow(24); mergeRow(r, 0, last, tr(b.t), { ...BASE, wrap: false, h: undefined, b: true, fill: XL_GROUP, bd: THIN }); tblLast = r; }
    const from = rows.length; b.rows.forEach(row => { tblLast = dataRow(row); });
    if (sum.length && b.rows.length && blocks.length > 1) tblLast = sumRow('الإجمالي', from, rows.length - 1);
    if (b.rows.length) dataSpan.push([from, rows.length - 1]);
  });
  if (sum.length && blocks.length === 1 && blocks[0].rows.length) tblLast = sumRow('الإجمالي', dataSpan[0][0], dataSpan[0][1]);
  /* a medium rule closes the table at the bottom */
  for (let c = 0; c <= last; c++) { const cell = rows[tblLast].cells[c]; if (cell) cell.sp.bd.b = 'medium'; }
  /* ---- the summary boxes under the table ---- */
  const foot = x.foot || [];
  if (foot.length && n >= 4) {
    gap(10);
    const half = Math.floor(n / 2);
    for (let i = 0; i < Math.max(...foot.map(f => f.length)); i++) {
      const r = newRow(26);
      foot.forEach((box, k) => {
        const it = box[i]; if (!it) return;
        const c1 = k ? half : 0, c2 = k ? last : half - 1, w = c2 - c1 + 1, ls = Math.max(1, Math.ceil(w / 2)), cv = cellOf(it[1]);
        const sp = { ...BASE, bd: THIN, wrap: false }; if (cv.color) sp.color = cv.color; /* a red «الخصم» box */
        mergeRow(r, c1, c1 + ls - 1, tr(it[0]), { ...sp, b: !!cv.b });
        const v = typeof cv.v === 'number' ? round3(cv.v) : tr(cv.v);
        mergeRow(r, c1 + ls, c2, v, { ...sp, b: true, nf: typeof v === 'number' ? xlNf(v, { unit: tr(cv.unit) }, false) : undefined });
      });
    }
  }

  /* ---- the sheet XML ---- */
  const nameOf = s => String(s).replace(/[\[\]:*?\/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet1';
  const sheetName = nameOf(tr(x.title));
  const cxml = (r, c, cell) => {
    const ref = xlCol(c) + (r + 1), s = st.get(cell.sp), v = cell.val;
    if (v == null || v === '') return `<c r="${ref}" s="${s}"/>`;
    if (typeof v === 'number') return isFinite(v) ? `<c r="${ref}" s="${s}"><v>${v}</v></c>` : `<c r="${ref}" s="${s}"/>`;
    if (v.f) return `<c r="${ref}" s="${s}"><f>${xlEsc(v.f)}</f><v>${v.v}</v></c>`;
    if (v.rich) { const rp = b => `<rPr>${b ? '<b/>' : ''}<sz val="11"/><color rgb="FF111111"/><rFont val="Arial"/><family val="2"/></rPr>`; return `<c r="${ref}" s="${s}" t="inlineStr"><is>${v.rich.map(([t, b]) => `<r>${rp(b)}<t xml:space="preserve">${xlEsc(t)}</t></r>`).join('')}</is></c>`; }
    return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xlEsc(v)}</t></is></c>`;
  };
  const sheetData = rows.map((row, r) => `<row r="${r + 1}" ht="${row.ht}" customHeight="1">${Object.keys(row.cells).map(Number).sort((a, b) => a - b).map(c => cxml(r, c, row.cells[c])).join('')}</row>`).join('');
  const hdrRow = hdr + 1, lastData = tblLast + 1, nRows = rows.length;
  const filter = !x.noFilter && blocks.length === 1 && !blocks[0].t && blocks[0].rows.length > 1 ? `<autoFilter ref="A${hdrRow}:${xlCol(last)}${hdrRow + blocks[0].rows.length}"/>` : '';
  const freeze = nData > 18 ? `<pane ySplit="${hdrRow}" topLeftCell="A${hdrRow + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${hdrRow + 1}" sqref="A${hdrRow + 1}"/>` : '';
  const land = n >= 7 || tot > 110;
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${XL_NS}" xmlns:r="${XL_R}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${xlCol(last)}${nRows}"/>` +
    `<sheetViews><sheetView ${rtl ? 'rightToLeft="1" ' : ''}showGridLines="0" tabSelected="1" workbookViewId="0">${freeze}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="21" customHeight="1"/>` +
    `<cols>${cols.map((c, j) => `<col min="${j + 1}" max="${j + 1}" width="${Math.round(c.w * 100) / 100}" customWidth="1"/>`).join('')}</cols><sheetData>${sheetData}</sheetData>${filter}` +
    (merges.length ? `<mergeCells count="${merges.length}">${merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '') +
    `<printOptions horizontalCentered="1"/><pageMargins left="0.4" right="0.4" top="0.5" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="${land ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/>` +
    `<headerFooter><oddFooter>&amp;C&amp;P / &amp;N</oddFooter></headerFooter><ignoredErrors><ignoredError sqref="A1:${xlCol(last)}${nRows}" numberStoredAsText="1"/></ignoredErrors>${logo ? '<drawing r:id="rId1"/>' : ''}</worksheet>`;

  /* ---- the other parts ---- */
  const q = sheetName.replace(/'/g, "''"), dn = `<definedName name="_xlnm.Print_Titles" localSheetId="0">'${xlEsc(q)}'!$${hdrRow}:$${hdrRow}</definedName>` +
    (filter ? `<definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${xlEsc(q)}'!$A$${hdrRow}:$${xlCol(last)}$${hdrRow + blocks[0].rows.length}</definedName>` : '');
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${XL_NS}" xmlns:r="${XL_R}"><bookViews><workbookView/></bookViews><sheets><sheet name="${xlEsc(sheetName)}" sheetId="1" r:id="rId1"/></sheets><definedNames>${dn}</definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`;
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships', PK = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const rels = (a) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PK}">${a.map(([id, t, g]) => `<Relationship Id="${id}" Type="${t}" Target="${g}"/>`).join('')}</Relationships>`;
  const enc = new TextEncoder(), U = s => enc.encode(s);
  const created = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const files = [
    ['[Content_Types].xml', U(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${logo ? `<Default Extension="${logo.ext}" ContentType="image/${logo.ext}"/>` : ''}<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${logo ? '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : ''}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`)],
    ['_rels/.rels', U(rels([['rId1', REL + '/officeDocument', 'xl/workbook.xml'], ['rId2', PK + '/metadata/core-properties', 'docProps/core.xml'], ['rId3', REL + '/extended-properties', 'docProps/app.xml']]))],
    ['docProps/core.xml', U(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xlEsc(tr(x.title))}</dc:title><dc:creator>${xlEsc(L.name || 'Mina.Dev')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created></cp:coreProperties>`)],
    ['docProps/app.xml', U(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Mina.Dev</Application></Properties>`)],
    ['xl/workbook.xml', U(workbook)],
    ['xl/_rels/workbook.xml.rels', U(rels([['rId1', REL + '/worksheet', 'worksheets/sheet1.xml'], ['rId2', REL + '/styles', 'styles.xml']]))],
    ['xl/styles.xml', U(st.xml())],
    ['xl/worksheets/sheet1.xml', U(sheet)],
  ];
  if (logo) { /* a picture on each side of the letterhead (one only when the sheet is narrow) */
    const k = Math.min(80 / logo.w, 56 / logo.h), cx = Math.round(logo.w * k * 9525), cy = Math.round(logo.h * k * 9525);
    const pic = (id, col) => `<xdr:oneCellAnchor><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>57150</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>38100</xdr:rowOff></xdr:from><xdr:ext cx="${cx}" cy="${cy}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${id}" name="Logo ${id - 1}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`;
    files.push(['xl/worksheets/_rels/sheet1.xml.rels', U(rels([['rId1', REL + '/drawing', '../drawings/drawing1.xml']]))]);
    files.push(['xl/drawings/drawing1.xml', U(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${XL_R}">${pic(2, 0)}${twoLogos ? pic(3, last) : ''}</xdr:wsDr>`)]);
    files.push(['xl/drawings/_rels/drawing1.xml.rels', U(rels([['rId1', REL + '/image', '../media/image1.' + logo.ext]]))]);
    files.push(['xl/media/image1.' + logo.ext, logo.b]);
  }
  return xlZip(files);
}

/* the Excel button: one file, formatted like the printed documents. x = {name, head, rows|blocks, ...} (name: «اسم_2026-11-01_2026-11-17» -> title, period, file name) */
function exportXLSX(x) {
  const base = String(x.name).replace(/(_\d{4}-\d{2}-\d{2})+$/, ''), tail = String(x.name).slice(base.length), nice = base.replace(/_/g, ' ');
  const days = tail.match(/\d{4}-\d{2}-\d{2}/g) || [], today = ymd(new Date()), cnt = x.blocks ? x.blocks.reduce((s, b) => s + b.rows.length, 0) : x.rows.length;
  const info = x.info || [...(days.length > 1 ? [['من تاريخ', days[0]], ['إلى تاريخ', days[1]]] : []), ['تاريخ التصدير', today], ['عدد السجلات', cnt]];
  const bytes = xlBuild({ ...x, title: x.title || nice, info, letter: letterOf() });
  downloadFile(fileSafe(csvTr(nice)) + (tail || '_' + today) + '.xlsx', bytes, XL_MIME);
  logA('export', nice); save(); toast('تم تحميل الملف — افتحه بـ Excel', 'ok');
}
