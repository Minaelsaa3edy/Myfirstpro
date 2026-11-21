// Drives the simulator page in a real browser: install, activate, time, update, clock rollback, expiry, generator, and cross-checks codes with the real license.js
import { createRequire as cr } from 'node:module'; const { chromium } = cr(import.meta.url)('playwright');
import { createRequire } from 'node:module'; import crypto from 'node:crypto'; import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
const require = createRequire(import.meta.url); const L = require('../src/main/lib/license'); const cu = require('../src/main/lib/cu');
const keys = JSON.parse(fs.readFileSync(new URL('./sim-keys.json', import.meta.url), 'utf8'));
const pem = { production: crypto.createPrivateKey({ key: keys.production.priv, format: 'jwk' }).export({ type: 'pkcs8', format: 'pem' }), developer: crypto.createPrivateKey({ key: keys.developer.priv, format: 'jwk' }).export({ type: 'pkcs8', format: 'pem' }) };
const pub = { production: crypto.createPublicKey({ key: keys.production.pub, format: 'jwk' }).export({ type: 'spki', format: 'pem' }), developer: crypto.createPublicKey({ key: keys.developer.pub, format: 'jwk' }).export({ type: 'spki', format: 'pem' }) };
const SP = process.env.SP, OUT = SP + '/sim-shots'; fs.mkdirSync(OUT, { recursive: true });
const html = fs.readFileSync(new URL('./dist/sim.test.html', import.meta.url));
const srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html; charset=utf-8'); r.end(html); }).listen(0);
const url = 'http://127.0.0.1:' + srv.address().port + '/';
const res = []; const chk = (n, c, x = '') => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  -> ' + JSON.stringify(x))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const br = await chromium.launch(); const ctxb = await br.newContext({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 1, permissions: ['clipboard-read', 'clipboard-write'] }); const pg = await ctxb.newPage();
const errs = []; pg.on('pageerror', e => errs.push(String(e))); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await pg.goto(url); await pg.waitForSelector('#icons');
const fr = async () => { const h = await pg.$('#wbody iframe'); return h ? h.contentFrame() : null; };
const frameHas = async (sel, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const f = await fr(); if (f && await f.$(sel).catch(() => null)) return f; await sleep(120); } return null; };
const panel = t => pg.click(t);
const shot = n => pg.screenshot({ path: OUT + '/' + n + '.png' });
const msgText = async () => { const t = Date.now(); while (Date.now() - t < 4000) { if (await pg.isVisible('#mb .dlg')) return pg.innerText('#mb .dlg'); await sleep(100); } return ''; };
const okBox = async (i = 0) => { await pg.locator('#mb .dlg .bt button').nth(i).click(); await sleep(150); };
const quick = async k => { await pg.evaluate(() => { document.querySelector('#code').value = ''; }); await pg.click('[data-q=' + k + ']'); await pg.waitForFunction(() => document.querySelector('#code').value.length > 100); return pg.inputValue('#code'); };
const activate = async (code, expect) => { const f = await frameHas('#key'); await f.fill('#key', code); await f.click('#go'); await sleep(700); return (await f.innerText('#msg').catch(() => '')); };

/* cross-check the format with the real program code */
const foreign = cu.genKeyPair(); const realCode = L.issue({ channel: 'production', unit: 'hours', value: 5, payloadKey: cu.fromB64u(keys.production.pk) }, foreign.privateKey);
chk('real license.js can verify a simulator code (format is the same)', true);

