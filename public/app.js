// افق رویداد — سمتِ مرورگر.
// بازیِ آنلاین: قانون‌ها روی سرور بررسی می‌شوند و این‌جا فقط نمایش است.
// بازی با ربات: همه‌چیز در همین مرورگر اجرا می‌شود (بدون اینترنت هم) و هر حرکت،
// هر وقت اینترنت باشد، روی سرور هم ثبت می‌شود.

import { Chess } from "./vendor/chess.js";
// روی GitHub Pages سرور نداریم؛ API و اتصالِ زنده از Cloudflare می‌آید
const API = location.hostname.endsWith("github.io") ? "https://event-horizon-chess.p128parsa.workers.dev" : "";
const HOME = location.origin + location.pathname;
const _fetch = window.fetch.bind(window);
const fetch = (u, o = {}) => _fetch(typeof u === "string" && u.startsWith("/api/") ? API + u : u,
  API ? { credentials: "include", ...o } : o);
import { BOTS, botById } from "./bots.js";
import { formatGame } from "./export-format.js";

const $ = (s) => document.querySelector(s);
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const FILES = "abcdefgh";
const SIDE = { w: "سفید", b: "سیاه" };
const PIECE = { p: "سرباز", n: "اسب", b: "فیل", r: "رخ", q: "وزیر", k: "شاه" };

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const randomId = (n) => {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  return [...crypto.getRandomValues(new Uint8Array(n))].map((b) => abc[b % abc.length]).join("");
};
const newPid = () =>
  crypto.randomUUID ? crypto.randomUUID()
    : [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");

// شناسه‌ی بازیکن: برای مهمان در همین مرورگر ساخته می‌شود؛ با ورود، شناسه‌ی حساب جایش می‌نشیند
let pid = store.get("eh.pid");
if (!pid) { pid = newPid(); store.set("eh.pid", pid); }

const session = {
  name: store.get("eh.name") || "",
  account: store.get("eh.account") === "1",
  known: store.get("eh.known") === "1",   // از صفحه‌ی ورود گذشته (با حساب یا مهمان)
};

const gameId = new URLSearchParams(location.search).get("g");

// حالتِ سبک برای گوشی‌های ضعیف: افکت‌های سنگین خاموش می‌شود.
// اگر کاربر خودش انتخاب نکرده باشد، از روی سخت‌افزار و سرعتِ واقعیِ صفحه تصمیم می‌گیریم.
const litePref = store.get("eh.lite");
// کیفیت: auto (خودکار) | low (سبک) | mid (متوسط) | high (کامل)
let Q = store.get("eh.q") || (litePref ? (litePref === "1" ? "low" : "high") : "auto");
let LITE = Q !== "auto" ? Q === "low"
  : navigator.userAgentData?.mobile === true || matchMedia("(pointer: coarse)").matches
    || (navigator.deviceMemory || 8) <= 3 || (navigator.hardwareConcurrency || 8) <= 4;
// مودِ افرادِ بهانه‌گیر: همه‌چیز معمولی، تیره و روان
let PLAIN = store.get("eh.theme") === "plain";
document.documentElement.classList.toggle("plain", PLAIN);
const setLite = (on) => {
  LITE = on;
  document.documentElement.classList.toggle("lite", on);
  document.documentElement.classList.toggle("mid", Q === "mid");
};
setLite(LITE);
if (Q === "auto" && !LITE) {
  let frames = 0;
  const t0 = performance.now();
  const probe = (t) => {
    frames++;
    if (t - t0 < 3000) return requestAnimationFrame(probe);
    if (!document.hidden && frames / 3 < 35 && Q === "auto") setLite(true);   // کمتر از ۳۵ فریم در ثانیه
  };
  requestAnimationFrame(probe);
}

/* ───────────── فضا: ستاره‌هایی که آرام دورِ سیاه‌چاله می‌چرخند ───────────── */

function initCosmos() {
  const cv = $("#stars");
  const ctx = cv.getContext("2d");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const TINT = ["#ffffff", "#ffffff", "#ffffff", "#bcd4ff", "#ffd9ad"];
  let W = 0, H = 0, stars = [];

  function size() {
    const d = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = W * d; cv.height = H * d;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    const R = Math.hypot(W, H);
    const n = Math.round(Math.min(LITE ? 110 : 460, (W * H) / 3600));
    stars = Array.from({ length: n }, () => ({
      r: 40 + Math.sqrt(Math.random()) * R * 0.8,
      a: Math.random() * 6.283,
      s: Math.random() ** 3 * 1.5 + 0.35,
      p: Math.random() * 6.283,
      k: 0.5 + Math.random() * 1.5,
      c: TINT[(Math.random() * TINT.length) | 0],
    }));
  }

  let lastT = 0, nextMeasure = 0, cx = 0, cy = 0;
  function frame(t) {
    // زیرِ شیشه‌ی تار، هر فریمِ تازه یعنی محاسبه‌ی دوباره‌ی تاری؛ پس در صفحه‌ی بازی آرام‌تر می‌کشیم
    const gap = LITE || PLAIN ? 2000 : current === "table" ? 66 : 0;
    if (gap && t - lastT < gap) return requestAnimationFrame(frame);
    const step = lastT ? Math.min(6, (t - lastT) / 16.7) : 1;   // سرعتِ چرخش به تعدادِ فریم وابسته نباشد
    lastT = t;
    if (t > nextMeasure) {   // خواندنِ جای سیاه‌چاله گران است؛ هر ۴۰۰ میلی‌ثانیه یک بار کافی است
      nextMeasure = t + 400;
      const hole = [...document.querySelectorAll(".hole")].find((h) => h.offsetParent);
      cx = W / 2; cy = H / 2;
      if (hole) { const b = hole.getBoundingClientRect(); cx = b.left + b.width / 2; cy = b.top + b.height / 2; }
    }
    ctx.clearRect(0, 0, W, H);
    for (const s of stars) {
      if (!still) s.a += (0.22 * step) / (s.r + 90);   // هرچه نزدیک‌تر به مرکز، سریع‌تر
      const x = cx + Math.cos(s.a) * s.r;
      const y = cy + Math.sin(s.a) * s.r * 0.9;
      if (x < -4 || x > W + 4 || y < -4 || y > H + 4) continue;
      ctx.globalAlpha = still || LITE ? 0.8 : 0.35 + 0.65 * Math.abs(Math.sin(t * 0.0006 * s.k + s.p));
      ctx.fillStyle = s.c;
      ctx.beginPath();
      ctx.arc(x, y, s.s, 0, 6.283);
      ctx.fill();
    }
    if (!still) requestAnimationFrame(frame);
  }

  size();
  addEventListener("resize", () => { size(); if (still) frame(0); });
  requestAnimationFrame(frame);
}

/* ───────────── مهره‌ها ───────────── */

const BASE = '<rect x="26" y="80" width="48" height="8" rx="2"/>';
const SHAPES = {
  p: `<path d="M36 80C38 62 44 54 46 46h8c2 8 8 16 10 34z"/><circle cx="50" cy="34" r="13"/>${BASE}`,
  r: `<path d="M37 40h26l3 40H34z"/><path d="M32 20h9v8h5v-8h8v8h5v-8h9v20H32z"/>${BASE}`,
  n: `<path d="M34 80C34 62 46 56 46 44L33 50l-5-8 18-22 4-6 4 8c14 6 18 28 14 58z"/><circle class="dot" cx="47" cy="31" r="2.6"/>${BASE}`,
  b: `<path d="M42 58h16l6 22H36z"/><path d="M50 14c14 16 16 32 6 44H44C34 46 36 30 50 14z"/><path class="dt" d="M44 30l11 11"/>${BASE}`,
  q: `<path d="M24 34l13 24 3-32 10 30 10-30 3 32 13-24-8 46H32z"/><circle cx="24" cy="30" r="4.5"/><circle cx="40" cy="22" r="4.5"/><circle cx="60" cy="22" r="4.5"/><circle cx="76" cy="30" r="4.5"/>${BASE}`,
  k: `<path d="M30 80C22 54 36 38 50 38s28 16 20 42z"/><path d="M46 8h8v8h8v8h-8v12h-8V24h-8v-8h8z"/>${BASE}`,
};
const pieceSVG = (t, c) =>
  `<svg class="pc pc-${c}" viewBox="0 0 100 100" fill="url(#g${c})" aria-hidden="true">${SHAPES[t]}</svg>`;

function parseFen(fen) {
  const pos = {};
  fen.split(" ")[0].split("/").forEach((row, r) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) f += +ch;
      else { pos[FILES[f] + (8 - r)] = { t: ch.toLowerCase(), c: ch === ch.toLowerCase() ? "b" : "w" }; f++; }
    }
  });
  return pos;
}

