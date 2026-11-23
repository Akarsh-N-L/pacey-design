import { describe, expect, it } from "vitest";
import { mostReadableOn, renderLayout, SIZES, type SizeId } from "./layouts";
import { LAYOUTS, type Brand, type Plan } from "./schema";

const brand: Brand = {
  name: "Sunday Brunch Co",
  colors: ["#1a1a1a", "#fff7ed", "#f97316"],
  fonts: ["Playfair Display", "Inter"],
  voice: "warm",
};
const plan: Plan = {
  layout: "centered",
  headline: "Brunch is back",
  supporting: "Join us this Sunday from 10am.",
  colors: { background: "#1a1a1a", text: "#fff7ed", accent: "#f97316" },
  fontRoles: { headline: "Playfair Display", body: "Inter" },
};

/** Pull every positioned element's box out of the HTML. */
function boxes(html: string) {
  const re = /<div class="(slot|shape)"([^>]*)style="left:(\d+)px;top:(\d+)px;width:(\d+)px;height:(\d+)px;/g;
  return [...html.matchAll(re)].map(([, , attrs, x, y, w, h]) => ({
    bleed: attrs.includes("data-bleed"),
    x: +x, y: +y, w: +w, h: +h,
  }));
}

describe("renderLayout", () => {
  for (const layout of LAYOUTS) {
    for (const sizeId of Object.keys(SIZES) as SizeId[]) {
      it(`${layout} @ ${sizeId}: every non-bleed element sits inside the safe area with real space`, () => {
        const { width, height, safe } = SIZES[sizeId];
        const html = renderLayout({ ...plan, layout }, brand, sizeId);
        expect(html).toContain(`width:${width}px;height:${height}px`);
        const all = boxes(html);
        expect(all.length).toBeGreaterThanOrEqual(4);
        for (const b of all.filter((b) => !b.bleed)) {
          expect(b.x).toBeGreaterThanOrEqual(safe.left);
          expect(b.y).toBeGreaterThanOrEqual(safe.top);
          expect(b.x + b.w).toBeLessThanOrEqual(width - safe.right);
          expect(b.y + b.h).toBeLessThanOrEqual(height - safe.bottom);
          expect(b.w).toBeGreaterThan(0);
          expect(b.h).toBeGreaterThan(0);
        }
      });
    }
  }

  it("escapes model text so it can never become markup", () => {
    const html = renderLayout({ ...plan, headline: `<img src=x onerror="alert(1)">` }, brand, "portrait");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("banner puts the headline in whichever colour reads best on the accent band", () => {
    const html = renderLayout({ ...plan, layout: "banner" }, brand, "portrait");
    const headline = html.match(/data-role="headline"[^]*?color:(#[0-9a-f]+)/)![1];
    expect(headline).toBe(mostReadableOn("#f97316", ["#fff7ed", "#1a1a1a"]));
  });
});

describe("mostReadableOn", () => {
  it("picks the higher-contrast option", () => {
    expect(mostReadableOn("#ffffff", ["#eeeeee", "#111111"])).toBe("#111111");
    expect(mostReadableOn("#000000", ["#eeeeee", "#111111"])).toBe("#eeeeee");
  });
});
