/* ---------- Navigation: Permanent Sidebar + Mobile Bottom Nav ---------- */

const TILES = [
  /* daily operations first, then financials, then management */
  ['invMenu', 'فاتورة جديدة', 'invoice'], ['debts', 'الديون والتحصيل', 'debts'], ['expenses', 'المصروفات والموردين', 'expenses'],
  ['inventory', 'المخزن', 'stock'], ['customers', 'العملاء', 'customers'], ['empMenu', 'الموظفين', 'staff'],
  ['reports', 'التقارير وحركة اليوم', 'reports'], ['cheques', 'الشيكات', 'cheque'], ['dashboard', 'لوحة الأرقام', 'dash'],
  ['reminders', 'المنبّهات', 'alarm'], ['settings', 'الإعدادات', 'settings'],
];

/* Sub-items for menu screens that expand inside the sidebar */
const PSB_SUBS = {
  invMenu: [
    { label: 'عميل جديد',           screen: 'invForm',   p: {mode:'new'},    icon: 'userPlus' },
    { label: 'عميل مسجل مسبقاً',   screen: 'invPick',   p: {},              icon: 'userCheck' },
    { label: 'بيع نقدي مباشر',      screen: 'invForm',   p: {mode:'cash'},   icon: 'cashSale' },
    { label: 'إيداع حجز',           screen: 'bookings',  p: {},              icon: 'booking' },
    { label: 'فواتير',              screen: 'invList',   p: {},              icon: 'docs' },
    { label: 'عروض الأسعار',         screen: 'quotes',    p: {},              icon: 'docDollar' },
    { label: 'التوصيل',             screen: 'deliveries',p: {},              icon: 'truck' },
    { label: 'صور وإشعارات العملاء',screen: 'receipts',  p: {},              icon: 'rcpt' },
  ],
  empMenu: [
    { label: 'موظف جديد',           screen: 'empForm',   p: {mode:'new'},    icon: 'userPlus' },
    { label: 'سجل الموظفين',        screen: 'empList',   p: {},              icon: 'staff' },
    { label: 'الرواتب',             screen: 'payroll',   p: {},              icon: 'reports' },
  ],
};

let _psbOpenSub = null; /* which TILE is currently expanded */

function buildPermSidebar() {
  const sb = document.getElementById('perm-sb');
  if (!sb) return;
  sb.innerHTML = `
    <div class="sb-brand">
      <div class="sb-mark">M</div>
      <div><div class="sb-title">Mina.Dev</div><div class="sb-sub">مواد البناء</div></div>
    </div>
    <div class="psb-nav" id="psb-nav"></div>`;
  renderPsbNav();

  function handleNav(e) {
    const btn = e.target.closest('.psb-item');
    const sub = e.target.closest('.psb-sub-item');
    const back = e.target.closest('.psb-back-btn');
    if (back) { e.preventDefault(); _psbOpenSub = null; renderPsbNav(); return; }
    if (sub) {
      e.preventDefault();
      const s = sub.dataset.screen, p = JSON.parse(sub.dataset.p || '{}');
      go(s, p);
      return;
    }
    if (!btn) return;
    e.preventDefault();
    const screen = btn.dataset.screen;
    if (PSB_SUBS[screen]) {
      /* toggle sub-list */
      _psbOpenSub = (_psbOpenSub === screen) ? null : screen;
      renderPsbNav();
      go(screen); /* also navigate to the menu screen */
    } else {
      _psbOpenSub = null;
      renderPsbNav();
      go(screen);
    }
  }
  sb.addEventListener('click', handleNav);
  sb.addEventListener('touchend', e => { handleNav(e); }, { passive: false });
}

function renderPsbNav() {
  const nav = document.getElementById('psb-nav');
  if (!nav) return;
  nav.innerHTML = TILES.map(([screen, label, icon]) => {
    const svgIcon = ICON[icon] || ICON.invoice;
    const hasSubs = !!PSB_SUBS[screen];
    const isOpen = _psbOpenSub === screen;
    let html = `<button class="psb-item" data-screen="${screen}" title="${label}" aria-label="${label}">
      ${svgIcon}<span>${label}</span></button>`;
    if (hasSubs && isOpen) {
      html += `<div class="psb-sub-list open">
        <button class="psb-back-btn">← رجوع</button>` +
        PSB_SUBS[screen].map(s => {
          const ic = ICON[s.icon] || '';
          return `<button class="psb-sub-item" data-screen="${s.screen}" data-p='${JSON.stringify(s.p)}' title="${s.label}">${ic}<span>${s.label}</span></button>`;
        }).join('') + `</div>`;
    }
    return html;
  }).join('');
}

buildPermSidebar();

