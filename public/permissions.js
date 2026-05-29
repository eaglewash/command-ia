/* ============================================================
   permissions.js — Système central de hiérarchie des rôles
   ============================================================

   Définit la hiérarchie des comptes et les pages accessibles
   par chaque rôle. À inclure sur TOUTES les pages protégées :

      <script src="/permissions.js"></script>
      <script>requireAuth();</script>

   ============================================================ */

// ─── HIÉRARCHIE DES RÔLES ───────────────────────────────────
// Du plus haut privilège au plus bas
const ROLE_HIERARCHY = ['Admin', 'Manager', 'Serveur', 'Cuisinier', 'Barman'];

// ─── LIBELLÉS ET DESCRIPTIONS ───────────────────────────────
const ROLE_INFO = {
  Admin:     { icon: '👑', label: 'Administrateur', color: '#dc2626', desc: 'Accès total : gestion restaurants, employés, paramètres, finances' },
  Manager:   { icon: '👔', label: 'Manager',        color: '#1d4ed8', desc: 'Gestion équipe, planning, stocks, analytics, CRM, rapports' },
  Serveur:   { icon: '🍽️', label: 'Serveur',        color: '#166534', desc: 'Plan de salle, réservations, paiement, commandes, messagerie' },
  Cuisinier: { icon: '🍳', label: 'Cuisinier',      color: '#92400e', desc: 'KDS, stocks, allergènes, fiches recettes, messagerie' },
  Barman:    { icon: '🍹', label: 'Barman',         color: '#7c3aed', desc: 'KDS bar, stocks bar, commandes boissons, messagerie' }
};

// ─── PERMISSIONS PAR PAGE ───────────────────────────────────
// Pour chaque page, la liste des rôles AUTORISÉS
const PAGE_PERMISSIONS = {
  // Pages publiques / connexion
  'login.html':            ['*'],
  'landing.html':          ['*'],
  'logos.html':            ['*'],

  // Dashboard (accessible à tous les connectés)
  'index.html':            ['Admin', 'Manager', 'Serveur', 'Cuisinier', 'Barman'],
  '':                      ['Admin', 'Manager', 'Serveur', 'Cuisinier', 'Barman'],

  // Administration et configuration → Admin uniquement
  'admin.html':            ['Admin'],
  'setup.html':            ['Admin'],
  'multi-sites.html':      ['Admin'],
  'api-docs.html':         ['Admin'],
  'fraude.html':           ['Admin', 'Manager'],
  'analyse-strategique.html': ['Admin', 'Manager'],
  'securite.html':         ['Admin'],

  // Pilotage → Admin et Manager
  'planning.html':         ['Admin', 'Manager'],
  'analytics.html':        ['Admin', 'Manager'],
  'rapports.html':         ['Admin', 'Manager'],
  'crm.html':              ['Admin', 'Manager'],
  'feedback.html':         ['Admin', 'Manager'],
  'prevision-ia.html':     ['Admin', 'Manager'],
  'menu-ia.html':          ['Admin', 'Manager'],

  // Service en salle → Serveur + Manager + Admin
  'plan-salle.html':       ['Admin', 'Manager', 'Serveur'],
  'reservations.html':     ['Admin', 'Manager', 'Serveur'],
  'paiement.html':         ['Admin', 'Manager', 'Serveur'],
  'tv-display.html':       ['Admin', 'Manager', 'Serveur'],

  // Cuisine → Cuisinier + Manager + Admin
  'kds.html':              ['Admin', 'Manager', 'Cuisinier', 'Barman'],
  'allergenes.html':       ['Admin', 'Manager', 'Cuisinier'],

  // Stocks → Cuisinier + Barman + Manager + Admin
  'stocks.html':           ['Admin', 'Manager', 'Cuisinier', 'Barman'],

  // Communication → tout le monde connecté
  'messagerie.html':       ['Admin', 'Manager', 'Serveur', 'Cuisinier', 'Barman'],

  // Outils vocaux et clients → Admin + Manager
  'vocal-avance.html':     ['Admin', 'Manager'],
  'voice-client.html':     ['*'],
  'demo-client.html':      ['*'],
  'restaurant.html':       ['*'],

  // Onboarding setup (admin uniquement — appelle /admin/restaurants et /admin/menus)
  'onboarding.html':       ['Admin'],
  // Guide d'onboarding consultatif (lecture seule, accessible à tous)
  'onboarding-guide.html': ['Admin', 'Manager', 'Serveur', 'Cuisinier', 'Barman'],
  'multilangues.html':     ['Admin', 'Manager']
};

// ─── UTILS ──────────────────────────────────────────────────
function getCurrentUser() {
  try {
    const u = JSON.parse(sessionStorage.getItem('user') || '{}');
    // Normalisation des rôles legacy
    if (u.role) {
      const ROLE_NORM = { 'Hôte': 'Serveur', 'Cuisine': 'Cuisinier', 'Gérant': 'Manager' };
      if (ROLE_NORM[u.role]) {
        u.role = ROLE_NORM[u.role];
        try { sessionStorage.setItem('user', JSON.stringify(u)); } catch {}
      }
    }
    return u;
  } catch { return {}; }
}

function getCurrentPage() {
  const path = window.location.pathname;
  const file = path.split('/').pop() || 'index.html';
  return file.toLowerCase();
}

