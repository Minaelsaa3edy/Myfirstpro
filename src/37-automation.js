/* ---------- WhatsApp automation (n8n) ----------
   The customer's own n8n does the work (it sends through the WhatsApp Business Cloud API, receives the replies and runs the AI); the program only POSTs a small
   JSON to the webhook address he pastes here. Nothing about WhatsApp itself (its token, its number id) is kept in the program, and the settings stay on this device
   (they are not part of a backup file). Sending goes out through the same «إرسال واتساب» buttons: with the automation on, they can hand the message to n8n. */
Object.assign(AUD, { auto_save: 'حفظ إعدادات أتمتة الواتساب', auto_send: 'إرسال عبر أتمتة الواتساب' });
const AUTO_EVT = { 'فاتورة': 'invoice', 'كشف حساب عميل': 'statement', 'عرض سعر': 'quotation', 'إذن تسليم': 'delivery' };
const AUTO_EVT_NAME = { test: 'تجربة اتصال', message: 'رسالة يدوية', invoice: 'فاتورة', statement: 'كشف حساب', quotation: 'عرض سعر', delivery: 'إذن تسليم', document: 'مستند' };
const autoCfg = () => { const A = db.auto = Object.assign({ on: false, url: '', hdr: 'X-API-Key', key: '', number: '', mode: 'ask', pdf: true, log: [] }, db.auto || {}); if (!Array.isArray(A.log)) A.log = []; return A; };
const autoIsTrial = () => typeof TRIAL !== 'undefined'; /* the demo has fake data: it never talks to anybody's n8n */
const autoUrlOk = u => /^https:\/\/[^\s/]+\/\S*$/i.test(u || '') || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/\S*$/i.test(u || ''); /* https only (plain http just for a test on this computer) */
const autoHdrOk = h => /^[A-Za-z0-9-]{1,40}$/.test(h || '');
const fileB64 = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
const autoBase = (event, extra, number) => Object.assign({ app: 'Mina.Dev', event, id: uid(), at: new Date().toISOString(), from: waPhone(number != null ? number : autoCfg().number), facility: facName() }, extra);
async function autoPost(url, hdr, key, body) { /* one POST to the webhook: { ok, st (http status, 0 = no answer), why } */
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 30000), h = { 'Content-Type': 'application/json' };
  if (key) h[hdr || 'X-API-Key'] = key;
  try {
    const r = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify(body), signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    return { ok: r.ok, st: r.status, why: r.ok ? '' : String(r.status) };
  } catch (e) { return { ok: false, st: 0, why: e && e.name === 'AbortError' ? 'timeout' : 'network' }; } finally { clearTimeout(tm); }
}
const autoWhy = r => r.ok ? '' : r.why === 'timeout' ? 'انتهت المهلة (30 ثانية) ولم يرد n8n'
  : r.st === 0 ? 'تعذّر الوصول للرابط: تأكد من الرابط ومن الإنترنت، وأن الـ workflow مفعّل (Active)'
  : r.st === 401 || r.st === 403 ? 'رفض n8n المفتاح: راجع اسم الهيدر والمفتاح السري'
  : r.st === 404 ? 'الرابط غير موجود: استخدم Production URL وتأكد أن الـ workflow مفعّل' : 'رد n8n بخطأ ' + r.st;
function autoLog(ev, to, nm, r) { const A = autoCfg(); A.log.unshift({ t: Date.now(), ev, to, nm: nm || '', ok: !!r.ok, st: r.st, why: autoWhy(r) }); A.log.length = Math.min(A.log.length, 60); logA('auto_send', `${T(AUTO_EVT_NAME[ev] || ev)}${nm ? ' — ' + nm : ''}${r.ok ? '' : ' (فشل)'}`); save(); }

