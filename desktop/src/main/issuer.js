'use strict';
/* Activation-code generator — exists ONLY in the Developer build (the production installer does not contain this file).
   It opens the sealed vaults that travel with the Developer build, but only after the developer password is typed.
   The unlocked secrets stay in memory, are wiped after 10 idle minutes or when the window closes, and are never written anywhere. */
const fs = require('fs');
const path = require('path');
const cu = require('./lib/cu');
const license = require('./lib/license');
const vault = require('./lib/vault');
const T = require('./text-ar');

const IDLE_MS = 10 * 60 * 1000;

/* the wording that goes with a code (shown in the generator and by the command-line tool) */
function describe({ channel, unit, value, within, label, code }) {
  const summary = (unit === 'permanent' ? 'كود دائم' : 'كود مؤقت — ' + T.dur(unit, value) + ' من أول تفعيل') + (channel === 'developer' ? ' (نسخة المطوّر)' : '');
  const lines = ['كود تفعيل Myfirstpro Desktop' + (label ? ' — ' + label : '') + ':', '', code, '', 'المدة: ' + (unit === 'permanent' ? 'دائم بدون انتهاء' : T.dur(unit, value) + ' تبدأ من لحظة أول تفعيل')];
  if (within > 0) lines.push('يجب تفعيله خلال ' + T.dur('days', within) + ' من اليوم.');
  lines.push('', 'تنبيه: احتفظ بالكود. بعد أي تحديث للبرنامج سيطلب منك إدخاله مرة أخرى (نفس الكود، والمدة لا تبدأ من جديد).');
  return { summary, message: lines.join('\n') };
}

function create({ vaultsFile, logFile, now }) {
  let vaults = null; try { vaults = JSON.parse(fs.readFileSync(vaultsFile, 'utf8')); } catch (e) { vaults = null; }
  let secrets = null, timer = null, fails = 0, blockedUntil = 0;

  const touch = () => { clearTimeout(timer); if (secrets) { timer = setTimeout(lock, IDLE_MS); if (timer.unref) timer.unref(); } };
  function lock() { clearTimeout(timer); secrets = null; }
  const available = () => (vaults ? Object.keys(vaults).filter(k => k === 'production' || k === 'developer') : []);

  async function guarded(fn) { /* one failed password costs ~0.4 s; five in a row cost a 30 s pause */
    if (!vaults) return { ok: false, code: 'NO_VAULT' };
    if (Date.now() < blockedUntil) return { ok: false, code: 'LOCKED_WAIT' };
    try { const r = await fn(); fails = 0; return r; }
    catch (e) { if (++fails >= 5) { fails = 0; blockedUntil = Date.now() + 30000; } return { ok: false, code: 'BAD_PASSWORD' }; }
  }

  /* developer sign-in on the activation screen: needs only the Developer channel's payload key (no code) */
  const devPayloadKey = password => guarded(async () => {
    const s = await vault.openAsync(vaults.developer, password);
    return { ok: true, payloadKey: cu.fromB64u(s.payloadKey) };
  });

  /* unlock the generator: opens every available vault */
  const unlock = password => guarded(async () => {
    const out = {};
    for (const ch of available()) { const s = await vault.openAsync(vaults[ch], password); out[ch] = { licensePrivate: s.licensePrivate, payloadKey: cu.fromB64u(s.payloadKey) }; }
    if (!Object.keys(out).length) throw new Error('empty');
    secrets = out; touch();
    return { ok: true, channels: Object.keys(out) };
  });

  function readLog() {
    try { return fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).slice(-500).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean); }
    catch (e) { return []; }
  }
  const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f‎‏‪-‮]/g, ' ').trim().slice(0, max);

  /* o = { channel, unit, value, withinDays, label, count } -> { ok, items:[{id, code, summary, message}] } */
  function issue(o) {
    if (!secrets) return { ok: false, code: 'NOT_UNLOCKED' };
    touch();
    try {
      if (!o || typeof o !== 'object') return { ok: false, code: 'BAD_INPUT' };
      const channel = o.channel; if (!secrets[channel]) return { ok: false, code: 'BAD_INPUT', message: 'نسخة غير متاحة.' };
      const unit = o.unit; if (!license.UNITS.includes(unit)) return { ok: false, code: 'BAD_INPUT' };
      const value = unit === 'permanent' ? 0 : Math.floor(+o.value);
      const count = Math.floor(+o.count || 1); if (!(count >= 1 && count <= 50)) return { ok: false, code: 'BAD_INPUT', message: 'عدد الأكواد من 1 إلى 50.' };
      const within = o.withinDays === '' || o.withinDays == null ? (unit === 'permanent' ? 365 : 30) : Math.floor(+o.withinDays);
      const label = clean(o.label, 60), t = now(), items = [];
      for (let i = 0; i < count; i++) {
        const code = license.issue({ channel, unit, value, payloadKey: secrets[channel].payloadKey, now: t, withinDays: within }, secrets[channel].licensePrivate);
        const info = license.parse(code).info;
        const { summary, message } = describe({ channel, unit, value, within, label, code });
        items.push({ id: info.id, code, summary, message });
        try { fs.mkdirSync(path.dirname(logFile), { recursive: true }); fs.appendFileSync(logFile, JSON.stringify({ t, id: info.id, channel, unit, value, within, label, code }) + '\n'); } catch (e) { /* the log is a convenience */ }
      }
      return { ok: true, items };
    } catch (e) { const m = String(e && e.message || e); return { ok: false, code: 'BAD_INPUT', message: /duration|days must/.test(m) ? 'المدة من 1 إلى 65535 (والأيام حتى 3650).' : /activate-within/.test(m) ? 'مهلة التفعيل من 0 إلى 65535 يومًا.' : 'بيانات غير صحيحة.' }; }
  }
  const list = () => {
    if (!secrets) return { ok: false, code: 'NOT_UNLOCKED' };
    touch();
    return { ok: true, rows: readLog().reverse().slice(0, 200).map(r => ({ t: r.t, id: r.id, channel: r.channel, unit: r.unit, value: r.value, label: r.label || '', code: r.code, when: T.dt(r.t), dur: r.unit === 'permanent' ? 'دائم' : T.dur(r.unit, r.value) })) };
  };
  return { available, unlock, lock, issue, list, devPayloadKey, isUnlocked: () => !!secrets, hasVaults: () => available().length > 0 };
}
module.exports = { create, describe };
