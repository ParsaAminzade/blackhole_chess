import { DurableObject } from "cloudflare:workers";
import { Chess } from "chess.js";
import { formatGame } from "../public/export-format.js";
import { BOTS } from "../public/bots.js";

/* ───────────── پایگاه‌داده ───────────── */

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS games (
     id TEXT PRIMARY KEY,
     mode TEXT NOT NULL,
     white_id TEXT, white_name TEXT,
     black_id TEXT, black_name TEXT,
     status TEXT NOT NULL DEFAULT 'waiting',
     result TEXT, reason TEXT,
     created_at TEXT NOT NULL, updated_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS moves (
     game_id TEXT NOT NULL,
     ply INTEGER NOT NULL,
     color TEXT NOT NULL,
     player_id TEXT NOT NULL,
     player_name TEXT,
     san TEXT NOT NULL,
     from_sq TEXT NOT NULL,
     to_sq TEXT NOT NULL,
     piece TEXT NOT NULL,
     captured TEXT,
     promotion TEXT,
     flags TEXT,
     fen_after TEXT NOT NULL,
     created_at TEXT NOT NULL,
     PRIMARY KEY (game_id, ply)
   )`,
  `CREATE TABLE IF NOT EXISTS users (
     id TEXT PRIMARY KEY,
     username TEXT NOT NULL UNIQUE,
     display TEXT NOT NULL,
     pass_hash TEXT NOT NULL,
     salt TEXT NOT NULL,
     pid TEXT NOT NULL UNIQUE,
     created_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS sessions (
     token_hash TEXT PRIMARY KEY,
     user_id TEXT NOT NULL,
     created_at TEXT NOT NULL,
     expires_at TEXT NOT NULL
   )`,
];

let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch(SCHEMA.map((s) => db.prepare(s.replace(/\s+/g, " "))));
  // ستونِ چیدمانِ شروع، برای پایگاه‌داده‌ای که قبل از این قابلیت ساخته شده
  try { await db.prepare("ALTER TABLE games ADD COLUMN start_fen TEXT").run(); } catch {}
  schemaReady = true;
}

/* ───────────── ابزارها ───────────── */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const PID_RE = /^[A-Za-z0-9-]{16,64}$/;
const SQ_RE = /^[a-h][1-8]$/;
const cleanName = (n) =>
  String(n ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 24);
const now = () => new Date().toISOString();

function newId() {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => abc[b % abc.length]).join("");
}

/* ───────────── ورودی Worker ───────────── */

export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);
    try {
      if (pathname === "/api/games" && req.method === "POST") return createGame(req, env);
      if (pathname === "/api/profile" && req.method === "POST") return profile(req, env);
      if (pathname === "/api/my-games" && req.method === "POST") return myGames(req, env);

      const auth = pathname.match(/^\/api\/auth\/(register|login|logout|me)$/);
      if (auth) return handleAuth(auth[1], req, env);
      const bg = pathname.match(/^\/api\/bot-games\/(b[a-z0-9]{9})$/);
      if (bg && req.method === "PUT") return syncBotGame(bg[1], req, env);

      const m = pathname.match(/^\/api\/games\/([a-z0-9]{6,16})(\/ws|\/export)?$/);
      if (m && m[2] === "/export" && req.method === "GET") {
        return exportForAnalysis(m[1], new URL(req.url).searchParams.get("as"), env);
      }
      if (m && m[2]) {
        if (req.headers.get("Upgrade") !== "websocket") return json({ error: "expected_websocket" }, 426);
        return env.GAME.get(env.GAME.idFromName(m[1])).fetch(req);
      }
      if (m && req.method === "GET") return exportGame(m[1], env);

      return json({ error: "not_found" }, 404);
    } catch (err) {
      console.error(err);
      return json({ error: "server_error" }, 500);
    }
  },
};

async function createGame(req, env) {
  let body;
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const pid = String(body.pid ?? "");
  if (!PID_RE.test(pid)) return json({ error: "bad_player" }, 400);
  const mode = body.mode === "solo" ? "solo" : "duo";
  const side = body.side === "black" ? "black" : "white";
  const name = cleanName(body.name);
  const name2 = cleanName(body.name2);

  await ensureSchema(env.DB);
  const id = newId();
  const t = now();
  const solo = mode === "solo";
  await env.DB.prepare(
    `INSERT INTO games (id, mode, white_id, white_name, black_id, black_name, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, mode,
    solo || side === "white" ? pid : null, solo || side === "white" ? name : null,
    solo || side === "black" ? pid : null, solo ? name2 || name : side === "black" ? name : null,
    solo ? "active" : "waiting", t, t
  ).run();
  // چیدمانِ تصادفی (شطرنجِ ۹۶۰، بدونِ قلعه): حفظیاتِ شروعِ بازی به کار نمی‌آید
  if (body.random === true && mode === "duo") {
    await env.DB.prepare("UPDATE games SET start_fen = ? WHERE id = ?").bind(randomStart(), id).run();
  }
  return json({ id });
}

function randomStart() {
  const row = Array(8).fill(null);
  const pick = (list) => list[crypto.getRandomValues(new Uint8Array(1))[0] % list.length];
  const free = () => row.map((p, i) => (p ? -1 : i)).filter((i) => i >= 0);
  row[pick([0, 2, 4, 6])] = "b";          // دو فیل روی دو رنگِ مختلف
  row[pick([1, 3, 5, 7])] = "b";
  row[pick(free())] = "q";
  row[pick(free())] = "n";
  row[pick(free())] = "n";
  const [a, k, h] = free();               // شاه بینِ دو رخ
  row[a] = "r"; row[k] = "k"; row[h] = "r";
  const back = row.join("");
  return `${back}/pppppppp/8/8/8/8/PPPPPPPP/${back.toUpperCase()} w - - 0 1`;
}

// بازی‌های نیمه‌تمامِ یک بازیکن، برای منو
async function myGames(req, env) {
  let body;
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const pid = String(body.pid ?? "");
  if (!PID_RE.test(pid)) return json({ error: "bad_player" }, 400);
  await ensureSchema(env.DB);
  const { results } = await env.DB.prepare(
    `SELECT g.id, g.mode, g.status, g.white_id, g.black_id, g.white_name, g.black_name, g.created_at, g.updated_at,
            (SELECT COUNT(*) FROM moves m WHERE m.game_id = g.id) AS n
     FROM games g
     WHERE g.status != 'over' AND (g.white_id = ? OR g.black_id = ?)
     ORDER BY g.updated_at DESC LIMIT 30`
  ).bind(pid, pid).all();
  const games = results
    .filter((g) => g.n > 0 || g.mode === "duo")
    .slice(0, 12)
    .map((g) => {
      const white = g.white_id === pid;
      const otherId = String((white ? g.black_id : g.white_id) || "");
      return {
        id: g.id, mode: g.mode, status: g.status, moves: g.n,
        color: g.mode === "solo" ? "both" : white ? "w" : "b",
        opponent: (white ? g.black_name : g.white_name) || "",
        botId: otherId.startsWith("bot:") ? otherId.slice(4) : null,
        startedAt: g.created_at, updatedAt: g.updated_at,
      };
    });
  return json({ games });
}

// پروفایل و سطح: از بازی‌های تمام‌شده‌ی همین بازیکن حساب می‌شود
// برد از ربات: ۲۰ + ۱۰×سطحِ ربات | برد آنلاین: ۶۰ | مساوی: ۱۵ | باخت: ۵
async function profile(req, env) {
  let body;
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const pid = String(body.pid ?? "");
  if (!PID_RE.test(pid)) return json({ error: "bad_player" }, 400);
  await ensureSchema(env.DB);
  const { results } = await env.DB.prepare(
    "SELECT mode, white_id, black_id, result FROM games WHERE status = 'over' AND mode != 'solo' AND (white_id = ? OR black_id = ?)"
  ).bind(pid, pid).all();
  const s = { games: 0, wins: 0, draws: 0, losses: 0, xp: 0 };
  for (const g of results) {
    const mine = g.white_id === pid ? "white" : "black";
    const other = String(mine === "white" ? g.black_id : g.white_id);
    s.games++;
    if (g.result === "draw") { s.draws++; s.xp += 15; }
    else if (g.result === mine) {
      s.wins++;
      s.xp += g.mode === "bot" ? 20 + 10 * (BOTS.find((b) => "bot:" + b.id === other)?.level || 1) : 60;
    } else { s.losses++; s.xp += 5; }
  }
  // سطحِ n از (n-1)² × ۵۰ امتیاز شروع می‌شود
  const level = Math.floor(Math.sqrt(s.xp / 50)) + 1;
  return json({ ...s, level, floor: (level - 1) ** 2 * 50, next: level ** 2 * 50 });
}

// خروجیِ کامل یک بازی: /api/games/<id>  (شناسه‌ی خصوصی بازیکن‌ها بیرون داده نمی‌شود)
async function exportGame(id, env) {
  await ensureSchema(env.DB);
  const game = await env.DB.prepare(
    `SELECT id, mode, white_name, black_name, status, result, reason, created_at, updated_at
     FROM games WHERE id = ?`
  ).bind(id).first();
  if (!game) return json({ error: "not_found" }, 404);
  const { results } = await env.DB.prepare(
    `SELECT ply, color, player_name, san, from_sq, to_sq, piece, captured, promotion, flags, fen_after, created_at
     FROM moves WHERE game_id = ? ORDER BY ply`
  ).bind(id).all();
  return json({ game, moves: results });
}

// فایلِ بازی برای تحلیل: /api/games/<id>/export
async function exportForAnalysis(id, as, env) {
  await ensureSchema(env.DB);
  const game = await env.DB.prepare("SELECT * FROM games WHERE id = ?").bind(id).first();
  if (!game) return json({ error: "not_found" }, 404);
  const { results } = await env.DB.prepare(
    "SELECT * FROM moves WHERE game_id = ? ORDER BY ply"
  ).bind(id).all();

  const text = formatGame({
    id,
    white: game.white_name, black: game.black_name,
    me: as === "w" || as === "b" ? as : null,
    startFen: game.start_fen || null,
    status: game.status, result: game.result, reason: game.reason,
    createdAt: game.created_at, updatedAt: game.updated_at,
    notes: game.mode === "bot" ? ["One side is a computer character (its name starts with «ربات»)"] : [],
    moves: results.map((r) => ({
      ply: r.ply, color: r.color, san: r.san, from: r.from_sq, to: r.to_sq, piece: r.piece,
      captured: r.captured, promotion: r.promotion, flags: r.flags, fen: r.fen_after, at: r.created_at,
    })),
  });
  return new Response(text, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="chess-game-${id}.md"`,
      "cache-control": "no-store",
    },
  });
}

/* ───────────── حساب کاربری ───────────── */

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const randomHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha256 = async (s) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
const USER_RE = /^[A-Za-z0-9_؀-ۿ‌]{3,20}$/;
const SESSION_DAYS = 30;
const TURN_MS = 60000;   // وقتِ هر حرکت

async function hashPassword(password, saltHex) {
  const salt = Uint8Array.from(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, key, 256
  ));
}

function sameString(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const sessionCookie = (token, maxAge) =>
  `eh_s=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

function readCookie(req) {
  const m = (req.headers.get("Cookie") || "").match(/(?:^|;\s*)eh_s=([a-f0-9]{64})/);
  return m ? m[1] : null;
}

async function openSession(env, user) {
  const token = randomHex(32);
  const t = Date.now();
  await env.DB.prepare(
    "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)"
  ).bind(await sha256(token), user.id, new Date(t).toISOString(),
         new Date(t + SESSION_DAYS * 864e5).toISOString()).run();
  const res = json({ username: user.display, pid: user.pid });
  res.headers.set("Set-Cookie", sessionCookie(token, SESSION_DAYS * 86400));
  return res;
}

async function handleAuth(action, req, env) {
  await ensureSchema(env.DB);

  if (action === "me" && req.method === "GET") {
    const token = readCookie(req);
    if (!token) return json({ error: "signed_out" }, 401);
    const user = await env.DB.prepare(
      `SELECT u.display, u.pid FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`
    ).bind(await sha256(token), now()).first();
    if (!user) return json({ error: "signed_out" }, 401);
    return json({ username: user.display, pid: user.pid });
  }

  if (req.method !== "POST") return json({ error: "not_found" }, 404);

  if (action === "logout") {
    const token = readCookie(req);
    if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
    const res = json({ ok: true });
    res.headers.set("Set-Cookie", sessionCookie("", 0));
    return res;
  }

  let body;
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const display = String(body.username ?? "").trim();
  const password = String(body.password ?? "");
  if (!USER_RE.test(display)) return json({ error: "bad_username" }, 400);
  if (password.length < 8 || password.length > 200) return json({ error: "bad_password" }, 400);
  const username = display.toLowerCase();

  if (action === "register") {
    // اگر مهمان قبلاً بازی کرده، همان شناسه‌ی بازیکن به حسابش می‌چسبد
    let pid = String(body.pid ?? "");
    if (!PID_RE.test(pid) ||
        (await env.DB.prepare("SELECT 1 FROM users WHERE pid = ?").bind(pid).first())) {
      pid = crypto.randomUUID();
    }
    const salt = randomHex(16);
    const user = { id: crypto.randomUUID(), display, pid };
    try {
      await env.DB.prepare(
        `INSERT INTO users (id, username, display, pass_hash, salt, pid, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(user.id, username, display, await hashPassword(password, salt), salt, pid, now()).run();
    } catch (err) {
      if (String(err).includes("UNIQUE")) return json({ error: "username_taken" }, 409);
      throw err;
    }
    return openSession(env, user);
  }

  if (action === "login") {
    const row = await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
    // حتی اگر کاربر نباشد هم یک بار هش می‌گیریم تا زمانِ پاسخ چیزی لو ندهد
    const hash = await hashPassword(password, row ? row.salt : "00000000000000000000000000000000");
    if (!row || !sameString(hash, row.pass_hash)) return json({ error: "wrong_login" }, 401);
    return openSession(env, row);
  }

  return json({ error: "not_found" }, 404);
}

/* ───────────── بازی با ربات: هر حرکت روی سرور هم ثبت می‌شود ───────────── */

async function syncBotGame(id, req, env) {
  let body;
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const pid = String(body.pid ?? "");
  const botId = String(body.bot?.id ?? "");
  const list = Array.isArray(body.moves) ? body.moves : null;
  if (!PID_RE.test(pid) || !/^[a-z0-9-]{2,24}$/.test(botId) || !list || list.length > 600) {
    return json({ error: "bad_request" }, 400);
  }
  const human = body.color === "b" ? "black" : "white";
  const bot = human === "white" ? "black" : "white";
  const humanName = cleanName(body.name);
  const botName = "ربات: " + (cleanName(body.bot?.name) || botId);
  const iso = (s) => (typeof s === "string" && !isNaN(Date.parse(s)) ? new Date(s).toISOString() : now());

  await ensureSchema(env.DB);
  let game = await env.DB.prepare("SELECT * FROM games WHERE id = ?").bind(id).first();
  if (game && (game.mode !== "bot" || game[`${human}_id`] !== pid)) return json({ error: "forbidden" }, 403);
  if (!game) {
    const t = iso(body.startedAt);
    await env.DB.prepare(
      `INSERT INTO games (id, mode, ${human}_id, ${human}_name, ${bot}_id, ${bot}_name, status, created_at, updated_at)
       VALUES (?, 'bot', ?, ?, ?, ?, 'active', ?, ?)`
    ).bind(id, pid, humanName, "bot:" + botId, botName, t, t).run();
  }
  const { results: stored } = await env.DB.prepare(
    "SELECT san FROM moves WHERE game_id = ? ORDER BY ply"
  ).bind(id).all();

  // چند حرکتِ اولِ ذخیره‌شده هنوز با بازی یکی است؟ (بعد از «برگشت»، ادامه فرق می‌کند)
  let have = 0;
  while (have < stored.length && have < list.length && stored[have].san === String(list[have]?.san)) have++;

  // همه‌ی حرکت‌ها از اول بازبینی می‌شوند؛ حرکتِ غیرقانونی پذیرفته نمی‌شود
  const chess = new Chess();
  const inserts = [];
  if (have < stored.length) {
    inserts.push(env.DB.prepare("DELETE FROM moves WHERE game_id = ? AND ply > ?").bind(id, have));
  }
  for (let i = 0; i < list.length; i++) {
    const turn = chess.turn();
    let mv;
    try { mv = chess.move(String(list[i]?.san ?? "")); } catch { return json({ error: "illegal_move", ply: i + 1 }, 400); }
    if (i < have) continue;
    const byHuman = (turn === "w") === (human === "white");
    inserts.push(env.DB.prepare(
      `INSERT OR IGNORE INTO moves (game_id, ply, color, player_id, player_name, san, from_sq, to_sq,
                                    piece, captured, promotion, flags, fen_after, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, i + 1, turn, byHuman ? pid : "bot:" + botId, byHuman ? humanName : botName,
           mv.san, mv.from, mv.to, mv.piece, mv.captured ?? null, mv.promotion ?? null,
           mv.flags, chess.fen(), iso(list[i]?.at)));
  }

  let result = null, reason = null;
  if (chess.isCheckmate()) { result = chess.turn() === "w" ? "black" : "white"; reason = "checkmate"; }
  else if (chess.isStalemate()) { result = "draw"; reason = "stalemate"; }
  else if (chess.isThreefoldRepetition()) { result = "draw"; reason = "repetition"; }
  else if (chess.isInsufficientMaterial()) { result = "draw"; reason = "insufficient"; }
  else if (chess.isDraw()) { result = "draw"; reason = "fifty"; }
  else if (body.timeout === true) { result = bot; reason = "timeout"; }
  else if (body.resigned === true) { result = bot; reason = "resign"; }

  inserts.push(env.DB.prepare(
    "UPDATE games SET status = ?, result = ?, reason = ?, updated_at = ? WHERE id = ?"
  ).bind(result ? "over" : "active", result, reason, now(), id));
  for (let i = 0; i < inserts.length; i += 40) await env.DB.batch(inserts.slice(i, i + 40));
  return json({ saved: list.length });
}

/* ───────────── اتاق بازی ───────────── */

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.game = null;
    this.moves = [];
    this.chess = null;
    this.queue = Promise.resolve();
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  // همه‌ی کارها پشت‌سرهم انجام می‌شوند تا دو حرکت هم‌زمان با هم قاطی نشوند
  run(fn) {
    const p = this.queue.then(fn);
    this.queue = p.catch((e) => console.error(e));
    return p;
  }

  async load(gameId) {
    if (this.game?.id === gameId) return true;
    await ensureSchema(this.env.DB);
    const game = await this.env.DB.prepare("SELECT * FROM games WHERE id = ?").bind(gameId).first();
    if (!game) return false;
    const { results } = await this.env.DB.prepare(
      "SELECT * FROM moves WHERE game_id = ? ORDER BY ply"
    ).bind(gameId).all();
    const chess = new Chess(game.start_fen || undefined);
    for (const r of results) chess.move(r.san);
    this.moves = results.map((r) => ({
      ply: r.ply, color: r.color, name: r.player_name || "", san: r.san,
      from: r.from_sq, to: r.to_sq, piece: r.piece, captured: r.captured,
      promotion: r.promotion, flags: r.flags || "", fen: r.fen_after, at: r.created_at,
    }));
    this.game = game;
    this.chess = chess;
    this.deadline = (await this.ctx.storage.get("deadline")) ?? null;
    return true;
  }

  async fetch(req) {
    const gameId = new URL(req.url).pathname.split("/")[3];
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    await this.ctx.storage.put("gameId", gameId);   // زنگِ ساعت باید بداند کدام بازی است
    pair[1].serializeAttachment({ gameId, pid: null, color: null });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== "string" || raw.length > 2000) return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const att = ws.deserializeAttachment() || {};
    await this.run(async () => {
      if (!(await this.load(att.gameId))) {
        this.send(ws, { type: "error", code: "not_found" });
        ws.close(4004, "not_found");
        return;
      }
      if (msg.type === "hello") return this.onHello(ws, att, msg);
      if (!att.pid) return;
      if (msg.type === "move") return this.onMove(ws, att, msg);
      if (msg.type === "resign") return this.onResign(ws, att);
      if (msg.type === "undo") return this.onUndo(ws, att);
      if (msg.type === "undo_reply") return this.onUndoReply(ws, att, msg);
      if (msg.type === "chat") return this.onChat(ws, att, msg);
    });
  }

  async webSocketClose(ws, code) {
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code); } catch {}
    const att = ws.deserializeAttachment() || {};
    await this.run(async () => {
      if (att.gameId && (await this.load(att.gameId))) this.broadcast(ws);
    });
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws, 1011);
  }

  /* ── پیام‌ها ── */

  async onHello(ws, att, msg) {
    const pid = String(msg.pid ?? "");
    if (!PID_RE.test(pid)) return this.send(ws, { type: "error", code: "bad_player" });
    const name = cleanName(msg.name);
    const g = this.game;
    let color = null;

    if (g.mode === "solo") {
      if (g.white_id === pid) color = "both";
    } else if (g.white_id === pid) color = "w";
    else if (g.black_id === pid) color = "b";
    else if (!g.white_id || !g.black_id) {
      // صندلیِ خالی را بگیر
      const col = !g.white_id ? "white" : "black";
      const status = g.status === "waiting" ? "active" : g.status;
      await this.env.DB.prepare(
        `UPDATE games SET ${col}_id = ?, ${col}_name = ?, status = ?, updated_at = ? WHERE id = ?`
      ).bind(pid, name, status, now(), g.id).run();
      g[`${col}_id`] = pid;
      g[`${col}_name`] = name;
      g.status = status;
      color = col === "white" ? "w" : "b";
    }

    // اگر بازیکن با نام تازه برگشته، نامش را به‌روز کن
    if (name && g.mode === "duo" && (color === "w" || color === "b")) {
      const col = color === "w" ? "white" : "black";
      if (g[`${col}_name`] !== name) {
        await this.env.DB.prepare(`UPDATE games SET ${col}_name = ? WHERE id = ?`).bind(name, g.id).run();
        g[`${col}_name`] = name;
      }
    }

    ws.serializeAttachment({ gameId: g.id, pid, color });
    // ساعت فقط وقتی راه می‌افتد که هر دو بازیکن حاضر باشند؛ بازی‌های قدیمی تا آن موقع دست‌نخورده می‌مانند
    if (g.mode === "duo" && g.status === "active" && !this.deadline) {
      const on = this.presence();
      if (on.w && on.b) await this.armClock();
    }
    this.broadcast();
    for (const c of this.chat || []) this.send(ws, c);
  }

  async onMove(ws, att, msg) {
    const g = this.game;
    const chess = this.chess;
    const turn = chess.turn();
    const allowed = g.status === "active" && (att.color === "both" || att.color === turn);
    const { from, to, promotion } = msg;
    if (!allowed || !SQ_RE.test(from) || !SQ_RE.test(to) ||
        (promotion != null && !/^[qrbn]$/.test(promotion))) {
      return this.send(ws, this.stateFor(ws));
    }

    let mv;
    try { mv = chess.move(promotion ? { from, to, promotion } : { from, to }); }
    catch { return this.send(ws, this.stateFor(ws)); }

    let result = null, reason = null;
    if (chess.isCheckmate()) { result = turn === "w" ? "white" : "black"; reason = "checkmate"; }
    else if (chess.isStalemate()) { result = "draw"; reason = "stalemate"; }
    else if (chess.isThreefoldRepetition()) { result = "draw"; reason = "repetition"; }
    else if (chess.isInsufficientMaterial()) { result = "draw"; reason = "insufficient"; }
    else if (chess.isDraw()) { result = "draw"; reason = "fifty"; }

    const t = now();
    const ply = this.moves.length + 1;
    const playerName = (turn === "w" ? g.white_name : g.black_name) || "";
    const status = result ? "over" : "active";
    try {
      // ثبتِ حرکت — تا این نوشته نشود، حرکت به هیچ‌کس اعلام نمی‌شود
      await this.env.DB.batch([
        this.env.DB.prepare(
          `INSERT INTO moves (game_id, ply, color, player_id, player_name, san, from_sq, to_sq,
                              piece, captured, promotion, flags, fen_after, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(g.id, ply, turn, att.pid, playerName, mv.san, mv.from, mv.to,
               mv.piece, mv.captured ?? null, mv.promotion ?? null, mv.flags, chess.fen(), t),
        this.env.DB.prepare(
          "UPDATE games SET status = ?, result = ?, reason = ?, updated_at = ? WHERE id = ?"
        ).bind(status, result, reason, t, g.id),
      ]);
    } catch (err) {
      console.error(err);
      chess.undo();
      this.send(ws, { type: "error", code: "save_failed" });
      return this.send(ws, this.stateFor(ws));
    }

    this.moves.push({
      ply, color: turn, name: playerName, san: mv.san, from: mv.from, to: mv.to,
      piece: mv.piece, captured: mv.captured ?? null, promotion: mv.promotion ?? null,
      flags: mv.flags, fen: chess.fen(), at: t,
    });
    g.status = status; g.result = result; g.reason = reason;
    this.undoReq = null;
    await this.armClock();
    this.broadcast();
  }

  async onResign(ws, att) {
    const g = this.game;
    if (g.status !== "active" || !att.color) return;
    const loser = att.color === "both" ? this.chess.turn() : att.color;
    const result = loser === "w" ? "black" : "white";
    await this.env.DB.prepare(
      "UPDATE games SET status = 'over', result = ?, reason = 'resign', updated_at = ? WHERE id = ?"
    ).bind(result, now(), g.id).run();
    g.status = "over"; g.result = result; g.reason = "resign";
    await this.armClock();
    this.broadcast();
  }

  // برگشتِ یک حرکت: فقط وقتی هر دو رنگ دستِ یک نفر است (بازی روی یک دستگاه).
  // در بازیِ آنلاینِ دو نفره، برگشت بدونِ رضایتِ حریف درست نیست.
  async onUndo(ws, att) {
    const g = this.game;
    // بازیِ آنلاین: فقط درخواست ثبت می‌شود؛ برگشت وقتی انجام می‌شود که حریف قبول کند
    if (g.mode === "duo") {
      if (g.status !== "active" || (att.color !== "w" && att.color !== "b") || this.undoReq) return;
      if (!this.moves.some((m) => m.color === att.color)) return;
      this.undoReq = att.color;
      return this.broadcast();
    }
    if (g.mode !== "solo" || att.color !== "both" || !this.moves.length || g.reason === "resign") return;
    return this.takeBack(1);
  }

  async onUndoReply(ws, att, msg) {
    const by = this.undoReq;
    if (!by || att.color === by || (att.color !== "w" && att.color !== "b")) return;
    this.undoReq = null;
    if (msg.ok === true && this.game.status === "active") {
      // تا آخرین حرکتِ درخواست‌کننده عقب می‌رود
      const last = this.moves[this.moves.length - 1];
      return this.takeBack(last && last.color === by ? 1 : 2);
    }
    for (const s of this.ctx.getWebSockets()) {
      if (s.deserializeAttachment()?.color === by) this.send(s, { type: "note", code: "undo_declined" });
    }
    this.broadcast();
  }

  // گفت‌وگوی کوتاهِ دو بازیکن؛ ذخیره‌ی دائمی نمی‌شود
  onChat(ws, att, msg) {
    const text = String(msg.text ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 300);
    if (!text || (att.color !== "w" && att.color !== "b")) return;
    const item = { type: "chat", from: att.color, text, at: now() };
    (this.chat ||= []).push(item);
    if (this.chat.length > 40) this.chat.shift();
    for (const s of this.ctx.getWebSockets()) if (s.deserializeAttachment()?.pid) this.send(s, item);
  }

  async takeBack(n) {
    const g = this.game;
    n = Math.min(n, this.moves.length);
    if (!n) return this.broadcast();
    const ply = this.moves.length - n;
    await this.env.DB.batch([
      this.env.DB.prepare("DELETE FROM moves WHERE game_id = ? AND ply > ?").bind(g.id, ply),
      this.env.DB.prepare(
        "UPDATE games SET status = 'active', result = NULL, reason = NULL, updated_at = ? WHERE id = ?"
      ).bind(now(), g.id),
    ]);
    for (let i = 0; i < n; i++) { this.chess.undo(); this.moves.pop(); }
    g.status = "active"; g.result = null; g.reason = null;
    await this.armClock();
    this.broadcast();
  }

  /* ── ساعت: هر بازیکن برای هر حرکت یک دقیقه وقت دارد (بازیِ آنلاینِ دو نفره) ── */

  async armClock() {
    const g = this.game;
    if (g.mode !== "duo" || g.status !== "active") {
      this.deadline = null;
      await this.ctx.storage.delete("deadline");
      await this.ctx.storage.deleteAlarm();
      return;
    }
    this.deadline = Date.now() + TURN_MS;
    await this.ctx.storage.put("deadline", this.deadline);
    await this.ctx.storage.setAlarm(this.deadline);
  }

  // وقت تمام شد: کسی که نوبتش بود می‌بازد، حتی اگر صفحه را بسته باشد
  async alarm() {
    await this.run(async () => {
      const gameId = await this.ctx.storage.get("gameId");
      if (!gameId || !(await this.load(gameId))) return;
      const g = this.game;
      if (g.mode !== "duo" || g.status !== "active" || !this.deadline) return;
      if (Date.now() < this.deadline - 50) return this.ctx.storage.setAlarm(this.deadline);
      const result = this.chess.turn() === "w" ? "black" : "white";
      await this.env.DB.prepare(
        "UPDATE games SET status = 'over', result = ?, reason = 'timeout', updated_at = ? WHERE id = ?"
      ).bind(result, now(), g.id).run();
      g.status = "over"; g.result = result; g.reason = "timeout";
      this.undoReq = null;
      await this.armClock();
      this.broadcast();
    });
  }

  /* ── وضعیت ── */

  presence(except) {
    const on = { w: false, b: false, watchers: 0 };
    for (const s of this.ctx.getWebSockets()) {
      if (s === except) continue;
      const a = s.deserializeAttachment();
      if (!a?.pid) continue;
      if (a.color === "both") on.w = on.b = true;
      else if (a.color === "w" || a.color === "b") on[a.color] = true;
      else on.watchers++;
    }
    return on;
  }

  stateFor(ws, except) {
    const g = this.game;
    const chess = this.chess;
    const att = ws.deserializeAttachment() || {};
    const on = this.presence(except);
    return {
      type: "state",
      id: g.id, mode: g.mode, status: g.status, result: g.result, reason: g.reason,
      you: att.color,
      players: {
        w: { name: g.white_name || "", seated: !!g.white_id, online: on.w },
        b: { name: g.black_name || "", seated: !!g.black_id, online: on.b },
      },
      watchers: on.watchers,
      undoReq: this.undoReq || null,
      start: g.start_fen || null,
      left: this.deadline && g.status === "active" ? Math.max(0, this.deadline - Date.now()) : null,
      fen: chess.fen(), turn: chess.turn(), check: chess.inCheck(),
      moves: this.moves,
      legal: g.status === "active"
        ? chess.moves({ verbose: true }).map((m) => ({ from: m.from, to: m.to, promotion: m.promotion }))
        : [],
    };
  }

  send(ws, data) {
    try { ws.send(JSON.stringify(data)); } catch {}
  }

  broadcast(except) {
    for (const s of this.ctx.getWebSockets()) {
      if (s === except) continue;
      if (!s.deserializeAttachment()?.pid) continue;
      this.send(s, this.stateFor(s, except));
    }
  }
}
