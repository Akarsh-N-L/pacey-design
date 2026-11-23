import { checkFacts, collectFacts, type CheckResult } from "./check";
import { SIZES, type SizeId } from "./layouts";
import { generatePlan, type Attempt, type ChatFn } from "./model";
import { renderDesign } from "./render";
import type { Brand, LayoutId, Plan } from "./schema";

// png is null when the brand check failed: a broken design never leaves the server.
export type Design = { size: SizeId; width: number; height: number; png: string | null; checks: CheckResult[]; pass: boolean };

export type DesignResult =
  | { ok: false; stage: "plan"; attempts: Attempt[] } // the model never produced a valid plan: nothing to show
  | { ok: boolean; stage: "done"; plan: Plan; attempts: Attempt[]; designs: Design[] }; // ok = every size passed the brand check

/** Brand + request -> plan (with repair) -> both sizes rendered -> brand check on each. */
// layout: force one layout (UI testing option); omitted, the model picks.
export async function generateDesign(brand: Brand, request: string, chatFn?: ChatFn, layout?: LayoutId): Promise<DesignResult> {
  const planned = await generatePlan(brand, request, chatFn, layout && [layout]);
  if (!planned.ok) return { ok: false, stage: "plan", attempts: planned.attempts };

  const designs = await Promise.all(
    (Object.keys(SIZES) as SizeId[]).map(async (size): Promise<Design> => {
      const { png, fit, inspection } = await renderDesign(planned.plan, brand, size, collectFacts);
      const checks = checkFacts(inspection, brand, fit);
      const { width, height } = SIZES[size];
      const pass = checks.every((c) => c.pass);
      return { size, width, height, png: pass ? png.toString("base64") : null, checks, pass };
    }),
  );
  return { ok: designs.every((d) => d.pass), stage: "done", plan: planned.plan, attempts: planned.attempts, designs };
}
