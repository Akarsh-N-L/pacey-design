import { afterAll, describe, expect, it } from "vitest";
import type { ChatFn } from "./model";
import { generateDesign } from "./pipeline";
import { closeBrowser } from "./render";
import type { Brand } from "./schema";

// Real Google Fonts (cached in .cache/fonts after the first run); the model is faked.
const brand: Brand = {
  name: "Sunday Brunch Co",
  colors: ["#1a1a1a", "#fff7ed", "#f97316"],
  fonts: ["Playfair Display", "Inter"],
  voice: "warm",
};
const plan = {
  layout: "split",
  headline: "Brunch is back",
  supporting: "Sunday from 10am.",
  colors: { background: "#fff7ed", text: "#1a1a1a", accent: "#f97316" },
  fontRoles: { headline: "Playfair Display", body: "Inter" },
};
const replying = (...replies: string[]): ChatFn => {
  let i = 0;
  return async () => replies[Math.min(i++, replies.length - 1)];
};

afterAll(closeBrowser);

describe("generateDesign", { timeout: 60_000 }, () => {
  it("produces both sizes from one plan, each brand-checked", async () => {
    const r = await generateDesign(brand, "Sunday brunch launch from 10am", replying("oops", JSON.stringify(plan)));
    if (r.stage !== "done") throw new Error("expected a design");
    expect(r.ok).toBe(true);
    expect(r.attempts).toHaveLength(1); // the "oops" was repaired
    expect(r.designs.map((d) => [d.size, d.width, d.height])).toEqual([
      ["portrait", 1080, 1350],
      ["story", 1080, 1920],
    ]);
    for (const d of r.designs) {
      expect(d.pass).toBe(true);
      expect(d.checks.map((c) => c.rule)).toEqual(["colours", "contrast", "fonts", "margins", "fit"]);
      expect(Buffer.from(d.png!, "base64").subarray(1, 4).toString()).toBe("PNG");
    }
  });

  it("returns no designs at all when the model never gives a valid plan", async () => {
    const r = await generateDesign(brand, "Sunday brunch launch from 10am", replying("not json"));
    expect(r).toMatchObject({ ok: false, stage: "plan" });
    expect("designs" in r).toBe(false);
  });
});
