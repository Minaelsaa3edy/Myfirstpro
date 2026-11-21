// Loads the simulator under restrictive hosting conditions (sandboxed frame / strict CSP) and tries the main flow, to find what breaks in the artifact viewer.
import { createRequire as cr } from 'node:module'; const { chromium } = cr(import.meta.url)('playwright'); import fs from 'node:fs'; import http from 'node:http';
const html = fs.readFileSync(new URL('./dist/sim.test.html', import.meta.url));
const V = {
  baseline: {},
  sandboxOpaque: { 'content-security-policy': 'sandbox allow-scripts' },
  csp: { 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src data: blob:; connect-src 'none'; frame-src 'self'" },
  cspSandbox: { 'content-security-policy': "sandbox allow-scripts allow-same-origin; default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src data: blob:; connect-src 'none'" },
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (const [name, hdr] of Object.entries(V)) {
  const srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html; charset=utf-8'); for (const k in hdr) r.setHeader(k, hdr[k]); r.end(html); }).listen(0);
  const br = await chromium.launch(); const pg = await (await br.newContext({ viewport: { width: 1400, height: 900 } })).newPage(); const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 140))); pg.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|fonts\.g/.test(m.text())) errs.push(m.text().slice(0, 160)); });
  await pg.goto('http://127.0.0.1:' + srv.address().port + '/'); await pg.waitForSelector('#icons');
  const env = await pg.evaluate(() => ({ secure: isSecureContext, subtle: !!(crypto && crypto.subtle), origin: location.origin }));
  let r = 'n/a';
  try {
    await pg.dblclick('#ic-setup'); await pg.click('#wz-f button.p'); await pg.click('#wz-f button.p'); await pg.waitForSelector('#wz-run', { timeout: 6000 }); await pg.click('#wz-f button.p');
    const fh = await pg.waitForSelector('#wbody iframe'); const f = await fh.contentFrame(); await f.waitForSelector('#key', { timeout: 4000 });
    const mpd = await f.evaluate(() => typeof window.MPD);
    await pg.click('[data-q=d3]'); await sleep(800); const code = await pg.inputValue('#code');
    await pg.click('#c-fill'); await f.click('#go'); await sleep(1200);
    const msg = await f.innerText('#msg').catch(() => '?'); r = 'MPD=' + mpd + ' code=' + (code.length) + ' msg=' + msg.slice(0, 70);
    const ok = await pg.waitForSelector('#menubar:not([hidden])', { timeout: 5000 }).then(() => true, () => false); r += ' mainOpened=' + ok;
    const f2 = await (await pg.$('#wbody iframe')).contentFrame(); const home = await f2.waitForSelector('.home', { timeout: 15000 }).then(() => true, () => false); r += ' programHome=' + home;
    if (home) { await f2.evaluate(() => { try { localStorage.setItem('accounts.envtest', JSON.stringify({ k: 1 })); } catch (e) {} }); await sleep(900); r += ' dataMirrored=' + (await pg.evaluate(() => { try { return JSON.stringify(JSON.parse(localStorage.getItem('mpdsim.mirror.production') || 'null')).includes('envtest'); } catch (e) { return 'n/a(storage blocked in parent)'; } })); }
  } catch (e) { r = 'ERR ' + String(e).split('\n')[0].slice(0, 120); }
  console.log(name.padEnd(14), JSON.stringify(env), '\n   ', r, '\n    errors:', JSON.stringify(errs.slice(0, 3)));
  await br.close(); srv.close();
}
