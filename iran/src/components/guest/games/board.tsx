"use client";

import {
  ArrowLeftRight,
  Check,
  ChevronLeft,
  Crown,
  Flag,
  MoreVertical,
  Trophy,
  Undo2,
  Volume2,
  VolumeX,
  WifiOff,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  confirmAction,
  heartbeatAction,
  joinGameAction,
  moveAction,
  resignAction,
  undoAction,
} from "@/app/[locale]/table/games/actions";
import { useLiveEvent } from "@/components/realtime/live";
import { Link } from "@/i18n/navigation";
import {
  diceToPlay,
  legalMoves,
  tryMove,
  type Board,
  type Color,
  type From,
  type Move,
} from "@/lib/backgammon";
import { cn } from "@/lib/cn";
import type { GameView } from "@/server/modules/games/service";

// Game art: fixed colours (a game table, the same in light and dark mode).
const WOOD = "linear-gradient(145deg,#8a5a34 0%,#6b4226 45%,#4b2c18 100%)";
const FELT = "radial-gradient(120% 90% at 50% 40%,#1f6b5c 0%,#145145 55%,#0d3a32 100%)";
const TRI = ["linear-gradient(180deg,#f6ead0,#e3d1ab)", "linear-gradient(180deg,#ef7d5a,#c2502f)"];
const TRI_UP = ["linear-gradient(0deg,#f6ead0,#e3d1ab)", "linear-gradient(0deg,#ef7d5a,#c2502f)"];
const CHECKER: Record<Color, { bg: string; edge: string; text: string }> = {
  w: {
    bg: "radial-gradient(circle at 32% 28%,#ffffff 0%,#f4efe4 38%,#d9cfbb 100%)",
    edge: "#b8ab90",
    text: "#3b3324",
  },
  b: {
    bg: "radial-gradient(circle at 32% 28%,#6d6a7a 0%,#2c2a36 42%,#141219 100%)",
    edge: "#0b0a10",
    text: "#f1efe9",
  },
};
const AVATAR = [
  "linear-gradient(135deg,#7c3aed,#c026d3)",
  "linear-gradient(135deg,#0ea5e9,#2563eb)",
  "linear-gradient(135deg,#f59e0b,#ea580c)",
  "linear-gradient(135deg,#10b981,#0d9488)",
  "linear-gradient(135deg,#f43f5e,#be123c)",
];
const avatarOf = (name: string) =>
  AVATAR[[...name].reduce((s, ch) => s + ch.charCodeAt(0), 0) % AVATAR.length]!;

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function Die({
  value,
  used,
  active,
  size,
  delay = 0,
}: {
  value: number;
  used?: boolean;
  active?: boolean;
  size: number;
  delay?: number;
}) {
  return (
    <span
      className={cn(
        "animate-dice-roll grid grid-cols-3 grid-rows-3 rounded-[22%] p-[14%] transition-[opacity,scale,translate] duration-200",
        used ? "scale-90 opacity-35" : active ? "-translate-y-0.5" : "",
      )}
      style={{
        animationDelay: `${delay}ms`,
        width: size,
        height: size,
        background: "linear-gradient(145deg,#ffffff,#e6e3ee)",
        boxShadow: active
          ? "0 0 0 3px #facc15, 0 6px 14px rgba(0,0,0,.45)"
          : "0 4px 10px rgba(0,0,0,.4), inset 0 -2px 0 rgba(0,0,0,.08)",
      }}
      aria-label={String(value)}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className="grid place-items-center">
          {PIPS[value]?.includes(i) ? (
            <span className="rounded-full bg-[#1d1b26]" style={{ width: size * 0.15, height: size * 0.15 }} />
          ) : null}
        </span>
      ))}
    </span>
  );
}

function Checker({
  color,
  size,
  label,
  glow,
}: {
  color: Color;
  size: number;
  label?: string;
  glow?: boolean;
}) {
  const c = CHECKER[color];
  return (
    <span
      className="relative grid place-items-center rounded-full font-bold"
      style={{
        width: size,
        height: size,
        background: c.bg,
        boxShadow: `0 2px 0 ${c.edge}, 0 4px 6px rgba(0,0,0,.45)${glow ? ", 0 0 0 3px #facc15, 0 0 14px 2px rgba(250,204,21,.7)" : ""}`,
        color: c.text,
        fontSize: size * 0.38,
      }}
    >
      {/* Engraved inner ring, like real checkers. */}
      <span
        className="absolute rounded-full"
        style={{
          inset: size * 0.17,
          boxShadow: `inset 0 0 0 1.5px ${color === "w" ? "#cfc3a8" : "#45424f"}`,
        }}
      />
      <span className="relative">{label}</span>
    </span>
  );
}

