'use strict';
/* macOS adapter — intentionally NOT implemented in this phase.
   The rest of the program talks to the platform only through this interface (machineId, launchInstaller, installerExt),
   so macOS can be added later by filling in this file (IOPlatformUUID, .dmg/.zip updates) and a "mac" block in the build config. */
const unsupported = () => { const e = new Error('PLATFORM_NOT_SUPPORTED'); e.code = 'PLATFORM_NOT_SUPPORTED'; throw e; };
module.exports = { id: 'darwin', supported: false, installerExt: null, machineId: unsupported, launchInstaller: unsupported };