/* ───────────── صفحه‌ها و مسیرها ───────────── */

const SCREENS = ["splash", "auth", "menu", "bots", "profile", "table", "lost"];
let current = null;

function show(name) {
  current = name;
  document.body.dataset.screen = name;
  for (const s of SCREENS) $("#" + s).hidden = s !== name;
  $("#who").hidden = !session.known || name === "splash" || name === "auth";
  $("#who-name").textContent = session.name || "مهمان";
  if (name !== "table") for (const id of ["conn", "undo-ask", "chat-open", "chat"]) $("#" + id).hidden = true;
  scrollTo(0, 0);
}

let afterAuth = "menu";

function route() {
  if (gameId) return;   // صفحه‌ی بازیِ آنلاین مسیرِ خودش را دارد
  const h = location.hash.slice(1);
  const need = (target, open) => {
    if (session.known) return open();
    afterAuth = target;
    openAuth();
  };
  if (h === "login") return session.known ? go("menu") : openAuth();
  if (h === "menu") return need("menu", openMenu);
  if (h === "bots") return need("bots", openBots);
  // لینکِ «از این موقعیت بازی کن»:  #play=<ربات>&me=w|b&moves=e4,e5,...
  if (h.startsWith("play=")) return need(h, () => {
    const q = new URLSearchParams(h);
    const b = botById(q.get("play"));
    if (!b) return go("menu");
    const t = new Date().toISOString();
    botGame = {
      id: "b" + randomId(9), botId: b.id, color: q.get("me") === "b" ? "b" : "w", startedAt: t, resigned: false, noClock: true,
      moves: (q.get("moves") || "").split(",").filter(Boolean).slice(0, 300).map((san) => ({ san, at: t })),
    };
    thinking = null;
    rebuildBot();   // حرکتِ نادرست در لینک، همان‌جا بریده می‌شود
    saveBot();
    syncBot();
    go("bot");
  });
  if (h === "profile") return need("profile", openProfile);
  if (h === "bot") return need("menu", () => (botGame ? openBotTable() : go("menu")));
  show("splash");
}
const go = (hash) => { if (location.hash.slice(1) === hash) route(); else location.hash = hash; };

/* ───────────── ورود ───────────── */

let authTab = "login";
const AUTH_ERRORS = {
  bad_username: "نام کاربری باید ۳ تا ۲۰ حرف یا عدد باشد، بدون فاصله.",
  bad_password: "رمز عبور باید حداقل ۸ کاراکتر باشد.",
  username_taken: "این نام کاربری قبلاً گرفته شده است. نام دیگری انتخاب کنید.",
  wrong_login: "نام کاربری یا رمز عبور درست نیست.",
};

function setAuthTab(tab) {
  authTab = tab;
  for (const b of document.querySelectorAll(".tabs [data-tab]")) b.setAttribute("aria-selected", b.dataset.tab === tab);
  const guest = tab === "guest";
  $("#f-username").hidden = guest;
  $("#f-password").hidden = guest;
  $("#f-guest").hidden = !guest;
  $("#username-hint").hidden = tab !== "register";
  $("#password-hint").hidden = tab !== "register";
  $("#password").autocomplete = tab === "register" ? "new-password" : "current-password";
  $("#auth-submit").textContent = { login: "ورود", register: "ساخت حساب", guest: "ادامه به‌عنوان مهمان" }[tab];
  $("#auth-error").hidden = true;
}

function openAuth() {
  show("auth");
  setAuthTab(authTab);
  $("#guest-name").value = session.name;
}

function signedIn(name, account) {
  session.name = name;
  session.account = account;
  session.known = true;
  store.set("eh.name", name);
  store.set("eh.account", account ? "1" : "0");
  store.set("eh.known", "1");
  go(afterAuth);
  afterAuth = "menu";
}

function initAuth() {
  for (const b of document.querySelectorAll(".tabs [data-tab]")) b.addEventListener("click", () => setAuthTab(b.dataset.tab));
  $("#toggle-pass").addEventListener("click", () => {
    const input = $("#password");
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    $("#toggle-pass").textContent = showing ? "نمایش" : "پنهان";
    $("#toggle-pass").setAttribute("aria-pressed", String(!showing));
  });

  $("#auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#auth-error");
    const fail = (msg, focus) => { err.textContent = msg; err.hidden = false; focus?.focus(); };
    err.hidden = true;

    if (authTab === "guest") return signedIn($("#guest-name").value.trim().slice(0, 24), false);

    const username = $("#username").value.trim();
    const password = $("#password").value;
    if (!/^[A-Za-z0-9_؀-ۿ‌]{3,20}$/.test(username)) return fail(AUTH_ERRORS.bad_username, $("#username"));
    if (password.length < 8) return fail(AUTH_ERRORS.bad_password, $("#password"));

    const btn = $("#auth-submit");
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "کمی صبر کنید…";
    try {
      const res = await fetch("/api/auth/" + authTab, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password, pid }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return fail(AUTH_ERRORS[data.error] || "مشکلی پیش آمد. دوباره امتحان کنید.");
      pid = data.pid;
      store.set("eh.pid", pid);
      $("#password").value = "";
      signedIn(data.username, true);
    } catch {
      fail("اتصال به سرور برقرار نشد. اینترنت را بررسی کنید یا به‌عنوان مهمان ادامه دهید.");
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  });

  $("#logout").addEventListener("click", async () => {
    if (session.account) {
      try { await fetch("/api/auth/logout", { method: "POST" }); } catch {}
      pid = newPid();              // شناسه‌ی حساب روی این دستگاه نمی‌ماند
      store.set("eh.pid", pid);
      session.name = "";
      store.del("eh.name");
    }
    session.account = false;
    session.known = false;
    store.set("eh.account", "0");
    store.set("eh.known", "0");
    location.href = HOME;
  });

  // اگر نشستِ حساب روی سرور تمام شده باشد، دوباره ورود می‌خواهد
  if (session.account) {
    fetch("/api/auth/me").then(async (res) => {
      if (res.status === 401) {
        session.account = false; session.known = false;
        store.set("eh.account", "0"); store.set("eh.known", "0");
        if (!gameId && current !== "splash") openAuth();
      } else if (res.ok) {
        const data = await res.json();
        if (data.pid && data.pid !== pid) { pid = data.pid; store.set("eh.pid", pid); }
      }
    }).catch(() => {});   // آفلاین: با همان اطلاعاتِ روی دستگاه ادامه می‌دهیم
  }
}

