import { contrastRatio } from "./contrast";
import type { Brand, Plan } from "./schema";

/**
 * Layouts are pure functions: (plan, brand, size) -> HTML. The model only picks one
 * and fills its slots. Contracts with the renderer and brand check:
 *  - [data-fit] slots have fixed boxes; the renderer shrinks their .t child to fit (down to data-min px).
 *  - [data-bleed] shapes may touch the edges; every other element must stay inside the safe area.
 */

type Safe = { top: number; right: number; bottom: number; left: number };
export type Size = { width: number; height: number; safe: Safe };

export const SIZES = {
  portrait: { width: 1080, height: 1350, safe: { top: 80, right: 80, bottom: 80, left: 80 } },
  // Stories: keep clear of the profile header and the reply bar.
  story: { width: 1080, height: 1920, safe: { top: 250, right: 80, bottom: 340, left: 80 } },
} satisfies Record<string, Size>;
export type SizeId = keyof typeof SIZES;

type Box = { x: number; y: number; w: number; h: number };
type Ctx = { plan: Plan; brand: Brand; size: Size; inner: Box; tall: boolean; spare: string[] };

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const pos = (b: Box) => `left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;`;
const JUSTIFY = { start: "flex-start", center: "center", end: "flex-end" };

type TextOpts = {
  font: string;
  size: number;
  min: number;
  color: string;
  align?: "left" | "center";
  valign?: keyof typeof JUSTIFY;
  weight?: number;
  lineHeight?: number;
  extra?: string;
};

function text(role: string, b: Box, value: string, o: TextOpts) {
  const style =
    `font-family:'${o.font}';font-size:${o.size}px;font-weight:${o.weight ?? 400};` +
    `line-height:${o.lineHeight ?? 1.25};color:${o.color};${o.extra ?? ""}`;
  return (
    `<div class="slot" data-role="${role}" data-fit data-min="${o.min}" ` +
    `style="${pos(b)}justify-content:${JUSTIFY[o.valign ?? "start"]};text-align:${o.align ?? "left"};">` +
    `<div class="t" style="${escapeHtml(style)}">${escapeHtml(value)}</div></div>`
  );
}

const shape = (b: Box, color: string, bleed = false) =>
  `<div class="shape" data-role="accent"${bleed ? " data-bleed" : ""} style="${pos(b)}background:${color};"></div>`;

const STRIPE = 28;
/** Stripe split into equal segments, one per spare brand colour (see spareColors). */
function stripe(c: Ctx, b: Box) {
  const n = c.spare.length;
  const along = b.w >= b.h; // segments run along the stripe's long side
  return c.spare.map((color, i) => {
    const [from, to] = [Math.round(((along ? b.w : b.h) * i) / n), Math.round(((along ? b.w : b.h) * (i + 1)) / n)];
    return shape(along ? { ...b, x: b.x + from, w: to - from } : { ...b, y: b.y + from, h: to - from }, color, true);
  });
}

/** Of the given colours, the one most readable on `bg`. */
export const mostReadableOn = (bg: string, options: string[]) =>
  options.reduce((best, c) => (contrastRatio(c, bg) > contrastRatio(best, bg) ? c : best));

const BRAND_MARK_H = 40;
function brandMark(c: Ctx, b: Box, color: string, align: "left" | "center" = "left") {
  return text("brand", b, c.brand.name, {
    font: c.plan.fontRoles.body,
    size: 28,
    min: 14, // a 40-char name must fit the narrow split column on one line
    color,
    align,
    weight: 600,
    lineHeight: 1.4,
    extra: "letter-spacing:0.12em;text-transform:uppercase;white-space:nowrap;",
  });
}

const headlineOpts = (c: Ctx, color: string): TextOpts => ({
  font: c.plan.fontRoles.headline,
  size: c.tall ? 136 : 120,
  min: 56,
  color,
  weight: 700,
  lineHeight: 1.05,
  extra: "letter-spacing:-0.01em;",
});
const supportingOpts = (c: Ctx, color: string): TextOpts => ({
  font: c.plan.fontRoles.body,
  size: c.tall ? 50 : 44,
  min: 28,
  color,
  lineHeight: 1.3,
});

/** Big centred headline, accent bar, supporting line below, brand name at the foot. */
function centered(c: Ctx) {
  const { inner, plan, size } = c;
  const { text: fg, accent } = plan.colors;
  const bottom = inner.y + inner.h - BRAND_MARK_H - 40;
  const mid = Math.round(inner.y + (bottom - inner.y) * 0.55);
  return [
    text("headline", { x: inner.x, y: inner.y, w: inner.w, h: mid - 40 - inner.y }, plan.headline, {
      ...headlineOpts(c, fg),
      align: "center",
      valign: "end",
    }),
    shape({ x: size.width / 2 - 80, y: mid - 6, w: 160, h: 12 }, accent),
    text("supporting", { x: inner.x + 60, y: mid + 40, w: inner.w - 120, h: bottom - mid - 40 }, plan.supporting, {
      ...supportingOpts(c, fg),
      align: "center",
    }),
    brandMark(c, { x: inner.x, y: inner.y + inner.h - BRAND_MARK_H, w: inner.w, h: BRAND_MARK_H }, fg, "center"),
    ...stripe(c, { x: 0, y: size.height - STRIPE, w: size.width, h: STRIPE }),
  ];
}

