// ═══════════════════════════════════════════════════════════════
//  auto-messages.js — Système de messages automatiques quotidiens
//  Commande-IA · Quentin Desprès
// ═══════════════════════════════════════════════════════════════

'use strict';
const fs   = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'auto-messages-config.json');
const LOG_FILE    = path.join(__dirname, 'auto-messages-log.json');

// ────────────────────────────────────────────────────────────────
//  TEMPLATES — tous les messages disponibles
// ────────────────────────────────────────────────────────────────
const TEMPLATES = {

  checkin_fermeture: {
    label: 'Check-in avant fermeture',
    description: 'Envoyé X minutes avant la fermeture du restaurant',
    icon: '🌙',
    dynamic: false,
    messages: [
      "La fermeture approche dans 20 minutes ! Comment s'est passée la journée ? Si quelque chose n'a pas été, écris directement à l'admin 💬",
      "Fin de service bientôt. Tout s'est bien passé ? N'oublie pas de noter les ruptures de stock avant de partir !",
      "Plus que 20 minutes ! T'as bien géré aujourd'hui ? Dis le à ton admin si t'as besoin de quoi que ce soit 😊",
      "Fermeture imminente. Pense à vérifier la caisse et à mettre les stocks à jour avant de partir.",
      "La journée se termine bientôt. Beau boulot ! Si tu as des remarques ou problèmes, ton admin est là pour t'écouter.",
      "On approche de la fin ! Comment tu as trouvé cette journée ? N'hésite pas à écrire si y'a quoi que ce soit.",
      "Service du soir qui se termine. Tout est en ordre ? Pense à la mise en place pour demain matin !",
      "Presque fini pour aujourd'hui — tu as assuré 💪 L'admin est dispo si t'as besoin d'un debriefing rapide."
    ]
  },

  random_journee: {
    label: 'Messages aléatoires en journée',
    description: 'Envoyé à une heure aléatoire pendant le service',
    icon: '💬',
    dynamic: false,
    messages: [
      "Bonjour ! Prêt·e pour la journée ? Si tu as besoin de quoi que ce soit, n'hésite pas à écrire à l'admin. 👋",
      "Comment ça se passe aujourd'hui ? Tout roule ? Si non, fais signe — on est là !",
      "Petite pensée à mi-parcours — tu gères 💪 Si quelque chose cloche, ton admin est disponible.",
      "Rappel : si tu as un problème, peu importe lequel, ton admin est toujours disponible sur la messagerie !",
      "Ça fait un moment qu'on a pas eu de tes nouvelles. Tout va bien de ton côté ?",
      "Journée chargée ? N'oublie pas de souffler un peu entre deux services 😄",
      "Les bons jours comme les mauvais, ton admin est là. Tu as besoin de quelque chose ?",
      "Pense à vérifier tes DLC aujourd'hui — un petit contrôle ça évite les mauvaises surprises !",
      "Tu es en plein service ? Courage ! On est avec toi 💪",
      "As-tu eu le temps de regarder tes stocks ce matin ? Si y'a des alertes, c'est le bon moment !",
      "Rappel du jour : bien noter les commandes manquées ou spéciales — ça aide pour l'analyse de la semaine !",
      "Comment se passe l'ambiance aujourd'hui ? Une bonne équipe ça change tout !",
      "On approche du rush — tout est prêt ?",
      "Si t'as des idées pour améliorer le service, note-les et envoie-les à l'admin !",
      "Petite question : ton matériel fonctionne bien aujourd'hui ? Imprimante, tablette, écran cuisine...?",
      "Rappel amical : boire de l'eau c'est important, même en plein rush 💧",
      "Les retours clients du jour, t'en as eu des bons ? Partage-les à l'admin !",
      "Un service sans accroc c'est toujours une victoire. T'as de quoi être fier·e !",
      "Pense à préparer la mise en place pour le prochain service si c'est possible — ça soulage vraiment !",
      "Une question ou un doute ? Ton admin est disponible — n'hésite jamais à écrire.",
      "Petit check du jour : est-ce que ton espace de travail est bien organisé ? Un bon espace = un bon service !",
      "Tu gères un service chargé ? Bravo ! On le voit dans les chiffres 📊",
      "Si tu remarques quelque chose d'inhabituel aujourd'hui (panne, retard fournisseur…), signale-le à l'admin !",
      "Rappel : la communication avec l'admin c'est important — même les petites choses comptent !",
      "On pense à toi depuis l'admin — continue comme ça, le boulot est bien fait 👏"
    ]
  },

  rappel_admin: {
    label: 'Rappels administratifs',
    description: 'Rappels pratiques hebdomadaires (le lundi)',
    icon: '📋',
    dynamic: false,
    messages: [
      "Bonne semaine ! As-tu bien imprimé ton planning de la semaine ? C'est important pour l'organisation de l'équipe !",
      "Rappel du lundi : n'oublie pas de mettre à jour les prix dans ton menu si tu as eu des changements récents.",
      "Début de semaine — as-tu vérifié les allergènes sur tes plats ? La mise à jour c'est obligatoire légalement !",
      "Rappel hebdomadaire : pense à archiver et envoyer les commandes de la semaine passée à l'admin.",
      "C'est lundi ! As-tu imprimé et vérifié les fiches techniques de tes nouveaux plats de la semaine ?",
      "Rappel : le rapport hebdomadaire doit être envoyé à l'admin avant vendredi.",
      "N'oublie pas : les factures fournisseurs sont à conserver et à envoyer à l'admin chaque semaine.",
      "Check du lundi : as-tu bien vérifié la conformité hygiène de ta cuisine ce matin ?",
      "Rappel : si tu as du personnel nouveau cette semaine, envoie les infos à l'admin pour la mise à jour."
    ]
  },

  felicitation_ventes: {
    label: 'Félicitations ventes',
    description: 'Envoyé quand le restaurant atteint un seuil de commandes',
    icon: '🎉',
    dynamic: true,
    // Les messages sont générés dynamiquement avec les données réelles
  },

  alerte_stock: {
    label: 'Alertes stock',
    description: 'Envoyé quand un produit passe en stock critique',
    icon: '⚠️',
    dynamic: true,
  },

  comparaison_hier: {
    label: 'Comparaison avec hier',
    description: 'Envoyé à 14h — compare les ventes avec la même heure hier',
    icon: '📊',
    dynamic: true,
  }
};

