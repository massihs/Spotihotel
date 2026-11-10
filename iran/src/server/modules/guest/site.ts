/**
 * The site the QR code was opened on, when it is one of ours (the domain, its www., the Liara
 * address): the guest stays there, so the cookies set by this response reach the menu. Anything
 * else (an internal host, a forged header) falls back to APP_URL.
 */
export function scannedSite(req: { headers: Headers }, appUrl: string) {
  const app = new URL(appUrl);
  const first = (h: string | null) => h?.split(",")[0]?.trim().toLowerCase() || "";
  const host = first(req.headers.get("x-forwarded-host")) || first(req.headers.get("host"));
  const bare = app.host.replace(/^www\./, "");
  const ours = host === bare || host === `www.${bare}` || /^[a-z0-9-]+\.liara\.run$/.test(host);
  if (!ours) return { origin: app.origin, https: app.protocol === "https:" };
  const proto = first(req.headers.get("x-forwarded-proto")) || app.protocol.replace(":", "");
  const https = proto !== "http";
  return { origin: `${https ? "https" : "http"}://${host}`, https };
}
