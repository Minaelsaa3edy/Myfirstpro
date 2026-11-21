'use strict';
const { app, BrowserWindow, Menu, shell, session } = require('electron');
const path = require('path');

app.setName('Accounts');
if (!app.requestSingleInstanceLock()) { app.quit(); }

let win = null;
const isWeb = u => /^https?:\/\//i.test(u);

function createWindow() {
  win = new BrowserWindow({
    width: 1240, height: 860, minWidth: 420, minHeight: 600,
    backgroundColor: '#f3f5f7', show: false, autoHideMenuBar: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, devTools: false }
  });
  win.loadFile(path.join(__dirname, 'app.html'));
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; });
  win.webContents.setWindowOpenHandler(({ url }) => { if (isWeb(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (isWeb(url)) shell.openExternal(url); } });
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  const mac = process.platform === 'darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(mac ? [{ role: 'appMenu' }] : []),
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'togglefullscreen' }] },
    { role: 'windowMenu' }
  ]));
  createWindow();
});
