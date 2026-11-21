import pathlib, sys, json
R=pathlib.Path('/home/claude/accounts-app'); S=R/'src'
arg=lambda k,d=None: sys.argv[sys.argv.index(k)+1] if k in sys.argv else d
D=pathlib.Path(arg('--out', str(R/'dist'))); D.mkdir(exist_ok=True)
KEYS=json.loads((pathlib.Path(arg('--keys', str(R/'keys')))/'keys.json').read_text())
CUSTOMER='--customer' in sys.argv  # plain customer copy (Mac app / EXE): no developer section, no signing key, no code check
GATED='--gated' in sys.argv  # the REAL program for the hosted site: customer copy + code check (locks, keeps the data, when the code ends or is stopped)
SRV_URL=arg('--srv-url','')  # code server (Apps Script web app) the developer page and the code check talk to
assert not SRV_URL or __import__('re').fullmatch(r'(https://[\w./-]+|http://(?:localhost|127\.0\.0\.1):\d+/[\w./-]*)', SRV_URL), 'bad --srv-url'
SITE_URL=arg('--site-url','')  # the customer page address (goes into the ready-made message in the developer section)
assert not SITE_URL or __import__('re').fullmatch(r'https?://[^\s"\'<>\\]+', SITE_URL), 'bad --site-url'
rd=lambda n:(S/n).read_text(encoding='utf-8')
EN_JSON=json.dumps(json.loads((R/'i18n/en.json').read_text(encoding='utf-8')),ensure_ascii=False,separators=(',',':')).replace('</','<\\/')  # English texts (see tools/i18n_extract.mjs)
MODULES=['10-icons.js','05-crypto.js','06-token.js','00-core.js','01-i18n.js','02-util.js','03-xlsx.js','20-screens.js','30-invoice.js','34-bookings.js','35-alarms.js','39-push.js','37-automation.js','36-expenses.js','38-reports.js','40-other.js','42-ops.js','44-stock.js','45-pay.js','46-sales.js','47-pdf.js','48-docs.js','49-staff.js','50-users.js','51-lists.js','52-import.js','53-vouchers.js','dev/10-dev.js','99-boot.js']
assert not (CUSTOMER and GATED), 'choose --customer or --gated'
def js_str(s):  # JS string literal that is safe inside an inline <script>
    return json.dumps(s,ensure_ascii=False).replace('</','<\\/').replace('<!--','<\\!--')
def mod(f):
    t=rd(f)
    if f=='06-token.js': t=t.replace('/*PUBKEY*/null', json.dumps(KEYS['pub']))
    if f=='01-i18n.js': t=t.replace('/*I18N*/null', EN_JSON)
    if f=='39-push.js': t=t.replace('@@PUSH_SRV@@', SRV_URL).replace('/*PUSHDEV*/false', 'true' if 'dev/10-dev.js' in MODULES else 'false')  # empty server = no push (test builds without one); PUSH_DEV: the designer's own page (it has the developer section) gets its own push storage and worker scope
    if f=='dev/10-dev.js':
        t=t.replace('/*DEVBLOB*/null', json.dumps(KEYS['dev'])).replace('@@SITE_URL@@', SITE_URL).replace('@@SRV_URL@@', SRV_URL)
    if f=='gx.js': t=t.replace("'@@GX_SCENE@@'", js_str(rd('scene.html').strip())).replace("'@@GX_MARK@@'", js_str(rd('mark.html').strip()))
    if f=='real/90-real.js':
        t=t.replace('@@TRIAL_SRV@@', SRV_URL).replace('@@VER@@', (R/'version.txt').read_text().strip())
    return t
css=rd('tokens.css')+rd('style.css')
if CUSTOMER: MODULES=[m for m in MODULES if m not in ('06-token.js','dev/10-dev.js','39-push.js')]  # the offline copies have no code and no server: no push
if GATED:
    MODULES=[m for m in MODULES if m not in ('dev/10-dev.js','99-boot.js')]+['gx.js','real/90-real.js']; css+=rd('trial/trial.css')+rd('scene.css')
js="(function(){\n'use strict';\n"+"\n".join(mod(f) for f in MODULES)+"\n})();"
VER=(R/'version.txt').read_text().strip()
title="النسخة الأولى التجريبية لبرنامج المحاسبات لمواد البناء"
fonts='<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap">'
body=f'<div id="app" dir="rtl" lang="ar"><main id="view"></main><footer class="credit">تصميم بواسطة <bdi dir="ltr">MINA.N.F</bdi><span class="sep">·</span><bdi dir="ltr" class="ver">Version {VER}</bdi></footer></div><div id="toasts" dir="rtl" aria-live="polite"></div><div id="modals" dir="rtl"></div>\n<script>\n{js}\n</script>'
icons=(R/'src/icons.html').read_text(encoding='utf-8').strip()  # tab icon + home-screen icon (tools/mkicon.py)
pwa=f'<link rel="manifest" href="{"manifest.webmanifest" if GATED else "manifest-dev.webmanifest"}"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="{"المحاسبات" if GATED else "Mina.Dev"}"><meta name="theme-color" content="#060a22">' if (GATED or SITE_URL) else ''  # installable on a phone's home screen (needed by the iPhone for push); only the hosted-site pages
head=f'<title>{title}</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n{icons}{pwa}\n{fonts}\n<style>\n{css}\n</style>\n'
(D/'page.html').write_text(head+body,encoding='utf-8')
std=f'<!doctype html>\n<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{{margin:0}}</style>\n'+head+'</head><body>\n'+body+'\n</body></html>'
(D/'standalone.html').write_text(std,encoding='utf-8')
print('ok',D,len(head+body),'v'+VER,'customer' if CUSTOMER else 'gated' if GATED else 'full')