/** Accent block on one side (left on portrait, top on story), text on the other. */
function split(c: Ctx) {
  const { inner, plan, size, tall } = c;
  const { text: fg, accent } = plan.colors;
  const block: Box = tall
    ? { x: 0, y: 0, w: size.width, h: Math.round(size.height * 0.36) }
    : { x: 0, y: 0, w: Math.round(size.width * 0.38), h: size.height };
  const col: Box = tall
    ? { x: inner.x, y: block.h + 80, w: inner.w, h: inner.y + inner.h - block.h - 80 }
    : { x: block.w + 64, y: inner.y, w: inner.x + inner.w - block.w - 64, h: inner.h };
  const bottom = col.y + col.h - BRAND_MARK_H - 40;
  const mid = Math.round(col.y + (bottom - col.y) * 0.6);
  const h = headlineOpts(c, fg);
  return [
    shape(block, accent, true),
    ...stripe(c, tall ? { x: 0, y: block.h, w: size.width, h: STRIPE } : { x: block.w, y: 0, w: STRIPE, h: size.height }),
    text("headline", { x: col.x, y: col.y, w: col.w, h: mid - 32 - col.y }, plan.headline, {
      ...h,
      size: tall ? h.size : 96, // narrow column on portrait
      valign: "end",
    }),
    text("supporting", { x: col.x, y: mid, w: col.w, h: bottom - mid }, plan.supporting, supportingOpts(c, fg)),
    brandMark(c, { x: col.x, y: col.y + col.h - BRAND_MARK_H, w: col.w, h: BRAND_MARK_H }, fg),
  ];
}

/** Cover style: accent block bleeds off the top holding a big bottom-aligned headline; rule, supporting line and brand name below. */
function banner(c: Ctx) {
  const { inner, plan, size, tall } = c;
  const { text: fg, background, accent } = plan.colors;
  const band: Box = { x: 0, y: 0, w: size.width, h: Math.round(size.height * (tall ? 0.55 : 0.57)) };
  const rule = band.h + 64;
  const below = rule + 12 + 40;
  const foot = inner.y + inner.h - BRAND_MARK_H;
  return [
    shape(band, accent, true),
    ...stripe(c, { x: 0, y: band.h, w: size.width, h: STRIPE }),
    text("headline", { x: inner.x, y: inner.y, w: inner.w, h: band.h - 64 - inner.y }, plan.headline, {
      ...headlineOpts(c, mostReadableOn(accent, [fg, background])),
      valign: "end",
    }),
    shape({ x: inner.x, y: rule, w: 96, h: 12 }, fg),
    text("supporting", { x: inner.x, y: below, w: Math.round(inner.w * 0.85), h: foot - 40 - below }, plan.supporting, supportingOpts(c, fg)),
    brandMark(c, { x: inner.x, y: foot, w: inner.w, h: BRAND_MARK_H }, fg),
  ];
}

/**
 * Brand colours the plan didn't use (e.g. the third colour when text is neutral, or the
 * 4th/5th colours of a big palette) go in a stripe beside the layout's colour block so they still show.
 */
export function spareColors(plan: Plan, brand: Brand): string[] {
  const used = Object.values(plan.colors).map((c) => c.toLowerCase());
  return brand.colors.filter((c) => !used.includes(c.toLowerCase()));
}

const LAYOUT_FNS: Record<Plan["layout"], (c: Ctx) => string[]> = { centered, split, banner };

/** fontFaceCss is injected by the renderer (local @font-face rules). */
export function renderLayout(plan: Plan, brand: Brand, sizeId: SizeId, fontFaceCss = ""): string {
  const size = SIZES[sizeId];
  const { width: W, height: H, safe } = size;
  const inner = { x: safe.left, y: safe.top, w: W - safe.left - safe.right, h: H - safe.top - safe.bottom };
  const spare = spareColors(plan, brand);
  const body = LAYOUT_FNS[plan.layout]({ plan, brand, size, inner, tall: H / W > 1.5, spare }).join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
${fontFaceCss}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden}
body{position:relative;background:${plan.colors.background}}
.slot{position:absolute;display:flex;flex-direction:column;overflow:hidden}
[data-role=headline] .t{text-wrap:balance}
[data-role=supporting] .t{text-wrap:pretty}
.shape{position:absolute}
</style></head>
<body data-layout="${plan.layout}" data-size="${sizeId}" data-safe="${safe.top},${safe.right},${safe.bottom},${safe.left}">
${body}
</body></html>`;
}