// canAccess : SOURCE DE VÉRITÉ UNIQUE = la matrice chargée synchroneement
// au démarrage du script. Pas de localStorage. Pas d'asynchrone.
function canAccess(page, role) {
  if (!role) return false;

  // 1) Pages publiques (login, landing)
  const allowedStatic = PAGE_PERMISSIONS[page];
  if (allowedStatic && allowedStatic.includes('*')) return true;

  // 2) Admin : accès total
  if (role === 'Admin') return true;

  // 3) Matrice chargée du serveur (la vraie source de vérité)
  const matrix = _LOADED_MATRIX || (typeof DEFAULT_PERMISSIONS_MATRIX !== 'undefined' ? DEFAULT_PERMISSIONS_MATRIX : null);
  if (matrix && matrix[role]) {
    if (matrix[role]._all === true) return true;
    const pagePerms = matrix[role][page];
    if (pagePerms && typeof pagePerms.access === 'boolean') return pagePerms.access;
    // Pas d'entrée pour cette page → refus
    return false;
  }

  // 4) Pas de matrice du tout → utilise le fallback statique
  if (!allowedStatic) return false;
  return allowedStatic.includes(role);
}

function getAllowedPagesForRole(role) {
  // Utilise canAccess (qui consulte la matrice) pour CHAQUE page connue
  const allPages = new Set();
  Object.keys(PAGE_PERMISSIONS).forEach(p => allPages.add(p));
  if (typeof PERMISSIONS_CATALOG !== 'undefined') {
    Object.keys(PERMISSIONS_CATALOG).forEach(p => allPages.add(p));
  }
  return [...allPages].filter(p => canAccess(p, role));
}

// ─── CHECK D'ACCÈS À LA PAGE COURANTE ───────────────────────
// Comportement simple comme admin.html : si pas connecté → login,
// si pas autorisé → redirection vers le dashboard (ou écran refusé en dernier recours).
function requireAuth() {
  const user = getCurrentUser();
  const page = getCurrentPage();

  // Pages publiques : on laisse passer
  const allowed = PAGE_PERMISSIONS[page];
  if (allowed && allowed.includes('*')) return user;

  // Pas connecté → redirection login
  if (!user || !user.email) {
    window.location.href = '/login.html';
    return null;
  }

  // Vérification synchrone via user.permissions (injectées au login)
  if (!canAccess(page, user.role)) {
    console.warn('[Permissions] Accès refusé pour', user.role, 'sur', page);
    // Si on est déjà sur le dashboard et qu'il est bloqué, on affiche l'écran refusé
    if (page === 'index.html') {
      showAccessDenied(user, page);
    } else {
      // Hard redirect vers le dashboard (comme admin.html)
      window.location.href = '/';
    }
    return null;
  }

  return user;
}

// Sync de la matrice depuis le serveur (juste un refresh du cache local).
// On NE bloque PAS la page courante après sync : la décision a déjà été prise
// par requireAuth() au chargement. Les changements prendront effet au prochain
// rechargement de la page (ce qui évite les flashes "accès refusé" indésirables).
async function syncAndRecheckAccess(user, page) {
  try {
    const r = await fetch('/admin/permissions-matrix', { cache: 'no-store' });
    if (!r.ok) return;
    const data = await r.json();
    if (!data || !data.matrix) return;
    // Met à jour le cache local pour le prochain chargement
    localStorage.setItem(PERMISSIONS_STORAGE_KEY, JSON.stringify(data.matrix));
    // Émet un évènement pour permettre aux pages de rafraîchir leur UI (menu burger, boutons)
    try { window.dispatchEvent(new CustomEvent('permissions-synced', { detail: { matrix: data.matrix } })); } catch {}
    // Applique les permissions sur les boutons (cacher/désactiver)
    if (window.PermissionsAPI && typeof window.PermissionsAPI.applyButtonPermissions === 'function') {
      window.PermissionsAPI.applyButtonPermissions();
    }
  } catch {}
}

// ─── PAGE DE REDIRECTION : trouve la 1re page autorisée pour ce rôle ─────
function findFirstAllowedPage(role) {
  // Priorité d'ordre logique pour la redirection
  const ordered = [
    'index.html', 'plan-salle.html', 'reservations.html', 'kds.html',
    'stocks.html', 'planning.html', 'analytics.html', 'rapports.html',
    'crm.html', 'messagerie.html'
  ];
  for (const p of ordered) {
    if (canAccess(p, role)) return '/' + p;
  }
  return null;
}