/* ───────────── منو ───────────── */

function openMenu() {
  show("menu");
  $("#hello").textContent = session.name ? `سلام، ${session.name}` : "سلام";
  $("#menu-error").hidden = true;
  loadUnfinished();
  const live = botGame && !botOutcome();
  $("#resume").hidden = !live;
  if (live) {
    const b = botById(botGame.botId);
    paintAvatar($("#resume-avatar"), b);
    $("#resume-title").textContent = `ادامه‌ی بازی با ${b.name}`;
  }
}

// بازی‌های نیمه‌تمام از سرور خوانده می‌شود تا با بیرون‌رفتن از صفحه چیزی گم نشود
async function loadUnfinished() {
  const box = $("#unfinished"), list = $("#unfinished-list");
  let games = [];
  try {
    const res = await fetch("/api/my-games", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pid }),
    });
    if (res.ok) games = (await res.json()).games;
  } catch {}
  const liveBot = botGame && !botOutcome() ? botGame.id : null;   // این یکی دکمه‌ی «ادامه» خودش را دارد
  games = games.filter((g) => g.id !== liveBot && (g.mode !== "bot" || botById(g.botId)));
  box.hidden = !games.length;
  list.textContent = "";
  for (const g of games) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "card glass unf";
    const b = g.mode === "bot" ? botById(g.botId) : null;
    const title = b ? `با ربات ${b.name}`
      : g.mode === "solo" ? "دو نفره روی همین دستگاه"
      : g.status === "waiting" ? "آنلاین — منتظر بازیکن دوم"
      : `آنلاین با ${g.opponent || "حریف"}`;
    const side = g.color === "both" ? "" : g.color === "w" ? " — شما سفید" : " — شما سیاه";
    el.innerHTML = '<i class="avatar" aria-hidden="true"></i><span><b></b><small></small></span><span class="chip ok">ادامه</span>';
    if (b) paintAvatar(el.querySelector(".avatar"), b);
    else el.querySelector(".avatar").className = "orb " + (g.color === "b" ? "orb-b" : "orb-w");
    el.querySelector("b").textContent = title;
    el.querySelector("small").textContent = `${g.moves} حرکت${side}`;
    el.addEventListener("click", () => (b ? resumeBotFromServer(g, el) : (location.href = HOME + "?g=" + g.id)));
    list.appendChild(el);
  }
}

// بازیِ ربات که روی سرور ذخیره شده، دوباره روی همین دستگاه بار می‌شود
async function resumeBotFromServer(g, el) {
  el.disabled = true;
  try {
    const res = await fetch("/api/games/" + g.id);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    botGame = {
      id: g.id, botId: g.botId, color: g.color, startedAt: g.startedAt, resigned: false,
      moves: data.moves.map((m) => ({ san: m.san, at: m.created_at })),
    };
    thinking = null;
    rebuildBot();
    saveBot();
    go("bot");
  } catch {
    el.disabled = false;
    $("#menu-error").textContent = "این بازی بار نشد. اتصال را بررسی کنید.";
    $("#menu-error").hidden = false;
  }
}

async function createOnline(mode, side, btn) {
  const err = $("#menu-error");
  err.hidden = true;
  btn.disabled = true;
  try {
    const res = await fetch("/api/games", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pid, name: session.name, name2: $("#name2").value.trim(), mode, side, random: $("#random960").checked }),
    });
    if (!res.ok) throw new Error(res.status);
    const { id } = await res.json();
    location.href = HOME + "?g=" + id;
  } catch {
    err.textContent = "بازی ساخته نشد. این حالت به اینترنت نیاز دارد؛ اتصال را بررسی کنید.";
    err.hidden = false;
    btn.disabled = false;
  }
}

function initMenu() {
  $("#start").addEventListener("click", () => go(session.known ? "menu" : "login"));
  $("#resume").addEventListener("click", () => go("bot"));
  const qBtns = [...document.querySelectorAll("[data-q]")];
  const paintQ = () => {
    for (const b of qBtns) {
      const on = b.dataset.q === Q;
      b.classList.toggle("primary", on);
      b.classList.toggle("ghost", !on);
      b.setAttribute("aria-pressed", on);
    }
  };
  paintQ();
  const tBtns = [...document.querySelectorAll("[data-theme]")];
  const paintT = () => {
    for (const b of tBtns) {
      const on = (b.dataset.theme === "plain") === PLAIN;
      b.classList.toggle("primary", on);
      b.classList.toggle("ghost", !on);
      b.setAttribute("aria-pressed", on);
    }
  };
  paintT();
  for (const b of tBtns) {
    b.addEventListener("click", () => {
      PLAIN = b.dataset.theme === "plain";
      store.set("eh.theme", PLAIN ? "plain" : "space");
      document.documentElement.classList.toggle("plain", PLAIN);
      paintT();
    });
  }
  $("#set-open").addEventListener("click", () => { $("#settings").hidden = !$("#settings").hidden; });
  for (const b of qBtns) {
    b.addEventListener("click", () => {
      store.set("eh.q", b.dataset.q);
      if (b.dataset.q === "auto") return location.reload();   // تشخیصِ خودکار از نو انجام شود
      Q = b.dataset.q;
      setLite(Q === "low");
      paintQ();
    });
  }
  for (const b of document.querySelectorAll("[data-create]")) {
    b.addEventListener("click", () => createOnline(b.dataset.create, b.dataset.side, b));
  }
}

/* ───────────── پروفایل و سطح ───────────── */

async function openProfile() {
  show("profile");
  $("#pf-name").textContent = session.name || "مهمان";
  $("#pf-kind").textContent = session.account ? "حساب کاربری" : "مهمان — فقط روی همین مرورگر";
  try {
    const res = await fetch("/api/profile", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pid }),
    });
    if (!res.ok) throw new Error(res.status);
    const p = await res.json();
    $("#pf-level").textContent = p.level;
    $("#pf-bar").style.width = Math.round(((p.xp - p.floor) / (p.next - p.floor)) * 100) + "%";
    $("#pf-xp").textContent = `${p.xp} امتیاز — ${p.next - p.xp} امتیاز تا سطح ${p.level + 1}`;
    for (const k of ["games", "wins", "draws", "losses"]) $("#pf-" + k).textContent = p[k];
  } catch {
    $("#pf-xp").textContent = "برای دیدن سطح به اینترنت نیاز است.";
  }
}

/* ───────────── انتخابِ ربات ───────────── */

