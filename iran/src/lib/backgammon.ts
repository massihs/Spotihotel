/**
 * Backgammon rules (pure, shared by the server and the board UI).
 *
 * Board indexes 0–23 are points 1–24 seen from White: White's checkers are positive numbers
 * and move down (23 → 0, home 0–5, bearing off below 0); Black's are negative and move up
 * (0 → 23, home 18–23, bearing off above 23).
 */

export type Color = "w" | "b";
export type Board = { points: number[]; bar: Record<Color, number>; off: Record<Color, number> };
export type From = number | "bar";
export type To = number | "off";
export type Move = { from: From; to: To; die: number; hit?: boolean };

export const CHECKERS = 15;
export const other = (c: Color): Color => (c === "w" ? "b" : "w");
const sign = (c: Color) => (c === "w" ? 1 : -1);
const own = (v: number, c: Color) => v * sign(c) > 0;

export function initialBoard(): Board {
  const points = Array<number>(24).fill(0);
  points[23] = 2;
  points[12] = 5;
  points[7] = 3;
  points[5] = 5;
  points[0] = -2;
  points[11] = -5;
  points[16] = -3;
  points[18] = -5;
  return { points, bar: { w: 0, b: 0 }, off: { w: 0, b: 0 } };
}

const cloneBoard = (b: Board): Board => ({ points: [...b.points], bar: { ...b.bar }, off: { ...b.off } });

/** All the player's checkers are in their home board (none on the bar or outside). */
export function allHome(b: Board, c: Color) {
  if (b.bar[c]) return false;
  for (let i = 0; i < 24; i++) {
    const inHome = c === "w" ? i <= 5 : i >= 18;
    if (!inHome && own(b.points[i]!, c)) return false;
  }
  return true;
}

/** The board after moving one checker by `die`, or null when that move is not allowed. */
export function tryMove(b: Board, c: Color, from: From, die: number): { board: Board; move: Move } | null {
  if (b.bar[c] > 0 && from !== "bar") return null;
  let start: number;
  if (from === "bar") {
    if (!b.bar[c]) return null;
    start = c === "w" ? 24 : -1;
  } else {
    if (from < 0 || from > 23 || !own(b.points[from]!, c)) return null;
    start = from;
  }
  const target = c === "w" ? start - die : start + die;
  const next = cloneBoard(b);
  const take = () => {
    if (from === "bar") next.bar[c]--;
    else next.points[from] = next.points[from]! - sign(c);
  };

  if (target < 0 || target > 23) {
    if (from === "bar" || !allHome(b, c)) return null;
    const exact = c === "w" ? target === -1 : target === 24;
    if (!exact) {
      // A higher die may bear off only the farthest checker.
      for (let i = 0; i < 24; i++) {
        const farther = c === "w" ? i > (from as number) && i <= 5 : i < (from as number) && i >= 18;
        if (farther && own(b.points[i]!, c)) return null;
      }
    }
    take();
    next.off[c]++;
    return { board: next, move: { from, to: "off", die } };
  }

  const there = b.points[target]!;
  if (there * sign(c) <= -2) return null; // blocked
  take();
  let hit = false;
  if (there * sign(c) === -1) {
    next.points[target] = 0;
    next.bar[other(c)]++;
    hit = true;
  }
  next.points[target] = next.points[target]! + sign(c);
  return { board: next, move: { from, to: target, die, ...(hit ? { hit } : {}) } };
}

const boardKey = (b: Board) => `${b.points.join(",")}|${b.bar.w},${b.bar.b}|${b.off.w},${b.off.b}`;

/**
 * Every complete way to play the dice (as many dice as possible; with one die playable out
 * of two different ones, the higher one when it can be played). Positions reached several ways
 * are kept once.
 */
export function legalSequences(b: Board, c: Color, dice: number[]): { moves: Move[]; board: Board }[] {
  const out: { moves: Move[]; board: Board }[] = [];
  const seen = new Set<string>();
  const walk = (board: Board, left: number[], moves: Move[]) => {
    let moved = false;
    for (const die of [...new Set(left)]) {
      const rest = [...left];
      rest.splice(rest.indexOf(die), 1);
      const froms: From[] = board.bar[c] ? ["bar"] : [];
      if (!board.bar[c]) for (let i = 0; i < 24; i++) if (own(board.points[i]!, c)) froms.push(i);
      for (const from of froms) {
        const r = tryMove(board, c, from, die);
        if (!r) continue;
        const key = `${moves.length}:${boardKey(r.board)}:${rest.join("")}`;
        moved = true;
        if (seen.has(key)) continue;
        seen.add(key);
        walk(r.board, rest, [...moves, r.move]);
      }
    }
    if (!moved) out.push({ moves, board });
  };
  walk(b, dice, []);
  const max = Math.max(0, ...out.map((s) => s.moves.length));
  let best = out.filter((s) => s.moves.length === max);
  if (max === 1 && dice.length === 2 && dice[0] !== dice[1]) {
    const high = Math.max(...dice);
    if (best.some((s) => s.moves[0]!.die === high)) best = best.filter((s) => s.moves[0]!.die === high);
  }
  return best;
}

