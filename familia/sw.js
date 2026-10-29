const C="cdo-v10";const SHELL=["./","index.html","app.js","vendor/supabase.js","manifest.webmanifest","icons/icon-192.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(SHELL)));self.skipWaiting()});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))));self.clients.claim()});
self.addEventListener("fetch",e=>{const u=new URL(e.request.url);if(e.request.method!=="GET"||u.origin!==location.origin)return;
  e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match("index.html"))))});
self.addEventListener("push",e=>{let d={};try{d=e.data.json()}catch(_){d={title:"Casa en Orden",body:e.data?e.data.text():""}}
  e.waitUntil(self.registration.showNotification(d.title||"Casa en Orden",{body:d.body||"",icon:"icons/icon-192.png",badge:"icons/icon-192.png",data:{url:d.url||"./"},vibrate:[200,100,200]}))});
self.addEventListener("notificationclick",e=>{e.notification.close();e.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(l=>{for(const c of l){if("focus" in c)return c.focus()}return clients.openWindow("./")}))});
