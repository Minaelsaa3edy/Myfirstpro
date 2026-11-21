'use strict';
/* picks the adapter of the running OS; every platform-specific detail lives in this folder */
const p = process.platform;
module.exports = p === 'win32' ? require('./win32') : p === 'darwin' ? require('./darwin') : require('./linux');
