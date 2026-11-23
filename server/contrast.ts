/** WCAG 2.x contrast helpers. Reused by the brand check. */

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(hexToRgb(a));
  const lb = luminance(hexToRgb(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Text needs 4.5:1 against its background. Returns why no pair of brand colours gets
 * there, or null if one does.
 */
export function paletteProblem(colors: string[]): string | null {
  let best = { ratio: 0, a: "", b: "" };
  colors.forEach((a, i) =>
    colors.slice(i + 1).forEach((b) => {
      const ratio = contrastRatio(a, b);
      if (ratio > best.ratio) best = { ratio, a, b };
    }),
  );
  if (best.ratio >= 4.5) return null;
  return `No two brand colours are readable together (best pair ${best.a} and ${best.b} is ${best.ratio.toFixed(2)}:1; text needs 4.5:1), so text may use neutral ${NEUTRALS.join(" or ")}.`;
}

export const NEUTRALS = ["#111111", "#ffffff"];

/**
 * Colours text may use: the brand's, plus neutral near-black and white when no pair of
 * brand colours is readable (e.g. an all-pastel palette). Backgrounds and accents stay brand-only.
 */
export function textColors(colors: string[]): string[] {
  return paletteProblem(colors) ? [...new Set([...colors, ...NEUTRALS])] : colors;
}
