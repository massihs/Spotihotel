import { randomInt } from "node:crypto";
import { and, count, desc, eq, inArray, lt, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  autoPlay,
  CHECKERS,
  diceToPlay,
  gamePoints,
  initialBoard,
  legalMoves,
  other,
  tryMove,
  type Board,
  type Color,
  type Move,
} from "@/lib/backgammon";
import type { Database, DbOrTx } from "@/server/db/client";
import { games } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { emit, topics } from "@/server/infra/realtime";
import type { GuestContext } from "@/server/modules/guest/sessions";

/** Seconds a player has to play before the turn is played for them. */
export const TURN_MS = 15_000;
/** Turns played automatically before the player loses by forfeit. */
export const MAX_STRIKES = 3;
/** After the last die is played, the turn is confirmed by itself after this (time to undo). */
export const CONFIRM_MS = 5_000;
/** A player is "at the board" when their screen pinged within this delay. */
const PRESENT_MS = 12_000;
/** An open game nobody joined disappears after this. */
const OPEN_TTL_MS = 30 * 60_000;
/** A game nobody looked at for this long is abandoned. */
const IDLE_TTL_MS = 2 * 60 * 60_000;

export type GameState = {
  board: Board;
  turn: Color;
  dice: number[];
  remaining: number[];
  /** Moves already played this turn. */
  moves: Move[];
  /** The previous turn, for the opponent to see what happened. */
  last: { color: Color; dice: number[]; moves: Move[]; auto?: boolean; pass?: boolean } | null;
  score: Record<Color, number>;
  gameNo: number;
  /** Turns played automatically in this match. */
  strikes: Record<Color, number>;
  lastGame: { winner: Color; points: number } | null;
  turnNo: number;
  /** The board when the turn started (to undo moves). */
  turnBoard?: Board;
  /** All dice played: the player confirms (or undoes) before the turn passes. */
  awaitConfirm?: boolean;
};

type Row = typeof games.$inferSelect;

const roll = (): [number, number] => [randomInt(1, 7), randomInt(1, 7)];

function rollFor(s: GameState, color: Color, dice: [number, number] = roll()) {
  s.turn = color;
  s.dice = dice;
  s.remaining = diceToPlay(dice);
  s.moves = [];
  s.turnNo++;
  s.awaitConfirm = false;
  // No legal move: the turn passes (at most a few times in a row).
  for (let i = 0; i < 6 && !legalMoves(s.board, s.turn, s.remaining).length; i++) {
    s.last = { color: s.turn, dice: s.dice, moves: [], pass: true };
    s.turn = other(s.turn);
    s.dice = roll();
    s.remaining = diceToPlay(s.dice as [number, number]);
    s.turnNo++;
  }
  s.turnBoard = structuredClone(s.board);
}

/** A new game of the match: opening roll, the higher die starts and plays both dice. */
function newGame(s: GameState) {
  s.board = initialBoard();
  s.gameNo++;
  let d = roll();
  while (d[0] === d[1]) d = roll();
  rollFor(s, d[0] > d[1] ? "w" : "b", d);
}

export function freshState(): GameState {
  const s: GameState = {
    board: initialBoard(),
    turn: "w",
    dice: [],
    remaining: [],
    moves: [],
    last: null,
    score: { w: 0, b: 0 },
    gameNo: 0,
    strikes: { w: 0, b: 0 },
    lastGame: null,
    turnNo: 0,
  };
  newGame(s);
  return s;
}

/** Ends the current turn: a won game scores, a won match ends, otherwise the opponent rolls. */
function endTurn(s: GameState, target: number, auto = false): Color | null {
  const c = s.turn;
  s.awaitConfirm = false;
  s.last = { color: c, dice: s.dice, moves: s.moves, ...(auto ? { auto } : {}) };
  if (s.board.off[c] === CHECKERS) {
    const points = gamePoints(s.board, c);
    s.score[c] += points;
    s.lastGame = { winner: c, points };
    if (s.score[c] >= target) return c;
    newGame(s);
    return null;
  }
  rollFor(s, other(c));
  return null;
}

const colorOf = (g: Row, guestId: string): Color | null =>
  g.whiteGuestId === guestId ? "w" : g.blackGuestId === guestId ? "b" : null;
const guestOf = (g: Row, c: Color) => (c === "w" ? g.whiteGuestId : g.blackGuestId);

/**
 * Applies the clock: when the player to move is at the board and lets 15 s pass, their turn
 * is played for them; the third time they lose by forfeit. A player who left the board pauses
 * the clock until they come back. Returns the columns to update (or null).
 */
