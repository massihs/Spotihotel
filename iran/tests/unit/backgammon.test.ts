import { describe, expect, it } from "vitest";
import {
  autoPlay,
  diceToPlay,
  gamePoints,
  initialBoard,
  legalMoves,
  legalSequences,
  pips,
  tryMove,
  type Board,
} from "@/lib/backgammon";

const empty = (): Board => ({ points: Array(24).fill(0), bar: { w: 0, b: 0 }, off: { w: 0, b: 0 } });
const count = (b: Board, c: "w" | "b") =>
  b.points.reduce((s, v) => s + (c === "w" ? Math.max(v, 0) : Math.max(-v, 0)), 0) + b.bar[c] + b.off[c];

describe("backgammon rules", () => {
  it("starts with 15 checkers each and 167 pips", () => {
    const b = initialBoard();
    expect(count(b, "w")).toBe(15);
    expect(count(b, "b")).toBe(15);
    expect(pips(b, "w")).toBe(167);
    expect(pips(b, "b")).toBe(167);
  });

  it("plays both dice, keeps checker counts, and the classic 3-1 makes the 5 point", () => {
    const seqs = legalSequences(initialBoard(), "w", [3, 1]);
    expect(seqs.every((s) => s.moves.length === 2)).toBe(true);
    expect(seqs.every((s) => count(s.board, "w") === 15)).toBe(true);
    expect(seqs.some((s) => s.board.points[4] === 2)).toBe(true); // 8/5 6/5
    expect(legalSequences(initialBoard(), "b", diceToPlay([6, 6])).every((s) => s.moves.length === 4)).toBe(
      true,
    );
  });

  it("blocks points with two opposing checkers and hits a blot", () => {
    const b = empty();
    b.points[10] = 1;
    b.points[7] = -2;
    b.points[8] = -1;
    expect(tryMove(b, "w", 10, 3)).toBeNull();
    const hit = tryMove(b, "w", 10, 2)!;
    expect(hit.move.hit).toBe(true);
    expect(hit.board.bar.b).toBe(1);
    expect(hit.board.points[8]).toBe(1);
  });

  it("must enter from the bar first, and passes when it cannot", () => {
    const b = initialBoard();
    b.points[23] = 1;
    b.bar.w = 1;
    expect(legalMoves(b, "w", [6, 5]).every((m) => m.from === "bar")).toBe(true);
    // Black's home fully closed: White cannot enter.
    const closed = empty();
    closed.bar.w = 1;
    for (let i = 18; i < 24; i++) closed.points[i] = -2;
    expect(legalMoves(closed, "w", [3, 4])).toEqual([]);
  });

  it("bears off exactly or with a higher die from the farthest checker only", () => {
    const b = empty();
    b.points[4] = 1; // 5 point
    b.points[1] = 1; // 2 point
    b.off.w = 13;
    expect(tryMove(b, "w", 1, 6)).toBeNull(); // a checker is farther (5 point)
    expect(tryMove(b, "w", 4, 6)?.move.to).toBe("off");
    expect(tryMove(b, "w", 1, 2)?.move.to).toBe("off");
    const notHome = initialBoard();
    expect(tryMove(notHome, "w", 5, 6)?.move.to).not.toBe("off");
  });

  it("with one die playable out of two, plays the higher one", () => {
    const b = empty();
    b.points[13] = 1;
    b.points[12] = -2; // 1 blocked
    b.points[7] = -2; // 6 then 1 blocked... only one die playable
    b.points[6] = -2;
    const seqs = legalSequences(b, "w", [6, 1]);
    expect(seqs.every((s) => s.moves.length <= 1)).toBe(true);
  });

  it("scores single, gammon and backgammon", () => {
    const b = empty();
    b.off.w = 15;
    b.off.b = 3;
    expect(gamePoints(b, "w")).toBe(1);
    b.off.b = 0;
    b.points[20] = -15;
    expect(gamePoints(b, "w")).toBe(2);
    b.points[20] = -14;
    b.points[2] = -1; // in White's home
    expect(gamePoints(b, "w")).toBe(3);
  });

  it("auto-play picks a complete legal play", () => {
    const b = initialBoard();
    const s = autoPlay(b, "w", diceToPlay([6, 6]));
    expect(s.moves).toHaveLength(4);
    expect(count(s.board, "w")).toBe(15);
  });

  it("doubles: every checker that can start the play is offered, the front one too", () => {
    // Black (moving up) on 17, 18, 21, 22: with 1-1 the checker on 22 may move first
    // (22→23 then 21→22 reaches the same position as the other order).
    const b = empty();
    b.points[16] = -2;
    b.points[17] = -2;
    b.points[18] = -5;
    b.points[20] = -2;
    b.points[21] = -1;
    b.points[11] = -3;
    b.points[0] = 2;
    b.points[5] = 13;
    const froms = legalMoves(b, "b", diceToPlay([1, 1])).map((m) => m.from);
    expect(froms).toEqual(expect.arrayContaining([16, 17, 18, 20, 21]));
    // Two taps on the front checker (to the last point), then two on the next one.
    let cur = b;
    const left = diceToPlay([1, 1]);
    for (const from of [21, 22, 20, 21]) {
      const m = legalMoves(cur, "b", left).find((x) => x.from === from);
      expect(m, `tap from ${from}`).toBeDefined();
      cur = tryMove(cur, "b", from, 1)!.board;
      left.pop();
    }
    expect(cur.points[23]).toBe(-1);
    expect(cur.points[22]).toBe(-1);
    expect(cur.points[20]).toBe(-1);
  });

  it("legal first moves match a brute-force search on random positions", () => {
    const brute = (b: Board, c: "w" | "b", dice: number[]) => {
      let max = 0;
      const firsts = new Set<string>();
      const walk = (bd: Board, left: number[], depth: number, first: string | null) => {
        let moved = false;
        for (const die of new Set(left)) {
          const rest = [...left];
          rest.splice(rest.indexOf(die), 1);
          for (const f of [...Array(24).keys(), "bar" as const]) {
            const r = tryMove(bd, c, f, die);
            if (!r) continue;
            moved = true;
            walk(r.board, rest, depth + 1, first ?? `${r.move.from}>${die}`);
          }
        }
        if (!moved && first) {
          if (depth > max) ((max = depth), firsts.clear());
          if (depth === max) firsts.add(first);
        }
      };
      walk(b, dice, 0, null);
      let out = [...firsts];
      if (max === 1 && dice.length === 2 && dice[0] !== dice[1]) {
        const high = `>${Math.max(...dice)}`;
        if (out.some((k) => k.endsWith(high))) out = out.filter((k) => k.endsWith(high));
      }
      return out.sort();
    };
    let b = initialBoard();
    let c: "w" | "b" = "w";
    for (let turn = 0; turn < 60 && b.off.w < 15 && b.off.b < 15; turn++) {
      for (const d of [
        [1, 1],
        [2, 2],
        [3, 1],
        [6, 5],
      ] as [number, number][]) {
        const got = legalMoves(b, c, diceToPlay(d))
          .map((m) => `${m.from}>${m.die}`)
          .sort();
        expect(got).toEqual(brute(b, c, diceToPlay(d)));
      }
      b = autoPlay(b, c, diceToPlay([1 + (turn % 6), 1 + ((turn * 5) % 6)])).board;
      c = c === "w" ? "b" : "w";
    }
  });
});