// ─── ÉCRAN "ACCÈS REFUSÉ" ───────────────────────────────────
function showAccessDenied(user, page) {
  const info = ROLE_INFO[user.role] || ROLE_INFO.Serveur;
  const redirectTarget = findFirstAllowedPage(user.role) || '/index.html';
  document.head.insertAdjacentHTML('beforeend',
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Instrument+Serif&display=swap" rel="stylesheet">'
  );
  document.body.innerHTML = `
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{
        font-family:'Inter',system-ui,sans-serif;
        background:#EEF5F2;
        color:#0F2A28;
        min-height:100vh;
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        padding:24px;
      }
      .ad-topbar{
        position:fixed;top:0;left:0;right:0;height:52px;
        background:#F8FBF9;border-bottom:1px solid #B8D0C8;
        display:flex;align-items:center;padding:0 24px;
      }
      .ad-logo{font-size:15px;font-weight:700;color:#0F2A28}
      .ad-logo span{color:#E36C5B}
      .ad-card{
        background:#F8FBF9;
        border:1px solid #B8D0C8;
        border-radius:24px;
        padding:44px 40px 36px;
        max-width:460px;
        width:100%;
        text-align:center;
        box-shadow:0 2px 0 rgba(15,42,40,.03),0 16px 48px -16px rgba(15,42,40,.12);
        margin-top:52px;
      }
      .ad-lock{
        width:56px;height:56px;border-radius:16px;
        background:#F2C14E22;border:1.5px solid #F2C14E;
        display:inline-flex;align-items:center;justify-content:center;
        margin-bottom:22px;
      }
      .ad-title{
        font-family:'Instrument Serif',Georgia,serif;
        font-size:2rem;font-weight:400;
        color:#0F2A28;line-height:1.1;
        margin-bottom:10px;
      }
      .ad-sub{
        font-size:14px;color:#4D6260;
        line-height:1.55;margin-bottom:24px;
        max-width:320px;margin-left:auto;margin-right:auto;
      }
      .ad-badge{
        display:inline-flex;align-items:center;gap:8px;
        background:${info.color}18;color:${info.color};
        padding:8px 18px;border-radius:999px;
        font-weight:700;font-size:14px;
        border:1.5px solid ${info.color}44;
        margin-bottom:28px;
      }
      .ad-info{
        background:#EEF5F2;border:1px solid #B8D0C8;
        border-radius:12px;padding:14px 16px;
        font-size:12.5px;color:#4D6260;
        text-align:left;line-height:1.6;
        margin-bottom:28px;
      }
      .ad-info b{color:#253F3B;font-weight:600}
      .ad-info code{
        background:#D6E8E0;color:#0E4B47;
        padding:1px 6px;border-radius:4px;
        font-size:11.5px;font-family:'JetBrains Mono',monospace;
      }
      .ad-actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
      .ad-btn{
        padding:11px 22px;border-radius:12px;border:none;
        font-weight:600;font-size:14px;cursor:pointer;
        font-family:'Inter',sans-serif;
        text-decoration:none;display:inline-flex;align-items:center;gap:7px;
        transition:background .12s,transform .1s;
      }
      .ad-btn:hover{transform:translateY(-1px)}
      .ad-btn-primary{background:#0E4B47;color:#F8FBF9}
      .ad-btn-primary:hover{background:#063532}
      .ad-btn-ghost{
        background:transparent;color:#253F3B;
        border:1.5px solid #4D6260;
      }
      .ad-btn-ghost:hover{background:#D6E8E0}
    </style>

    <div class="ad-topbar">
      <div class="ad-logo">Commande<span>IA</span></div>
    </div>

    <div class="ad-card">
      <div class="ad-lock">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#D17338" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>

      <div class="ad-title">Accès refusé</div>
      <div class="ad-sub">Cette page n'est pas accessible avec votre rôle actuel.</div>

      <div class="ad-badge">${info.icon} ${info.label}</div>

      <div class="ad-info">
        <b>Permissions de ce rôle :</b> ${info.desc}<br>
        <b>Page demandée :</b> <code>${page}</code>
      </div>

      <div class="ad-actions">
        <a href="${redirectTarget}" class="ad-btn ad-btn-primary">← Retour</a>
        <button class="ad-btn ad-btn-ghost" onclick="sessionStorage.clear();window.location.href='/login.html'">Changer de compte</button>
      </div>
    </div>
  `;
}

// ─── HELPERS POUR LE DASHBOARD ──────────────────────────────
function filterModulesByRole(modules, role) {
  // modules : [{ href, ... }]
  return modules.filter(m => {
    if (!m.href) return true;
    const page = m.href.replace(/^\/+/, '').toLowerCase();
    return canAccess(page, role);
  });
}

// ════════════════════════════════════════════════════════════
//  MATRICE DE PERMISSIONS GRANULAIRES (style Discord)
// ════════════════════════════════════════════════════════════
//
//  Pour chaque page, on définit la liste des permissions possibles
//  (accéder, voir, modifier, créer, supprimer, exporter, etc.).
//  Pour chaque rôle, on a un objet {pageId: {permissionId: true/false}}.
//
//  Hiérarchie : si "access" est false, toutes les autres permissions
//  de cette page sont automatiquement désactivées.
//
// ════════════════════════════════════════════════════════════

