import { chromium, type Browser, type Page } from "playwright";
import { fontFaceCss } from "./fonts";
import { renderLayout, SIZES, type Size, type SizeId } from "./layouts";
import type { Brand, Plan } from "./schema";

export type FitResult = { role: string; fontSize: number; fits: boolean };
export type Rendered<T> = { png: Buffer; fit: FitResult[]; inspection: T };

let browser: Promise<Browser> | undefined;
const getBrowser = () => (browser ??= chromium.launch());
export async function closeBrowser() {
  if (browser) await (await browser).close();
  browser = undefined;
}

/**
 * Load HTML at the exact size, make sure the brand fonts really loaded, shrink text
 * to fit its slot, run `afterFit` on the finished page (the brand check), screenshot.
 */
export async function renderHtml<T = undefined>(
  html: string,
  size: Size,
  fonts: string[],
  afterFit?: (page: Page) => Promise<T>,
): Promise<Rendered<T>> {
  const context = await (await getBrowser()).newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: 1,
  });
  try {
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "load" });
    // tsx/esbuild wraps named functions in __name(); those functions run in the page via evaluate.
    await page.evaluate("globalThis.__name = (f) => f");

    const missing = await page.evaluate(async (fonts) => {
      await Promise.all(fonts.flatMap((f) => ["400", "700"].map((w) => document.fonts.load(`${w} 40px "${f}"`))));
      await document.fonts.ready;
      const loaded = new Set([...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/"/g, "")));
      return fonts.filter((f) => !loaded.has(f));
    }, fonts);
    if (missing.length) throw new Error(`Fonts failed to load: ${missing.join(", ")}`);

    // Shrink-to-fit: the .t child must fit inside its fixed slot both ways.
    const fit = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("[data-fit]")].map((slot) => {
        const t = slot.firstElementChild as HTMLElement;
        const min = Number(slot.dataset.min);
        const fits = () => t.offsetHeight <= slot.clientHeight && t.scrollWidth <= slot.clientWidth;
        let size = parseFloat(getComputedStyle(t).fontSize);
        while (!fits() && size > min) {
          size = Math.max(min, size - 2);
          t.style.fontSize = `${size}px`;
        }
        if (!fits()) {
          // Last resort for a word wider than the column ("Supercalifragilistic…"): break inside words.
          t.style.whiteSpace = "normal";
          t.style.overflowWrap = "anywhere";
          t.style.hyphens = "auto";
        }
        return { role: slot.dataset.role!, fontSize: size, fits: fits() };
      }),
    );

    const inspection = (afterFit ? await afterFit(page) : undefined) as T;
    const png = await page.screenshot({ type: "png" });
    return { png, fit, inspection };
  } finally {
    await context.close();
  }
}

export async function renderDesign<T = undefined>(
  plan: Plan,
  brand: Brand,
  sizeId: SizeId,
  afterFit?: (page: Page) => Promise<T>,
): Promise<Rendered<T>> {
  const fonts = [...new Set([plan.fontRoles.headline, plan.fontRoles.body])];
  const css = (await Promise.all(fonts.map(fontFaceCss))).join("\n");
  return renderHtml(renderLayout(plan, brand, sizeId, css), SIZES[sizeId], fonts, afterFit);
}
