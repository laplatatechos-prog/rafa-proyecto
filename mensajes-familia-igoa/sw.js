// "Service worker": una pieza chiquita que permite instalar la página como app.
// No guarda mensajes; siempre pide la versión más nueva a internet.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
