const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// ── MESSAGES AUTOMATIQUES ──
const autoMessages = require('./auto-messages');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG SÉCURITÉ (ajoutée lors du durcissement)
// ═══════════════════════════════════════════════════════════════════════════
// Origines autorisées pour CORS. En production, définir ALLOWED_ORIGINS
// (ex: "https://commande-ia.fr,https://www.commande-ia.fr"). Sinon on retombe
// sur PUBLIC_BASE_URL, et en dernier recours on reflète l'origine (dev).
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || process.env.PUBLIC_BASE_URL || '')
  .split(',').map(s => s.trim()).filter(Boolean);
// Cookie de session marqué Secure (HTTPS uniquement) en production.
const COOKIE_SECURE = process.env.NODE_ENV === 'production' || !!process.env.PUBLIC_BASE_URL;
const corsOptions = {
  origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : true,
  credentials: true
};
// Comparaison à temps constant (protège contre les attaques temporelles sur les hash).
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a), bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  try { return crypto.timingSafeEqual(ba, bb); } catch { return false; }
}
// Limiteur de débit en mémoire (anti brute-force login / TOTP).
const _rateBuckets = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const rec = _rateBuckets.get(key);
  if (!rec || now - rec.first > windowMs) { _rateBuckets.set(key, { count: 1, first: now }); return true; }
  rec.count++;
  return rec.count <= max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _rateBuckets) { if (now - v.first > 3600000) _rateBuckets.delete(k); }
}, 3600000);

// ─── NODEMAILER ──────────────────────────────────────────────────────────────
const nodemailer = require('nodemailer');
function getMailer() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return null;
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
  });
}

let twilioClient, deepgram;
try {
  const twilio = require('twilio');
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
} catch(e) { console.log('Twilio non disponible'); }
try {
  const { createClient } = require('@deepgram/sdk');
  deepgram = createClient(process.env.DEEPGRAM_API_KEY);
} catch(e) { console.log('Deepgram non disponible'); }
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : '*', credentials: true }
});

// ─── SESSIONS AUTH (JWT stateless — compatible Vercel serverless) ─────────────
const SESSION_TTL = 8 * 60 * 60; // 8 heures en secondes
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

function base64url(str) {
  return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function createSession(userId, email, role) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ userId, email, role, exp: Math.floor(Date.now() / 1000) + SESSION_TTL }));
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `${header}.${payload}.${sig}`;
}

function getSession(req) {
  let token = null;
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(/(?:^|;\s*)cia_session=([A-Za-z0-9\-_.]+)/);
  if (match) token = match[1];
  if (!token) {
    const auth = req.headers.authorization || '';
    if (auth.startsWith('Bearer ')) token = auth.slice(7);
  }
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, sig] = parts;
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    if (sig !== expected) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64').toString());
    if (Math.floor(Date.now() / 1000) > data.exp) return null;
    return data;
  } catch { return null; }
}

// Middleware : vérifie qu'une session valide existe
function requireSession(req, res, next) {
  const sess = getSession(req);
  if (!sess) return res.status(401).json({ error: 'Non authentifié' });
  req.session = sess;
  next();
}

// Middleware : vérifie le rôle Admin
function requireAdmin(req, res, next) {
  const sess = getSession(req);
  if (!sess) return res.status(401).json({ error: 'Non authentifié' });
  if (sess.role !== 'Admin') return res.status(403).json({ error: 'Accès réservé à l\'administrateur' });
  req.session = sess;
  next();
}

// Derrière un reverse-proxy (Nginx/Render/Heroku) : req.ip et Secure cookies corrects.
app.set('trust proxy', 1);
app.use(cors(corsOptions));
app.use(express.json({ limit: '2mb' })); // limite anti-DoS sur les gros payloads
// En-têtes de sécurité. (Pas de CSP stricte ici pour ne pas casser les scripts
// inline existants — voir le rapport pour la marche à suivre côté CSP.)
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('X-XSS-Protection', '0');
  // microphone laissé autorisé (commande vocale) ; on bloque géoloc + caméra par défaut.
  res.set('Permissions-Policy', 'geolocation=(), camera=()');
  if (COOKIE_SECURE) res.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  next();
});
app.get('/', (req, res) => res.redirect('/login.html'));
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res, filePath) => {
    // Pas de cache pour HTML, JS et CSS — pour que les modifications
    // (notamment de permissions.js) soient visibles immédiatement.
    if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
    }
  }
}));

// Toutes les réponses API JSON → jamais mis en cache par le navigateur
app.use((req, res, next) => {
  const orig = res.json.bind(res);
  res.json = function(body) {
    if (!res.headersSent) {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.set('Pragma', 'no-cache');
    }
    return orig(body);
  };
  next();
});

// ═══════════════════════════════════════════════════════════════════════════
// SÉCURITÉ — GATE D'AUTHENTIFICATION GLOBAL
// Toute requête API exige une session valide, SAUF la liste publique ci-dessous.
// Les fichiers statiques (HTML/JS/CSS/images) sont servis AVANT ce middleware,
// donc les pages se chargent normalement ; seules les routes de données sont
// protégées. Le cookie de session (httpOnly) est envoyé automatiquement par le
// navigateur sur les requêtes same-origin.
//
// Pages publiques (sans login) confirmées : landing.html, login.html,
// voice-client.html (commande vocale client) et tv-display.html (écran cuisine).
// ═══════════════════════════════════════════════════════════════════════════
const PUBLIC_ROUTES = new Set([
  'GET /ping',
  'POST /auth/login',
  'POST /auth/logout',
  'POST /contact',                       // formulaire de contact (landing)
  'POST /api/order/voice/session',       // commande vocale client
  'POST /api/order/voice/message',
  'POST /api/order/voice/confirm',
  'GET /config/hidden-pages'             // utilisé par le menu burger sur toutes les pages
]);
function isPublicRequest(req) {
  if (req.method === 'OPTIONS') return true;                                   // préflight CORS
  if (req.path.startsWith('/socket.io/')) return true;                         // websockets
  if (req.path.startsWith('/twilio/')) return true;                            // webhooks téléphonie (externes)
  if (req.method === 'GET' && req.path.startsWith('/mon-menu/')) return true;  // carte (TV / QR)
  if (req.method === 'GET' && req.path.startsWith('/mon-restaurant/')) return true; // infos resto (écran TV cuisine sans login)
  return PUBLIC_ROUTES.has(req.method + ' ' + req.path);
}
app.use((req, res, next) => {
  if (isPublicRequest(req)) return next();
  const sess = getSession(req);
  if (!sess) return res.status(401).json({ error: 'Non authentifié — veuillez vous connecter' });
  req.session = sess;
  next();
});

// Routes strictement réservées à l'Admin (vérifié : appelées uniquement par admin.html,
// ou opérations critiques). Le GET de /admin/permissions-matrix reste ouvert à toute
// session car permissions.js l'utilise sur chaque page.
const ADMIN_ONLY_PATTERNS = [
  /^\/demo-accounts(\/|$)/,                  // comptes démo prospects (contiennent des mots de passe)
  /^\/admin\/api-keys(\/|$)/,                // clés développeur
  /^\/api\/admin\/numbers(\/|$)/,            // achat/gestion des numéros de téléphone
  /^\/admin\/feedback-delete-requests(\/|$)/ // demandes RGPD
];
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  const isAdminOnly =
    ADMIN_ONLY_PATTERNS.some(rx => rx.test(req.path)) ||
    ((req.method === 'PUT' || req.method === 'DELETE') && req.path.startsWith('/admin/permissions-matrix')) ||
    (req.method === 'PATCH' && /^\/admin\/employes\/[^/]+\/role$/.test(req.path)); // anti élévation de privilège
  if (!isAdminOnly) return next();
  // getSession() lit le cookie directement — req.session n'est pas encore défini ici
  const sess = getSession(req);
  if (!sess) return res.status(401).json({ error: 'Non authentifié' });
  // Double vérification : rôle Admin OU email admin connu (fallback si session legacy)
  const isAdmin = sess.role === 'Admin' || sess.email === ADMIN_EMAIL;
  if (!isAdmin) return res.status(403).json({ error: 'Accès réservé à l\'administrateur' });
  req.session = sess; // propagé aux handlers suivants
  next();
});

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DB_RESTAURANTS = '2954180a10da476da3f20db69bd7bdbf';
const DB_EMPLOYES = '26a7bfc0e3b147aeae55e87dffeee763';
const ADMIN_EMAIL = 'quentin@commande-ia.fr';
const DB_MENUS = 'aa3d9c7174e641f2a82265a8fca8d251';
const DB_STOCKS = '2bab39532bb24fe3b874a7eb92415f8e';
const DB_REPORTS = '907eb7b8312842be8271662c5d05638f';
const DB_RESERVATIONS = (process.env.DB_RESERVATIONS || '628b003667334abba3cfa3dccf48ff64').trim();

const notionHeaders = {
  'Authorization': `Bearer ${NOTION_TOKEN}`,
  'Content-Type': 'application/json',
  'Notion-Version': '2022-06-28'
};

// ─── PERSISTENCE ARCHIVES (par restaurant) ───────────
const ARCHIVES_DIR = process.env.VERCEL ? path.join('/tmp', 'archives') : path.join(__dirname, 'archives');
if (!fs.existsSync(ARCHIVES_DIR)) fs.mkdirSync(ARCHIVES_DIR);

// ─── TICKETS SUPPORT ─────────────────────────────────
const TICKETS_FILE = path.join(__dirname, 'tickets.json');
let ticketCounter = 1;
function loadTickets() {
  try { if (fs.existsSync(TICKETS_FILE)) { const d = JSON.parse(fs.readFileSync(TICKETS_FILE, 'utf8')) || []; if (d.length) ticketCounter = Math.max(...d.map(t => parseInt((t.id||'0').replace(/\D/g,'')) || 0)) + 1; return d; } } catch(e) {}
  return [];
}
function saveTickets(data) {
  try { fs.writeFileSync(TICKETS_FILE, JSON.stringify(data, null, 2)); } catch(e) {}
}
function nextTicketId() { return 'TKT-' + String(ticketCounter++).padStart(4, '0'); }
// Initialiser le compteur
loadTickets();

// ─── MESSAGERIE (persistante par restaurant) ──────────
const MESSAGES_DIR = process.env.VERCEL ? path.join('/tmp', 'messages') : path.join(__dirname, 'messages');
if (!fs.existsSync(MESSAGES_DIR)) fs.mkdirSync(MESSAGES_DIR);

function msgFile(restaurantId) {
  const safe = (restaurantId || 'global').replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(MESSAGES_DIR, `messages_${safe}.json`);
}
function loadMessages(restaurantId) {
  try {
    const f = msgFile(restaurantId);
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8')) || [];
  } catch(e) {}
  return [];
}
function saveMessages(restaurantId, data) {
  try { fs.writeFileSync(msgFile(restaurantId), JSON.stringify(data, null, 2)); }
  catch(e) { console.log('Erreur sauvegarde messages:', e.message); }
}

// ─── BROADCASTS (persistants sur fichier) ─────────────
const BROADCASTS_FILE = path.join(__dirname, 'broadcasts.json');
function loadBroadcasts() {
  try { if (fs.existsSync(BROADCASTS_FILE)) return JSON.parse(fs.readFileSync(BROADCASTS_FILE, 'utf8')) || []; }
  catch(e) {}
  return [];
}
function saveBroadcasts(data) {
  try { fs.writeFileSync(BROADCASTS_FILE, JSON.stringify(data, null, 2)); }
  catch(e) {}
}

function archiveFile(restaurantId) {
  const safe = (restaurantId || 'global').replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(ARCHIVES_DIR, `archives_${safe}.json`);
}
function loadArchivesForRestaurant(restaurantId) {
  try {
    const file = archiveFile(restaurantId);
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')) || [];
  } catch(e) { console.log('Erreur lecture archives:', e.message); }
  return [];
}
function saveArchivesForRestaurant(restaurantId, data) {
  try { fs.writeFileSync(archiveFile(restaurantId), JSON.stringify(data, null, 2)); }
  catch(e) { console.log('Erreur sauvegarde archives:', e.message); }
}

// Migration: si ancien archives.json existe, le distribuer par restaurant
function migrateOldArchives() {
  const oldFile = path.join(__dirname, 'archives.json');
  if (!fs.existsSync(oldFile)) return;
  try {
    const old = JSON.parse(fs.readFileSync(oldFile, 'utf8')) || [];
    const byRestaurant = {};
    old.forEach(a => {
      const rid = a.restaurantId || 'global';
      if (!byRestaurant[rid]) byRestaurant[rid] = [];
      byRestaurant[rid].push(a);
    });
    Object.entries(byRestaurant).forEach(([rid, data]) => {
      const file = archiveFile(rid);
      if (!fs.existsSync(file)) saveArchivesForRestaurant(rid, data);
    });
    fs.renameSync(oldFile, oldFile + '.migrated');
    console.log('Archives migrées par restaurant.');
  } catch(e) { console.log('Erreur migration archives:', e.message); }
}
migrateOldArchives();

function todayStr() { return new Date().toISOString().split('T')[0]; }

// archives en mémoire : indexé par restaurantId pour le temps réel
const archivesMemory = {}; // { restaurantId: [...] }
function getMemoryArchives(restaurantId) {
  const rid = restaurantId || 'global';
  if (!archivesMemory[rid]) {
    archivesMemory[rid] = loadArchivesForRestaurant(rid);
  }
  return archivesMemory[rid];
}

// ─── PERSISTANCE DES COMMANDES ACTIVES ───────────────
const COMMANDES_FILE = path.join(__dirname, 'commandes-actives.json');
function saveCommandesActives() {
  try { fs.writeFileSync(COMMANDES_FILE, JSON.stringify(commandes, null, 2)); } catch(e) {}
}
function loadCommandesActives() {
  try {
    if (fs.existsSync(COMMANDES_FILE)) return JSON.parse(fs.readFileSync(COMMANDES_FILE, 'utf8')) || [];
  } catch(e) {}
  return [];
}

let commandes = loadCommandesActives();
let nextId = 1;
// Calculer le prochain ID en lisant tous les fichiers d'archives
try {
  const files = fs.readdirSync(ARCHIVES_DIR).filter(f => f.endsWith('.json'));
  let maxId = commandes.length ? Math.max(...commandes.map(c => c.id || 0)) : 0;
  files.forEach(f => {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(ARCHIVES_DIR, f), 'utf8')) || [];
      data.forEach(a => { if ((a.id || 0) > maxId) maxId = a.id; });
    } catch(e) {}
  });
  if (maxId >= nextId) nextId = maxId + 1;
} catch(e) {}

// Sessions vocales (déclaré ICI, avant les routes)
const voiceSessions = {};

// ─── HELPERS STOCK / INGRÉDIENTS ─────────────────────

/**
 * Parse une chaîne d'ingrédients avec quantités optionnelles.
 * Formats acceptés : "2 viande 10:1", "3x fromage", "pain", "2.5 sauce"
 * Retourne [{nom, qty}] dédupliqués.
 */
function parseIngredientsWithQty(str) {
  if (!str || !str.trim()) return [];
  const seen = new Set();
  const result = [];
  str.split(/[,;\n]+/).forEach(part => {
    part = part.trim();
    if (part.length < 2) return;
    // Détecter un préfixe numérique : "2 pain", "3x fromage", "2.5 sauce" — le nom doit commencer par une lettre
    const m = part.match(/^(\d+(?:[.,]\d+)?)\s*[xX×]?\s*([a-zA-ZÀ-ÿ\u0080-\uFFFF].+)$/);
    const qty = m ? parseFloat(m[1].replace(',', '.')) || 1 : 1;
    const nom = m ? m[2].trim() : part.trim();
    const key = nom.toLowerCase().trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push({ nom, qty });
  });
  return result;
}

/**
 * Parse une chaîne d'ingrédients séparés par virgule/point-virgule/retour à la ligne.
 * Retourne un tableau de noms nettoyés et dédupliqués (casse ignorée) — sans quantités.
 */
function parseIngredients(str) {
  return parseIngredientsWithQty(str).map(i => i.nom);
}

/**
 * Pour un produit donné (nom + ingrédients), crée dans Notion Stock
 * les entrées manquantes (1 unité par ingrédient, sans doublon).
 * Retourne { created: [...], skipped: [...] }
 */
// fetch avec timeout pour éviter les blocages sur les appels Notion
function fetchTimeout(url, options, ms = 6000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

async function syncIngredientStock(ingredientsStr, restaurant, restaurantId) {
  const ingredients = parseIngredients(ingredientsStr);
  if (!ingredients.length || !restaurantId) return { created: [], skipped: [] };

  // Récupérer le stock existant pour ce restaurant
  const existingRes = await fetchTimeout(`https://api.notion.com/v1/databases/${DB_STOCKS}/query`, {
    method: 'POST', headers: notionHeaders,
    body: JSON.stringify({
      filter: { property: 'Restaurant ID', rich_text: { equals: restaurantId } }
    })
  });
  const existingData = await existingRes.json();

  // Map nom (lowercase) → page id
  const existingMap = {};
  for (const p of (existingData.results || [])) {
    const nom = p.properties['Produit']?.title?.[0]?.plain_text || '';
    if (nom) existingMap[nom.toLowerCase().trim()] = p.id;
  }

  const created = [], skipped = [];

  for (const ingredient of ingredients) {
    const key = ingredient.toLowerCase().trim();
    if (existingMap[key]) {
      skipped.push(ingredient);
      continue;
    }
    // Créer l'ingrédient dans le stock
    await fetchTimeout('https://api.notion.com/v1/pages', {
      method: 'POST', headers: notionHeaders,
      body: JSON.stringify({
        parent: { database_id: DB_STOCKS },
        properties: {
          'Produit':              { title: [{ text: { content: ingredient } }] },
          'Quantité actuelle':    { number: 1 },
          'Quantité initiale':    { number: 1 },
          'Seuil alerte':         { number: 1 },
          'Unité':                { select: { name: 'unité' } },
          'Statut':               { select: { name: 'Disponible' } },
          'Restaurant':           { rich_text: [{ text: { content: restaurant || '' } }] },
          'Restaurant ID':        { rich_text: [{ text: { content: restaurantId || '' } }] },
          'Dernière mise à jour': { rich_text: [{ text: { content: new Date().toLocaleString('fr-FR') } }] }
        }
      })
    });
    existingMap[key] = true; // évite les doublons dans le même batch
    created.push(ingredient);
  }

  console.log(`syncIngredientStock [${restaurant}] — créés: ${created.length} (${created.join(', ')}), ignorés: ${skipped.length}`);
  return { created, skipped };
}

function hashPassword(pwd) { return crypto.createHash('sha256').update(pwd).digest('hex'); }
function generatePassword() {
  // Aléa cryptographique (remplace Math.random qui est prévisible).
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const buf = crypto.randomBytes(10);
  let p = ''; for (let i = 0; i < 10; i++) p += chars[buf[i] % chars.length];
  return p;
}

// ─── COMMANDES ───────────────────────────────────────

app.get('/commandes', (req, res) => res.json(commandes));

app.get('/archives', (req, res) => {
  const { date, restaurantId } = req.query;
  const data = getMemoryArchives(restaurantId);
  const today = todayStr();
  const filterDate = date || today;
  res.json(data.filter(a => (a.archivedDate || today) === filterDate));
});

app.get('/archives/dates', (req, res) => {
  const { restaurantId } = req.query;
  const data = getMemoryArchives(restaurantId);
  const dates = [...new Set(data.map(a => a.archivedDate).filter(Boolean))].sort().reverse();
  res.json(dates);
});

app.post('/commandes', (req, res) => {
  const cmd = { id: nextId++, ...req.body, state: 'new', chronoStart: null, chronoEnd: null, createdAt: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) };
  commandes.push(cmd); saveCommandesActives();
  io.emit('nouvelle_commande', cmd);
  io.emit('new-order', cmd);        // alias écouté par kds.html et plan-salle.html
  io.emit('kds-update', commandes); // met à jour l'affichage KDS en temps réel
  res.json(cmd);
});

app.patch('/commandes/:id/valider', async (req, res) => {
  const cmd = commandes.find(c => c.id === parseInt(req.params.id));
  if (!cmd) return res.status(404).json({ error: 'Introuvable' });
  cmd.state = 'validated'; cmd.chronoStart = Date.now();
  saveCommandesActives();
  io.emit('commande_mise_a_jour', cmd);
  io.emit('kds-update', commandes);

  if (cmd.restaurantId) {
    try {
      // ── Étape 1 : Récupérer les produits commandés depuis le menu ──
      const menuRes = await fetch(`https://api.notion.com/v1/databases/${DB_MENUS}/query`, {
        method: 'POST', headers: notionHeaders,
        body: JSON.stringify({ filter: { property: 'Restaurant ID', rich_text: { equals: cmd.restaurantId } } })
      });
      const menuData = await menuRes.json();

      // Construire une map nomProduit → [{nom, qty}] (avec multiplicateurs de quantité)
      const menuMap = {};
      for (const p of (menuData.results || [])) {
        const nom = p.properties['Nom du produit']?.title?.[0]?.plain_text || '';
        const ing = p.properties['Ingrédients']?.rich_text?.[0]?.plain_text || '';
        if (nom) menuMap[nom.toLowerCase().trim()] = parseIngredientsWithQty(ing);
      }

      // ── Étape 2 : Identifier les produits et leurs modifications ──
      const ingredientsADeduire = new Map(); // nomIngredient → quantité à déduire

      // Fonction : trouver la clé dans menuMap (exacte → nettoyée → préfixe)
      function findMenuKey(rawToken) {
        const clean = rawToken.replace(/\s*\(.*?\)\s*/g, '').trim();
        if (Object.prototype.hasOwnProperty.call(menuMap, rawToken)) return rawToken;
        if (clean !== rawToken && Object.prototype.hasOwnProperty.call(menuMap, clean)) return clean;
        return Object.keys(menuMap).find(k =>
          (rawToken.startsWith(k + ' ') || clean.startsWith(k + ' ')) && k.length >= 3
        ) || null;
      }

      // Fonction : parser "sans cornichon, sans oignon" → Set d'ingrédients exclus
      function parseExclus(modificationsStr) {
        const exclu = new Set();
        if (!modificationsStr) return exclu;
        modificationsStr.toLowerCase().split(/[,;]+/).forEach(part => {
          const p = part.trim();
          // "sans cornichon" ou "sans les cornichons" ou "no pickles"
          const m = p.match(/^(?:sans|no|without)\s+(?:les?\s+|de\s+)?(.+)$/);
          if (m) exclu.add(m[1].trim().replace(/s$/, '')); // retire le pluriel final
        });
        return exclu;
      }

      // Chemin 1 — panierRaw disponible : déduction précise article par article
      const panierBrut = Array.isArray(cmd.panierRaw) ? cmd.panierRaw : [];

      if (panierBrut.length > 0) {
        for (const item of panierBrut) {
          const nomLow = (item.nom || '').toLowerCase().trim();
          const matchKey = findMenuKey(nomLow);
          if (!matchKey) {
            console.log(`[Stock] Produit "${nomLow}" non trouvé dans le menu — ignoré`);
            continue;
          }
          const qteCommande = item.quantite || 1; // nombre de fois ce produit est commandé
          const exclus = parseExclus(item.modifications || '');

          for (const ing of menuMap[matchKey]) {
            // ing = { nom, qty } — qty = multiplicateur de l'ingrédient dans la recette
            const ingNom = ing.nom || ing; // rétro-compat si jamais string
            const ingQtyRecette = ing.qty || 1;
            const ingKey = ingNom.toLowerCase().trim();
            // Vérifier si cet ingrédient est exclu par les modifications du client
            const estExclu = exclus.size > 0 && [...exclus].some(ex => ingKey.includes(ex) || ex.includes(ingKey));
            if (estExclu) {
              console.log(`[Stock] "${ingNom}" exclu (modif: "${item.modifications}") — non déduit`);
              continue;
            }
            // Déduire : qté recette × qté commandée (ex: 3x Big Mac avec 2 viandes = 6 viandes)
            const totalADeduire = ingQtyRecette * qteCommande;
            console.log(`[Stock] ${ingNom}: -${totalADeduire} (${ingQtyRecette} recette × ${qteCommande} commandé)`);
            ingredientsADeduire.set(ingKey, (ingredientsADeduire.get(ingKey) || 0) + totalADeduire);
          }
        }
      } else {
        // Chemin 2 — Fallback : utiliser les champs formatés (commandes manuelles sans panierRaw)
        // Tenter de parser cmd.modif pour les exclusions globales
        const exclusGlobal = parseExclus(cmd.modif || '');

        const champsCommande = [cmd.sandwich, cmd.boisson, cmd.accompagnement, cmd.dessert, cmd.option].filter(Boolean);
        for (const champ of champsCommande) {
          const tokens = champ.split(/[,|]+/).map(s => s.trim().replace(/^\d+x\s*/i, '').toLowerCase());
          for (const token of tokens) {
            if (!token) continue;
            const matchKey = findMenuKey(token);
            if (!matchKey) {
              console.log(`[Stock] Produit "${token}" non trouvé dans le menu — ignoré`);
              continue;
            }
            for (const ing of menuMap[matchKey]) {
              const ingNom = ing.nom || ing;
              const ingQtyRecette = ing.qty || 1;
              const ingKey = ingNom.toLowerCase().trim();
              const estExclu = exclusGlobal.size > 0 && [...exclusGlobal].some(ex => ingKey.includes(ex) || ex.includes(ingKey));
              if (estExclu) {
                console.log(`[Stock] "${ingNom}" exclu (modif global) — non déduit`);
                continue;
              }
              ingredientsADeduire.set(ingKey, (ingredientsADeduire.get(ingKey) || 0) + ingQtyRecette);
            }
          }
        }
      }

      if (ingredientsADeduire.size === 0) {
        console.log('Aucun ingrédient trouvé pour cette commande, déduction stock ignorée');
      } else {
        // ── Étape 3 : Récupérer le stock et déduire ──
        const stockRes = await fetch(`https://api.notion.com/v1/databases/${DB_STOCKS}/query`, {
          method: 'POST', headers: notionHeaders,
          body: JSON.stringify({ filter: { property: 'Restaurant ID', rich_text: { equals: cmd.restaurantId } } })
        });
        const stockData = await stockRes.json();

        for (const stockPage of (stockData.results || [])) {
          const nomStock = stockPage.properties['Produit']?.title?.[0]?.plain_text || '';
          const nomStockKey = nomStock.toLowerCase().trim();
          const qteADeduire = ingredientsADeduire.get(nomStockKey) || 0;
          if (!qteADeduire) continue;

          const qtyActuelle = stockPage.properties['Quantité actuelle']?.number ?? 0;
          const seuilAlerte = stockPage.properties['Seuil alerte']?.number || 1;
          const newQty = Math.max(0, qtyActuelle - qteADeduire);
          const statut = newQty <= 0 ? 'Rupture' : newQty <= seuilAlerte ? 'Alerte' : 'Disponible';

          await fetch(`https://api.notion.com/v1/pages/${stockPage.id}`, {
            method: 'PATCH', headers: notionHeaders,
            body: JSON.stringify({
              properties: {
                'Quantité actuelle': { number: newQty },
                'Statut':            { select: { name: statut } },
                'Dernière mise à jour': { rich_text: [{ text: { content: new Date().toLocaleString('fr-FR') } }] }
              }
            })
          });
          console.log(`Stock ingrédient déduit : ${nomStock} ${qtyActuelle} → ${newQty} (${statut})`);
        }
      }
    } catch (e) { console.log('Erreur déduction stock ingrédients:', e.message); }
  }

  res.json(cmd);
});

