"""Build the two sealed pages for a PUBLIC host (GitHub Pages):
  index.html  = the customer page for ANY code (demo or real program): shows only a box for the code
  dev.html    = the designer's copy (password), where the codes are made and stopped
plus ping.txt (a trusted clock for the time limits), sw.js + manifest.webmanifest + manifest-dev.webmanifest (phone alarms that ring while it is locked, Web Push) and the 6 public logo files (icon-32.png, icon-64.png, icon-192.png, icon-512.png, favicon.ico, apple-touch-icon.png). Nothing else is published.
usage:  DEVPW='long password' python3 tools/make_site.py --base https://USER.github.io/REPO/ --out DIR --server https://script.google.com/macros/s/…/exec [--keys keys]
        --reuse-dev OLD_dev.html   # release a new version WITHOUT the password: keeps the password slot (and the packed developer key blob) of the dev.html already published; needs the program keys unchanged (proved while sealing)
        --rotate real,demo,dev,vapid   # new content key(s) (vapid = the push identity: phones subscribe again by themselves): devices must enter a code again (real = real program, demo = demo program, dev = developer page)
Secrets (program keys, code-server admin key) live in <keys>/vault.json (local only, never published); keys/server.gs is the script for Google (also private: it holds the admin key)."""
import json, os, pathlib, secrets, subprocess, sys, shutil, re
R = pathlib.Path('/home/claude/accounts-app')
arg = lambda k, d=None: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d
KD = pathlib.Path(arg('--keys', str(R / 'keys'))); VF = KD / 'vault.json'
b64u = lambda b: __import__('base64').urlsafe_b64encode(b).decode().rstrip('=')
V = json.loads(VF.read_text()) if VF.exists() else {}
for k in ('kc', 'kt', 'kd'):
    if k not in V: V[k] = b64u(secrets.token_bytes(32))
for k in ('customers', 'revoked'): V.pop(k, None)  # the old "permanent customer code" list is gone for good
if 'srvkey' not in V: V['srvkey'] = b64u(secrets.token_bytes(24))  # the designer's private key for the code server
URLRE = r'(https://[\w./-]+|http://(?:localhost|127\.0\.0\.1):\d+/[\w./-]*)'
if arg('--server'):
    if not re.fullmatch(URLRE, arg('--server')): sys.exit('--server must be the https://script.google.com/macros/s/…/exec address')
    V['srv'] = arg('--server')
for r in (arg('--rotate') or '').split(','):
    if r == 'vapid': V.pop('vapid', None)  # new push identity: every phone subscribes again by itself the next time it opens the program
    elif r: V[{'real': 'kc', 'demo': 'kt', 'dev': 'kd'}[r]] = b64u(secrets.token_bytes(32))
