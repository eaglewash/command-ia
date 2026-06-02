// ═══════════════════════════════════════════════════════════════════════════
// INTÉGRATION UBER EATS
// ═══════════════════════════════════════════════════════════════════════════
// Reçoit les commandes Uber Eats via webhook, les accepte automatiquement
// (si les identifiants API sont configurés) et les affiche sur le KDS cuisine.
//
// Mode "sans identifiants" : le module fonctionne quand même. Le webhook accepte
// les commandes qui contiennent déjà le détail (utile pour tester via /simulate),
// et l'auto-accept est simplement journalisé au lieu d'être envoyé à Uber.
//
// Pour passer en production, renseigner dans .env :
//   UBEREATS_CLIENT_ID, UBEREATS_CLIENT_SECRET   → identifiants OAuth Uber
//   UBEREATS_WEBHOOK_SECRET                        → secret de signature des webhooks
// et mapper chaque store Uber → restaurant dans ubereats-stores.json :
//   { "<uber_store_id>": "<restaurantId interne>" }
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CLIENT_ID      = process.env.UBEREATS_CLIENT_ID || '';
const CLIENT_SECRET  = process.env.UBEREATS_CLIENT_SECRET || '';
const WEBHOOK_SECRET = process.env.UBEREATS_WEBHOOK_SECRET || '';
const AUTO_ACCEPT    = (process.env.UBEREATS_AUTO_ACCEPT || 'true') !== 'false';

const TOKEN_URL = 'https://login.uber.com/oauth/v2/token';
const API_BASE  = 'https://api.uber.com/v1/eats';

const STORES_FILE = path.join(__dirname, '..', 'ubereats-stores.json');

const hasCreds = () => !!(CLIENT_ID && CLIENT_SECRET);

// ─── Mapping store Uber → restaurant interne ───────────────────────────────
function loadStoreMap() {
  try { return JSON.parse(fs.readFileSync(STORES_FILE, 'utf8')); }
  catch { return {}; }
}
function resolveRestaurantId(uberStoreId) {
  const map = loadStoreMap();
  return map[uberStoreId] || map['*'] || process.env.UBEREATS_DEFAULT_RESTAURANT || 'global';
}

// ─── OAuth (client_credentials) avec cache du token ────────────────────────
let _token = null;
let _tokenExp = 0;
async function getToken() {
  if (!hasCreds()) throw new Error('Identifiants Uber Eats absents');
  if (_token && Date.now() < _tokenExp - 60000) return _token;
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'client_credentials',
    scope: 'eats.order eats.store'
  });
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!r.ok) throw new Error('OAuth Uber échoué: ' + r.status);
  const j = await r.json();
  _token = j.access_token;
  _tokenExp = Date.now() + (j.expires_in || 3600) * 1000;
  return _token;
}

// ─── Vérification de la signature du webhook (HMAC SHA256) ─────────────────
function verifySignature(rawBody, signature) {
  if (!WEBHOOK_SECRET) return true; // pas de secret configuré → on ne bloque pas (dev)
  if (!rawBody || !signature) return false;
  const expected = crypto.createHmac('sha256', WEBHOOK_SECRET)
    .update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch { return false; }
}

// ─── Récupérer le détail d'une commande depuis l'API Uber ──────────────────
async function fetchOrder(orderId) {
  const token = await getToken();
  const r = await fetch(`${API_BASE}/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!r.ok) throw new Error('Récupération commande Uber échouée: ' + r.status);
  return r.json();
}

// ─── Accepter une commande côté Uber ───────────────────────────────────────
async function acceptOrder(orderId) {
  if (!hasCreds()) {
    console.log(`[UberEats] (simulation) accept commande ${orderId} — pas d'identifiants API`);
    return { simulated: true };
  }
  const token = await getToken();
  const r = await fetch(`${API_BASE}/orders/${orderId}/accept_pos_order`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'auto-accept' })
  });
  if (!r.ok) console.log(`[UberEats] accept échoué ${orderId}: ${r.status}`);
  return r.ok ? { accepted: true } : { accepted: false, status: r.status };
}

