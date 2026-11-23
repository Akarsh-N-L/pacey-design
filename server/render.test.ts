import { afterAll, describe, expect, it } from "vitest";
import { renderLayout, SIZES } from "./layouts";
import { closeBrowser, renderHtml } from "./render";
import type { Brand, Plan } from "./schema";

// No brand fonts here (fonts = []), so these tests need Chromium but not the network.
const brand: Brand = { name: "Test Co", colors: ["#111111", "#ffffff", "#ff6600"], fonts: ["Georgia", "Arial"], voice: "x" };
const plan: Plan = {
  layout: "split",
  headline: "Brunch is back",
  supporting: "Sunday 10am.",
  colors: { background: "#111111", text: "#ffffff", accent: "#ff6600" },
  fontRoles: { headline: "Georgia", body: "Arial" },
};
const render = (p: Plan) => renderHtml(renderLayout(p, brand, "portrait"), SIZES.portrait, []);
const headline = (fit: { role: string; fontSize: number; fits: boolean }[]) => fit.find((f) => f.role === "headline")!;

afterAll(closeBrowser);

describe("renderHtml", { timeout: 30_000 }, () => {
  it("renders a PNG at the exact size", async () => {
    const { png } = await render(plan);
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1080);
    expect(png.readUInt32BE(20)).toBe(1350);
  });

  it("shrinks a long headline until it fits the narrow column", async () => {
    const short = headline((await render(plan)).fit);
    const long = headline((await render({ ...plan, headline: "Our biggest bottomless brunch weekend ever, now with more" })).fit);
    expect(short).toMatchObject({ fits: true, fontSize: 96 });
    expect(long.fits).toBe(true);
    expect(long.fontSize).toBeLessThan(96);
  });

  it("breaks a word wider than the column as a last resort, so it still fits", async () => {
    const { fit } = await render({ ...plan, headline: "Supercalifragilisticexpialidocious brunch" });
    expect(headline(fit)).toMatchObject({ fits: true, fontSize: 56 });
  });

  it("reports text that can't fit even at the minimum size", async () => {
    const html = `<div class="slot" data-role="headline" data-fit data-min="20"
      style="position:absolute;width:100px;height:20px;overflow:hidden"><div class="t" style="font-size:40px">far too much text for this box</div></div>`;
    const { fit } = await renderHtml(html, SIZES.portrait, []);
    expect(headline(fit)).toMatchObject({ fits: false, fontSize: 20 });
  });

  it("fails loudly when a brand font doesn't load", async () => {
    await expect(renderHtml("<p>hi</p>", SIZES.portrait, ["Not A Real Font"])).rejects.toThrow(/Fonts failed to load/);
  });
});
