import { contrastRatio, readablePairs, textColors } from "./contrast";
import { Brand, normalizeHex, Plan } from "./schema";

/** "malformed" = wrong shape (missing fields, wrong types); "invalid" = right shape, breaks a brand rule. */
export type Validation =
  | { ok: true; plan: Plan }
  | { ok: false; kind: "malformed" | "invalid"; reasons: string[] };

const norm = normalizeHex;

// Brand fonts are loaded with Latin subsets only: Latin letters, Latin-1/Extended, general punctuation, € and £.
const DRAWABLE = /[ -~ -ɏ‐-‧‰-⁞€]/u;

/** Characters the brand fonts can't draw (emoji, CJK, ...), deduplicated. */
export function undrawable(text: string): string[] {
  return [...new Set([...text].filter((ch) => !DRAWABLE.test(ch)))];
}

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
// Full names in any case; short forms only capitalised ("Sat", not the verb "sat").
const DAY_RE = /\b(?:(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(Mon|Tues?|Wed|Thu(?:rs?)?|Fri|Sat|Sun)\.?)\b/gi;
const days = (s: string) =>
  new Set(
    [...s.matchAll(DAY_RE)]
      .filter((m) => m[1] || /^[A-Z]/.test(m[2]))
      .map((m) => WEEKDAYS.indexOf((m[1] ?? m[2]).slice(0, 3).toLowerCase())),
  );
const numbers = (s: string) => new Set(s.match(/\d+/g) ?? []);
const CONTACT_RE = /\S+@\S+\.\w+|https?:\/\/\S+|www\.\S+|\b[\w-]+\.(?:com|co|io|org|net|uk|ai|app|dev)\b/gi;

/**
 * Facts in the copy that the request (or brand name) never gave: numbers, weekdays, emails, URLs.
 * ponytail: token matching, not meaning. It catches "Sat 11am" for a Sunday request, but not a reworded wrong fact.
 */
export function inventedFacts(text: string, source: string): string[] {
  const srcNums = numbers(source);
  const srcDays = days(source);
  const srcLower = source.toLowerCase();
  const nums = [...numbers(text)].filter((n) => !srcNums.has(n));
  const dayWords = [...text.matchAll(DAY_RE)]
    .filter((m) => (m[1] || /^[A-Z]/.test(m[2])) && !srcDays.has(WEEKDAYS.indexOf((m[1] ?? m[2]).slice(0, 3).toLowerCase())))
    .map((m) => m[0]);
  const contacts = (text.match(CONTACT_RE) ?? []).filter((c) => !srcLower.includes(c.toLowerCase()));
  return [...new Set([...nums, ...dayWords, ...contacts])];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The facts a source (request + brand name) gives, as the model should be told them. */
export function factsIn(source: string): string {
  const found = [
    ...[...source.matchAll(DAY_RE)].filter((m) => m[1] || /^[A-Z]/.test(m[2])).map((m) => m[0]),
    ...numbers(source),
    ...(source.match(CONTACT_RE) ?? []),
  ];
  return found.length
    ? `${[...new Set(found)].join(", ")}. Do not add any other days, dates, times, numbers, prices or links.`
    : "none. So write NO days, dates, times, numbers, prices or links at all.";
}

/** Reasons are plain sentences: they are fed straight back to the model on repair. */
export function validatePlan(raw: unknown, brand: Brand, request: string): Validation {
  const parsed = Plan.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      kind: "malformed",
      reasons: parsed.error.issues.map((i) => `${i.path.join(".") || "plan"}: ${i.message}`),
    };
  }
  const plan = parsed.data;
  const reasons: string[] = [];

  for (const [role, c] of Object.entries(plan.colors)) {
    const allowed = role === "text" ? textColors(brand.colors) : brand.colors;
    if (!allowed.map(norm).includes(norm(c))) {
      reasons.push(`colors.${role} ${c} is not a brand colour. Use one of: ${allowed.join(", ")}.`);
    }
  }
  for (const [role, f] of Object.entries(plan.fontRoles)) {
    if (!brand.fonts.includes(f)) {
      reasons.push(`fontRoles.${role} "${f}" is not a brand font. Use one of: ${brand.fonts.join(", ")}.`);
    }
  }
  for (const field of ["headline", "supporting"] as const) {
    const bad = undrawable(plan[field]);
    if (bad.length) {
      reasons.push(`${field} contains characters the brand fonts can't draw: ${bad.join(" ")}. Write in English with plain letters and punctuation only, no emoji.`);
    }
    // The brand name may appear in copy ("Sunday Brunch Co"), but its words aren't facts ("Sunday").
    const invented = inventedFacts(plan[field].replace(new RegExp(escapeRe(brand.name), "gi"), ""), request);
    if (invented.length) {
      reasons.push(`${field} mentions ${invented.map((x) => `"${x}"`).join(", ")}, which the request never gave. Rewrite ${field} without them. Facts you may use: ${factsIn(request)}`);
    }
  }
  // Only check colour relationships once the colours themselves are valid.
  if (reasons.length === 0) {
    if (norm(plan.colors.accent) === norm(plan.colors.background)) {
      reasons.push(`colors.accent must differ from colors.background (both ${plan.colors.background}), or the accent is invisible.`);
    }
    const ratio = contrastRatio(plan.colors.text, plan.colors.background);
    if (ratio < 4.5) {
      reasons.push(
        `text ${plan.colors.text} on background ${plan.colors.background} has contrast ${ratio.toFixed(2)}:1; need at least 4.5:1. Pick text and background from one of these readable combinations: ${readablePairs(brand.colors).join("; ")}.`,
      );
    }
  }
  return reasons.length ? { ok: false, kind: "invalid", reasons } : { ok: true, plan };
}
