import { createRequire as cr } from 'node:module'; const { chromium } = cr(import.meta.url)('playwright'); import fs from 'node:fs'; import http from 'node:http';
const html = fs.readFileSync(new URL('./dist/sim.test.html', import.meta.url)); const srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html; charset=utf-8'); r.end(html); }).listen(0);
const br = await chromium.launch(); const pg = await (await br.newContext({ viewport: { width: 400, height: 800 }, deviceScaleFactor: 1 })).newPage();
await pg.goto('http://127.0.0.1:' + srv.address().port + '/'); await pg.waitForSelector('#icons');
console.log('overflow-x:', await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth));
await pg.screenshot({ path: process.env.SP + '/sim-shots/m1.png' }); await br.close(); srv.close();
