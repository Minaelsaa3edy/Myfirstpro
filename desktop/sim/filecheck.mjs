import { createRequire as cr } from 'node:module'; const { chromium } = cr(import.meta.url)('playwright'); import path from 'node:path';
const br = await chromium.launch(); const pg = await (await br.newContext({ viewport: { width: 1400, height: 900 } })).newPage(); const errs = []; pg.on('pageerror', e => errs.push(String(e)));
await pg.goto('file://' + path.resolve('dist/sim.test.html')); await pg.waitForSelector('#icons');
console.log('secure:', await pg.evaluate(() => isSecureContext), 'subtle:', await pg.evaluate(() => !!crypto.subtle));
await pg.dblclick('#ic-setup'); await pg.click('#wz-f button.p'); await pg.click('#wz-f button.p'); await pg.waitForSelector('#wz-run', { timeout: 6000 }); await pg.click('#wz-f button.p');
const fh = await pg.waitForSelector('#wbody iframe'); let f = await fh.contentFrame(); await f.waitForSelector('#key');
await pg.click('[data-q=d3]'); await pg.waitForFunction(() => document.querySelector('#code').value.length > 100); await pg.click('#c-fill'); await f.click('#go');
await pg.waitForSelector('#menubar:not([hidden])', { timeout: 8000 }); const f2 = await (await pg.$('#wbody iframe')).contentFrame(); await f2.waitForSelector('.home', { timeout: 15000 });
console.log('file:// flow OK; errors:', errs.length); await br.close();