/* ===== Mobile Bottom Navigation ===== */
(function buildMobNav() {
  /* First 5 tiles go in the bar, rest in "More" sheet */
  const PIN_COUNT = 5;
  const pinnedTiles = TILES.slice(0, PIN_COUNT);
  const moreTiles   = TILES.slice(PIN_COUNT);

  const navScroll   = document.getElementById('mob-nav-scroll');
  const moreSheet   = document.getElementById('mob-more-sheet');
  const moreBg      = document.getElementById('mob-more-bg');
  const moreGrid    = document.getElementById('mob-more-grid');
  const subSheet    = document.getElementById('mob-sub-sheet');
  const subBg       = document.getElementById('mob-sub-bg');
  const subTitle    = document.getElementById('mob-sub-title');
  const subList     = document.getElementById('mob-sub-list');

  function closeSheets() {
    if (moreSheet) moreSheet.classList.remove('open');
    if (subSheet)  subSheet.classList.remove('open');
  }

  function openSubSheet(screen, label) {
    const subs = PSB_SUBS[screen];
    if (!subs) { go(screen); return; }
    if (subTitle) subTitle.textContent = label;
    if (subList) subList.innerHTML = subs.map(s =>
      `<button class="msub-item" data-screen="${s.screen}" data-p='${JSON.stringify(s.p)}'>
        ${ICON[s.icon] || ''}<span>${s.label}</span>
      </button>`
    ).join('');
    if (moreSheet) moreSheet.classList.remove('open');
    if (subSheet)  subSheet.classList.add('open');
  }

  function buildBar() {
    if (!navScroll) return;
    navScroll.innerHTML = pinnedTiles.map(([screen, label, icon]) =>
      `<button class="mnav-item" data-screen="${screen}">
        ${ICON[icon] || ICON.invoice}
        <span>${label}</span>
      </button>`
    ).join('') +
    `<button class="mnav-item" id="mob-more-btn">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>
      </svg>
      <span>المزيد</span>
    </button>`;

    if (moreGrid) moreGrid.innerHTML = moreTiles.map(([screen, label, icon]) =>
      `<button class="mmg-item" data-screen="${screen}">
        ${ICON[icon] || ICON.invoice}
        <span>${label}</span>
      </button>`
    ).join('');
  }

  if (navScroll) {
    navScroll.addEventListener('click', e => {
      const btn = e.target.closest('.mnav-item');
      if (!btn) return;
      if (btn.id === 'mob-more-btn') {
        if (moreSheet) moreSheet.classList.toggle('open');
        return;
      }
      const screen = btn.dataset.screen;
      closeSheets();
      if (PSB_SUBS[screen]) {
        openSubSheet(screen, TILES.find(t => t[0] === screen)?.[1] || '');
      } else {
        go(screen);
      }
    });
  }

  if (moreBg)  moreBg.addEventListener('click', closeSheets);
  if (subBg)   subBg.addEventListener('click', closeSheets);

  if (moreGrid) {
    moreGrid.addEventListener('click', e => {
      const btn = e.target.closest('.mmg-item');
      if (!btn) return;
      const screen = btn.dataset.screen;
      const label = TILES.find(t => t[0] === screen)?.[1] || '';
      if (PSB_SUBS[screen]) {
        openSubSheet(screen, label);
      } else {
        closeSheets();
        go(screen);
      }
    });
  }

  if (subList) {
    subList.addEventListener('click', e => {
      const btn = e.target.closest('.msub-item');
      if (!btn) return;
      closeSheets();
      go(btn.dataset.screen, JSON.parse(btn.dataset.p || '{}'));
    });
  }

  buildBar();

  window._updateMobNavActive = function(screenName) {
    document.querySelectorAll('.mnav-item').forEach(btn => {
      const tile = btn.dataset.screen;
      const isSelf = tile === screenName;
      const isParent = PSB_SUBS[tile] && PSB_SUBS[tile].some(s => s.screen === screenName);
      btn.classList.toggle('active', isSelf || isParent);
    });
    document.querySelectorAll('.mmg-item').forEach(btn => {
      const tile = btn.dataset.screen;
      const isSelf = tile === screenName;
      const isParent = PSB_SUBS[tile] && PSB_SUBS[tile].some(s => s.screen === screenName);
      btn.classList.toggle('active', isSelf || isParent);
    });
  };
})();

function updateSidebarActive(screenName) {
  document.querySelectorAll('.psb-item').forEach(btn => {
    const tile = btn.dataset.screen;
    const isSelf = tile === screenName;
    const isParent = PSB_SUBS[tile] && PSB_SUBS[tile].some(s => s.screen === screenName);
    btn.classList.toggle('active', isSelf || isParent);
  });
  document.querySelectorAll('.psb-sub-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.screen === screenName);
  });
  if (window._updateMobNavActive) window._updateMobNavActive(screenName);
}