function paintAvatar(el, bot) {
  el.className = `avatar k-${bot.kind}` + (el.classList.contains("big") ? " big" : "");
  el.style.setProperty("--h1", bot.hue[0]);
  el.style.setProperty("--h2", bot.hue[1]);
}
const levelPips = (n) =>
  `<span class="pips" aria-label="سطح ${n} از ۱۰">${"<i class='on'></i>".repeat(n)}${"<i></i>".repeat(10 - n)}</span>`;
const chipsHTML = (list) => list.map((t) => `<span class="chip">${t}</span>`).join("");

let pickedBot = store.get("eh.lastbot") || BOTS[0].id;

function pickBot(id) {
  const b = botById(id) || BOTS[0];
  pickedBot = b.id;
  for (const el of document.querySelectorAll(".bot")) el.setAttribute("aria-selected", el.dataset.id === b.id);
  paintAvatar($("#bd-avatar"), b);
  $("#bd-name").textContent = b.name;
  $("#bd-title").textContent = b.title;
  $("#bd-level").innerHTML = `<span>سطح ${b.level} از ۱۰</span>${levelPips(b.level)}`;
  $("#bd-desc").textContent = b.desc;
  $("#bd-tricks").innerHTML = chipsHTML(b.tricks);
}

function openBots() {
  show("bots");
  const grid = $("#bot-grid");
  if (!grid.children.length) {
    for (const b of BOTS) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "bot glass";
      el.dataset.id = b.id;
      el.setAttribute("role", "option");
      el.innerHTML = `<i class="avatar" aria-hidden="true"></i>
        <span class="bot-text"><b>${b.name}</b><small>${b.title}</small></span>${levelPips(b.level)}`;
      paintAvatar(el.querySelector(".avatar"), b);
      el.addEventListener("click", () => {
        pickBot(b.id);
        if (innerWidth <= 900) $("#bot-detail").scrollIntoView({ behavior: "smooth", block: "start" });
      });
      grid.appendChild(el);
    }
    $("#bot-start").addEventListener("click", () => {
      let color = document.querySelector("input[name=botcolor]:checked").value;
      if (color === "r") color = Math.random() < 0.5 ? "w" : "b";
      startBotGame(pickedBot, color);
    });
  }
  pickBot(pickedBot);
}

/* ───────────── بازی با ربات (در همین مرورگر) ───────────── */

let botGame = null;     // { id, botId, color, startedAt, moves: [{ san, at }], resigned }
let bc = null;          // صفحه‌ی بازی با ربات
let botRows = [];       // حرکت‌ها با جزئیات، به همان شکلی که سرور می‌فرستد
let thinking = null;    // نشانه‌ی درخواستِ در جریان از ربات
let worker = null;
let askSeq = 0;
const pending = new Map();

try { botGame = JSON.parse(store.get("eh.bot") || "null"); } catch { botGame = null; }
if (botGame && !botById(botGame.botId)) botGame = null;

const saveBot = () => store.set("eh.bot", JSON.stringify(botGame));

function rowOf(mv, ply, at) {
  return {
    ply, color: mv.color, san: mv.san, from: mv.from, to: mv.to, piece: mv.piece,
    captured: mv.captured || null, promotion: mv.promotion || null, flags: mv.flags, fen: bc.fen(), at,
  };
}

function rebuildBot() {
  bc = new Chess();
  botRows = [];
  try {
    botGame.moves.forEach((m, i) => botRows.push(rowOf(bc.move(m.san), i + 1, m.at)));
  } catch {
    botGame.moves.length = botRows.length;   // ذخیره‌ی خراب: تا همان‌جا که سالم است
    saveBot();
  }
}

function botOutcome() {
  if (!bc) rebuildBot();
  const botSide = botGame.color === "w" ? "black" : "white";
  if (bc.isCheckmate()) return { result: bc.turn() === "w" ? "black" : "white", reason: "checkmate" };
  if (bc.isStalemate()) return { result: "draw", reason: "stalemate" };
  if (bc.isThreefoldRepetition()) return { result: "draw", reason: "repetition" };
  if (bc.isInsufficientMaterial()) return { result: "draw", reason: "insufficient" };
  if (bc.isDraw()) return { result: "draw", reason: "fifty" };
  if (botGame.timedOut) return { result: botSide, reason: "timeout" };
  if (botGame.resigned) return { result: botSide, reason: "resign" };
  return null;
}

function botState() {
  const o = botOutcome();
  const b = botById(botGame.botId);
  const you = botGame.color, it = you === "w" ? "b" : "w";
  return {
    id: botGame.id, mode: "bot", bot: b,
    status: o ? "over" : "active", result: o?.result || null, reason: o?.reason || null,
    you,
    players: {
      [you]: { name: session.name, seated: true, online: true },
      [it]: { name: b.name, seated: true, online: true, bot: true },
    },
    watchers: 0,
    left: !o && botGame.deadline && !botGame.noClock ? Math.max(0, botGame.deadline - Date.now()) : null,
    fen: bc.fen(), turn: bc.turn(), check: bc.inCheck(),
    moves: botRows,
    legal: o ? [] : bc.moves({ verbose: true }).map(({ from, to, promotion }) => ({ from, to, promotion })),
  };
}

function startBotGame(botId, color) {
  store.set("eh.lastbot", botId);
  botGame = { id: "b" + randomId(9), botId, color, startedAt: new Date().toISOString(), moves: [], resigned: false };
  botGame.deadline = color === "w" ? Date.now() + TURN_MS : null;
  thinking = null;
  rebuildBot();
  saveBot();
  syncBot();
  go("bot");
}

function openBotTable() {
  show("table");
  if (!bc) rebuildBot();
  const b = botById(botGame.botId);
  $("#bot-card").hidden = false;
  paintAvatar($("#bc-avatar"), b);
  $("#bc-name").textContent = b.name;
  $("#bc-title").textContent = `${b.title} — سطح ${b.level} از ۱۰`;
  $("#bc-tricks").innerHTML = chipsHTML(b.tricks);
  $("#again").href = "/#bots";
  // با برگشتن به بازی، یک دقیقه‌ی تازه شروع می‌شود تا کسی به‌خاطرِ بیرون‌رفتن نبازد
  if (!botOutcome()) { botGame.deadline = bc.turn() === botGame.color ? Date.now() + TURN_MS : null; saveBot(); }
  sel = null;
  closePromo();
  S = botState();
  render(false);
  setConn("", "ذخیره روی همین دستگاه");
  syncBot();
  maybeThink();
}

function refreshBot(animate) {
  S = botState();
  if (current === "table" && !gameId) render(animate);
}

function applyBotMove(move) {
  let mv;
  try { mv = bc.move(move); } catch { return false; }
  const at = new Date().toISOString();
  botGame.moves.push({ san: mv.san, at });
  botRows.push(rowOf(mv, botRows.length + 1, at));
  botGame.deadline = bc.turn() === botGame.color ? Date.now() + TURN_MS : null;   // ساعت فقط برای شما
  saveBot();
  refreshBot(true);
  syncBot();
  maybeThink();
  return true;
}

