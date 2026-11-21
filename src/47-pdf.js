/* ---------- PDF: a printed paper (invoice, quotation, delivery note, statement) is drawn page by page on a canvas,
   wrapped in a PDF file, and handed to WhatsApp (the share sheet where the device has one; otherwise the file is saved and the chat opens) ---------- */
const PG_W = 794, PG_H = 1123, PG_M = 38, PDF_S = 2; /* an A4 page at 96 dpi, its margin, and the sharpness of the picture */
const PDF_CACHE = new Map();
const pdfKey = (base, no, html) => LANG + '|' + base + '|' + no + '|' + html.replace(/<div class="fsbar[^>]*>.*?<\/div>/s, ''); /* the size (--fs) is part of the key; the toolbar's own text is not */
const loadImg = src => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });

/* the paper (the same markup as on screen / for printing) -> canvases, one per page */
function paperPages(root, logo, sink) { /* sink: each finished page is handed over (and freed) at once, so a long list never holds all its pictures in memory */
  const rtl = LANG !== 'en', fam = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
  const FS = parseFloat(root.style.getPropertyValue('--fs')) || 1; /* the chosen font size: the page is laid out FS times smaller and drawn FS times bigger, so it is still a real A4 sheet */
  const PDF_W = PG_W / FS, PDF_H = PG_H / FS, PDF_M = PG_M / FS;
  const L = PDF_M, R = PDF_W - PDF_M, CW = R - L, BOT = PDF_H - PDF_M, pages = [];
  let cv, g, y;
  const F = (w, s) => `${w} ${s}px ${fam}`, t = s => trText(String(s == null ? '' : s).replace(/\s+/g, ' ').trim());
  const newPage = () => { if (sink && cv) { sink(cv); cv.width = cv.height = 0; } cv = document.createElement('canvas'); cv.width = PG_W * PDF_S; cv.height = PG_H * PDF_S; g = cv.getContext('2d'); g.scale(PDF_S * FS, PDF_S * FS); g.fillStyle = '#fff'; g.fillRect(0, 0, PDF_W, PDF_H); g.direction = rtl ? 'rtl' : 'ltr'; y = PDF_M; if (!sink) pages.push(cv); };
  const st = rtl ? R : L, en = rtl ? L : R; /* the edge the text starts from, and the opposite one */
  const put = (s, x, yy, o = {}) => { g.font = F(o.w || 400, o.s || 14); g.fillStyle = o.c || '#111'; g.textAlign = o.a === 'c' ? 'center' : o.a === 'e' ? (rtl ? 'left' : 'right') : (rtl ? 'right' : 'left'); g.fillText(s, x, yy); };
  const wid = (s, w, sz) => { g.font = F(w, sz); return g.measureText(s).width; };
  const wrap = (s, mw, w, sz) => {
    g.font = F(w, sz); const out = []; let cur = '';
    String(s).split(' ').forEach(wd => { const nx = cur ? cur + ' ' + wd : wd; if (!cur || g.measureText(nx).width <= mw) cur = nx; else { out.push(cur); cur = wd; } });
    if (cur || !out.length) out.push(cur); return out;
  };
  const need = h => { if (y + h > BOT) newPage(); };
  const rect = (x, yy, w, h, o = {}) => { g.beginPath(); if (g.roundRect) g.roundRect(x, yy, w, h, o.r || 0); else g.rect(x, yy, w, h); if (o.fill) { g.fillStyle = o.fill; g.fill(); } if (o.line) { g.strokeStyle = o.line; g.lineWidth = o.lw || 1; g.stroke(); } };
  const hline = (yy, c = '#c9ced8') => { g.strokeStyle = c; g.lineWidth = 1; g.beginPath(); g.moveTo(L, yy); g.lineTo(R, yy); g.stroke(); };
  newPage();

  const pp = root.querySelector('.pp') || root, K = root.classList.contains('hrp'); /* K: the compact sheet (a whole month of attendance on one page) */
  [...pp.children].forEach(el => {
    const cls = el.classList;
    if (el.tagName === 'HEADER') { /* letterhead: logo on both sides, name and contacts in the middle */
      const nm = el.querySelector('h2'), lines = [...el.querySelectorAll('.rh-c p')].map(p => t(p.textContent)).filter(Boolean);
      let lw = 0, lh = 0; if (logo && el.querySelector('img')) { const k = Math.min(86 / logo.naturalWidth, 72 / logo.naturalHeight); lw = logo.naturalWidth * k; lh = logo.naturalHeight * k; }
      const tw = CW - 2 * (lw + 14), tl = []; if (nm) wrap(t(nm.textContent), tw, 700, 22).forEach(s => tl.push({ s, w: 700, z: 22, c: '#111', h: 28 }));
      lines.forEach(s => wrap(s, tw, 400, 12).forEach(x => tl.push({ s: x, w: 400, z: 12, c: '#555', h: 18 })));
      const th = tl.reduce((a, b) => a + b.h, 0), h = Math.max(lh, th) + 12; need(h + 10);
      if (lw) { g.drawImage(logo, L, y, lw, lh); g.drawImage(logo, R - lw, y, lw, lh); }
      let yy = y + (h - 12 - th) / 2; tl.forEach(x => { yy += x.h; put(x.s, PDF_W / 2, yy - 6, { a: 'c', w: x.w, s: x.z, c: x.c }); });
      y += h; hline(y); y += 14;
    } else if (cls.contains('rt')) { /* the title */
      const h3 = el.querySelector('h3'), p = el.querySelector('p'); need(54);
      if (K && h3) { y += 12; put(t(h3.textContent), PDF_W / 2, y, { a: 'c', w: 700, s: 15 }); y += 8; return; }
      if (h3) { y += 24; put(t(h3.textContent), PDF_W / 2, y, { a: 'c', w: 700, s: 20 }); }
      if (p) { y += 20; put(t(p.textContent), PDF_W / 2, y, { a: 'c', s: 12, c: '#555' }); }
      y += 16;
    } else if (cls.contains('ibox')) { /* who / number / date */
      const items = [...el.children].filter(c => c.tagName === 'SPAN').map(sp => ({ k: t([...sp.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('')), v: t((sp.querySelector('b') || {}).textContent) }));
      if (!items.length) return;
      if (K) { const h = items.length * 17 + 10; need(h + 8); rect(L, y, CW, h, { line: '#9aa3b2', r: 8 }); let yy = y + 4; items.forEach(it => { yy += 17; const kw = wid(it.k + ' ', 400, 12); put(it.k, st + (rtl ? -12 : 12), yy - 3, { c: '#555', s: 12 }); put(it.v, st + (rtl ? -12 - kw : 12 + kw), yy - 3, { w: 700, s: 12 }); }); y += h + 8; return; }
      const iw = items.map(it => ({ it, kw: wid(it.k + ' ', 400, 14), vw: wid(it.v, 700, 14) }));
      if (iw.every(o => o.kw + o.vw <= CW - 24)) { /* the details sit side by side and go on to a next line when they do not fit (like the box on the screen), not one under another */
        const GAP = 26, fl = []; let cur = [], cw = 0; iw.forEach(o => { const w = o.kw + o.vw; if (cur.length && cw + GAP + w > CW - 24) { fl.push(cur); cur = []; cw = 0; } cw += (cur.length ? GAP : 0) + w; cur.push(o); }); if (cur.length) fl.push(cur);
        const h = fl.length * 24 + 12; need(h + 10); rect(L, y, CW, h, { line: '#9aa3b2', r: 8 });
        fl.forEach((row, ri) => { let off = 12; const yy = y + 6 + ri * 24 + 17; row.forEach(o => { put(o.it.k, st + (rtl ? -off : off), yy, { c: '#555' }); put(o.it.v, st + (rtl ? -off - o.kw : off + o.kw), yy, { w: 700 }); off += o.kw + o.vw + GAP; }); });
        y += h + 12; return; }
      const rows = items.map(it => { const kw = wid(it.k + ' ', 400, 14), vl = wrap(it.v, CW - 24 - kw, 700, 14); return { it, kw, vl }; }), h = rows.reduce((a, r) => a + r.vl.length * 22, 0) + 16;
      need(h + 10); rect(L, y, CW, h, { line: '#9aa3b2', r: 8 }); let yy = y + 8;
      rows.forEach(r => { yy += 17; put(r.it.k, st + (rtl ? -12 : 12), yy, { c: '#555' }); r.vl.forEach((ln, i) => { put(ln, st + (rtl ? -12 - r.kw : 12 + r.kw), yy, { w: 700 }); if (i < r.vl.length - 1) yy += 22; }); yy += 5; });
      y += h + 12;
    } else if (el.tagName === 'TABLE') { /* items / movements */
      const heads = [...el.querySelectorAll('thead th')].map(th => t(th.textContent)), body = [...el.querySelectorAll('tbody tr')];
      const n = heads.length || (body[0] ? body[0].cells.length : 1), cg = [...el.querySelectorAll('colgroup col')].map(c => parseFloat(c.style.width)), ws = cg.length === n && cg.every(v => v > 0) ? cg.map(p => p / 100 * CW) : Array(n).fill(CW / n);
      const colX = i => st + (rtl ? -1 : 1) * ws.slice(0, i).reduce((a, b) => a + b, 0); /* where column i starts */
      const cellAt = (s, i, yy, o, sp = 1) => { const x = colX(i), w = ws.slice(i, i + sp).reduce((a, b) => a + b, 0); if (o.left) put(s, x + (rtl ? -8 : 8), yy, o); else put(s, x + (rtl ? -w / 2 : w / 2), yy, Object.assign({ a: 'c' }, o)); };
      const ivt = el.classList.contains('ivt'), ALL = Array.from({ length: n + 1 }, (_, i) => i); /* ivt: the invoice / customer statement — drawn like the screen: a full grid (lines between the columns too), the amounts in their colours, the «البيان» as a short line with small notes under it */
      const gridV = (y0, h, idxs) => { if (!ivt) return; g.strokeStyle = '#111'; g.lineWidth = 1; g.beginPath(); [...new Set(idxs)].forEach(i => { const x = colX(i); g.moveTo(x, y0); g.lineTo(x, y0 + h); }); g.stroke(); };
      const parts = td => { /* the lines of a cell: its text (green for a payment, red for a discount, bold for a balance), the small word over an amount, the small notes under a «البيان» */
        const cl = td.classList, col = cl.contains('pd') ? '#1a7f4b' : cl.contains('dsc') ? '#c0392b' : '#111', w = cl.contains('bl') ? 800 : cl.contains('pd') || cl.contains('dsc') || cl.contains('bn') ? 700 : 400, sm = [...td.querySelectorAll('small.bs')], lb = [...td.querySelectorAll('small.lb')];
        const un = td.querySelector('.u'); if (!sm.length && !lb.length && !un) return [{ s: t(td.textContent), w, z: 13, c: col }];
        const cp = td.cloneNode(true); cp.querySelectorAll('small,.u').forEach(x => x.remove()); const main = t(cp.textContent), out = [];
        lb.forEach(x => out.push({ s: t(x.textContent), w: 700, z: 10.5, c: col === '#1a7f4b' ? col : '#555' })); if (main) out.push({ s: main, w, z: 13, c: col }); if (un) out.push({ s: t(un.textContent), w: 400, z: 11, c: '#444' }); sm.forEach(x => out.push({ s: t(x.textContent), w: 600, z: 10.5, c: '#555' })); return out; };
      const drawHead = () => { const hl = heads.map((h, i) => wrap(h, ws[i] - 10, 700, 13)), hk = Math.max(...hl.map(a => a.length)), hh = hk > 1 ? hk * 17 + 13 : 30; need(hh + 10); rect(L, y, CW, hh, { fill: '#eef1f6', line: ivt ? '#111' : '#9aa3b2' }); gridV(y, hh, ALL); hl.forEach((a, i) => a.forEach((ln, q) => cellAt(ln, i, y + 20 + q * 17, { w: 700, s: 13 }))); y += hh; }; /* a long heading goes on a second line instead of running over its neighbour */
      if (K) { /* small rows: 31 days fit one page; a tint for the weekly day off, an absence and a permission */
        const head = () => { const hl = heads.map((h, i) => wrap(h, (ws[i] || CW) - 6, 700, 10.5)), hh = Math.max(...hl.map(a => a.length)) * 12 + 8; rect(L, y, CW, hh, { fill: '#eef1f6', line: '#9aa3b2' }); hl.forEach((a, i) => a.forEach((ln, k) => cellAt(ln, i, y + 14 + k * 12, { w: 700, s: 10.5 }))); y += hh; }, TINT = { off: '#f1f2f4', abs: '#fbe9e9', exc: '#e9f1fc' };
        need(40); head();
        body.forEach(tr => {
          const cs = [...tr.cells].map(td => ({ s: t(td.textContent), left: td.classList.contains('bn') })), ls = cs.map((c, i) => wrap(c.s, (ws[i] || CW) - 10, 400, 10.5)), h = Math.max(...ls.map(a => a.length)) * 12 + 5;
          if (y + h > BOT) { newPage(); head(); }
          const tint = TINT[tr.className]; if (tint) rect(L, y, CW, h, { fill: tint });
          if (cs.length < n) put(cs.map(c => c.s).join(' '), PDF_W / 2, y + 12, { a: 'c', c: '#555', s: 10.5 }); else cs.forEach((c, i) => ls[i].forEach((ln, k) => cellAt(ln, i, y + 12 + k * 12, { left: c.left, s: 10.5, c: tr.className === 'off' || tr.className === 'nil' ? '#777' : '#111' })));
          y += h; hline(y, '#d5d9e0');
        });
        y += 8; return;
      }
      if (heads.length) drawHead();
      body.forEach(tr => {
        const cells = [...tr.cells];
        if (tr.className === 'plh') { /* the customer statement by place: a place heading band */
          const tint = '#e6e6e6'; let ix = 0; const cs = cells.map(td => { const o = { s: t(td.textContent), i: ix, sp: td.colSpan || 1 }; ix += o.sp; return o; }); /* a heading, a subtotal or the grand total: the first cell is written from the start, the rest sit under their own columns (a cell can span several) */
          if (y + 30 > BOT) { newPage(); if (heads.length) drawHead(); }
          rect(L, y, CW, 30, { fill: tint }); cs.forEach((c, k) => k ? cellAt(c.s, c.i, y + 20, { w: 700, s: 13 }, c.sp) : put(c.s, st + (rtl ? -8 : 8), y + 20, { w: 700, s: 13 }));
          gridV(y, 30, [0, n]); y += 30; hline(y, ivt ? '#111' : '#c9ced8'); return;
        }
        if (cells.reduce((a, td) => a + (td.colSpan || 1), 0) < n) { const s = t(tr.textContent); need(34); put(s, PDF_W / 2, y + 22, { a: 'c', c: '#555' }); gridV(y, 34, [0, n]); y += 34; hline(y, ivt ? '#111' : '#e3e6ec'); return; }
        let ix = 0; const cs = cells.map(td => { const o = { s: t(td.textContent), left: td.classList.contains('nm') || (td.classList.contains('bn') && !el.classList.contains('ivt')), i: ix, sp: td.colSpan || 1 }; ix += o.sp; return o; }); /* a cell may span several columns (a payment line's text spans the first three) */
        if (ivt) { /* the cells' lines are centred in the row, the words of one cell stack (text, then its notes) */
          const blocks = cells.map((td, k) => { const c = cs[k], mw = ws.slice(c.i, c.i + c.sp).reduce((a, b) => a + b, 0) - 14, lines = [];
            parts(td).forEach(pt => wrap(pt.s, mw, pt.w, pt.z).forEach(x => { const h = pt.z > 12 ? 18 : 14.5, xw = wid(x, pt.w, pt.z), dm = x.match(/^(\d{4}-)(\d\d-\d\d)$/); /* a word wider than its column: a date breaks after the year (like the screen), anything else shrinks to fit */
              if (xw <= mw) lines.push({ s: x, w: pt.w, z: pt.z, c: pt.c, h }); else if (dm) [dm[1], dm[2]].forEach(q => lines.push({ s: q, w: pt.w, z: pt.z, c: pt.c, h })); else lines.push({ s: x, w: pt.w, z: Math.max(8, Math.floor(pt.z * mw / xw * 10) / 10), c: pt.c, h }); }));
            return { c, lines, bh: lines.reduce((a, l) => a + l.h, 0) }; });
          const h = Math.max(...blocks.map(b => b.bh)) + 18; if (y + h > BOT) { newPage(); if (heads.length) drawHead(); }
          blocks.forEach(b => { let cy = y + (h - b.bh) / 2; b.lines.forEach(l => { if (l.s) cellAt(l.s, b.c.i, cy + l.h / 2 + l.z * 0.35, { w: l.w, s: l.z, c: l.c }, b.c.sp); cy += l.h; }); });
          gridV(y, h, [0, n, ...blocks.map(b => b.c.i)]); y += h; hline(y, '#111'); return; }
        const ls = cs.map(c => wrap(c.s, ws.slice(c.i, c.i + c.sp).reduce((a, b) => a + b, 0) - 14, 400, 13)), h = Math.max(...ls.map(a => a.length)) * 18 + 14;
        if (y + h > BOT) { newPage(); if (heads.length) drawHead(); }
        if (tr.className === 'sub') rect(L, y, CW, h, { fill: '#f1f2f4' });
        cs.forEach((c, i) => ls[i].forEach((ln, k) => cellAt(ln, c.i, y + 20 + k * 18, { left: c.left, s: 13 }, c.sp)));
        y += h; hline(y, '#e3e6ec');
      });
      y += 14;
    } else if (cls.contains('isum')) { /* the two summary boxes */
      const bcol = [...el.querySelectorAll('.ic')].map(ic => ic.classList.contains('dsc') ? '#c0392b' : '#111'), boxes = [...el.querySelectorAll('.ic')].map(ic => [...ic.children].filter(c => c.classList.contains('l')).map(l => ({ k: t((l.querySelector('span') || {}).textContent), v: t((l.querySelector('b') || {}).textContent), cl: l.className }))), per = boxes.length > 3 ? 2 : boxes.length > 2 ? 3 : 2, bw = (CW - 14 * (per - 1)) / per; /* one or two boxes as always (half the width each); three or four sit three to a row */
      if (K) { const lh = l => /\bbig\b/.test(l.cl) ? 22 : 16, h = Math.max(...boxes.map(b => b.reduce((a, l) => a + lh(l), 0) + 12), 30); need(h + 8);
        boxes.forEach((b, bi) => { const x0 = rtl ? R - bw - bi * (bw + 14) : L + bi * (bw + 14); rect(x0, y, bw, h, { line: '#9aa3b2', r: 8 }); let yy = y + 6; const xs = rtl ? x0 + bw - 12 : x0 + 12, xe = rtl ? x0 + 12 : x0 + bw - 12;
          b.forEach(l => { const big = /\bbig\b/.test(l.cl); yy += lh(l); if (big) { g.strokeStyle = '#111'; g.lineWidth = 1; g.beginPath(); g.moveTo(x0 + 10, yy - 17); g.lineTo(x0 + bw - 10, yy - 17); g.stroke(); } put(l.k, xs, yy - 4, { w: big ? 700 : 400, s: big ? 13 : 11.5 }); put(l.v, xe, yy - 4, { a: 'e', w: 700, s: big ? 13.5 : 11.5 }); }); });
        y += h + 10; return; }
      /* a line whose name and amount do not fit side by side (a big font size, or a long name) puts the amount on its own line under the name */
      const base = l => { const big = /\bbig\b/.test(l.cl), sub = /\bsub\b/.test(l.cl); return { big, sub, w0: big ? 700 : 400, kz: big ? 15 : sub ? 12 : 13, vz: big ? 16 : sub ? 12 : 14 }; };
      const rowF = row => { let F = 1; row.forEach(b => b.forEach(l => { if (/\bsp\b/.test(l.cl)) return; const q = base(l), sum = wid(l.k, q.w0, q.kz) + wid(l.v, 700, q.vz); if (sum + 36 > bw) F = Math.min(F, (bw - 36) / sum); })); return F >= 0.55 ? Math.floor(F * 100) / 100 : 1; }; /* a sentence and its number that do not fit side by side in their box: every box of the row shrinks by the same share (down to 55%) so both stay on one line, the same size in all the boxes; below that the number goes under the name */
      const info = (l, F = 1) => { const sp = /\bsp\b/.test(l.cl); if (sp) return { sp, h: 12 }; const q = base(l), big = q.big, sub = q.sub, kz = Math.floor(q.kz * F * 10) / 10, vz = Math.floor(q.vz * F * 10) / 10;
        const ks = wrap(l.k, bw - 24, q.w0, kz), st1 = ks.length > 1 || wid(l.k, q.w0, kz) + wid(l.v, 700, vz) + 36 > bw; return { sp, big, sub, kz, vz, ks, stack: st1, h: st1 ? ks.length * 18 + 26 : big ? 32 : 26 }; };
      const hh = (b, F) => b.reduce((a, l) => a + info(l, F).h, 0) + 16;
      for (let r0 = 0; r0 < boxes.length; r0 += per) {
        const row = boxes.slice(r0, r0 + per), F = rowF(row), h = Math.max(...row.map(b => hh(b, F)), 30); need(h + 10);
        row.forEach((b, bi) => {
          const x0 = rtl ? R - bw - bi * (bw + 14) : L + bi * (bw + 14); rect(x0, y, bw, h, { line: '#9aa3b2', r: 8 }); let yy = y + 8; const xs = rtl ? x0 + bw - 12 : x0 + 12, xe = rtl ? x0 + 12 : x0 + bw - 12;
          b.forEach(l => { const f = info(l, F); if (f.sp) { yy += 12; return; } const c = f.sub ? '#666' : bcol[r0 + bi] || '#111';
            if (f.stack) { f.ks.forEach((ln, i) => put(ln, xs, yy + 15 + i * 18, { w: f.big ? 700 : 400, s: f.kz, c })); put(l.v, xe, yy + 15 + f.ks.length * 18, { a: 'e', w: 700, s: f.vz, c }); yy += f.h; return; }
            yy += f.h - 9; put(l.k, xs, yy, { w: f.big ? 700 : 400, s: f.kz, c }); put(l.v, xe, yy, { a: 'e', w: 700, s: f.vz, c }); yy += 9; });
        });
        y += h + 14;
      }
    } else if (cls.contains('qnt')) { /* a note under the table */
      const ls = wrap(t(el.textContent), CW, 400, 13); need(ls.length * 20 + 8); ls.forEach(s => { y += 20; put(s, st, y, { s: 13, c: '#444' }); }); y += 10;
    } else if (cls.contains('vch')) { /* a cash receipt (8.49): a white card — title, number and date on a tinted band, the amount large, who / for what, then the signatures */
      const out = cls.contains('out'), ac = out ? '#b45309' : '#15803d', tn = out ? '#fff7ed' : '#f0fdf4', P = 22, X0 = L, W = CW, IW = W - 2 * P, dir = rtl ? 1 : -1;
      const tx = (q, k = '') => { const e = el.querySelector(q); return e ? t(e.textContent) : k; };
      const title = tx('.vtt'), noK = tx('.vno small'), noV = tx('.vno b'), dtK = tx('.vdt small'), dtV = tx('.vdt b'), amK = tx('.vamt small'), amV = tx('.vamt b'), amW = tx('.vamt em');
      const rows = [...el.querySelectorAll('.vr')].map(r => ({ k: t(r.querySelector('small').textContent), ls: wrap(t(r.querySelector('b').textContent) || '—', IW, 700, 16) }));
      const sgs = [...el.querySelectorAll('.vsg > div')].map(d => ({ k: t(d.querySelector('span').textContent), n: d.querySelector('small') ? t(d.querySelector('small').textContent) : '' }));
      const wl = amW ? wrap(amW, IW - 36, 400, 14) : [], HB = 68, amH = 100 + wl.length * 22, rowH = r => 58 + (r.ls.length - 1) * 23, SGH = 128;
      const H = HB + 20 + amH + 10 + rows.reduce((a, r) => a + rowH(r), 0) + SGH; need(H + 10);
      rect(X0, y, W, H, { fill: '#fff', line: '#d9dee7', r: 14 });
      g.save(); g.beginPath(); if (g.roundRect) g.roundRect(X0, y, W, H, 14); else g.rect(X0, y, W, H); g.clip(); g.fillStyle = tn; g.fillRect(X0, y, W, HB); g.fillStyle = ac; g.fillRect(X0, y, W, 5); g.strokeStyle = '#e4e9f0'; g.lineWidth = 1; g.beginPath(); g.moveTo(X0, y + HB); g.lineTo(X0 + W, y + HB); g.stroke(); g.restore();
      put(title, st + (rtl ? -P : P), y + 42, { w: 800, s: 22, c: ac });
      const bw = (k, v) => Math.max(wid(k, 400, 11.5), wid(v, 700, 14.5)) + 4, w1 = bw(dtK, dtV), w2 = bw(noK, noV), e0 = en + (rtl ? P : -P), c1 = e0 + dir * (w1 / 2), c2 = e0 + dir * (w1 + 28 + w2 / 2);
      put(dtK, c1, y + 30, { a: 'c', s: 11.5, c: '#6b7280' }); put(dtV, c1, y + 51, { a: 'c', w: 700, s: 14.5 }); put(noK, c2, y + 30, { a: 'c', s: 11.5, c: '#6b7280' }); put(noV, c2, y + 51, { a: 'c', w: 700, s: 14.5 });
      const yb = y + HB + 20; rect(X0 + P, yb, IW, amH, { fill: '#fafbfc', line: '#e5e9f0', r: 14 });
      put(amK, PDF_W / 2, yb + 27, { a: 'c', s: 12.5, c: '#6b7280' }); put(amV, PDF_W / 2, yb + 74, { a: 'c', w: 800, s: 38, c: ac }); wl.forEach((s, i) => put(s, PDF_W / 2, yb + 100 + i * 22, { a: 'c', s: 14, c: '#4b5563' }));
      let yy = yb + amH + 10;
      rows.forEach(r => { g.strokeStyle = '#edf0f5'; g.lineWidth = 1; g.beginPath(); g.moveTo(X0 + P, yy); g.lineTo(X0 + W - P, yy); g.stroke(); put(r.k, st + (rtl ? -P : P), yy + 25, { s: 12.5, c: '#6b7280' }); r.ls.forEach((s, i) => put(s, st + (rtl ? -P : P), yy + 47 + i * 23, { w: 700, s: 16 })); yy += rowH(r); });
      const sy = yy + 72, slot = IW / Math.max(sgs.length, 1);
      sgs.forEach((sg, i) => { const cx = rtl ? X0 + W - P - slot * (i + 0.5) : X0 + P + slot * (i + 0.5), lw = slot - 36; g.strokeStyle = '#444'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(cx - lw / 2, sy); g.lineTo(cx + lw / 2, sy); g.stroke(); wrap(sg.k, slot - 24, 700, 13).forEach((s, k) => put(s, cx, sy + 22 + k * 18, { a: 'c', w: 700, s: 13 })); if (sg.n) put(sg.n, cx, sy + 22 + wrap(sg.k, slot - 24, 700, 13).length * 18 + 4, { a: 'c', s: 12.5, c: '#6b7280' }); });
      y += H + 14;
    } else if (cls.contains('sigs')) { /* two signatures (three on the count paper, each may carry a name under it) */
      const sp = [...el.querySelectorAll('span')], nm = sp.map(q => q.parentNode.querySelector('small')), nn = sp.length; need(nm.some(Boolean) ? 112 : 90); y += 56; sp.forEach((q, i) => { const cx = nn === 2 ? PDF_W * (i ? 0.27 : 0.73) : PDF_W * (rtl ? 1 - (i + 0.5) / nn : (i + 0.5) / nn), hw = nn > 2 ? 62 : 80; g.strokeStyle = '#777'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx - hw, y - 12); g.lineTo(cx + hw, y - 12); g.stroke(); put(t(q.textContent), cx, y + 6, { a: 'c', s: 13, c: '#555' }); if (nm[i]) put(t(nm[i].textContent), cx, y + 25, { a: 'c', s: 12.5, c: '#777' }); }); y += nm.some(Boolean) ? 42 : 24;
    }
  });
  const vs = pp.querySelector('.vstamp');
  if (vs) { const g0 = pages[0].getContext('2d'); g0.save(); g0.setTransform(PDF_S, 0, 0, PDF_S, 0, 0); g0.translate(PG_W / 2, PG_H / 2.6); g0.rotate(-0.35); g0.direction = rtl ? 'rtl' : 'ltr'; g0.textAlign = 'center'; g0.font = F(700, 96); g0.fillStyle = 'rgba(200,30,30,.22)'; g0.fillText(t(vs.textContent), 0, 0); g0.restore(); }
  if (sink) { sink(cv); cv.width = cv.height = 0; return []; }
  return pages;
}