/** Round avatar with the turn clock as a ring around it (Plato style). */
function Avatar({
  name,
  size,
  progress,
  warn,
}: {
  name: string;
  size: number;
  progress: number | null;
  warn?: boolean;
}) {
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative shrink-0" style={{ width: size, height: size }}>
      <span
        className="absolute grid place-items-center rounded-full font-extrabold text-white"
        style={{ inset: 5, background: avatarOf(name), fontSize: size * 0.36 }}
      >
        {[...name.trim()][0]?.toUpperCase() ?? "?"}
      </span>
      {progress != null ? (
        <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden="true">
          <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="6" />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={warn ? "#f43f5e" : "#facc15"}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${c * progress} ${c}`}
            style={{ transition: "stroke-dasharray .25s linear" }}
          />
        </svg>
      ) : null}
    </span>
  );
}

/** A checker sliding from one place to another (Web Animations; lands with a small bounce). */
function FlyingChecker({
  color,
  size,
  from,
  to,
  tray,
}: {
  color: Color;
  size: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  tray?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const at = (p: { x: number; y: number }, scale = 1) =>
      `translate(${p.x - size / 2}px, ${p.y - size / 2}px) scale(${scale})`;
    const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    el.animate(
      [
        { transform: at(from), offset: 0 },
        { transform: at(mid, 1.14), offset: 0.5 },
        { transform: at(to, tray ? 0.7 : 1), offset: 1 },
      ],
      { duration: FLY_MS, easing: "cubic-bezier(.3,.7,.4,1)", fill: "forwards" },
    );
  }, [from, to, size, tray]);
  return (
    <span
      ref={ref}
      className="pointer-events-none absolute top-0 left-0 z-20 drop-shadow-[0_8px_8px_rgba(0,0,0,.45)]"
      style={{ transform: `translate(${from.x - size / 2}px, ${from.y - size / 2}px)` }}
    >
      <Checker color={color} size={size} />
    </span>
  );
}

type Loc = number | "bar" | "off";
type Op = { t: "move"; m: Move } | { t: "undo" } | { t: "confirm" };
type Flyer = { color: Color; from: Loc; to: Loc; fromSlot: number; toSlot: number };
/** One checker (plus a hit one) sliding: `base` is the board drawn underneath. */
type Step = { base: Board; after: Board; flyers: Flyer[] };

const FLY_MS = 230;

/** The board after the given moves from the start of the turn (null when they do not replay). */
function replay(start: Board, color: Color, moves: Move[]) {
  let b = start;
  for (const m of moves) {
    const r = tryMove(b, color, m.from, m.die);
    if (!r) return null;
    b = r.board;
  }
  return b;
}

const count = (b: Board, loc: Loc, c: Color) =>
  loc === "bar" ? b.bar[c] : loc === "off" ? b.off[c] : Math.abs(b.points[loc]!);

/** The board without one checker of `c` at `loc` (it is drawn flying instead). */
function without(b: Board, loc: Loc, c: Color): Board {
  const n = { points: [...b.points], bar: { ...b.bar }, off: { ...b.off } };
  if (loc === "bar") n.bar[c] = Math.max(0, n.bar[c] - 1);
  else if (loc === "off") n.off[c] = Math.max(0, n.off[c] - 1);
  else n.points[loc] = n.points[loc]! - (c === "w" ? 1 : -1);
  return n;
}

/** Slides for one move (or its undo) from `before` to `after`. */
function stepFor(before: Board, after: Board, color: Color, m: Move, undo = false): Step {
  const opp: Color = color === "w" ? "b" : "w";
  const flyers: Flyer[] = [];
  let base = after;
  const from: Loc = undo ? (m.to as Loc) : (m.from as Loc);
  const to: Loc = undo ? (m.from as Loc) : (m.to as Loc);
  flyers.push({
    color,
    from,
    to,
    fromSlot: count(before, from, color) - 1,
    toSlot: count(after, to, color) - 1,
  });
  base = without(base, to, color);
  if (m.hit) {
    const hf: Loc = undo ? "bar" : (m.to as Loc);
    const ht: Loc = undo ? (m.to as Loc) : "bar";
    flyers.push({ color: opp, from: hf, to: ht, fromSlot: 0, toSlot: count(after, ht, opp) - 1 });
    base = without(base, ht, opp);
  }
  return { base, after, flyers };
}

const sameMove = (a: Move, b: Move) => a.from === b.from && a.to === b.to && a.die === b.die;
const isPrefix = (a: Move[], b: Move[]) => a.length <= b.length && a.every((m, i) => sameMove(m, b[i]!));

/** Wooden "clack" of a checker landing, and a rattle for the dice (Web Audio, no files). */
let audio: AudioContext | null = null;
function sound(kind: "clack" | "dice") {
  try {
    audio ??= new AudioContext();
    const ctx = audio;
    const hits = kind === "dice" ? [0, 0.07, 0.15, 0.21] : [0];
    for (const at of hits) {
      const len = Math.floor(ctx.sampleRate * 0.05);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = kind === "dice" ? 2400 : 900 + Math.random() * 200;
      filter.Q.value = 1.4;
      const gain = ctx.createGain();
      gain.gain.value = kind === "dice" ? 0.35 : 0.6;
      src.connect(filter).connect(gain).connect(ctx.destination);
      src.start(ctx.currentTime + at);
    }
  } catch {
    // No audio: silent.
  }
}

export function GameBoard({ initial, title }: { initial: GameView; title: string }) {
  const t = useTranslations("games");
  const [view, setView] = useState(initial);
  const [skew, setSkew] = useState(0);
  // Starts at the server's clock so the first client render matches the server's (no hydration gap).
  const [now, setNow] = useState(initial.serverNow);
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const [soundOn, setSoundOn] = useState(() => {
    try {
      return typeof window === "undefined" || localStorage.getItem("bg-sound") !== "off";
    } catch {
      return true;
    }
  });
  // Dice order chosen by the player for this turn (left die = played first).
  const [swap, setSwap] = useState<{ turnNo: number; swapped: boolean } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  // Taps not yet acknowledged by the server: drawn at once, sent one after the other.
  const [ops, setOps] = useState<Op[]>([]);
  const opsRef = useRef<Op[]>([]);
  const sending = useRef(false);

  const soundRef = useRef(soundOn);
  useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);
  const play = useCallback((kind: "clack" | "dice") => soundRef.current && sound(kind), []);

  const apply = useCallback((v: GameView) => {
    setView(v);
    setSkew(v.serverNow - Date.now());
  }, []);
  /** Server pictures while taps are in flight would draw them twice: only taken when idle. */
  const applyIdle = useCallback((v: GameView) => !opsRef.current.length && apply(v), [apply]);
  const refresh = useCallback(() => {
    heartbeatAction(initial.id)
      .then((r) => r?.ok && r.data && applyIdle(r.data))
      .catch(() => {});
  }, [initial.id, applyIdle]);

  useEffect(() => {
    refresh();
    const id = setInterval(() => document.visibilityState === "visible" && refresh(), 3000);
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);
  useLiveEvent((type, data) => {
    if (type === "game.updated" && data.id === initial.id) refresh();
  });
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);
  useLayoutEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((m) => (m === msg ? null : m)), 2200);
  }, []);

  const enqueue = (op: Op) => {
    opsRef.current = [...opsRef.current, op];
    setOps(opsRef.current);
  };
  // Sends the queued taps in order; a refusal drops the rest and reloads the real position.
  useEffect(() => {
    if (sending.current || !ops.length) return;
    const op = ops[0]!;
    const turnNo = view.state?.turnNo ?? 0;
    sending.current = true;
    const call =
      op.t === "move"
        ? moveAction(view.id, op.m.from, op.m.die, turnNo)
        : op.t === "undo"
          ? undoAction(view.id)
          : confirmAction(view.id);
    call
      .then((res) => {
        if (res?.ok && res.data) {
          opsRef.current = opsRef.current.slice(1);
          apply(res.data);
        } else {
          opsRef.current = [];
          if (res && !res.ok && !["stale", "not_your_turn", "nothing_to_undo"].includes(String(res.error)))
            flash(t("errors.move"));
          refresh();
        }
      })
      .catch(() => {
        opsRef.current = [];
        refresh();
      })
      .finally(() => {
        sending.current = false;
        setOps(opsRef.current);
      });
  }, [ops, view.id, view.state?.turnNo, apply, refresh, flash, t]);

  const s = view.state;
  const me = view.me;
  const persp: Color = me ?? "w";
  const opp: Color = persp === "w" ? "b" : "w";
  const serverTurn = Boolean(s && view.status === "playing" && me && s.turn === me);

  // The position with the queued taps applied (the server agrees move by move).
  const local = useMemo(() => {
    if (!s) return null;
    let moves = s.moves;
    let confirmed = false;
    for (const op of ops) {
      if (op.t === "move") moves = [...moves, op.m];
      else if (op.t === "undo") moves = moves.slice(0, -1);
      else confirmed = true;
    }
    const replayed = ops.length && s.turnBoard && me ? replay(s.turnBoard, me, moves) : null;
    const board = replayed ?? s.board;
    if (!replayed) moves = s.moves;
    const remaining = replayed ? diceToPlay(s.dice as [number, number]) : [...s.remaining];
    if (replayed) for (const m of moves) remaining.splice(remaining.indexOf(m.die), 1);
    const mine = serverTurn && !confirmed;
    const legal = mine && me && remaining.length ? legalMoves(board, me, remaining) : [];
    const won = Boolean(me && board.off[me] === 15);
    const awaitConfirm = mine && !won && moves.length > 0 && !legal.length;
    return {
      board,
      moves,
      remaining,
      legal: awaitConfirm || won ? [] : legal,
      mine: mine && !won,
      awaitConfirm,
    };
  }, [s, ops, me, serverTurn]);

  const myTurn = Boolean(local?.mine);
  const board = local?.board ?? null;

  // ── Sliding checkers ──────────────────────────────────────────────────────────────
  const [fly, setFly] = useState<Step | null>(null);
  const queue = useRef<Step[]>([]);
  const seen = useRef<{ board: Board; moves: Move[]; turnNo: number; turn: Color } | null>(null);
  const flyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runNext = useCallback(() => {
    const next = () => {
      const step = queue.current.shift() ?? null;
      setFly(step);
      if (!step) {
        flyTimer.current = null;
        return;
      }
      flyTimer.current = setTimeout(() => {
        play("clack");
        next();
      }, FLY_MS);
    };
    next();
  }, [play]);

  useLayoutEffect(() => {
    if (!s || !board) return;
    const prev = seen.current;
    const cur = { board, moves: local!.moves, turnNo: s.turnNo, turn: s.turn };
    seen.current = cur;
    if (!prev) return;
    const steps: Step[] = [];
    const forward = (start: Board, color: Color, list: Move[]) => {
      let b = start;
      for (const m of list) {
        const r = tryMove(b, color, m.from, m.die);
        if (!r) return false;
        steps.push(stepFor(b, r.board, color, m));
        b = r.board;
      }
      return true;
    };
    if (prev.turnNo === cur.turnNo && prev.turn === cur.turn) {
      if (cur.moves.length > prev.moves.length && isPrefix(prev.moves, cur.moves))
        forward(prev.board, cur.turn, cur.moves.slice(prev.moves.length));
      else if (cur.moves.length === prev.moves.length - 1 && isPrefix(cur.moves, prev.moves))
        steps.push(stepFor(prev.board, cur.board, cur.turn, prev.moves.at(-1)!, true));
    } else if (cur.turnNo > prev.turnNo && s.last && s.last.color === prev.turn && !s.last.pass) {
      // The turn passed: show the rest of what was played (the opponent's checkers slide).
      const done = s.last.moves;
      if (isPrefix(prev.moves, done) && done.length > prev.moves.length) {
        const ok = forward(prev.board, prev.turn, done.slice(prev.moves.length));
        if (!ok) steps.length = 0;
      }
    }
    if (!steps.length) return;
    queue.current.push(...steps);
    if (!flyTimer.current) runNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, s?.turnNo, s?.turn]);
  useEffect(() => () => void (flyTimer.current && clearTimeout(flyTimer.current)), []);

  // Dice: a rattle when a new roll appears.
  const lastTurn = useRef(s?.turnNo);
  useEffect(() => {
    if (!s || s.turnNo === lastTurn.current) return;
    lastTurn.current = s.turnNo;
    if (view.status === "playing") play("dice");
    if (serverTurn && "vibrate" in navigator) navigator.vibrate?.(50);
  }, [s, serverTurn, view.status, play]);

  // Dice: two values (doubles shown four times), in the order the player chose.
  const rolled = s?.dice ?? [];
  const isDouble = rolled.length === 2 && rolled[0] === rolled[1];
  const swapped = Boolean(swap && s && swap.turnNo === s.turnNo && swap.swapped);
  const order = isDouble
    ? [rolled[0]!, rolled[0]!, rolled[0]!, rolled[0]!]
    : swapped
      ? [...rolled].reverse()
      : rolled;
  const left = [...(local?.remaining ?? [])];
  // Doubles are used from the left, like the other dice.
  const usedDoubles = isDouble ? 4 - left.length : 0;
  const diceView = order.map((v, i) => {
    if (isDouble) return { value: v, used: i < usedDoubles };
    const k = left.indexOf(v);
    if (k >= 0) left.splice(k, 1);
    return { value: v, used: k < 0 };
  });
  const activeIndex = diceView.findIndex((d) => !d.used);
  const activeDie = activeIndex >= 0 ? diceView[activeIndex]!.value : null;
  const canSwap = myTurn && !isDouble && diceView.length === 2 && diceView.every((d) => !d.used);

  const legal = local?.legal ?? [];
  const froms = new Set(legal.map((m) => m.from));

  /** One tap: the checker moves by the first (left) die; the other die when the first cannot. */
  const tapChecker = (from: From) => {
    if (!myTurn) return;
    const options = legal.filter((m) => m.from === from);
    if (!options.length) {
      if (!local?.awaitConfirm) flash(t("cannotMove"));
      return;
    }
    const pick = options.find((m) => m.die === activeDie) ?? [...options].sort((a, b) => b.die - a.die)[0]!;
    enqueue({ t: "move", m: pick });
  };
  const canUndo = Boolean(
    serverTurn && local && local.moves.length && s?.turnBoard && !ops.some((o) => o.t === "confirm"),
  );
  const undo = () => canUndo && enqueue({ t: "undo" });
  const confirm = () => local?.awaitConfirm && enqueue({ t: "confirm" });

  // Geometry: 12 points + bar + bear-off tray across; two rows of 5 checkers.
  const units = 12 + 0.9 + 1.1;
  const col = width / units;
  const d = Math.min(col * 0.92, 44);
  const rowH = d * 5 + 6;
  const dieSize = Math.max(30, Math.min(46, d * 1.05));
  const midH = Math.max(dieSize + 14, col * 1.7);
  const totalH = rowH * 2 + midH;
  const lastMoves =
    s?.last && s.last.color !== persp && s.turn === persp ? s.last.moves : (local?.moves ?? []);
  const highlightTo = new Set(lastMoves.map((m) => m.to));

  const top =
    persp === "w" ? [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23] : [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
  const bottom =
    persp === "w" ? [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0] : [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];

  /** Centre of a checker (slot from the board edge) in board pixels. */
  const posOf = (loc: Loc, color: Color, slot: number, n: number) => {
    if (loc === "bar") {
      const isTop = color !== persp;
      return { x: col * 6 + col * 0.45, y: isTop ? 12 + d * 0.46 : totalH - 12 - d * 0.46 };
    }
    if (loc === "off") {
      const isTop = color !== persp;
      return { x: width - col * 0.55, y: isTop ? totalH * 0.27 : totalH * 0.73 };
    }
    const isTop = top.includes(loc);
    const p = (isTop ? top : bottom).indexOf(loc);
    const x = (p < 6 ? p * col : p * col + col * 0.9) + col / 2;
    const step = n > 5 ? (rowH - d) / (n - 1) : d;
    const edge = Math.max(0, slot) * step + 2 + d / 2;
    return { x, y: isTop ? edge : totalH - edge };
  };

  const shown = fly?.base ?? board;

  const point = (idx: number, pos: number, isTop: boolean) => {
    const v = shown?.points[idx] ?? 0;
    const color: Color | null = v > 0 ? "w" : v < 0 ? "b" : null;
    const n = Math.abs(v);
    const step = n > 5 ? (rowH - d) / (n - 1) : d;
    const movable = myTurn && froms.has(idx);
    const shade = (pos + (isTop ? 0 : 1)) % 2;
    return (
      <button
        key={idx}
        type="button"
        onClick={() => tapChecker(idx)}
        data-from={movable ? "" : undefined}
        className="relative h-full shrink-0 touch-manipulation"
        style={{ width: col }}
        aria-label={t("point", { n: persp === "w" ? idx + 1 : 24 - idx, count: n })}
      >
        <span
          className="absolute inset-x-[5%]"
          style={{
            [isTop ? "top" : "bottom"]: 0,
            height: rowH * 0.9,
            background: isTop ? TRI[shade] : TRI_UP[shade],
            clipPath: isTop ? "polygon(0 0,100% 0,50% 100%)" : "polygon(50% 0,100% 100%,0 100%)",
          }}
        />
        {highlightTo.has(idx) && !fly ? (
          <span
            className="absolute inset-x-[32%] rounded-full bg-yellow-300/80"
            style={{ [isTop ? "top" : "bottom"]: -5, height: 3 }}
          />
        ) : null}
        {color
          ? Array.from({ length: n }, (_, i) => (
              <span
                key={i}
                className="absolute left-1/2 -translate-x-1/2"
                style={{ [isTop ? "top" : "bottom"]: i * step + 2 }}
              >
                <Checker
                  color={color}
                  size={d}
                  glow={movable && i === n - 1 && !fly}
                  label={i === n - 1 && n > 5 ? String(n) : undefined}
                />
              </span>
            ))
          : null}
      </button>
    );
  };

  const row = (list: number[], isTop: boolean) => (
    <div className="flex" style={{ height: rowH }}>
      {list.slice(0, 6).map((idx, i) => point(idx, i, isTop))}
      <div style={{ width: col * 0.9 }} />
      {list.slice(6).map((idx, i) => point(idx, i + 6, isTop))}
    </div>
  );

  const barStack = (color: Color, isTop: boolean) => {
    const n = shown?.bar[color] ?? 0;
    const movable = myTurn && color === me && froms.has("bar");
    return (
      <button
        type="button"
        onClick={() => color === me && tapChecker("bar")}
        data-from={movable ? "" : undefined}
        className={cn(
          "absolute inset-x-0 flex touch-manipulation flex-col items-center",
          isTop ? "top-3" : "bottom-3",
        )}
        aria-label={t("bar", { count: n })}
      >
        {n ? (
          <Checker
            color={color}
            size={d * 0.92}
            label={n > 1 ? String(n) : undefined}
            glow={movable && !fly}
          />
        ) : null}
      </button>
    );
  };

  const tray = (color: Color, isTop: boolean) => {
    const n = shown?.off[color] ?? 0;
    return (
      <div
        className={cn(
          "absolute inset-x-1 flex gap-[2px] rounded-md bg-black/30 p-[3px] shadow-[inset_0_2px_6px_rgba(0,0,0,.6)]",
          isTop ? "top-1.5 bottom-[51%] flex-col" : "top-[51%] bottom-1.5 flex-col-reverse",
        )}
        aria-label={t("off", { count: n })}
      >
        {Array.from({ length: n }, (_, i) => (
          <span
            key={i}
            className="w-full rounded-[2px]"
            style={{
              height: Math.max(3, (rowH - 16) / 15 - 2),
              background: CHECKER[color].bg,
              boxShadow: `0 1px 0 ${CHECKER[color].edge}`,
            }}
          />
        ))}
      </div>
    );
  };

  const flyers = fly
    ? fly.flyers.map((f, i) => {
        const a = posOf(f.from, f.color, f.fromSlot, count(fly.base, f.from, f.color) + 1);
        const b = posOf(f.to, f.color, f.toSlot, count(fly.after, f.to, f.color));
        return (
          <FlyingChecker
            key={`${i}-${f.from}-${f.to}-${a.x}-${a.y}`}
            color={f.color}
            size={d}
            from={a}
            to={b}
            tray={f.to === "off"}
          />
        );
      })
    : null;

  const remainingMs =
    view.deadline && view.status === "playing" ? Math.max(0, view.deadline - (now + skew)) : null;
  const totalMs = (s?.awaitConfirm ? view.confirmSeconds : view.turnSeconds) * 1000;
  const progress = remainingMs != null ? Math.min(1, remainingMs / totalMs) : null;
  const seconds = remainingMs != null ? Math.ceil(remainingMs / 1000) : null;

  const playerCard = (c: Color, isMe: boolean) => {
    const p = view.players[c];
    const active = Boolean(s && view.status === "playing" && s.turn === c);
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-2xl px-3 py-2 transition-colors",
          active ? "bg-white/12" : "bg-white/5",
        )}
      >
        <Avatar
          name={p?.name ?? "?"}
          size={54}
          progress={active ? progress : null}
          warn={(seconds ?? 99) <= 5}
        />
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[15px] font-bold text-white">
              {p ? p.name : t("waitingOpponent")}
            </span>
            {p ? (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-yellow-400/20 px-1.5 py-0.5 text-[11px] font-bold text-yellow-300">
                <Trophy className="size-3" aria-hidden="true" />
                {p.wins}
              </span>
            ) : null}
            {isMe && p ? <span className="shrink-0 text-[11px] text-white/50">{t("you")}</span> : null}
          </p>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-white/60">
            <Checker color={c} size={14} />
            {p?.table ? <span>{t("table", { table: p.table })}</span> : null}
            {p && !p.present ? (
              <span className="inline-flex items-center gap-1 text-rose-300">
                <WifiOff className="size-3" aria-hidden="true" />
                {t("away")}
              </span>
            ) : null}
            <span
              className="inline-flex gap-0.5"
              title={t("strikes", { n: p?.strikes ?? 0, max: view.maxStrikes })}
            >
              {Array.from({ length: view.maxStrikes }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    "size-1.5 rounded-full",
                    i < (p?.strikes ?? 0) ? "bg-rose-400" : "bg-white/20",
                  )}
                />
              ))}
            </span>
          </p>
        </div>
        {active && seconds != null ? (
          <span
            className={cn(
              "text-lg font-extrabold tabular-nums",
              seconds <= 5 ? "text-rose-300" : "text-yellow-300",
            )}
          >
            {seconds}
          </span>
        ) : null}
        <span className="grid min-w-11 place-items-center rounded-xl bg-black/30 px-2 py-1 text-center">
          <span className="text-xl leading-none font-extrabold text-white tabular-nums">
            {s?.score[c] ?? 0}
          </span>
          <span className="text-[10px] text-white/50">/ {view.target}</span>
        </span>
      </div>
    );
  };

  const status = (() => {
    if (view.status === "open") return t("waitingForJoin", { n: view.target });
    if (view.status === "cancelled" || view.status === "abandoned") return t("closed");
    if (view.status === "finished" || !s) return null;
    if (s.turn === me) {
      if (local?.awaitConfirm) return t("confirmHint");
      if (!myTurn) return null;
      return isDouble ? t("doubleHint", { n: rolled[0]! }) : t("tapHint");
    }
    const mover = view.players[s.turn];
    if (mover && !mover.present) return t("opponentAway", { name: mover.name });
    return t("opponentTurn", { name: mover?.name ?? "" });
  })();
  const lastNote = (() => {
    if (!s?.last || view.status !== "playing") return null;
    const who = view.players[s.last.color]?.name ?? "";
    if (s.last.pass) return t("passed", { name: who });
    if (s.last.auto) return t("autoPlayed", { name: who });
    return null;
  })();
  const winnerName = view.winner ? view.players[view.winner]?.name : null;
  const oppPlayer = view.players[opp];
  const showDice = Boolean(s && view.status === "playing" && diceView.length);
  const controls = serverTurn && !ops.some((o) => o.t === "confirm");

  return (
    <div
      className="min-h-dvh px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] text-white"
      style={{ background: "radial-gradient(120% 80% at 50% 0%,#3b2a7a 0%,#1d1446 45%,#0e0a24 100%)" }}
    >
      <div className="mx-auto max-w-xl space-y-3">
        {/* Top bar */}
        <div className="flex items-center gap-2">
          <Link
            href="/table/games"
            aria-label={t("backToRoom")}
            className="grid size-10 place-items-center rounded-full bg-white/10 hover:bg-white/15"
          >
            <ChevronLeft className="size-5 rtl:rotate-180" aria-hidden="true" />
          </Link>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-sm font-bold">{title}</p>
            <p className="text-[11px] text-white/55">{t("matchTo", { n: view.target })}</p>
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenu((m) => !m)}
              aria-label={t("menu")}
              className="grid size-10 place-items-center rounded-full bg-white/10 hover:bg-white/15"
            >
              <MoreVertical className="size-5" aria-hidden="true" />
            </button>
            {menu ? (
              <div className="absolute end-0 top-12 z-30 w-56 overflow-hidden rounded-2xl bg-[#2a2150] p-1 shadow-2xl ring-1 ring-white/10">
                <Link href="/table/games" className="block rounded-xl px-3 py-2.5 text-sm hover:bg-white/10">
                  {view.status === "playing" ? t("leave") : t("backToRoom")}
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    const next = !soundOn;
                    setSoundOn(next);
                    try {
                      localStorage.setItem("bg-sound", next ? "on" : "off");
                    } catch {
                      // Storage blocked: only for this visit.
                    }
                    if (next) sound("clack");
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-start text-sm hover:bg-white/10"
                >
                  {soundOn ? (
                    <Volume2 className="size-4" aria-hidden="true" />
                  ) : (
                    <VolumeX className="size-4" aria-hidden="true" />
                  )}
                  {soundOn ? t("soundOn") : t("soundOff")}
                </button>
                {view.status === "playing" && me ? (
                  confirmResign ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          const r = await resignAction(view.id);
                          if (r?.ok && r.data) apply(r.data);
                          setMenu(false);
                        })
                      }
                      className="block w-full rounded-xl bg-rose-500 px-3 py-2.5 text-start text-sm font-bold"
                    >
                      {t("resignConfirm")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmResign(true)}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-start text-sm text-rose-300 hover:bg-white/10"
                    >
                      <Flag className="size-4" aria-hidden="true" />
                      {t("resign")}
                    </button>
                  )
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {playerCard(opp, false)}

        {/* Board */}
        <div dir="ltr" className="relative w-full select-none">
          <div
            className="relative rounded-[18px] p-[7px] shadow-[0_18px_40px_rgba(0,0,0,.55)]"
            style={{ background: WOOD }}
          >
            <div
              ref={boardRef}
              className="relative overflow-hidden rounded-xl shadow-[inset_0_3px_12px_rgba(0,0,0,.65)]"
              style={{ background: FELT }}
            >
              <div className="relative" style={{ paddingRight: col * 1.1 }}>
                {row(top, true)}
                {/* Middle strip: dice on the side of the player to move; on my turn the other half
                    holds Undo and Done (Plato layout) */}
                <div className="relative flex items-center" style={{ height: midH }}>
                  {(["opp", "me"] as const).map((half) => {
                    const mine = half === "me";
                    const diceHere = showDice && (s!.turn === persp) === mine;
                    const controlsHere = !mine && controls;
                    return (
                      <div
                        key={half}
                        className="flex items-center justify-center gap-2"
                        style={{ width: col * 6, marginLeft: mine ? col * 0.9 : 0 }}
                      >
                        {controlsHere ? (
                          <>
                            <button
                              type="button"
                              onClick={undo}
                              disabled={!canUndo}
                              aria-label={t("undo")}
                              className="grid size-10 touch-manipulation place-items-center rounded-full bg-white/90 text-[#1d1446] shadow-lg transition active:scale-90 disabled:opacity-25"
                            >
                              <Undo2 className="size-5" aria-hidden="true" />
                            </button>
                            {local?.awaitConfirm ? (
                              <button
                                type="button"
                                onClick={confirm}
                                className="animate-pop-in inline-flex h-10 touch-manipulation items-center gap-1.5 rounded-full bg-gradient-to-b from-emerald-400 to-emerald-600 ps-3 pe-3.5 text-sm font-extrabold shadow-[0_6px_16px_rgba(16,185,129,.55)] ring-2 ring-white/30 active:scale-95"
                              >
                                <Check className="size-5" aria-hidden="true" />
                                {t("done")}
                                {seconds != null ? (
                                  <span className="text-white/75 tabular-nums">{seconds}</span>
                                ) : null}
                              </button>
                            ) : null}
                          </>
                        ) : null}
                        {diceHere ? (
                          <button
                            key={s!.turnNo}
                            type="button"
                            onClick={() => canSwap && s && setSwap({ turnNo: s.turnNo, swapped: !swapped })}
                            className={cn(
                              "relative flex touch-manipulation items-center",
                              isDouble ? "gap-1" : "gap-1.5",
                              canSwap && "cursor-pointer active:scale-95",
                            )}
                            aria-label={canSwap ? t("swapDice") : t("dice")}
                            disabled={!canSwap}
                          >
                            {diceView.map((dv, i) => (
                              <Die
                                key={i}
                                value={dv.value}
                                used={dv.used}
                                active={myTurn && i === activeIndex}
                                size={isDouble ? Math.min(dieSize * 0.74, (col * 6 - 32) / 4) : dieSize}
                                delay={isDouble ? (i % 2) * 60 : i * 70}
                              />
                            ))}
                            {canSwap ? (
                              <span className="absolute -bottom-3 left-1/2 grid size-5 -translate-x-1/2 place-items-center rounded-full bg-yellow-300 text-[#1d1446] shadow">
                                <ArrowLeftRight className="size-3" aria-hidden="true" />
                              </span>
                            ) : null}
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                {row(bottom, false)}
                {/* Bar */}
                <div
                  className="absolute top-0 bottom-0"
                  style={{
                    left: col * 6,
                    width: col * 0.9,
                    background: WOOD,
                    boxShadow: "inset 0 0 8px rgba(0,0,0,.6)",
                  }}
                >
                  {barStack(opp, true)}
                  {barStack(persp, false)}
                </div>
                {flyers}
              </div>
              {/* Bear-off tray */}
              <div
                className="absolute top-0 right-0 bottom-0"
                style={{ width: col * 1.1, background: WOOD, boxShadow: "inset 2px 0 8px rgba(0,0,0,.55)" }}
              >
                {tray(opp, true)}
                {tray(persp, false)}
              </div>
            </div>
          </div>

          {toast ? (
            <div className="pointer-events-none absolute inset-x-0 top-1/2 z-20 flex -translate-y-1/2 justify-center">
              <span className="animate-pop-in rounded-full bg-black/75 px-4 py-2 text-sm font-semibold">
                {toast}
              </span>
            </div>
          ) : null}
        </div>

        <div className="pt-3">{playerCard(persp, true)}</div>

        <div className="min-h-10 space-y-1 text-center">
          {status ? (
            <p className={cn("text-sm font-semibold", myTurn ? "text-yellow-300" : "text-white/80")}>
              {status}
            </p>
          ) : null}
          {lastNote ? <p className="text-xs text-white/55">{lastNote}</p> : null}
          {s?.lastGame && view.status === "playing" && s.gameNo > 1 ? (
            <p className="text-xs text-white/55">
              {t("gameWon", { name: view.players[s.lastGame.winner]?.name ?? "", points: s.lastGame.points })}
            </p>
          ) : null}
        </div>

        {view.status === "open" && !me ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await joinGameAction(view.id);
                refresh();
              })
            }
            className="h-12 w-full rounded-full bg-gradient-to-b from-yellow-300 to-amber-500 font-extrabold text-[#1d1446]"
          >
            {t("join")}
          </button>
        ) : null}
        {view.status === "playing" ? (
          <p className="text-center text-[11px] leading-relaxed text-white/45">
            {t("leaveHint", { s: view.turnSeconds, n: view.maxStrikes })}
          </p>
        ) : null}
      </div>

      {view.status === "finished" ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="animate-pop-in w-full max-w-sm rounded-3xl p-6 text-center text-white shadow-2xl ring-1 ring-white/15"
            style={{ background: "linear-gradient(160deg,#3b2a7a,#1d1446)" }}
          >
            <Crown
              className={cn("mx-auto size-14", view.winner === me ? "text-yellow-300" : "text-white/40")}
              aria-hidden="true"
            />
            <h2 className="mt-3 text-2xl font-extrabold">
              {me
                ? view.winner === me
                  ? t("youWon")
                  : t("youLost")
                : t("winnerIs", { name: winnerName ?? "" })}
            </h2>
            <p className="mt-1 text-sm text-white/70">
              {t(`reason_${view.finishReason ?? "points"}`, { name: oppPlayer?.name ?? "" })}
            </p>
            <p className="mt-5 text-4xl font-extrabold tabular-nums">
              {s?.score.w ?? 0} – {s?.score.b ?? 0}
            </p>
            <p className="mt-1 text-xs text-white/60">
              {view.players.w.name} · {view.players.b?.name}
            </p>
            <Link
              href="/table/games"
              className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full bg-gradient-to-b from-yellow-300 to-amber-500 font-extrabold text-[#1d1446]"
            >
              {t("backToRoom")}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