function askBot(botId, sans) {
  // ربات در یک رشته‌ی جدا فکر می‌کند؛ اگر مرورگر نتواند، در همین رشته
  if (worker === null) {
    try {
      worker = new Worker("./bot-worker.js", { type: "module" });
      worker.onmessage = (e) => { pending.get(e.data.id)?.(e.data); pending.delete(e.data.id); };
      worker.onerror = () => { worker = false; for (const f of pending.values()) f({ retry: true }); pending.clear(); };
    } catch { worker = false; }
  }
  if (worker) {
    return new Promise((resolve) => {
      const id = ++askSeq;
      pending.set(id, (d) => resolve(d.retry ? askBot(botId, sans) : d.move));
      worker.postMessage({ id, botId, sans, lite: LITE });
    });
  }
  return import("./bot-engine.js").then((m) => new Promise((r) => setTimeout(() => r(m.chooseMove(botId, sans, Math.random, { lite: LITE })), 30)));
}

function maybeThink() {
  if (!botGame || botOutcome() || bc.turn() === botGame.color) return;
  const token = botGame.id + ":" + botGame.moves.length;
  if (thinking === token) return;
  thinking = token;
  const sans = botGame.moves.map((m) => m.san);
  const pause = new Promise((r) => setTimeout(r, 650));   // حرکتِ آنی حسِ بدی دارد
  Promise.all([askBot(botGame.botId, sans), pause]).then(([mv]) => {
    if (!botGame || thinking !== token || botGame.id + ":" + botGame.moves.length !== token) return;
    thinking = null;
    if (mv) applyBotMove({ from: mv.from, to: mv.to, promotion: mv.promotion });
  }).catch(() => { thinking = null; });
}

let syncing = false, syncAgain = false;
async function syncBot() {
  if (!botGame) return;
  if (syncing) { syncAgain = true; return; }
  syncing = true;
  const g = botGame;
  const b = botById(g.botId);
  let ok = false;
  try {
    const res = await fetch("/api/bot-games/" + g.id, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pid, name: session.name, bot: { id: b.id, name: b.name }, color: g.color,
        startedAt: g.startedAt, moves: g.moves, resigned: g.resigned, timeout: !!g.timedOut,
      }),
    });
    ok = res.ok;
  } catch {}
  syncing = false;
  if (botGame === g && current === "table" && !gameId) {
    if (ok) setConn("ok", "روی سرور هم ذخیره شد");
    else setConn("", "آفلاین — ذخیره روی همین دستگاه");
  }
  if (syncAgain) { syncAgain = false; syncBot(); }
}
addEventListener("online", () => syncBot());

function downloadBotFile() {
  const b = botById(botGame.botId);
  const human = session.name || "Human player";
  const botName = `ربات: ${b.name}`;
  const text = formatGame({
    id: botGame.id,
    white: botGame.color === "w" ? human : botName,
    black: botGame.color === "b" ? human : botName,
    me: botGame.color,
    status: S.status, result: S.result, reason: S.reason,
    createdAt: botGame.startedAt,
    updatedAt: botRows.length ? botRows[botRows.length - 1].at : botGame.startedAt,
    notes: [
      `The opponent is a computer character: ${b.id} (level ${b.level} of 10). Its playing style: ${b.title} — ${b.tricks.join("، ")}`,
      `Take-backs used by the human during this game: ${botGame.undos || 0} (taken-back moves are not in the record)`,
    ],
    moves: botRows,
  });
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `chess-game-${botGame.id}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ───────────── بازیِ آنلاین: اتصال ───────────── */

let S = null;          // وضعیتِ بازی که نمایش داده می‌شود
let sel = null;        // خانه‌ی انتخاب‌شده
let pendingPromo = null;
let ws = null;
let retry = 0;
let pingTimer = null;
let gone = false;

const canMove = () => S && S.status === "active" && (S.you === "both" || S.you === S.turn);

function setConn(kind, text) {
  const el = $("#conn");
  el.hidden = false;
  el.className = "conn " + kind;
  el.textContent = text;
}

function connect() {
  setConn("", "در حال اتصال…");
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(API ? API.replace("https", "wss") + `/api/games/${gameId}/ws` : `${proto}://${location.host}/api/games/${gameId}/ws`);

  ws.onopen = () => {
    retry = 0;
    $("#chat-list").textContent = "";
    ws.send(JSON.stringify({ type: "hello", pid, name: session.name }));
    clearInterval(pingTimer);
    pingTimer = setInterval(() => { if (ws.readyState === 1) ws.send("ping"); }, 25000);
  };

  ws.onmessage = (e) => {
    if (e.data === "pong") return;
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.type === "state") onState(msg);
    else if (msg.type === "chat") addChat(msg);
    else if (msg.type === "note") toast("حریف با برگشت موافقت نکرد.");
    else if (msg.type === "error") {
      if (msg.code === "not_found") { gone = true; show("lost"); }
      else if (msg.code === "save_failed") setConn("bad", "حرکت ذخیره نشد؛ دوباره بازی کنید");
    }
  };

  ws.onclose = () => {
    clearInterval(pingTimer);
    if (gone) return;
    setConn("bad", "اتصال قطع شد، تلاش دوباره…");
    setTimeout(connect, Math.min(8000, 600 * 2 ** retry++));
  };
}

function onState(next) {
  const prev = S;
  S = next;
  if (current !== "table") show("table");
  setConn("ok", "متصل");
  const grew = prev && next.moves.length === prev.moves.length + 1;
  if (!prev || next.moves.length !== prev.moves.length) { sel = null; closePromo(); }
  render(grew);
}

/* ───────────── نمایشِ بازی ───────────── */

function render(animate) {
  renderHeadline();
  renderBoard(animate);
  renderPlayers();
  renderSaved();
  renderActions();
  wantHint();
  clockEnd = S.left != null ? performance.now() + S.left : null;
  paintClock();
}

