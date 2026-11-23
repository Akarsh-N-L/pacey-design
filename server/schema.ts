import { z } from "zod";

const hex = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "must be a hex colour like #1a2b3c");

/** #ABC / #AABBCC -> #aabbcc: the form Chromium reports, so palette comparisons are exact. */
export const normalizeHex = (c: string) => {
  const h = c.toLowerCase();
  return h.length === 4 ? "#" + [...h.slice(1)].map((x) => x + x).join("") : h;
};

const fontName = z.string().regex(/^[A-Za-z0-9 ]{1,60}$/, "must be a Google Font name, e.g. Playfair Display");

export const Brand = z.object({
  // Capped so the brand mark fits the narrowest layout column.
  name: z.string().trim().min(1).max(40),
  colors: z.array(hex.transform(normalizeHex)).min(2).max(5),
  // Google Font names. Restricted charset: they end up inside CSS and URLs.
  fonts: z.tuple([fontName, fontName]),
  voice: z.string().min(1),
});
export type Brand = z.infer<typeof Brand>;

// Finalised in the layouts task; the model may only pick from this list.
export const LAYOUTS = ["centered", "split", "banner"] as const;
export type LayoutId = (typeof LAYOUTS)[number];
// Equally broad on purpose: a specific hint ("good for events") makes small models never pick that layout otherwise.
export const LAYOUT_HINTS: Record<LayoutId, string> = {
  centered: "big headline centred on a solid background, accent bar and supporting line below. Bold and simple; suits most posts.",
  split: "colour block on one side, text on the other. Modern and editorial; suits most posts.",
  banner: "cover style: accent block across the top half holding a big headline, supporting line beneath. Eye-catching; suits most posts.",
};

export const HEADLINE_MAX = 60;
export const SUPPORTING_MAX = 120;

// Descriptions end up in the JSON Schema the model sees, so they double as instructions.
export const Plan = z.object({
  layout: z.enum(LAYOUTS).describe("Which layout to use."),
  headline: z.string().min(1).max(HEADLINE_MAX).describe("Main text. Short, punchy, in the brand voice."),
  supporting: z.string().min(1).max(SUPPORTING_MAX).describe("One supporting line with the key detail."),
  colors: z
    .object({
      background: hex.describe("Fills the design."),
      text: hex.describe("Headline and supporting text. Must contrast strongly with background."),
      accent: hex.describe("Decorative shapes and highlights. Different from background."),
    })
    .describe("Which brand colour does what."),
  fontRoles: z
    .object({
      headline: z.string().describe("Font for the headline."),
      body: z.string().describe("Font for the supporting line."),
    })
    .describe("Which brand font does what."),
});
export type Plan = z.infer<typeof Plan>;
