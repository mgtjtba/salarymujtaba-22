const CACHE_NAME = 'salary-localization-v2';
const STATIC_CACHE = 'static-files-v2';
const DYNAMIC_CACHE = 'dynamic-files-v2';

// ملفات أساسية للتخزين المؤقت
const STATIC_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap'
];

// تثبيت Service Worker وتخزين الملفات الأساسية
self.addEventListener('install', function(event) {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(function(cache) {
        console.log('Service Worker: Caching static files');
        return cache.addAll(STATIC_FILES);
      })
      .then(() => self.skipWaiting())
  );
});

// تفعيل Service Worker الجديد
self.addEventListener('activate', function(event) {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          // حذف الكاشات القديمة
          if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// استرداد الملفات - أولوية للكاش ثم الشبكة
self.addEventListener('fetch', function(event) {
  // تجاهل الطلبات غير المناسبة
  if (
    !event.request.url.startsWith('http') ||
    event.request.method !== 'GET' ||
    event.request.url.includes('chrome-extension') ||
    event.request.url.includes('lovableproject.com/socket.io')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(function(cachedResponse) {
        // إرجاع من الكاش إذا موجود
        if (cachedResponse) {
          console.log('Service Worker: Serving from cache:', event.request.url);
          return cachedResponse;
        }

        // محاولة جلب من الشبكة وتخزينه
        return fetch(event.request)
          .then(function(response) {
            // فقط تخزين الاستجابات الناجحة
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // تخزين نسخة من الاستجابة
            const responseToCache = response.clone();
            caches.open(DYNAMIC_CACHE)
              .then(function(cache) {
                // تخزين الملفات الديناميكية (JS, CSS)
                if (event.request.url.includes('.js') || 
                    event.request.url.includes('.css') ||
                    event.request.url.includes('.tsx')) {
                  cache.put(event.request, responseToCache);
                }
              });

            return response;
          })
          .catch(function() {
            // في حالة عدم توفر الشبكة، إرجاع صفحة افتراضية للتطبيق
            if (event.request.headers.get('accept').includes('text/html')) {
              return caches.match('/');
            }
          });
      })
  );
});

// تنظيف الكاش الديناميكي عند امتلائه
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(DYNAMIC_CACHE);
  }
});