function tick(g: Row, now: Date): Partial<Row> | null {
  if (g.status !== "playing") return null;
  const s = g.state as unknown as GameState;
  const seen = s.turn === "w" ? g.whiteSeenAt : g.blackSeenAt;
  const present = Boolean(seen && now.getTime() - seen.getTime() < PRESENT_MS);
  const deadline = g.turnDeadline;
  if (!deadline) return { turnDeadline: new Date(now.getTime() + TURN_MS) };
  if (now < deadline) return null;
  if (s.awaitConfirm) {
    // Everything was played and not undone: the turn passes (no penalty).
    const winner = endTurn(s, g.targetPoints);
    if (winner) return finish(s, guestOf(g, winner), "points");
    return { state: s as unknown as Row["state"], turnDeadline: new Date(now.getTime() + TURN_MS) };
  }
  if (!present) return { turnDeadline: new Date(now.getTime() + TURN_MS) }; // paused
  const mover = s.turn;
  const play = autoPlay(s.board, mover, s.remaining);
  s.board = play.board;
  s.moves = [...s.moves, ...play.moves];
  s.strikes[mover]++;
  if (s.strikes[mover] >= MAX_STRIKES) {
    s.last = { color: mover, dice: s.dice, moves: s.moves, auto: true };
    return finish(s, guestOf(g, other(mover)), "forfeit");
  }
  const winner = endTurn(s, g.targetPoints, true);
  if (winner) return finish(s, guestOf(g, winner), "points");
  return { state: s as unknown as Row["state"], turnDeadline: new Date(now.getTime() + TURN_MS) };
}

function finish(
  s: GameState,
  winnerGuestId: string | null,
  reason: "points" | "forfeit" | "resign",
): Partial<Row> {
  return {
    state: s as unknown as Row["state"],
    status: "finished",
    winnerGuestId,
    finishReason: reason,
    finishedAt: new Date(),
    turnDeadline: null,
  };
}

const playerName = (guest: GuestContext) =>
  (guest.participant.displayName?.trim() || `#${guest.participant.seq}`).slice(0, 60);

async function lockGame(tx: DbOrTx, guest: GuestContext, id: string) {
  const [g] = await tx
    .select()
    .from(games)
    .where(and(eq(games.id, id), eq(games.restaurantId, guest.restaurant.id)))
    .for("update");
  if (!g) throw new AppError("NOT_FOUND", "game_not_found");
  return g;
}

async function save(tx: DbOrTx, g: Row, patch: Partial<Row>) {
  if (!Object.keys(patch).length) return g;
  const [next] = await tx
    .update(games)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(games.id, g.id))
    .returning();
  await emit(tx, { topic: topics.games(g.restaurantId), type: "game.updated", data: { id: g.id } });
  return next!;
}

// ─── Lobby ──────────────────────────────────────────────────────────────────────────────

export const createGameSchema = z.object({ target: z.union([z.literal(3), z.literal(5)]) });

/** "I want to play": an open game other guests see (one open game per guest). */
export async function createGame(db: Database, guest: GuestContext, raw: z.input<typeof createGameSchema>) {
  const { target } = createGameSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [mine] = await tx
      .select()
      .from(games)
      .where(
        and(
          eq(games.restaurantId, guest.restaurant.id),
          eq(games.whiteGuestId, guest.guestId),
          eq(games.status, "open"),
        ),
      );
    if (mine) {
      if (mine.targetPoints === target) return mine;
      return save(tx, mine, { targetPoints: target });
    }
    const [g] = await tx
      .insert(games)
      .values({
        restaurantId: guest.restaurant.id,
        targetPoints: target,
        whiteGuestId: guest.guestId,
        whiteName: playerName(guest),
        whiteTable: guest.table.label.slice(0, 30),
        whiteSeenAt: new Date(),
        state: {} as Row["state"],
      })
      .returning();
    await emit(tx, { topic: topics.games(guest.restaurant.id), type: "game.updated", data: { id: g!.id } });
    return g!;
  });
}

export async function joinGame(db: Database, guest: GuestContext, id: string) {
  return db.transaction(async (tx) => {
    const g = await lockGame(tx, guest, id);
    if (colorOf(g, guest.guestId)) return g; // already a player
    if (g.status !== "open" || Date.now() - g.createdAt.getTime() > OPEN_TTL_MS)
      throw new AppError("CONFLICT", "game_taken");
    const now = new Date();
    return save(tx, g, {
      status: "playing",
      blackGuestId: guest.guestId,
      blackName: playerName(guest),
      blackTable: guest.table.label.slice(0, 30),
      blackSeenAt: now,
      whiteSeenAt: g.whiteSeenAt ?? now,
      state: freshState() as unknown as Row["state"],
      turnDeadline: new Date(now.getTime() + TURN_MS),
    });
  });
}