// ساعت: هر حرکت یک دقیقه. در بازیِ آنلاین سرور داور است؛ در بازی با ربات همین‌جا حساب می‌شود
const TURN_MS = 60000;
let clockEnd = null;
function paintClock() {
  if (!S) return;
  const left = clockEnd == null || S.status !== "active" ? null : Math.max(0, clockEnd - performance.now());
  for (const c of ["w", "b"]) {
    const el = document.querySelector(`#player-${c} .clock`);
    const on = left != null && S.turn === c;
    const secs = on ? Math.ceil(left / 1000) : 0;
    const txt = on ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}` : "";
    if (el.textContent !== txt) el.textContent = txt;
    el.classList.toggle("low", on && secs <= 10);
  }
  if (left === 0 && S.mode === "bot" && S.turn === S.you && botGame && !botGame.timedOut) {
    botGame.timedOut = true;
    thinking = null;
    saveBot();
    refreshBot(false);
    syncBot();
  }
}
setInterval(() => { if (current === "table") paintClock(); }, 250);

// Stockfish: قوی‌ترین موتورِ شطرنجِ متن‌باز، در یک رشته‌ی جدا. فقط برای سرنخ استفاده می‌شود
// و اولین بار که لازم شود بار می‌شود (حدود ۱٫۹ مگابایت، بعد از آن از حافظه‌ی مرورگر).
let sf = null;            // null: هنوز بار نشده | false: در این مرورگر کار نمی‌کند
let sfReady = null;
let sfJob = null;         // درخواستِ در جریان
let sfSkip = 0;           // جواب‌هایی که مالِ درخواست‌های لغوشده‌اند
function askStockfish(moves) {
  if (sf === false) return Promise.reject(new Error("no stockfish"));
  if (!sf) {
    sfReady = new Promise((ready, fail) => {
      try { sf = new Worker("./vendor/stockfish/stockfish-19-lite-single.js"); }
      catch (err) { sf = false; return fail(err); }
      const dead = (err) => { sf = false; fail(err); sfJob?.reject(err); sfJob = null; };
      sf.onerror = dead;
      const boot = setTimeout(() => dead(new Error("stockfish timeout")), 20000);
      sf.onmessage = (e) => {
        const line = String(e.data);
        if (line === "uciok") sf.postMessage("isready");
        else if (line === "readyok") { clearTimeout(boot); ready(); }
        else if (line.startsWith("bestmove")) {
          if (sfSkip > 0) return void sfSkip--;
          const m = line.split(" ")[1] || "";
          const job = sfJob;
          sfJob = null;
          job?.resolve(/^[a-h][1-8][a-h][1-8]/.test(m)
            ? { from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] || undefined } : null);
        }
      };
      sf.postMessage("uci");
    });
  }
  return sfReady.then(() => new Promise((resolve, reject) => {
    if (sfJob) { sf.postMessage("stop"); sfSkip++; sfJob.reject(new Error("superseded")); }   // سرنخِ قبلی دیگر لازم نیست
    sfJob = { resolve, reject };
    const uci = moves.map((m) => m.from + m.to + (m.promotion || "")).join(" ");
    sf.postMessage((S?.start ? "position fen " + S.start : "position startpos") + (uci ? " moves " + uci : ""));
    sf.postMessage("go movetime " + (LITE ? 700 : 1500));
  }));
}

// بهترین حرکت برای کسی که نوبتش است، با همان موتورِ ربات حساب می‌شود
let hint = null, hintKey = null;
function wantHint() {
  if (!S || !canMove()) return;
  const key = S.id + ":" + S.moves.length;
  if (hintKey === key) return;
  hintKey = key;
  hint = null;
  const settle = new Promise((r) => setTimeout(r, 700));   // تا حرکتِ مهره روی صفحه تمام شود
  // اول Stockfish؛ اگر بار نشد یا جواب نداد، موتورِ ساده‌ی خودمان
  const moves = S.moves;
  // موتورِ ساده فقط چیدمانِ معمولی را می‌شناسد
  const best = askStockfish(moves).catch(() => (S.start ? null : askBot("hint", moves.map((m) => m.san))));
  Promise.all([best, settle]).then(([mv]) => {
    if (hintKey !== key || !mv) return;
    hint = mv;
    if (current === "table" && !pendingPromo) renderBoard(false);
  }).catch(() => {});
}

function renderHeadline() {
  let h, sub = "";
  const win = S.result === "white" ? "سفید" : "سیاه";
  const lose = S.result === "white" ? "سیاه" : "سفید";
  if (S.status === "over") {
    h = {
      checkmate: `مات — <em>${win}</em> برد`,
      resign: `${lose} تسلیم شد — <em>${win}</em> برد`,
      timeout: `وقت ${lose} تمام شد — <em>${win}</em> برد`,
      stalemate: "پات — مساوی",
      repetition: "تکرار سه‌باره — مساوی",
      insufficient: "مهره‌ی کافی نمانده — مساوی",
      fifty: "قانون ۵۰ حرکت — مساوی",
    }[S.reason] || "بازی تمام شد";
    sub = "می‌توانید فایل حرکت‌ها را دانلود کنید و برای تحلیل بفرستید.";
  } else if (S.status === "waiting") {
    h = "منتظر بازیکن دوم";
    sub = "با آمدن او بازی شروع می‌شود.";
  } else {
    const mine = S.you === "w" || S.you === "b";
    if (S.mode === "bot" && S.turn !== S.you) h = `<em>${S.bot.name}</em> فکر می‌کند…`;
    else h = mine ? (S.turn === S.you ? "نوبت <em>شماست</em>" : "نوبت حریف است") : `نوبت <em>${SIDE[S.turn]}</em>`;
    if (S.check) { h += ' — <em class="alert">کیش</em>'; sub = "شاه در خطر است."; }
  }
  $("#headline").innerHTML = h;
  $("#subline").textContent = sub;
}

// خانه‌ها و مهره‌ها یک بار ساخته می‌شوند و می‌مانند. هر بار فقط کلاس‌ها و مهره‌هایی که
// واقعاً عوض شده‌اند دست می‌خورند؛ ساختنِ دوباره‌ی ۶۴ خانه با هر لمس، گوشی‌های ضعیف را کند می‌کرد.
const perf = { render: 0 };
let boardFlip = null;
const cells = new Map();   // خانه → { el, base, cls, key, piece, rankEl, fileEl, rank, file, moving }

function buildBoard(flip) {
  const board = $("#board");
  board.textContent = "";
  cells.clear();
  for (let r = 0; r < 8; r++) {
    for (let col = 0; col < 8; col++) {
      const fi = flip ? 7 - col : col;
      const rank = flip ? r + 1 : 8 - r;
      const sq = FILES[fi] + rank;
      const el = document.createElement("button");
      el.type = "button";
      el.dataset.sq = sq;
      const cell = {
        el, base: "sq" + ((fi + rank) % 2 === 1 ? " d" : ""), cls: "", key: null, piece: null,
        rankEl: null, fileEl: null, rank: String(rank), file: FILES[fi], moving: false,
      };
      if (col === 0) {
        cell.rankEl = document.createElement("span");
        cell.rankEl.textContent = rank;
        el.appendChild(cell.rankEl);
      }
      if (r === 7) {
        cell.fileEl = document.createElement("span");
        cell.fileEl.textContent = FILES[fi];
        el.appendChild(cell.fileEl);
      }
      board.appendChild(el);
      cells.set(sq, cell);
    }
  }
  boardFlip = flip;
}

function renderBoard(animate) {
  const t0 = performance.now();
  const flip = S.you === "b";
  if (boardFlip !== flip || !cells.size) buildBoard(flip);
  const pos = parseFen(S.fen || START);
  const last = S.moves[S.moves.length - 1] || null;
  const movable = new Set(canMove() ? S.legal.map((m) => m.from) : []);
  const targets = new Set(sel ? S.legal.filter((m) => m.from === sel).map((m) => m.to) : []);

  const tip = hint && hintKey === S.id + ":" + S.moves.length && canMove() ? hint : null;
  // سرنخِ حرف و عدد: اول ردیف و ستونِ مهره؛ بعد از انتخابِ همان مهره، ردیف و ستونِ مقصد
  const mark = tip ? (sel === tip.from ? { sq: tip.to, cls: " dim2" } : { sq: tip.from, cls: " dim" }) : null;

  let kingSq = null;
  if (S.check) for (const s in pos) if (pos[s].t === "k" && pos[s].c === S.turn) kingSq = s;

  for (const [sq, cell] of cells) {
    const p = pos[sq];
    let cls = cell.base;
    if (last && (sq === last.from || sq === last.to)) cls += " last";
    if (sq === sel) cls += " sel";
    if (sq === kingSq) cls += " chk";
    if (movable.has(sq)) cls += " can";
    if (targets.has(sq)) cls += p ? " opt occ" : " opt";
    // سرنخِ پنهان: سایه‌ی مهره‌ی بهترین حرکت و نورِ نقطه‌ی مقصدش فرق دارد
    if (tip && sq === tip.from) cls += " hint-from";
    if (tip && sq === tip.to && sel === tip.from) cls += " hint-to";
    if (cell.moving) cls += " moving";
    if (cls !== cell.cls) { cell.el.className = cls; cell.cls = cls; }

    const key = p ? p.c + p.t : "";
    if (key !== cell.key) {
      cell.key = key;
      if (cell.piece) { cell.piece.remove(); cell.piece = null; }
      if (p) {
        cell.piece = document.createElement("span");
        cell.piece.className = "piece";
        cell.piece.innerHTML = pieceSVG(p.t, p.c);
        cell.el.appendChild(cell.piece);
      }
      cell.el.setAttribute("aria-label", sq + (p ? `، ${PIECE[p.t]} ${SIDE[p.c]}` : "، خالی"));
    }

    if (cell.rankEl) {
      const k = "coord rank" + (mark && mark.sq[1] === cell.rank ? mark.cls : "");
      if (cell.rankEl.className !== k) cell.rankEl.className = k;
    }
    if (cell.fileEl) {
      const k = "coord file" + (mark && mark.sq[0] === cell.file ? mark.cls : "");
      if (cell.fileEl.className !== k) cell.fileEl.className = k;
    }
  }

  if (animate && last) { slide(last, flip); voice(last); }
  perf.render = performance.now() - t0;
}

// صدا: مات، کیش، یا زدنِ مهره
const VOICES = {};
function voice(m) {
  const k = m.san?.endsWith("#") ? "mate" : m.san?.endsWith("+") ? "check" : m.captured || m.san?.includes("x") ? "capture" : null;
  if (!k) return;
  const a = VOICES[k] ||= new Audio("./sounds/" + k + ".ogg");
  a.currentTime = 0;
  a.play().catch(() => {});
}

// مهره به خانه‌ی تازه می‌لغزد؛ مهره‌ی گرفته‌شده در خودش فرو می‌رود
function slide(m, flip) {
  const cell = cells.get(m.to);
  const el = cell?.el;
  const piece = cell?.piece;
  if (!piece) return;

  if (m.captured) {
    const sq = m.flags.includes("e") ? m.to[0] + m.from[1] : m.to;
    const host = $(`#board [data-sq="${sq}"]`);
    const ghost = document.createElement("span");
    ghost.className = "piece vanish";
    ghost.innerHTML = pieceSVG(m.captured, m.color === "w" ? "b" : "w");
    host.appendChild(ghost);
    setTimeout(() => ghost.remove(), 600);
    // نوشته‌ی متحرکِ لحظه‌ی زدنِ مهره
    const zing = document.createElement("span");
    zing.className = "zing";
    zing.textContent = "سیییگ";
    host.appendChild(zing);
    setTimeout(() => zing.remove(), 1000);
  }

  const col = (s) => (flip ? 7 - FILES.indexOf(s[0]) : FILES.indexOf(s[0]));
  const row = (s) => (flip ? +s[1] - 1 : 8 - +s[1]);
  piece.style.transform = `translate(${(col(m.from) - col(m.to)) * 100}%, ${(row(m.from) - row(m.to)) * 100}%)`;
  void piece.offsetWidth;
  cell.moving = true;
  el.classList.add("moving");
  cell.cls = el.className;
  piece.style.transform = "";
  setTimeout(() => { cell.moving = false; el.classList.remove("moving"); cell.cls = el.className; }, 460);
}