// ────────────────────────────────────────────────────────────────
//  CONFIG
// ────────────────────────────────────────────────────────────────
function defaultConfig() {
  return {
    global: { enabled: true },
    categories: {
      checkin_fermeture:   { enabled: true,  minutesBeforeClose: 20 },
      random_journee:      { enabled: true,  minHour: 10, maxHour: 16 },
      rappel_admin:        { enabled: true },
      felicitation_ventes: { enabled: true,  minCommandes: 8 },
      alerte_stock:        { enabled: true },
      comparaison_hier:    { enabled: true }
    },
    restaurants: {}
    // { [restaurantId]: { openHour: 11, closeHour: 22, enabled: true } }
  };
}

function loadConfig() {
  try {
    // Créer le fichier config par défaut s'il n'existe pas encore
    if (!fs.existsSync(CONFIG_FILE)) {
      const def = defaultConfig();
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(def, null, 2));
      console.log('[AutoMsg] Config créée avec les valeurs par défaut.');
      return def;
    }
    if (fs.existsSync(CONFIG_FILE)) {
      const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      const def = defaultConfig();
      // Merge profond pour ne pas perdre les nouvelles catégories
      return {
        ...def,
        ...saved,
        categories: { ...def.categories, ...saved.categories },
        restaurants: { ...def.restaurants, ...(saved.restaurants || {}) }
      };
    }
  } catch(e) { console.error('[AutoMsg] Erreur lecture config:', e.message); }
  return defaultConfig();
}