// ─── Mapper une commande Uber → format commande interne / KDS ──────────────
function mapUberOrderToCommande(order, restaurantId, nextId) {
  const cart = order.cart || {};
  const rawItems = cart.items || [];

  // items[] pour le KDS (name + qty), panierRaw pour la déduction de stock
  const items = [];
  const panierRaw = [];
  const modifs = [];

  for (const it of rawItems) {
    const nom = it.title || it.name || 'Article';
    const qty = it.quantity || 1;
    items.push({ name: nom, qty });

    // Modificateurs / options choisis
    const mods = [];
    for (const grp of (it.selected_modifier_groups || it.modifier_groups || [])) {
      for (const opt of (grp.selected_items || grp.items || [])) {
        if (opt.title || opt.name) mods.push(opt.title || opt.name);
      }
    }
    if (it.special_instructions) mods.push(it.special_instructions);
    const modStr = mods.join(', ');
    if (modStr) modifs.push(`${nom} : ${modStr}`);

    panierRaw.push({ nom, quantite: qty, modifications: modStr });
  }

  const sandwichStr = items.map(i => (i.qty > 1 ? `${i.qty}x ${i.name}` : i.name)).join(', ') || '—';
  const displayId = order.display_id || order.id || '';
  const eaterName = (order.eater && (order.eater.first_name || order.eater.name)) || 'Client Uber Eats';

  return {
    id: nextId,
    name: eaterName,
    phone: '',
    sandwich: sandwichStr,
    boisson: '',
    option: '',
    accompagnement: '',
    dessert: '',
    modif: modifs.join(' | '),
    allergy: '',
    surPlace: false,                 // Uber Eats = toujours à emporter / livraison
    restaurantId,
    restaurant: '',
    // Champs spécifiques plateforme (affichés sur le KDS)
    source: 'ubereats',
    platform: 'Uber Eats',
    platformOrderId: order.id || '',
    platformDisplayId: displayId,
    // Format attendu par l'écran cuisine (socket new-order)
    items,
    panierRaw,
    note: `Uber Eats #${displayId}`,
    urgent: false,
    allergies: [],
    timestamp: Date.now(),
    state: AUTO_ACCEPT ? 'validated' : 'new',
    chronoStart: AUTO_ACCEPT ? Date.now() : null,
    chronoEnd: null,
    createdAt: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  };
}

/**
 * Enregistre les routes Uber Eats sur l'app Express.
 * @param {object} deps - dépendances injectées depuis index.js
 *   app, io, loadCommandesActives, saveCommandesActives, registerRestaurantInIndex, getNextId
 */