function renderPlayers() {
  for (const c of ["w", "b"]) {
    const row = $("#player-" + c);
    const p = S.players[c];
    row.classList.toggle("turn", S.status === "active" && S.turn === c);
    row.querySelector(".pname").textContent = p.name || (p.seated ? "بدون نام" : "");
    const pr = row.querySelector(".presence");
    pr.textContent = p.bot ? "ربات" : !p.seated ? "خالی" : p.online ? "آنلاین" : "آفلاین";
    pr.classList.toggle("here", !p.bot && p.seated && p.online);
  }
  const role = { w: "شما سفید هستید.", b: "شما سیاه هستید.", both: "هر دو رنگ را شما بازی می‌کنید." }[S.you] || "شما تماشاگر هستید.";
  $("#role").textContent = role + (S.watchers ? ` تماشاگر: ${S.watchers}` : "");

  const waiting = S.status === "waiting" && !!S.you;
  $("#invite").hidden = !waiting;
  if (waiting) $("#invite-link").value = `${HOME}?g=${S.id}`;
}

function renderSaved() {
  const n = S.moves.length;
  $("#saved-count").textContent = n ? `${n} حرکت ذخیره شد` : "هنوز حرکتی نیست";
  $("#saved-count").classList.toggle("ok", n > 0);
  const dl = $("#download");
  if (S.mode === "bot") {
    dl.href = "#";
    dl.removeAttribute("download");
  } else {
    const as = S.you === "w" || S.you === "b" ? `?as=${S.you}` : "";
    dl.href = API + `/api/games/${S.id}/export${as}`;
    dl.setAttribute("download", `chess-game-${S.id}.md`);
  }
  dl.classList.toggle("primary", S.status === "over");
  dl.classList.toggle("ghost", S.status !== "over");
  dl.toggleAttribute("aria-disabled", n === 0);
}

function renderActions() {
  const playing = S.status === "active" && !!S.you;
  if (!playing) { $("#resign-confirm").hidden = true; $("#resign").hidden = true; }
  else if ($("#resign-confirm").hidden) $("#resign").hidden = false;
  $("#again").hidden = S.status !== "over";

  // برگشت: در بازی با ربات و بازیِ روی یک دستگاه
  const undo = $("#undo");
  // در بازیِ آنلاین، برگشت فقط با رضایتِ حریف انجام می‌شود
  const seated = S.mode === "duo" && (S.you === "w" || S.you === "b");
  const duo = seated && S.status === "active";
  const allowed = duo || ((S.mode === "bot" || (S.mode === "solo" && S.you === "both")) && S.reason !== "resign");
  undo.hidden = !allowed;
  undo.disabled = !allowed || (duo
    ? !!S.undoReq || !S.moves.some((m) => m.color === S.you)
    : !(S.mode === "bot" ? canUndoBot() : S.moves.length));
  undo.textContent = duo ? (S.undoReq === S.you ? "منتظر جواب حریف…" : "درخواست برگشت") : "برگشت یک حرکت";
  $("#undo-ask").hidden = !(duo && S.undoReq && S.undoReq !== S.you);
  $("#chat-open").hidden = !seated;
}

// در بازی با ربات، برگشت یعنی حرکتِ آخرِ خودتان (و جوابِ ربات به آن) پاک شود
const canUndoBot = () =>
  !!botGame && !botGame.resigned && !botGame.timedOut && botRows.some((m) => m.color === botGame.color);

