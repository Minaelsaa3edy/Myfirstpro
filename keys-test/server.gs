/* Trial-code server (Google Apps Script web app) - holds only ENCRYPTED slots, a list of stopped trials and the designer's own encrypted notes.
   Nothing here can open the program: a code's slot is unlocked only by the code itself, and the signing key never leaves the designer's page.
   Deploy: Deploy > New deployment > Web app > Execute as: Me > Who has access: Anyone. */
const ADMIN = 'NiWKNTowzjcdUYQTHOdKtsD5KTS3cfXC';            // the designer's private key for this server (do not share this file)
const DAY = 86400000, KEEP = 30 * DAY;    // a finished code is forgotten 30 days after it ends

function out_(o, cb) {
  const txt = JSON.stringify(o);
  if (cb && /^[A-Za-z_$][\w$]{0,40}$/.test(cb)) return ContentService.createTextOutput(cb + '(' + txt + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(txt).setMimeType(ContentService.MimeType.JSON);
}
const okId_ = s => /^[A-Z0-9]{4}$/.test(s || '');
const okTid_ = s => /^[\w-]{4,24}$/.test(s || '');
const num_ = s => { const n = Number(s); return isFinite(n) && n > 0 ? Math.floor(n) : 0; };
const json_ = (s, max) => { s = String(s || ''); if (!s || s.length > max) throw new Error('bad size'); return JSON.parse(s); };

function doGet(e) {
  const p = (e && e.parameter) || {}, cb = p.cb, P = PropertiesService.getScriptProperties(), now = Date.now();
  try {
    /* ---- public (the trial gate page and the running trial) ---- */
    if (p.a === 'ping') return out_({ ok: 1, t: now }, cb);
    if (p.a === 'slot') {
      if (!okId_(p.id)) return out_({ ok: 1, slot: null }, cb);
      const v = P.getProperty('s_' + p.id); if (!v) return out_({ ok: 1, slot: null }, cb);
      const o = JSON.parse(v); return out_({ ok: 1, slot: o.u && o.u < now ? null : o.slot }, cb);
    }
    if (p.a === 'rv') {
      const ids = [], all = P.getProperties();
      for (const k in all) if (k.indexOf('r_') === 0 && Number(all[k]) >= now) ids.push(k.slice(2));
      return out_({ ok: 1, ids: ids }, cb);
    }
    if (p.a === 'seen') { /* a running program says: this code is open on a device, and when it ends there (0 = no end). Only times are kept. */
      if (!okTid_(p.i)) return out_({ ok: 1 }, cb);
      const k = 'o_' + p.i, v = P.getProperty(k); let o = null; try { o = v ? JSON.parse(v) : null; } catch (x) { o = null; }
      if (!o) { if (Object.keys(P.getProperties()).filter(x => x.indexOf('o_') === 0).length >= 400) return out_({ ok: 1 }, cb); o = { f: now, n: 0 }; }
      o.l = now; o.e = num_(p.e); if (p.n === '1') o.n = (o.n || 0) + 1;
      P.setProperty(k, JSON.stringify(o)); return out_({ ok: 1, t: now }, cb);
    }
    /* ---- the designer only ---- */
    if (!p.k || p.k !== ADMIN) return out_({ ok: 0, e: 'key' }, cb);
    const lock = LockService.getScriptLock(); lock.waitLock(15000);
    try {
      if (p.a === 'chk') return out_({ ok: 1, t: now, v: 2 }, cb);
      if (p.a === 'put') {
        if (!okId_(p.id)) throw new Error('id');
        const slot = json_(p.slot, 2500); if (!slot.s || !slot.iv || !slot.c) throw new Error('slot');
        P.setProperty('s_' + p.id, JSON.stringify({ slot: slot, u: num_(p.u) }));
        if (p.m) P.setProperty('m_' + p.id, JSON.stringify({ m: json_(p.m, 2500), u: num_(p.u) }));
        const all = P.getProperties(); /* forget what ended long ago */
        for (const k in all) { if (k.indexOf('s_') === 0 || k.indexOf('m_') === 0) { try { const o = JSON.parse(all[k]); if (o.u && o.u + KEEP < now) P.deleteProperty(k); } catch (x) { P.deleteProperty(k); } } else if (k.indexOf('r_') === 0 && Number(all[k]) + KEEP < now) P.deleteProperty(k); else if (k.indexOf('o_') === 0) { try { if (JSON.parse(all[k]).l + KEEP < now) P.deleteProperty(k); } catch (x) { P.deleteProperty(k); } } }
        return out_({ ok: 1 }, cb);
      }
      if (p.a === 'stop') { if (!okTid_(p.i)) throw new Error('id'); P.setProperty('r_' + p.i, String(num_(p.u) || now + 90 * DAY)); return out_({ ok: 1 }, cb); }
      if (p.a === 'unstop') { if (!okTid_(p.i)) throw new Error('id'); P.deleteProperty('r_' + p.i); return out_({ ok: 1 }, cb); }
      if (p.a === 'del') { if (!okId_(p.id)) throw new Error('id'); P.deleteProperty('s_' + p.id); P.deleteProperty('m_' + p.id); if (okTid_(p.i)) P.deleteProperty('o_' + p.i); return out_({ ok: 1 }, cb); }
      if (p.a === 'list') {
        const items = [], rv = [], op = [], all = P.getProperties();
        for (const k in all) {
          if (k.indexOf('m_') === 0) { try { const o = JSON.parse(all[k]); items.push({ id: k.slice(2), m: o.m, u: o.u }); } catch (x) { /* skip */ } }
          else if (k.indexOf('r_') === 0) rv.push({ i: k.slice(2), u: Number(all[k]) });
          else if (k.indexOf('o_') === 0) { try { const o = JSON.parse(all[k]); op.push({ i: k.slice(2), f: o.f, l: o.l, e: o.e, n: o.n }); } catch (x) { /* skip */ } }
        }
        return out_({ ok: 1, items: items, rv: rv, op: op, t: now, v: 2 }, cb);
      }
      return out_({ ok: 0, e: 'action' }, cb);
    } finally { lock.releaseLock(); }
  } catch (err) { return out_({ ok: 0, e: String((err && err.message) || err) }, cb); }
}