/* ----- the buttons «إرسال واتساب»: with the automation on, hand the message (and the PDF) to n8n ----- */
function autoAsk(o) { /* 'auto' | 'manual' | null (cancelled) */
  return new Promise(res => {
    const to = waPhone(o.phone);
    modal(`<h3>إرسال واتساب</h3><p class="msg">${esc(o.what || '')}${to ? ` — <bdi dir="ltr">${esc(to)}</bdi>` : ''}</p>
      <div class="actions"><button class="btn" data-a type="button">إرسال تلقائي عبر n8n</button><button class="btn outline" data-m type="button">فتح واتساب وأرسل بنفسي</button><button class="btn ghost" data-no type="button">إلغاء</button></div>`, (d, close) => {
      $('[data-a]', d).onclick = () => { close(); res('auto'); }; $('[data-m]', d).onclick = () => { close(); res('manual'); }; $('[data-no]', d).onclick = () => { close(); res(null); };
    }, () => res(null));
  });
}
async function autoDocFile(o) { /* the PDF of the paper (the same file the share button makes) */
  const key = pdfKey(o.base, o.no, o.html); let f = PDF_CACHE.get(key) || null;
  if (!f) { try { f = await paperPdf(o.html, pdfName(o.base, o.no)); PDF_CACHE.set(key, f); } catch (e) { f = null; } }
  return f;
}
async function autoSendDoc(o) {
  const A = autoCfg(), to = waPhone(o.phone);
  if (!to) return toast('رقم العميل غير مكتوب أو غير صحيح');
  toast('جاري الإرسال عبر n8n…');
  let doc = null; if (A.pdf) { try { const f = await autoDocFile(o); if (f) doc = { name: f.name, mime: 'application/pdf', base64: await fileB64(f) }; } catch (e) { doc = null; } }
  const ev = AUTO_EVT[o.base] || 'document', r = await autoPost(A.url, A.hdr, A.key, autoBase(ev, { to, name: o.what || '', text: o.full || o.cap || '', caption: o.cap || '', doc }));
  autoLog(ev, to, o.what, r);
  if (r.ok) toast('تم إرسال الطلب إلى n8n', 'ok'); else toast(autoWhy(r));
}
async function autoRoute(o) { /* true = handled here (sent, or cancelled); false = carry on with the normal WhatsApp window */
  const A = autoCfg(); if (autoIsTrial() || !A.on || !autoUrlOk(A.url)) return false;
  const how = A.mode === 'auto' ? 'auto' : await autoAsk(o);
  if (how === null) return true; if (how === 'manual') return false;
  await autoSendDoc(o); return true;
}

/* ----- the n8n file he imports once (Workflows ▸ Import from file) -----
   Verified on a real n8n 2.x: header-key auth, CORS preflight with the custom header, test / text / document branches.
   Credentials and the sender phone number are left empty on purpose: he picks his own inside n8n. */
