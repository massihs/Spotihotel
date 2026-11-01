import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { games } from "@/server/db/schema";
import { createTable } from "@/server/modules/tables/service";
import { enterTableByQr, loadGuestContext } from "@/server/modules/guest/sessions";
import {
  cancelGame,
  createGame,
  gameHeartbeat,
  gamesBadge,
  gamesLobby,
  joinGame,
  confirmTurn,
  playMove,
  resignGame,
  undoMove,
  tickAt,
  TURN_MS,
} from "@/server/modules/games/service";
import { loadRestaurantContext } from "@/server/tenancy";
import { createOwnerWithRestaurant } from "../helpers/factories";

async function setup() {
  const owner = await createOwnerWithRestaurant("Game café");
  const ctx = await loadRestaurantContext(db, owner.sessionUser, owner.restaurant.id);
  const t1 = await createTable(db, ctx, { label: "1" });
  const t2 = await createTable(db, ctx, { label: "2" });
  const seat = async (qr: string) => {
    const id = randomUUID();
    const e = await enterTableByQr(db, qr, id);
    return (await loadGuestContext(db, id, e!.participant.id))!;
  };
  return { a: await seat(t1.qrToken), b: await seat(t2.qrToken), c: await seat(t2.qrToken) };
}

describe("backgammon between guests", () => {
  it("open request → badge for the others → join → legal moves only, in turn", async () => {
    const { a, b, c } = await setup();
    const g = await createGame(db, a, { target: 3 });
    expect((await createGame(db, a, { target: 3 })).id).toBe(g.id); // one open game per guest
    expect((await gamesBadge(db, b)).open).toBe(1);
    expect((await gamesBadge(db, a)).open).toBe(0); // not your own request
    expect((await gamesLobby(db, b)).open[0]).toMatchObject({ id: g.id, target: 3, white: { table: "1" } });

    const v = (await joinGame(db, b, g.id)) && (await gameHeartbeat(db, b, g.id));
    expect(v.status).toBe("playing");
    expect(v.me).toBe("b");
    await expect(joinGame(db, c, g.id)).rejects.toMatchObject({ message: "game_taken" });
    expect((await gamesBadge(db, c)).open).toBe(0);

    // Only the player to move can move, and only legally.
    const turn = v.state!.turn;
    const mover = turn === "w" ? a : b;
    const waiter = turn === "w" ? b : a;
    const mv = await gameHeartbeat(db, mover, g.id);
    expect(mv.legal.length).toBeGreaterThan(0);
    await expect(playMove(db, waiter, g.id, { from: 5, die: 1 })).rejects.toMatchObject({
      message: "not_your_turn",
    });
    await expect(playMove(db, mover, g.id, { from: 2, die: 6 })).rejects.toMatchObject({
      message: "illegal_move",
    });
    // Undo: back to the position before the move, same dice left.
    const first = mv.legal[0]!;
    const one = await playMove(db, mover, g.id, { from: first.from, die: first.die });
    expect(one.canUndo).toBe(true);
    const back = await undoMove(db, mover, g.id);
    expect(back.state!.board).toEqual(mv.state!.board);
    expect(back.state!.remaining.sort()).toEqual(mv.state!.remaining.sort());
    await expect(undoMove(db, mover, g.id)).rejects.toMatchObject({ message: "nothing_to_undo" });

    let state = back;
    while (state.legal.length) {
      const m = state.legal[0]!;
      state = await playMove(db, mover, g.id, { from: m.from, die: m.die });
    }
    // All dice played: the turn waits for "Done" (or an undo).
    expect(state.state!.awaitConfirm).toBe(true);
    expect(state.state!.turn).toBe(turn);
    const done = await confirmTurn(db, mover, g.id);
    expect(done.state!.turn).not.toBe(turn);
    expect(done.state!.last?.color).toBe(turn);
  });

  it("15 s of inactivity plays the turn; the third time the opponent wins; wins are counted", async () => {
    const { a, b } = await setup();
    const g = await createGame(db, a, { target: 5 });
    await joinGame(db, b, g.id);
    for (let i = 0; i < 3; i++) {
      const [row] = await db.select().from(games).where(eq(games.id, g.id));
      const now = new Date(row!.turnDeadline!.getTime() + 1000);
      // Both players at the board (their screens pinged just now).
      await db.update(games).set({ whiteSeenAt: now, blackSeenAt: now }).where(eq(games.id, g.id));
      const before = (row!.state as { turn: "w" | "b" }).turn;
      const v = await tickAt(db, a, g.id, now);
      if (v.status === "finished") {
        expect(v.finishReason).toBe("forfeit");
        break;
      }
      expect(v.state!.last?.auto).toBe(true);
      expect(v.state!.last?.color).toBe(before);
    }
    // Keep timing out the same player until the forfeit.
    let v = await gameHeartbeat(db, a, g.id);
    for (let i = 0; i < 10 && v.status === "playing"; i++) {
      const [row] = await db.select().from(games).where(eq(games.id, g.id));
      const now = new Date(row!.turnDeadline!.getTime() + 1000);
      await db.update(games).set({ whiteSeenAt: now, blackSeenAt: now }).where(eq(games.id, g.id));
      v = await tickAt(db, a, g.id, now);
    }
    expect(v.status).toBe("finished");
    expect(v.finishReason).toBe("forfeit");
    const loser = v.players.w.strikes >= 3 ? "w" : "b";
    expect(v.winner).toBe(loser === "w" ? "b" : "w");
    const winnerGuest = v.winner === "w" ? a : b;
    expect((await gamesLobby(db, winnerGuest)).myWins).toBe(1);
  });

  it("a player who left pauses the clock; resign and cancel", async () => {
    const { a, b } = await setup();
    const g = await createGame(db, a, { target: 3 });
    await joinGame(db, b, g.id);
    const [row] = await db.select().from(games).where(eq(games.id, g.id));
    // Nobody at the board for a minute: no auto-play, the deadline just moves.
    const later = new Date(row!.turnDeadline!.getTime() + 60_000);
    await db
      .update(games)
      .set({
        whiteSeenAt: new Date(later.getTime() - 5 * 60_000),
        blackSeenAt: new Date(later.getTime() - 5 * 60_000),
      })
      .where(eq(games.id, g.id));
    const v = await tickAt(db, a, g.id, later);
    expect(v.status).toBe("playing");
    expect(v.state!.last).toBeNull();
    expect(v.deadline).toBe(later.getTime() + TURN_MS);

    const r = await resignGame(db, a, g.id);
    expect(r).toMatchObject({ status: "finished", finishReason: "resign", winner: "b" });

    const open = await createGame(db, a, { target: 5 });
    await expect(cancelGame(db, b, open.id)).rejects.toMatchObject({ message: "not_allowed" });
    expect((await cancelGame(db, a, open.id)).status).toBe("cancelled");
  });
});