/* JPEG pages -> a small PDF file (one picture per A4 page) */
function pdfFromJpegs(jp) {
  const enc = new TextEncoder(), parts = []; let len = 0; const off = [];
  const push = b => { const u = typeof b === 'string' ? enc.encode(b) : b; parts.push(u); len += u.length; };
  const obj = (n, body) => { off[n] = len; push(`${n} 0 obj\n${body}\nendobj\n`); };
  push('%PDF-1.4\n'); const N = jp.length;
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${jp.map((_, i) => `${3 + 3 * i} 0 R`).join(' ')}] /Count ${N} >>`);
  jp.forEach((j, i) => {
    const pn = 3 + 3 * i, cn = pn + 1, im = pn + 2, ct = 'q 595.28 0 0 841.89 0 0 cm /Im0 Do Q';
    obj(pn, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 ${im} 0 R >> >> /Contents ${cn} 0 R >>`);
    obj(cn, `<< /Length ${ct.length} >>\nstream\n${ct}\nendstream`);
    off[im] = len; push(`${im} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${j.w} /Height ${j.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${j.data.length} >>\nstream\n`); push(j.data); push('\nendstream\nendobj\n');
  });
  const xr = len, total = 3 * N + 3; push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let k = 1; k < total; k++) push(String(off[k]).padStart(10, '0') + ' 00000 n \n');
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xr}\n%%EOF`);
  return new Blob(parts, { type: 'application/pdf' });
}
const pdfName = (base, no) => (fileSafe(trText(base)) + '_' + fileSafe(no)).slice(0, 80) + '.pdf';
async function paperPdf(html, name) {
  const holder = document.createElement('div'); holder.innerHTML = html; const roots = Array.from(holder.querySelectorAll('.paper')); if (!roots.length) throw new Error('no paper'); /* several papers = one file, each starting on a new page */
  try { await Promise.all([document.fonts.load(`400 14px ${getComputedStyle(document.body).fontFamily}`, '\u0627\u0628\u062c\u062f 123'), document.fonts.load(`700 14px ${getComputedStyle(document.body).fontFamily}`, '\u0627\u0628\u062c\u062f 123')]); } catch (e) { /* the system font is used */ }
  const logo = db.settings.logo ? await loadImg(db.settings.logo) : null;
  const jp = []; let root = roots[0]; const enc = cv => { const u = cv.toDataURL('image/jpeg', root.classList.contains('lstp') ? 0.82 : 0.92), b = atob(u.slice(u.indexOf(',') + 1)), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); jp.push({ data: a, w: cv.width, h: cv.height }); };
  for (const r of roots) { root = r; if (root.querySelector('.vstamp')) paperPages(root, logo).forEach(enc); else paperPages(root, logo, enc); } /* the «ملغاة» stamp is drawn on the first page afterwards, so those papers keep every page until the end */
  return new File([pdfFromJpegs(jp)], name, { type: 'application/pdf' });
}
/* the file is prepared while the screen is open, so the Send button can hand it over at once (phones only allow sharing right after a tap) */
let WARM = null, WARM_T = 0;
/* the font size changed: prepare the open paper again at the new size (same markup, only --fs differs) */
function docRewarm() { if (WARM) docWarm(WARM.html.replace(/(<article class="paper[^"]*" style="--fs:)[\d.]+/, '$1' + fsGet()), WARM.base, WARM.no); }
function docWarm(html, base, no) {
  WARM = { html, base, no }; const key = pdfKey(base, no, html); if (PDF_CACHE.has(key)) return; clearTimeout(WARM_T);
  WARM_T = setTimeout(() => { if (PDF_CACHE.has(key)) return; paperPdf(html, pdfName(base, no)).then(f => { if (PDF_CACHE.size > 10) PDF_CACHE.delete(PDF_CACHE.keys().next().value); PDF_CACHE.set(key, f); }).catch(() => { /* built when the button is pressed */ }); }, 500);
}
/* save a paper as a PDF file on this device (the «تصدير PDF» buttons) */
async function pdfSave(html, base, no) {
  const key = pdfKey(base, no, html); let file = PDF_CACHE.get(key) || null;
  if (!file) { toast('جاري تجهيز ملف PDF…'); try { file = await paperPdf(html, pdfName(base, no)); PDF_CACHE.set(key, file); } catch (e) { return toast('تعذّر تجهيز ملف PDF'); } }
  downloadFile(file.name, file, 'application/pdf'); toast('تم تحميل ملف PDF', 'ok');
}
/* send a paper to WhatsApp as a PDF: share sheet when there is one; otherwise save the file and open the customer's chat with the short message */
async function waDoc(o) {
  if (await autoRoute(o)) return; /* the n8n automation (Settings) may take it from here */
  const key = pdfKey(o.base, o.no, o.html); let file = PDF_CACHE.get(key) || null;
  if (!file) { toast('جاري تجهيز ملف PDF…'); try { file = await paperPdf(o.html, pdfName(o.base, o.no)); PDF_CACHE.set(key, file); } catch (e) { file = null; } }
  if (!file) return waOpen(o.phone, o.full, o.what); /* the picture could not be made: the text message still works */
  logA('wa', o.what + ' (PDF)'); save();
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], text: o.cap }); return; } catch (e) { if (e && e.name === 'AbortError') return; /* not allowed: save + chat below */ }
  }
  downloadFile(file.name, file, 'application/pdf'); toast('تم تحميل ملف PDF — أرفقه في محادثة واتساب', 'ok');
  waGo(o.phone, o.cap);
}
