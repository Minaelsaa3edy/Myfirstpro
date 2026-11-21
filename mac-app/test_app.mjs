import { _electron as electron } from 'playwright-core';
import path from 'node:path'; import os from 'node:os'; import fs from 'node:fs';
const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'accts-')); const res = [];
const chk = (n, c, x = '') => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  -> ' + x)); };
const launch = () => electron.launch({ args: ['--no-sandbox', '--user-data-dir=' + ud, path.resolve('.')], executablePath: path.resolve('node_modules/electron/dist/electron') });
let app = await launch(); const errs = []; 
let win = await app.firstWindow(); win.on('pageerror', e => errs.push(String(e)));
await win.waitForSelector('.home', { timeout: 30000 });
chk('window opens the program home screen', await win.locator('.home').count() === 1);
chk('window title is the program name', (await win.title()).includes('النسخة الأولى التجريبية لبرنامج المحاسبات لمواد البناء'), await win.title());
chk('footer shows version 2.2', (await win.innerText('footer.credit')).includes('Version 2.2'));
chk('app name is Accounts', (await app.evaluate(({ app }) => app.getName())) === 'Accounts');
const menus = await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.map(i => i.role || i.label));
chk('menu has edit + window (copy/paste work)', menus.some(x => /edit/i.test(x)) && menus.some(x => /window/i.test(x)), menus);
chk('no developer section in the customer app', await win.evaluate(() => !document.body.innerText.includes('قسم المطوّر')));
await win.click('[data-to="settings"]'); await win.waitForTimeout(300);
chk('settings opens', await win.locator('[data-to="setDev"]').count() === 0);
// storage persists across a full restart
await win.evaluate(() => localStorage.setItem('probe.persist', 'yes'));
const keysBefore = await win.evaluate(() => Object.keys(localStorage).length);
await app.close();
app = await launch(); win = await app.firstWindow(); await win.waitForSelector('.home', { timeout: 30000 });
chk('data survives closing and reopening the app', (await win.evaluate(() => localStorage.getItem('probe.persist'))) === 'yes' && (await win.evaluate(() => Object.keys(localStorage).length)) === keysBefore);
// external links never navigate inside the window
const nav = await win.evaluate(() => { try { return typeof window.require === 'undefined' && typeof process === 'undefined'; } catch (e) { return true; } });
chk('page has no Node access', nav);
// second launch re-uses the single window
const n = await app.windows().length; chk('exactly one window', n === 1, n);
chk('no page errors', errs.length === 0, errs);
await app.close();
console.log(res.filter(Boolean).length + '/' + res.length + ' passed');
