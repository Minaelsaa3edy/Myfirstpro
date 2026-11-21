'use strict';
/* The user's data mirror.
   The program keeps its data inside the browser storage of the window; every save is also written here by the main process, so
   a cleared cache, a re-install or a corrupted storage never loses the books. Writes are atomic (temp file -> fsync -> rename),
   each file carries a SHA-256 of its content, and a ring of backups is kept. */
const fs = require('fs');
const path = require('path');
const cu = require('./cu');

class DataStore {
  constructor(dir, opt) {
    opt = opt || {};
    this.dir = dir; this.bdir = path.join(dir, 'backups');
    this.now = opt.now || (() => Date.now());
    this.every = opt.backupEveryMs == null ? 30 * 60 * 1000 : opt.backupEveryMs;
    this.keep = opt.keep || 30;
    this.lastBackup = 0; this.n = 0; this.pending = null; this.timer = null; this.delay = opt.delay == null ? 800 : opt.delay;
    this.main = path.join(dir, 'db.json');
    fs.mkdirSync(this.bdir, { recursive: true });
  }
  _env(keys) { const s = JSON.stringify(keys); return JSON.stringify({ v: 1, savedAt: this.now(), n: ++this.n, sha256: cu.sha256hex(s), keys: s }); }
  _readFile(f) {
    try {
      const o = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (!o || o.v !== 1 || typeof o.keys !== 'string' || cu.sha256hex(o.keys) !== o.sha256) return null;
      return { savedAt: +o.savedAt || 0, keys: JSON.parse(o.keys), file: f };
    } catch (e) { return null; }
  }
  /* the newest valid copy: db.json first, then the backups (newest first) */
  snapshot() {
    const a = this._readFile(this.main);
    if (a) return a;
    let names = []; try { names = fs.readdirSync(this.bdir).filter(x => x.endsWith('.json')).sort().reverse(); } catch (e) { /* none */ }
    for (const nme of names) { const r = this._readFile(path.join(this.bdir, nme)); if (r) return r; }
    return null;
  }
  _atomic(file, text) {
    const t = file + '.tmp' + process.pid;
    const fd = fs.openSync(t, 'w');
    try { fs.writeSync(fd, text); try { fs.fsyncSync(fd); } catch (e) { /* not supported everywhere */ } } finally { fs.closeSync(fd); }
    fs.renameSync(t, file);
  }
  stamp(d) { const p = n => String(n).padStart(2, '0'); d = new Date(d); return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()); }
  backup(label) {
    if (!fs.existsSync(this.main) || !this._readFile(this.main)) return null;
    const f = path.join(this.bdir, (label || 'auto') + '-' + this.stamp(this.now()) + '-' + Math.random().toString(36).slice(2, 6) + '.json');
    fs.copyFileSync(this.main, f); this.lastBackup = this.now();
    this._prune();
    return f;
  }
  _prune() {
    try {
      const all = fs.readdirSync(this.bdir).filter(x => /^auto-.*\.json$/.test(x)).sort();
      all.slice(0, Math.max(0, all.length - this.keep)).forEach(x => fs.rmSync(path.join(this.bdir, x), { force: true }));
      const pu = fs.readdirSync(this.bdir).filter(x => /^pre-update-.*\.json$/.test(x)).sort();
      pu.slice(0, Math.max(0, pu.length - 5)).forEach(x => fs.rmSync(path.join(this.bdir, x), { force: true }));
    } catch (e) { /* ignore */ }
  }
  writeNow(keys) {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; } this.pending = null;
    if (this.now() - this.lastBackup >= this.every) this.backup('auto'); /* a copy of the previous good file, at most once per interval */
    this._atomic(this.main, this._env(keys));
  }
  /* debounced: the program saves on every change */
  write(keys) {
    this.pending = keys;
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; const k = this.pending; this.pending = null; if (k) { try { this.writeNow(k); } catch (e) { this.lastError = e; } } }, this.delay);
    if (this.timer.unref) this.timer.unref();
  }
  flush() { if (this.pending) { const k = this.pending; this.pending = null; if (this.timer) { clearTimeout(this.timer); this.timer = null; } this.writeNow(k); } }
  /* user-facing export (plain JSON file with the browser-storage keys) */
  exportTo(file) {
    const s = this.snapshot(); if (!s) return false;
    fs.writeFileSync(file, JSON.stringify({ app: 'Myfirstpro Desktop', exportedAt: new Date(this.now()).toISOString(), savedAt: new Date(s.savedAt).toISOString(), keys: s.keys }, null, 1));
    return true;
  }
}

module.exports = { DataStore };
