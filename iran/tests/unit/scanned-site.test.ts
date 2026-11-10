import { describe, expect, it } from "vitest";
import { scannedSite } from "@/server/modules/guest/site";

const req = (h: Record<string, string>) => ({ headers: new Headers(h) });
const APP = "https://spotihotel.ir";

describe("QR entry: the guest stays on the site they scanned", () => {
  it("keeps the domain, its www. and the Liara address, with their protocol", () => {
    expect(scannedSite(req({ host: "spotihotel.ir", "x-forwarded-proto": "https" }), APP)).toEqual({
      origin: "https://spotihotel.ir",
      https: true,
    });
    expect(scannedSite(req({ "x-forwarded-host": "www.spotihotel.ir" }), APP).origin).toBe(
      "https://www.spotihotel.ir",
    );
    expect(
      scannedSite(req({ "x-forwarded-host": "spotihotel.liara.run", "x-forwarded-proto": "https" }), APP),
    ).toEqual({ origin: "https://spotihotel.liara.run", https: true });
    // A domain still without its certificate: plain http, cookies not marked Secure.
    expect(scannedSite(req({ host: "spotihotel.ir", "x-forwarded-proto": "http" }), APP)).toEqual({
      origin: "http://spotihotel.ir",
      https: false,
    });
  });

  it("falls back to APP_URL for internal or unknown hosts", () => {
    expect(scannedSite(req({ host: "0.0.0.0:3000" }), APP).origin).toBe(APP);
    expect(scannedSite(req({ "x-forwarded-host": "evil.example" }), APP).origin).toBe(APP);
    expect(scannedSite(req({}), "http://localhost:3000")).toEqual({
      origin: "http://localhost:3000",
      https: false,
    });
  });
});
