'use strict';
/* Linux adapter — used ONLY to run the automatic tests on a build server. Not a supported product platform:
   the machine id comes from /etc/machine-id (or MPD_TEST_MACHINE_ID) and no installer is ever started. */
const fs = require('fs');

function machineId() {
  if (process.env.MPD_TEST_MACHINE_ID) return Promise.resolve(process.env.MPD_TEST_MACHINE_ID);
  try { return Promise.resolve(fs.readFileSync('/etc/machine-id', 'utf8').trim() || 'linux-test'); } catch (e) { return Promise.resolve('linux-test'); }
}
function launchInstaller(file) { return { started: false, dryRun: true, file }; }

module.exports = { id: 'linux', supported: false, testOnly: true, installerExt: null, machineId, launchInstaller };