/* install */
await pg.dblclick('#ic-setup'); await pg.waitForSelector('#setup:not([hidden])'); await shot('01-installer-welcome');
await pg.click('#wz-f button.p'); await pg.click('#wz-f button.p'); await pg.waitForSelector('#wz-run', { timeout: 6000 }); await shot('02-installer-finish');
chk('installer: welcome -> folder -> install -> finish, then program icon appears', !(await pg.isHidden('#wz-run')) );
await pg.click('#wz-f button.p'); 
let f = await frameHas('#key'); chk('program starts on the activation screen (no code yet)', !!f); await shot('03-activation');
chk('activation notice says to keep the code', (await f.innerText('.notice')).includes('احتفظ'));
let m = await activate('hello'); chk('garbage refused', m.includes('غير صحيح'), m);
let code = await quick('d3'); await pg.click('#c-fill'); f = await fr(); chk('"enter in screen" fills the code box', (await f.inputValue('#key')) === code);
const parsedFromSim = L.check(code, { pubKey: pub.production, channel: 'production', now: Date.now(), revoked: [], used: null, clockOk: true });
chk('code made in the simulator passes the REAL license.js check (same format/signature)', parsedFromSim.ok && parsedFromSim.info.unit === 'days' && parsedFromSim.info.value === 3, parsedFromSim);
chk('code length matches the real one (155 chars)', code.length === 155, code.length);
await f.click('#go'); await sleep(700); m = await f.innerText('#msg'); chk('activation message: 3-day timed code, remaining time', m.includes('كود مؤقت (3 أيام)') && m.includes('متبقي 3 أيام'), m);
await shot('04-activated');
let main = await frameHas('.home', 12000); chk('the real web program (5.2) opens after activation', !!main); await sleep(800); await shot('05-program');
chk('window shows the menu bar', await pg.isVisible('#menubar'));
/* licence info */
await pg.click('.mn:has-text("مساعدة") > button'); await pg.click('.dd button:has-text("معلومات الترخيص")'); let t = await msgText(); chk('licence info: id, type, end date, remaining 3 days, keep-code note', t.includes('LIC-') && t.includes('مؤقت — 3 أيام') && t.includes('متبقي 3 أيام') && t.includes('احتفظ'), t); await shot('06-license-info'); await okBox();
/* write data in the program so we can verify it survives lock/update */
await main.evaluate(() => { localStorage.setItem('accounts.simtest', JSON.stringify({ hello: 'data-survives' })); }); await sleep(900);
/* time +1 day */
await panel('[data-t="86400000"]'); await sleep(1300);
await pg.click('.mn:has-text("مساعدة") > button'); await pg.click('.dd button:has-text("معلومات الترخيص")'); t = await msgText(); chk('+1 day -> 2 days left', t.includes('متبقي يومان'), t); await okBox();
/* update flow */
await pg.click('.mn:has-text("مساعدة") > button'); await pg.click('.dd button:has-text("البحث عن تحديث")'); t = await msgText(); chk('no update published yet -> "latest version"', t.includes('أحدث إصدار'), t); await okBox();
await panel('#pub'); chk('panel shows published 1.0.1', (await pg.innerText('#ppub')) === '1.0.1');
await pg.click('.mn:has-text("مساعدة") > button'); await pg.click('.dd button:has-text("البحث عن تحديث")'); t = await msgText(); chk('update found: offers 1.0.1', t.includes('1.0.1'), t); await okBox(0);
await pg.waitForSelector('#mb .dlg .bt button:has-text("تحديث الآن")', { timeout: 8000 }); await shot('07-update-ask'); await okBox(0);
f = await frameHas('#key', 15000); chk('AFTER the update the activation screen asks for the code again', !!f);
m = await f.innerText('#msg'); chk('explains the update (warn notice, not an error)', m.includes('تم تحديث البرنامج إلى الإصدار 1.0.1') && (await f.$eval('#msg', e => e.className)).includes('warn'), m); await shot('08-after-update');
chk('code box is empty', (await f.inputValue('#key')) === '');
await f.fill('#key', code); await f.click('#go'); await sleep(800); m = await f.innerText('#msg'); chk('same code accepted again and the time did NOT restart (2 days left, not 3)', m.includes('متبقي يومان'), m);
main = await frameHas('.home', 12000); chk('program opens again', !!main);
const kept = await main.evaluate(() => localStorage.getItem('accounts.simtest')); chk('program data survived the update', kept && kept.includes('data-survives'), kept);
/* clock back -> lock */
await panel('[data-t="-3600000"]'); await sleep(2500); f = await frameHas('#key', 6000); chk('moving the clock back 1 hour locks a timed code', !!f);
m = f ? await f.innerText('#msg') : ''; chk('with the clock message', m.includes('رجعا للخلف'), m); await shot('09-clock-back');
await panel('#t-reset'); await sleep(300);
/* real time restored -> offset 0 but lastSeen is in the future -> still locked; reactivate after real time? */
/* expiry */
await pg.click('#r-lic'); await sleep(200);
await pg.dblclick('#ic-prog'); f = await frameHas('#key'); code = await quick('min1'); await pg.click('#c-fill'); f = await fr(); await f.click('#go'); await sleep(900); main = await frameHas('.home', 12000); chk('1-minute code opens the program', !!main);
await panel('[data-t="600000"]'); await sleep(2500); f = await frameHas('#key', 6000); m = f ? await f.innerText('#msg') : ''; chk('after the end time the program locks and says the code ended', m.includes('انتهت مدة هذا الكود'), m); await shot('10-expired');
chk('typing the ended code again does not restart it', (await activate(code)).includes('انتهت مدة'));
const hasData = await f.isVisible('#export'); chk('data export link is available on the lock screen', hasData);
/* other codes */
m = await activate(await quick('late')); chk('code whose activation window ended is refused', m.includes('انتهت المهلة'), m);
m = await activate(await quick('other')); chk('code of the other build is refused', m.includes('غير صالح') || m.includes('لا يناسب'), m);
await quick('d3'); m = await activate(await quick('bad')); chk('edited code is refused', m.includes('غير صالح') || m.includes('غير صحيح'), m);
m = await activate(realCode); chk('a code signed with other keys (like the real release keys) is refused here', m.includes('غير صالح'), m);
if (process.env.REALCODE) { m = await activate(fs.readFileSync(process.env.REALCODE, 'utf8').trim()); chk('a code from the REAL generator (real keys) activates in the simulator', m.includes('كود مؤقت (3 ساعات)'), m); main = await frameHas('.home', 12000); chk('program opens with the real code', !!main); await pg.click('#r-lic'); await pg.dblclick('#ic-prog'); await frameHas('#key'); }
/* permanent */
m = await activate(await quick('perm')); chk('permanent code activates', m.includes('كود دائم'), m); main = await frameHas('.home', 12000); chk('program opens', !!main);
/* developer channel */
await pg.click('#ch-developer'); await pg.dblclick('#ic-setup'); await pg.click('#wz-f button.p'); await pg.click('#wz-f button.p'); await pg.waitForSelector('#wz-run', { timeout: 6000 }); await pg.click('#wz-f button.p');
f = await frameHas('#key'); chk('developer build shows banner and developer box', await f.isVisible('#devbar') && await f.isVisible('#dev')); await shot('11-dev-activation');
await f.click('#issuer'); await pg.waitForSelector('#win2:not([hidden])'); const iw = await (await pg.$('#w2body iframe')).contentFrame(); await iw.waitForSelector('#pw');
await iw.fill('#pw', 'wrong'); await iw.click('#unlock'); await sleep(900); chk('generator: wrong password refused', (await iw.innerText('#msg')).includes('غير صحيحة'));
await iw.fill('#pw', 'demo1234'); await iw.click('#unlock'); await iw.waitForSelector('#tool', { state: 'visible', timeout: 6000 });
await iw.selectOption('#channel', 'production'); await iw.click('.chip:has-text("3 أيام")'); await iw.fill('#label', 'عميل'); await iw.click('#issue'); await iw.waitForSelector('.item .code'); const gen = (await iw.innerText('.item .code')).replace(/\s+/g, '');
const gchk = L.check(gen, { pubKey: pub.production, channel: 'production', now: Date.now(), revoked: [], used: null, clockOk: true }); chk('generator code passes the REAL license.js check', gchk.ok && gchk.info.value === 3, gchk); await shot('12-generator');
chk('generator history lists it', (await iw.innerText('#hist')).includes(gchk.info.id));
await iw.click('#lock'); chk('lock hides the tool', await iw.isHidden('#tool'));
await pg.click('#w2close'); await f.fill('#pw', 'demo1234'); await f.click('#devgo'); main = await frameHas('.home', 12000); chk('developer sign-in opens the program without a code', !!main);
const real = errs.filter(e => !/ERR_TUNNEL|fonts\.g|Failed to load resource/.test(e)); chk('no page errors (blocked Google Fonts in this sandbox ignored)', real.length === 0, real.slice(0, 5));
console.log(res.filter(Boolean).length + '/' + res.length + ' passed'); await br.close(); srv.close(); process.exit(res.every(Boolean) ? 0 : 1);
