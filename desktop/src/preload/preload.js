'use strict';
/* The only bridge between a window and the main process. It exposes a small, frozen set of functions per page;
   the main process checks again who is calling, so a page can never use another page's functions.
   The Developer-only functions exist here but the main process answers them only in the Developer build. */
const { contextBridge, ipcRenderer } = require('electron');
const page = location.pathname;
let api = {};
if (page === '/activation.html') {
  api = {
    status: () => ipcRenderer.invoke('lic:status'),
    activate: t => ipcRenderer.invoke('lic:activate', String(t == null ? '' : t).slice(0, 6000)),
    exportData: () => ipcRenderer.invoke('data:export'),
    quit: () => ipcRenderer.send('app:quit'),
    devLogin: p => ipcRenderer.invoke('dev:login', String(p == null ? '' : p).slice(0, 200)),
    openIssuer: () => ipcRenderer.send('issuer:open')
  };
} else if (page === '/issuer.html') {
  api = {
    unlock: p => ipcRenderer.invoke('issuer:unlock', String(p == null ? '' : p).slice(0, 200)),
    issue: o => ipcRenderer.invoke('issuer:issue', o && typeof o === 'object' ? { channel: String(o.channel), unit: String(o.unit), value: Number(o.value), withinDays: o.withinDays === '' || o.withinDays == null ? null : Number(o.withinDays), label: String(o.label || '').slice(0, 60), count: Number(o.count) } : null),
    list: () => ipcRenderer.invoke('issuer:list'),
    lock: () => ipcRenderer.send('issuer:lock'),
    copy: t => { if (typeof t === 'string') ipcRenderer.send('clip:write', t.slice(0, 40000)); },
    save: (t, n) => ipcRenderer.invoke('issuer:save', String(t || '').slice(0, 400000), String(n || '').slice(0, 60))
  };
} else if (page === '/app.html') {
  api = {
    snapshot: ipcRenderer.sendSync('store:snapshot'),
    persist: s => { if (typeof s === 'string') ipcRenderer.send('store:persist', s); }
  };
}
contextBridge.exposeInMainWorld('MPD', Object.freeze(api));