/** Pieces that can move now: the bar first, else every point with a checker of `c`. */
function sources(b: Board, c: Color): From[] {
  if (b.bar[c]) return ["bar"];
  const out: From[] = [];
  for (let i = 0; i < 24; i++) if (own(b.points[i]!, c)) out.push(i);
  return out;
}

/** How many of `dice` can still be played from this position (memoised by position). */
function maxPlayable(b: Board, c: Color, dice: number[], memo: Map<string, number>): number {
  if (!dice.length) return 0;
  const key = `${boardKey(b)}:${[...dice].sort().join("")}`;
  const known = memo.get(key);
  if (known != null) return known;
  let best = 0;
  for (const die of new Set(dice)) {
    const rest = [...dice];
    rest.splice(rest.indexOf(die), 1);
    for (const from of sources(b, c)) {
      const r = tryMove(b, c, from, die);
      if (!r) continue;
      best = Math.max(best, 1 + maxPlayable(r.board, c, rest, memo));
      if (best === dice.length) break;
    }
    if (best === dice.length) break;
  }
  memo.set(key, best);
  return best;
}

/**
 * The single moves that can be played now: every move that starts a play using as many dice
 * as possible (and, when only one of two different dice can be played, the higher one).
 * Each candidate is checked on its own, so a move is never hidden because another order of
 * the same moves reaches the same position (that hid the front checker on doubles).
 */
export function legalMoves(b: Board, c: Color, remaining: number[]): Move[] {
  const memo = new Map<string, number>();
  const max = maxPlayable(b, c, remaining, memo);
  if (!max) return [];
  const out = new Map<string, Move>();
  for (const die of new Set(remaining)) {
    const rest = [...remaining];
    rest.splice(rest.indexOf(die), 1);
    for (const from of sources(b, c)) {
      const r = tryMove(b, c, from, die);
      if (!r || 1 + maxPlayable(r.board, c, rest, memo) !== max) continue;
      out.set(`${r.move.from}>${r.move.to}>${die}`, r.move);
    }
  }
  let moves = [...out.values()];
  if (max === 1 && remaining.length === 2 && remaining[0] !== remaining[1]) {
    const high = Math.max(...remaining);
    if (moves.some((m) => m.die === high)) moves = moves.filter((m) => m.die === high);
  }
  return moves;
}

/** Dice to play: doubles are played four times. */
export const diceToPlay = (d: [number, number]) => (d[0] === d[1] ? [d[0], d[0], d[0], d[0]] : [d[0], d[1]]);

/** Points won when `winner` has borne everything off: 1, gammon 2, backgammon 3. */
export function gamePoints(b: Board, winner: Color) {
  const loser = other(winner);
  if (b.off[loser] > 0) return 1;
  if (b.bar[loser] > 0) return 3;
  for (let i = 0; i < 24; i++) {
    const inWinnerHome = winner === "w" ? i <= 5 : i >= 18;
    if (inWinnerHome && own(b.points[i]!, loser)) return 3;
  }
  return 2;
}

/** Pip count: how far a player still has to travel. */
export function pips(b: Board, c: Color) {
  let n = b.bar[c] * 25;
  for (let i = 0; i < 24; i++)
    if (own(b.points[i]!, c)) n += Math.abs(b.points[i]!) * (c === "w" ? i + 1 : 24 - i);
  return n;
}

/**
 * The play chosen for a player who let the clock run out: a simple, sensible heuristic
 * (hit, make points, avoid leaving blots, bear off, race).
 */
export function autoPlay(b: Board, c: Color, remaining: number[]) {
  const seqs = legalSequences(b, c, remaining);
  let best = seqs[0];
  let bestScore = -Infinity;
  for (const s of seqs) {
    const nb = s.board;
    let score = (pips(b, c) - pips(nb, c)) * 0.1 + nb.off[c] * 3 + nb.bar[other(c)] * 4;
    for (let i = 0; i < 24; i++) {
      const v = nb.points[i]! * sign(c);
      if (v >= 2) score += 1;
      if (v === 1) score -= 1.5;
    }
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best ?? { moves: [], board: b };
}