// ─── DÉFINITION DES PERMISSIONS PAR PAGE ────────────────────
// Chaque page liste ses permissions disponibles + leur libellé
const PERMISSIONS_CATALOG = {

  // ════ GÉNÉRAL ════════════════════════════════════════════════

  'index.html': {
    label: 'Tableau de bord',
    section: 'Général',
    permissions: [
      { id: 'access',          label: 'Accéder à la page' },
      { id: 'view_revenue',    label: 'Voir le chiffre d\'affaires' },
      { id: 'view_orders',     label: 'Voir les commandes en cours' },
      { id: 'manage_orders',   label: 'Gérer les commandes (valider, annuler)' },
      { id: 'view_archives',   label: 'Voir les archives' },
      { id: 'export_orders',   label: 'Exporter les commandes (CSV)' }
    ]
  },

  'messagerie.html': {
    label: 'Messagerie interne',
    section: 'Général',
    permissions: [
      { id: 'access',          label: 'Accéder à la page' },
      { id: 'send_message',    label: 'Envoyer un message' },
      { id: 'broadcast',       label: 'Faire une annonce à toute l\'équipe' },
      { id: 'delete_message',  label: 'Supprimer un message' }
    ]
  },

  'multilangues.html': {
    label: 'Multilangues',
    section: 'Général',
    permissions: [
      { id: 'access',  label: 'Accéder à la page' },
      { id: 'view',    label: 'Voir les langues configurées' },
      { id: 'manage',  label: 'Gérer les traductions' }
    ]
  },

  'onboarding-guide.html': {
    label: 'Guide de démarrage',
    section: 'Général',
    permissions: [
      { id: 'access',  label: 'Accéder à la page' },
      { id: 'view',    label: 'Consulter le guide' }
    ]
  },

  // ════ SERVICE ════════════════════════════════════════════════

  'kds.html': {
    label: 'Écran cuisine (KDS)',
    section: 'Service',
    permissions: [
      { id: 'access',          label: 'Accéder à la page' },
      { id: 'view_orders',     label: 'Voir les commandes en cours' },
      { id: 'mark_ready',      label: 'Marquer une commande prête' },
      { id: 'mark_done',       label: 'Marquer comme servie' },
      { id: 'reject_order',    label: 'Refuser/annuler une commande' },
      { id: 'view_history',    label: 'Voir l\'historique des commandes' }
    ]
  },

  'plan-salle.html': {
    label: 'Plan de salle',
    section: 'Service',
    permissions: [
      { id: 'access',           label: 'Accéder à la page' },
      { id: 'view',             label: 'Voir le plan' },
      { id: 'modify_layout',    label: 'Modifier la disposition' },
      { id: 'assign_table',     label: 'Assigner une table à un client' },
      { id: 'open_ticket',      label: 'Ouvrir un ticket de table' },
      { id: 'close_ticket',     label: 'Clôturer un ticket' }
    ]
  },

  'reservations.html': {
    label: 'Réservations',
    section: 'Service',
    permissions: [
      { id: 'access',   label: 'Accéder à la page' },
      { id: 'view',     label: 'Voir les réservations' },
      { id: 'create',   label: 'Créer une réservation' },
      { id: 'modify',   label: 'Modifier une réservation' },
      { id: 'cancel',   label: 'Annuler une réservation' },
      { id: 'export',   label: 'Exporter la liste' }
    ]
  },

  'paiement.html': {
    label: 'Terminal paiement',
    section: 'Service',
    permissions: [
      { id: 'access',          label: 'Accéder à la page' },
      { id: 'view_history',    label: 'Voir l\'historique des transactions' },
      { id: 'process',         label: 'Encaisser un paiement' },
      { id: 'refund',          label: 'Faire un remboursement' },
      { id: 'apply_discount',  label: 'Appliquer une remise' },
      { id: 'cancel',          label: 'Annuler une transaction' }
    ]
  },

  'tv-display.html': {
    label: 'Affichage TV',
    section: 'Service',
    permissions: [
      { id: 'access',     label: 'Accéder à la page' },
      { id: 'view',       label: 'Voir l\'affichage' },
      { id: 'configure',  label: 'Configurer l\'affichage' }
    ]
  },

  // ════ PILOTAGE ════════════════════════════════════════════════

  'planning.html': {
    label: 'Planning équipe',
    section: 'Pilotage',
    permissions: [
      { id: 'access',           label: 'Accéder à la page' },
      { id: 'view_own',         label: 'Voir son propre planning' },
      { id: 'view_all',         label: 'Voir le planning de toute l\'équipe' },
      { id: 'create_shift',     label: 'Créer un créneau' },
      { id: 'modify_shift',     label: 'Modifier un créneau (heures, poste)' },
      { id: 'delete_shift',     label: 'Supprimer un créneau' },
      { id: 'manage_absences',  label: 'Gérer les absences (congés, maladie)' },
      { id: 'use_templates',    label: 'Utiliser/sauvegarder des templates' },
      { id: 'export',           label: 'Exporter (CSV, PDF)' }
    ]
  },

  // ════ GESTION ════════════════════════════════════════════════

  'stocks.html': {
    label: 'Stocks',
    section: 'Gestion',
    permissions: [
      { id: 'access',        label: 'Accéder à la page' },
      { id: 'view',          label: 'Voir l\'inventaire' },
      { id: 'add_item',      label: 'Ajouter un produit' },
      { id: 'modify_qty',    label: 'Modifier les quantités' },
      { id: 'delete_item',   label: 'Supprimer un produit' },
      { id: 'view_alerts',   label: 'Voir les alertes de stock bas' },
      { id: 'order_supply',  label: 'Lancer une commande fournisseur' },
      { id: 'export',        label: 'Exporter l\'inventaire' }
    ]
  },

  // ════ CUISINE ════════════════════════════════════════════════

  'allergenes.html': {
    label: 'Allergènes EU',
    section: 'Cuisine',
    permissions: [
      { id: 'access',      label: 'Accéder à la page' },
      { id: 'view',        label: 'Consulter les fiches' },
      { id: 'modify',      label: 'Modifier la composition d\'un produit' },
      { id: 'export_pdf',  label: 'Exporter la fiche PDF' }
    ]
  },

  // ════ ANALYSE ════════════════════════════════════════════════

  'analytics.html': {
    label: 'Analytics',
    section: 'Analyse',
    permissions: [
      { id: 'access',          label: 'Accéder à la page' },
      { id: 'view_revenue',    label: 'Voir le chiffre d\'affaires' },
      { id: 'view_costs',      label: 'Voir les coûts/marges' },
      { id: 'view_team_perf',  label: 'Voir les performances par employé' },
      { id: 'export',          label: 'Exporter les données' }
    ]
  },

  'rapports.html': {
    label: 'Rapports',
    section: 'Analyse',
    permissions: [
      { id: 'access',     label: 'Accéder à la page' },
      { id: 'view',       label: 'Consulter les rapports' },
      { id: 'generate',   label: 'Générer un nouveau rapport' },
      { id: 'export',     label: 'Exporter (PDF, Excel)' },
      { id: 'schedule',   label: 'Programmer un envoi automatique' }
    ]
  },

  'crm.html': {
    label: 'CRM & Fidélité',
    section: 'Analyse',
    permissions: [
      { id: 'access',          label: 'Accéder à la page' },
      { id: 'view_clients',    label: 'Voir la liste des clients' },
      { id: 'view_loyalty',    label: 'Voir les points fidélité' },
      { id: 'modify_client',   label: 'Modifier une fiche client' },
      { id: 'send_campaign',   label: 'Envoyer une campagne marketing' },
      { id: 'export',          label: 'Exporter la liste clients' },
      { id: 'delete_client',   label: 'Supprimer un client' }
    ]
  },

  'feedback.html': {
    label: 'Avis clients',
    section: 'Analyse',
    permissions: [
      { id: 'access',   label: 'Accéder à la page' },
      { id: 'view',     label: 'Voir les avis' },
      { id: 'reply',    label: 'Répondre à un avis' },
      { id: 'hide',     label: 'Masquer un avis' },
      { id: 'export',   label: 'Exporter les avis' }
    ]
  },

  'analyse-strategique.html': {
    label: 'Analyse stratégique',
    section: 'Analyse',
    permissions: [
      { id: 'access',   label: 'Accéder à la page' },
      { id: 'view',     label: 'Consulter les analyses' },
      { id: 'export',   label: 'Exporter les données' }
    ]
  },

  // ════ OUTILS IA ══════════════════════════════════════════════

  'menu-ia.html': {
    label: 'Carte & Menu',
    section: 'Outils',
    permissions: [
      { id: 'access',            label: 'Accéder à la page' },
      { id: 'view_suggestions',  label: 'Voir les suggestions' },
      { id: 'apply',             label: 'Appliquer une suggestion' }
    ]
  },

  'prevision-ia.html': {
    label: 'Prévisions',
    section: 'Outils',
    permissions: [
      { id: 'access',   label: 'Accéder à la page' },
      { id: 'view',     label: 'Consulter les prévisions' },
      { id: 'export',   label: 'Exporter les prévisions' }
    ]
  },

  'fraude.html': {
    label: 'Détection fraude',
    section: 'Outils',
    permissions: [
      { id: 'access',   label: 'Accéder à la page' },
      { id: 'view',     label: 'Voir les alertes' },
      { id: 'resolve',  label: 'Résoudre/clôturer une alerte' }
    ]
  },

  'vocal-avance.html': {
    label: 'Vocal avancé',
    section: 'Outils',
    permissions: [
      { id: 'access',     label: 'Accéder à la page' },
      { id: 'configure',  label: 'Configurer le moteur vocal' },
      { id: 'test',       label: 'Lancer un test vocal' }
    ]
  },

  // ════ ADMINISTRATION ═════════════════════════════════════════

  'admin.html': {
    label: 'Administration',
    section: 'Administration',
    permissions: [
      { id: 'access',                label: 'Accéder à la page' },
      { id: 'manage_restaurants',    label: 'Gérer les restaurants (créer, modifier)' },
      { id: 'delete_restaurants',    label: 'Supprimer un restaurant' },
      { id: 'manage_employees',      label: 'Gérer les employés' },
      { id: 'change_roles',          label: 'Changer les rôles des employés' },
      { id: 'delete_employees',      label: 'Supprimer un employé' },
      { id: 'view_audit_log',        label: 'Voir le journal d\'audit' },
      { id: 'manage_subscriptions',  label: 'Gérer les abonnements' },
      { id: 'manage_permissions',    label: 'Modifier la matrice de permissions' }
    ]
  },

  'setup.html': {
    label: 'Configuration restaurant',
    section: 'Administration',
    permissions: [
      { id: 'access',   label: 'Accéder à la page' },
      { id: 'modify',   label: 'Modifier la configuration' },
      { id: 'reset',    label: 'Réinitialiser les paramètres' }
    ]
  },

  'onboarding.html': {
    label: 'Onboarding restaurant',
    section: 'Administration',
    permissions: [
      { id: 'access',     label: 'Accéder à la page' },
      { id: 'configure',  label: 'Configurer le restaurant' }
    ]
  },

  'multi-sites.html': {
    label: 'Multi-sites',
    section: 'Administration',
    permissions: [
      { id: 'access',   label: 'Accéder à la page' },
      { id: 'view',     label: 'Voir tous les sites' },
      { id: 'manage',   label: 'Gérer les sites (ajouter, modifier)' }
    ]
  },

  'securite.html': {
    label: 'Sécurité',
    section: 'Administration',
    permissions: [
      { id: 'access',     label: 'Accéder à la page' },
      { id: 'view_logs',  label: 'Voir les journaux de sécurité' },
      { id: 'manage',     label: 'Gérer les règles de sécurité' }
    ]
  },

  'api-docs.html': {
    label: 'Documentation API',
    section: 'Administration',
    permissions: [
      { id: 'access',     label: 'Accéder à la page' },
      { id: 'view_keys',  label: 'Voir les clés API' }
    ]
  }
};