/** The creator withdraws an open game nobody joined yet. */
export async function cancelGame(db: Database, guest: GuestContext, id: string) {
  return db.transaction(async (tx) => {
    const g = await lockGame(tx, guest, id);
    if (g.status !== "open" || g.whiteGuestId !== guest.guestId)
      throw new AppError("CONFLICT", "not_allowed");
    return save(tx, g, { status: "cancelled" });
  });
}

/** Wins of each player in this restaurant (shown next to their names). */
export async function winsOf(db: DbOrTx, restaurantId: string, guestIds: string[]) {
  const ids = [...new Set(guestIds.filter(Boolean))];
  if (!ids.length) return new Map<string, number>();
  const rows = await db
    .select({ id: games.winnerGuestId, n: count() })
    .from(games)
    .where(and(eq(games.restaurantId, restaurantId), inArray(games.winnerGuestId, ids)))
    .groupBy(games.winnerGuestId);
  return new Map(rows.map((r) => [r.id!, Number(r.n)]));
}

/** Open requests from other guests, the guest's own games, and the count for the menu badge. */
export async function gamesLobby(db: Database, guest: GuestContext) {
  const rid = guest.restaurant.id;
  const now = Date.now();
  // Housekeeping: stale open games and idle matches.
  await db
    .update(games)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(games.restaurantId, rid),
        eq(games.status, "open"),
        lt(games.createdAt, new Date(now - OPEN_TTL_MS)),
      ),
    );
  await db
    .update(games)
    .set({ status: "abandoned", turnDeadline: null, updatedAt: new Date() })
    .where(
      and(
        eq(games.restaurantId, rid),
        eq(games.status, "playing"),
        lt(
          sql`greatest(${games.whiteSeenAt}, ${games.blackSeenAt}, ${games.updatedAt})`,
          new Date(now - IDLE_TTL_MS),
        ),
      ),
    );

  const rows = await db
    .select()
    .from(games)
    .where(
      and(
        eq(games.restaurantId, rid),
        or(
          eq(games.status, "open"),
          and(
            or(eq(games.whiteGuestId, guest.guestId), eq(games.blackGuestId, guest.guestId)),
            or(
              eq(games.status, "playing"),
              and(eq(games.status, "finished"), sql`${games.finishedAt} > now() - interval '3 hours'`),
            ),
          ),
        ),
      ),
    )
    .orderBy(desc(games.updatedAt))
    .limit(40);
  const wins = await winsOf(
    db,
    rid,
    rows.flatMap((r) => [r.whiteGuestId, r.blackGuestId ?? ""]),
  );
  const card = (r: Row) => ({
    id: r.id,
    status: r.status,
    target: r.targetPoints,
    createdAt: r.createdAt,
    white: { name: r.whiteName, table: r.whiteTable, wins: wins.get(r.whiteGuestId) ?? 0 },
    black: r.blackGuestId
      ? { name: r.blackName ?? "", table: r.blackTable, wins: wins.get(r.blackGuestId) ?? 0 }
      : null,
    mine: colorOf(r, guest.guestId) != null,
    myTurn: r.status === "playing" && (r.state as unknown as GameState).turn === colorOf(r, guest.guestId),
    won: r.status === "finished" ? r.winnerGuestId === guest.guestId : null,
    score: r.status === "open" ? null : (r.state as unknown as GameState).score,
  });
  const cards = rows.map(card);
  return {
    open: cards.filter((c) => c.status === "open" && !c.mine),
    mine: cards.filter((c) => c.mine),
    openCount: cards.filter((c) => c.status === "open" && !c.mine).length,
    myWins: (await winsOf(db, rid, [guest.guestId])).get(guest.guestId) ?? 0,
  };
}

/** Just the badge: open requests from other guests, and games where it is the guest's turn. */
export async function gamesBadge(db: Database, guest: GuestContext) {
  const rid = guest.restaurant.id;
  const [open] = await db
    .select({ n: count() })
    .from(games)
    .where(
      and(
        eq(games.restaurantId, rid),
        eq(games.status, "open"),
        ne(games.whiteGuestId, guest.guestId),
        sql`${games.createdAt} > now() - interval '30 minutes'`,
      ),
    );
  const [playing] = await db
    .select({ n: count() })
    .from(games)
    .where(
      and(
        eq(games.restaurantId, rid),
        eq(games.status, "playing"),
        or(eq(games.whiteGuestId, guest.guestId), eq(games.blackGuestId, guest.guestId)),
      ),
    );
  return { open: Number(open?.n ?? 0), playing: Number(playing?.n ?? 0) };
}

