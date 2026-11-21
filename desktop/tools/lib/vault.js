'use strict';
/* The vault itself lives in src/main/lib/vault.js (the Developer build's code generator uses it too).
   The password is read only from the DEVPW environment variable at the moment a command runs — never stored or printed. */
const core = require('../../src/main/lib/vault');
function pw() {
  const p = process.env.DEVPW;
  if (!p || p.length < 10) { console.error('DEVPW (developer password, at least 10 characters) is not set in the environment.'); process.exit(2); }
  return p;
}
module.exports = Object.assign({}, core, { pw });