// ─── MATRICE PAR DÉFAUT (rôle → page → permissionId → bool) ──
// Cette matrice par défaut peut être surchargée via l'admin
const DEFAULT_PERMISSIONS_MATRIX = {
  Admin: {
    _all: true
  },

  Manager: {
    // ── Général ──
    'index.html':            { access: true,  view_revenue: true,  view_orders: true,  manage_orders: true,  view_archives: true,  export_orders: true  },
    'messagerie.html':       { access: true,  send_message: true,  broadcast: true,  delete_message: true  },
    'multilangues.html':     { access: true,  view: true,  manage: true  },
    'onboarding-guide.html': { access: true,  view: true  },
    // ── Service ──
    'kds.html':              { access: true,  view_orders: true,  mark_ready: true,  mark_done: true,  reject_order: true,  view_history: true  },
    'plan-salle.html':       { access: true,  view: true,  modify_layout: true,  assign_table: true,  open_ticket: true,  close_ticket: true  },
    'reservations.html':     { access: true,  view: true,  create: true,  modify: true,  cancel: true,  export: true  },
    'paiement.html':         { access: true,  view_history: true,  process: true,  refund: true,  apply_discount: true,  cancel: true  },
    'tv-display.html':       { access: true,  view: true,  configure: true  },
    // ── Pilotage ──
    'planning.html':         { access: true,  view_own: true,  view_all: true,  create_shift: true,  modify_shift: true,  delete_shift: true,  manage_absences: true,  use_templates: true,  export: true  },
    // ── Gestion ──
    'stocks.html':           { access: true,  view: true,  add_item: true,  modify_qty: true,  delete_item: true,  view_alerts: true,  order_supply: true,  export: true  },
    // ── Cuisine ──
    'allergenes.html':       { access: true,  view: true,  modify: true,  export_pdf: true  },
    // ── Analyse ──
    'analytics.html':        { access: true,  view_revenue: true,  view_costs: true,  view_team_perf: true,  export: true  },
    'rapports.html':         { access: true,  view: true,  generate: true,  export: true,  schedule: true  },
    'crm.html':              { access: true,  view_clients: true,  view_loyalty: true,  modify_client: true,  send_campaign: true,  export: true,  delete_client: false  },
    'feedback.html':         { access: true,  view: true,  reply: true,  hide: true,  export: true  },
    'analyse-strategique.html': { access: true,  view: true,  export: true  },
    // ── Outils IA ──
    'menu-ia.html':          { access: true,  view_suggestions: true,  apply: true  },
    'prevision-ia.html':     { access: true,  view: true,  export: true  },
    'fraude.html':           { access: true,  view: true,  resolve: true  },
    'vocal-avance.html':     { access: true,  configure: false,  test: true  },
    // ── Administration ──
    'admin.html':            { access: false },
    'setup.html':            { access: false },
    'onboarding.html':       { access: false },
    'multi-sites.html':      { access: false },
    'securite.html':         { access: false },
    'api-docs.html':         { access: false }
  },

  Serveur: {
    // ── Général ──
    'index.html':            { access: true,  view_revenue: false,  view_orders: true,  manage_orders: true,  view_archives: false,  export_orders: false  },
    'messagerie.html':       { access: true,  send_message: true,  broadcast: false,  delete_message: false  },
    'multilangues.html':     { access: false },
    'onboarding-guide.html': { access: true,  view: true  },
    // ── Service ──
    'kds.html':              { access: false },
    'plan-salle.html':       { access: true,  view: true,  modify_layout: false,  assign_table: true,  open_ticket: true,  close_ticket: true  },
    'reservations.html':     { access: true,  view: true,  create: true,  modify: true,  cancel: false,  export: false  },
    'paiement.html':         { access: true,  view_history: false,  process: true,  refund: false,  apply_discount: false,  cancel: false  },
    'tv-display.html':       { access: true,  view: true,  configure: false  },
    // ── Pilotage ──
    'planning.html':         { access: true,  view_own: true,  view_all: true,  create_shift: false,  modify_shift: false,  delete_shift: false,  manage_absences: false,  use_templates: false,  export: false  },
    // ── Gestion ──
    'stocks.html':           { access: false },
    // ── Cuisine ──
    'allergenes.html':       { access: true,  view: true,  modify: false,  export_pdf: false  },
    // ── Analyse ──
    'analytics.html':        { access: false },
    'rapports.html':         { access: false },
    'crm.html':              { access: false },
    'feedback.html':         { access: false },
    'analyse-strategique.html': { access: false },
    // ── Outils IA ──
    'menu-ia.html':          { access: false },
    'prevision-ia.html':     { access: false },
    'fraude.html':           { access: false },
    'vocal-avance.html':     { access: false },
    // ── Administration ──
    'admin.html':            { access: false },
    'setup.html':            { access: false },
    'onboarding.html':       { access: false },
    'multi-sites.html':      { access: false },
    'securite.html':         { access: false },
    'api-docs.html':         { access: false }
  },

  Cuisinier: {
    // ── Général ──
    'index.html':            { access: true,  view_revenue: false,  view_orders: true,  manage_orders: false,  view_archives: false,  export_orders: false  },
    'messagerie.html':       { access: true,  send_message: true,  broadcast: false,  delete_message: false  },
    'multilangues.html':     { access: false },
    'onboarding-guide.html': { access: true,  view: true  },
    // ── Service ──
    'kds.html':              { access: true,  view_orders: true,  mark_ready: true,  mark_done: true,  reject_order: false,  view_history: true  },
    'plan-salle.html':       { access: false },
    'reservations.html':     { access: false },
    'paiement.html':         { access: false },
    'tv-display.html':       { access: false },
    // ── Pilotage ──
    'planning.html':         { access: true,  view_own: true,  view_all: true,  create_shift: false,  modify_shift: false,  delete_shift: false,  manage_absences: false,  use_templates: false,  export: false  },
    // ── Gestion ──
    'stocks.html':           { access: true,  view: true,  add_item: false,  modify_qty: true,  delete_item: false,  view_alerts: true,  order_supply: false,  export: false  },
    // ── Cuisine ──
    'allergenes.html':       { access: true,  view: true,  modify: true,  export_pdf: true  },
    // ── Analyse ──
    'analytics.html':        { access: false },
    'rapports.html':         { access: false },
    'crm.html':              { access: false },
    'feedback.html':         { access: false },
    'analyse-strategique.html': { access: false },
    // ── Outils IA ──
    'menu-ia.html':          { access: false },
    'prevision-ia.html':     { access: false },
    'fraude.html':           { access: false },
    'vocal-avance.html':     { access: false },
    // ── Administration ──
    'admin.html':            { access: false },
    'setup.html':            { access: false },
    'onboarding.html':       { access: false },
    'multi-sites.html':      { access: false },
    'securite.html':         { access: false },
    'api-docs.html':         { access: false }
  },

  Barman: {
    // ── Général ──
    'index.html':            { access: true,  view_revenue: false,  view_orders: true,  manage_orders: false,  view_archives: false,  export_orders: false  },
    'messagerie.html':       { access: true,  send_message: true,  broadcast: false,  delete_message: false  },
    'multilangues.html':     { access: false },
    'onboarding-guide.html': { access: true,  view: true  },
    // ── Service ──
    'kds.html':              { access: true,  view_orders: true,  mark_ready: true,  mark_done: true,  reject_order: false,  view_history: true  },
    'plan-salle.html':       { access: false },
    'reservations.html':     { access: false },
    'paiement.html':         { access: false },
    'tv-display.html':       { access: false },
    // ── Pilotage ──
    'planning.html':         { access: true,  view_own: true,  view_all: true,  create_shift: false,  modify_shift: false,  delete_shift: false,  manage_absences: false,  use_templates: false,  export: false  },
    // ── Gestion ──
    'stocks.html':           { access: true,  view: true,  add_item: false,  modify_qty: true,  delete_item: false,  view_alerts: true,  order_supply: false,  export: false  },
    // ── Cuisine ──
    'allergenes.html':       { access: true,  view: true,  modify: false,  export_pdf: false  },
    // ── Analyse ──
    'analytics.html':        { access: false },
    'rapports.html':         { access: false },
    'crm.html':              { access: false },
    'feedback.html':         { access: false },
    'analyse-strategique.html': { access: false },
    // ── Outils IA ──
    'menu-ia.html':          { access: false },
    'prevision-ia.html':     { access: false },
    'fraude.html':           { access: false },
    'vocal-avance.html':     { access: false },
    // ── Administration ──
    'admin.html':            { access: false },
    'setup.html':            { access: false },
    'onboarding.html':       { access: false },
    'multi-sites.html':      { access: false },
    'securite.html':         { access: false },
    'api-docs.html':         { access: false }
  },

};

