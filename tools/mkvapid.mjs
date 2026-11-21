// Makes the Web Push identity of the code server: a P-256 key pair (VAPID). Prints {"pub": "...", "priv": "..."} (base64url; pub = 65-byte uncompressed point, priv = 32-byte scalar).
// The private half goes only into keys/vault.json and keys/server.gs (both local, never published).
import { createECDH } from 'node:crypto';
const e = createECDH('prime256v1'); e.generateKeys();
const b = x => x.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
console.log(JSON.stringify({ pub: b(e.getPublicKey()), priv: b(e.getPrivateKey()) }));
