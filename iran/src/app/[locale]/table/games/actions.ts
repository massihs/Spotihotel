"use server";

import { runAction } from "@/server/actions";
import { db } from "@/server/db/client";
import { enforceRateLimit } from "@/server/infra/rate-limit";
import {
  cancelGame,
  confirmTurn,
  createGame,
  gameHeartbeat,
  gamesBadge,
  joinGame,
  playMove,
  resignGame,
  undoMove,
} from "@/server/modules/games/service";
import { getGuest, requireGuest } from "@/server/modules/guest/current";

async function player() {
  const g = await requireGuest();
  await enforceRateLimit("game", g.guestId);
  return g;
}

/** Badge next to the waiter bell: open requests from other guests (+ the guest's own games). */
export async function gamesBadgeAction() {
  const g = await getGuest();
  if (!g) return { open: 0, playing: 0 };
  return gamesBadge(db, g);
}

export async function createGameAction(target: number) {
  return runAction(async () => {
    const g = await player();
    const game = await createGame(db, g, { target: target === 5 ? 5 : 3 });
    return { id: game.id };
  });
}

export async function joinGameAction(id: string) {
  return runAction(async () => {
    const g = await player();
    await joinGame(db, g, id);
    return { id };
  });
}

export async function cancelGameAction(id: string) {
  return runAction(async () => {
    const g = await player();
    await cancelGame(db, g, id);
  });
}

export async function heartbeatAction(id: string) {
  return runAction(async () => gameHeartbeat(db, await player(), id));
}

export async function moveAction(id: string, from: number | "bar", die: number, turnNo: number) {
  return runAction(async () => playMove(db, await player(), id, { from, die, turnNo }));
}

export async function resignAction(id: string) {
  return runAction(async () => resignGame(db, await player(), id));
}

export async function undoAction(id: string) {
  return runAction(async () => undoMove(db, await player(), id));
}

export async function confirmAction(id: string) {
  return runAction(async () => confirmTurn(db, await player(), id));
}
