'use strict';
/* The build channel (production / developer) is decided at build time and written to channel.json inside the packaged app.
   Nothing in the program can switch channel at run time. */
const fs = require('fs');
const path = require('path');

function load(appDir) {
  const f = path.join(appDir, 'channel.json');
  const c = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (c.channel !== 'production' && c.channel !== 'developer') throw new Error('bad channel');
  c.dev = c.channel === 'developer';
  for (const k of ['appId', 'productName', 'userDataName', 'version', 'licenseKey', 'updateKey']) if (!c[k]) throw new Error('channel.json: missing ' + k);
  return Object.freeze(c);
}
module.exports = { load };
