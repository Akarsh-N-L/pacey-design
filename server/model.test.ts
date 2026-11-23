import { describe, expect, it } from "vitest";
import { buildMessages, generatePlan, offerLayouts, parseJson, planSchemaFor, type ChatFn, type Message } from "./model";
import type { Brand } from "./schema";

const brand: Brand = {
  name: "Sunday Brunch Co",
  colors: ["#1a1a1a", "#fff7ed", "#f97316", "#fdba74"],
  fonts: ["Playfair Display", "Inter"],
  voice: "warm, playful",
};

const good = JSON.stringify({
  layout: "centered",
  headline: "Brunch is back",
  supporting: "Join us this Sunday from 10am.",
  colors: { background: "#1a1a1a", text: "#fff7ed", accent: "#f97316" },
  fontRoles: { headline: "Playfair Display", body: "Inter" },
});
const lowContrast = good.replace('"#1a1a1a"', '"#f97316"').replace('"#fff7ed"', '"#fdba74"');
const garbage = "Sure! Here is a lovely brunch post.";
const wrongShape = JSON.stringify({ layout: "centered" });

/** Fake model: returns scripted replies in order and records what it was sent. */
function fakeChat(replies: string[]) {
  const calls: Message[][] = [];
  const fn: ChatFn = async (messages) => {
    calls.push(structuredClone(messages));
    return replies[calls.length - 1] ?? good;
  };
  return { fn, calls };
}

describe("planSchemaFor", () => {
  it("restricts colours and fonts to the brand", () => {
    const s = planSchemaFor(brand) as any;
    expect(s.$schema).toBeUndefined();
    expect(s.properties.colors.properties.text.enum).toEqual(brand.colors);
    expect(s.properties.fontRoles.properties.body.enum).toEqual(brand.fonts);
    expect(s.properties.layout.enum).toContain("centered");
    expect(s.properties.headline.maxLength).toBe(60);
  });
});

describe("offerLayouts", () => {
  it("offers 2 of the 3 layouts, and every layout gets offered", () => {
    expect(offerLayouts(() => 0)).toEqual(["split", "banner"]);
    expect(offerLayouts(() => 0.99)).toEqual(["centered", "split"]);
    const s = planSchemaFor(brand, ["split", "banner"]) as any;
    expect(s.properties.layout.enum).toEqual(["split", "banner"]);
    const [system] = buildMessages(brand, "x", ["split", "banner"]);
    expect(system.content).not.toContain("- centered:");
  });
});

describe("parseJson", () => {
  it("parses plain JSON", () => {
    expect(parseJson('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
  });
  it("strips code fences and prose", () => {
    expect(parseJson('Sure!\n```json\n{"a":1}\n```')).toEqual({ ok: true, value: { a: 1 } });
  });
  it("explains missing or broken JSON", () => {
    expect(parseJson("no json here").ok).toBe(false);
    expect(parseJson('{"a":').ok).toBe(false);
  });
});

describe("buildMessages", () => {
  it("gives the persona, the schema, the brand and the request", () => {
    const [system, user] = buildMessages(brand, "Sunday brunch launch");
    expect(system.content).toContain("10 years of experience");
    expect(system.content).toContain('"properties"');
    expect(user.content).toContain("#f97316");
    expect(user.content).toContain("Sunday brunch launch");
  });
});

describe("generatePlan", () => {
  it("returns the first valid plan without retrying", async () => {
    const { fn, calls } = fakeChat([good]);
    const r = await generatePlan(brand, "Sunday brunch from 10am", fn);
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("feeds the reasons back and recovers", async () => {
    const { fn, calls } = fakeChat([lowContrast, good]);
    const r = await generatePlan(brand, "Sunday brunch from 10am", fn);
    expect(r.ok).toBe(true);
    expect(r.attempts).toHaveLength(1);
    const last = calls[1].at(-1)!;
    expect(last.role).toBe("user");
    expect(last.content).toMatch(/rejected[\s\S]*contrast/);
    expect(calls[1].at(-2)).toEqual({ role: "assistant", content: lowContrast });
  });

  it("accepts a good plan on the second retry", async () => {
    const { fn, calls } = fakeChat([garbage, lowContrast, good]);
    const r = await generatePlan(brand, "Sunday brunch from 10am", fn);
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(3);
    expect(r.attempts.map((a) => a.kind)).toEqual(["malformed", "invalid"]);
  });

  it("retries at most twice, whatever went wrong, then gives up", async () => {
    for (const replies of [
      [garbage, wrongShape, garbage, good],
      [lowContrast, lowContrast, lowContrast, good],
      [garbage, lowContrast, garbage, good],
    ]) {
      const { fn, calls } = fakeChat(replies);
      const r = await generatePlan(brand, "Sunday brunch from 10am", fn);
      expect(r.ok).toBe(false);
      expect(calls).toHaveLength(3); // 1 try + 2 retries; the 4th (good) reply is never requested
    }
  });
});
