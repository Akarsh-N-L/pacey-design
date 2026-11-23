import { describe, expect, it } from "vitest";
import { contrastRatio, paletteProblem, textColors } from "./contrast";
import { Brand } from "./schema";
import { validatePlan } from "./validate";

const brand: Brand = {
  name: "Sunday Brunch Co",
  colors: ["#1a1a1a", "#fff7ed", "#f97316", "#fdba74"],
  fonts: ["Playfair Display", "Inter"],
  voice: "warm, playful, a little cheeky",
};

const good = {
  layout: "centered",
  headline: "Brunch is back",
  supporting: "Join us this Sunday from 10am.",
  colors: { background: "#1a1a1a", text: "#fff7ed", accent: "#f97316" },
  fontRoles: { headline: "Playfair Display", body: "Inter" },
};

const REQUEST = "Sunday brunch launch from 10am";
const reasonsOf = (raw: unknown, request = REQUEST) => {
  const r = validatePlan(raw, brand, request);
  return r.ok ? [] : r.reasons;
};

describe("contrastRatio", () => {
  it("matches known WCAG values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });
});

describe("Brand", () => {
  it("normalises colours to lowercase #rrggbb", () => {
    expect(Brand.parse({ ...brand, colors: ["#ABC", "#FfF7eD"] }).colors).toEqual(["#aabbcc", "#fff7ed"]);
  });
  it("caps the name so the brand mark always fits", () => {
    expect(Brand.safeParse({ ...brand, name: "x".repeat(41) }).success).toBe(false);
  });
});

describe("validatePlan", () => {
  it("accepts a valid plan", () => {
    expect(validatePlan(good, brand, REQUEST).ok).toBe(true);
  });

  // Cases below are real qwen2.5:7b output from the batch run.
  it("rejects emoji and other scripts the brand fonts can't draw", () => {
    const r = reasonsOf({ ...good, supporting: "New dishes + pumpkin spice everything. 🍁南瓜香料" });
    expect(r.join()).toMatch(/can't draw: 🍁 南 瓜 香 料/);
  });

  it("accepts accents, curly quotes, dashes, bullets and currency", () => {
    expect(reasonsOf({ ...good, supporting: "Café crème – “so good” • 10am… €" })).toEqual([]);
  });

  it("rejects a wrong weekday and an invented time", () => {
    const r = reasonsOf({ ...good, supporting: "Join us Sat 11am, sunny side up!" }, "Instagram post for our Sunday brunch launch");
    expect(r.join()).toMatch(/"11", "Sat"/);
  });

  it("rejects an invented email and an invented amount", () => {
    expect(reasonsOf({ ...good, supporting: "Send your CV to hire@sunbrunchco.com" }, "We're hiring a head chef").join()).toMatch(/hire@sunbrunchco\.com/);
    expect(reasonsOf({ ...good, supporting: "Expands with $5M investment." }, "Announce our Series A").join()).toMatch(/"5"/);
  });

  it("allows facts that the request or brand name gave, in another form", () => {
    const plan = { ...good, supporting: "Dec 24 - Jan 2. Thu 3pm. 20% off. Sunday vibes." };
    expect(reasonsOf(plan, "Closed 24 Dec to 2 Jan; webinar Thursday 3pm; 20% off")).toEqual([]);
    expect(reasonsOf({ ...good, supporting: "She sat down at the sun lounger." }, "relaxing")).toEqual([]);
  });

  it("rejects a colour outside the palette", () => {
    const r = reasonsOf({ ...good, colors: { ...good.colors, accent: "#00ff00" } });
    expect(r.join()).toMatch(/colors\.accent.*not a brand colour/);
  });

  it("rejects a non-brand font", () => {
    const r = reasonsOf({ ...good, fontRoles: { headline: "Comic Sans MS", body: "Inter" } });
    expect(r.join()).toMatch(/fontRoles\.headline/);
  });

  it("rejects low contrast text", () => {
    const r = reasonsOf({ ...good, colors: { background: "#f97316", text: "#fdba74", accent: "#1a1a1a" } });
    expect(r.join()).toMatch(/contrast/);
  });

  it("rejects an accent that matches the background", () => {
    const r = reasonsOf({ ...good, colors: { ...good.colors, accent: "#1A1A1A" } });
    expect(r.join()).toMatch(/accent must differ/);
  });

  it("rejects an over-long headline and unknown layout", () => {
    const r = reasonsOf({ ...good, layout: "wild", headline: "x".repeat(80) });
    expect(r.join()).toMatch(/layout/);
    expect(r.join()).toMatch(/headline/);
  });

  it("rejects malformed shapes with readable reasons", () => {
    expect(reasonsOf("not an object").length).toBeGreaterThan(0);
    expect(reasonsOf({}).length).toBeGreaterThan(0);
  });
});

describe("paletteProblem", () => {
  it("passes a palette with a readable pair", () => {
    expect(paletteProblem(["#1F3A2E", "#F4EDE1", "#E07A5F"])).toBeNull();
  });
  it("names the best pair when none reaches 4.5:1", () => {
    expect(paletteProblem(["#FFE066", "#FFFFFF", "#FFB3C6"])).toMatch(/#FFFFFF and #FFB3C6 is 1.68:1/);
    expect(paletteProblem(["#111111", "#D7263D"])).toMatch(/3.81:1/);
  });
});

describe("neutral text for unreadable palettes", () => {
  const pastel: Brand = { name: "Sunny Pops", colors: ["#ffe066", "#ffffff", "#ffb3c6"], fonts: ["Fredoka", "Nunito"], voice: "bubbly" };
  const plan = {
    layout: "centered",
    headline: "Mango pops are here",
    supporting: "Our new mango ice pop.",
    colors: { background: "#ffe066", text: "#111111", accent: "#ffb3c6" },
    fontRoles: { headline: "Fredoka", body: "Nunito" },
  };
  it("adds neutrals only when no brand pair is readable", () => {
    expect(textColors(pastel.colors)).toEqual([...pastel.colors, "#111111"]);
    expect(textColors(["#1a1a1a", "#fff7ed"])).toEqual(["#1a1a1a", "#fff7ed"]);
  });
  it("allows neutral text, but not a neutral background", () => {
    expect(validatePlan(plan, pastel, "Launch our new mango ice pop").ok).toBe(true);
    const r = validatePlan({ ...plan, colors: { ...plan.colors, background: "#111111", text: "#ffffff" } }, pastel, "Launch our new mango ice pop");
    expect(r.ok ? [] : r.reasons).toEqual([expect.stringMatching(/colors.background #111111 is not a brand colour/)]);
  });
});
