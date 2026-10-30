// Only public assets are cached. Screens, credentials, and API responses never are.
const CACHE='haven-shell-v5';
const ASSETS=['/offline.html','/style.css','/polish.css','/black.css','/remote.css','/qr.css','/icon.svg','/apple-touch-icon.png','/icon-192.png','/icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(names=>Promise.all(names.filter(name=>name.startsWith('haven-shell-')&&name!==CACHE).map(name=>caches.delete(name)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin||event.request.method!=='GET'||url.pathname.startsWith('/api/'))return;
  if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.match('/offline.html')));return;}
  if(ASSETS.includes(url.pathname))event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));
});