function autoWorkflow() {
  const B = "$('Mina.Dev Webhook').item.json.body", id = n => '6c1f0a10-0000-4000-8000-0000000000' + n;
  const cond = (n, left, right, op) => ({ options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ id: id(n), leftValue: left, rightValue: right, operator: op }], combinator: 'and' });
  const wa = (n, name, pos, extra) => ({ parameters: Object.assign({ operation: 'send', phoneNumberId: '', recipientPhoneNumber: '={{ ' + B + '.to }}' }, extra), id: id(n), name, type: 'n8n-nodes-base.whatsApp', typeVersion: 1.1, position: pos });
  const reply = (n, name, pos, msg) => ({ parameters: { respondWith: 'json', responseBody: '={{ { ok: true, message: "' + msg + '" } }}', options: {} }, id: id(n), name, type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: pos });
  const link = (to, i) => ({ node: to, type: 'main', index: i || 0 });
  return {
    name: 'Mina.Dev - WhatsApp sender',
    nodes: [
      { parameters: { content: '## Mina.Dev - WhatsApp sender\n\n1. Open **Mina.Dev Webhook** and choose (or create) a **Header Auth** credential: the header name and value must be the same as in the Mina.Dev app.\n2. Open both **WhatsApp** nodes, choose your **WhatsApp Business Cloud** credential and pick the **Sender Phone Number**.\n3. Activate the workflow, copy the **Production URL** of the webhook and paste it into Mina.Dev (Settings > WhatsApp automation).\n\nNote: WhatsApp only lets a business send free-form messages and documents to people who wrote to it in the last 24 hours. Otherwise use an approved template message.', height: 300, width: 520 }, id: id('01'), name: 'Read me', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [-380, -40] },
      { parameters: { httpMethod: 'POST', path: 'mina-dev-whatsapp', authentication: 'headerAuth', responseMode: 'responseNode', options: { allowedOrigins: '*' } }, id: id('02'), name: 'Mina.Dev Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [240, 160], webhookId: id('a1') },
      { parameters: { conditions: cond('b1', '={{ $json.body.event }}', 'test', { type: 'string', operation: 'equals' }), options: {} }, id: id('03'), name: 'Is it a test?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [460, 160] },
      reply('04', 'Reply: connected', [700, 40], 'connected'),
      { parameters: { conditions: cond('b2', '={{ !!$json.body.doc }}', '', { type: 'boolean', operation: 'true', singleValue: true }), options: {} }, id: id('05'), name: 'Has a document?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [700, 280] },
      { parameters: { operation: 'toBinary', sourceProperty: 'body.doc.base64', binaryPropertyName: 'data', options: { fileName: '={{ $json.body.doc.name }}', mimeType: '={{ $json.body.doc.mime }}' } }, id: id('06'), name: 'Base64 to file', type: 'n8n-nodes-base.convertToFile', typeVersion: 1.1, position: [940, 180] },
      Object.assign(wa('07', 'WhatsApp: send document', [1160, 180], { messageType: 'document', mediaPath: 'useMedian8n', mediaPropertyName: 'data', additionalFields: { mediaCaption: '={{ ' + B + '.caption }}' } }), { webhookId: id('a2') }),
      Object.assign(wa('08', 'WhatsApp: send text', [940, 400], { textBody: '={{ ' + B + '.text }}' }), { webhookId: id('a3') }),
      reply('09', 'Reply: sent', [1400, 280], 'sent')
    ],
    connections: {
      'Mina.Dev Webhook': { main: [[link('Is it a test?')]] },
      'Is it a test?': { main: [[link('Reply: connected')], [link('Has a document?')]] },
      'Has a document?': { main: [[link('Base64 to file')], [link('WhatsApp: send text')]] },
      'Base64 to file': { main: [[link('WhatsApp: send document')]] },
      'WhatsApp: send document': { main: [[link('Reply: sent')]] },
      'WhatsApp: send text': { main: [[link('Reply: sent')]] }
    },
    active: false, settings: { executionOrder: 'v1' }, pinData: {}, meta: { templateCredsSetupCompleted: false }
  };
}

function autoDownloadWf() { downloadFile('mina-dev-whatsapp.n8n.json', JSON.stringify(autoWorkflow(), null, 2), 'application/json'); toast('تم تحميل ملف n8n', 'ok'); }

/* ----- the screen: Settings ▸ أتمتة الواتساب (n8n) ----- */
screens.setAuto = (p, v) => {
  const head = subHead('أتمتة الواتساب (n8n)');
  if (autoIsTrial()) { v.innerHTML = head + '<section class="panel"><p class="msg">هذا القسم غير متاح في النسخة التجريبية.</p></section>'; return; }
  const A = autoCfg();
  v.innerHTML = head + `<div class="stack">
    <section class="panel"><h2 class="panel-t">ربط n8n</h2>
      <p class="lbl" style="margin:0 0 12px;line-height:1.9">n8n الخاص بك هو اللي بيبعت على واتساب ويستقبل الردود ويشغّل الذكاء الاصطناعي. البرنامج بيبعت له الفاتورة أو كشف الحساب أو أي رسالة على رابط الـ Webhook. ربط الرقم بواتساب نفسه (WhatsApp Business Cloud API) بيتم جوه n8n، ورقم الواتساب هنا بيتبعت لـ workflow بس.</p>
      <div class="form-grid">
        <div class="field"><label for="au-url">رابط الـ Webhook (Production URL)</label><input id="au-url" class="inp" dir="ltr" inputmode="url" placeholder="https://n8n.example.com/webhook/mina-dev-whatsapp" autocomplete="off" value="${esc(A.url)}"></div>
        <div class="field"><label for="au-hdr">اسم الهيدر</label><input id="au-hdr" class="inp" dir="ltr" autocomplete="off" value="${esc(A.hdr)}"></div>
        <div class="field"><label for="au-key">المفتاح السري</label><div style="display:flex;gap:8px;align-items:center"><input id="au-key" class="inp" dir="ltr" type="password" autocomplete="off" style="flex:1" value="${esc(A.key)}"><button class="mini" id="au-eye" type="button">إظهار</button></div></div>
        <div class="field"><label for="au-num">رقم الواتساب المُرسِل</label><input id="au-num" class="inp" dir="ltr" inputmode="tel" placeholder="+20 10 0000 0000" autocomplete="off" value="${esc(A.number)}"></div>
        <div class="field"><label for="au-mode">عند الضغط على «إرسال واتساب»</label><div class="sel"><select id="au-mode"><option value="ask">اسألني كل مرة (تلقائي أو يدوي)</option><option value="auto">أرسل تلقائياً عبر n8n دائماً</option></select></div></div>
      </div>
      <div class="field" style="margin-top:12px"><label class="chk"><input type="checkbox" id="au-pdf"${A.pdf ? ' checked' : ''}><i>${ICON.check}</i><span>إرفاق ملف PDF مع الفواتير والكشوفات</span></label></div>
      <div class="field"><label class="chk"><input type="checkbox" id="au-on"${A.on ? ' checked' : ''}><i>${ICON.check}</i><span>تفعيل الإرسال عبر n8n</span></label></div>
      <div class="actions" style="margin-top:10px"><button class="btn" id="au-save" type="button">${ICON.save}<span>حفظ</span></button><button class="btn outline" id="au-test" type="button">جرّب الاتصال</button><button class="btn ghost" id="au-wf" type="button">تحميل ملف n8n الجاهز</button></div>
      <p class="lbl" id="au-res" style="margin:12px 0 0;line-height:1.8"></p>
    </section>
    <section class="panel"><h2 class="panel-t">طريقة الربط</h2>
      <ol class="lbl" style="margin:0;padding-inline-start:20px;line-height:2.1"><li>في n8n: Workflows ثم Import from file واختر ملف n8n الجاهز.</li><li>في نودَي الواتساب: اربط حساب WhatsApp Business Cloud واختار رقم الإرسال Sender Phone Number. وفي نود الـ Webhook: اعمل حساب Header Auth (اسم الهيدر والمفتاح زي اللي هنا).</li><li>فعّل الـ workflow (Active) وانسخ Production URL والصقه هنا.</li><li>اضغط «جرّب الاتصال» ثم «حفظ».</li></ol>
      <p class="lbl" style="margin:10px 0 0;line-height:1.9">ملاحظة من واتساب: الرسائل والملفات الحرة بتوصل بس لو العميل كلّمك خلال آخر 24 ساعة؛ غير كده لازم رسالة Template معتمدة من ميتا.</p>
    </section>
    <section class="panel"><h2 class="panel-t">إرسال رسالة يدوية</h2>
      <div class="form-grid"><div class="field"><label for="au-to">رقم المستلم</label><input id="au-to" class="inp" dir="ltr" inputmode="tel" placeholder="01000000000" autocomplete="off"></div></div>
      <div class="field" style="margin-top:10px"><label for="au-tx">الرسالة</label><textarea id="au-tx" class="inp" rows="3" style="height:auto;min-height:84px;padding-block:10px"></textarea></div>
      <div class="actions" style="margin-top:10px"><button class="btn" id="au-send" type="button">إرسال عبر n8n</button></div>
    </section>
    <section class="panel" id="au-logbox"></section></div>`;
  $('#au-mode').value = A.mode === 'auto' ? 'auto' : 'ask';
  const drawLog = () => {
    const L = autoCfg().log, EV = e => T(AUTO_EVT_NAME[e] || e), dt = t => new Date(t).toLocaleString(LOC, { dateStyle: 'short', timeStyle: 'short' });
    $('#au-logbox').innerHTML = '<h2 class="panel-t">سجل الإرسال</h2>' + (L.length ? `<div class="tbl-wrap"><table class="grid cardt"><thead><tr><th>الوقت</th><th>النوع</th><th>المستلم</th><th>النتيجة</th></tr></thead><tbody>${L.map(e => `<tr>
      <td data-l="الوقت">${esc(dt(e.t))}</td><td data-l="النوع">${esc(EV(e.ev))}${e.nm ? `<br><small class="muted">${esc(e.nm)}</small>` : ''}</td><td data-l="المستلم" dir="ltr">${esc(e.to || '')}</td>
      <td data-l="النتيجة">${e.ok ? '<span style="color:var(--green, #15803d);font-weight:700">تم إرسال الطلب إلى n8n</span>' : `<span style="color:var(--red-t, #c62828)">${esc(T(e.why || 'فشل'))}</span>`}</td></tr>`).join('')}</tbody></table></div>
      <div class="actions" style="margin-top:10px"><button class="btn outline" id="au-clr" type="button">مسح السجل</button></div>` : '<div class="none">لا توجد رسائل مرسلة بعد.</div>');
    const clr = $('#au-clr'); if (clr) clr.onclick = async () => { if (!await confirmBox('', 'مسح سجل الإرسال؟', 'مسح')) return; autoCfg().log = []; save(); drawLog(); };
  };
  drawLog();
  const rd = () => ({ url: $('#au-url').value.trim(), hdr: $('#au-hdr').value.trim() || 'X-API-Key', key: $('#au-key').value.trim(), number: $('#au-num').value.trim(), mode: $('#au-mode').value, pdf: $('#au-pdf').checked, on: $('#au-on').checked });
  const bad = F => !autoUrlOk(F.url) ? 'الرابط لازم يكون بصيغة https://…' : !autoHdrOk(F.hdr) ? 'اسم الهيدر حروف إنجليزية وأرقام وشرطة فقط' : '';
  const say = (m, ok) => { const r = $('#au-res'); r.textContent = m; r.style.color = ok ? 'var(--green, #15803d)' : 'var(--red-t, #c62828)'; };
  $('#au-eye').onclick = () => { const k = $('#au-key'), s = k.type === 'password'; k.type = s ? 'text' : 'password'; $('#au-eye').textContent = T(s ? 'إخفاء' : 'إظهار'); };
  $('#au-wf').onclick = autoDownloadWf;
  $('#au-test').onclick = async () => {
    const F = rd(), e = bad(F); if (e) return say(e, false);
    const b = $('#au-test'); b.disabled = true; say('جاري الاتصال…', true);
    const r = await autoPost(F.url, F.hdr, F.key, autoBase('test', {}, F.number)); b.disabled = false;
    say(r.ok ? 'الاتصال شغّال: n8n رد بنجاح.' : autoWhy(r), r.ok);
  };
  $('#au-save').onclick = async () => {
    const F = rd(); if (F.on || F.url) { const e = bad(F); if (e) return say(e, false); }
    if (!await requireAdmin()) return;
    Object.assign(autoCfg(), F); logA('auto_save', F.on ? 'تفعيل' : 'إيقاف'); save(); say('تم الحفظ.', true); toast('تم حفظ الإعدادات', 'ok');
  };
  $('#au-send').onclick = async () => {
    const F = rd(), e = bad(F); if (e) return say(e, false);
    const to = waPhone($('#au-to').value), text = $('#au-tx').value.trim();
    if (!to) return toast('اكتب رقم المستلم'); if (!text) return toast('اكتب الرسالة');
    const b = $('#au-send'); b.disabled = true;
    const r = await autoPost(F.url, F.hdr, F.key, autoBase('message', { to, name: '', text, caption: text, doc: null }, F.number)); b.disabled = false;
    autoLog('message', to, '', r); if (r.ok) { toast('تم إرسال الطلب إلى n8n', 'ok'); $('#au-tx').value = ''; } else toast(autoWhy(r)); drawLog();
  };
};