// ─── At the board ───────────────────────────────────────────────────────────────────────

async function view(db: DbOrTx, g: Row, guest: GuestContext) {
  const me = colorOf(g, guest.guestId);
  const s = g.status === "open" ? null : (g.state as unknown as GameState);
  const wins = await winsOf(db, g.restaurantId, [g.whiteGuestId, g.blackGuestId ?? ""]);
  const now = Date.now();
  const present = (d: Date | null) => Boolean(d && now - d.getTime() < PRESENT_MS);
  return {
    id: g.id,
    status: g.status as "open" | "playing" | "finished" | "cancelled" | "abandoned",
    target: g.targetPoints,
    me,
    players: {
      w: {
        name: g.whiteName,
        table: g.whiteTable,
        wins: wins.get(g.whiteGuestId) ?? 0,
        present: present(g.whiteSeenAt),
        strikes: s?.strikes.w ?? 0,
      },
      b: g.blackGuestId
        ? {
            name: g.blackName ?? "",
            table: g.blackTable,
            wins: wins.get(g.blackGuestId) ?? 0,
            present: present(g.blackSeenAt),
            strikes: s?.strikes.b ?? 0,
          }
        : null,
    },
    state: s
      ? {
          board: s.board,
          turn: s.turn,
          dice: s.dice,
          remaining: s.remaining,
          moves: s.moves,
          last: s.last,
          score: s.score,
          gameNo: s.gameNo,
          lastGame: s.lastGame,
          turnNo: s.turnNo,
          awaitConfirm: Boolean(s.awaitConfirm),
          /** Lets the board replay the turn's moves locally (instant taps, undo). */
          turnBoard: s.turnBoard ?? null,
        }
      : null,
    legal:
      s && g.status === "playing" && me === s.turn && !s.awaitConfirm
        ? legalMoves(s.board, s.turn, s.remaining)
        : [],
    canUndo: Boolean(s && g.status === "playing" && me === s.turn && s.moves.length && s.turnBoard),
    deadline: g.turnDeadline?.getTime() ?? null,
    serverNow: now,
    winner: (g.status === "finished"
      ? g.winnerGuestId === g.whiteGuestId
        ? "w"
        : "b"
      : null) as Color | null,
    finishReason: g.finishReason as "points" | "forfeit" | "resign" | null,
    maxStrikes: MAX_STRIKES,
    confirmSeconds: CONFIRM_MS / 1000,
    turnSeconds: TURN_MS / 1000,
  };
}
export type GameView = Awaited<ReturnType<typeof view>>;

/**
 * The screen of a game: marks the guest as at the board (their clock runs), applies the
 * clock, and returns what to draw. Called on load and every few seconds while open.
 */
export async function gameHeartbeat(db: Database, guest: GuestContext, id: string) {
  return db.transaction(async (tx) => {
    let g = await lockGame(tx, guest, id);
    const me = colorOf(g, guest.guestId);
    const now = new Date();
    const patch: Partial<Row> = {};
    if (me === "w") patch.whiteSeenAt = now;
    if (me === "b") patch.blackSeenAt = now;
    // Seen first, so a player coming back gets a fresh 15 s instead of an instant auto-play.
    const wasPresent = (() => {
      const seen = me === "w" ? g.whiteSeenAt : me === "b" ? g.blackSeenAt : null;
      return Boolean(seen && now.getTime() - seen.getTime() < PRESENT_MS);
    })();
    const s = g.status === "playing" ? (g.state as unknown as GameState) : null;
    if (s && me && s.turn === me && !wasPresent) patch.turnDeadline = new Date(now.getTime() + TURN_MS);
    if (Object.keys(patch).length) {
      // Presence alone does not need an event.
      [g] = (await tx.update(games).set(patch).where(eq(games.id, g.id)).returning()) as [Row];
    }
    const ticked = tick(g, now);
    if (ticked) g = await save(tx, g, ticked);
    return view(tx, g, guest);
  });
}

export const moveSchema = z.object({
  from: z.union([z.literal("bar"), z.number().int().min(0).max(23)]),
  die: z.number().int().min(1).max(6),
  turnNo: z.number().int().optional(),
});

