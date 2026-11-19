import { describe, expect, it } from "vitest";
import { intentOf } from "@/lib/concierge";

describe("guest concierge", () => {
  it("understands needs in Persian, Arabic, English and French", () => {
    expect(intentOf("رمز وای‌فای چیه؟")).toBe("wifi");
    expect(intentOf("لطفا حوله بیارید")).toBe("clean");
    expect(intentOf("ساعت خروج چنده")).toBe("checkout");
    expect(intentOf("می‌خوام صبحانه سفارش بدم")).toBe("food");
    expect(intentOf("كلمة مرور الواي فاي")).toBe("wifi");
    expect(intentOf("I need a massage")).toBe("spa");
    expect(intentOf("Je voudrais ma facture")).toBe("bill");
    expect(intentOf("اذان مغرب کی است")).toBe("prayer");
    expect(intentOf("سلام")).toBe("help");
  });
});
