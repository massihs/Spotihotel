import { afterEach, describe, expect, it, vi } from "vitest";
import { sendCode, setSmsDriver, sms } from "@/server/infra/sms";

const ok = () =>
  new Response(JSON.stringify({ return: { status: 200 }, entries: [{ messageid: 42 }] }), { status: 200 });

function kavenegar(env: Record<string, string>) {
  setSmsDriver(null);
  vi.stubEnv("SMS_PROVIDER", "kavenegar");
  vi.stubEnv("KAVENEGAR_API_KEY", "key");
  vi.stubEnv("KAVENEGAR_SENDER", env.sender ?? "");
  vi.stubEnv("KAVENEGAR_OTP_TEMPLATE", env.template ?? "");
  const fetch = vi.fn(async () => ok());
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  setSmsDriver(null);
});

describe("kavenegar sign-in codes", () => {
  it("uses the verify template when one is set", async () => {
    const fetch = kavenegar({ template: "spotifood-login", sender: "10008663" });
    expect(await sendCode("09121234567", "123456", "code 123456")).toEqual({ ref: "42" });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.kavenegar.com/v1/key/verify/lookup.json");
    const body = init.body as URLSearchParams;
    expect(Object.fromEntries(body)).toEqual({
      receptor: "09121234567",
      token: "123456",
      template: "spotifood-login",
    });
  });

  it("falls back to a plain text without a template", async () => {
    const fetch = kavenegar({ sender: "10008663" });
    await sendCode("09121234567", "123456", "code 123456");
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.kavenegar.com/v1/key/sms/send.json");
    expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({
      receptor: "09121234567",
      message: "code 123456",
      sender: "10008663",
    });
  });

  it("other texts keep the regular send", async () => {
    const fetch = kavenegar({ template: "spotifood-login" });
    await sms().send("09121234567", "ready");
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toContain("/sms/send.json");
  });
});
