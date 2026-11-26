import { describe, expect, it } from "vitest";
import { normalize, rankArticles, wantsHuman } from "@/lib/support-match";
import { DEFAULT_ARTICLES } from "@/server/modules/support/default-articles";

const staff = DEFAULT_ARTICLES.filter((a) => a.audience === "staff");
const guest = DEFAULT_ARTICLES.filter((a) => a.audience === "guest");
const top = (q: string, list = staff) => rankArticles(q, list)[0]?.slug;

describe("support assistant matching", () => {
  it("normalizes Arabic letter forms, digits, half-spaces and punctuation", () => {
    expect(normalize("كي چاپگرِ ۳۰ دقيقه؟")).toBe("کی چاپگر 30 دقیقه");
    expect(normalize("نمی‌توانم")).toBe("نمی توانم");
    expect(normalize("Clôture!")).toBe("cloture");
  });

  it("finds the right article in each language", () => {
    expect(top("چاپگر آشپزخانه فیش چاپ نمیکند")).toBe("printer");
    expect(top("روز بسته نمیشود، حسابرسی شب خطا میدهد")).toBe("night-audit");
    expect(top("The printer is not printing")).toBe("printer");
    expect(top("Comment faire la clôture de la journée ?")).toBe("night-audit");
    expect(top("كيف أقوم بإغلاق اليوم")).toBe("night-audit");
    expect(top("رمز عبورم را فراموش کردم")).toBe("password");
    expect(top("How do I order room service?", guest)).toBe("guest-order");
    expect(top("je voudrais réserver un massage", guest)).toBe("guest-spa");
  });

  it("answers nothing rather than guessing", () => {
    expect(rankArticles("سلام", staff)).toEqual([]);
    expect(rankArticles("blue elephant", staff)).toEqual([]);
  });

  it("recognizes a request for a person", () => {
    expect(wantsHuman("میخواهم با اپراتور صحبت کنم")).toBe(true);
    expect(wantsHuman("can I talk to a human?")).toBe(true);
    expect(wantsHuman("je veux parler à un conseiller")).toBe(true);
    expect(wantsHuman("رمز وای فای")).toBe(false);
  });
});