// ─── CHARGEMENT SYNCHRONE DE LA MATRICE AU DÉMARRAGE ─────────
// On utilise un XHR synchrone (oui, déprécié, mais c'est la SEULE
// manière fiable de garantir que canAccess() fonctionne au moment
// où requireAuth() est appelé — sans aucun bug de race condition).
let _LOADED_MATRIX = null;
(function loadMatrixSync() {
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', '/admin/permissions-matrix?t=' + Date.now(), false); // false = SYNC, ?t= pour casser le cache
    xhr.send(null);
    if (xhr.status === 200) {
      const data = JSON.parse(xhr.responseText);
      if (data && data.matrix) _LOADED_MATRIX = data.matrix;
    }
  } catch (e) {
    // En cas d'erreur réseau, on continue avec la matrice par défaut
  }
})();

// ─── ÉCOUTE DES MISES À JOUR EN TEMPS RÉEL VIA SOCKET.IO ──────
// Quand l'admin enregistre la matrice, tous les onglets ouverts
// reçoivent l'évènement et rechargent la page automatiquement.
let _justSavedAt = 0; // timestamp pour éviter de se recharger soi-même
function _setupSocketListener() {
  if (typeof io !== 'function') return;
  try {
    const sock = io();
    sock.on('permissions-updated', (data) => {
      if (!data || !data.matrix) return;
      _LOADED_MATRIX = data.matrix;
      // Si c'est nous qui venons de sauvegarder (dans les 3 dernières secondes),
      // on ne recharge pas — on a déjà la bonne matrice en mémoire.
      if (Date.now() - _justSavedAt < 3000) return;
      console.log('[Permissions] Matrice mise à jour en temps réel — rechargement...');
      // Affiche un petit message si possible
      try {
        const div = document.createElement('div');
        div.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#0E4B47;color:#fff;padding:12px 22px;border-radius:10px;font-family:Inter,sans-serif;font-weight:600;z-index:99999;box-shadow:0 8px 24px rgba(0,0,0,.2)';
        div.textContent = '🔄 Permissions mises à jour — rechargement…';
        document.body.appendChild(div);
      } catch {}
      setTimeout(() => window.location.reload(), 800);
    });
  } catch (e) {}
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _setupSocketListener);
} else {
  _setupSocketListener();
}

