# builds web/ for the browser test: the program (with a hook to look inside) + the real sw.js
import pathlib, re, subprocess, sys
S = pathlib.Path(__file__).resolve().parent; R = pathlib.Path('/home/claude/accounts-app')
subprocess.run(['python3', str(R / 'build.py'), '--out', str(S / 'dist'), '--srv-url', 'http://localhost:8790/srv'], check=True, capture_output=True)
t = (S / 'dist/standalone.html').read_text(encoding='utf-8'); k = t.rfind('})();')
hook = ";window.__t={get db(){return db},render,save,go,pushEnt,pushWatch,pushEnable,pushDisable,pushTest,pushCan,pushStat,pushToken,pushDev,pushIsOn,pushClear,alarmTick,alarmBack,get ring(){return alarmRing},get pushMsg(){return pushMsg},get pushBusy(){return pushBusy},pushSub,pushKey,pushCalib,pushLead,pushHands,pushPhone};\n"
(S / 'web').mkdir(exist_ok=True)
assert 'PUSH_DEV = true,' in t; tc = t.replace('PUSH_DEV = true,', 'PUSH_DEV = false,')  # the full build is the designer's page (PUSH_DEV); this copy behaves like the customer program
(S / 'web/index.html').write_text(tc[:k] + hook + tc[k:], encoding='utf-8')
# the designer's page: built with the test keys (their password is test-password-12345) and its own server port
subprocess.run(['python3', str(R / 'build.py'), '--out', str(S / 'dist-dev'), '--keys', str(S / 'testkeys'), '--srv-url', 'http://localhost:8791/srv', '--site-url', 'http://localhost:8791/'], check=True, capture_output=True)
td = (S / 'dist-dev/standalone.html').read_text(encoding='utf-8'); kd = td.rfind('})();'); assert 'PUSH_DEV = true,' in td
(S / 'webdev').mkdir(exist_ok=True)
(S / 'webdev/index.html').write_text(td[:kd] + hook.replace('pushSub,pushKey,pushCalib,pushLead}', 'pushSub,pushKey,pushCalib,pushLead,devUnlock}') + td[kd:], encoding='utf-8')
for d in ('web', 'webdev'):
    (S / d / 'sw.js').write_text((R / 'tools/sw.js').read_text(encoding='utf-8').replace('@@VER@@', 'test'), encoding='utf-8')
    for f in ('icon-192.png', 'icon-64.png'): (S / d / f).write_bytes((R / 'src/icons' / f).read_bytes())
print('web ok')