function registerUberEats(deps) {
  const { app, io, loadCommandesActives, saveCommandesActives, registerRestaurantInIndex, getNextId } = deps;

  // Cœur : transforme une commande Uber en commande interne et la pousse au KDS
  async function ingestOrder(order) {
    const uberStoreId = order.store && (order.store.id || order.store.partner_identifier) || order.store_id || '';
    const restaurantId = resolveRestaurantId(uberStoreId);
    await registerRestaurantInIndex(restaurantId);

    const commandes = await loadCommandesActives(restaurantId);
    const id = getNextId(commandes);
    const cmd = mapUberOrderToCommande(order, restaurantId, id);

    commandes.push(cmd);
    await saveCommandesActives(commandes, restaurantId);

    // Événements temps réel : nouvelle_commande (vue admin) + new-order (KDS) + kds-update
    io.emit('nouvelle_commande', cmd);
    io.emit('new-order', cmd);
    io.emit('kds-update', commandes);

    if (AUTO_ACCEPT && order.id) {
      acceptOrder(order.id).catch(e => console.log('[UberEats] accept erreur:', e.message));
    }
    console.log(`[UberEats] commande #${cmd.platformDisplayId} → restaurant ${restaurantId} (KDS)`);
    return cmd;
  }

  // ── Webhook officiel Uber Eats ──────────────────────────────────────────
  // Uber envoie une notification ; on récupère le détail via l'API si possible.
  app.post('/integrations/ubereats/webhook', async (req, res) => {
    try {
      const signature = req.headers['x-uber-signature'];
      if (!verifySignature(req.rawBody, signature)) {
        console.log('[UberEats] signature webhook invalide');
        return res.status(401).json({ error: 'signature invalide' });
      }

      const event = req.body || {};
      const type = event.event_type || event.type || '';

      // On ne traite que les notifications de commande
      if (type && !/order/i.test(type)) {
        return res.status(200).json({ ok: true, ignored: type });
      }

      // Cas 1 : le détail complet est déjà fourni (test / certains événements)
      let order = event.order || (event.cart ? event : null);

      // Cas 2 : seul l'id est fourni → on va chercher le détail via l'API
      if (!order) {
        const orderId = event.meta && (event.meta.resource_id || event.meta.order_id) || event.order_id;
        if (orderId && hasCreds()) {
          order = await fetchOrder(orderId);
        }
      }

      // On répond 200 vite (Uber réessaie sinon), puis on traite
      res.status(200).json({ ok: true });

      if (order) {
        ingestOrder(order).catch(e => console.log('[UberEats] ingest erreur:', e.message));
      } else {
        console.log('[UberEats] webhook reçu sans détail exploitable (identifiants API manquants ?)');
      }
    } catch (e) {
      console.log('[UberEats] webhook erreur:', e.message);
      if (!res.headersSent) res.status(500).json({ error: e.message });
    }
  });

  // ── Test sans identifiants : injecte une fausse commande Uber Eats ───────
  // POST /integrations/ubereats/simulate  { restaurantId? }
  app.post('/integrations/ubereats/simulate', async (req, res) => {
    try {
      const rid = req.body && req.body.restaurantId;
      const fakeOrder = {
        id: 'test_' + Date.now(),
        display_id: 'UE' + Math.floor(Math.random() * 9000 + 1000),
        store: { id: rid ? '__direct__' : 'demo-store' },
        eater: { first_name: 'Test Uber' },
        cart: {
          items: [
            { title: 'Burger Classic', quantity: 2, special_instructions: 'sans oignon',
              selected_modifier_groups: [{ selected_items: [{ title: 'Bacon' }] }] },
            { title: 'Frites', quantity: 1 },
            { title: 'Coca-Cola', quantity: 2 }
          ]
        }
      };
      const order = fakeOrder;
      const restaurantId = rid || resolveRestaurantId('demo-store');
      await registerRestaurantInIndex(restaurantId);
      const commandes = await loadCommandesActives(restaurantId);
      const cmd = mapUberOrderToCommande(order, restaurantId, getNextId(commandes));
      commandes.push(cmd);
      await saveCommandesActives(commandes, restaurantId);
      io.emit('nouvelle_commande', cmd);
      io.emit('new-order', cmd);
      io.emit('kds-update', commandes);
      console.log(`[UberEats] (simulate) commande ${cmd.platformDisplayId} → ${restaurantId}`);
      res.json({ success: true, commande: cmd });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── État de l'intégration (pour l'admin) ────────────────────────────────
  app.get('/integrations/ubereats/status', (req, res) => {
    res.json({
      connecte: hasCreds(),
      signatureVerifiee: !!WEBHOOK_SECRET,
      autoAccept: AUTO_ACCEPT,
      storesMappes: Object.keys(loadStoreMap()).length,
      webhookUrl: '/integrations/ubereats/webhook'
    });
  });

  console.log(`[UberEats] intégration prête — ${hasCreds() ? 'identifiants OK' : 'mode démo (sans identifiants)'}, auto-accept ${AUTO_ACCEPT ? 'ON' : 'OFF'}`);
}

module.exports = { registerUberEats, mapUberOrderToCommande, resolveRestaurantId };
