import type { Page } from "playwright";
import { contrastRatio } from "./contrast";
import type { FitResult } from "./render";
import { normalizeHex, type Brand } from "./schema";

/** What the browser actually rendered, per element. Colours are lowercase #rrggbb, or the raw CSS if translucent. */
export type ElementFact = {
  label: string;
  bleed: boolean;
  rect: { x: number; y: number; w: number; h: number };
  background: string | null; // own background, null if transparent
  // missing: characters outside the font's loaded unicode-ranges, i.e. drawn by a fallback font.
  text: { color: string; behind: string | null; font: string; size: number; weight: number; missing: string[] } | null;
};
export type Facts = { width: number; height: number; safe: [number, number, number, number]; elements: ElementFact[] };

export type RuleId = "colours" | "contrast" | "fonts" | "margins" | "fit";
export type CheckResult = { rule: RuleId; pass: boolean; details: string[] };

/** Runs inside the rendered page (pass as renderDesign's afterFit). */
export function collectFacts(page: Page): Promise<Facts> {
  return page.evaluate(() => {
    const toHex = (css: string): string | null => {
      const m = css.match(/rgba?\(([^)]+)\)/);
      if (!m) return css;
      const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      if (a === 0) return null;
      if (a < 1) return css;
      return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
    };
    // ponytail: samples the colour at the text's centre; a text box straddling two fills would need several samples.
    const behind = (el: Element, r: DOMRect) => {
      for (const under of document.elementsFromPoint(r.x + r.width / 2, r.y + r.height / 2)) {
        if (under === el) continue;
        const bg = toHex(getComputedStyle(under).backgroundColor);
        if (bg) return bg;
      }
      return null;
    };
    // Computed font-family is only what CSS asked for. A glyph the @font-face doesn't cover is
    // silently drawn by a system font, so compare each character with the loaded unicode-ranges.
    const ranges = new Map<string, [number, number][]>();
    for (const face of document.fonts) {
      const list = ranges.get(face.family.replace(/"/g, "")) ?? [];
      for (const part of face.unicodeRange.split(",")) {
        const m = part.trim().match(/^U\+([0-9A-F?]+)(?:-([0-9A-F]+))?$/i);
        if (!m) continue;
        list.push([parseInt(m[1].replace(/\?/g, "0"), 16), parseInt(m[2] ?? m[1].replace(/\?/g, "F"), 16)]);
      }
      ranges.set(face.family.replace(/"/g, ""), list);
    }
    const missing = (family: string, text: string) => {
      const r = ranges.get(family);
      if (!r) return []; // not a web font we loaded (e.g. system fonts in tests): can't tell
      return [...new Set([...text].filter((ch) => ch.trim() && !r.some(([a, b]) => ch.codePointAt(0)! >= a && ch.codePointAt(0)! <= b)))];
    };
    const elements = [document.body, ...document.body.querySelectorAll<HTMLElement>("*")].map((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const hasText = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());
      const font = cs.fontFamily.split(",")[0].trim().replace(/^["']|["']$/g, "");
      return {
        label: el.dataset.role ?? (el.parentElement as HTMLElement | null)?.dataset.role ?? el.tagName.toLowerCase(),
        bleed: el === document.body || !!el.closest("[data-bleed]"),
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
        background: toHex(cs.backgroundColor),
        text: hasText
          ? {
              color: toHex(cs.color)!,
              behind: behind(el, r),
              font,
              size: parseFloat(cs.fontSize),
              weight: Number(cs.fontWeight),
              missing: missing(font, el.textContent!),
            }
          : null,
      };
    });
    const safe = document.body.dataset.safe!.split(",").map(Number) as [number, number, number, number];
    return { width: innerWidth, height: innerHeight, safe, elements };
  });
}

// Brief: "4.5:1, or 3:1 for big headings". So 3:1 only for the headline, and only when it's
// WCAG-large (24px, or 18.66px bold). Everything else, however big, needs 4.5:1.
const isBigHeading = (label: string, t: { size: number; weight: number }) =>
  label === "headline" && (t.size >= 24 || (t.size >= 18.66 && t.weight >= 700));

export function checkFacts(facts: Facts, brand: Brand, fit: FitResult[]): CheckResult[] {
  const palette = new Set(brand.colors.map(normalizeHex));
  const texts = facts.elements.filter((e) => e.text);
  const result = (rule: RuleId, failures: string[], ok: string): CheckResult => ({
    rule,
    pass: failures.length === 0,
    details: failures.length ? failures : [ok],
  });

  const offPalette = new Set<string>();
  for (const e of facts.elements) {
    for (const c of [e.background, e.text?.color]) if (c && !palette.has(c)) offPalette.add(`${c} on ${e.label}`);
  }

  const contrast = texts.flatMap(({ label, text: t }) => {
    if (!t!.behind) return [`${label}: no background found behind the text`];
    const ratio = contrastRatio(t!.color, t!.behind);
    const need = isBigHeading(label, t!) ? 3 : 4.5;
    return ratio < need ? [`${label}: ${ratio.toFixed(2)}:1 at ${t!.size}px, needs ${need}:1`] : [];
  });

  const fonts = texts.flatMap(({ label, text: t }) => [
    ...(brand.fonts.includes(t!.font) ? [] : [`${label} uses "${t!.font}"`]),
    ...(t!.missing.length ? [`${label}: ${t!.missing.join(" ")} not in ${t!.font}, drawn by a fallback font`] : []),
  ]);

  const [top, right, bottom, left] = facts.safe;
  const margins = facts.elements
    .filter((e) => !e.bleed && e.rect.w > 0 && e.rect.h > 0)
    .filter(({ rect: r }) => r.x < left || r.y < top || r.x + r.w > facts.width - right || r.y + r.h > facts.height - bottom)
    .map(({ label, rect: r }) => `${label} at ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}x${Math.round(r.h)} leaves the safe area`);

  const overflow = fit.filter((f) => !f.fits).map((f) => `${f.role} doesn't fit even at ${f.fontSize}px`);

  return [
    result("colours", [...offPalette], "Only brand colours used"),
    result("contrast", contrast, `All ${texts.length} text elements readable`),
    result("fonts", fonts, `Only ${brand.fonts.join(" and ")}`),
    result("margins", margins, "Everything inside the safe area"),
    result("fit", overflow, "All text fits its space"),
  ];
}
