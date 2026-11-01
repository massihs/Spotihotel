import { describe, expect, it } from "vitest";
import { openState } from "@/lib/opening";

const hours = {
  mon: [
    { open: "12:00", close: "15:00" },
    { open: "19:00", close: "01:00" },
  ],
  tue: [{ open: "12:00", close: "23:00" }],
};
// 2026-10-19 is a Monday; Tehran is UTC+3:30.
const at = (utc: string) => new Date(`2026-10-${utc}Z`);

describe("openState", () => {
  it("handles split days, overnight ranges and unknown hours", () => {
    expect(openState(hours, "Asia/Tehran", at("19T09:00:00"))).toEqual({ status: "open", until: "15:00" });
    expect(openState(hours, "Asia/Tehran", at("19T13:00:00"))).toEqual({ status: "closed", from: "19:00" });
    expect(openState(hours, "Asia/Tehran", at("19T20:00:00"))).toEqual({ status: "open", until: "01:00" });
    expect(openState(hours, "Asia/Tehran", at("19T21:00:00"))).toEqual({ status: "open", until: "01:00" });
    expect(openState(hours, "Asia/Tehran", at("19T22:00:00"))).toEqual({ status: "closed", from: "12:00" });
    expect(openState(null, "Asia/Tehran", at("19T09:00:00"))).toEqual({ status: "unknown" });
  });
});