// ─── STOCKAGE / CHARGEMENT DE LA MATRICE ────────────────────
const PERMISSIONS_STORAGE_KEY = 'permissions_matrix_v1';

// Fusionne deeply override sur top de base. Les valeurs définies dans override priment.
function _deepMerge(base, override) {
  const out = JSON.parse(JSON.stringify(base));
  if (!override || typeof override !== 'object') return out;
  for (const k of Object.keys(override)) {
    if (override[k] && typeof override[k] === 'object' && !Array.isArray(override[k])) {
      out[k] = _deepMerge(out[k] || {}, override[k]);
    } else {
      out[k] = override[k];
    }
  }
  return out;
}

function loadPermissionsMatrix() {
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(PERMISSIONS_STORAGE_KEY) || 'null');
  } catch {}
  // Fusionne TOUJOURS la matrice stockée par dessus la matrice par défaut.
  // Comme ça, les pages/permissions ajoutées plus tard au logiciel obtiennent
  // automatiquement leurs valeurs par défaut, et seules les modifications
  // explicites de l'admin sont préservées.
  return _deepMerge(DEFAULT_PERMISSIONS_MATRIX, stored || {});
}

// Sauvegarde la matrice. Retourne une promesse avec success/error.
function savePermissionsMatrix(matrix) {
  // Mise à jour immédiate de la matrice EN MÉMOIRE (source de vérité)
  _LOADED_MATRIX = matrix;
  _justSavedAt = Date.now(); // évite de se recharger soi-même via Socket.io
  localStorage.setItem(PERMISSIONS_STORAGE_KEY, JSON.stringify(matrix));
  return fetch('/admin/permissions-matrix', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matrix })
  }).then(async r => {
    const ctype = r.headers.get('content-type') || '';
    if (!ctype.includes('application/json')) {
      throw new Error(`Réponse non-JSON (${r.status}). Le serveur Node n'a probablement pas été redémarré pour activer la route /admin/permissions-matrix.`);
    }
    const data = await r.json();
    if (!data.success) throw new Error(data.error || 'Erreur serveur');
    return data;
  });
}