function saveConfig(cfg) {
  try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2)); }
  catch(e) { console.error('[AutoMsg] Erreur sauvegarde config:', e.message); }
}

// ────────────────────────────────────────────────────────────────
//  LOG QUOTIDIEN — évite les doublons
// ────────────────────────────────────────────────────────────────
function loadLog() {
  try {
    if (fs.existsSync(LOG_FILE)) return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
  } catch(e) {}
  return {};
}

function saveLog(log) {
  try { fs.writeFileSync(LOG_FILE, JSON.stringify(log)); }
  catch(e) {}
}

function todayKey() { return new Date().toISOString().slice(0, 10); }

function hasSentToday(log, restaurantId, category) {
  return !!log[`${restaurantId}_${category}_${todayKey()}`];
}

function markSent(log, restaurantId, category) {
  log[`${restaurantId}_${category}_${todayKey()}`] = new Date().toISOString();
  // Purge des entrées > 7 jours
  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  for (const k of Object.keys(log)) {
    const d = k.split('_').pop();
    if (d && d < cutoff) delete log[k];
  }
  saveLog(log);
}

// ────────────────────────────────────────────────────────────────
//  HELPERS
// ────────────────────────────────────────────────────────────────
function pickRandom(arr) {
  if (!arr || !arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function send(restaurantId, content, type, { io, loadMessages, saveMessages }) {
  if (!content) return null;
  const msg = {
    id: `auto_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    restaurantId,
    from: 'system',
    fromName: 'Commande IA',
    content,
    type: type || 'auto_message',
    timestamp: new Date().toISOString(),
    readBy: []
  };
  try {
    const msgs = loadMessages(restaurantId);
    msgs.push(msg);
    saveMessages(restaurantId, msgs);
    if (io) {
      io.emit(`msg_${restaurantId}`, msg);
      io.emit('admin_new_msg', { restaurantId, msg });
    }
    console.log(`[AutoMsg] [${type}] → ${restaurantId.slice(0, 8)}: "${content.slice(0, 70)}…"`);
  } catch(e) {
    console.error('[AutoMsg] Erreur envoi:', e.message);
  }
  return msg;
}

// ────────────────────────────────────────────────────────────────
//  SCHEDULER PRINCIPAL
// ────────────────────────────────────────────────────────────────
function startScheduler({ io, loadMessages, saveMessages, getRestaurants, getStockRecs, getOrderStats }) {
  console.log('[AutoMsg] ✅ Scheduler démarré (vérification toutes les minutes)');

  const deps = { io, loadMessages, saveMessages };

  const tick = async () => {
    const cfg = loadConfig();
    if (!cfg.global.enabled) return;

    let restaurants = [];
    try { restaurants = await getRestaurants(); }
    catch(e) { return; } // Pas de connexion Notion, skip
    if (!restaurants.length) return;

    const log   = loadLog();
    const now   = new Date();
    const hour  = now.getHours();
    const min   = now.getMinutes();

    for (const resto of restaurants) {
      const rid  = resto.id;
      if (!rid) continue;

      const rCfg   = cfg.restaurants[rid] || {};
      const openH  = rCfg.openHour  ?? 10;
      const closeH = rCfg.closeHour ?? 22;
      const isEnabled = rCfg.enabled !== false;
      if (!isEnabled) continue;

      const isOpen = hour >= openH && hour < closeH;

      // ── 1. Check-in avant fermeture ─────────────────────────────
      const catFerme = cfg.categories.checkin_fermeture;
      if (catFerme?.enabled && !hasSentToday(log, rid, 'checkin_fermeture')) {
        const minBefore = catFerme.minutesBeforeClose || 20;
        const nowMin    = hour * 60 + min;
        const closeMin  = closeH * 60;
        if (nowMin >= closeMin - minBefore && nowMin < closeMin - minBefore + 2) {
          const msg = pickRandom(TEMPLATES.checkin_fermeture.messages);
          if (msg) { send(rid, msg, 'auto_checkin', deps); markSent(log, rid, 'checkin_fermeture'); }
        }
      }

      // ── 2. Message aléatoire en journée ─────────────────────────
      const catRand = cfg.categories.random_journee;
      if (catRand?.enabled && isOpen && !hasSentToday(log, rid, 'random_journee')) {
        const minH = catRand.minHour ?? 10;
        const maxH = catRand.maxHour ?? 16;
        if (hour >= minH && hour < maxH) {
          // Heure cible aléatoire choisie une seule fois par jour
          const targetKey = `${rid}_rand_target_${todayKey()}`;
          if (!log[targetKey]) {
            const tH = minH + Math.floor(Math.random() * (maxH - minH));
            const tM = Math.floor(Math.random() * 60);
            log[targetKey] = `${tH}:${String(tM).padStart(2, '0')}`;
            saveLog(log);
          }
          const [tH, tM] = log[targetKey].split(':').map(Number);
          if (hour === tH && min === tM) {
            const msg = pickRandom(TEMPLATES.random_journee.messages);
            if (msg) { send(rid, msg, 'auto_random', deps); markSent(log, rid, 'random_journee'); }
          }
        }
      }

      // ── 3. Rappel administratif (lundi 9h) ─────────────────────
      const catRappel = cfg.categories.rappel_admin;
      if (catRappel?.enabled && !hasSentToday(log, rid, 'rappel_admin')) {
        if (now.getDay() === 1 && hour === 9 && min === 0) {
          const msg = pickRandom(TEMPLATES.rappel_admin.messages);
          if (msg) { send(rid, msg, 'auto_rappel', deps); markSent(log, rid, 'rappel_admin'); }
        }
      }

      // ── 4. Félicitations ventes ─────────────────────────────────
      const catFelic = cfg.categories.felicitation_ventes;
      if (catFelic?.enabled && isOpen && min === 0 && !hasSentToday(log, rid, 'felicitation_ventes') && getOrderStats) {
        try {
          const stats = await getOrderStats(rid);
          const threshold = catFelic.minCommandes || 8;
          if (stats && stats.todayCount >= threshold) {
            let content;
            if (stats.topProduct && stats.topProduct.count > 0) {
              content = `🎉 Bravo ! Tu as déjà enregistré ${stats.todayCount} commande${stats.todayCount > 1 ? 's' : ''} aujourd'hui ! "${stats.topProduct.name}" est ton best-seller avec ${stats.topProduct.count} vente${stats.topProduct.count > 1 ? 's' : ''}. Continue comme ça ! 🏆`;
            } else {
              content = `🎉 Super journée ! Tu as enregistré ${stats.todayCount} commande${stats.todayCount > 1 ? 's' : ''} aujourd'hui. Continue comme ça ! 🏆`;
            }
            send(rid, content, 'auto_felicitation', deps);
            markSent(log, rid, 'felicitation_ventes');
          }
        } catch(e) {}
      }

      // ── 5. Alerte stock critique ────────────────────────────────
      const catStock = cfg.categories.alerte_stock;
      if (catStock?.enabled && isOpen && min === 30 && !hasSentToday(log, rid, 'alerte_stock') && getStockRecs) {
        try {
          const recs = await getStockRecs(rid);
          const critiques = (recs || []).filter(r => r.urgency === 'critique' || r.urgency === 'urgent');
          if (critiques.length > 0) {
            let content;
            if (critiques.length === 1) {
              const c = critiques[0];
              const daysLeft = c.daysRemaining !== null && c.daysRemaining !== undefined
                ? ` À ce rythme il t'en reste pour ${c.daysRemaining} jour${c.daysRemaining > 1 ? 's' : ''}.`
                : '';
              content = `⚠️ Alerte stock : il te reste seulement ${c.quantiteActuelle} ${c.unite} de ${c.nom}.${daysLeft} Besoin d'un réapprovisionnement ? Écris à ton admin !`;
            } else {
              const noms = critiques.slice(0, 3).map(c => `${c.nom} (${c.quantiteActuelle} ${c.unite})`).join(', ');
              const suite = critiques.length > 3 ? ` et ${critiques.length - 3} autre${critiques.length - 3 > 1 ? 's' : ''}` : '';
              content = `⚠️ ${critiques.length} produits en stock critique : ${noms}${suite}. Lance un réapprovisionnement ou contacte ton admin !`;
            }
            send(rid, content, 'auto_stock', deps);
            markSent(log, rid, 'alerte_stock');
          }
        } catch(e) {}
      }

      // ── 6. Comparaison avec hier (14h00) ────────────────────────
      const catComp = cfg.categories.comparaison_hier;
      if (catComp?.enabled && isOpen && hour === 14 && min === 0 && !hasSentToday(log, rid, 'comparaison_hier') && getOrderStats) {
        try {
          const stats = await getOrderStats(rid);
          if (stats && stats.todayCount !== undefined && stats.yesterdayCountAt14 !== undefined) {
            const diff = stats.todayCount - stats.yesterdayCountAt14;
            let content;
            if (diff > 0) {
              content = `📈 À 14h hier tu avais ${stats.yesterdayCountAt14} commande${stats.yesterdayCountAt14 > 1 ? 's' : ''}, aujourd'hui t'en es déjà à ${stats.todayCount}. +${diff} d'avance — tu es en feu ! 🔥`;
            } else if (diff < 0) {
              content = `📊 Info du jour : à la même heure hier tu avais ${stats.yesterdayCountAt14} commande${stats.yesterdayCountAt14 > 1 ? 's' : ''}, aujourd'hui tu en es à ${stats.todayCount}. ${Math.abs(diff)} de moins pour l'instant — mais le service du soir peut tout changer 💪`;
            } else {
              content = `📊 Exactement au même niveau qu'hier à 14h : ${stats.todayCount} commande${stats.todayCount > 1 ? 's' : ''}. Régulier et solide, c'est une qualité ! 👌`;
            }
            send(rid, content, 'auto_comparaison', deps);
            markSent(log, rid, 'comparaison_hier');
          }
        } catch(e) {}
      }
    }
  };

  // Premier tick après 5s (laisser le serveur démarrer), puis toutes les 60s
  setTimeout(tick, 5000);
  setInterval(tick, 60 * 1000);
}

