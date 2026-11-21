/* ---------- Glass code card shared by the real / demo programs' lock screens: the same animated dusk scene as the host gate (it is mounted outside #app, so the UI zoom never touches it) ---------- */
const GX_SCENE = '@@GX_SCENE@@', GX_MARK = '@@GX_MARK@@'; /* filled in by the build (src/scene.html, src/mark.html) */
const GX_KEY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="M10.8 12.2 20 3m-4 4 3 3m-6-1 2.5 2.5"/></svg>';
const GX_USER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4.5 21c.6-4 3.8-6.5 7.5-6.5s6.9 2.5 7.5 6.5"/></svg>';
const GX_GO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6"/></svg>';
function gxMount() {
  document.body.classList.add('gx-on');
  let g = document.getElementById('gxs'); if (!g) { g = document.createElement('div'); g.id = 'gxs'; document.body.prepend(g); }
  g.innerHTML = GX_SCENE;
}
/* a code box that shows XXXX-XXXX-XXXX-XXXX while typing (a pasted link carrying c=… is understood too) */
const gxCodeRx = /(?:^|[#&?\s])c=([A-Za-z0-9-]+)/;
const gxNorm = v => (gxCodeRx.exec(v) ? gxCodeRx.exec(v)[1] : String(v)).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
function gxFormat(inp) {
  inp.addEventListener('input', () => {
    const v = inp.value, nv = gxNorm(v).replace(/(.{4})(?=.)/g, '$1-'); if (nv === v) return;
    const n = gxCodeRx.test(v) ? 99 : v.slice(0, inp.selectionStart == null ? v.length : inp.selectionStart).replace(/[^A-Za-z0-9]/g, '').length;
    let p = 0, k = 0; while (p < nv.length && k < n) { if (nv[p] !== '-') k++; p++; }
    inp.value = nv; try { inp.setSelectionRange(p, p); } catch (e) { /* not selectable */ }
  });
}
