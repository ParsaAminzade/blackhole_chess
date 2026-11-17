// فایلِ بازی برای تحلیل. هم سرور از این استفاده می‌کند هم مرورگر (برای بازی آفلاین با ربات).
// خروجی یک متنِ خودبسنده است: PGN + جدولِ حرکت‌به‌حرکت با FEN، تا هر هوش مصنوعی
// بدون پردازشِ اضافه آن را بخواند.
//
// g = { id, white, black, me: "w"|"b"|null, status, result, reason,
//       createdAt, updatedAt, notes: [string],
//       moves: [{ ply, color, san, from, to, piece, captured, promotion, flags, fen, at }] }

const PIECES = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
const REASONS = {
  checkmate: "checkmate", resign: "resignation",
  timeout: "time (the 60 seconds allowed per move ran out)", stalemate: "stalemate",
  repetition: "threefold repetition", insufficient: "insufficient material", fifty: "fifty-move rule",
};
const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export function formatGame(g) {
  const moves = g.moves || [];
  const start = g.startFen || START_FEN;
  const code = { white: "1-0", black: "0-1", draw: "1/2-1/2" }[g.result] || "*";
  const outcome =
    g.status !== "over" ? "Game still in progress (not finished)"
    : g.result === "draw" ? `Draw by ${REASONS[g.reason] || g.reason}`
    : `${g.result === "white" ? "White" : "Black"} won by ${REASONS[g.reason] || g.reason}`;
  const clean = (s) => String(s || "").replace(/[\r\n|"\[\]]/g, " ").trim();
  const white = clean(g.white) || "White player";
  const black = clean(g.black) || "Black player";
  const finalFen = moves.length ? moves[moves.length - 1].fen : start;
  const created = g.createdAt || "";

  let pgnMoves = "";
  for (const m of moves) pgnMoves += (m.color === "w" ? `${(m.ply + 1) / 2}. ` : "") + m.san + " ";
  const pgn = [
    `[Event "Event Horizon chess game"]`,
    `[Site "game ${g.id}"]`,
    created ? `[Date "${created.slice(0, 10).replace(/-/g, ".")}"]` : null,
    `[White "${white}"]`,
    `[Black "${black}"]`,
    `[Result "${code}"]`,
    g.startFen ? `[SetUp "1"]` : null,
    g.startFen ? `[FEN "${g.startFen}"]` : null,
    g.reason ? `[Termination "${REASONS[g.reason] || g.reason}"]` : null,
    "",
    (pgnMoves + code).trim(),
  ].filter((l) => l !== null).join("\n");

  let prev = Date.parse(created);
  const rows = moves.map((m) => {
    const t = Date.parse(m.at);
    const secs = m.ply === 1 || isNaN(t) || isNaN(prev) ? "-" : Math.max(0, Math.round((t - prev) / 1000));
    if (!isNaN(t)) prev = t;
    const notes = [];
    const flags = m.flags || "";
    if (flags.includes("k")) notes.push("castles kingside");
    if (flags.includes("q")) notes.push("castles queenside");
    if (flags.includes("e")) notes.push("en passant");
    if (m.promotion) notes.push(`promotes to ${PIECES[m.promotion]}`);
    if (m.san.endsWith("#")) notes.push("checkmate");
    else if (m.san.endsWith("+")) notes.push("check");
    return [
      m.ply, Math.ceil(m.ply / 2), m.color === "w" ? "White" : "Black", m.san,
      `${m.from}-${m.to}`, PIECES[m.piece], m.captured ? PIECES[m.captured] : "-",
      secs, notes.join(", ") || "-", m.fen,
    ].join(" | ");
  });

  const me = g.me === "w" ? "White" : g.me === "b" ? "Black" : null;
  return [
    `# Chess game record — ${g.id}`,
    "",
    "This file is a complete record of one chess game. Nothing else is needed to analyse it.",
    "The same game is given twice: as standard PGN, and as a move-by-move table with the",
    "exact position (FEN) after every move, so no move needs to be replayed to see the board.",
    "",
    "## Summary",
    `- White: ${white}`,
    `- Black: ${black}`,
    me ? `- This file was downloaded by: ${me} (analyse the game from ${me}'s point of view)` : null,
    ...(g.notes || []).map((n) => `- ${clean(n)}`),
    `- Outcome: ${outcome}`,
    `- Result code: ${code}`,
    `- Half-moves (plies) played: ${moves.length}`,
    created ? `- Started (UTC): ${created}` : null,
    g.updatedAt ? `- Last update (UTC): ${g.updatedAt}` : null,
    `- Start position (FEN): ${start}`,
    g.startFen ? "- This game used a RANDOM starting setup (Chess960-style back rank) and castling is not allowed" : null,
    `- Final position (FEN): ${finalFen}`,
    "",
    "## PGN",
    "```pgn",
    pgn,
    "```",
    "",
    "## Move by move",
    "Columns: ply | move number | side | move (SAN) | from-to | piece moved | piece captured | seconds spent on this move | notes | position after the move (FEN)",
    "",
    ...(rows.length ? rows : ["(no moves were played)"]),
    "",
    "## Suggested analysis",
    me
      ? `Find ${me}'s mistakes and blunders: for each one give the ply, what was played, what should have been played instead and why. Then name the turning point of the game and 2-3 concrete things ${me} should practise.`
      : "For each side, find the mistakes and blunders: give the ply, what was played, what should have been played instead and why. Then name the turning point of the game.",
    "",
  ].filter((l) => l !== null).join("\n");
}