function resetPermissionsMatrix() {
  localStorage.removeItem(PERMISSIONS_STORAGE_KEY);
  return JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS_MATRIX));
}

// Charge la matrice depuis le serveur (à appeler au démarrage)
async function syncPermissionsMatrixFromServer() {
  try {
    const r = await fetch('/admin/permissions-matrix');
    if (!r.ok) return;
    const data = await r.json();
    if (data && data.matrix) {
      localStorage.setItem(PERMISSIONS_STORAGE_KEY, JSON.stringify(data.matrix));
    }
  } catch {}
}

// ─── VÉRIFICATION GRANULAIRE ────────────────────────────────
// hasPermission('planning.html', 'modify_shift', 'Manager') → true/false
function hasPermission(page, permissionId, role) {
  if (!role) return false;
  if (role === 'Admin') return true;
  const matrix = _LOADED_MATRIX || (typeof DEFAULT_PERMISSIONS_MATRIX !== 'undefined' ? DEFAULT_PERMISSIONS_MATRIX : null);
  if (!matrix || !matrix[role]) return false;
  if (matrix[role]._all === true) return true;
  const pagePerms = matrix[role][page];
  if (!pagePerms) return false;
  if (permissionId !== 'access' && pagePerms.access === false) return false;
  return pagePerms[permissionId] === true;
}

// Helpers pour le code utilisateur
function can(permissionId, page) {
  const user = getCurrentUser();
  if (!user || !user.role) return false;
  page = page || getCurrentPage();
  return hasPermission(page, permissionId, user.role);
}

// ─── APPLICATION AUTOMATIQUE DES PERMISSIONS SUR LES BOUTONS ──
//
// Usage dans le HTML :
//   <button data-perm="modify_shift">Modifier</button>
//   <button data-perm="export" data-perm-page="rapports.html">PDF</button>
//   <button data-perm="delete_shift" data-perm-mode="disable">Supprimer</button>
//
// data-perm-mode = "hide" (défaut) | "disable"
// Si data-perm-page absent, on prend la page courante.
//
function applyButtonPermissions(root) {
  const user = getCurrentUser();
  if (!user || !user.role) return;
  const role = user.role;
  const currentPage = getCurrentPage();
  const elements = (root || document).querySelectorAll('[data-perm]');
  elements.forEach(el => {
    const permId = el.getAttribute('data-perm');
    const page = el.getAttribute('data-perm-page') || currentPage;
    const mode = el.getAttribute('data-perm-mode') || 'hide';
    const allowed = hasPermission(page, permId, role);
    if (allowed) {
      // Permission OK : on s'assure que l'élément n'est pas marqué bloqué
      if (el._permWasHidden) {
        el.style.display = el._permOriginalDisplay || '';
        el._permWasHidden = false;
      }
      if (el._permWasDisabled) {
        el.disabled = false;
        el.removeAttribute('aria-disabled');
        el.style.opacity = '';
        el.style.cursor = '';
        el.style.pointerEvents = '';
        el._permWasDisabled = false;
      }
      el.title = el._permOriginalTitle || el.title || '';
    } else {
      if (mode === 'disable') {
        if (!el._permWasDisabled) el._permOriginalTitle = el.title || '';
        el.disabled = true;
        el.setAttribute('aria-disabled', 'true');
        el.style.opacity = '0.4';
        el.style.cursor = 'not-allowed';
        el.style.pointerEvents = 'none';
        el.title = `Permission requise : ${permId}`;
        el._permWasDisabled = true;
      } else {
        if (!el._permWasHidden) el._permOriginalDisplay = el.style.display || '';
        el.style.display = 'none';
        el._permWasHidden = true;
      }
    }
  });
}

// Auto-application au chargement de chaque page + après sync
function _autoApplyButtonPermissions() {
  applyButtonPermissions();
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _autoApplyButtonPermissions);
  } else {
    _autoApplyButtonPermissions();
  }
  window.addEventListener('permissions-synced', _autoApplyButtonPermissions);
}

// ─── EXPORT GLOBAL ──────────────────────────────────────────
window.PermissionsAPI = {
  ROLE_HIERARCHY,
  ROLE_INFO,
  PAGE_PERMISSIONS,
  PERMISSIONS_CATALOG,
  DEFAULT_PERMISSIONS_MATRIX,
  getCurrentUser,
  getCurrentPage,
  canAccess,
  getAllowedPagesForRole,
  requireAuth,
  filterModulesByRole,
  // Système granulaire (Discord-style)
  loadPermissionsMatrix,
  savePermissionsMatrix,
  resetPermissionsMatrix,
  syncPermissionsMatrixFromServer,
  hasPermission,
  can,
  applyButtonPermissions,
  findFirstAllowedPage
};
