'use strict';
/* Windows adapter — the only platform implemented today. */
const path = require('path');
const { execFile, spawn } = require('child_process');

const sysRoot = process.env.SystemRoot || 'C:\\Windows';

function machineId() { /* HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid (64-bit view), stable until Windows is re-installed */
  return new Promise((res, rej) => {
    execFile(path.join(sysRoot, 'System32', 'reg.exe'), ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid', '/reg:64'],
      { windowsHide: true, timeout: 8000 }, (err, out) => {
        const m = !err && /MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]{16,64})/.exec(String(out));
        m ? res(m[1]) : rej(new Error('MACHINE_ID_UNAVAILABLE'));
      });
  });
}

/* silent NSIS install; "--updated --force-run" make the installer start the program again when it finishes */
function launchInstaller(file) {
  const c = spawn(file, ['/S', '--updated', '--force-run'], { detached: true, stdio: 'ignore', windowsHide: false });
  c.unref();
  return { started: true };
}

module.exports = { id: 'win32', supported: true, installerExt: '.exe', machineId, launchInstaller };
