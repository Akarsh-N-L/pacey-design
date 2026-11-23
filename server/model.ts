import { z } from "zod";
import { Brand, HEADLINE_MAX, LAYOUT_HINTS, LAYOUTS, Plan, SUPPORTING_MAX, type LayoutId } from "./schema";
import { paletteProblem, readablePairs, textColors } from "./contrast";
import { factsIn, validatePlan, type Validation } from "./validate";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
export const MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:7b";

// Brief: "send the reasons back to the model and try again, at most twice". So at most 3 calls.
export const MAX_RETRIES = 2;

export type Message = { role: "system" | "user" | "assistant"; content: string };
export type ChatFn = (messages: Message[], format: object) => Promise<string>;

export type Attempt = { raw: string; kind: "malformed" | "invalid"; reasons: string[] };
export type PlanResult =
  | { ok: true; plan: Plan; attempts: Attempt[] }
  | { ok: false; attempts: Attempt[] };

/**
 * The Plan schema narrowed to this brand: colours and fonts become enums, so
 * Ollama's constrained decoding can't emit an off-brand value in the first place.
 * validatePlan still runs afterwards; this only cuts down on retries.
 */
export function planSchemaFor(brand: Brand, layouts: readonly LayoutId[] = LAYOUTS) {
  const color = z.enum(brand.colors as [string, ...string[]]);
  const textColor = z.enum(textColors(brand.colors) as [string, ...string[]]);
  const font = z.enum(brand.fonts);
  const { $schema, ...schema } = z.toJSONSchema(
    Plan.extend({
      layout: z.enum(layouts as [LayoutId, ...LayoutId[]]).describe("Which layout to use."),
      colors: z.object({
        background: color.describe("Fills the design."),
        text: textColor.describe("Headline and supporting text. Must contrast strongly with background."),
        accent: color.describe("Decorative shapes and highlights. Different from background."),
      }),
      fontRoles: z.object({
        headline: font.describe("Font for the headline."),
        body: font.describe("Font for the supporting line."),
      }),
    }),
  );
  return schema;
}

/**
 * Small models stick to a favourite layout. Offering a random 2 of the 3 per request
 * keeps designs varied; the model still chooses between them.
 */
export function offerLayouts(random = Math.random): LayoutId[] {
  const drop = Math.floor(random() * LAYOUTS.length);
  return LAYOUTS.filter((_, i) => i !== drop);
}

export function buildMessages(brand: Brand, request: string, offered: readonly LayoutId[] = LAYOUTS): Message[] {
  const layouts = offered.map((id) => `  - ${id}: ${LAYOUT_HINTS[id]}`).join("\n");
  const system = `You are a social media designer with 10 years of experience creating on-brand graphics for Instagram, TikTok and Facebook. You know how to write a headline that stops the scroll, and you never break a brand's guidelines.

Your job: plan ONE social graphic for the brand and request you are given. You do not draw it; you choose the layout, write the copy and assign the brand's colours and fonts. Code will build the design from your plan.

Rules:
- layout: pick the one that best suits the request:
${layouts}
- headline: at most ${HEADLINE_MAX} characters, punchy, in the brand's voice. No hashtags or emoji.
- supporting: at most ${SUPPORTING_MAX} characters, the key detail (what, when, where).
- Facts: use ONLY facts given in the request. Never invent dates, days, times, prices, numbers, names, emails or links. If the request gives no details, write a line without them.
- Language: write EVERY word in English only, even if the request or brand voice is in another language. Never use Chinese, Japanese, Korean or any non-Latin script, and no emoji. Plain letters, digits and punctuation only.
- colors: use ONLY the brand's colours${paletteProblem(brand.colors) ? ` for background and accent. ${paletteProblem(brand.colors)} Use one of those for text` : ""}. text on background must have strong contrast (at least 4.5:1): pair a dark colour with a light one. accent should differ from background.
  Readable combinations: ${readablePairs(brand.colors).join("; ")}. Pick text and background from one of these.
- fontRoles: use ONLY the brand's fonts.

Before answering, check that the headline and supporting line are English only.

Output: answer with ONLY a JSON object matching this schema. No prose, no markdown, no code fences.
${JSON.stringify(planSchemaFor(brand, offered), null, 2)}`;

  const user = `Brand: ${brand.name}
Colours: ${brand.colors.join(", ")}
Fonts: ${brand.fonts.join(", ")}
Voice: ${brand.voice}

Request: ${request}
Facts in the request you may use: ${factsIn(request)}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export function repairMessage(reasons: string[]): string {
  return `That plan was rejected. Fix exactly these problems and return the full corrected JSON plan:
${reasons.map((r) => `- ${r}`).join("\n")}

Keep everything else that was fine. Answer with ONLY the JSON object.`;
}

export const chat: ChatFn = async (messages, format) => {
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, messages, format, stream: false, options: { temperature: 0.4 } }),
    });
  } catch (e) {
    throw new Error(`Can't reach Ollama at ${OLLAMA_URL}. Is it running (\`ollama serve\`)? ${(e as Error).message}`);
  }
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { message: { content: string } };
  return data.message.content;
};

/** Weak models sometimes wrap JSON in prose or code fences; take the outermost object. */
export function parseJson(text: string): { ok: true; value: unknown } | { ok: false; reason: string } {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return { ok: false, reason: "The response contained no JSON object." };
  try {
    return { ok: true, value: JSON.parse(text.slice(start, end + 1)) };
  } catch (e) {
    return { ok: false, reason: `The response was not valid JSON: ${(e as Error).message}` };
  }
}

/**
 * Ask -> parse -> validate, feeding rejection reasons back in the same conversation.
 * At most MAX_RETRIES retries, whatever went wrong. Never returns a bad plan.
 */
export async function generatePlan(
  brand: Brand,
  request: string,
  chatFn: ChatFn = chat,
  offered: readonly LayoutId[] = offerLayouts(),
): Promise<PlanResult> {
  const messages = buildMessages(brand, request, offered);
  const format = planSchemaFor(brand, offered);
  const attempts: Attempt[] = [];

  while (true) {
    const raw = await chatFn(messages, format);
    const parsed = parseJson(raw);
    const v: Validation = parsed.ok
      ? validatePlan(parsed.value, brand, request)
      : { ok: false, kind: "malformed", reasons: [parsed.reason] };
    if (v.ok) return { ok: true, plan: v.plan, attempts };

    attempts.push({ raw, kind: v.kind, reasons: v.reasons });
    if (attempts.length > MAX_RETRIES) return { ok: false, attempts };
    messages.push({ role: "assistant", content: raw }, { role: "user", content: repairMessage(v.reasons) });
  }
}
