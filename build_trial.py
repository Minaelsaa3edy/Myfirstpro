"""Build the trial site: same program, made-up data, runs only with a signed trial link (the length comes from the link), minified.
usage: python3 build_trial.py [--keys DIR] [--out DIR]"""
import pathlib, subprocess, sys, time, tempfile, json
R = pathlib.Path('/home/claude/accounts-app'); S = R / 'src'
ESB = '/tmp/claude-0/-home-claude/b5b8d7c6-a5d4-5acd-85dc-c84321a81c40/scratchpad/min/node_modules/.bin/esbuild'
arg = lambda k, d=None: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d
VER = (R / 'version.txt').read_text().strip()
PUB = json.loads((pathlib.Path(arg('--keys', str(R / 'keys'))) / 'keys.json').read_text())['pub']
out = pathlib.Path(arg('--out', str(R / 'dist-trial'))); out.mkdir(exist_ok=True)
rd = lambda n: (S / n).read_text(encoding='utf-8')

def patch(src, pairs):
    for a, b in pairs:
        assert src.count(a) == 1, (src.count(a), a[:60]); src = src.replace(a, b)
    return src

core = patch(rd('00-core.js'), [("const KEY = 'accounts.trial.v1';", "const KEY = 'accounts.demo.v1';"), ("let db = loadDB() || seed();", "let db = loadDB() || seedDemo();")])
other = patch(rd('40-other.js'), [
    ("يحتوي التطبيق الآن على صنف تجريبي (حديد، 100 طن). امسح البيانات قبل بدء العمل الفعلي.", "كل البيانات هنا وهمية للتجربة فقط، وتُمسح تلقائياً عند انتهاء المدة."),
    ("db = seed();", "db = seedDemo();"),
])
SRV = arg('--srv-url', '')
assert not SRV or __import__('re').fullmatch(r'(https://[\w./-]+|http://(?:localhost|127\.0\.0\.1):\d+/[\w./-]*)', SRV), 'bad --srv-url'
trial = rd('trial/90-trial.js').replace('@@VER@@', VER).replace('@@TRIAL_SRV@@', SRV); assert VER in trial
js_str = lambda x: json.dumps(x, ensure_ascii=False).replace('</', '<\\/').replace('<!--', '<\\!--')
gx = rd('gx.js').replace("'@@GX_SCENE@@'", js_str(rd('scene.html').strip())).replace("'@@GX_MARK@@'", js_str(rd('mark.html').strip())); assert '@@' not in gx
tok = rd('06-token.js').replace('/*PUBKEY*/null', json.dumps(PUB)); assert PUB['x'] in tok
EN_JSON = json.dumps(json.loads((R / 'i18n/en.json').read_text(encoding='utf-8')), ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
i18n = rd('01-i18n.js').replace('/*I18N*/null', EN_JSON)
parts = [rd('10-icons.js'), rd('05-crypto.js'), tok, core, i18n, rd('02-util.js'), rd('03-xlsx.js'), rd('trial/01-demo.js'), rd('20-screens.js'), rd('30-invoice.js'), rd('34-bookings.js'), rd('35-alarms.js'), rd('37-automation.js'), rd('36-expenses.js'), rd('38-reports.js'), other, rd('42-ops.js'), rd('44-stock.js'), rd('45-pay.js'), rd('46-sales.js'), rd('47-pdf.js'), rd('48-docs.js'), rd('49-staff.js'), rd('50-users.js'), rd('51-lists.js'), rd('52-import.js'), rd('53-vouchers.js'), gx, trial]
js = "(function(){\n'use strict';\n" + "\n".join(parts) + "\n})();"
css = rd('tokens.css') + rd('style.css') + rd('trial/trial.css') + rd('scene.css')
def esb(text, loader):
    r = subprocess.run([ESB, '--minify', f'--loader={loader}', '--target=es2020', '--charset=utf8'], input=text.encode('utf-8'), capture_output=True)
    assert r.returncode == 0, r.stderr.decode()
    return r.stdout.decode('utf-8')
js_m, css_m = esb(js, 'js'), esb(css, 'css')
title = 'تجربة برنامج المحاسبات لمواد البناء'
fonts = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap">'
body = '<div id="app" dir="rtl" lang="ar"><main id="view"></main><footer class="credit">تصميم بواسطة <bdi dir="ltr">MINA.N.F</bdi><span class="sep">·</span><bdi dir="ltr" class="ver">Version ' + VER + '</bdi></footer></div><div id="toasts" dir="rtl" aria-live="polite"></div><div id="modals" dir="rtl"></div>\n<script>' + js_m + '</script>'
icons = rd('icons.html').strip()  # tab icon + home-screen icon (tools/mkicon.py)
head = f'<title>{title}</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n{icons}\n{fonts}\n<style>{css_m}</style>\n'
(out / 'page.html').write_text(head + body, encoding='utf-8')
(out / 'standalone.html').write_text('<!doctype html>\n<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}</style>\n' + head + '</head><body>\n' + body + '\n</body></html>', encoding='utf-8')
(out / 'ping.txt').write_text('ok\n')
print('built', out, 'v' + VER, 'size', (out / 'page.html').stat().st_size)
