import { afterAll, describe, expect, it } from "vitest";
import { checkFacts, collectFacts, type ElementFact, type Facts } from "./check";
import { renderLayout, SIZES } from "./layouts";
import { closeBrowser, renderDesign, renderHtml } from "./render";
import type { Brand, Plan } from "./schema";

const brand: Brand = { name: "Test Co", colors: ["#111111", "#ffffff", "#ff6600"], fonts: ["Georgia", "Arial"], voice: "x" };

const el = (over: Partial<ElementFact> = {}): ElementFact => ({
  label: "headline",
  bleed: false,
  rect: { x: 100, y: 100, w: 500, h: 200 },
  background: null,
  text: { color: "#ffffff", behind: "#111111", font: "Georgia", size: 40, weight: 400, missing: [] },
  ...over,
});
const facts = (...elements: ElementFact[]): Facts => ({
  width: 1080,
  height: 1350,
  safe: [80, 80, 80, 80],
  elements: [el({ label: "body", bleed: true, background: "#111111", text: null, rect: { x: 0, y: 0, w: 1080, h: 1350 } }), ...elements],
});
const fitOk = [{ role: "headline", fontSize: 40, fits: true }];
const rule = (f: Facts, id: string, fit = fitOk) => checkFacts(f, brand, fit).find((r) => r.rule === id)!;

describe("checkFacts", () => {
  it("passes a clean design on every rule", () => {
    expect(checkFacts(facts(el()), brand, fitOk).every((r) => r.pass)).toBe(true);
  });

  it("flags colours outside the palette", () => {
    const r = rule(facts(el({ background: "#00ff00", text: null, label: "accent" })), "colours");
    expect(r).toMatchObject({ pass: false, details: ["#00ff00 on accent"] });
  });

  it("uses 4.5:1 for normal text and 3:1 for large text", () => {
    // #ff6600 on #111111 is ~6.4:1; #ff6600 on #ffffff is ~2.9:1; #777777 on #ffffff is ~4.48:1
    const small = el({ text: { color: "#777777", behind: "#ffffff", font: "Georgia", size: 20, weight: 400, missing: [] } });
    const big = el({ text: { color: "#777777", behind: "#ffffff", font: "Georgia", size: 24, weight: 400, missing: [] } });
    const boldish = el({ text: { color: "#777777", behind: "#ffffff", font: "Georgia", size: 19, weight: 700, missing: [] } });
    expect(rule(facts(small), "contrast").pass).toBe(false);
    expect(rule(facts(big), "contrast").pass).toBe(true);
    expect(rule(facts(boldish), "contrast").pass).toBe(true);
  });

  it("only gives the 3:1 allowance to big headings, not to large body text", () => {
    const bigSupporting = el({ label: "supporting", text: { color: "#777777", behind: "#ffffff", font: "Arial", size: 44, weight: 400, missing: [] } });
    expect(rule(facts(bigSupporting), "contrast").pass).toBe(false);
  });

  it("treats 3-digit and uppercase brand hex the same as Chromium's #rrggbb", () => {
    const shortHex = { ...brand, colors: ["#111", "#FFF", "#f60"] };
    const f = facts(el({ background: "#ff6600", text: null, label: "accent" }));
    expect(checkFacts(f, shortHex, fitOk).find((r) => r.rule === "colours")!.pass).toBe(true);
  });

  it("flags non-brand fonts", () => {
    const r = rule(facts(el({ text: { color: "#ffffff", behind: "#111111", font: "Times New Roman", size: 40, weight: 400, missing: [] } })), "fonts");
    expect(r.details[0]).toMatch(/Times New Roman/);
  });

  it("flags characters drawn by a fallback font", () => {
    const r = rule(facts(el({ text: { color: "#ffffff", behind: "#111111", font: "Georgia", size: 40, weight: 400, missing: ["🍁", "南"] } })), "fonts");
    expect(r).toMatchObject({ pass: false, details: ["headline: 🍁 南 not in Georgia, drawn by a fallback font"] });
  });

  it("flags elements outside the safe area but exempts bleeds", () => {
    const out = el({ label: "accent", text: null, rect: { x: 40, y: 100, w: 100, h: 100 } });
    expect(rule(facts(out), "margins").pass).toBe(false);
    expect(rule(facts({ ...out, bleed: true }), "margins").pass).toBe(true);
  });

  it("fails when text didn't fit", () => {
    expect(rule(facts(el()), "fit", [{ role: "headline", fontSize: 56, fits: false }]).pass).toBe(false);
  });
});

// End to end in Chromium: the check reads what was really rendered.
const plan: Plan = {
  layout: "banner",
  headline: "Brunch is back",
  supporting: "Sunday 10am.",
  colors: { background: "#111111", text: "#ffffff", accent: "#ff6600" },
  fontRoles: { headline: "Georgia", body: "Arial" },
};
const renderAndCheck = async (p: Plan) => {
  const { fit, inspection } = await renderHtml(renderLayout(p, brand, "story"), SIZES.story, [], collectFacts);
  return checkFacts(inspection, brand, fit);
};

afterAll(closeBrowser);

describe("brand check on a real render", { timeout: 30_000 }, () => {
  it("passes every layout rule for a good plan", async () => {
    const results = await renderAndCheck(plan);
    expect(results.filter((r) => !r.pass)).toEqual([]);
  });

  it("catches low contrast the plan validator never saw (text over the accent band)", async () => {
    // Both text options read badly on this accent, so the banner headline must fail.
    const greyBrand = { ...brand, colors: ["#777777", "#888888", "#808080"] };
    const p = { ...plan, colors: { background: "#777777", text: "#888888", accent: "#808080" } };
    const { fit, inspection } = await renderHtml(renderLayout(p, greyBrand, "story"), SIZES.story, [], collectFacts);
    const contrast = checkFacts(inspection, greyBrand, fit).find((r) => r.rule === "contrast")!;
    expect(contrast.pass).toBe(false);
    expect(contrast.details.join()).toMatch(/headline/);
  });

  it("catches emoji and CJK drawn by a fallback font (real Google Fonts, real qwen output)", async () => {
    const webBrand: Brand = { ...brand, fonts: ["Playfair Display", "Inter"] };
    const p: Plan = {
      ...plan,
      supporting: "New dishes + pumpkin spice everything. 🍁南瓜香料",
      fontRoles: { headline: "Playfair Display", body: "Inter" },
    };
    const { fit, inspection } = await renderDesign(p, webBrand, "portrait", collectFacts);
    const fonts = checkFacts(inspection, webBrand, fit).find((r) => r.rule === "fonts")!;
    expect(fonts.pass).toBe(false);
    expect(fonts.details.join()).toMatch(/supporting: 🍁 南 瓜 香 料 not in Inter/);
  });
});
