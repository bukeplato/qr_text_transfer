const CACHE_NAME = 'qrcode-transfer-v4';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './lib/qrcode.min.js',
  './lib/jsQR.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // 逐个缓存：某个资源缺失（如图标没传上去）不会导致整个 SW 安装失败
      return Promise.all(
        ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] 缓存失败:', url, err))
        )
      );
    }).then(() => self.skipWaiting()) // 新版安装后立即接管，不用等用户关闭所有页面
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim()) // 立即控制已打开的页面
  );
});

self.addEventListener('fetch', event => {
  // 只处理 GET 请求；非 http(s) 请求（如 chrome-extension://）直接放行
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
    return;
  }

  const isHTML = event.request.mode === 'navigate'
    || event.request.destination === 'document'
    || event.request.url.endsWith('.html')
    || event.request.url.endsWith('/');

  if (isHTML) {
    // HTML 走 network-first：有新版本立刻生效，断网时回退到缓存
    event.respondWith(
      fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
        }
        return response;
      }).catch(() => {
        return caches.match(event.request).then(cached => {
          return cached || caches.match('./index.html').then(fallback => {
            return fallback || new Response('离线状态，且页面尚未缓存。请联网后重试。', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            });
          });
        });
      })
    );
  } else {
    // 静态资源走 cache-first：命中直接返回，未命中则联网获取并缓存，永不返回 undefined
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        }).catch(() => {
          return new Response('', { status: 504, statusText: 'Offline' });
        });
      })
    );
  }
});
