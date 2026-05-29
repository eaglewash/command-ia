// Commande-IA Service Worker v6.0
// Offline support + push notifications + background sync

const CACHE_NAME    = 'commande-ia-v6';
const STATIC_CACHE  = 'commande-ia-static-v6';
const DYNAMIC_CACHE = 'commande-ia-dynamic-v6';

// Core static pages to cache for offline use (UI shells only)
const STATIC_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Returns true if the response should NOT be stored in SW cache
// (server explicitly asked browsers not to cache it)
function isNoCacheResponse(response) {
  const cc = response.headers.get('Cache-Control') || '';
  return cc.includes('no-store') || cc.includes('no-cache');
}

// Returns true for paths that must always hit the network
function isDynamicPath(pathname) {
  return (
    pathname.startsWith('/api/')           ||
    pathname.startsWith('/config/')        ||
    pathname.startsWith('/admin/')         ||
    pathname.startsWith('/commandes')      ||
    pathname.startsWith('/archives')       ||
    pathname.startsWith('/mon-menu/')      ||
    pathname.startsWith('/mon-restaurant/')||
    pathname.startsWith('/tickets/')       ||
    pathname.startsWith('/planning/')      ||
    pathname.startsWith('/stock/')         ||
    pathname.startsWith('/ingredients/')   ||
    pathname.startsWith('/fournisseurs/')  ||
    pathname.startsWith('/reapprovisionnement/') ||
    pathname.startsWith('/conversations/') ||
    pathname.startsWith('/broadcast/')     ||
    pathname.startsWith('/factures/')      ||
    pathname.startsWith('/analytics/')
  );
}

// ─── Install: cache static assets ─────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Commande-IA Service Worker v6.0');
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return Promise.allSettled(
        STATIC_ASSETS.map((url) => cache.add(url).catch(() => null))
      );
    }).then(() => self.skipWaiting())
  );
});

// ─── Activate: clean ALL old caches ───────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating v6.0 — purging old caches');
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
          .map((k) => {
            console.log('[SW] Deleting old cache:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Fetch: smart routing ──────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET and non-http(s) requests
  if (event.request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;
  if (!url.protocol.startsWith('http')) return;

  // Socket.io: never intercept
  if (url.pathname.startsWith('/socket.io')) return;

  // Railway / external API calls: network-first
  if (url.hostname.includes('railway.app')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Dynamic API routes: always network-first (fresh data required)
  if (isDynamicPath(url.pathname)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // HTML navigation: network-first so changes are immediately visible
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // JS and CSS: network-first (server sends no-cache headers for these)
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Truly static assets (images, fonts from CDN): cache-first
  event.respondWith(cacheFirst(event.request));
});

// ─── Network-first strategy ────────────────────────────────────────────────────
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    // Only cache if server allows it
    if (response.ok && !isNoCacheResponse(response)) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline fallback: try cache
    const cached = await caches.match(request);
    if (cached) return cached;
    // Last resort for navigation
    if (request.mode === 'navigate') {
      const offlinePage = await caches.match('/index.html');
      if (offlinePage) return offlinePage;
    }
    return new Response(JSON.stringify({ error: 'Offline', offline: true }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// ─── Cache-first strategy ──────────────────────────────────────────────────────
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok && !isNoCacheResponse(response)) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    if (request.mode === 'navigate') {
      return caches.match('/index.html');
    }
    return new Response('Offline', { status: 503 });
  }
}

// ─── Push Notifications ────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Commande-IA';
  const options = {
    body: data.body || 'Nouvelle notification',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: data.tag || 'commande-ia',
    renotify: true,
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' },
    actions: data.actions || [],
  };

  if (data.type === 'new_order') {
    options.body = `Nouvelle commande: ${data.orderNumber || 'Table ?'}`;
    options.tag = 'new-order';
    options.actions = [
      { action: 'view', title: 'Voir' },
      { action: 'dismiss', title: 'Ignorer' },
    ];
  } else if (data.type === 'order_ready') {
    options.body = `Commande prête: ${data.orderNumber}`;
    options.tag = 'order-ready';
  } else if (data.type === 'low_stock') {
    options.body = `Stock bas: ${data.item}`;
    options.tag = 'low-stock';
    options.data.url = '/reapprovisionnement.html';
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

// ─── Notification click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

// ─── Background sync ───────────────────────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-offline-orders') {
    event.waitUntil(syncOfflineOrders());
  }
});

async function syncOfflineOrders() {
  console.log('[SW] Syncing offline orders...');
  const clients_ = await clients.matchAll();
  clients_.forEach((client) =>
    client.postMessage({ type: 'SW_SYNC_COMPLETE', tag: 'sync-offline-orders' })
  );
}

// ─── Message handling (from main app) ─────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data.type === 'CACHE_PAGE') {
    caches.open(DYNAMIC_CACHE).then((cache) => {
      cache.add(event.data.url);
    });
  }
});
