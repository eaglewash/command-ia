/*  burger-menu.js — Navigation partagée Commande-IA · Palette Lagune
    À inclure sur TOUTES les pages : <script src="/burger-menu.js"></script>
    S'injecte automatiquement dans .logo ou #burger-anchor.
*/
(function () {
  const user = sessionStorage.getItem('user');
  const cu   = user ? JSON.parse(user) : {};
  const role = cu.role || '';
  const isAdmin = role === 'Admin';
  const nom   = cu.nom || cu.email || '?';
  const init  = nom.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
  const path  = window.location.pathname;

  // ── Pages cachées (chargées depuis le serveur) ──────────────
  let _hiddenPages = [];

  // ── Permission helper ────────────────────────────────────────
  function show(page) {
    // Pages masquées côté serveur : cachées pour les non-admins uniquement
    if (!isAdmin && _hiddenPages.includes(page)) return false;
    if (isAdmin) return true;
    if (window.PermissionsAPI) return window.PermissionsAPI.canAccess(page, role);
    return true;
  }

  // ── Styles ───────────────────────────────────────────────────
  const css = `
    /* ── Burger button ── */
    .bn-btn {
      width: 36px; height: 36px; border-radius: 10px;
      background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.18);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; flex-shrink: 0; transition: all .15s;
      position: relative; padding: 0;
    }
    .bn-btn:hover { background: rgba(255,255,255,.24); transform: scale(1.05); }
    .bn-btn svg  { width: 18px; height: 18px; }

    /* ── Dropdown menu ── */
    .bn-menu {
      display: none; position: absolute; top: calc(100% + 8px); left: 0;
      width: 268px; background: #F8FBF9;
      border: 1.5px solid #B8D0C8; border-radius: 16px;
      box-shadow: 0 8px 32px rgba(14,75,71,.13), 0 2px 8px rgba(0,0,0,.06);
      z-index: 9999; overflow: hidden;
      animation: bnIn .16s cubic-bezier(.22,1,.36,1);
    }
    .bn-menu.open { display: block; }
    @keyframes bnIn { from { opacity:0; transform: translateY(-6px) scale(.98); } }

    /* ── User card ── */
    .bn-user {
      display: flex; align-items: center; gap: 10px;
      padding: 12px 14px 10px; border-bottom: 1px solid #CFE0D9;
    }
    .bn-avatar {
      width: 34px; height: 34px; border-radius: 10px;
      background: #0E4B47; color: #B8D0C8;
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 800; flex-shrink: 0; letter-spacing: -.5px;
    }
    .bn-uname  { font-size: 12px; font-weight: 700; color: #0F2A28; line-height: 1.2; }
    .bn-urole  {
      display: inline-block; margin-top: 3px;
      font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 5px;
    }
    .r-Admin     { background: #0E4B47; color: #B8D0C8; }
    .r-Manager   { background: #1d4ed8; color: #bfdbfe; }
    .r-Serveur   { background: #166534; color: #bbf7d0; }
    .r-Cuisinier { background: #92400e; color: #fde68a; }
    .r-Barman    { background: #6d28d9; color: #ddd6fe; }
    .r-default   { background: #e5e7eb; color: #6b7280; }

    /* ── Scroll inner ── */
    .bn-inner { padding: 6px 0; max-height: calc(100vh - 100px); overflow-y: auto; }
    .bn-inner::-webkit-scrollbar { width: 3px; }
    .bn-inner::-webkit-scrollbar-thumb { background: #B8D0C8; border-radius: 3px; }

    /* ── Section labels ── */
    .bn-section {
      padding: 8px 14px 3px; font-size: 9px; font-weight: 800;
      color: #4D6260; text-transform: uppercase; letter-spacing: 1.2px;
    }
    .bn-divider { height: 1px; background: #CFE0D9; margin: 5px 0; }

    /* ── Nav items ── */
    .bn-item {
      display: flex; align-items: center; gap: 9px; padding: 8px 14px;
      font-size: 13px; font-weight: 500; color: #0F2A28;
      cursor: pointer; transition: background .1s; text-decoration: none;
      border: none; background: none; width: 100%;
      font-family: 'Inter', system-ui, sans-serif;
    }
    .bn-item:hover   { background: #EEF5F2; color: #0E4B47; }
    .bn-item.active  {
      background: #DCF0ED; color: #0E4B47; font-weight: 700;
      border-left: 3px solid #0E4B47;
    }
    .bn-item.danger  { color: #B83C2C; }
    .bn-item.danger:hover { background: #FCE8E5; }
    .bn-item-icon {
      width: 28px; height: 28px; border-radius: 7px;
      background: #EEF5F2; display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; transition: background .1s;
    }
    .bn-item:hover  .bn-item-icon { background: #B8D0C8; }
    .bn-item.active .bn-item-icon { background: #7BBBB5; }
    .bn-item.danger .bn-item-icon { background: #FCE8E5; }
    .bn-item-icon svg { width: 14px; height: 14px; }

    .bn-badge {
      margin-left: auto; font-size: 9px; font-weight: 700;
      padding: 2px 7px; border-radius: 5px;
      background: #DCF0ED; color: #0E4B47;
    }

    /* ── Wrapper ── */
    .bn-wrapper { position: relative; display: inline-flex; }
  `;
  const st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  // ── Helpers ─────────────────────────────────────────────────
  function active(href) {
    if (href === '/' || href === '/index.html')
      return path === '/' || path === '/index.html';
    return path === href;
  }

  const IC = (paths) =>
    `<svg viewBox="0 0 16 16" fill="none" stroke="#0E4B47" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

  function item(href, icon, label, opts = {}) {
    const page = href.replace(/^\//, '').toLowerCase() || 'index.html';
    if (href !== '#' && !opts.onclick && !show(page)) return '';
    const ac  = active(href) ? ' active' : '';
    const dc  = opts.danger  ? ' danger' : '';
    const bd  = opts.badge   ? `<span class="bn-badge">${opts.badge}</span>` : '';
    const oc  = opts.onclick
      ? `${opts.onclick};closeBurgerNav()`
      : `window.location.href='${href}';closeBurgerNav()`;
    return `<button class="bn-item${ac}${dc}" onclick="${oc}">
      <span class="bn-item-icon">${icon}</span>${label}${bd}
    </button>`;
  }

  // ── Role badge class ────────────────────────────────────────
  const rc = `r-${['Admin','Manager','Serveur','Cuisinier','Barman'].includes(role) ? role : 'default'}`;

  // ── Build HTML ──────────────────────────────────────────────
  function build() {
    return `
      <div class="bn-user">
        <div class="bn-avatar">${init}</div>
        <div>
          <div class="bn-uname">${nom}</div>
          <span class="bn-urole ${rc}">${role || 'Utilisateur'}</span>
        </div>
      </div>
      <div class="bn-inner">
        <div class="bn-section">Service</div>
        ${item('/', IC('<rect x="2" y="2" width="12" height="12" rx="2"/><path d="M5 8h6M5 5h6M5 11h4"/>'), 'Tableau de bord')}
        ${item('/kds.html', IC('<rect x="2" y="3" width="12" height="9" rx="1.5"/><path d="M6 14h4M8 12v2"/>'), 'Écran cuisine (KDS)')}
        ${item('/plan-salle.html', IC('<rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/>'), 'Plan de salle')}
        ${item('/reservations.html', IC('<rect x="2" y="3" width="12" height="11" rx="1.5"/><path d="M5 2v3M11 2v3M2 7h12"/>'), 'Réservations')}
        ${item('/paiement.html', IC('<rect x="2" y="4" width="12" height="9" rx="1.5"/><path d="M2 7h12M5 11h3"/>'), 'Terminal paiement')}

<div class="bn-divider"></div>
        <div class="bn-section">Gestion</div>
        ${item('/stocks.html', IC('<rect x="2" y="2" width="12" height="4" rx="1"/><rect x="2" y="8" width="12" height="4" rx="1"/>'), 'Stocks')}
        ${item('/planning.html', IC('<circle cx="8" cy="8" r="5"/><path d="M8 5v3l2 2"/>'), 'Planning équipe')}
        ${item('/allergenes.html', IC('<path d="M8 2a6 6 0 100 12A6 6 0 008 2zM8 6v4M8 11v.5"/>'), 'Allergènes')}
        ${item('/menu-ia.html', IC('<path d="M3 4h10M3 8h7M3 12h5"/><circle cx="12" cy="11" r="2"/>'), 'Carte & Menu')}

        <div class="bn-divider"></div>
        <div class="bn-section">Pilotage</div>
        ${item('/analytics.html', IC('<path d="M2 12L6 7l3 3 3-4 3 2"/>'), 'Analytics')}
        ${item('/rapports.html', IC('<rect x="2" y="2" width="12" height="12" rx="1.5"/><path d="M5 6h6M5 9h6M5 12h4"/>'), 'Rapports')}
        ${item('/prevision-ia.html', IC('<path d="M2 10l3-4 3 2 3-5 3 3"/><path d="M2 14h12"/>'), 'Prévisions')}
        ${item('/crm.html', IC('<circle cx="6" cy="6" r="3"/><path d="M2 14c0-2.2 1.8-4 4-4h4c2.2 0 4 1.8 4 4"/>'), 'CRM clients')}
        ${item('/feedback.html', IC('<path d="M8 2l1.5 3.5L13 6l-2.5 2.5.5 3.5L8 10.5 5 12.5l.5-3.5L3 6l3.5-.5z"/>'), 'Avis clients')}
        ${item('/fraude.html', IC('<path d="M8 2L3 4v4c0 3 2.5 5 5 6 2.5-1 5-3 5-6V4L8 2z"/><path d="M8 7v3M8 12v.5"/>'), 'Détection fraude')}
        ${item('/analyse-strategique.html', IC('<rect x="2" y="8" width="3" height="6" rx="1"/><rect x="6" y="5" width="3" height="9" rx="1"/><rect x="10" y="2" width="3" height="12" rx="1"/>'), 'Analyse stratégique')}

        <div class="bn-divider"></div>
        <div class="bn-section">Communication</div>
        ${item('/messagerie.html', IC('<path d="M2 4a1 1 0 011-1h10a1 1 0 011 1v7a1 1 0 01-1 1H5l-3 2V4z"/>'), 'Messagerie')}
        ${item('/vocal-avance.html', IC('<path d="M8 2a2 2 0 012 2v4a2 2 0 01-4 0V4a2 2 0 012-2z"/><path d="M4 9a4 4 0 008 0M8 13v2M6 15h4"/>'), 'Vocal avancé')}

        <div class="bn-divider"></div>
        <div class="bn-section">Système</div>
        ${item('/onboarding-guide.html', IC('<circle cx="8" cy="8" r="5"/><path d="M6 6.5A2 2 0 0110 8c0 1-1 1.5-2 2v1"/>'), 'Guide de démarrage')}
        ${item('/multi-sites.html', IC('<rect x="1" y="4" width="6" height="6" rx="1"/><rect x="9" y="4" width="6" height="6" rx="1"/><path d="M4 10v2M12 10v2M4 12h8"/>'), 'Multi-sites')}
        ${item('/multilangues.html', IC('<circle cx="8" cy="8" r="5"/><path d="M8 3a9 9 0 010 10M3 8h10"/>'), 'Multi-langues')}
        ${item('/securite.html', IC('<rect x="3" y="6" width="10" height="8" rx="1.5"/><path d="M6 6V4a2 2 0 014 0v2"/>'), 'Sécurité & 2FA')}
        ${isAdmin ? item('/admin.html', IC('<rect x="2" y="2" width="12" height="12" rx="2"/><path d="M5 6h6M5 9h4"/>'), 'Administration', { badge: 'Admin' }) : ''}
        ${isAdmin ? item('/setup.html', IC('<circle cx="8" cy="8" r="2.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.5 3.5l1.5 1.5M11 11l1.5 1.5M3.5 12.5L5 11M11 5l1.5-1.5"/>'), 'Configuration') : ''}
        ${isAdmin ? item('/onboarding.html', IC('<path d="M3 8h10M8 3v10"/>'), 'Onboarding resto') : ''}
        ${item('#', IC('<path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/>'), 'Mode plein écran', { onclick: "document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen()" })}
        ${item('#', IC('<path stroke="#B83C2C" d="M6 3H3a1 1 0 00-1 1v8a1 1 0 001 1h3M10 11l3-3-3-3M13 8H6"/>'), 'Déconnexion', { danger: true, onclick: "sessionStorage.removeItem('user');window.location.href='/login.html'" })}
      </div>`;
  }

  // ── Inject ──────────────────────────────────────────────────
  function inject() {
    if (document.getElementById('bn-menu')) return;

    let anchor = document.getElementById('burger-anchor')
      || document.querySelector('.logo')
      || document.querySelector('.topbar-left');
    if (!anchor) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'bn-wrapper';

    const btn = document.createElement('button');
    btn.className = 'bn-btn';
    btn.id = 'bn-btn';
    btn.title = 'Navigation';
    btn.innerHTML = '<svg viewBox="0 0 20 20" fill="none"><path d="M3 5h14M3 10h14M3 15h10" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>';
    btn.onclick = e => {
      e.stopPropagation();
      document.getElementById('bn-menu').classList.toggle('open');
    };

    const menu = document.createElement('div');
    menu.className = 'bn-menu';
    menu.id = 'bn-menu';
    menu.innerHTML = build();

    wrapper.append(btn, menu);

    // Replace existing logo-icon if present, else prepend
    const icon = anchor.querySelector('.logo-icon');
    if (icon) icon.replaceWith(wrapper);
    else anchor.insertBefore(wrapper, anchor.firstChild);
  }

  // ── Global helpers ──────────────────────────────────────────
  window.closeBurgerNav = () => {
    const m = document.getElementById('bn-menu');
    if (m) m.classList.remove('open');
  };
  // Alias pour compatibilité avec les pages qui appellent l'ancienne fonction
  window.toggleBurger = window.toggleMenu = () => {
    const m = document.getElementById('bn-menu');
    if (m) m.classList.toggle('open');
  };

  document.addEventListener('click', e => {
    if (!e.target.closest('.bn-wrapper')) closeBurgerNav();
  });

  window.addEventListener('permissions-synced', () => {
    const m = document.getElementById('bn-menu');
    if (m) m.innerHTML = build();
  });

  // ── Charger les pages cachées, puis injecter ────────────────
  function loadHiddenThenInject() {
    fetch('/config/hidden-pages?t=' + Date.now(), { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { hiddenPages: [] })
      .then(data => {
        _hiddenPages = Array.isArray(data.hiddenPages) ? data.hiddenPages : [];
      })
      .catch(() => { _hiddenPages = []; })
      .finally(() => inject());
  }

  // ── Écouter les mises à jour en direct (socket.io dispatch) ─
  window.addEventListener('hidden-pages-updated', (e) => {
    if (Array.isArray(e.detail)) _hiddenPages = e.detail;
    const m = document.getElementById('bn-menu');
    if (m) m.innerHTML = build();
  });

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', loadHiddenThenInject);
  else loadHiddenThenInject();
})();
