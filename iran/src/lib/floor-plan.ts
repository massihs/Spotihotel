/** The floor plan is a grid of cells per zone (dining room, terrace…). */
export const FLOOR_COLS = 24;
export const FLOOR_ROWS = 16;
export const TABLE_SHAPES = ["square", "round", "rect"] as const;
export type TableShape = (typeof TABLE_SHAPES)[number];

/** Cells a table takes on the plan, from its shape and seats. */
export function tableSize(shape: string, capacity: number | null) {
  const seats = capacity ?? 4;
  if (shape === "rect") return seats > 6 ? { w: 6, h: 3 } : { w: 5, h: 3 };
  if (seats <= 2) return { w: 2, h: 2 };
  if (seats <= 4) return { w: 3, h: 3 };
  return { w: 4, h: 4 };
}