if 'vapid' not in V: V['vapid'] = json.loads(subprocess.run(['node', str(R / 'tools/mkvapid.mjs')], check=True, capture_output=True, text=True).stdout)  # Web Push identity of the code server (the private half stays local)
VF.write_text(json.dumps(V, ensure_ascii=False, indent=1))
base = arg('--base'); out = pathlib.Path(arg('--out') or ''); pw = os.environ.get('DEVPW', '')
_pub = json.loads((KD / 'keys.json').read_text())['pub']  # the designer's PUBLIC signing key: the server uses it to check that a phone holds a genuine code
(KD / 'server.gs').write_text((R / 'tools/server.gs.tpl').read_text(encoding='utf-8').replace('@@ADMIN_KEY@@', V['srvkey']).replace('@@VAPID_PUB@@', V['vapid']['pub']).replace('@@VAPID_PRIV@@', V['vapid']['priv']).replace('@@VAPID_SUB@@', base or 'https://example.com/').replace('@@PUBKEY_X@@', _pub['x']).replace('@@PUBKEY_Y@@', _pub['y']), encoding='utf-8')
reuse = arg('--reuse-dev')
if not base or not base.endswith('/') or not arg('--out') or (len(pw) < 12 and not reuse): sys.exit('need --base https://…/ (trailing slash), --out DIR and DEVPW of 12+ characters')
if not V.get('srv'): sys.exit('need --server (the Apps Script web app address): codes cannot work without it')
out.mkdir(parents=True, exist_ok=True); W = R / '_work'; W.mkdir(exist_ok=True)
run = lambda *a, env=None: subprocess.run(list(a), check=True, env=env or os.environ, capture_output=True, text=True)
kd = str(KD)
if not reuse: run('node', str(R / 'tools/packdev.mjs'), str(KD / 'keys.json'), str(VF), env={**os.environ, 'DEVPW': pw})  # the developer blob also carries the two program keys + the server key
run('python3', str(R / 'build.py'), '--keys', kd, '--out', str(W / 'real'), '--gated', '--srv-url', V['srv'])
run('python3', str(R / 'build.py'), '--keys', kd, '--out', str(W / 'full'), '--site-url', base, '--srv-url', V['srv'])
run('python3', str(R / 'build_trial.py'), '--keys', kd, '--out', str(W / 'demo'), '--srv-url', V['srv'])
seal = lambda *a, env=None: json.loads(run('node', str(R / 'tools/seal.mjs'), *a, env=env).stdout)
r1 = seal('--kind', 'gate', '--out', str(out / 'index.html'), '--vid', 'g1', '--srv', V['srv'], '--blob', f"d:{W / 'demo/standalone.html'}:{V['kt']}", '--blob', f"r:{W / 'real/standalone.html'}:{V['kc']}")
r2 = seal('--kind', 'dev', '--in', str(W / 'full/standalone.html'), '--out', str(out / 'dev.html'), '--vid', 'd1', '--k', V['kd'], *(['--pass-from', reuse] if reuse else ['--passenv', 'DEVPW']), env={**os.environ, 'DEVPW': pw})
shutil.copy(W / 'demo/ping.txt', out / 'ping.txt')
(out / 'sw.js').write_text((R / 'tools/sw.js').read_text(encoding='utf-8').replace('@@VER@@', (R / 'version.txt').read_text().strip()), encoding='utf-8')  # the worker that shows an alarm notice (public: no secret in it)
_iv = __import__('hashlib').sha1(b''.join((R / 'src/icons' / n).read_bytes() for n in ('icon-192.png', 'icon-512.png'))).hexdigest()[:8]
(out / 'manifest.webmanifest').write_text(json.dumps({'name': 'برنامج المحاسبات لمواد البناء', 'short_name': 'المحاسبات', 'lang': 'ar', 'dir': 'rtl', 'id': './', 'start_url': './', 'scope': './', 'display': 'standalone', 'background_color': '#060a22', 'theme_color': '#060a22', 'icons': [{'src': f'icon-192.png?v={_iv}', 'sizes': '192x192', 'type': 'image/png', 'purpose': 'any'}, {'src': f'icon-512.png?v={_iv}', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any'}]}, ensure_ascii=False, indent=1), encoding='utf-8')  # lets a phone add the program to its home screen (the iPhone needs that for notifications)
(out / 'manifest-dev.webmanifest').write_text(json.dumps({'name': 'Mina.Dev — المطوّر', 'short_name': 'Mina.Dev', 'lang': 'ar', 'dir': 'rtl', 'id': './dev.html', 'start_url': './dev.html', 'scope': './', 'display': 'standalone', 'background_color': '#060a22', 'theme_color': '#060a22', 'icons': [{'src': f'icon-192.png?v={_iv}', 'sizes': '192x192', 'type': 'image/png', 'purpose': 'any'}, {'src': f'icon-512.png?v={_iv}', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any'}]}, ensure_ascii=False, indent=1), encoding='utf-8')  # the designer's own home-screen app (opens dev.html): its notifications are separate from the customer program's
(out / '.nojekyll').write_text('')
for f in sorted((R / 'src/icons').iterdir()): shutil.copy(f, out / f.name)  # tab/home-screen icons as real files (Safari ignores data: icons); the <link>s carry ?v=hash
print('sealed:', {'index': r1['bytes'], 'dev': r2['bytes']}, '-> pages: index.html (customers, any code), dev.html (designer)')