/** One checker moved by one die (the turn ends by itself when no die is left to play). */
export async function playMove(
  db: Database,
  guest: GuestContext,
  id: string,
  raw: z.input<typeof moveSchema>,
) {
  const input = moveSchema.parse(raw);
  return db.transaction(async (tx) => {
    const g = await lockGame(tx, guest, id);
    if (g.status !== "playing") throw new AppError("CONFLICT", "game_over");
    const me = colorOf(g, guest.guestId);
    const s = g.state as unknown as GameState;
    if (!me || s.turn !== me) throw new AppError("CONFLICT", "not_your_turn");
    if (input.turnNo != null && input.turnNo !== s.turnNo) throw new AppError("CONFLICT", "stale");
    const allowed = legalMoves(s.board, me, s.remaining).some(
      (m) => m.from === input.from && m.die === input.die,
    );
    const r = allowed ? tryMove(s.board, me, input.from, input.die) : null;
    if (!r) throw new AppError("VALIDATION", "illegal_move");
    s.board = r.board;
    s.moves.push(r.move);
    s.remaining.splice(s.remaining.indexOf(input.die), 1);
    const now = new Date();
    const done = !s.remaining.length || !legalMoves(s.board, me, s.remaining).length;
    let patch: Partial<Row>;
    if (done && s.board.off[me] === CHECKERS) {
      // The last checker is off: the game is won at once.
      const winner = endTurn(s, g.targetPoints);
      patch = winner
        ? finish(s, guestOf(g, winner), "points")
        : { state: s as unknown as Row["state"], turnDeadline: new Date(now.getTime() + TURN_MS) };
    } else {
      // All dice played: a few seconds to undo or confirm.
      s.awaitConfirm = done;
      patch = {
        state: s as unknown as Row["state"],
        [me === "w" ? "whiteSeenAt" : "blackSeenAt"]: now,
        turnDeadline: new Date(now.getTime() + (done ? CONFIRM_MS : TURN_MS)),
      };
    }
    return view(tx, await save(tx, g, patch), guest);
  });
}

/** Takes back the last move of the turn (until the turn is confirmed). */
export async function undoMove(db: Database, guest: GuestContext, id: string) {
  return db.transaction(async (tx) => {
    const g = await lockGame(tx, guest, id);
    const me = colorOf(g, guest.guestId);
    const s = g.state as unknown as GameState;
    if (g.status !== "playing" || !me || s.turn !== me || !s.moves.length || !s.turnBoard)
      throw new AppError("CONFLICT", "nothing_to_undo");
    const keep = s.moves.slice(0, -1);
    let board = structuredClone(s.turnBoard);
    const remaining = diceToPlay(s.dice as [number, number]);
    for (const m of keep) {
      const r = tryMove(board, me, m.from, m.die);
      if (!r) throw new AppError("INTERNAL", "undo_failed");
      board = r.board;
      remaining.splice(remaining.indexOf(m.die), 1);
    }
    s.board = board;
    s.moves = keep;
    s.remaining = remaining;
    s.awaitConfirm = false;
    const now = new Date();
    return view(
      tx,
      await save(tx, g, {
        state: s as unknown as Row["state"],
        [me === "w" ? "whiteSeenAt" : "blackSeenAt"]: now,
        turnDeadline: new Date(now.getTime() + TURN_MS),
      }),
      guest,
    );
  });
}

/** "Done": the played turn passes to the opponent. */
export async function confirmTurn(db: Database, guest: GuestContext, id: string) {
  return db.transaction(async (tx) => {
    const g = await lockGame(tx, guest, id);
    const me = colorOf(g, guest.guestId);
    const s = g.state as unknown as GameState;
    if (g.status !== "playing" || !me || s.turn !== me || !s.awaitConfirm)
      throw new AppError("CONFLICT", "not_allowed");
    const winner = endTurn(s, g.targetPoints);
    const now = new Date();
    const patch: Partial<Row> = winner
      ? finish(s, guestOf(g, winner), "points")
      : { state: s as unknown as Row["state"], turnDeadline: new Date(now.getTime() + TURN_MS) };
    return view(tx, await save(tx, g, patch), guest);
  });
}

/** Gives up the match: the opponent wins. */
export async function resignGame(db: Database, guest: GuestContext, id: string) {
  return db.transaction(async (tx) => {
    const g = await lockGame(tx, guest, id);
    const me = colorOf(g, guest.guestId);
    if (!me || g.status !== "playing") throw new AppError("CONFLICT", "not_allowed");
    return view(
      tx,
      await save(tx, g, finish(g.state as unknown as GameState, guestOf(g, other(me)), "resign")),
      guest,
    );
  });
}

/** Test hook: the clock as if `now` were later. */
export async function tickAt(db: Database, guest: GuestContext, id: string, now: Date) {
  return db.transaction(async (tx) => {
    let g = await lockGame(tx, guest, id);
    const ticked = tick(g, now);
    if (ticked) g = await save(tx, g, ticked);
    return view(tx, g, guest);
  });
}
