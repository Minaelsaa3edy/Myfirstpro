'use strict';
/* every text the user can see from the native side */
const T = {
  licenseErr: {
    MALFORMED: 'كود التفعيل غير صحيح. انسخه كاملًا كما وصلك (يبدأ بـ MPD2).',
    BAD_SIGNATURE: 'كود التفعيل غير صالح (التوقيع لا يطابق).',
    WRONG_CHANNEL: 'هذا الكود لا يناسب هذه النسخة من البرنامج.',
    REVOKED: 'تم إيقاف هذا الكود. تواصل مع المطوّر.',
    TOO_LATE: 'انتهت المهلة المحددة لتفعيل هذا الكود. اطلب كودًا جديدًا من المطوّر.',
    EXPIRED: 'انتهت مدة هذا الكود. اطلب كودًا جديدًا من المطوّر. بياناتك محفوظة ويمكنك تصديرها.',
    CLOCK: 'تاريخ ووقت الجهاز رجعا للخلف. اضبط التاريخ والوقت ثم أعد التشغيل.',
    NO_KEY: 'هذا الكود لا يحتوي مفتاح التشغيل. اطلب كودًا جديدًا.',
    BAD_PAYLOAD: 'ملفات البرنامج تالفة أو معدّلة. أعد تثبيت البرنامج.',
    PLATFORM: 'هذا النظام غير مدعوم في هذه المرحلة. البرنامج يعمل على Windows فقط.',
    NONE: 'البرنامج غير مفعّل. أدخل كود التفعيل.',
    BAD_PASSWORD: 'كلمة مرور المطوّر غير صحيحة.',
    LOCKED_WAIT: 'محاولات كثيرة. انتظر نصف دقيقة ثم جرّب مرة أخرى.',
    NOT_UNLOCKED: 'أدخل كلمة مرور المطوّر أولًا.',
    BAD_INPUT: 'بيانات غير صحيحة.'
  },
  updateErr: {
    MALFORMED: 'ملف التحديث غير صالح.',
    BAD_SIGNATURE: 'توقيع التحديث غير صحيح — تم رفضه.',
    WRONG_CHANNEL: 'هذا التحديث لا يناسب هذه النسخة (إنتاج/مطوّر).',
    WRONG_PLATFORM: 'هذا التحديث لا يناسب هذا النظام.',
    SAME_VERSION: 'أنت تستخدم هذا الإصدار بالفعل.',
    DOWNGRADE: 'هذا إصدار أقدم من المثبّت — لا يُسمح بالرجوع لإصدار أقدم.',
    ROLLBACK: 'هذا التحديث أقدم من تحديث سبق قبوله — تم رفضه.',
    NEEDS_INTERMEDIATE: 'يلزم تثبيت إصدار وسيط أولًا قبل هذا التحديث.',
    SIZE_MISMATCH: 'حجم ملف التحديث لا يطابق المتوقع — تم رفضه.',
    HASH_MISMATCH: 'محتوى ملف التحديث غير مطابق للبصمة الموقّعة — تم رفضه.',
    INSECURE_URL: 'عنوان التحديث غير آمن (يلزم HTTPS) — تم رفضه.',
    NETWORK: 'تعذّر الاتصال بخادم التحديث. تأكد من الإنترنت أو استخدم «تحديث من ملف».',
    NOT_CONFIGURED: 'لم يتم ضبط عنوان التحديث. استخدم «تحديث من ملف».'
  },
  menu: {
    file: 'ملف', exportData: 'تصدير نسخة من البيانات…', openData: 'فتح مجلد البيانات', quit: 'خروج',
    edit: 'تحرير', view: 'عرض', fullscreen: 'ملء الشاشة',
    help: 'مساعدة', about: 'عن البرنامج', licenseInfo: 'معلومات الترخيص', checkUpdate: 'البحث عن تحديث…', updateFile: 'تحديث من ملف…',
    autoCheck: 'التحقق التلقائي من التحديثات عند التشغيل', dev: 'المطوّر', devtools: 'أدوات المطوّر', reload: 'إعادة تحميل', issuer: 'مولّد أكواد التفعيل…'
  }
};

/* ---- wording helpers (Latin digits everywhere so numbers look the same as the ones the user types) ---- */
const ONE = { minutes: 'دقيقة واحدة', hours: 'ساعة واحدة', days: 'يوم واحد' }, TWO = { minutes: 'دقيقتان', hours: 'ساعتان', days: 'يومان' };
const FEW = { minutes: 'دقائق', hours: 'ساعات', days: 'أيام' }, MANY = { minutes: 'دقيقة', hours: 'ساعة', days: 'يومًا' };
T.dur = (unit, n) => {
  if (unit === 'permanent') return 'دائم (بدون انتهاء)';
  if (n === 1) return ONE[unit]; if (n === 2) return TWO[unit];
  return n + ' ' + (n >= 3 && n <= 10 ? FEW[unit] : MANY[unit]);
};
T.remain = ms => { /* "3 ساعات و20 دقيقة" — at most two parts */
  const m = Math.max(0, Math.ceil(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mi = m % 60, parts = [];
  if (d) parts.push(T.dur('days', d)); if (h) parts.push(T.dur('hours', h)); if (mi && parts.length < 2 && !(d && h)) parts.push(T.dur('minutes', mi));
  if (!parts.length) parts.push('أقل من دقيقة');
  return parts.slice(0, 2).join(' و');
};
T.dt = ms => new Date(ms).toLocaleString('ar-EG-u-nu-latn', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
T.updated = (ver, prev) => 'تم تحديث البرنامج إلى الإصدار ' + ver + '. أدخل كود التفعيل مرة أخرى' + (prev ? ' (الكود السابق رقمه ' + prev + ')' : '') + ' — نفس الكود الذي معك، ومدته لا تبدأ من جديد.';
T.keepNotice = 'احتفظ بكود التفعيل في مكان آمن. عند أي تحديث للبرنامج سيطلب منك إدخاله مرة أخرى.';
T.codeLine = r => r.info.unit === 'permanent' ? 'كود دائم' : ('كود مؤقت (' + T.dur(r.info.unit, r.info.value) + ') — متبقي ' + T.remain(r.exp - r.now) + ' — ينتهي ' + T.dt(r.exp));
module.exports = T;