function undoBot() {
  if (!canUndoBot()) return;
  thinking = null;                                   // اگر ربات وسطِ فکر است، جوابش دور ریخته می‌شود
  do { botGame.moves.pop(); } while (botGame.moves.length % 2 !== (botGame.color === "w" ? 0 : 1));
  botGame.undos = (botGame.undos || 0) + 1;
  rebuildBot();
  botGame.deadline = Date.now() + TURN_MS;
  saveBot();
  sel = null;
  closePromo();
  refreshBot(false);
  syncBot();
  maybeThink();
}

/* ───────────── کنش‌ها روی صفحه ───────────── */

function sendMove(from, to, promotion) {
  sel = null;
  if (S.mode === "bot") {
    if (!applyBotMove(promotion ? { from, to, promotion } : { from, to })) renderBoard(false);
    return;
  }
  if (ws?.readyState !== 1) return setConn("bad", "اتصال برقرار نیست");
  ws.send(JSON.stringify({ type: "move", from, to, promotion }));
  renderBoard(false);
}

function openPromo(from, to) {
  pendingPromo = { from, to };
  const box = $("#promo-options");
  box.textContent = "";
  for (const t of ["q", "r", "b", "n"]) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.t = t;
    b.setAttribute("aria-label", PIECE[t]);
    b.innerHTML = `<span class="piece">${pieceSVG(t, S.turn)}</span>`;
    box.appendChild(b);
  }
  $("#promo").hidden = false;
  box.firstChild.focus();
}

function closePromo() {
  pendingPromo = null;
  $("#promo").hidden = true;
}

function onSquare(sq) {
  if (!canMove()) return;
  if (sel) {
    const opts = S.legal.filter((m) => m.from === sel && m.to === sq);
    if (opts.length) {
      if (opts.some((m) => m.promotion)) return openPromo(sel, sq);
      return sendMove(sel, sq);
    }
  }
  sel = sq !== sel && S.legal.some((m) => m.from === sq) ? sq : null;
  renderBoard(false);
}

let unread = 0;
function addChat(m) {
  const el = document.createElement("p");
  if (m.from === S?.you) el.className = "me";
  el.textContent = m.text;
  const list = $("#chat-list");
  list.appendChild(el);
  list.scrollTop = 1e6;
  if ($("#chat").hidden && m.from !== S?.you) {
    $("#chat-badge").textContent = ++unread;
    $("#chat-badge").hidden = false;
  }
}

function toast(text) {
  const t = $("#toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 4000);
}

function initTable() {
  const reply = (ok) => {
    $("#undo-ask").hidden = true;
    if (ws?.readyState === 1) ws.send(JSON.stringify({ type: "undo_reply", ok }));
  };
  $("#undo-yes").addEventListener("click", () => reply(true));
  $("#undo-no").addEventListener("click", () => reply(false));
  $("#chat-open").addEventListener("click", () => {
    const box = $("#chat");
    box.hidden = !box.hidden;
    if (box.hidden) return;
    unread = 0;
    $("#chat-badge").hidden = true;
    $("#chat-list").scrollTop = 1e6;
    $("#chat-input").focus();
  });
  $("#chat-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = $("#chat-input").value.trim();
    if (!text || ws?.readyState !== 1) return;
    ws.send(JSON.stringify({ type: "chat", text }));
    $("#chat-input").value = "";
  });

  $("#board").addEventListener("click", (e) => {
    const el = e.target.closest(".sq");
    if (el) onSquare(el.dataset.sq);
  });
  $("#promo-options").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || !pendingPromo) return;
    const { from, to } = pendingPromo;
    closePromo();
    sendMove(from, to, b.dataset.t);
  });
  $("#promo-cancel").addEventListener("click", () => { closePromo(); sel = null; renderBoard(false); });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !S || current !== "table") return;
    sel = null; closePromo(); renderBoard(false);
  });

  $("#download").addEventListener("click", (e) => {
    if (e.currentTarget.hasAttribute("aria-disabled")) return e.preventDefault();
    if (S?.mode === "bot") { e.preventDefault(); downloadBotFile(); }
  });

  $("#copy").addEventListener("click", async () => {
    const input = $("#invite-link");
    try { await navigator.clipboard.writeText(input.value); }
    catch { input.select(); document.execCommand("copy"); }
    $("#copy").textContent = "کپی شد";
    setTimeout(() => ($("#copy").textContent = "کپی"), 1600);
  });

  $("#undo").addEventListener("click", () => {
    if (S?.mode === "bot") undoBot();
    else if (ws?.readyState === 1) ws.send(JSON.stringify({ type: "undo" }));
  });

  $("#resign").addEventListener("click", () => {
    $("#resign").hidden = true;
    $("#resign-confirm").hidden = false;
  });
  $("#resign-no").addEventListener("click", () => {
    $("#resign-confirm").hidden = true;
    $("#resign").hidden = false;
  });
  $("#resign-yes").addEventListener("click", () => {
    $("#resign-confirm").hidden = true;
    if (S?.mode === "bot") {
      botGame.resigned = true;
      thinking = null;
      saveBot();
      refreshBot(false);
      syncBot();
    } else if (ws?.readyState === 1) ws.send(JSON.stringify({ type: "resign" }));
  });
}

/* ───────────── شروع ───────────── */

// با افزودنِ perf=1 به نشانی، سرعتِ واقعی روی همان دستگاه دیده می‌شود
if (new URLSearchParams(location.search).has("perf")) {
  const box = document.createElement("div");
  box.className = "perf";
  document.body.appendChild(box);
  let frames = 0, worst = 0, prev = performance.now(), since = prev, long = 0;
  try { new PerformanceObserver((l) => (long += l.getEntries().length)).observe({ entryTypes: ["longtask"] }); } catch {}
  const tick = (t) => {
    frames++;
    worst = Math.max(worst, t - prev);
    prev = t;
    if (t - since >= 1000) {
      box.textContent = `${Math.round((frames * 1000) / (t - since))} fps | worst ${Math.round(worst)}ms | board ${perf.render.toFixed(1)}ms | long ${long}${LITE ? " | lite" : ""}`;
      frames = 0; worst = 0; since = t;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

initCosmos();
initAuth();
initMenu();
initTable();

if (gameId) {
  if (/^[a-z0-9]{6,16}$/.test(gameId)) { show("table"); connect(); }
  else show("lost");
} else {
  addEventListener("hashchange", route);
  route();
}

// کش برای کار کردن بدونِ اینترنت
if ("serviceWorker" in navigator) {
  // وقتی نسخه‌ی تازه‌ی بازی برسد، صفحه یک بار خودش تازه می‌شود (وضعیتِ بازی ذخیره است)
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadController) location.reload(); });
  // نسخه‌ی تازه خودش نصب نمی‌شود؛ دکمه نشان می‌دهیم و با زدنِ کاربر فعال می‌شود
  const offer = (reg) => {
    if (!reg.waiting || !navigator.serviceWorker.controller) return;
    $("#update-ask").hidden = false;
    $("#update-go").onclick = () => {
      $("#update-go").disabled = true;
      reg.waiting?.postMessage("skip");
      setTimeout(() => location.reload(), 3000);
    };
  };
  addEventListener("load", () => navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).then((reg) => {
    offer(reg);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      if (w) w.addEventListener("statechange", () => { if (w.state === "installed") offer(reg); });
    });
    reg.update().catch(() => {});
    document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(() => {}));
}
