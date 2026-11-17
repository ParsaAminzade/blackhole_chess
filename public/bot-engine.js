// موتورِ ربات: جست‌وجوی کمینه-بیشینه با هرسِ آلفا-بتا.
// «شخصیت» از سه جا می‌آید: سلیقه در ارزیابیِ موقعیت (w)، عادت در انتخابِ حرکت (r)
// و شروع‌ها و تله‌هایی که حفظ است (system / lines).

import { Chess } from "./vendor/chess.js";
import { botById } from "./bots.js";

const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const MATE = 100000;
const INF = 1e9;
const F_CAPTURE = 2 | 8;
const F_PROMO = 16;
const F_CASTLE = 32 | 64;
const KNIGHT_STEPS = [-33, -31, -18, -14, 14, 18, 31, 33];

let nodes = 0;
let deadline = 0;
class Timeout extends Error {}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const centerDist = (i) => {
  const r = i >> 4, f = i & 7;
  return Math.max(r < 4 ? 3 - r : r - 4, f < 4 ? 3 - f : f - 4);   // ۰ = مرکز، ۳ = لبه
};
const dist = (a, b) => Math.max(Math.abs((a >> 4) - (b >> 4)), Math.abs((a & 7) - (b & 7)));
const alg = (i) => "abcdefgh"[i & 7] + (8 - (i >> 4));
const idx = (sq) => (8 - +sq[1]) * 16 + "abcdefgh".indexOf(sq[0]);
const strip = (san) => san.replace(/[+#]/g, "");

/* ───────────── ارزیابی از دیدِ ربات ───────────── */

function evaluate(ch, me, P) {
  const B = ch._board;
  const w = P.w;
  const opp = me === "w" ? "b" : "w";
  const myK = ch._kings[me], opK = ch._kings[opp];
  let s = 0, material = 0, nonPawn = 0, myBishops = 0;

  for (let i = 0; i < 120; i++) {
    if (i & 0x88) { i += 7; continue; }
    const p = B[i];
    if (!p) continue;
    const mine = p.color === me;
    const t = p.type;
    const adv = p.color === "w" ? 7 - (i >> 4) : i >> 4;   // چند ردیف از خانه‌ی خودش جلو آمده
    const cd = centerDist(i);
    let v = (mine && P.vals[t]) || VAL[t];
    material += mine ? VAL[t] : -VAL[t];

    if (t === "p") v += adv * 6 + (cd <= 1 ? 10 - cd * 4 : 0);
    else if (t === "n") v += (3 - cd) * 10;
    else if (t === "b") v += (3 - cd) * 5;
    else if (t === "r") v += adv === 6 ? 18 : 0;
    else if (t === "q") v += (3 - cd) * 2;
    s += mine ? v : -v;

    if (t !== "p" && t !== "k") nonPawn++;
    if (mine) {
      if (t === "p") {
        s += w.advance * adv;
        if (Math.abs((i & 7) - (opK & 7)) <= 1) s += w.storm * adv;
      } else if (t !== "k") {
        s += w.aggr * (7 - dist(i, opK));
        if ((t === "n" || t === "b") && adv > 0) s += w.dev;
        if (t === "b") myBishops++;
      }
      if (t !== "k") s += cd === 0 ? w.center * 2 : cd === 1 ? w.center : 0;
    } else if (t !== "p" && t !== "k" && dist(i, myK) <= 2) {
      s -= 6 + w.safety;
    }
  }

  // شاه: در میانه‌ی بازی پشتِ سربازها، در آخربازی وسطِ صفحه
  const endgame = nonPawn <= 4;
  const kingAdv = (k, c) => (c === "w" ? 7 - (k >> 4) : k >> 4);
  if (endgame) {
    s += (3 - centerDist(myK)) * (10 + w.kingAct) - (3 - centerDist(opK)) * 10;
  } else {
    s += kingAdv(myK, me) === 0 ? 12 : -18 * kingAdv(myK, me);
    s -= kingAdv(opK, opp) === 0 ? 12 : -18 * kingAdv(opK, opp);
    const front = myK + (me === "w" ? -16 : 16);
    for (const sq of [front - 1, front, front + 1]) {
      if (sq & 0x88) continue;
      const p = B[sq];
      if (p && p.type === "p" && p.color === me) s += 8 + w.safety;
    }
  }

  if (myBishops >= 2) s += 30 + w.pair;
  s += w.keep * nonPawn;
  if (material > 150) s -= w.simplify * nonPawn;
  return s;
}

/* ───────────── جست‌وجو ───────────── */

function order(moves) {
  for (const m of moves) {
    m.o = (m.captured ? 1000 + 10 * VAL[m.captured] - VAL[m.piece] : 0) + (m.flags & F_PROMO ? 800 : 0);
  }
  return moves.sort((a, b) => b.o - a.o);
}

function quiesce(ch, alpha, beta, me, P, qd, ply) {
  if ((++nodes & 1023) === 0 && now() > deadline) throw new Timeout();
  const moves = ch._moves({ legal: true });
  const maxing = ch._turn === me;
  if (!moves.length) {
    return ch._isKingAttacked(ch._turn) ? (maxing ? -MATE + ply : MATE - ply) : 0;
  }
  const stand = evaluate(ch, me, P);
  if (qd >= 4) return stand;
  let best = stand;
  if (maxing) {
    if (best >= beta) return best;
    if (best > alpha) alpha = best;
  } else {
    if (best <= alpha) return best;
    if (best < beta) beta = best;
  }
  for (const m of order(moves)) {
    if (!(m.flags & F_CAPTURE) && !(m.flags & F_PROMO)) break;   // مرتب‌شده‌اند: بقیه آرام‌اند
    ch._makeMove(m);
    const v = quiesce(ch, alpha, beta, me, P, qd + 1, ply + 1);
    ch._undoMove();
    if (maxing) {
      if (v > best) best = v;
      if (best > alpha) alpha = best;
    } else {
      if (v < best) best = v;
      if (best < beta) beta = best;
    }
    if (alpha >= beta) break;
  }
  return best;
}

function search(ch, depth, alpha, beta, me, P, ply) {
  if (depth <= 0) return quiesce(ch, alpha, beta, me, P, 0, ply);
  if ((++nodes & 1023) === 0 && now() > deadline) throw new Timeout();
  const moves = ch._moves({ legal: true });
  const maxing = ch._turn === me;
  if (!moves.length) {
    return ch._isKingAttacked(ch._turn) ? (maxing ? -MATE + ply : MATE - ply) : 0;
  }
  let best = maxing ? -INF : INF;
  for (const m of order(moves)) {
    ch._makeMove(m);
    const v = search(ch, depth - 1, alpha, beta, me, P, ply + 1);
    ch._undoMove();
    if (maxing) {
      if (v > best) best = v;
      if (best > alpha) alpha = best;
    } else {
      if (v < best) best = v;
      if (best < beta) beta = best;
    }
    if (alpha >= beta) break;
  }
  return best;
}

/* ───────────── عادت‌های شخصیت ───────────── */

function habitBonus(c, ctx) {
  const { P, ch, me, ply, last } = ctx;
  const r = P.r;
  const m = c.m;
  const t = m.piece;
  const rankAdv = (i) => (me === "w" ? 7 - (i >> 4) : i >> 4);
  const adv = rankAdv(m.to) - rankAdv(m.from);
  let b = 0;

  if (/[+#]/.test(c.san)) b += r.check;
  if (m.captured) {
    b += r.capture;
    if (t !== "p" && VAL[m.captured] >= VAL[t] - 20) b += r.trade;
  }
  if (m.flags & F_CASTLE) b += r.castle;
  b += r[{ p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" }[t]];
  if (adv > 0) b += r.forward * adv;
  if (adv < 0) b += r.retreat * -adv;
  const file = m.to & 7;
  if (t === "p" && (file <= 1 || file >= 6)) b += r.edge;
  if (t === "b" && ["b5", "g5", "b4", "g4"].includes(alg(m.to))) b += r.pin;
  if (t === "q" && ply < 14) b += r.earlyQueen;
  if (t !== "p" && dist(m.to, ch._kings[me === "w" ? "b" : "w"]) <= 2) b += r.near;

  // تقلید: قرینه‌ی حرکتِ قبلیِ حریف
  if (r.mirror && last) {
    const flip = (i) => ((7 - (i >> 4)) << 4) | (i & 7);
    if (m.from === flip(idx(last.from)) && m.to === flip(idx(last.to))) b += r.mirror;
  }

  // چنگالِ اسب: دو مهره‌ی سنگین هم‌زمان زیرِ ضرب
  if (r.fork && t === "n") {
    let hits = 0;
    for (const d of KNIGHT_STEPS) {
      const sq = m.to + d;
      if (sq & 0x88) continue;
      const p = ch._board[sq];
      if (p && p.color !== me && (p.type === "r" || p.type === "q" || p.type === "k")) hits++;
    }
    if (hits >= 2) b += r.fork;
  }
  return b;
}

const DEFAULT_W = { aggr: 0, safety: 0, center: 0, advance: 0, storm: 0, keep: 0, simplify: 0, pair: 0, dev: 0, kingAct: 0 };
const DEFAULT_R = {
  check: 0, capture: 0, trade: 0, castle: 0, pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0, king: 0,
  forward: 0, retreat: 0, edge: 0, pin: 0, earlyQueen: 0, near: 0, mirror: 0, fork: 0,
};

function persona(id) {
  // «hint»: بدون سلیقه و بدون تصادف، فقط بهترین حرکتی که پیدا می‌کند
  const b = id === "hint" ? { depth: 3, time: 900, noise: 0, maxDrop: 0 } : botById(id);
  if (!b) throw new Error("unknown bot " + id);
  return {
    depth: 2, time: 800, noise: 20, blunder: 0, maxDrop: 90, ...b,
    w: { ...DEFAULT_W, ...b.w }, r: { ...DEFAULT_R, ...b.r },
    vals: b.vals || {}, system: b.system || {}, lines: b.lines || [],
  };
}

/* ───────────── انتخابِ حرکت ───────────── */

// sans: همه‌ی حرکت‌های بازی تا این لحظه. خروجی: { from, to, promotion, san, depth, why }
export function chooseMove(botId, sans, rand = Math.random, opts = {}) {
  const P = persona(botId);
  if (opts.lite) {   // گوشیِ ضعیف: یک پله کم‌عمق‌تر و زمانِ کمتر
    P.depth = Math.max(1, P.depth - 1);
    P.time = Math.round(P.time * 0.7);
  }
  const build = () => {
    const c = new Chess();
    const seen = new Map();
    let last = null;
    for (const s of sans) {
      last = c.move(s);
      const key = c.fen().split(" ").slice(0, 4).join(" ");
      seen.set(key, (seen.get(key) || 0) + 1);
    }
    return { c, seen, last };
  };

  let { c: ch, seen, last } = build();
  const me = ch._turn;
  const ply = sans.length;
  const moves = ch._moves({ legal: true });
  if (!moves.length) return null;
  const cands = moves.map((m) => ({ m, san: ch._moveToSan(m, moves), score: 0 }));
  const out = (c, why, depth = 0) =>
    ({ from: alg(c.m.from), to: alg(c.m.to), promotion: c.m.promotion, san: c.san, depth, why });

  if (cands.length === 1) return out(cands[0], "forced");
  if (rand() < P.blunder) return out(cands[(rand() * cands.length) | 0], "random");

  // خطِ حفظی که هنوز با بازی جور است
  const fitting = P.lines.filter((l) => l.length > ply && sans.every((s, i) => strip(l[i]) === strip(s)));
  const line = fitting.length ? fitting[(rand() * fitting.length) | 0] : null;
  const lineSan = line ? strip(line[ply]) : null;

  // چیدمانِ دلخواه: دو حرکتِ بعدی که هنوز بازی نشده
  const mine = new Set(sans.filter((_, i) => i % 2 === ply % 2).map(strip));
  const wanted = ply < 26 ? (P.system[me] || []).filter((s) => !mine.has(s)).slice(0, 2) : [];

  const window = Math.max(P.maxDrop, lineSan ? 450 : 0) + 1;
  deadline = now() + P.time;
  nodes = 0;
  let done = 0;
  for (let d = 1; d <= P.depth; d++) {
    const scores = [];
    let best = -INF;
    try {
      for (const c of cands) {
        ch._makeMove(c.m);
        const v = search(ch, d - 1, best - window, INF, me, P, 1);
        ch._undoMove();
        scores.push(v);
        if (v > best) best = v;
      }
    } catch (err) {
      if (!(err instanceof Timeout)) throw err;
      ({ c: ch, seen, last } = build());   // صفحه وسطِ جست‌وجو مانده؛ از نو بساز
      break;
    }
    cands.forEach((c, i) => (c.score = scores[i]));
    cands.sort((a, b) => b.score - a.score);
    done = d;
    if (best > MATE - 100) break;
  }

  const best = cands[0].score;
  if (best > MATE - 100) return out(cands[0], "mate", done);

  const ctx = { P, ch, me, ply, last };
  let pick = null, top = -INF, why = "search";
  for (const c of cands) {
    const s = strip(c.san);
    const isLine = s === lineSan;
    if (c.score < best - (isLine ? 450 : P.maxDrop)) continue;
    let total = c.score + habitBonus(c, ctx) + (rand() * 2 - 1) * P.noise;
    let reason = "search";
    if (isLine) { total += 400; reason = "line"; }
    else if (s === wanted[0]) { total += 90; reason = "system"; }
    else if (s === wanted[1]) { total += 55; reason = "system"; }

    // تکرارِ موقعیت وقتی جلوست، خوب نیست
    ch._makeMove(c.m);
    const reps = seen.get(ch.fen().split(" ").slice(0, 4).join(" ")) || 0;
    ch._undoMove();
    if (reps && c.score > -50) total -= 60 * reps;

    if (total > top) { top = total; pick = c; why = reason; }
  }
  return out(pick || cands[0], why, done);
}