// ────────────────────────────────────────────────────────────────
//  ENVOI MANUEL (API test / force)
// ────────────────────────────────────────────────────────────────
function sendManual(restaurantId, category, deps) {
  const tpl = TEMPLATES[category];
  if (!tpl) return null;
  // Catégorie dynamique : envoyer un message de démonstration
  if (tpl.dynamic) {
    const demoMsgs = {
      felicitation_ventes: "🎉 Bravo ! Vous avez vendu 12 produits aujourd'hui — c'est votre meilleure journée de la semaine !",
      alerte_stock: "⚠️ Attention : il vous reste seulement 2 portions de votre produit phare. Pensez à réapprovisionner avant demain !",
      comparaison_hier: "📊 À cette heure hier vous aviez 8 commandes — aujourd'hui vous en êtes à 11. Excellente progression ! 📈"
    };
    const content = demoMsgs[category] || `[Test] Message automatique de la catégorie : ${tpl.label}`;
    return send(restaurantId, content, `auto_${category}`, deps);
  }
  const msg = pickRandom(tpl.messages);
  if (!msg) return null;
  return send(restaurantId, msg, `auto_${category}`, deps);
}

// ────────────────────────────────────────────────────────────────
//  EXPORTS
// ────────────────────────────────────────────────────────────────
module.exports = {
  startScheduler,
  loadConfig,
  saveConfig,
  defaultConfig,
  TEMPLATES,
  sendManual,
  send
};
