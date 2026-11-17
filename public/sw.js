// کشِ ساده برای اینکه بازی با ربات بدونِ اینترنت هم باز شود.
// همیشه اول از شبکه می‌گیرد (تا نسخه‌ی تازه بیاید) و فقط وقتی شبکه نیست از کش می‌خواند.

const CACHE = "eh-v27";
const FILES = [
  "./", "./style.css", "./app.js", "./bots.js", "./bot-engine.js", "./bot-worker.js",
  "./export-format.js", "./vendor/chess.js", "./fonts/AbarFaNum-VF.woff2",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));   // منتظر می‌ماند تا کاربر دکمه‌ی به‌روزرسانی را بزند
});

self.addEventListener("message", (e) => { if (e.data === "skip") self.skipWaiting(); });

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  if (url.pathname.includes("/vendor/")) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    })));
    return;
  }
  e.respondWith(
    fetch(e.request, { cache: "no-store" })   // همیشه از سرور بپرس که نسخه‌ی تازه‌ای هست یا نه
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request.mode === "navigate" ? "./" : e.request, copy));
        }
        return res;
      })
      .catch(async () =>
        (await caches.match(e.request)) ||
        (e.request.mode === "navigate" ? caches.match("./") : Response.error())
      )
  );
});
