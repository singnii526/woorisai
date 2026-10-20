// 우리사이 서비스워커 — 오프라인용 화면 캐시 + 휴대폰 푸시 알림
const CACHE = 'woorisai-v2';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/badge-96.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// 같은 사이트 파일만 다룬다 (서버 API·글꼴은 그대로 통과)
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (req.mode === 'navigate'){ // 화면은 새 버전 먼저, 안 되면 저장본
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); return r; })
      .catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok){ const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return r;
  })));
});

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch(err){ d = {body: e.data && e.data.text()}; }
  e.waitUntil((async () => {
    // 아이폰은 알림을 띄우지 않으면 구독이 끊길 수 있어 항상 띄운다
    await self.registration.showNotification(d.title || '우리사이', {
      body: d.body || '새 소식이 있어요', icon: 'icons/icon-192.png', badge: 'icons/badge-96.png',
      tag: d.id || undefined, data: {date: d.date || null, kind: d.kind || null}, lang: 'ko',
    });
    const list = await self.clients.matchAll({type:'window', includeUncontrolled:true});
    list.forEach(c => c.postMessage({type:'sync'}));
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const {date, kind} = e.notification.data || {};
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({type:'window', includeUncontrolled:true});
    const c = list.find(x => new URL(x.url).pathname.startsWith(new URL(self.registration.scope).pathname));
    if (c){ await c.focus(); c.postMessage({type:'open', date, kind}); return; }
    const q = new URLSearchParams(); if (date) q.set('date', date); if (kind) q.set('kind', kind);
    await self.clients.openWindow('./' + (q.toString() ? '?' + q : ''));
  })());
});