app.patch('/commandes/:id/prete', (req, res) => {
  const idx = commandes.findIndex(c => c.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Introuvable' });
  const cmd = commandes[idx];
  cmd.state = 'done'; cmd.chronoEnd = Date.now();
  cmd.archivedAt = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  cmd.archivedDate = todayStr();
  const rid = cmd.restaurantId || 'global';
  const restArchives = getMemoryArchives(rid);
  restArchives.unshift(cmd);
  saveArchivesForRestaurant(rid, restArchives);
  commandes.splice(idx, 1);
  saveCommandesActives();
  io.emit('commande_terminee', cmd);
  io.emit('kds-update', commandes);
  res.json(cmd);
});

app.patch('/commandes/:id/refuser', (req, res) => {
  const idx = commandes.findIndex(c => c.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Introuvable' });
  const cmd = commandes[idx];
  cmd.state = 'refused';
  cmd.archivedAt = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  cmd.archivedDate = todayStr();
  const rid = cmd.restaurantId || 'global';
  const restArchives = getMemoryArchives(rid);
  restArchives.unshift(cmd);
  saveArchivesForRestaurant(rid, restArchives);
  commandes.splice(idx, 1);
  saveCommandesActives();
  io.emit('commande_terminee', cmd);
  io.emit('order-cancelled', cmd);
  io.emit('kds-update', commandes);
  res.json(cmd);
});

// ─── AUTH ─────────────────────────────────────────────

// ─── Helper : retourne les permissions effectives pour un rôle donné ───
function getPermissionsForRole(role) {
  try {
    let matrix = null;
    if (fs.existsSync(PERMISSIONS_FILE)) {
      matrix = JSON.parse(fs.readFileSync(PERMISSIONS_FILE, 'utf8'));
    }
    // Charger la matrice par défaut côté serveur (copie depuis permissions.js)
    const DEFAULT = getDefaultPermissionsMatrix();
    // Fusion : par défaut + override stockée
    const out = JSON.parse(JSON.stringify(DEFAULT[role] || {}));
    if (matrix && matrix[role]) {
      Object.keys(matrix[role]).forEach(page => {
        if (page === '_all') { out._all = matrix[role][page]; return; }
        out[page] = Object.assign({}, out[page] || {}, matrix[role][page]);
      });
    }
    return out;
  } catch (e) {
    console.error('getPermissionsForRole err:', e);
    return {};
  }
}

// Matrice par défaut côté serveur (alignée sur DEFAULT_PERMISSIONS_MATRIX du front)
function getDefaultPermissionsMatrix() {
  return {
    Admin: { _all: true },
    Manager: {
      'index.html': { access: true, view_revenue: true, view_orders: true, manage_orders: true, view_archives: true },
      'admin.html': { access: false },
      'planning.html': { access: true, view_own: true, view_all: true, create_shift: true, modify_shift: true, delete_shift: true, manage_absences: true, use_templates: true, export: true },
      'stocks.html': { access: true, view: true, add_item: true, modify_qty: true, delete_item: true, view_alerts: true, order_supply: true },
      'kds.html': { access: true, view_orders: true, mark_ready: true, mark_done: true, reject_order: true },
      'plan-salle.html': { access: true, view: true, modify_layout: true, assign_table: true, open_ticket: true, close_ticket: true },
      'reservations.html': { access: true, view: true, create: true, modify: true, cancel: true, export: true },
      'paiement.html': { access: true, process: true, refund: true, apply_discount: true, cancel: true },
      'allergenes.html': { access: true, view: true, modify: true, export_pdf: true },
      'analytics.html': { access: true, view_revenue: true, view_costs: true, view_team_perf: true, export: true },
      'rapports.html': { access: true, view: true, generate: true, export: true, schedule: true },
      'crm.html': { access: true, view_clients: true, view_loyalty: true, modify_client: true, send_campaign: true, delete_client: false },
      'messagerie.html': { access: true, send_message: true, broadcast: true, delete_message: true },
      'feedback.html': { access: true, view: true, reply: true, hide: true }
    },
    Serveur: {
      'index.html': { access: true, view_revenue: false, view_orders: true, manage_orders: true, view_archives: false },
      'admin.html': { access: false },
      'planning.html': { access: true, view_own: true, view_all: true, create_shift: false, modify_shift: false, delete_shift: false, manage_absences: false, use_templates: false, export: false },
      'plan-salle.html': { access: true, view: true, modify_layout: false, assign_table: true, open_ticket: true, close_ticket: true },
      'reservations.html': { access: true, view: true, create: true, modify: true, cancel: false, export: false },
      'paiement.html': { access: true, process: true, refund: false, apply_discount: false, cancel: false },
      'allergenes.html': { access: true, view: true, modify: false, export_pdf: false },
      'messagerie.html': { access: true, send_message: true, broadcast: false, delete_message: false }
    },
    Cuisinier: {
      'index.html': { access: true, view_orders: true },
      'admin.html': { access: false },
      'planning.html': { access: true, view_own: true, view_all: true },
      'stocks.html': { access: true, view: true, modify_qty: true, view_alerts: true },
      'kds.html': { access: true, view_orders: true, mark_ready: true, mark_done: true },
      'allergenes.html': { access: true, view: true, modify: true, export_pdf: true },
      'messagerie.html': { access: true, send_message: true }
    },
    Barman: {
      'index.html': { access: true, view_orders: true },
      'admin.html': { access: false },
      'planning.html': { access: true, view_own: true, view_all: true },
      'stocks.html': { access: true, view: true, modify_qty: true, view_alerts: true },
      'kds.html': { access: true, view_orders: true, mark_ready: true, mark_done: true },
      'allergenes.html': { access: true, view: true },
      'messagerie.html': { access: true, send_message: true }
    },
  };
}

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

  // ── Anti brute-force : 10 tentatives / 15 min par IP+email ──
  const rlKey = 'login:' + (req.ip || 'x') + ':' + String(email).toLowerCase();
  if (!rateLimit(rlKey, 10, 15 * 60 * 1000)) {
    return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.' });
  }

  // ── Comptes démo @essai.demo ──
  if (email.endsWith('@essai.demo')) {
    const demos = readDemos();
    const demo = demos.find(d => d.demoEmail === email);
    if (!demo) return res.status(401).json({ error: 'Compte démo introuvable' });
    if (!safeEqual(demo.passwordHash || '', hashPassword(password))) return res.status(401).json({ error: 'Mot de passe incorrect' });
    // Maj stats connexion
    demo.lastLogin = new Date().toISOString();
    demo.loginCount = (demo.loginCount || 0) + 1;
    if (demo.statut === 'créé') demo.statut = 'connecté';
    try { saveDemos(demos); } catch (_) { /* filesystem read-only sur Vercel — ignoré */ }
    const token = createSession(demo.id, demo.demoEmail, 'Manager');
    res.setHeader('Set-Cookie', `cia_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL}${COOKIE_SECURE ? '; Secure' : ''}`);
    return res.json({
      success: true,
      accountType: 'demo',
      user: {
        id: demo.id,
        prenom: demo.prenom,
        nom: demo.nom,
        restaurant: demo.restaurant,
        email: demo.demoEmail,
        role: 'Manager',
        permissions: getPermissionsForRole('Manager')
      }
    });
  }

  try {
    const r = await fetch(`https://api.notion.com/v1/databases/${DB_EMPLOYES}/query`, {
      method: 'POST', headers: notionHeaders, body: JSON.stringify({})
    });
    const data = await r.json();
    if (!data.results?.length) return res.status(401).json({ error: 'Compte introuvable' });
    const page = data.results.find(p => p.properties['Email']?.email === email);
    if (!page) return res.status(401).json({ error: 'Compte introuvable' });
    const props = page.properties;
    const storedPwd = props['Mot de passe']?.rich_text?.[0]?.plain_text;
    const statut = props['Statut']?.select?.name;
    if (statut === 'Suspendu') return res.status(403).json({ error: 'Compte suspendu' });
    const roleFromNotion = props['Rôle']?.select?.name;
    if (roleFromNotion === 'Admin' && email !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    // Mot de passe de récupération d'urgence (admin uniquement, défini dans .env)
    const overridePwd = process.env.ADMIN_OVERRIDE_PASSWORD;
    const isAdminEmail = (email === ADMIN_EMAIL);
    const overrideOk   = isAdminEmail && overridePwd && safeEqual(overridePwd, password);
    if (!overrideOk && !safeEqual(storedPwd || '', hashPassword(password))) {
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }
    await fetch(`https://api.notion.com/v1/pages/${page.id}`, {
      method: 'PATCH', headers: notionHeaders,
      body: JSON.stringify({ properties: { 'Dernière connexion': { rich_text: [{ text: { content: new Date().toLocaleString('fr-FR') } }] } } })
    });
    // Normaliser les anciens libellés vers le système actuel
    const ROLE_NORM = { 'Hôte': 'Serveur', 'Cuisine': 'Cuisinier', 'Gérant': 'Manager' };
    const finalRole = ROLE_NORM[roleFromNotion] || roleFromNotion || 'Serveur';
    const token = createSession(page.id, email, finalRole);
    res.setHeader('Set-Cookie', `cia_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL}${COOKIE_SECURE ? '; Secure' : ''}`);
    res.json({
      success: true,
      user: {
        id: page.id,
        nom: props['Nom']?.title?.[0]?.plain_text,
        email: props['Email']?.email,
        role: finalRole,
        permissions: getPermissionsForRole(finalRole),
        restaurant: props['Restaurant']?.rich_text?.[0]?.plain_text,
        restaurantId: props['Restaurant ID']?.rich_text?.[0]?.plain_text
      }
    });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Route de debug session — voir ce que le serveur lit dans le cookie
app.get('/debug/notion-reservations', async (req, res) => {
  try {
    const r = await fetch(`https://api.notion.com/v1/databases/${DB_RESERVATIONS}/query`, {
      method: 'POST', headers: notionHeaders, body: JSON.stringify({ page_size: 1 })
    });
    const data = await r.json();
    res.json({ ok: !data.message, db_id: DB_RESERVATIONS, notion_response: data.message || `${data.results?.length} résultats`, code: data.code });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

app.get('/auth/me', (req, res) => {
  const sess = getSession(req);
  if (!sess) return res.json({ session: null, cookie: req.headers.cookie ? 'présent' : 'absent' });
  res.json({ session: { role: sess.role, email: sess.email, exp: new Date(sess.exp).toISOString() } });
});

// Route de déconnexion serveur
app.post('/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', `cia_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${COOKIE_SECURE ? '; Secure' : ''}`);
  res.json({ success: true });
});

// ─── PROTECTION GLOBALE DES ROUTES /admin/* ──────────────────────────────────
// Toutes les routes qui commencent par /admin/ exigent une session valide.
// Les routes admin/* réservées à l'Admin exigent le rôle Admin.
const ADMIN_ONLY_ROUTES = [
  '/admin/restaurants', '/admin/employes', '/admin/menus',
  '/admin/permissions-matrix', '/admin/broadcast', '/admin/stats',
  '/admin/health', '/admin/api-keys', '/admin/leads',
  '/admin/feedback-delete-requests', '/admin/conversations',
  '/admin/restock-alert'
];
app.use('/admin', (req, res, next) => {
  const sess = getSession(req);
  if (!sess) return res.status(401).json({ error: 'Non authentifié — veuillez vous connecter' });
  req.session = sess;
  next();
});

// ─── RESTAURANTS ──────────────────────────────────────

app.get('/admin/restaurants', async (req, res) => {
  try {
    const r = await fetch(`https://api.notion.com/v1/databases/${DB_RESTAURANTS}/query`, {
      method: 'POST', headers: notionHeaders, body: JSON.stringify({})
    });
    const data = await r.json();
    if (!data.results) return res.json([]);
    res.json(data.results.map(p => ({
      id: p.id,
      nom: p.properties['Nom du restaurant']?.title?.[0]?.plain_text,
      email: p.properties['Email']?.email,
      telephone: p.properties['Téléphone']?.phone_number,
      statut: p.properties['Statut']?.select?.name,
      abonnement: p.properties['Abonnement']?.select?.name,
      twilio: p.properties['Numéro Twilio']?.rich_text?.[0]?.plain_text,
      notes: p.properties['Notes']?.rich_text?.[0]?.plain_text,
      onboarding: p.properties['Onboarding']?.select?.name,
      menuComplete: p.properties['Menu complété']?.checkbox,
      adresse: p.properties['Adresse']?.rich_text?.[0]?.plain_text,
      motDePasse: p.properties['Mot de passe clair']?.rich_text?.[0]?.plain_text || ''
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/admin/restaurants', async (req, res) => {
  const { nom, email, telephone, abonnement, adresse, notes } = req.body;
  if (!nom || !email) return res.status(400).json({ error: 'Nom et email requis' });
  const pwd = generatePassword();
  try {
    const basePropsResto = {
      'Nom du restaurant': { title: [{ text: { content: nom } }] },
      'Email': { email: email },
      'Téléphone': { phone_number: telephone || '' },
      'Mot de passe': { rich_text: [{ text: { content: hashPassword(pwd) } }] },
      'Statut': { select: { name: 'Actif' } },
      'Abonnement': { select: { name: abonnement || 'Mensuel' } },
      'Notes': { rich_text: [{ text: { content: notes || '' } }] },
      'Adresse': { rich_text: [{ text: { content: adresse || '' } }] },
      'Onboarding': { select: { name: 'À compléter' } },
      'Menu complété': { checkbox: false }
    };
    let r = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST', headers: notionHeaders,
      body: JSON.stringify({ parent: { database_id: DB_RESTAURANTS }, properties: { ...basePropsResto, 'Mot de passe clair': { rich_text: [{ text: { content: pwd } }] } } })
    });
    let page = await r.json();
    // Retry sans "Mot de passe clair" si la propriété n'existe pas encore dans Notion
    if (page.object === 'error' && page.message?.toLowerCase().includes('mot de passe clair')) {
      r = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST', headers: notionHeaders,
        body: JSON.stringify({ parent: { database_id: DB_RESTAURANTS }, properties: basePropsResto })
      });
      page = await r.json();
    }
    console.log('Restaurant créé:', page.id, page.message);
    if (page.object === 'error') return res.status(500).json({ error: page.message });
    try { io.emit('restaurants-updated', { action: 'create', id: page.id, ts: Date.now() }); } catch {}

    // ── Email de bienvenue au restaurant ──────────────────────────────────────
    const loginUrl = (process.env.PUBLIC_BASE_URL || 'http://localhost:3000') + '/login.html';
    try {
      const mailer = getMailer();
      if (mailer) {
        await mailer.sendMail({
          from: `"Commande-IA" <${process.env.GMAIL_USER}>`,
          to: email,
          subject: `🎉 Bienvenue sur Commande-IA — votre espace ${nom} est prêt`,
          html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#EEF5F2;font-family:'Inter',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
  <!-- Header -->
  <tr><td style="background:#0E4B47;padding:32px 40px;text-align:center">
    <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px">Commande<span style="color:#7BBBB5">IA</span></div>
    <div style="font-size:13px;color:rgba(184,208,200,.8);margin-top:6px">Votre restaurant est prêt à décoller 🚀</div>
  </td></tr>
  <!-- Body -->
  <tr><td style="padding:36px 40px">
    <p style="font-size:18px;font-weight:700;color:#0F2A28;margin:0 0 8px">Bienvenue, ${nom} !</p>
    <p style="font-size:14px;color:#4D6260;line-height:1.6;margin:0 0 28px">Votre espace a été créé sur Commande-IA. Voici vos identifiants de connexion — gardez-les précieusement.</p>

    <!-- Credentials box -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#EEF5F2;border-radius:12px;margin-bottom:28px">
      <tr><td style="padding:20px 24px">
        <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#4D6260;text-transform:uppercase;letter-spacing:.8px">Vos identifiants</p>
        <table cellpadding="0" cellspacing="0">
          <tr><td style="font-size:13px;color:#4D6260;padding:4px 0;width:100px">Email</td><td style="font-size:13px;font-weight:600;color:#0F2A28">${email}</td></tr>
          <tr><td style="font-size:13px;color:#4D6260;padding:4px 0">Mot de passe</td><td style="font-size:15px;font-weight:700;color:#0E4B47;font-family:monospace;letter-spacing:1px">${pwd}</td></tr>
        </table>
        <p style="margin:12px 0 0;font-size:11px;color:#7BBBB5">⚠️ Changez votre mot de passe dès votre première connexion.</p>
      </td></tr>
    </table>

    <!-- CTA -->
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <a href="${loginUrl}" style="display:inline-block;background:#0E4B47;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:14px 32px;border-radius:10px">
        Accéder à mon espace →
      </a>
    </td></tr></table>

    <p style="font-size:13px;color:#4D6260;line-height:1.6;margin:28px 0 0">
      Une fois connecté, vous pourrez :<br>
      <span style="color:#0E4B47">✓</span> Construire votre Carte & Menu<br>
      <span style="color:#0E4B47">✓</span> Gérer vos commandes en temps réel<br>
      <span style="color:#0E4B47">✓</span> Configurer vos canaux (Uber Eats, Deliveroo…)
    </p>
  </td></tr>
  <!-- Footer -->
  <tr><td style="background:#EEF5F2;padding:20px 40px;text-align:center;font-size:11px;color:#4D6260">
    Commande-IA · Votre logiciel de gestion restaurant tout-en-un<br>
    <a href="${loginUrl}" style="color:#0E4B47">${loginUrl}</a>
  </td></tr>
</table>
</td></tr></table>
</body></html>`
        });
        console.log(`✉️  Email de bienvenue envoyé à ${email} (restaurant: ${nom})`);
      }
    } catch (mailErr) {
      console.warn('Email restaurant non envoyé (non bloquant) :', mailErr.message);
    }

    res.json({ success: true, id: page.id, nom, email, motDePasse: pwd });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/admin/restaurants/:id/statut', async (req, res) => {
  try {
    await fetch(`https://api.notion.com/v1/pages/${req.params.id}`, {
      method: 'PATCH', headers: notionHeaders,
      body: JSON.stringify({ properties: { 'Statut': { select: { name: req.body.statut } } } })
    });
    try { io.emit('restaurants-updated', { action: 'statut', id: req.params.id, statut: req.body.statut, ts: Date.now() }); } catch {}
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

app.patch('/admin/restaurants/:id/infos', async (req, res) => {
  const { adresse, twilio, horaires, onboarding, menuComplete } = req.body;
  try {
    // Ne mettre à jour que les champs explicitement fournis
    const props = {};
    if (adresse      !== undefined) props['Adresse']       = { rich_text: [{ text: { content: adresse } }] };
    if (twilio       !== undefined) props['Numéro Twilio'] = { rich_text: [{ text: { content: twilio } }] };
    if (horaires     !== undefined) props['Notes']         = { rich_text: [{ text: { content: horaires } }] };
    if (onboarding   !== undefined) props['Onboarding']    = { select: { name: onboarding } };
    if (menuComplete !== undefined) props['Menu complété'] = { checkbox: menuComplete };
    await fetch(`https://api.notion.com/v1/pages/${req.params.id}`, {
      method: 'PATCH', headers: notionHeaders,
      body: JSON.stringify({ properties: props })
    });
    try { io.emit('restaurants-updated', { action: 'infos', id: req.params.id, ts: Date.now() }); } catch {}
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

app.get('/mon-restaurant/:id', async (req, res) => {
  try {
    const r = await fetch(`https://api.notion.com/v1/pages/${req.params.id}`, { headers: notionHeaders });
    const page = await r.json();
    const props = page.properties;
    res.json({
      id: page.id,
      nom: props['Nom du restaurant']?.title?.[0]?.plain_text,
      email: props['Email']?.email,
      telephone: props['Téléphone']?.phone_number,
      statut: props['Statut']?.select?.name,
      abonnement: props['Abonnement']?.select?.name,
      twilio: props['Numéro Twilio']?.rich_text?.[0]?.plain_text,
      horaires: props['Notes']?.rich_text?.[0]?.plain_text,
      adresse: props['Adresse']?.rich_text?.[0]?.plain_text,
      onboarding: props['Onboarding']?.select?.name,
      menuComplete: props['Menu complété']?.checkbox
    });
  } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

// ─── EMPLOYES ─────────────────────────────────────────

app.get('/admin/employes', async (req, res) => {
  try {
    const r = await fetch(`https://api.notion.com/v1/databases/${DB_EMPLOYES}/query`, {
      method: 'POST', headers: notionHeaders, body: JSON.stringify({})
    });
    const data = await r.json();
    res.json(data.results.map(p => ({
      id: p.id,
      nom: p.properties['Nom']?.title?.[0]?.plain_text,
      email: p.properties['Email']?.email,
      role: p.properties['Rôle']?.select?.name,
      restaurant: p.properties['Restaurant']?.rich_text?.[0]?.plain_text,
      restaurantId: p.properties['Restaurant ID']?.rich_text?.[0]?.plain_text,
      statut: p.properties['Statut']?.select?.name,
      derniereConnexion: p.properties['Dernière connexion']?.rich_text?.[0]?.plain_text,
      motDePasse: p.properties['Mot de passe clair']?.rich_text?.[0]?.plain_text || ''
    })));
  } catch (e) { res.status(500).json({ error: 'Erreur récupération' }); }
});

app.post('/admin/employes', async (req, res) => {
  const { nom, email, role, restaurant, restaurantId } = req.body;
  if (!nom || !email || !role) return res.status(400).json({ error: 'Champs requis manquants' });
  const pwd = generatePassword();
  try {
    const baseProps = {
      'Nom': { title: [{ text: { content: nom } }] },
      'Email': { email: email },
      'Mot de passe': { rich_text: [{ text: { content: hashPassword(pwd) } }] },
      'Rôle': { select: { name: role } },
      'Restaurant': { rich_text: [{ text: { content: restaurant || '' } }] },
      'Restaurant ID': { rich_text: [{ text: { content: restaurantId || '' } }] },
      'Statut': { select: { name: 'Actif' } }
    };
    let r = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST', headers: notionHeaders,
      body: JSON.stringify({ parent: { database_id: DB_EMPLOYES }, properties: { ...baseProps, 'Mot de passe clair': { rich_text: [{ text: { content: pwd } }] } } })
    });
    let page = await r.json();
    // Si Notion ne connaît pas encore la propriété "Mot de passe clair", on réessaie sans
    if (page.object === 'error' && page.message?.toLowerCase().includes('mot de passe clair')) {
      r = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST', headers: notionHeaders,
        body: JSON.stringify({ parent: { database_id: DB_EMPLOYES }, properties: baseProps })
      });
      page = await r.json();
    }
    if (page.object === 'error' || !page.id) {
      console.error('Notion error création employé:', page);
      return res.status(500).json({ error: page.message || 'Notion a refusé la création', details: page });
    }
    // ── Push temps-réel : tous les onglets ouverts rechargent la liste
    try { io.emit('employes-updated', { action: 'create', id: page.id, ts: Date.now() }); } catch {}

    // ── Email de bienvenue à l'employé ────────────────────────────────────────
    const loginUrlEmp = (process.env.PUBLIC_BASE_URL || 'http://localhost:3000') + '/login.html';
    const roleLabels = { Manager:'Manager', Serveur:'Serveur', Cuisinier:'Cuisinier', Barman:'Barman', Admin:'Administrateur' };
    try {
      const mailer = getMailer();
      if (mailer) {
        await mailer.sendMail({
          from: `"Commande-IA" <${process.env.GMAIL_USER}>`,
          to: email,
          subject: `👋 Votre compte ${roleLabels[role] || role} est créé — ${restaurant || 'Commande-IA'}`,
          html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#EEF5F2;font-family:'Inter',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
  <!-- Header -->
  <tr><td style="background:#0E4B47;padding:32px 40px;text-align:center">
    <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px">Commande<span style="color:#7BBBB5">IA</span></div>
    ${restaurant ? `<div style="font-size:13px;color:rgba(184,208,200,.8);margin-top:6px">${restaurant}</div>` : ''}
  </td></tr>
  <!-- Body -->
  <tr><td style="padding:36px 40px">
    <p style="font-size:18px;font-weight:700;color:#0F2A28;margin:0 0 8px">Bonjour ${nom} 👋</p>
    <p style="font-size:14px;color:#4D6260;line-height:1.6;margin:0 0 28px">
      Un compte <b>${roleLabels[role] || role}</b>${restaurant ? ` pour <b>${restaurant}</b>` : ''} vient d'être créé pour vous sur Commande-IA.
      Voici vos identifiants pour vous connecter.
    </p>

    <!-- Credentials box -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#EEF5F2;border-radius:12px;margin-bottom:28px">
      <tr><td style="padding:20px 24px">
        <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#4D6260;text-transform:uppercase;letter-spacing:.8px">Vos identifiants</p>
        <table cellpadding="0" cellspacing="0">
          <tr><td style="font-size:13px;color:#4D6260;padding:4px 0;width:120px">Email</td><td style="font-size:13px;font-weight:600;color:#0F2A28">${email}</td></tr>
          <tr><td style="font-size:13px;color:#4D6260;padding:4px 0">Mot de passe</td><td style="font-size:15px;font-weight:700;color:#0E4B47;font-family:monospace;letter-spacing:1px">${pwd}</td></tr>
          <tr><td style="font-size:13px;color:#4D6260;padding:4px 0">Rôle</td><td style="font-size:13px;font-weight:600;color:#0F2A28">${roleLabels[role] || role}</td></tr>
        </table>
        <p style="margin:12px 0 0;font-size:11px;color:#7BBBB5">⚠️ Changez votre mot de passe dès votre première connexion.</p>
      </td></tr>
    </table>

    <!-- CTA -->
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <a href="${loginUrlEmp}" style="display:inline-block;background:#0E4B47;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:14px 32px;border-radius:10px">
        Me connecter →
      </a>
    </td></tr></table>
  </td></tr>
  <!-- Footer -->
  <tr><td style="background:#EEF5F2;padding:20px 40px;text-align:center;font-size:11px;color:#4D6260">
    Commande-IA · Gestion restaurant tout-en-un<br>
    <a href="${loginUrlEmp}" style="color:#0E4B47">${loginUrlEmp}</a>
  </td></tr>
</table>
</td></tr></table>
</body></html>`
        });
        console.log(`✉️  Email de bienvenue envoyé à ${email} (employé: ${nom}, rôle: ${role})`);
      }
    } catch (mailErr) {
      console.warn('Email employé non envoyé (non bloquant) :', mailErr.message);
    }

    res.json({ success: true, id: page.id, nom, email, role, motDePasse: pwd });
  } catch (e) {
    console.error('Erreur création employé:', e);
    res.status(500).json({ error: 'Erreur création employé: ' + e.message });
  }
});

app.patch('/admin/employes/:id/statut', async (req, res) => {
  try {
    await fetch(`https://api.notion.com/v1/pages/${req.params.id}`, {
      method: 'PATCH', headers: notionHeaders,
      body: JSON.stringify({ properties: { 'Statut': { select: { name: req.body.statut } } } })
    });
    try { io.emit('employes-updated', { action: 'statut', id: req.params.id, statut: req.body.statut, ts: Date.now() }); } catch {}
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

// ─── Modification du rôle d'un employé ─────────────────────────
app.patch('/admin/employes/:id/role', async (req, res) => {
  const { role } = req.body;
  const ROLES_AUTORISES = ['Admin', 'Manager', 'Serveur', 'Cuisinier', 'Barman'];
  if (!role || !ROLES_AUTORISES.includes(role)) {
    return res.status(400).json({ error: `Rôle invalide. Valeurs acceptées : ${ROLES_AUTORISES.join(', ')}` });
  }
  try {
    const r = await fetch(`https://api.notion.com/v1/pages/${req.params.id}`, {
      method: 'PATCH', headers: notionHeaders,
      body: JSON.stringify({ properties: { 'Rôle': { select: { name: role } } } })
    });
    const data = await r.json();
    if (data.object === 'error') {
      console.error('Notion error update role:', data);
      return res.status(500).json({ error: data.message || 'Notion a refusé la modification' });
    }
    try { io.emit('employes-updated', { action: 'role', id: req.params.id, role, ts: Date.now() }); } catch {}
    res.json({ success: true, role });
  } catch (e) {
    console.error('Erreur changement rôle:', e);
    res.status(500).json({ error: 'Erreur changement rôle: ' + e.message });
  }
});

// ─── MATRICE DE PERMISSIONS GRANULAIRES (Discord-style) ────────
const PERMISSIONS_FILE = process.env.VERCEL ? path.join('/tmp', 'permissions-matrix.json') : path.join(__dirname, 'permissions-matrix.json');

app.get('/admin/permissions-matrix', (req, res) => {
  try {
    if (fs.existsSync(PERMISSIONS_FILE)) {
      const matrix = JSON.parse(fs.readFileSync(PERMISSIONS_FILE, 'utf8'));
      return res.json({ matrix, savedAt: fs.statSync(PERMISSIONS_FILE).mtime });
    }
    res.json({ matrix: null });
  } catch (e) {
    res.status(500).json({ error: 'Erreur lecture matrice : ' + e.message });
  }
});

app.put('/admin/permissions-matrix', (req, res) => {
  try {
    const { matrix } = req.body;
    if (!matrix || typeof matrix !== 'object') {
      return res.status(400).json({ error: 'Matrice invalide' });
    }
    fs.writeFileSync(PERMISSIONS_FILE, JSON.stringify(matrix, null, 2));
    // Broadcast à tous les clients connectés : recharger la matrice
    try { io.emit('permissions-updated', { matrix, ts: Date.now() }); } catch {}
    res.json({ success: true, savedAt: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: 'Erreur sauvegarde matrice : ' + e.message });
  }
});

app.delete('/admin/permissions-matrix', (req, res) => {
  try {
    if (fs.existsSync(PERMISSIONS_FILE)) fs.unlinkSync(PERMISSIONS_FILE);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erreur reset matrice : ' + e.message });
  }
});

// ─── Modification du restaurant d'affectation d'un employé ─────
app.patch('/admin/employes/:id/restaurant', async (req, res) => {
  const { restaurant, restaurantId } = req.body;
  try {
    const r = await fetch(`https://api.notion.com/v1/pages/${req.params.id}`, {
      method: 'PATCH', headers: notionHeaders,
      body: JSON.stringify({
        properties: {
          'Restaurant':    { rich_text: [{ text: { content: restaurant   || '' } }] },
          'Restaurant ID': { rich_text: [{ text: { content: restaurantId || '' } }] }
        }
      })
    });
    const data = await r.json();
    if (data.object === 'error') {
      return res.status(500).json({ error: data.message || 'Notion a refusé la modification' });
    }
    try { io.emit('employes-updated', { action: 'restaurant', id: req.params.id, restaurant, restaurantId, ts: Date.now() }); } catch {}
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erreur changement restaurant: ' + e.message });
  }
});

// ─── MENUS ────────────────────────────────────────────

app.get('/admin/menus', async (req, res) => {
  try {
    const r = await fetch(`https://api.notion.com/v1/databases/${DB_MENUS}/query`, {
      method: 'POST', headers: notionHeaders, body: JSON.stringify({})
    });
    const data = await r.json();
    res.json(data.results.map(p => ({
      id: p.id,
      nom: p.properties['Nom du produit']?.title?.[0]?.plain_text,
      categorie: p.properties['Catégorie']?.select?.name,
      prix: p.properties['Prix']?.number,
      prixMenu: p.properties['Prix menu']?.number,
      dispoMenu: p.properties['Disponible en menu']?.checkbox,
      description: p.properties['Description']?.rich_text?.[0]?.plain_text,
      ingredients: p.properties['Ingrédients']?.rich_text?.[0]?.plain_text,
      ingredientsRetirables: p.properties['Ingrédients retirables']?.rich_text?.[0]?.plain_text,
      allergenes: p.properties['Allergènes']?.multi_select?.map(a => a.name) || [],
      tempsPrepare: p.properties['Temps de préparation']?.number,
      disponible: p.properties['Disponible']?.checkbox,
      restaurant: p.properties['Restaurant']?.rich_text?.[0]?.plain_text,
      restaurantId: p.properties['Restaurant ID']?.rich_text?.[0]?.plain_text,
      extras: p.properties['Extras']?.rich_text?.[0]?.plain_text || ''
    })));
  } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

app.post('/admin/menus', async (req, res) => {
  const { nom, categorie, prix, prixMenu, dispoMenu, description, ingredients, ingredientsRetirables, allergenes, restaurant, restaurantId, tempsPrepare, extras, disponible, skipStockSync } = req.body;
  try {
    // Propriétés de base (sans Extras — on l'ajoute en tentative initiale)
    const baseProps = {
      'Nom du produit': { title: [{ text: { content: nom || '' } }] },
      'Catégorie': { select: { name: categorie || 'Sandwich' } },
      'Prix': { number: parseFloat(prix) || 0 },
      'Prix menu': { number: parseFloat(prixMenu) || 0 },
      'Disponible en menu': { checkbox: dispoMenu === true || dispoMenu === 'true' },
      'Description': { rich_text: [{ text: { content: description || '' } }] },
      'Ingrédients': { rich_text: [{ text: { content: ingredients || '' } }] },
      'Ingrédients retirables': { rich_text: [{ text: { content: ingredientsRetirables || '' } }] },
      'Allergènes': { multi_select: (allergenes || []).map(a => ({ name: a })) },
      'Temps de préparation': { number: parseInt(tempsPrepare) || 0 },
      'Disponible': { checkbox: disponible === undefined ? true : (disponible === true || disponible === 'true') },
      'Restaurant': { rich_text: [{ text: { content: restaurant || '' } }] },
      'Restaurant ID': { rich_text: [{ text: { content: restaurantId || '' } }] }
    };

    // Tentative 1 : avec le champ Extras
    let r = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST', headers: notionHeaders,
      body: JSON.stringify({ parent: { database_id: DB_MENUS }, properties: { ...baseProps, 'Extras': { rich_text: [{ text: { content: extras || '' } }] } } })
    });
    let page = await r.json();

    // Si Notion se plaint de la propriété Extras (pas encore créée), on réessaie sans elle
    if (page.object === 'error' && page.message && page.message.toLowerCase().includes('extras')) {
      console.log('⚠️  Propriété Extras absente de Notion — création sans ce champ');
      r = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST', headers: notionHeaders,
        body: JSON.stringify({ parent: { database_id: DB_MENUS }, properties: baseProps })
      });
      page = await r.json();
    }

    if (page.object === 'error') return res.status(500).json({ error: page.message });

    // ── Sync automatique des ingrédients dans le stock (sauf si désactivé) ──
    // Timeout 8s pour ne pas bloquer la réponse si Notion est lent
    let stockSync = { created: [], skipped: [] };
    if (ingredients && restaurantId && !skipStockSync) {
      try {
        stockSync = await Promise.race([
          syncIngredientStock(ingredients, restaurant, restaurantId),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))
        ]);
      } catch (e) { console.log('Sync stock ignoré :', e.message); }
    }

    res.json({ success: true, id: page.id, stockSync });
  } catch (e) { res.status(500).json({ error: 'Erreur création produit : ' + e.message }); }
});

// ─── PATCH menu (modification) ────────────────────────
app.patch('/admin/menus/:id', async (req, res) => {
  const { nom, categorie, prix, prixMenu, dispoMenu, description, ingredients, ingredientsRetirables, allergenes, restaurant, restaurantId, tempsPrepare, disponible, extras } = req.body;
  try {
    const props = {};
    if (nom !== undefined)                props['Nom du produit']          = { title: [{ text: { content: nom } }] };
    if (categorie !== undefined)          props['Catégorie']               = { select: { name: categorie } };
    if (prix !== undefined)               props['Prix']                    = { number: parseFloat(prix) || 0 };
    if (prixMenu !== undefined)           props['Prix menu']               = { number: parseFloat(prixMenu) || 0 };
    if (dispoMenu !== undefined)          props['Disponible en menu']      = { checkbox: dispoMenu === true || dispoMenu === 'true' };
    if (description !== undefined)        props['Description']             = { rich_text: [{ text: { content: description || '' } }] };
    if (ingredients !== undefined)        props['Ingrédients']             = { rich_text: [{ text: { content: ingredients || '' } }] };
    if (ingredientsRetirables !== undefined) props['Ingrédients retirables'] = { rich_text: [{ text: { content: ingredientsRetirables || '' } }] };
    if (allergenes !== undefined)         props['Allergènes']              = { multi_select: (allergenes || []).map(a => ({ name: a })) };
    if (tempsPrepare !== undefined)       props['Temps de préparation']    = { number: parseInt(tempsPrepare) || 0 };
    if (disponible !== undefined)         props['Disponible']              = { checkbox: disponible === true || disponible === 'true' };
    // Extras : on l'inclut seulement si la valeur est définie
    if (extras !== undefined) props['Extras'] = { rich_text: [{ text: { content: extras || '' } }] };

    let patchR = await fetch(`https://api.notion.com/v1/pages/${req.params.id}`, {
      method: 'PATCH', headers: notionHeaders,
      body: JSON.stringify({ properties: props })
    });
    let patchData = await patchR.json();

    // Si Notion se plaint de Extras (propriété absente), on réessaie sans elle
    if (patchData.object === 'error' && patchData.message && patchData.message.toLowerCase().includes('extras')) {
      console.log('⚠️  Propriété Extras absente de Notion — modification sans ce champ');
      delete props['Extras'];
      patchR = await fetch(`https://api.notion.com/v1/pages/${req.params.id}`, {
        method: 'PATCH', headers: notionHeaders,
        body: JSON.stringify({ properties: props })
      });
      patchData = await patchR.json();
    }
    if (patchData.object === 'error') return res.status(500).json({ error: patchData.message });

    // ── Sync les NOUVEAUX ingrédients éventuels dans le stock ──
    let stockSync = { created: [], skipped: [] };
    if (ingredients && restaurantId) {
      try {
        stockSync = await Promise.race([
          syncIngredientStock(ingredients, restaurant, restaurantId),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))
        ]);
      } catch (e) { console.log('Sync stock ignoré (edit) :', e.message); }
    }

    res.json({ success: true, stockSync });
  } catch (e) { res.status(500).json({ error: 'Erreur modification produit : ' + e.message }); }
});

app.delete('/admin/menus/:id', async (req, res) => {
  try {
    await fetch(`https://api.notion.com/v1/pages/${req.params.id}`, {
      method: 'PATCH', headers: notionHeaders,
      body: JSON.stringify({ archived: true })
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur suppression' }); }
});

app.get('/mon-menu/:restaurantId', async (req, res) => {
  try {
    const r = await fetch(`https://api.notion.com/v1/databases/${DB_MENUS}/query`, {
      method: 'POST', headers: notionHeaders,
      body: JSON.stringify({ filter: { property: 'Restaurant ID', rich_text: { equals: req.params.restaurantId } } })
    });
    const data = await r.json();
    res.json(data.results.map(p => ({
      id: p.id,
      nom: p.properties['Nom du produit']?.title?.[0]?.plain_text,
      categorie: p.properties['Catégorie']?.select?.name,
      prix: p.properties['Prix']?.number,
      prixMenu: p.properties['Prix menu']?.number,
      dispoMenu: p.properties['Disponible en menu']?.checkbox,
      ingredients: p.properties['Ingrédients']?.rich_text?.[0]?.plain_text,
      ingredientsRetirables: p.properties['Ingrédients retirables']?.rich_text?.[0]?.plain_text,
      allergenes: p.properties['Allergènes']?.multi_select?.map(a => a.name) || [],
      tempsPrepare: p.properties['Temps de préparation']?.number,
      disponible: p.properties['Disponible']?.checkbox,
      extras: p.properties['Extras']?.rich_text?.[0]?.plain_text || ''
    })));
  } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

app.delete('/admin/restaurants/:id', async (req, res) => {
  try {
    await fetch(`https://api.notion.com/v1/pages/${req.params.id}`, {
      method: 'PATCH', headers: notionHeaders,
      body: JSON.stringify({ archived: true })
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur suppression' }); }
});

app.delete('/admin/employes/:id', async (req, res) => {
  try {
    await fetch(`https://api.notion.com/v1/pages/${req.params.id}`, {
      method: 'PATCH', headers: notionHeaders,
      body: JSON.stringify({ archived: true })
    });
    try { io.emit('employes-updated', { action: 'delete', id: req.params.id, ts: Date.now() }); } catch {}
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur suppression' }); }
});

// ─── STOCKS ──────────────────────────────────────────

app.get('/stocks/:restaurantId', async (req, res) => {
  try {
    const r = await fetch(`https://api.notion.com/v1/databases/${DB_STOCKS}/query`, {
      method: 'POST', headers: notionHeaders,
      body: JSON.stringify({ filter: { property: 'Restaurant ID', rich_text: { equals: req.params.restaurantId } } })
    });
    const data = await r.json();
    if (!data.results) return res.json([]);
    res.json(data.results.map(p => ({
      id: p.id,
      produit: p.properties['Produit']?.title?.[0]?.plain_text,
      quantiteActuelle: p.properties['Quantité actuelle']?.number,
      quantiteInitiale: p.properties['Quantité initiale']?.number,
      seuilAlerte: p.properties['Seuil alerte']?.number,
      unite: p.properties['Unité']?.select?.name,
      statut: p.properties['Statut']?.select?.name,
      restaurant: p.properties['Restaurant']?.rich_text?.[0]?.plain_text,
      restaurantId: p.properties['Restaurant ID']?.rich_text?.[0]?.plain_text,
      derniereMaj: p.properties['Dernière mise à jour']?.rich_text?.[0]?.plain_text
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/stocks', async (req, res) => {
  const { produit, quantite, seuilAlerte, unite, restaurant, restaurantId } = req.body;
  try {
    const r = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST', headers: notionHeaders,
      body: JSON.stringify({
        parent: { database_id: DB_STOCKS },
        properties: {
          'Produit': { title: [{ text: { content: produit } }] },
          'Quantité actuelle': { number: parseFloat(quantite) || 0 },
          'Quantité initiale': { number: parseFloat(quantite) || 0 },
          'Seuil alerte': { number: parseFloat(seuilAlerte) || 5 },
          'Unité': { select: { name: unite || 'unité' } },
          'Statut': { select: { name: 'Disponible' } },
          'Restaurant': { rich_text: [{ text: { content: restaurant || '' } }] },
          'Restaurant ID': { rich_text: [{ text: { content: restaurantId || '' } }] },
          'Dernière mise à jour': { rich_text: [{ text: { content: new Date().toLocaleString('fr-FR') } }] }
        }
      })
    });
    const page = await r.json();
    res.json({ success: true, id: page.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/stocks/:id', async (req, res) => {
  const { quantite, restaurantId, updatedBy } = req.body;
  const qty = parseFloat(quantite);
  const statut = qty <= 0 ? 'Rupture' : qty <= (req.body.seuilAlerte || 5) ? 'Alerte' : 'Disponible';
  try {
    await fetch(`https://api.notion.com/v1/pages/${req.params.id}`, {
      method: 'PATCH', headers: notionHeaders,
      body: JSON.stringify({
        properties: {
          'Quantité actuelle': { number: qty },
          'Statut': { select: { name: statut } },
          'Dernière mise à jour': { rich_text: [{ text: { content: new Date().toLocaleString('fr-FR') } }] }
        }
      })
    });
    // Broadcast to restaurant room
    if (restaurantId) {
      io.to(`restaurant:${restaurantId}`).emit('stocks-broadcast', {
        restaurantId, action: 'update', stockId: req.params.id, quantite: qty, statut, updatedBy
      });
    }
    res.json({ success: true, statut });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/stocks/:id', async (req, res) => {
  try {
    await fetch(`https://api.notion.com/v1/pages/${req.params.id}`, {
      method: 'PATCH', headers: notionHeaders,
      body: JSON.stringify({ archived: true })
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Helper : créer la propriété "Mot de passe clair" dans une DB Notion si elle n'existe pas
async function ensureMdpClairProp(dbId) {
  try {
    await fetch(`https://api.notion.com/v1/databases/${dbId}`, {
      method: 'PATCH', headers: notionHeaders,
      body: JSON.stringify({ properties: { 'Mot de passe clair': { rich_text: {} } } })
    });
  } catch {}
}

// Changer son propre mot de passe (compte connecté)
app.post('/auth/change-password', async (req, res) => {
  const sess = getSession(req);
  if (!sess) return res.status(401).json({ error: 'Non authentifié' });
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Mot de passe actuel et nouveau requis' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Le nouveau mot de passe doit faire au moins 6 caractères' });
  try {
    const r = await fetch(`https://api.notion.com/v1/databases/${DB_EMPLOYES}/query`, {
      method: 'POST', headers: notionHeaders, body: JSON.stringify({})
    });
    const data = await r.json();
    const page = data.results?.find(p => p.properties['Email']?.email === sess.email);
    if (!page) return res.status(404).json({ error: 'Compte introuvable' });
    const storedHash = page.properties['Mot de passe']?.rich_text?.[0]?.plain_text;
    // Vérifier le mot de passe actuel (ou override d'urgence)
    const overridePwd = process.env.ADMIN_OVERRIDE_PASSWORD;
    const overrideOk = sess.email === ADMIN_EMAIL && overridePwd && safeEqual(overridePwd, currentPassword);
    if (!overrideOk && !safeEqual(storedHash || '', hashPassword(currentPassword))) {
      return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
    }
    await ensureMdpClairProp(DB_EMPLOYES);
    await fetch(`https://api.notion.com/v1/pages/${page.id}`, {
      method: 'PATCH', headers: notionHeaders,
      body: JSON.stringify({ properties: {
        'Mot de passe': { rich_text: [{ text: { content: hashPassword(newPassword) } }] },
        'Mot de passe clair': { rich_text: [{ text: { content: newPassword } }] }
      }})
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/admin/reset-password/:id', async (req, res) => {
  const pwd = generatePassword();
  try {
    // Détecter à quelle DB appartient la page (employé ou restaurant)
    const pageInfo = await fetch(`https://api.notion.com/v1/pages/${req.params.id}`, { headers: notionHeaders });
    const pageData = await pageInfo.json();
    const parentDbId = pageData?.parent?.database_id?.replace(/-/g, '');
    // Créer la propriété si nécessaire dans la bonne DB
    if (parentDbId === DB_EMPLOYES.replace(/-/g, '') || parentDbId === DB_RESTAURANTS.replace(/-/g, '')) {
      await ensureMdpClairProp(parentDbId);
    }
    // Sauvegarder hash + clair
    await fetch(`https://api.notion.com/v1/pages/${req.params.id}`, {
      method: 'PATCH', headers: notionHeaders,
      body: JSON.stringify({ properties: {
        'Mot de passe': { rich_text: [{ text: { content: hashPassword(pwd) } }] },
        'Mot de passe clair': { rich_text: [{ text: { content: pwd } }] }
      }})
    });
    res.json({ success: true, motDePasse: pwd });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── TWILIO + IA — CONVERSATION INTERACTIVE ──────────
//
// Flux :
//  1) Twilio appelle /twilio/appel (CallSid, From) → on émet `appel_entrant`,
//     on dit le greeting et on lance un <Gather speech>.
//  2) /twilio/dialogue reçoit le SpeechResult, l'envoie à Claude avec
//     l'historique de la conversation et le menu, reçoit la réponse de l'IA
//     + (éventuellement) la commande finale en JSON. On émet `appel_dialogue`
//     pour que le dashboard se mette à jour en temps réel.
//  3) Quand Claude renvoie {"final": true, "commande": {...}}, on enregistre
//     la commande, on émet `nouvelle_commande` + `appel_termine` et on dit
//     au revoir au client.
//  4) /twilio/status reçoit les events de fin d'appel pour nettoyer.

// Store des appels actifs par CallSid (visible côté dashboard)
const activeCalls = {}; // { callSid: { from, restaurantId, restaurant, history, panier, startedAt } }

function broadcastActiveCalls() {
  io.emit('appels_actifs', Object.values(activeCalls));
}

// ─── PROVIDER VOIX (Telnyx, compatible TwiML/TeXML) ───
// Doc : https://developers.telnyx.com/docs/voice/programmable-voice/texml
const VOICE_PROVIDER = process.env.VOICE_PROVIDER || 'telnyx'; // 'telnyx' | 'twilio'
const TELNYX_API_KEY = process.env.TELNYX_API_KEY || '';
const TELNYX_CONNECTION_ID = process.env.TELNYX_CONNECTION_ID || ''; // TeXML application ID
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || ''; // ex: https://commande-ia.fr (pour les webhooks)

async function telnyxFetch(pathOrUrl, opts = {}) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `https://api.telnyx.com/v2${pathOrUrl}`;
  const r = await fetch(url, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${TELNYX_API_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(opts.headers || {})
    }
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: j };
}

// Normalise un numéro au format E.164 (+33...)
function normalizeNumber(n) {
  if (!n) return '';
  n = String(n).replace(/\s|-|\.|\(|\)/g, '');
  if (n.startsWith('+')) return n;
  if (n.startsWith('00')) return '+' + n.slice(2);
  if (n.startsWith('0') && n.length === 10) return '+33' + n.slice(1); // FR
  return n;
}

// Cache numéro → restaurant (rafraîchi toutes les 60s)
let numberRestaurantCache = { data: {}, ts: 0 };
async function getRestaurantByNumber(toNumber) {
  if (!toNumber) return null;
  const norm = normalizeNumber(toNumber);
  if (Date.now() - numberRestaurantCache.ts < 60000 && numberRestaurantCache.data[norm]) {
    return numberRestaurantCache.data[norm];
  }
  try {
    const r = await fetch(`https://api.notion.com/v1/databases/${DB_RESTAURANTS}/query`, {
      method: 'POST', headers: notionHeaders, body: JSON.stringify({})
    });
    const data = await r.json();
    const map = {};
    (data.results || []).forEach(p => {
      const num = normalizeNumber(p.properties['Numéro Twilio']?.rich_text?.[0]?.plain_text);
      if (num) map[num] = {
        id: p.id,
        nom: p.properties['Nom du restaurant']?.title?.[0]?.plain_text || 'Restaurant',
        statut: p.properties['Statut']?.select?.name
      };
    });
    numberRestaurantCache = { data: map, ts: Date.now() };
    return map[norm] || null;
  } catch (e) {
    console.log('getRestaurantByNumber erreur:', e.message);
    return null;
  }
}

function invalidateNumberCache() { numberRestaurantCache = { data: {}, ts: 0 }; }

// Charge le menu d'un restaurant (utilisé pour le contexte conversationnel)
async function loadMenuForRestaurant(restaurantId) {
  try {
    const restauRes = await fetch(`https://api.notion.com/v1/pages/${restaurantId}`, {
      method: 'GET', headers: notionHeaders
    });
    const restau = await restauRes.json();
    if (restau.object === 'error') return { nom: '', menu: [] };
    const nomRestaurant = restau.properties['Nom du restaurant']?.title?.[0]?.plain_text || 'Restaurant';

    const menuRes = await fetch(`https://api.notion.com/v1/databases/${DB_MENUS}/query`, {
      method: 'POST', headers: notionHeaders,
      body: JSON.stringify({
        filter: { or: [
          { property: 'Restaurant ID', rich_text: { equals: restaurantId } },
          { property: 'Restaurant', rich_text: { equals: nomRestaurant } }
        ]}
      })
    });
    const menuData = await menuRes.json();
    const menu = (menuData.results || []).map(p => {
      const props = p.properties;
      return {
        nom: props['Nom du produit']?.title?.[0]?.plain_text || '',
        prix: props['Prix']?.number || 0,
        prixMenu: props['Prix menu']?.number || 0,
        categorie: props['Catégorie']?.select?.name || '',
        ingredients: props['Ingrédients']?.rich_text?.[0]?.plain_text || ''
      };
    });
    return { nom: nomRestaurant, menu };
  } catch (e) {
    console.log('loadMenuForRestaurant erreur:', e.message);
    return { nom: '', menu: [] };
  }
}

// Échappe le XML pour le TwiML
function escXml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// Construit le prompt système pour l'IA téléphonique
function systemPromptTel(nomRestaurant, menu) {
  const menuTxt = menu.map(p =>
    `- ${p.nom} (${p.categorie}) : ${p.prix}€${p.prixMenu ? ' / ' + p.prixMenu + '€ en menu' : ''}`
  ).join('\n');
  return `Tu es l'assistant vocal téléphonique du restaurant "${nomRestaurant}".
Tu prends des commandes par téléphone, en français, avec des phrases COURTES et NATURELLES (1 à 2 phrases max).
Tu poses UNE question à la fois, tu confirmes les choix, tu proposes une boisson et un accompagnement si oubliés.

MENU DISPONIBLE :
${menuTxt || '(menu non disponible)'}

RÈGLES STRICTES :
- Réponds UNIQUEMENT en JSON valide, sans markdown, sans texte autour.
- Format : {"reply":"<ce que tu dis au client>", "panier":[{"nom":"...","qty":1}], "final": false}
- Tant que la commande n'est pas validée, "final" reste false.
- Quand le client confirme la commande complète (oui, c'est bon, validez, etc.), mets "final": true et ajoute "commande": {"name":"prénom ou Inconnu","sandwich":"item principal","boisson":"...","option":"frites/salade/rien","modif":"","allergy":"","surPlace":false}.
- Sois bref. Pas de blabla. Comme un vrai serveur pressé mais poli.`;
}

app.post('/twilio/appel', async (req, res) => {
  const callSid = req.body.CallSid || ('sim-' + Date.now());
  const from = req.body.From || 'inconnu';
  const toNumber = req.body.To || ''; // Numéro appelé → permet de retrouver le restaurant
  let restaurantId = req.query.restaurantId || '';
  let restaurant = req.query.restaurant || '';

  // Routage par numéro appelé : si pas de query string, on cherche dans Notion
  if (!restaurantId && toNumber) {
    const r = await getRestaurantByNumber(toNumber);
    if (r) {
      restaurantId = r.id;
      restaurant = r.nom;
      if (r.statut && r.statut !== 'Actif') {
        const tw = `<?xml version="1.0" encoding="UTF-8"?>
<Response><Say language="fr-FR" voice="Polly.Lea">Ce restaurant est temporairement indisponible. Merci de rappeler plus tard.</Say><Hangup/></Response>`;
        return res.type('text/xml').send(tw);
      }
    } else {
      // Numéro non attribué → message d'erreur + raccrocher
      console.log('[APPEL] Numéro non attribué :', toNumber);
      const tw = `<?xml version="1.0" encoding="UTF-8"?>
<Response><Say language="fr-FR" voice="Polly.Lea">Ce numéro n'est pas configuré. Merci de votre appel, au revoir.</Say><Hangup/></Response>`;
      return res.type('text/xml').send(tw);
    }
  }

  if (!restaurant) restaurant = 'le restaurant';

  // Charger le menu pour la session
  const { nom, menu } = await loadMenuForRestaurant(restaurantId);
  const nomRestaurant = nom || restaurant;

  activeCalls[callSid] = {
    callSid,
    from,
    restaurantId,
    restaurant: nomRestaurant,
    history: [],
    panier: [],
    menu,
    startedAt: new Date().toISOString(),
    lastReply: ''
  };
  io.emit('appel_entrant', {
    callSid, from, restaurantId, restaurant: nomRestaurant,
    startedAt: activeCalls[callSid].startedAt
  });
  broadcastActiveCalls();
  console.log('[APPEL] Entrant', from, '→', nomRestaurant);

  const greeting = `Bonjour, restaurant ${nomRestaurant}, je vous écoute.`;
  activeCalls[callSid].lastReply = greeting;
  io.emit('appel_dialogue', { callSid, role: 'assistant', text: greeting });

  const action = `/twilio/dialogue?callSid=${encodeURIComponent(callSid)}`;
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" language="fr-FR" speechTimeout="auto" action="${action}" method="POST">
    <Say language="fr-FR" voice="Polly.Lea">${escXml(greeting)}</Say>
  </Gather>
  <Redirect method="POST">${action}?timeout=1</Redirect>
</Response>`;
  res.type('text/xml').send(twiml);
});

app.post('/twilio/dialogue', async (req, res) => {
  const callSid = req.query.callSid || req.body.CallSid;
  const isTimeout = req.query.timeout === '1';
  const speech = (req.body.SpeechResult || '').trim();
  const call = activeCalls[callSid];

  // Pas d'état → on raccroche poliment
  if (!call) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response><Say language="fr-FR" voice="Polly.Lea">Désolé, votre session a expiré. Merci, au revoir.</Say><Hangup/></Response>`;
    return res.type('text/xml').send(twiml);
  }

  // Si timeout sans audio → on relance la question
  if (isTimeout || !speech) {
    const action = `/twilio/dialogue?callSid=${encodeURIComponent(callSid)}`;
    const relance = call.history.length === 0
      ? 'Je n\'ai pas entendu, que souhaitez-vous commander ?'
      : 'Vous êtes toujours là ?';
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" language="fr-FR" speechTimeout="auto" action="${action}" method="POST">
    <Say language="fr-FR" voice="Polly.Lea">${escXml(relance)}</Say>
  </Gather>
  <Redirect method="POST">${action}?timeout=1</Redirect>
</Response>`;
    return res.type('text/xml').send(twiml);
  }

  // On a du texte du client → log + diffusion temps réel
  call.history.push({ role: 'user', content: speech });
  io.emit('appel_dialogue', { callSid, role: 'user', text: speech });
  console.log('[APPEL]', callSid, 'client:', speech);

  // Construction du prompt et appel à Claude
  let replyText = 'Je n\'ai pas bien compris, pouvez-vous répéter ?';
  let final = false;
  let commandeFinale = null;

  try {
    const sys = systemPromptTel(call.restaurant, call.menu);
    const messages = call.history.map(h => ({ role: h.role, content: h.content }));

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 600,
        system: sys,
        messages
      })
    });
    const claudeData = await claudeRes.json();
    let raw = claudeData.content?.[0]?.text || '{}';
    // Nettoyer un éventuel markdown
    raw = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(raw);
    replyText = parsed.reply || replyText;
    final = !!parsed.final;
    if (Array.isArray(parsed.panier)) call.panier = parsed.panier;
    if (final && parsed.commande) commandeFinale = parsed.commande;
  } catch (e) {
    console.log('[APPEL] erreur IA:', e.message);
  }

  call.lastReply = replyText;
  call.history.push({ role: 'assistant', content: replyText });
  io.emit('appel_dialogue', { callSid, role: 'assistant', text: replyText, panier: call.panier });
  broadcastActiveCalls();

  // Si c'est la fin → créer la commande
  if (final && commandeFinale) {
    const cmd = {
      id: nextId++,
      ...commandeFinale,
      phone: call.from,
      source: 'ai',
      restaurantId: call.restaurantId,
      restaurant: call.restaurant,
      state: 'new',
      chronoStart: null,
      chronoEnd: null,
      createdAt: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    };
    commandes.push(cmd);
    io.emit('nouvelle_commande', cmd);
    io.emit('appel_termine', {
      callSid, from: call.from, restaurantId: call.restaurantId,
      duration: Math.round((Date.now() - new Date(call.startedAt).getTime()) / 1000),
      commandeId: cmd.id
    });
    delete activeCalls[callSid];
    broadcastActiveCalls();
    console.log('[APPEL] Commande créée:', cmd.id);

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="fr-FR" voice="Polly.Lea">${escXml(replyText)}</Say>
  <Say language="fr-FR" voice="Polly.Lea">Merci, à bientôt !</Say>
  <Hangup/>
</Response>`;
    return res.type('text/xml').send(twiml);
  }

  // Sinon on continue la conversation
  const action = `/twilio/dialogue?callSid=${encodeURIComponent(callSid)}`;
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" language="fr-FR" speechTimeout="auto" action="${action}" method="POST">
    <Say language="fr-FR" voice="Polly.Lea">${escXml(replyText)}</Say>
  </Gather>
  <Redirect method="POST">${action}?timeout=1</Redirect>
</Response>`;
  res.type('text/xml').send(twiml);
});

// Endpoint de status (raccrochage côté client)
app.post('/twilio/status', (req, res) => {
  const callSid = req.body.CallSid;
  const status = req.body.CallStatus;
  if (callSid && activeCalls[callSid] && (status === 'completed' || status === 'failed' || status === 'busy' || status === 'no-answer')) {
    const call = activeCalls[callSid];
    io.emit('appel_termine', {
      callSid, from: call.from, restaurantId: call.restaurantId,
      duration: Math.round((Date.now() - new Date(call.startedAt).getTime()) / 1000),
      reason: status
    });
    delete activeCalls[callSid];
    broadcastActiveCalls();
    console.log('[APPEL] Terminé', callSid, '(' + status + ')');
  }
  res.sendStatus(200);
});

// Liste des appels en cours (pour rafraîchissement initial du dashboard)
app.get('/api/calls/active', (req, res) => {
  const rid = req.query.restaurantId;
  const list = Object.values(activeCalls);
  res.json(rid ? list.filter(c => c.restaurantId === rid) : list);
});

// Simulation d'un appel entrant (utile pour démo / test sans Twilio)
app.post('/api/calls/simulate', async (req, res) => {
  const { restaurantId, restaurant, from } = req.body || {};
  const callSid = 'sim-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const { nom, menu } = await loadMenuForRestaurant(restaurantId || '');
  const nomR = nom || restaurant || 'Restaurant';
  activeCalls[callSid] = {
    callSid, from: from || '+33 6 12 34 56 78', restaurantId: restaurantId || '',
    restaurant: nomR, history: [], panier: [], menu,
    startedAt: new Date().toISOString(),
    lastReply: `Bonjour, restaurant ${nomR}, je vous écoute.`,
    simulated: true
  };
  io.emit('appel_entrant', {
    callSid, from: activeCalls[callSid].from, restaurantId: restaurantId || '',
    restaurant: nomR, startedAt: activeCalls[callSid].startedAt, simulated: true
  });
  io.emit('appel_dialogue', { callSid, role: 'assistant', text: activeCalls[callSid].lastReply });
  broadcastActiveCalls();
  res.json({ success: true, callSid });
});

// Fin manuelle d'un appel simulé
app.post('/api/calls/end', (req, res) => {
  const { callSid } = req.body || {};
  const call = activeCalls[callSid];
  if (!call) return res.status(404).json({ error: 'Appel introuvable' });
  io.emit('appel_termine', {
    callSid, from: call.from, restaurantId: call.restaurantId,
    duration: Math.round((Date.now() - new Date(call.startedAt).getTime()) / 1000),
    reason: 'manual'
  });
  delete activeCalls[callSid];
  broadcastActiveCalls();
  res.json({ success: true });
});

// ─── ADMIN : GESTION DES NUMÉROS TELNYX ──────────────────────────────────
// Liste des numéros achetés, avec restaurant attribué
app.get('/api/admin/numbers', async (req, res) => {
  if (!TELNYX_API_KEY) return res.json({ provider: 'telnyx', configured: false, numbers: [] });
  try {
    // 1) Récupérer les numéros chez Telnyx
    const r = await telnyxFetch('/phone_numbers?page[size]=100');
    if (!r.ok) return res.status(500).json({ error: r.data?.errors?.[0]?.detail || 'Erreur Telnyx' });
    const telnyxNumbers = (r.data.data || []).map(n => ({
      id: n.id,
      number: n.phone_number,
      status: n.status,
      country: n.country_iso_alpha2,
      webhookUrl: n.connection_id ? `connection ${n.connection_id}` : (n.webhook_event_url || ''),
      monthlyCost: n.billing_group_id || ''
    }));
    // 2) Récupérer la map numéro → restaurant depuis Notion
    invalidateNumberCache();
    const nr = await fetch(`https://api.notion.com/v1/databases/${DB_RESTAURANTS}/query`, {
      method: 'POST', headers: notionHeaders, body: JSON.stringify({})
    });
    const ndata = await nr.json();
    const numToResto = {};
    (ndata.results || []).forEach(p => {
      const num = normalizeNumber(p.properties['Numéro Twilio']?.rich_text?.[0]?.plain_text);
      if (num) numToResto[num] = {
        id: p.id,
        nom: p.properties['Nom du restaurant']?.title?.[0]?.plain_text || ''
      };
    });
    // 3) Joindre les deux
    const numbers = telnyxNumbers.map(n => ({
      ...n,
      restaurant: numToResto[normalizeNumber(n.number)] || null
    }));
    res.json({ provider: 'telnyx', configured: true, numbers });
  } catch (e) {
    console.log('GET /api/admin/numbers erreur:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Recherche de numéros disponibles à l'achat
app.get('/api/admin/numbers/search', async (req, res) => {
  if (!TELNYX_API_KEY) return res.status(400).json({ error: 'TELNYX_API_KEY non configurée' });
  const country = req.query.country || 'FR';
  const limit = req.query.limit || 10;
  try {
    const r = await telnyxFetch(`/available_phone_numbers?filter[country_code]=${country}&filter[limit]=${limit}`);
    if (!r.ok) return res.status(500).json({ error: r.data?.errors?.[0]?.detail || 'Erreur recherche' });
    res.json({
      available: (r.data.data || []).map(n => ({
        number: n.phone_number,
        cost: n.cost_information,
        region: n.region_information?.[0]?.region_name || ''
      }))
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Achète un numéro Telnyx
app.post('/api/admin/numbers/buy', async (req, res) => {
  if (!TELNYX_API_KEY) return res.status(400).json({ error: 'TELNYX_API_KEY non configurée' });
  const { number } = req.body || {};
  if (!number) return res.status(400).json({ error: 'numéro requis' });
  try {
    const r = await telnyxFetch('/number_orders', {
      method: 'POST',
      body: JSON.stringify({ phone_numbers: [{ phone_number: number }] })
    });
    if (!r.ok) return res.status(500).json({ error: r.data?.errors?.[0]?.detail || 'Erreur achat' });
    res.json({ success: true, order: r.data.data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Configure le webhook d'un numéro Telnyx (pointer vers /twilio/appel de notre serveur)
app.post('/api/admin/numbers/configure-webhook', async (req, res) => {
  if (!TELNYX_API_KEY) return res.status(400).json({ error: 'TELNYX_API_KEY non configurée' });
  const { numberId } = req.body || {};
  if (!numberId) return res.status(400).json({ error: 'numberId requis' });
  if (!PUBLIC_BASE_URL) return res.status(400).json({ error: 'PUBLIC_BASE_URL non configurée (ex: https://commande-ia.fr)' });
  try {
    const webhookUrl = `${PUBLIC_BASE_URL}/twilio/appel`;
    const statusUrl = `${PUBLIC_BASE_URL}/twilio/status`;
    const r = await telnyxFetch(`/phone_numbers/${numberId}/voice`, {
      method: 'PATCH',
      body: JSON.stringify({
        translated_number: null,
        call_recording_enabled: false,
        call_forwarding_enabled: false,
        usage_payment_method: 'pay-per-minute',
        // Configuration TeXML pour qu'il appelle notre webhook au format TwiML
        tech_prefix_enabled: false
      })
    });
    // Pour TeXML, il faut associer le numéro à une "TeXML Application"
    // ou configurer le webhook au niveau de la connection. On note juste l'URL ici.
    // Le user devra créer une TeXML App dans le dashboard Telnyx avec ces URLs.
    res.json({
      success: true,
      info: 'Pour finaliser, créer une TeXML Application dans Telnyx avec :\n  Voice Method: POST\n  Voice URL: ' + webhookUrl + '\n  Status Callback: ' + statusUrl + '\nPuis attribuer cette TeXML App au numéro.',
      voiceUrl: webhookUrl,
      statusUrl
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Attribue un numéro à un restaurant (écrit dans Notion)
app.post('/api/admin/numbers/assign', async (req, res) => {
  const { restaurantId, number } = req.body || {};
  if (!restaurantId || !number) return res.status(400).json({ error: 'restaurantId et number requis' });
  try {
    const norm = normalizeNumber(number);
    await fetch(`https://api.notion.com/v1/pages/${restaurantId}`, {
      method: 'PATCH', headers: notionHeaders,
      body: JSON.stringify({
        properties: { 'Numéro Twilio': { rich_text: [{ text: { content: norm } }] } }
      })
    });
    invalidateNumberCache();
    res.json({ success: true, number: norm });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Détache un numéro d'un restaurant
app.post('/api/admin/numbers/unassign', async (req, res) => {
  const { restaurantId } = req.body || {};
  if (!restaurantId) return res.status(400).json({ error: 'restaurantId requis' });
  try {
    await fetch(`https://api.notion.com/v1/pages/${restaurantId}`, {
      method: 'PATCH', headers: notionHeaders,
      body: JSON.stringify({
        properties: { 'Numéro Twilio': { rich_text: [{ text: { content: '' } }] } }
      })
    });
    invalidateNumberCache();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Test d'appel : Telnyx appelle notre webhook à blanc pour vérifier la config
app.post('/api/admin/numbers/test', async (req, res) => {
  const { number } = req.body || {};
  if (!number) return res.status(400).json({ error: 'number requis' });
  // Vérifier la résolution du numéro
  const r = await getRestaurantByNumber(number);
  if (!r) return res.json({ success: false, error: 'Numéro non attribué à un restaurant' });
  res.json({
    success: true,
    restaurant: r,
    info: 'Numéro correctement attribué. Pour un vrai test, appelez ' + number + ' avec votre téléphone.'
  });
});

// ─── COMMANDE VOCALE VIA CLIENT WEB ──────────────────

app.post('/api/order/voice/session', async (req, res) => {
  try {
    const { restaurantId } = req.body;
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId manquant' });

    const restauRes = await fetch(`https://api.notion.com/v1/pages/${restaurantId}`, {
      method: 'GET', headers: notionHeaders
    });
    const restau = await restauRes.json();
    if (restau.object === 'error') return res.status(404).json({ error: 'Restaurant non trouvé' });

    const nomRestaurant = restau.properties['Nom du restaurant']?.title?.[0]?.plain_text || 'Restaurant';

    const menuRes = await fetch(`https://api.notion.com/v1/databases/${DB_MENUS}/query`, {
      method: 'POST', headers: notionHeaders,
      body: JSON.stringify({
        filter: {
          or: [
            { property: 'Restaurant ID', rich_text: { equals: restaurantId } },
            { property: 'Restaurant', rich_text: { equals: nomRestaurant } }
          ]
        }
      })
    });
    const menuData = await menuRes.json();
    const menuItems = (menuData.results || []).map(p => {
      const props = p.properties;
      return {
        nom: props['Nom du produit']?.title?.[0]?.plain_text || '',
        prix: props['Prix']?.number || 0,
        prixMenu: props['Prix menu']?.number || 0,
        dispoMenu: props['Disponible en menu']?.checkbox || false,
        categorie: props['Catégorie']?.select?.name || '',
        ingredients: props['Ingrédients']?.rich_text?.[0]?.plain_text || '',
        ingredientsRetirables: props['Ingrédients retirables']?.rich_text?.[0]?.plain_text || '',
        allergenes: props['Allergènes']?.multi_select?.map(a => a.name) || []
      };
    });

    // ── Charger le stock pour filtrer les produits indisponibles ──
    let stockMap = {}; // { nomProduitLower: { qty, statut } }
    let stockVide = false;
    try {
      const stockRes = await fetch(`https://api.notion.com/v1/databases/${DB_STOCKS}/query`, {
        method: 'POST', headers: notionHeaders,
        body: JSON.stringify({ filter: { property: 'Restaurant ID', rich_text: { equals: restaurantId } } })
      });
      const stockData = await stockRes.json();
      if (stockData.results && stockData.results.length > 0) {
        for (const s of stockData.results) {
          const nom = s.properties['Produit']?.title?.[0]?.plain_text || '';
          const qty = s.properties['Quantité actuelle']?.number ?? 0;
          const statut = s.properties['Statut']?.select?.name || 'Disponible';
          if (nom) stockMap[nom.toLowerCase()] = { qty, statut };
        }
      } else {
        // Aucun stock configuré → on considère tout comme disponible (pas de blocage)
        stockVide = true;
      }
    } catch (e) { console.log('Erreur chargement stock session:', e.message); stockVide = true; }

    // Marquer chaque article du menu selon disponibilité stock
    // On vérifie d'abord le produit lui-même, puis ses INGRÉDIENTS (pour détecter les ruptures indirectes)
    const menuAvecDispo = menuItems.map(item => {
      if (stockVide) return { ...item, dispo: true, stockQty: null };
      const key = item.nom.toLowerCase().trim();

      // 1. Chercher le produit fini directement dans le stock (cas rare)
      const stockEntryDirect = stockMap[key];
      if (stockEntryDirect) {
        const dispo = stockEntryDirect.statut !== 'Rupture' && stockEntryDirect.qty > 0;
        return { ...item, dispo, stockQty: stockEntryDirect.qty };
      }

      // 2. Vérifier chaque ingrédient du produit dans le stock (avec quantités)
      const ings = parseIngredientsWithQty(item.ingredients);
      const ingEnRupture = [];
      let minStock = null;
      for (const ing of ings) {
        const ingKey = ing.nom.toLowerCase().trim();
        const ingStock = stockMap[ingKey];
        if (ingStock) {
          if (ingStock.statut === 'Rupture' || ingStock.qty <= 0) {
            ingEnRupture.push(`${ing.qty > 1 ? ing.qty + 'x ' : ''}${ing.nom}`);
          }
          // Stock effectif = qty disponible / qty recette (combien de portions restantes)
          const portionsRestantes = ing.qty > 1 ? Math.floor(ingStock.qty / ing.qty) : ingStock.qty;
          if (minStock === null || portionsRestantes < minStock) minStock = portionsRestantes;
        }
      }

      if (ingEnRupture.length > 0) {
        return { ...item, dispo: false, stockQty: 0, ingEnRupture,
          raisonRupture: ingEnRupture.join(', ') + ' épuisé(s)' };
      }

      // 3. Aucun ingrédient en rupture → disponible
      return { ...item, dispo: true, stockQty: minStock };
    });

    const sid = Date.now().toString();

    // Stocker la session avec le menu et le stock
    voiceSessions[sid] = { panier: [], historique: [], menu: menuAvecDispo, restaurant: nomRestaurant, restaurantId, stockVide };

    res.json({
      success: true,
      sessionId: sid,
      restaurantData: {
        nom: nomRestaurant,
        menu: menuAvecDispo
      },
      greeting: `Bonjour ! Bienvenue chez ${nomRestaurant}. Que souhaitez-vous commander ?`
    });
  } catch (e) {
    console.log('Erreur session vocale:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/order/voice/message', async (req, res) => {
  try {
    const { sessionId, message } = req.body;
    if (!sessionId || !message) return res.status(400).json({ error: 'sessionId et message requis' });

    if (!voiceSessions[sessionId]) {
      return res.status(400).json({ error: 'Session expirée, rechargez la page' });
    }
    const session = voiceSessions[sessionId];
    session.historique.push({ role: 'user', content: message });

    // Séparer produits disponibles et épuisés
    const menuDispo    = session.menu.filter(p => p.dispo !== false);
    const menuRupture  = session.menu.filter(p => p.dispo === false);

    const menuTexte = menuDispo.map(p =>
      `- ${p.nom} (${p.categorie}) : ${p.prix}€${p.dispoMenu ? ' | En menu : ' + p.prixMenu + '€' : ''}${p.ingredients ? ' | Ingrédients : ' + p.ingredients : ''}${p.ingredientsRetirables ? ' | Retirables : ' + p.ingredientsRetirables : ''}${p.stockQty !== null && p.stockQty !== undefined ? ' | Stock : ' + p.stockQty + ' restants' : ''}`
    ).join('\n');

    const ruptureTexte = menuRupture.length
      ? '\n\nPRODUITS ÉPUISÉS (à ne JAMAIS proposer ni accepter — ingrédient manquant) :\n' +
        menuRupture.map(p => `- ${p.nom}${p.raisonRupture ? ' [' + p.raisonRupture + ']' : ''}`).join('\n')
      : '';

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        system: `Tu es un assistant de prise de commande pour le restaurant "${session.restaurant}".

CARTE DU RESTAURANT (produits disponibles uniquement) :
${menuTexte}${ruptureTexte}

PANIER ACTUEL : ${JSON.stringify(session.panier)}
SUR PLACE ACTUEL : ${session.surPlace === true ? 'sur place' : session.surPlace === false ? 'à emporter' : 'non précisé'}

RÈGLES :
- Utilise UNIQUEMENT les produits listés dans la carte ci-dessus
- Si un produit est dans la liste PRODUITS ÉPUISÉS, dis poliment qu'il n'est plus disponible aujourd'hui et propose une alternative disponible
- Si le client demande un produit qui n'existe pas dans la carte, dis-lui poliment et propose des alternatives
- Si le client demande "en menu" et que le produit est disponible en menu, utilise le prix menu
- Note les modifications (sans cornichon, sans oignon, etc.) dans le champ modifications
- Si le client dit "c'est tout", "valider", "confirmer", mets commandePrete à true
- Sois naturel et sympa, comme un vrai employé de fast-food
- Si le client n'a pas encore précisé sur place ou à emporter, demande-lui avant de finaliser la commande
- Détecte si le client dit "sur place", "ici", "en salle" → surPlace: true ; "à emporter", "emporter", "pour partir" → surPlace: false
- Si le client demande plusieurs burger et qu'il veut un menu, proposer pour tous les burgers, si oui mettre le nombre de firte et boisson en adequatioin, si non mettre le nombre de frite et de coca par rapport au nombre de menu
demandé
- Si des ingrédients en rupture indiqué directement que les burgers choisis sont en rupture et donc non disponible 

Réponds UNIQUEMENT en JSON valide (pas de markdown, pas de backticks).
Format :
{
  "response": "ta réponse au client",
  "panier": [{"nom": "nom exact du produit", "quantite": 1, "prix": 0.00, "modifications": "ingrédients retirés ou ajouts (ex: sans cornichon, sans glaçons) — vide si aucune modif", "categorie": "Sandwich|Boisson|Accompagnement|Dessert|Menu"}],
  "totalPrice": 0.00,
  "commandePrete": false,
  "surPlace": null
}
Note : surPlace doit être true (sur place), false (à emporter), ou null (non encore précisé).
Note : le champ "categorie" doit correspondre à la catégorie du produit dans la carte. "modifications" ne doit contenir QUE les ingrédients retirés/ajoutés, pas les options de menu (frites, coca inclus dans le menu ne sont pas des modifications).`,
        messages: session.historique
      })
    });

    const claudeData = await claudeRes.json();
    console.log('Réponse Claude brute:', JSON.stringify(claudeData).slice(0, 500));
    let jsonText = claudeData.content?.[0]?.text || '{}';
    
    // Nettoyer les backticks markdown si Claude en ajoute
    jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      console.log('Erreur parsing JSON Claude:', jsonText);
      parsed = { response: jsonText, panier: session.panier, totalPrice: 0, commandePrete: false };
    }

    session.panier = parsed.panier || [];
    session.historique.push({ role: 'assistant', content: parsed.response });
    // Mettre à jour surPlace si Claude l'a détecté
    if (parsed.surPlace === true || parsed.surPlace === false) {
      session.surPlace = parsed.surPlace;
    }

    res.json({
      response: parsed.response,
      panier: session.panier,
      totalPrice: parsed.totalPrice || 0,
      commandePrete: parsed.commandePrete || false,
      surPlace: session.surPlace ?? null
    });
  } catch (e) {
    console.log('Erreur message vocal:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/order/voice/confirm', async (req, res) => {
  try {
    const { sessionId, clientName, clientPhone } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId requis' });

    const session = voiceSessions[sessionId];
    if (!session || !session.panier.length) return res.status(400).json({ error: 'Panier vide' });

    // ── Catégoriser les articles du panier ──────────────────
    const CAT_SANDWICH    = ['Sandwich', 'Menu', 'Burger', 'Plat'];
    const CAT_BOISSON     = ['Boisson', 'Boissons', 'Drink'];
    const CAT_ACCOMP      = ['Accompagnement', 'Accompagnements', 'Frites', 'Salade'];
    const CAT_DESSERT     = ['Dessert', 'Desserts', 'Glace'];

    // Fallback : si categorie manquante, on tente de la deviner via le menu stocké en session
    const menuRef = session.menu || [];
    function getCategorie(item) {
      if (item.categorie) return item.categorie;
      const found = menuRef.find(m => m.nom && m.nom.toLowerCase() === (item.nom || '').toLowerCase());
      return found ? found.categorie : '';
    }

    const sandwichItems = session.panier.filter(p => CAT_SANDWICH.includes(getCategorie(p)));
    const boissonItems  = session.panier.filter(p => CAT_BOISSON.includes(getCategorie(p)));
    const accompItems   = session.panier.filter(p => CAT_ACCOMP.includes(getCategorie(p)));
    const dessertItems  = session.panier.filter(p => CAT_DESSERT.includes(getCategorie(p)));
    // Articles non catégorisés → on les met dans sandwich par défaut
    const autresItems   = session.panier.filter(p => {
      const cat = getCategorie(p);
      return !CAT_SANDWICH.includes(cat) && !CAT_BOISSON.includes(cat) && !CAT_ACCOMP.includes(cat) && !CAT_DESSERT.includes(cat);
    });

    function formatItem(p) {
      return p.quantite > 1 ? `${p.quantite}x ${p.nom}` : p.nom;
    }

    const sandwichStr = [...sandwichItems, ...autresItems].map(formatItem).join(', ') || '—';
    const boissonStr  = boissonItems.map(formatItem).join(', ') || '';
    const accompStr   = accompItems.map(formatItem).join(', ') || '';
    const dessertStr  = dessertItems.map(formatItem).join(', ') || '';
    // Compat : on garde option pour les vieilles commandes sans catégorie
    const optionStr   = accompStr || dessertStr ? '' : [...accompItems, ...dessertItems].map(formatItem).join(', ');

    // Modifications : uniquement les vrais ingrédients retirés/ajoutés
    const modifStr = session.panier
      .filter(p => p.modifications && p.modifications.trim())
      .map(p => `${p.nom} : ${p.modifications}`)
      .join(' | ') || '';

    const cmd = {
      id: nextId++,
      name: clientName || 'Client vocal',
      phone: clientPhone || '',
      sandwich: sandwichStr,
      boisson: boissonStr,
      option: optionStr,
      accompagnement: accompStr,
      dessert: dessertStr,
      modif: modifStr,
      allergy: '',
      surPlace: session.surPlace === true,
      restaurantId: session.restaurantId || '',
      restaurant: session.restaurant || '',
      // Panier brut : permet une déduction de stock précise (modifications par article)
      panierRaw: session.panier,
      state: 'new',
      chronoStart: null,
      chronoEnd: null,
      createdAt: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    };

    commandes.push(cmd);
    io.emit('nouvelle_commande', cmd);

    delete voiceSessions[sessionId];

    res.json({ success: true, commande: cmd });
  } catch (e) {
    console.log('Erreur confirmation:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── ANALYTICS AGRÉGÉS ───────────────────────────────
app.get('/analytics', (req, res) => {
  const { restaurantId, days: daysStr } = req.query;
  if (!restaurantId) return res.status(400).json({ error: 'restaurantId requis' });
  const days = Math.min(parseInt(daysStr || '14') || 14, 90);
  const startDate = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

  const allArchives = getMemoryArchives(restaurantId);
  const doneOrders = allArchives.filter(c => c.state === 'done' && (c.archivedDate || todayStr()) >= startDate);
  const refusedOrders = allArchives.filter(c => c.state === 'refused' && (c.archivedDate || todayStr()) >= startDate);

  const salesByProduct = {}, revenueByProduct = {};
  const revenueByCategory = { Sandwich: 0, Boisson: 0, Accompagnement: 0, Dessert: 0, Autre: 0 };
  const revenueByDay = {}, ordersByDay = {}, surPlaceByDay = {};
  let totalRevenue = 0;

  // Pré-remplir tous les jours de la période
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - (days - 1 - i) * 86400000).toISOString().split('T')[0];
    revenueByDay[d] = 0; ordersByDay[d] = 0; surPlaceByDay[d] = 0;
  }

  doneOrders.forEach(cmd => {
    const date = cmd.archivedDate || todayStr();
    ordersByDay[date] = (ordersByDay[date] || 0) + 1;
    if (cmd.surPlace) surPlaceByDay[date] = (surPlaceByDay[date] || 0) + 1;

    const items = Array.isArray(cmd.panierRaw) ? cmd.panierRaw : [];
    items.forEach(item => {
      const nom = item.nom || '';
      const qty = item.quantite || 1;
      const prix = (item.prix || 0) * qty;
      const cat = item.categorie || 'Autre';
      salesByProduct[nom] = (salesByProduct[nom] || 0) + qty;
      revenueByProduct[nom] = (revenueByProduct[nom] || 0) + prix;
      const catKey = ['Sandwich', 'Boisson', 'Accompagnement', 'Dessert'].includes(cat) ? cat : 'Autre';
      revenueByCategory[catKey] += prix;
      revenueByDay[date] = (revenueByDay[date] || 0) + prix;
      totalRevenue += prix;
    });
  });

  const topProducts = Object.entries(salesByProduct)
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([nom, qty]) => ({ nom, qty, revenue: Math.round((revenueByProduct[nom] || 0) * 100) / 100 }));

  res.json({
    totalOrders: doneOrders.length,
    refusedOrders: refusedOrders.length,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    avgOrderValue: doneOrders.length ? Math.round(totalRevenue / doneOrders.length * 100) / 100 : 0,
    revenueByDay,
    ordersByDay,
    surPlaceByDay,
    revenueByCategory,
    topProducts,
    salesByProduct,
  });
});

// ─── ADMIN STATS / HEALTH / BROADCAST / MESSAGERIE ──

app.get('/admin/stats', (req, res) => {
  const today = todayStr();
  let totalToday = 0, caToday = 0, totalAllTime = 0, totalRefused = 0;
  const activityByHour = Array(24).fill(0);
  const caByRestaurant = {};
  for (const [rid, list] of Object.entries(archivesMemory)) {
    const done = list.filter(c => c.state === 'done');
    const todayDone = done.filter(c => (c.archivedDate || '').startsWith(today));
    totalToday += todayDone.length;
    caToday += todayDone.reduce((s, c) => s + (c.total || 0), 0);
    totalAllTime += done.length;
    totalRefused += list.filter(c => c.state === 'refused').length;
    caByRestaurant[rid] = done.reduce((s, c) => s + (c.total || 0), 0);
    todayDone.forEach(c => {
      const h = c.timestamp ? new Date(c.timestamp).getHours() : new Date().getHours();
      activityByHour[h]++;
    });
  }
  res.json({
    totalToday, caToday: Math.round(caToday * 100) / 100,
    totalAllTime, totalRefused,
    restaurantsWithData: Object.keys(archivesMemory).length,
    activityByHour, caByRestaurant,
    voiceSessions: Object.keys(voiceSessions).length
  });
});

app.get('/admin/health', (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    uptime: Math.floor(process.uptime()),
    memory: { rss: Math.round(mem.rss / 1024 / 1024), heapUsed: Math.round(mem.heapUsed / 1024 / 1024), heapTotal: Math.round(mem.heapTotal / 1024 / 1024) },
    voiceSessions: Object.keys(voiceSessions).length,
    totalArchives: Object.values(archivesMemory).reduce((s, a) => s + a.length, 0),
    timestamp: new Date().toISOString(),
    nodeVersion: process.version
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DIAGNOSTIC SYSTÈME — Vérification automatique à la connexion (1x/jour/IP)
// ═══════════════════════════════════════════════════════════════════════════
const SYSTEM_CHECK_LOG_FILE = path.join(__dirname, 'system-check-log.json');

function loadSystemCheckLog() {
  try { return JSON.parse(fs.readFileSync(SYSTEM_CHECK_LOG_FILE, 'utf8')); }
  catch { return {}; }
}
function saveSystemCheckLog(data) {
  try { fs.writeFileSync(SYSTEM_CHECK_LOG_FILE, JSON.stringify(data, null, 2)); }
  catch (e) { console.log('[system-check] Erreur sauvegarde log:', e.message); }
}

async function runSystemChecks() {
  const globalStart = Date.now();
  const checks = {};

  // ── 1. Serveur Node.js ──────────────────────────────────────────────────
  const mem = process.memoryUsage();
  const uptimeSec = Math.floor(process.uptime());
  const heapPct = Math.round((mem.heapUsed / mem.heapTotal) * 100);
  let serverStatus = 'ok';
  let serverWarnings = [];
  if (heapPct > 85) { serverStatus = 'warning'; serverWarnings.push('Heap > 85 %'); }
  if (uptimeSec < 60) serverWarnings.push('Redémarrage récent');
  checks.server = {
    label: 'Serveur Node.js',
    status: serverStatus,
    latency: 0,
    detail: {
      uptime: uptimeSec,
      uptimeHuman: uptimeSec < 3600 ? `${Math.floor(uptimeSec/60)}min` : `${(uptimeSec/3600).toFixed(1)}h`,
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      rss: Math.round(mem.rss / 1024 / 1024),
      heapPct,
      nodeVersion: process.version,
    },
    warnings: serverWarnings
  };

  // ── 2. API Anthropic ────────────────────────────────────────────────────
  try {
    const t0 = Date.now();
    const resp = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01'
      },
      signal: AbortSignal.timeout(8000)
    });
    const latency = Date.now() - t0;
    const body = await resp.json().catch(() => ({}));
    const modelCount = body.data?.length || 0;
    checks.anthropic = {
      label: 'API Anthropic (IA)',
      status: resp.ok ? 'ok' : 'error',
      latency,
      detail: {
        httpStatus: resp.status,
        modelsAccessibles: modelCount,
        configured: !!process.env.ANTHROPIC_API_KEY
      },
      warnings: !process.env.ANTHROPIC_API_KEY ? ['Clé API non configurée'] : (latency > 2000 ? ['Latence élevée'] : [])
    };
  } catch (e) {
    checks.anthropic = {
      label: 'API Anthropic (IA)',
      status: 'error',
      latency: -1,
      detail: { error: e.message, configured: !!process.env.ANTHROPIC_API_KEY },
      warnings: ['Service inaccessible']
    };
  }

  // ── 3. Base de données Notion ───────────────────────────────────────────
  try {
    const t0 = Date.now();
    const resp = await fetch('https://api.notion.com/v1/users/me', {
      headers: {
        'Authorization': `Bearer ${process.env.NOTION_TOKEN || ''}`,
        'Notion-Version': '2022-06-28'
      },
      signal: AbortSignal.timeout(8000)
    });
    const latency = Date.now() - t0;
    const body = await resp.json().catch(() => ({}));
    checks.notion = {
      label: 'Base de données Notion',
      status: resp.ok ? 'ok' : (resp.status === 401 ? 'error' : 'warning'),
      latency,
      detail: {
        httpStatus: resp.status,
        botName: body.name || null,
        workspaceId: body.bot?.workspace_name || null,
        configured: !!process.env.NOTION_TOKEN
      },
      warnings: !resp.ok ? [`HTTP ${resp.status} — ${body.message || 'Erreur'}`] :
                latency > 2000 ? ['Latence élevée'] : []
    };
  } catch (e) {
    checks.notion = {
      label: 'Base de données Notion',
      status: 'error',
      latency: -1,
      detail: { error: e.message, configured: !!process.env.NOTION_TOKEN },
      warnings: ['Service inaccessible']
    };
  }

  // ── 4. Service Email Gmail ──────────────────────────────────────────────
  try {
    const mailer = getMailer();
    if (!mailer) {
      checks.email = {
        label: 'Service Email (Gmail)',
        status: 'warning',
        latency: 0,
        detail: { configured: false },
        warnings: ['GMAIL_USER ou GMAIL_APP_PASSWORD non définis']
      };
    } else {
      const t0 = Date.now();
      await mailer.verify();
      const latency = Date.now() - t0;
      checks.email = {
        label: 'Service Email (Gmail)',
        status: 'ok',
        latency,
        detail: { account: process.env.GMAIL_USER, configured: true },
        warnings: latency > 3000 ? ['Latence élevée'] : []
      };
    }
  } catch (e) {
    checks.email = {
      label: 'Service Email (Gmail)',
      status: 'error',
      latency: -1,
      detail: { error: e.message, configured: !!process.env.GMAIL_USER },
      warnings: ['Authentification échouée — vérifier le mot de passe application']
    };
  }

  // ── 5. Système de fichiers ──────────────────────────────────────────────
  try {
    const testFile = path.join(__dirname, '.sys-check-rw');
    const t0 = Date.now();
    fs.writeFileSync(testFile, 'ok');
    const content = fs.readFileSync(testFile, 'utf8');
    fs.unlinkSync(testFile);
    const latency = Date.now() - t0;
    checks.filesystem = {
      label: 'Système de fichiers',
      status: content === 'ok' ? 'ok' : 'error',
      latency,
      detail: { readWrite: true, path: __dirname },
      warnings: []
    };
  } catch (e) {
    checks.filesystem = {
      label: 'Système de fichiers',
      status: 'error',
      latency: -1,
      detail: { error: e.message },
      warnings: ['Lecture/écriture impossible']
    };
  }

  // ── 6. Intégrité des fichiers de données ────────────────────────────────
  const DATA_FILES = ['demos.json', 'broadcasts.json', 'tickets.json', 'leads.json'];
  const fileResults = [];
  for (const fname of DATA_FILES) {
    const fpath = path.join(__dirname, fname);
    try {
      const raw = fs.readFileSync(fpath, 'utf8');
      const parsed = JSON.parse(raw);
      const count = Array.isArray(parsed) ? parsed.length : Object.keys(parsed).length;
      fileResults.push({ file: fname, ok: true, entries: count });
    } catch (e) {
      fileResults.push({ file: fname, ok: false, error: e.message });
    }
  }
  const fileErrors = fileResults.filter(f => !f.ok);
  checks.dataFiles = {
    label: 'Fichiers de données',
    status: fileErrors.length > 0 ? 'error' : 'ok',
    latency: 0,
    detail: { files: fileResults, totalFiles: DATA_FILES.length, errorsCount: fileErrors.length },
    warnings: fileErrors.map(f => `${f.file} : ${f.error}`)
  };

  // ── 7. Variables d'environnement critiques ──────────────────────────────
  const requiredEnvVars = [
    { key: 'ANTHROPIC_API_KEY', label: 'Clé Anthropic' },
    { key: 'NOTION_TOKEN', label: 'Token Notion' },
    { key: 'GMAIL_USER', label: 'Email Gmail' },
    { key: 'GMAIL_APP_PASSWORD', label: 'Mot de passe Gmail' }
  ];
  const envResults = requiredEnvVars.map(v => ({
    key: v.key, label: v.label, present: !!process.env[v.key]
  }));
  const missingEnv = envResults.filter(v => !v.present);
  checks.env = {
    label: 'Variables d\'environnement',
    status: missingEnv.length > 0 ? (missingEnv.length >= 2 ? 'error' : 'warning') : 'ok',
    latency: 0,
    detail: { vars: envResults, missingCount: missingEnv.length },
    warnings: missingEnv.map(v => `${v.label} manquante`)
  };

  // ── 8. Telnyx (provider vocal) ─────────────────────────────────────────
  const TELNYX_KEY = process.env.TELNYX_API_KEY || '';
  if (!TELNYX_KEY) {
    checks.telnyx = {
      label: 'Telnyx (téléphonie vocale)',
      status: 'warning',
      latency: 0,
      detail: { configured: false },
      warnings: ['TELNYX_API_KEY non définie — appels vocaux désactivés']
    };
  } else {
    try {
      const t0 = Date.now();
      const resp = await fetch('https://api.telnyx.com/v2/phone_numbers?page[size]=1', {
        headers: { 'Authorization': `Bearer ${TELNYX_KEY}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8000)
      });
      const latency = Date.now() - t0;
      const body = await resp.json().catch(() => ({}));
      const numberCount = body.meta?.total_results ?? (body.data?.length ?? null);
      checks.telnyx = {
        label: 'Telnyx (téléphonie vocale)',
        status: resp.ok ? 'ok' : 'error',
        latency,
        detail: { httpStatus: resp.status, numbersConfigured: numberCount, configured: true },
        warnings: !resp.ok ? [`HTTP ${resp.status} — ${body.errors?.[0]?.detail || 'Erreur API'}`]
                : latency > 2000 ? ['Latence élevée'] : []
      };
    } catch (e) {
      checks.telnyx = {
        label: 'Telnyx (téléphonie vocale)',
        status: 'error',
        latency: -1,
        detail: { error: e.message, configured: true },
        warnings: ['Service inaccessible — appels vocaux hors ligne']
      };
    }
  }

  // ── 9. Deepgram (transcription vocale) ──────────────────────────────────
  const DEEPGRAM_KEY = process.env.DEEPGRAM_API_KEY || '';
  if (!DEEPGRAM_KEY) {
    checks.deepgram = {
      label: 'Deepgram (transcription vocale)',
      status: 'warning',
      latency: 0,
      detail: { configured: false },
      warnings: ['DEEPGRAM_API_KEY non définie — transcription désactivée']
    };
  } else {
    try {
      const t0 = Date.now();
      const resp = await fetch('https://api.deepgram.com/v1/projects', {
        headers: { 'Authorization': `Token ${DEEPGRAM_KEY}` },
        signal: AbortSignal.timeout(8000)
      });
      const latency = Date.now() - t0;
      const body = await resp.json().catch(() => ({}));
      const projectCount = body.projects?.length ?? null;
      checks.deepgram = {
        label: 'Deepgram (transcription vocale)',
        status: resp.ok ? 'ok' : 'error',
        latency,
        detail: { httpStatus: resp.status, projects: projectCount, configured: true },
        warnings: !resp.ok ? [`HTTP ${resp.status} — clé invalide ou expirée`]
                : latency > 2000 ? ['Latence élevée'] : []
      };
    } catch (e) {
      checks.deepgram = {
        label: 'Deepgram (transcription vocale)',
        status: 'error',
        latency: -1,
        detail: { error: e.message, configured: true },
        warnings: ['Service inaccessible — transcription hors ligne']
      };
    }
  }

  // ── 10. Espace disque ────────────────────────────────────────────────────
  try {
    const { execSync } = require('child_process');
    const dfOut = execSync('df -k .', { timeout: 5000 }).toString().trim();
    const lines = dfOut.split('\n');
    const parts = lines[lines.length - 1].trim().split(/\s+/);
    // df -k : Filesystem, 1K-blocks, Used, Available, Use%, Mounted
    const totalKb     = parseInt(parts[1], 10);
    const usedKb      = parseInt(parts[2], 10);
    const availableKb = parseInt(parts[3], 10);
    const usedPct     = Math.round((usedKb / totalKb) * 100);
    const availableGb = (availableKb / 1024 / 1024).toFixed(1);
    const totalGb     = (totalKb / 1024 / 1024).toFixed(1);
    let diskStatus = 'ok';
    const diskWarnings = [];
    if (usedPct >= 90) { diskStatus = 'error';   diskWarnings.push(`Disque critique : ${usedPct}% utilisé`); }
    else if (usedPct >= 75) { diskStatus = 'warning'; diskWarnings.push(`Espace limité : ${usedPct}% utilisé`); }
    checks.disk = {
      label: 'Espace disque',
      status: diskStatus,
      latency: 0,
      detail: { usedPct, availableGb: parseFloat(availableGb), totalGb: parseFloat(totalGb), usedGb: ((usedKb/1024/1024)).toFixed(1) },
      warnings: diskWarnings
    };
  } catch (e) {
    checks.disk = {
      label: 'Espace disque',
      status: 'warning',
      latency: 0,
      detail: { error: e.message },
      warnings: ['Impossible de lire l\'espace disque']
    };
  }

  // ── Score global ────────────────────────────────────────────────────────
  const allStatuses = Object.values(checks).map(c => c.status);
  const hasError   = allStatuses.includes('error');
  const hasWarning = allStatuses.includes('warning');
  const globalStatus = hasError ? 'error' : hasWarning ? 'warning' : 'ok';
  const score = Math.round(
    (allStatuses.filter(s => s === 'ok').length / allStatuses.length) * 100
  );

  return {
    globalStatus,
    score,
    checks,
    totalDuration: Date.now() - globalStart,
    timestamp: new Date().toISOString(),
    cached: false
  };
}

app.get('/admin/system-check', requireAdmin, async (req, res) => {
  const rawIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
             || req.ip
             || req.connection?.remoteAddress
             || 'unknown';
  // Normaliser IPv6 loopback
  const ip = rawIp === '::1' ? '127.0.0.1' : rawIp;
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const log = loadSystemCheckLog();

  // Cache : si ce IP a déjà déclenché un check aujourd'hui, retourner le résultat
  if (log[ip] && log[ip].date === today && log[ip].result) {
    return res.json({ ...log[ip].result, cached: true, cachedAt: log[ip].result.timestamp });
  }

  try {
    const result = await runSystemChecks();

    // Sauvegarder en cache
    log[ip] = { date: today, result };

    // Purger les entrées de plus de 7 jours
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    for (const k of Object.keys(log)) {
      if (log[k].date < cutoff) delete log[k];
    }
    saveSystemCheckLog(log);

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Erreur lors du diagnostic : ' + e.message });
  }
});

// Forcer un nouveau check (ignore le cache IP)
app.post('/admin/system-check/force', requireAdmin, async (req, res) => {
  try {
    const result = await runSystemChecks();
    // On efface le cache pour cet IP afin que le prochain GET soit frais
    const rawIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
               || req.ip || req.connection?.remoteAddress || 'unknown';
    const ip = rawIp === '::1' ? '127.0.0.1' : rawIp;
    const log = loadSystemCheckLog();
    const today = new Date().toISOString().slice(0, 10);
    log[ip] = { date: today, result };
    saveSystemCheckLog(log);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Erreur lors du diagnostic forcé : ' + e.message });
  }
});


// ─── BROADCASTS (persistants fichier) ────────────────
app.get('/admin/broadcast', (req, res) => {
  const bs = loadBroadcasts();
  const { restaurantId } = req.query;
  if (restaurantId) {
    // Pour un restaurant: exclure ceux qu'il a dismissés
    return res.json(bs.filter(b => !(b.dismissedBy||[]).includes(restaurantId)));
  }
  res.json(bs);
});

app.post('/admin/broadcast', (req, res) => {
  const { message, type, author } = req.body;
  if (!message) return res.status(400).json({ error: 'Message requis' });
  const b = { id: Date.now().toString(), message, type: type || 'info', author: author || 'Admin', createdAt: new Date().toISOString(), dismissedBy: [] };
  const bs = loadBroadcasts();
  bs.unshift(b);
  if (bs.length > 200) bs.splice(200);
  saveBroadcasts(bs);
  io.emit('broadcast', b);
  res.json({ success: true, broadcast: b });
});

app.delete('/admin/broadcast/:id', (req, res) => {
  const bs = loadBroadcasts();
  const idx = bs.findIndex(b => b.id === req.params.id);
  if (idx !== -1) bs.splice(idx, 1);
  saveBroadcasts(bs);
  res.json({ success: true });
});

// Dismiss d'un broadcast (côté restaurant)
app.patch('/admin/broadcast/:id/dismiss', (req, res) => {
  const { restaurantId } = req.body;
  const bs = loadBroadcasts();
  const b = bs.find(b => b.id === req.params.id);
  if (b && restaurantId && !(b.dismissedBy||[]).includes(restaurantId)) {
    b.dismissedBy = b.dismissedBy || [];
    b.dismissedBy.push(restaurantId);
    saveBroadcasts(bs);
  }
  res.json({ success: true });
});

// ─── MESSAGERIE ──────────────────────────────────────
// GET messages d'un restaurant
app.get('/messages/:restaurantId', (req, res) => {
  res.json(loadMessages(req.params.restaurantId));
});

// POST envoyer un message (admin → restaurant ou restaurant → admin)
app.post('/messages/:restaurantId', (req, res) => {
  const { from, fromName, content, type, meta } = req.body;
  if (!content) return res.status(400).json({ error: 'Contenu requis' });
  const msgs = loadMessages(req.params.restaurantId);
  const msg = {
    id: Date.now().toString(),
    restaurantId: req.params.restaurantId,
    from: from || 'admin',      // 'admin' | 'restaurant'
    fromName: fromName || 'Admin',
    content,
    type: type || 'message',    // 'message' | 'restock_alert' | 'system'
    meta: meta || null,
    timestamp: new Date().toISOString(),
    readBy: [],
    dismissed: false
  };
  msgs.push(msg);
  if (msgs.length > 500) msgs.splice(0, msgs.length - 500);
  saveMessages(req.params.restaurantId, msgs);
  // Notif temps réel
  io.emit(`msg_${req.params.restaurantId}`, msg);
  io.emit('admin_new_msg', { restaurantId: req.params.restaurantId, msg });
  // Email à l'admin si le message vient d'un restaurant (pas de l'admin lui-même)
  if (from === 'restaurant') {
    sendAdminEmailNotif(fromName || 'Restaurant', content).catch(() => {});
  }
  res.json({ success: true, msg });
});

// PATCH marquer comme lu
app.patch('/messages/:restaurantId/:msgId/read', (req, res) => {
  const { by } = req.body;
  const msgs = loadMessages(req.params.restaurantId);
  const m = msgs.find(m => m.id === req.params.msgId);
  if (m && by && !m.readBy.includes(by)) m.readBy.push(by);
  saveMessages(req.params.restaurantId, msgs);
  res.json({ success: true });
});

// PATCH marquer tous comme lus
app.patch('/messages/:restaurantId/read-all', (req, res) => {
  const { by } = req.body;
  const rid = req.params.restaurantId;
  const msgs = loadMessages(rid);
  msgs.forEach(m => { if (by && !m.readBy.includes(by)) m.readBy.push(by); });
  saveMessages(rid, msgs);
  // Notifier admin.html que les messages de ce resto ont été lus
  if (by === 'admin') {
    io.emit('admin_msgs_read', { restaurantId: rid });
  }
  res.json({ success: true });
});

// DELETE supprimer un message — réservé au compte Admin uniquement
app.delete('/messages/:restaurantId/:msgId', requireSession, (req, res) => {
  if (req.session.role !== 'Admin') {
    return res.status(403).json({ error: 'Suppression réservée à l\'administrateur.' });
  }
  let msgs = loadMessages(req.params.restaurantId);
  msgs = msgs.filter(m => m.id !== req.params.msgId);
  saveMessages(req.params.restaurantId, msgs);
  res.json({ success: true });
});

// GET liste des conversations pour admin (résumé par restaurant)
app.get('/admin/conversations', async (req, res) => {
  try {
    const files = fs.readdirSync(MESSAGES_DIR).filter(f => f.endsWith('.json'));
    const convos = [];
    for (const f of files) {
      const rid = f.replace('messages_', '').replace('.json', '');
      const msgs = loadMessages(rid);
      if (!msgs.length) continue;
      const last = msgs[msgs.length - 1];
      const unread = msgs.filter(m => m.from === 'restaurant' && !m.readBy.includes('admin')).length;
      convos.push({ restaurantId: rid, lastMessage: last, unread, total: msgs.length });
    }
    convos.sort((a, b) => new Date(b.lastMessage.timestamp) - new Date(a.lastMessage.timestamp));
    res.json(convos);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── RESTOCK RECOMMENDATIONS ─────────────────────────
app.get('/restock-recommendations/:restaurantId', async (req, res) => {
  const { restaurantId } = req.params;
  const { days = 14 } = req.query;
  try {
    // Charger le stock actuel
    const stockRes = await fetch(`https://api.notion.com/v1/databases/${process.env.DB_STOCKS || ''}/query`, {
      method: 'POST', headers: notionHeaders,
      body: JSON.stringify({ filter: { property: 'Restaurant ID', rich_text: { equals: restaurantId } } })
    });
    let stockItems = [];
    if (stockRes.ok) {
      const stockData = await stockRes.json();
      stockItems = (stockData.results || []).map(p => ({
        id: p.id,
        nom: p.properties['Nom']?.title?.[0]?.plain_text || '',
        quantite: p.properties['Quantité actuelle']?.number ?? 0,
        unite: p.properties['Unité']?.select?.name || '',
        seuilAlerte: p.properties['Seuil d\'alerte']?.number ?? 5,
        statut: p.properties['Statut']?.select?.name || 'OK'
      }));
    }

    // Analyser la consommation sur les N derniers jours
    const cutoff = new Date(Date.now() - parseInt(days) * 86400000).toISOString().split('T')[0];
    const archives = getMemoryArchives(restaurantId);
    const recentOrders = archives.filter(c => c.state === 'done' && (c.archivedDate || '') >= cutoff);

    // Compter la consommation par ingrédient
    const consumptionMap = {};
    recentOrders.forEach(cmd => {
      const items = cmd.panierRaw || [];
      items.forEach(item => {
        const key = (item.nom || '').toLowerCase().trim();
        const menuKey = Object.keys(menuMap).find(k => key.includes(k) || k.includes(key));
        if (menuKey) {
          const ings = menuMap[menuKey] || [];
          const qte = item.quantite || 1;
          ings.forEach(ing => {
            const ingKey = (ing.nom || ing).toLowerCase().trim();
            const ingQty = (ing.qty || 1) * qte;
            consumptionMap[ingKey] = (consumptionMap[ingKey] || 0) + ingQty;
          });
        }
      });
    });

    // Générer les recommandations
    const daysNum = parseInt(days);
    const recommendations = [];
    stockItems.forEach(item => {
      const key = item.nom.toLowerCase().trim();
      const totalConsumed = consumptionMap[key] || 0;
      const avgPerDay = totalConsumed / daysNum;
      const daysRemaining = avgPerDay > 0 ? Math.floor(item.quantite / avgPerDay) : null;
      const weeklyNeed = Math.ceil(avgPerDay * 7);
      const urgency = daysRemaining !== null
        ? daysRemaining <= 1 ? 'critique' : daysRemaining <= 3 ? 'urgent' : daysRemaining <= 7 ? 'attention' : null
        : item.statut === 'Rupture' ? 'critique' : null;

      if (urgency || item.statut === 'Rupture' || item.statut === 'Alerte') {
        recommendations.push({
          id: item.id,
          nom: item.nom,
          quantiteActuelle: item.quantite,
          unite: item.unite,
          statut: item.statut,
          totalConsumed: Math.round(totalConsumed * 10) / 10,
          avgPerDay: Math.round(avgPerDay * 10) / 10,
          daysRemaining,
          weeklyNeed,
          urgency: urgency || 'attention',
          seuilAlerte: item.seuilAlerte
        });
      }
    });

    recommendations.sort((a, b) => {
      const order = { critique: 0, urgent: 1, attention: 2 };
      return (order[a.urgency] ?? 3) - (order[b.urgency] ?? 3);
    });

    res.json({ recommendations, period: daysNum, totalOrders: recentOrders.length });
  } catch(e) {
    console.error('Restock error:', e);
    res.json({ recommendations: [], period: parseInt(days), totalOrders: 0 });
  }
});

// Envoyer une alerte restock comme message
app.post('/admin/restock-alert/:restaurantId', async (req, res) => {
  const { restaurantId } = req.params;
  const { items, author } = req.body;
  if (!items?.length) return res.status(400).json({ error: 'items requis' });
  const content = `⚠️ Alerte réapprovisionnement : ${items.map(i => `${i.nom} (${i.quantiteActuelle} ${i.unite} restants, besoin estimé: ${i.weeklyNeed}/semaine)`).join(' · ')}`;
  const msgs = loadMessages(restaurantId);
  const msg = {
    id: Date.now().toString(), restaurantId,
    from: 'admin', fromName: author || 'Système',
    content, type: 'restock_alert',
    meta: { items },
    timestamp: new Date().toISOString(), readBy: [], dismissed: false
  };
  msgs.push(msg);
  saveMessages(restaurantId, msgs);
  io.emit(`msg_${restaurantId}`, msg);
  io.emit('admin_new_msg', { restaurantId, msg });
  res.json({ success: true, msg });
});

// ─── TICKETS SUPPORT ─────────────────────────────────

// GET tous les tickets (admin)
app.get('/tickets', (req, res) => {
  const tickets = loadTickets();
  const { statut, type, priorite, restaurantId, q } = req.query;
  let result = [...tickets];
  if (restaurantId) result = result.filter(t => t.restaurantId === restaurantId);
  if (statut) result = result.filter(t => t.statut === statut);
  if (type) result = result.filter(t => t.type === type);
  if (priorite) result = result.filter(t => t.priorite === priorite);
  if (q) { const ql = q.toLowerCase(); result = result.filter(t => t.titre.toLowerCase().includes(ql) || t.description.toLowerCase().includes(ql) || t.restaurantNom?.toLowerCase().includes(ql)); }
  result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(result);
});

// GET stats tickets (admin dashboard)
app.get('/tickets/stats', (req, res) => {
  const tickets = loadTickets();
  const now = Date.now();
  const stats = {
    total: tickets.length,
    ouverts: tickets.filter(t => t.statut === 'ouvert').length,
    en_cours: tickets.filter(t => t.statut === 'en_cours').length,
    resolus: tickets.filter(t => t.statut === 'resolu').length,
    critiques: tickets.filter(t => t.priorite === 'critique').length,
    sla_breach: tickets.filter(t => t.statut !== 'resolu' && t.statut !== 'ferme' && t.slaTarget && (now - new Date(t.createdAt)) > t.slaTarget * 3600000).length,
    avgResolutionH: (() => { const res = tickets.filter(t => t.resolvedAt); if (!res.length) return null; return Math.round(res.reduce((s,t) => s + (new Date(t.resolvedAt)-new Date(t.createdAt))/3600000, 0)/res.length * 10)/10; })(),
    byType: ['bug','question','feature','urgent'].reduce((o,k) => { o[k]=tickets.filter(t=>t.type===k).length; return o; }, {}),
    byPriorite: ['critique','haute','normale','basse'].reduce((o,k) => { o[k]=tickets.filter(t=>t.priorite===k).length; return o; }, {})
  };
  res.json(stats);
});

// GET tickets d'un restaurant
app.get('/tickets/restaurant/:restaurantId', (req, res) => {
  const tickets = loadTickets().filter(t => t.restaurantId === req.params.restaurantId);
  res.json(tickets.sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt)));
});

// POST créer un ticket
app.post('/tickets', (req, res) => {
  const { restaurantId, restaurantNom, titre, description, type, priorite, metadata } = req.body;
  if (!restaurantId || !titre || !description) return res.status(400).json({ error: 'restaurantId, titre et description requis' });
  const ticket = {
    id: nextTicketId(),
    restaurantId, restaurantNom: restaurantNom || restaurantId,
    titre, description,
    type: type || 'question',               // bug | question | feature | urgent
    priorite: priorite || 'normale',        // critique | haute | normale | basse
    statut: 'ouvert',                       // ouvert | en_cours | en_attente | resolu | ferme
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    resolvedAt: null,
    slaTarget: priorite==='critique' ? 2 : priorite==='haute' ? 8 : 24, // heures
    comments: [],
    metadata: metadata || {},
    rating: null,
    adminNote: '',
    assignedTo: null,
    progress: 0
  };
  const tickets = loadTickets();
  tickets.unshift(ticket);
  saveTickets(tickets);
  // Notifier l'admin
  io.emit('new_ticket', ticket);
  res.json({ success: true, ticket });
});

// PATCH mettre à jour un ticket (admin)
app.patch('/tickets/:id', (req, res) => {
  const tickets = loadTickets();
  const idx = tickets.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Ticket introuvable' });
  const { statut, priorite, adminNote, assignedTo, tags, progress } = req.body;
  const t = tickets[idx];
  if (statut) t.statut = statut;
  if (priorite) t.priorite = priorite;
  if (adminNote !== undefined) t.adminNote = adminNote;
  if (assignedTo !== undefined) t.assignedTo = assignedTo;
  if (tags) t.tags = tags;
  if (progress !== undefined) t.progress = Math.min(100, Math.max(0, progress));
  if (statut === 'resolu' && !t.resolvedAt) t.resolvedAt = new Date().toISOString();
  t.updatedAt = new Date().toISOString();
  tickets[idx] = t;
  saveTickets(tickets);
  io.emit(`ticket_update_${t.restaurantId}`, t);
  io.emit('admin_ticket_update', t);
  res.json({ success: true, ticket: t });
});

// POST ajouter un commentaire
app.post('/tickets/:id/comment', (req, res) => {
  const tickets = loadTickets();
  const idx = tickets.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Ticket introuvable' });
  const { from, fromName, content, internal } = req.body;
  if (!content) return res.status(400).json({ error: 'Contenu requis' });
  const comment = {
    id: Date.now().toString(), from: from || 'admin', fromName: fromName || 'Admin',
    content, internal: internal || false, timestamp: new Date().toISOString()
  };
  tickets[idx].comments.push(comment);
  tickets[idx].updatedAt = new Date().toISOString();
  if (from === 'admin' && tickets[idx].statut === 'ouvert') tickets[idx].statut = 'en_cours';
  saveTickets(tickets);
  io.emit(`ticket_comment_${tickets[idx].restaurantId}`, { ticketId: req.params.id, comment });
  io.emit('admin_ticket_comment', { ticketId: req.params.id, restaurantId: tickets[idx].restaurantId, comment });
  res.json({ success: true, comment, ticket: tickets[idx] });
});

// POST noter un ticket résolu (restaurant)
app.patch('/tickets/:id/rate', (req, res) => {
  const tickets = loadTickets();
  const t = tickets.find(t => t.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Introuvable' });
  t.rating = Math.min(5, Math.max(1, parseInt(req.body.rating) || 3));
  saveTickets(tickets);
  res.json({ success: true });
});

// DELETE un ticket
app.delete('/tickets/:id', (req, res) => {
  let tickets = loadTickets();
  tickets = tickets.filter(t => t.id !== req.params.id);
  saveTickets(tickets);
  res.json({ success: true });
});

// ─── PING & START ────────────────────────────────────

// ═══════════════════════════════════════════════════════
// FORMULAIRE DE CONTACT — leads.json + email Resend
// ═══════════════════════════════════════════════════════
const LEADS_FILE = path.join(__dirname, 'leads.json');
function readLeads() {
  try { return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8')); } catch { return []; }
}
function saveLead(lead) {
  try {
  const leads = readLeads();
  leads.unshift(lead);
  fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
  } catch (_) { /* filesystem read-only sur Vercel — ignoré */ }
}

app.post('/contact', async (req, res) => {
  const { prenom, nom, email, tel, restaurant, besoin, message } = req.body;
  if (!prenom || !email) return res.status(400).json({ error: 'Prénom et email requis' });

  const lead = {
    id: 'LEAD-' + Date.now(),
    prenom, nom: nom || '',
    email, tel: tel || '',
    restaurant: restaurant || '',
    besoin: besoin || '',
    message: message || '',
    createdAt: new Date().toISOString()
  };

  // Toujours sauvegarder dans le fichier — aucun lead perdu
  saveLead(lead);
  console.log(`📩 Nouveau lead: ${prenom} ${nom || ''} <${email}> — ${besoin || '—'}`);

  // ── Envoi emails via Gmail (nodemailer) ──
  const mailer = getMailer();
  const ADMIN_MAIL = process.env.GMAIL_USER || 'quentin.despres6869@gmail.com';

  if (mailer) {
    const dateStr = new Date().toLocaleString('fr-FR');

    // 1️⃣  Notification admin
    const htmlAdmin = `
      <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;padding:28px;border:1px solid #e0e8d8;border-radius:14px;background:#fff;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">
          <div style="background:#1a4a20;border-radius:8px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;">
            <span style="color:#7BBBB5;font-size:18px;">⌘</span>
          </div>
          <span style="font-size:17px;font-weight:700;color:#0F2A28;">Commande<span style="color:#7BBBB5;">IA</span></span>
        </div>
        <h2 style="color:#1a4a20;margin:0 0 16px;font-size:18px;">🎯 Nouveau lead entrant</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:10px 0;color:#888;width:140px;">Prénom</td><td style="padding:10px 0;font-weight:600;color:#0F2A28;">${prenom}</td></tr>
          <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:10px 0;color:#888;">Nom</td><td style="padding:10px 0;font-weight:600;color:#0F2A28;">${nom || '—'}</td></tr>
          <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:10px 0;color:#888;">Email</td><td style="padding:10px 0;"><a href="mailto:${email}" style="color:#1a4a20;font-weight:600;">${email}</a></td></tr>
          <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:10px 0;color:#888;">Téléphone</td><td style="padding:10px 0;font-weight:600;color:#0F2A28;">${tel || '—'}</td></tr>
          <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:10px 0;color:#888;">Restaurant</td><td style="padding:10px 0;font-weight:600;color:#0F2A28;">${restaurant || '—'}</td></tr>
          <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:10px 0;color:#888;">Besoin</td><td style="padding:10px 0;"><span style="background:#edf7e6;color:#1a4a20;font-weight:700;padding:3px 10px;border-radius:20px;">${besoin || '—'}</span></td></tr>
          ${message ? `<tr><td style="padding:10px 0;color:#888;vertical-align:top;">Message</td><td style="padding:10px 0;color:#333;font-style:italic;">"${message}"</td></tr>` : ''}
        </table>
        <a href="mailto:${email}" style="display:inline-block;margin-top:20px;padding:10px 20px;background:#1a4a20;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;">Répondre à ${prenom}</a>
        <p style="margin-top:16px;font-size:12px;color:#bbb;border-top:1px solid #f0f0f0;padding-top:14px;">Reçu le ${dateStr} via commande-ia.fr</p>
      </div>`;

    // 2️⃣  Confirmation au prospect
    const htmlProspect = `
      <div style="font-family:Inter,sans-serif;max-width:540px;margin:0 auto;padding:28px;border:1px solid #e0e8d8;border-radius:14px;background:#fff;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px;">
          <div style="background:#1a4a20;border-radius:8px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;">
            <span style="color:#7BBBB5;font-size:18px;">⌘</span>
          </div>
          <span style="font-size:17px;font-weight:700;color:#0F2A28;">Commande<span style="color:#7BBBB5;">IA</span></span>
        </div>
        <h2 style="color:#1a4a20;margin:0 0 8px;font-size:20px;">Merci ${prenom} ! 🎉</h2>
        <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 20px;">
          Nous avons bien reçu votre demande${restaurant ? ' pour <strong>' + restaurant + '</strong>' : ''}.<br>
          Notre équipe vous recontacte sous <strong>24h</strong>.
        </p>
        <div style="background:#f4faf0;border-left:4px solid #1a4a20;border-radius:0 8px 8px 0;padding:14px 16px;margin-bottom:20px;font-size:13px;color:#333;">
          <strong>Votre demande :</strong> ${besoin || '—'}${message ? '<br><em>"' + message + '"</em>' : ''}
        </div>
        <p style="font-size:13px;color:#888;margin:0;">Une question ? Répondez directement à cet email ou écrivez à <a href="mailto:contact@commande-ia.com" style="color:#1a4a20;">contact@commande-ia.com</a></p>
        <p style="margin-top:24px;font-size:11px;color:#ccc;border-top:1px solid #f0f0f0;padding-top:14px;">© ${new Date().getFullYear()} Commande-IA · Tous droits réservés</p>
      </div>`;

    try {
      await Promise.all([
        mailer.sendMail({
          from: `"Commande-IA" <${ADMIN_MAIL}>`,
          to: ADMIN_MAIL,
          replyTo: email,
          subject: `🎯 Nouveau lead — ${restaurant || prenom + ' ' + (nom || '')}`,
          html: htmlAdmin
        }),
        mailer.sendMail({
          from: `"Commande-IA" <${ADMIN_MAIL}>`,
          to: email,
          subject: `Votre demande Commande-IA est bien prise en charge ✅`,
          html: htmlProspect
        })
      ]);
      console.log(`✅ Emails envoyés — admin + confirmation à ${email}`);
    } catch (e) {
      console.error('❌ Erreur envoi mail:', e.message);
    }
  } else {
    console.log('⚠️  GMAIL_USER / GMAIL_APP_PASSWORD non configurés — email non envoyé');
  }

  res.json({ success: true });
});

// Note: GET /admin/leads intentionnellement retiré (aucune page frontend ne l'utilise).
// readLeads() est conservée car utilisée en interne par POST /contact.

// ═══════════════════════════════════════════════════════
// COMPTES DÉMO PROSPECTS
// ═══════════════════════════════════════════════════════
const DEMOS_FILE = path.join(__dirname, 'demos.json');
function readDemos() {
  try { return JSON.parse(fs.readFileSync(DEMOS_FILE, 'utf8')); } catch { return []; }
}
function saveDemos(list) {
  fs.writeFileSync(DEMOS_FILE, JSON.stringify(list, null, 2));
}
function slugify(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '').slice(0, 20);
}
function genDemoPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const buf = crypto.randomBytes(8);
  let p = '';
  for (let i = 0; i < 8; i++) p += chars[buf[i] % chars.length];
  return p;
}

// Créer un compte démo
app.post('/demo-accounts', (req, res) => {
  const { prenom, nom, email, restaurant, rdvDate, rdvNotes, motDePasse } = req.body;
  if (!prenom || !restaurant) return res.status(400).json({ error: 'Prénom et restaurant requis' });
  if (motDePasse && motDePasse.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (min 6 caractères)' });
  const demos = readDemos();
  const slug = slugify(restaurant);
  const demoEmail = `${slug}@essai.demo`;
  const existing = demos.find(d => d.demoEmail === demoEmail);
  if (existing) return res.status(409).json({ error: 'Un compte démo existe déjà pour ce restaurant', existing });
  const pwd = motDePasse || genDemoPassword();
  const demo = {
    id: 'DEMO-' + Date.now(),
    prenom, nom: nom || '', email: email || '',
    restaurant,
    demoEmail,
    password: pwd,             // stocké en clair — compte démo admin uniquement
    passwordHash: hashPassword(pwd),
    statut: 'créé',
    rdvDate: rdvDate || null,
    rdvNotes: rdvNotes || '',
    createdAt: new Date().toISOString(),
    lastLogin: null,
    loginCount: 0
  };
  demos.unshift(demo);
  saveDemos(demos);
  console.log(`🎯 Nouveau compte démo: ${demoEmail}`);
  res.json({ success: true, demo });
});

// Liste des comptes démo (hash non exposé, mot de passe en clair visible admin)
app.get('/demo-accounts', (req, res) => {
  const demos = readDemos().map(d => {
    const { passwordHash, ...safe } = d;
    return safe;
  });
  res.json(demos);
});

// Reset mot de passe d'un compte démo
app.patch('/demo-accounts/:id/reset-password', (req, res) => {
  const demos = readDemos();
  const idx = demos.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Compte démo introuvable' });
  const { motDePasse } = req.body || {};
  if (motDePasse && motDePasse.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (min 6 caractères)' });
  const pwd = motDePasse || genDemoPassword();
  demos[idx].password = pwd;
  demos[idx].passwordHash = hashPassword(pwd);
  saveDemos(demos);
  console.log(`🔑 Reset MDP démo: ${demos[idx].demoEmail}`);
  res.json({ success: true, motDePasse: pwd, demoEmail: demos[idx].demoEmail });
});

// Stats démo
app.get('/demo-accounts/stats', (req, res) => {
  const demos = readDemos();
  res.json({
    total: demos.length,
    connectes: demos.filter(d => d.loginCount > 0).length,
    rdv: demos.filter(d => d.statut === 'rdv_confirmé').length,
    convertis: demos.filter(d => d.statut === 'converti').length,
    perdus: demos.filter(d => d.statut === 'perdu').length
  });
});

// Mettre à jour un compte démo
app.patch('/demo-accounts/:id', (req, res) => {
  const demos = readDemos();
  const idx = demos.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Introuvable' });
  Object.assign(demos[idx], req.body, { id: demos[idx].id, demoEmail: demos[idx].demoEmail });
  saveDemos(demos);
  res.json({ success: true, demo: demos[idx] });
});

// Supprimer un compte démo
app.delete('/demo-accounts/:id', (req, res) => {
  let demos = readDemos();
  const before = demos.length;
  demos = demos.filter(d => d.id !== req.params.id);
  if (demos.length === before) return res.status(404).json({ error: 'Introuvable' });
  saveDemos(demos);
  res.json({ success: true });
});

// Régénérer le mot de passe d'un compte démo
app.post('/demo-accounts/:id/reset-password', (req, res) => {
  const demos = readDemos();
  const demo = demos.find(d => d.id === req.params.id);
  if (!demo) return res.status(404).json({ error: 'Introuvable' });
  const newPwd = genDemoPassword();
  demo.passwordHash = hashPassword(newPwd);
  delete demo.password; // nettoyage anciens enregistrements en clair
  saveDemos(demos);
  // Retourne le mot de passe en clair UNE SEULE FOIS pour que l'admin puisse le communiquer
  res.json({ success: true, password: newPwd });
});

app.get('/ping', (req, res) => res.json({ message: 'Serveur en ligne ✅' }));

// ─── ALLERGÈNES (persistant par restaurant) ─────────────────────────────────
const ALLERGENS_DIR = process.env.VERCEL ? path.join('/tmp', 'allergens') : path.join(__dirname, 'allergens');
if (!fs.existsSync(ALLERGENS_DIR)) fs.mkdirSync(ALLERGENS_DIR, { recursive: true });

function allergensFile(restaurantId) {
  const safe = (restaurantId || 'global').replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(ALLERGENS_DIR, `allergens_${safe}.json`);
}
function loadAllergens(restaurantId) {
  try {
    const f = allergensFile(restaurantId);
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8')) || { config: {} };
  } catch(e) {}
  return { config: {} };
}
function saveAllergens(restaurantId, data) {
  try { fs.writeFileSync(allergensFile(restaurantId), JSON.stringify(data, null, 2)); }
  catch(e) { console.log('Erreur sauvegarde allergènes:', e.message); }
}

app.get('/allergenes/:restaurantId', (req, res) => {
  res.json(loadAllergens(req.params.restaurantId));
});
app.put('/allergenes/:restaurantId', (req, res) => {
  const data = req.body;
  if (!data.config) return res.status(400).json({ error: 'config requis' });
  saveAllergens(req.params.restaurantId, { config: data.config, updatedAt: data.updatedAt, updatedBy: data.updatedBy });
  io.to(`restaurant:${req.params.restaurantId}`).emit('allergens-broadcast', {
    restaurantId: req.params.restaurantId,
    config: data.config,
    updatedBy: data.updatedBy
  });
  res.json({ success: true });
});

// ─── CRM (persistant par restaurant) ────────────────────────────────────────
const CRM_DIR = process.env.VERCEL ? path.join('/tmp', 'crm') : path.join(__dirname, 'crm');
if (!fs.existsSync(CRM_DIR)) fs.mkdirSync(CRM_DIR);

function crmFile(restaurantId) {
  const safe = (restaurantId || 'global').replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(CRM_DIR, `crm_${safe}.json`);
}
function loadCRM(restaurantId) {
  try {
    const f = crmFile(restaurantId);
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8')) || { clients: [] };
  } catch(e) {}
  return { clients: [] };
}
function saveCRM(restaurantId, data) {
  try { fs.writeFileSync(crmFile(restaurantId), JSON.stringify(data, null, 2)); }
  catch(e) { console.log('Erreur sauvegarde CRM:', e.message); }
}

app.get('/crm/:restaurantId', (req, res) => {
  res.json(loadCRM(req.params.restaurantId));
});
app.put('/crm/:restaurantId', (req, res) => {
  const data = req.body;
  if (!Array.isArray(data.clients)) return res.status(400).json({ error: 'clients requis' });
  saveCRM(req.params.restaurantId, { clients: data.clients, updatedAt: data.updatedAt, updatedBy: data.updatedBy });
  // Broadcast via socket.io
  io.to(`restaurant:${req.params.restaurantId}`).emit('crm-broadcast', {
    restaurantId: req.params.restaurantId,
    clients: data.clients,
    updatedBy: data.updatedBy
  });
  res.json({ success: true });
});

// ─── PLANNING (persistant par restaurant) ───────────────────────────────────
const PLANNING_DIR = process.env.VERCEL ? path.join('/tmp', 'planning') : path.join(__dirname, 'planning');
if (!fs.existsSync(PLANNING_DIR)) fs.mkdirSync(PLANNING_DIR);

function planningFile(restaurantId) {
  const safe = (restaurantId || 'global').replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(PLANNING_DIR, `planning_${safe}.json`);
}
function loadPlanning(restaurantId) {
  try {
    const f = planningFile(restaurantId);
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8')) || { schedule: {} };
  } catch(e) {}
  return { schedule: {} };
}
function savePlanning(restaurantId, data) {
  try { fs.writeFileSync(planningFile(restaurantId), JSON.stringify(data, null, 2)); }
  catch(e) { console.log('Erreur sauvegarde planning:', e.message); }
}

// Supprime les jours antérieurs à aujourd'hui dans un schedule { empId: { dateKey: [...] } }
function pruneScheduleHistory(schedule) {
  const today = todayStr();
  if (!schedule || typeof schedule !== 'object') return schedule || {};
  for (const empId in schedule) {
    const days = schedule[empId];
    if (!days || typeof days !== 'object') continue;
    for (const dk in days) {
      if (dk < today) delete days[dk];
    }
  }
  return schedule;
}

app.get('/planning/:restaurantId', (req, res) => {
  const data = loadPlanning(req.params.restaurantId);
  data.schedule = pruneScheduleHistory(data.schedule || {});
  res.json(data);
});
app.put('/planning/:restaurantId', (req, res) => {
  const data = req.body;
  if (!data.schedule) return res.status(400).json({ error: 'schedule requis' });
  const cleanedSchedule = pruneScheduleHistory(data.schedule);
  savePlanning(req.params.restaurantId, { schedule: cleanedSchedule, updatedAt: data.updatedAt, updatedBy: data.updatedBy });
  // Broadcast via socket.io
  io.to(`restaurant:${req.params.restaurantId}`).emit('planning-broadcast', {
    restaurantId: req.params.restaurantId,
    schedule: cleanedSchedule,
    updatedBy: data.updatedBy
  });
  res.json({ success: true });
});

// ─── RÉSERVATIONS (Notion) ───────────────────────────────────────────────────

function pruneReservationsHistory(list) {
  const today = todayStr();
  if (!Array.isArray(list)) return [];
  return list.filter(r => !r || !r.date || r.date >= today);
}

// Convertit une page Notion en objet réservation
function notionPageToResa(page) {
  const p = page.properties || {};
  const txt = (prop) => prop?.rich_text?.[0]?.plain_text || prop?.title?.[0]?.plain_text || '';
  return {
    id: txt(p['Reservation ID']) || page.id,
    notionPageId: page.id,
    nom: txt(p['Nom']),
    prenom: txt(p['Prénom']),
    restaurantId: txt(p['Restaurant ID']),
    date: txt(p['Date']),
    heure: txt(p['Heure']),
    covers: p['Couverts']?.number || 2,
    table: txt(p['Table']),
    email: p['Email']?.email || '',
    tel: p['Téléphone']?.phone_number || '',
    status: p['Statut']?.select?.name || 'pending',
    note: txt(p['Note']),
    createdAt: page.created_time
  };
}

// Charge toutes les réservations d'un restaurant depuis Notion
async function loadReservationsNotion(restaurantId) {
  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${DB_RESERVATIONS}/query`, {
      method: 'POST', headers: notionHeaders,
      body: JSON.stringify({ filter: { property: 'Restaurant ID', rich_text: { equals: restaurantId } }, page_size: 100 })
    });
    const data = await res.json();
    if (data.message) console.error('Notion error loadResas:', data.message, data.code);
    return (data.results || []).map(notionPageToResa);
  } catch(e) {
    console.error('Erreur chargement réservations Notion:', e.message);
    return [];
  }
}

// Crée ou met à jour une réservation dans Notion
async function upsertResaNotion(r) {
  const props = {
    'Nom': { title: [{ text: { content: r.nom || '' } }] },
    'Prénom': { rich_text: [{ text: { content: r.prenom || '' } }] },
    'Restaurant ID': { rich_text: [{ text: { content: r.restaurantId || '' } }] },
    'Date': { rich_text: [{ text: { content: r.date || '' } }] },
    'Heure': { rich_text: [{ text: { content: r.heure || '' } }] },
    'Couverts': { number: parseInt(r.covers) || 2 },
    'Table': { rich_text: [{ text: { content: r.table || '' } }] },
    'Email': { email: r.email || null },
    'Téléphone': { phone_number: r.tel || null },
    'Statut': { select: { name: r.status || 'pending' } },
    'Note': { rich_text: [{ text: { content: r.note || '' } }] },
    'Reservation ID': { rich_text: [{ text: { content: r.id || '' } }] }
  };
  if (r.notionPageId) {
    // Mise à jour
    await fetch(`https://api.notion.com/v1/pages/${r.notionPageId}`, {
      method: 'PATCH', headers: notionHeaders, body: JSON.stringify({ properties: props })
    });
  } else {
    // Création
    await fetch('https://api.notion.com/v1/pages', {
      method: 'POST', headers: notionHeaders,
      body: JSON.stringify({ parent: { database_id: DB_RESERVATIONS }, properties: props })
    });
  }
}

// Archive (supprime) une réservation Notion par son notionPageId
async function archiveResaNotion(notionPageId) {
  try {
    await fetch(`https://api.notion.com/v1/pages/${notionPageId}`, {
      method: 'PATCH', headers: notionHeaders, body: JSON.stringify({ archived: true })
    });
  } catch(e) {}
}

app.get('/reservations/:restaurantId', async (req, res) => {
  const list = await loadReservationsNotion(req.params.restaurantId);
  res.json(pruneReservationsHistory(list));
});

app.put('/reservations/:restaurantId', async (req, res) => {
  const list = Array.isArray(req.body) ? req.body : (req.body && Array.isArray(req.body.reservations) ? req.body.reservations : null);
  if (!list) return res.status(400).json({ error: 'liste de réservations requise' });

  const restaurantId = req.params.restaurantId;
  const existing = await loadReservationsNotion(restaurantId);
  const existingMap = new Map(existing.map(r => [r.id, r]));
  const incomingIds = new Set(list.map(r => r.id));

  // Nouvelles réservations (pour email de confirmation)
  const nouvelles = list.filter(r => r.id && !existingMap.has(r.id) && r.email);

  // Upsert toutes les réservations entrantes (en parallèle)
  await Promise.all(list.map(r => {
    const existingResa = existingMap.get(r.id);
    return upsertResaNotion({ ...r, restaurantId, notionPageId: existingResa?.notionPageId || null });
  }));

  // Archiver les réservations supprimées côté client (en parallèle)
  await Promise.all(
    existing.filter(r => !incomingIds.has(r.id) && r.notionPageId)
            .map(r => archiveResaNotion(r.notionPageId))
  );

  const cleaned = pruneReservationsHistory(list);
  io.to(`restaurant:${restaurantId}`).emit('reservations-broadcast', { restaurantId, reservations: cleaned });

  // Email de confirmation pour les nouvelles réservations
  const mailer = getMailer();
  const ADMIN_MAIL = process.env.GMAIL_USER || 'quentin.despres6869@gmail.com';
  if (mailer && nouvelles.length > 0) {
    for (const r of nouvelles) {
      const joursNoms = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
      const dateObj = new Date(r.date + 'T12:00:00');
      const dateStr = joursNoms[dateObj.getDay()] + ' ' + dateObj.toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });
      const htmlClient = `
        <div style="font-family:Inter,sans-serif;max-width:540px;margin:0 auto;padding:28px;border:1px solid #e0e8d8;border-radius:14px;background:#fff;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px;">
            <div style="background:#1a4a20;border-radius:8px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;">
              <span style="color:#7BBBB5;font-size:18px;">⌘</span>
            </div>
            <span style="font-size:17px;font-weight:700;color:#0F2A28;">Commande<span style="color:#7BBBB5;">IA</span></span>
          </div>
          <h2 style="color:#1a4a20;margin:0 0 8px;font-size:20px;">Votre réservation est confirmée ✅</h2>
          <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 20px;">
            Bonjour ${r.prenom ? r.prenom + ' ' + r.nom : r.nom}, nous avons bien enregistré votre réservation.
          </p>
          <div style="background:#f4faf0;border-left:4px solid #1a4a20;border-radius:0 8px 8px 0;padding:16px 18px;margin-bottom:20px;font-size:14px;color:#333;line-height:1.8;">
            <div>📅 <strong>Date :</strong> ${dateStr}</div>
            <div>🕐 <strong>Heure :</strong> ${r.heure}</div>
            <div>👥 <strong>Couverts :</strong> ${r.covers || 2}</div>
            ${r.table ? `<div>🪑 <strong>Table :</strong> ${r.table}</div>` : ''}
            ${r.note ? `<div>📝 <strong>Note :</strong> ${r.note}</div>` : ''}
          </div>
          <p style="font-size:13px;color:#888;margin:0;">Pour annuler ou modifier, contactez-nous directement.<br>À très bientôt !</p>
          <p style="margin-top:24px;font-size:11px;color:#ccc;border-top:1px solid #f0f0f0;padding-top:14px;">© ${new Date().getFullYear()} Commande-IA</p>
        </div>`;
      try {
        await mailer.sendMail({
          from: `"Commande-IA" <${ADMIN_MAIL}>`,
          to: r.email,
          subject: `Confirmation de réservation — ${dateStr} à ${r.heure}`,
          html: htmlClient
        });
        console.log(`✅ Email confirmation réservation envoyé à ${r.email}`);
      } catch(e) {
        console.error('❌ Erreur email réservation:', e.message);
      }
    }
  }

  res.json({ success: true, count: cleaned.length });
});

// ─── NETTOYAGE QUOTIDIEN AUTOMATIQUE (planning + réservations) ──────────────
// Supprime les jours passés sur le serveur, comme on archive les anciennes commandes.
function dailyHistoryCleanup() {
  try {
    // Planning
    if (fs.existsSync(PLANNING_DIR)) {
      fs.readdirSync(PLANNING_DIR).filter(f => f.endsWith('.json')).forEach(f => {
        const fp = path.join(PLANNING_DIR, f);
        try {
          const data = JSON.parse(fs.readFileSync(fp, 'utf8')) || { schedule: {} };
          data.schedule = pruneScheduleHistory(data.schedule || {});
          fs.writeFileSync(fp, JSON.stringify(data, null, 2));
        } catch(e) {}
      });
    }
    // Réservations
    if (fs.existsSync(RESERVATIONS_DIR)) {
      fs.readdirSync(RESERVATIONS_DIR).filter(f => f.endsWith('.json')).forEach(f => {
        const fp = path.join(RESERVATIONS_DIR, f);
        try {
          const list = JSON.parse(fs.readFileSync(fp, 'utf8'));
          if (Array.isArray(list)) {
            const cleaned = pruneReservationsHistory(list);
            fs.writeFileSync(fp, JSON.stringify(cleaned, null, 2));
          }
        } catch(e) {}
      });
    }
    console.log('[cleanup] Jours passés supprimés (planning + réservations).');
  } catch(e) { console.log('Erreur nettoyage quotidien:', e.message); }
}
// Au démarrage du serveur
dailyHistoryCleanup();
// Et toutes les 6h (pour gérer les redémarrages tardifs et le passage de minuit)
setInterval(dailyHistoryCleanup, 6 * 60 * 60 * 1000);

// ─── FEEDBACK (persistant par restaurant) ───────────────────────────────────
const FEEDBACK_DIR = process.env.VERCEL ? path.join('/tmp', 'feedback') : path.join(__dirname, 'feedback');
if (!fs.existsSync(FEEDBACK_DIR)) fs.mkdirSync(FEEDBACK_DIR);

function feedbackFile(restaurantId) {
  const safe = (restaurantId || 'global').replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(FEEDBACK_DIR, `feedback_${safe}.json`);
}
function loadFeedback(restaurantId) {
  try {
    const f = feedbackFile(restaurantId);
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8')) || { avis: [] };
  } catch(e) {}
  return { avis: [] };
}
function saveFeedback(restaurantId, data) {
  try { fs.writeFileSync(feedbackFile(restaurantId), JSON.stringify(data, null, 2)); }
  catch(e) { console.log('Erreur sauvegarde feedback:', e.message); }
}

app.get('/feedback/:restaurantId', (req, res) => {
  res.json(loadFeedback(req.params.restaurantId));
});
app.put('/feedback/:restaurantId', (req, res) => {
  const data = req.body;
  if (!Array.isArray(data.avis)) return res.status(400).json({ error: 'avis requis' });
  saveFeedback(req.params.restaurantId, { avis: data.avis, updatedAt: data.updatedAt, updatedBy: data.updatedBy });
  io.to(`restaurant:${req.params.restaurantId}`).emit('feedback-broadcast', {
    restaurantId: req.params.restaurantId,
    avis: data.avis,
    updatedBy: data.updatedBy
  });
  // Notifier admin des demandes de suppression
  const pending = data.avis.filter(a => a.pendingDeletion);
  if (pending.length > 0) {
    io.emit('feedback-delete-request', { restaurantId: req.params.restaurantId, count: pending.length });
  }
  res.json({ success: true });
});

// ─── SÉCURITÉ (persistant par utilisateur) ──────────────────────────────────
const SECURITY_DIR = process.env.VERCEL ? path.join('/tmp', 'security') : path.join(__dirname, 'security');
if (!fs.existsSync(SECURITY_DIR)) fs.mkdirSync(SECURITY_DIR);

function secFile(userId) {
  const safe = (userId || 'unknown').replace(/[^a-zA-Z0-9_@.-]/g, '_');
  return path.join(SECURITY_DIR, `sec_${safe}.json`);
}
function loadSec(userId) {
  try {
    const f = secFile(userId);
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8')) || {};
  } catch(e) {}
  return {};
}
function saveSec(userId, data) {
  try { fs.writeFileSync(secFile(userId), JSON.stringify(data, null, 2)); }
  catch(e) { console.log('Erreur sauvegarde securite:', e.message); }
}

// TOTP base32 decode + HMAC-SHA1
function totpCode(secret, counter) {
  const b32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0;
  const key = [];
  for (const c of secret.toUpperCase().replace(/=+$/,'')) {
    const idx = b32.indexOf(c);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { key.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  const keyBuf = Buffer.from(key);
  const cntBuf = Buffer.alloc(8);
  cntBuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  cntBuf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac('sha1', keyBuf);
  hmac.update(cntBuf);
  const dig = hmac.digest();
  const off = dig[19] & 0xf;
  const code = ((dig[off] & 0x7f) << 24 | (dig[off+1] & 0xff) << 16 | (dig[off+2] & 0xff) << 8 | (dig[off+3] & 0xff)) % 1000000;
  return code.toString().padStart(6, '0');
}

// Isolation : un utilisateur n'accède qu'à SES propres données de sécurité (2FA, hash).
// L'Admin conserve l'accès complet. Empêche la lecture du secret TOTP d'un autre compte (IDOR).
app.use('/security/:userId', (req, res, next) => {
  const target = decodeURIComponent(req.params.userId || '');
  if (req.session && (req.session.role === 'Admin' || target === req.session.email || target === req.session.userId)) {
    return next();
  }
  return res.status(403).json({ error: 'Accès refusé à ces données de sécurité' });
});

app.get('/security/:userId', (req, res) => {
  res.json(loadSec(req.params.userId));
});
app.put('/security/:userId', (req, res) => {
  const existing = loadSec(req.params.userId);
  const updated = { ...existing, ...req.body, updatedAt: new Date().toISOString() };
  saveSec(req.params.userId, updated);
  res.json({ success: true });
});
app.post('/security/:userId/verify-totp', (req, res) => {
  const { secret, code } = req.body;
  if (!secret || !code) return res.json({ valid: false, error: 'secret et code requis' });
  // Anti brute-force : 10 essais / 5 min par IP+utilisateur
  const rlKey = 'totp:' + (req.ip || 'x') + ':' + req.params.userId;
  if (!rateLimit(rlKey, 10, 5 * 60 * 1000)) return res.status(429).json({ valid: false, error: 'Trop de tentatives' });
  const counter = Math.floor(Date.now() / 30000);
  for (let delta = -1; delta <= 1; delta++) {
    if (totpCode(secret, counter + delta) === code) {
      return res.json({ valid: true });
    }
  }
  res.json({ valid: false });
});
app.post('/security/:userId/change-password', (req, res) => {
  // In a real app this would hash & compare against a DB.
  // Here we just persist the hashed flag so the page can acknowledge it.
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Champs requis' });
  // minimal strength check (12+ chars)
  if (newPassword.length < 12) return res.status(400).json({ error: 'Mot de passe trop court (12 min)' });
  const existing = loadSec(req.params.userId);
  const hash = crypto.createHash('sha256').update(newPassword).digest('hex');
  saveSec(req.params.userId, { ...existing, pwHash: hash, pwChangedAt: new Date().toISOString() });
  res.json({ success: true });
});

// ─── PLAN DE SALLE (persistant par restaurant) ──────────────────────────────
const DB_FLOORPLANS = 'd9ff5f7eb752409e9eec1604e4ac91f2';

// Charge le plan de salle depuis Notion
async function loadFloorPlanNotion(restaurantId) {
  try {
    const r = await fetch(`https://api.notion.com/v1/databases/${DB_FLOORPLANS}/query`, {
      method: 'POST', headers: notionHeaders,
      body: JSON.stringify({ filter: { property: 'Restaurant ID', title: { equals: restaurantId } }, page_size: 1 })
    });
    const data = await r.json();
    if (!data.results?.length) return { rooms: [], roomPaths: {} };
    const raw = data.results[0].properties['Data']?.rich_text?.[0]?.plain_text || '{}';
    return JSON.parse(raw);
  } catch(e) { return { rooms: [], roomPaths: {} }; }
}

// Sauvegarde le plan de salle dans Notion (upsert)
async function saveFloorPlanNotion(restaurantId, planData) {
  const json = JSON.stringify(planData);
  // Notion rich_text max 2000 chars — on tronque si besoin (plans simples < 2000)
  const chunks = [];
  for (let i = 0; i < json.length; i += 1990) chunks.push({ text: { content: json.slice(i, i + 1990) } });

  // Chercher page existante
  const r = await fetch(`https://api.notion.com/v1/databases/${DB_FLOORPLANS}/query`, {
    method: 'POST', headers: notionHeaders,
    body: JSON.stringify({ filter: { property: 'Restaurant ID', title: { equals: restaurantId } }, page_size: 1 })
  });
  const data = await r.json();
  const props = {
    'Restaurant ID': { title: [{ text: { content: restaurantId } }] },
    'Data': { rich_text: chunks }
  };
  if (data.results?.length) {
    await fetch(`https://api.notion.com/v1/pages/${data.results[0].id}`, {
      method: 'PATCH', headers: notionHeaders, body: JSON.stringify({ properties: props })
    });
  } else {
    await fetch('https://api.notion.com/v1/pages', {
      method: 'POST', headers: notionHeaders,
      body: JSON.stringify({ parent: { database_id: DB_FLOORPLANS }, properties: props })
    });
  }
}

app.get('/floor-plan/:restaurantId', async (req, res) => {
  try {
    res.json(await loadFloorPlanNotion(req.params.restaurantId));
  } catch (e) { res.status(500).json({ error: 'Erreur chargement plan : ' + e.message }); }
});
app.put('/floor-plan/:restaurantId', async (req, res) => {
  try {
    const data = req.body || {};
    await saveFloorPlanNotion(req.params.restaurantId, data);
    io.to(`restaurant:${req.params.restaurantId}`).emit('floor-plan-broadcast', {
      restaurantId: req.params.restaurantId,
      rooms: data.rooms,
      roomPaths: data.roomPaths,
      senderId: 'server',
      userName: data.updatedBy || 'serveur'
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur sauvegarde plan : ' + e.message }); }
});

// ─── MULTILANGUES (persistant par restaurant) ───────────────────────────────
const MULTILANG_DIR = process.env.VERCEL ? path.join('/tmp', 'multilangues') : path.join(__dirname, 'multilangues');
if (!fs.existsSync(MULTILANG_DIR)) fs.mkdirSync(MULTILANG_DIR);
function multilangFile(restaurantId) {
  const safe = (restaurantId || 'global').replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(MULTILANG_DIR, `multilangues_${safe}.json`);
}
app.get('/multilangues/:restaurantId', (req, res) => {
  try {
    const f = multilangFile(req.params.restaurantId);
    if (fs.existsSync(f)) return res.json(JSON.parse(fs.readFileSync(f, 'utf8')));
    res.json({ languages: [], translations: {} });
  } catch (e) { res.status(500).json({ error: 'Erreur chargement langues : ' + e.message }); }
});
app.put('/multilangues/:restaurantId', (req, res) => {
  try {
    fs.writeFileSync(multilangFile(req.params.restaurantId), JSON.stringify(req.body || {}, null, 2));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur sauvegarde langues : ' + e.message }); }
});

// ─── API KEYS (clés développeur) ────────────────────────────────────────────
const API_KEYS_FILE = path.join(__dirname, 'api-keys.json');
function loadApiKeys() {
  try { if (fs.existsSync(API_KEYS_FILE)) return JSON.parse(fs.readFileSync(API_KEYS_FILE, 'utf8')) || []; }
  catch (e) {}
  return [];
}
function saveApiKeys(keys) {
  try { fs.writeFileSync(API_KEYS_FILE, JSON.stringify(keys, null, 2)); }
  catch (e) { console.log('Erreur sauvegarde api-keys :', e.message); }
}
app.get('/admin/api-keys', (req, res) => {
  // Ne renvoie pas le secret complet : masque à partir du 6e caractère
  const list = loadApiKeys().map(k => ({ ...k, key: k.key ? k.key.slice(0, 6) + '••••••' + k.key.slice(-4) : '' }));
  res.json(list);
});
app.post('/admin/api-keys', (req, res) => {
  const keys = loadApiKeys();
  const id = 'key_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const key = 'ck_live_' + crypto.randomBytes(20).toString('hex');
  const entry = {
    id, key,
    name: req.body && req.body.name ? String(req.body.name).slice(0, 80) : 'Clé sans nom',
    status: 'active',
    createdAt: new Date().toISOString(),
    createdBy: (req.body && req.body.createdBy) || 'admin'
  };
  keys.unshift(entry);
  saveApiKeys(keys);
  // Renvoyer la clé COMPLÈTE une seule fois (à la création)
  res.json({ success: true, ...entry });
});
app.put('/admin/api-keys/:id', (req, res) => {
  const keys = loadApiKeys();
  const k = keys.find(k => k.id === req.params.id);
  if (!k) return res.status(404).json({ error: 'Clé introuvable' });
  if (req.body && req.body.status) k.status = req.body.status;
  if (req.body && req.body.name)   k.name   = String(req.body.name).slice(0, 80);
  saveApiKeys(keys);
  res.json({ success: true });
});
app.delete('/admin/api-keys/:id', (req, res) => {
  let keys = loadApiKeys();
  const before = keys.length;
  keys = keys.filter(k => k.id !== req.params.id);
  if (keys.length === before) return res.status(404).json({ error: 'Clé introuvable' });
  saveApiKeys(keys);
  res.json({ success: true });
});

// ─── DEMANDES DE SUPPRESSION D'AVIS (RGPD) ──────────────────────────────────
const FB_DELETE_FILE = path.join(__dirname, 'feedback-delete-requests.json');
function loadFbDeleteRequests() {
  try { if (fs.existsSync(FB_DELETE_FILE)) return JSON.parse(fs.readFileSync(FB_DELETE_FILE, 'utf8')) || []; }
  catch (e) {}
  return [];
}
function saveFbDeleteRequests(list) {
  try { fs.writeFileSync(FB_DELETE_FILE, JSON.stringify(list, null, 2)); }
  catch (e) { console.log('Erreur sauvegarde feedback-delete-requests :', e.message); }
}
app.get('/admin/feedback-delete-requests', (req, res) => res.json(loadFbDeleteRequests()));
app.post('/admin/feedback-delete-requests', (req, res) => {
  const list = loadFbDeleteRequests();
  const id = 'fdr_' + Date.now().toString(36);
  list.unshift({
    id,
    feedbackId: req.body && req.body.feedbackId,
    restaurantId: req.body && req.body.restaurantId,
    raison: (req.body && req.body.raison) || '',
    status: 'pending',
    createdAt: new Date().toISOString()
  });
  saveFbDeleteRequests(list);
  res.json({ success: true, id });
});
app.patch('/admin/feedback-delete-requests/:id', (req, res) => {
  const list = loadFbDeleteRequests();
  const item = list.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Demande introuvable' });
  if (req.body && req.body.status) item.status = req.body.status;
  if (req.body && req.body.note)   item.note   = String(req.body.note).slice(0, 500);
  item.updatedAt = new Date().toISOString();
  saveFbDeleteRequests(list);
  res.json({ success: true });
});
app.delete('/admin/feedback-delete-requests/:id', (req, res) => {
  let list = loadFbDeleteRequests();
  const before = list.length;
  list = list.filter(i => i.id !== req.params.id);
  if (list.length === before) return res.status(404).json({ error: 'Demande introuvable' });
  saveFbDeleteRequests(list);
  res.json({ success: true });
});

// ── SOCKET.IO : Plan de salle sync miroir ──────────────────────────────────
io.on('connection', (socket) => {
  // Rejoindre la salle du restaurant
  // Accepte { restaurantId: 'xxx' } OU directement 'xxx' (envoyé par kds.html / tv-display.html)
  socket.on('join-restaurant', (payload) => {
    const restaurantId = typeof payload === 'string' ? payload : payload?.restaurantId;
    if (restaurantId) socket.join(`restaurant:${restaurantId}`);
  });
  // Diffuser le plan à tous les autres clients du même restaurant
  socket.on('floor-plan-update', (data) => {
    if (!data || !data.restaurantId) return;
    // On broadcast à TOUS sauf l'émetteur
    socket.to(`restaurant:${data.restaurantId}`).emit('floor-plan-broadcast', data);
  });
});

// ── PAGES CACHÉES — stockées dans Notion (page config) ou fichier local ─────
// Sur Vercel : utilise une page Notion dont l'ID est dans NOTION_CONFIG_PAGE_ID
// En local : utilise le fichier permissions-matrix.json

const NOTION_CONFIG_PAGE_ID = process.env.NOTION_CONFIG_PAGE_ID;

async function loadHiddenPages() {
  // Sur Vercel avec page config Notion
  if (process.env.VERCEL && NOTION_CONFIG_PAGE_ID) {
    try {
      const r = await fetch(`https://api.notion.com/v1/blocks/${NOTION_CONFIG_PAGE_ID}/children`, {
        headers: notionHeaders
      });
      const data = await r.json();
      const blocks = data.results || [];
      for (const block of blocks) {
        const text = block.paragraph?.rich_text?.[0]?.plain_text || block.code?.rich_text?.[0]?.plain_text || '';
        if (text.startsWith('HIDDEN_PAGES:')) {
          return JSON.parse(text.replace('HIDDEN_PAGES:', '').trim());
        }
      }
    } catch(e) { console.error('loadHiddenPages Notion error:', e.message); }
    return [];
  }
  // En local : fichier
  try {
    if (fs.existsSync(PERMISSIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PERMISSIONS_FILE, 'utf8'));
      return Array.isArray(data._hiddenPages) ? data._hiddenPages : [];
    }
  } catch(e) {}
  return [];
}

async function saveHiddenPages(list) {
  // Sur Vercel avec page config Notion
  if (process.env.VERCEL && NOTION_CONFIG_PAGE_ID) {
    try {
      // Lire les blocs existants pour trouver le bloc HIDDEN_PAGES
      const r = await fetch(`https://api.notion.com/v1/blocks/${NOTION_CONFIG_PAGE_ID}/children`, {
        headers: notionHeaders
      });
      const data = await r.json();
      const blocks = data.results || [];
      const existingBlock = blocks.find(b => {
        const text = b.paragraph?.rich_text?.[0]?.plain_text || b.code?.rich_text?.[0]?.plain_text || '';
        return text.startsWith('HIDDEN_PAGES:');
      });
      const newText = `HIDDEN_PAGES:${JSON.stringify(list)}`;
      if (existingBlock) {
        // Mettre à jour le bloc existant
        const pr = await fetch(`https://api.notion.com/v1/blocks/${existingBlock.id}`, {
          method: 'PATCH', headers: notionHeaders,
          body: JSON.stringify({ paragraph: { rich_text: [{ type: 'text', text: { content: newText } }] } })
        });
        if (!pr.ok) { const e = await pr.json(); throw new Error('Notion PATCH bloc: ' + JSON.stringify(e)); }
      } else {
        // Créer un nouveau bloc
        const pr = await fetch(`https://api.notion.com/v1/blocks/${NOTION_CONFIG_PAGE_ID}/children`, {
          method: 'PATCH', headers: notionHeaders,
          body: JSON.stringify({ children: [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: newText } }] } }] })
        });
        if (!pr.ok) { const e = await pr.json(); throw new Error('Notion append bloc: ' + JSON.stringify(e)); }
      }
      return;
    } catch(e) { console.error('saveHiddenPages Notion error:', e.message); throw e; }
  }
  // En local : fichier
  let data = {};
  try {
    if (fs.existsSync(PERMISSIONS_FILE)) data = JSON.parse(fs.readFileSync(PERMISSIONS_FILE, 'utf8'));
  } catch(e) {}
  data._hiddenPages = list;
  fs.writeFileSync(PERMISSIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ─── UPLOAD PHOTO PLAT ───────────────────────────────────────────────────────
const UPLOADS_PLATS_DIR = process.env.VERCEL ? path.join('/tmp', 'uploads', 'plats') : path.join(__dirname, 'public', 'uploads', 'plats');
if (!fs.existsSync(UPLOADS_PLATS_DIR)) fs.mkdirSync(UPLOADS_PLATS_DIR, { recursive: true });

app.post('/upload/plat-photo',
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], limit: '8mb' }),
  (req, res) => {
    const sess = getSession(req);
    if (!sess) return res.status(401).json({ error: 'Non authentifié' });
    if (!req.body || !req.body.length) return res.status(400).json({ error: 'Aucune image reçue' });
    const ct = req.headers['content-type'] || '';
    const ext = ct.includes('png') ? '.png' : ct.includes('webp') ? '.webp' : ct.includes('gif') ? '.gif' : '.jpg';
    const filename = `plat-${Date.now()}-${Math.random().toString(36).slice(2,8)}${ext}`;
    try {
      fs.writeFileSync(path.join(UPLOADS_PLATS_DIR, filename), req.body);
      res.json({ success: true, url: `/uploads/plats/${filename}` });
    } catch (e) {
      res.status(500).json({ error: 'Erreur sauvegarde image : ' + e.message });
    }
  }
);

// Public — tous les clients ont besoin de savoir quelles pages masquer
app.get('/config/hidden-pages', async (req, res) => {
  const hiddenPages = await loadHiddenPages();
  res.json({ hiddenPages });
});

// Admin seulement — mise à jour des pages cachées (stocké dans Notion ou fichier)
app.put('/admin/hidden-pages', requireSession, async (req, res) => {
  if (req.session.role !== 'Admin') return res.status(403).json({ error: 'Admin requis' });
  const { hiddenPages } = req.body;
  if (!Array.isArray(hiddenPages)) return res.status(400).json({ error: 'Liste requise' });
  try {
    await saveHiddenPages(hiddenPages);
    io.emit('hidden-pages-updated', { hiddenPages, ts: Date.now() });
    res.json({ success: true });
  } catch (e) {
    console.error('Erreur écriture pages cachées :', e.message);
    res.status(500).json({ error: 'Impossible de sauvegarder : ' + e.message });
  }
});

// ─── RAPPORTS PDF ────────────────────────────────────────────────
// Sauvegarde un rapport PDF (base64) dans Notion
app.post('/admin/reports', requireAdmin, express.json({ limit: '10mb' }), async (req, res) => {
  const { restaurant, periode, nom, pdfBase64, taille } = req.body;
  if (!pdfBase64) return res.status(400).json({ error: 'PDF manquant' });
  try {
    // Créer la page dans la DB Rapports
    const page = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST', headers: notionHeaders,
      body: JSON.stringify({
        parent: { database_id: DB_REPORTS },
        properties: {
          'Nom': { title: [{ text: { content: nom || `Rapport ${restaurant}` } }] },
          'Restaurant': { rich_text: [{ text: { content: restaurant || '' } }] },
          'Période': { rich_text: [{ text: { content: periode || '' } }] },
          'Date': { rich_text: [{ text: { content: new Date().toLocaleDateString('fr-FR') } }] },
          'Taille': { rich_text: [{ text: { content: taille || '' } }] }
        }
      })
    }).then(r => r.json());
    if (page.object === 'error') return res.status(500).json({ error: page.message });
    // Stocker le PDF base64 — un seul bloc avec tout le contenu splitté en rich_text objects
    // Chaque rich_text object = 1900 chars max, on les groupe en batches de 95 (limite Notion)
    const CHUNK = 1900;
    const chunks = [];
    for (let i = 0; i < pdfBase64.length; i += CHUNK) chunks.push(pdfBase64.slice(i, i + CHUNK));
    const BATCH = 95;
    const batches = [];
    for (let i = 0; i < chunks.length; i += BATCH) batches.push(chunks.slice(i, i + BATCH));
    // Envoyer tous les batches en parallèle
    await Promise.all(batches.map(batch =>
      fetch(`https://api.notion.com/v1/blocks/${page.id}/children`, {
        method: 'PATCH', headers: notionHeaders,
        body: JSON.stringify({ children: batch.map(c => ({
          object: 'block', type: 'paragraph',
          paragraph: { rich_text: [{ type: 'text', text: { content: c } }] }
        }))})
      })
    ));
    res.json({ success: true, id: page.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Liste les rapports
app.get('/admin/reports', requireAdmin, async (req, res) => {
  try {
    const r = await fetch(`https://api.notion.com/v1/databases/${DB_REPORTS}/query`, {
      method: 'POST', headers: notionHeaders,
      body: JSON.stringify({ sorts: [{ timestamp: 'created_time', direction: 'descending' }] })
    });
    const data = await r.json();
    const reports = (data.results || []).map(p => ({
      id: p.id,
      nom: p.properties['Nom']?.title?.[0]?.plain_text || '',
      restaurant: p.properties['Restaurant']?.rich_text?.[0]?.plain_text || '',
      periode: p.properties['Période']?.rich_text?.[0]?.plain_text || '',
      date: p.properties['Date']?.rich_text?.[0]?.plain_text || '',
      taille: p.properties['Taille']?.rich_text?.[0]?.plain_text || '',
      createdAt: p.created_time
    }));
    res.json({ reports });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Télécharger un rapport (reconstituer le base64)
app.get('/admin/reports/:id/download', requireAdmin, async (req, res) => {
  try {
    const pageId = req.params.id;
    let base64 = '';
    let cursor;
    do {
      const url = `https://api.notion.com/v1/blocks/${pageId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`;
      const r = await fetch(url, { headers: notionHeaders });
      const data = await r.json();
      for (const b of data.results || []) {
        base64 += b.paragraph?.rich_text?.[0]?.plain_text || '';
      }
      cursor = data.has_more ? data.next_cursor : null;
    } while (cursor);
    const buf = Buffer.from(base64, 'base64');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="rapport-${pageId.slice(0,8)}.pdf"`);
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Supprimer un rapport
app.delete('/admin/reports/:id', requireAdmin, async (req, res) => {
  try {
    await fetch(`https://api.notion.com/v1/pages/${req.params.id}`, {
      method: 'PATCH', headers: notionHeaders,
      body: JSON.stringify({ archived: true })
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── MESSAGES AUTOMATIQUES — Config & Test ──────────────────────

// GET config
app.get('/admin/auto-messages/config', requireSession, (req, res) => {
  if (req.session.role !== 'Admin') return res.status(403).end();
  res.json({ config: autoMessages.loadConfig(), templates: autoMessages.TEMPLATES });
});

// PUT config
app.put('/admin/auto-messages/config', requireSession, (req, res) => {
  if (req.session.role !== 'Admin') return res.status(403).end();
  try {
    const cfg = req.body;
    if (!cfg || typeof cfg !== 'object') return res.status(400).json({ error: 'Config invalide' });
    autoMessages.saveConfig(cfg);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST envoyer un message manuel de test à un restaurant
app.post('/admin/auto-messages/send-test', requireSession, (req, res) => {
  if (req.session.role !== 'Admin') return res.status(403).end();
  const { restaurantId, category, customMessage } = req.body;
  if (!restaurantId) return res.status(400).json({ error: 'restaurantId requis' });
  const deps = { io, loadMessages, saveMessages };
  let msg;
  if (customMessage) {
    msg = autoMessages.send(restaurantId, customMessage, 'auto_test', deps);
  } else if (category) {
    msg = autoMessages.sendManual(restaurantId, category, deps);
  } else {
    return res.status(400).json({ error: 'category ou customMessage requis' });
  }
  res.json({ success: true, msg });
});

// ─── NOTIFICATIONS EMAIL ─────────────────────────────────────────
// Déjà configuré via GMAIL_USER + GMAIL_APP_PASSWORD dans le .env
async function sendAdminEmailNotif(restaurantNom, messageContent) {
  try {
    const nodemailer = require('nodemailer');
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return;
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
    });
    await transporter.sendMail({
      from: `"Commande IA" <${process.env.GMAIL_USER}>`,
      to: process.env.GMAIL_USER,
      subject: `💬 Nouveau message de ${restaurantNom || 'un restaurant'}`,
      html: `
        <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f8faf9;border-radius:12px">
          <h2 style="color:#0E4B47;margin:0 0 16px">Nouveau message reçu</h2>
          <div style="background:#fff;border-radius:10px;padding:16px 20px;border-left:4px solid #0E4B47;margin-bottom:16px">
            <strong style="color:#0E4B47">${restaurantNom || 'Restaurant'}</strong>
            <p style="color:#333;margin:8px 0 0;line-height:1.6">${messageContent}</p>
          </div>
          <a href="http://localhost:${process.env.PORT || 3000}/messagerie.html" style="display:inline-block;background:#0E4B47;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">
            Répondre dans Commande IA →
          </a>
        </div>`
    });
  } catch(e) {
    console.error('[Email] Erreur notification:', e.message);
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);

  // ── Démarrage du scheduler de messages automatiques ──
  async function getRestaurantsForScheduler() {
    const r = await fetch(`https://api.notion.com/v1/databases/${process.env.DB_RESTAURANTS}/query`, {
      method: 'POST', headers: notionHeaders, body: JSON.stringify({})
    });
    const data = await r.json();
    return (data.results || []).map(p => ({
      id: p.id,
      nom: p.properties['Nom du restaurant']?.title?.[0]?.plain_text || 'Restaurant'
    }));
  }

  async function getStockRecsForScheduler(restaurantId) {
    const r = await fetch(`http://localhost:${PORT}/restock-recommendations/${restaurantId}?days=14`, {
      headers: { 'x-internal': '1' }
    });
    const data = await r.json();
    return data.recommendations || [];
  }

  async function getOrderStatsForScheduler(restaurantId) {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const allArchives = getMemoryArchives(restaurantId);
    const todayOrders = allArchives.filter(c => c.state === 'done' && (c.archivedDate || '') === today);
    const yesterdayOrders = allArchives.filter(c => c.state === 'done' && (c.archivedDate || '') === yesterday);

    // Top produit du jour
    const productCount = {};
    todayOrders.forEach(cmd => {
      (cmd.panierRaw || []).forEach(item => {
        const k = item.nom || 'Inconnu';
        productCount[k] = (productCount[k] || 0) + (item.quantite || 1);
      });
    });
    const topEntry = Object.entries(productCount).sort((a,b) => b[1] - a[1])[0];

    // Commandes hier à 14h (approximation : toutes les commandes d'hier jusqu'à 14h)
    const yesterdayAt14 = yesterdayOrders.filter(c => {
      const h = new Date(c.archivedAt || c.date || '').getHours();
      return h < 14;
    }).length;

    return {
      todayCount: todayOrders.length,
      yesterdayCount: yesterdayOrders.length,
      yesterdayCountAt14: yesterdayAt14,
      topProduct: topEntry ? { name: topEntry[0], count: topEntry[1] } : null
    };
  }

  autoMessages.startScheduler({
    io,
    loadMessages,
    saveMessages,
    getRestaurants: getRestaurantsForScheduler,
    getStockRecs: getStockRecsForScheduler,
    getOrderStats: getOrderStatsForScheduler
  });
});
