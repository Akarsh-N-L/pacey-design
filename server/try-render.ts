// Render every layout at both sizes to .cache/preview/: npm run preview
import { mkdir, writeFile } from "node:fs/promises";
import { checkFacts, collectFacts } from "./check";
import { SIZES, type SizeId } from "./layouts";
import { closeBrowser, renderDesign } from "./render";
import { LAYOUTS, type Brand, type Plan } from "./schema";

const brand: Brand = {
  name: "Sunday Brunch Co",
  colors: ["#1a1a1a", "#fff7ed", "#f97316", "#fdba74"],
  fonts: ["Playfair Display", "Inter"],
  voice: "warm, playful",
};
const plan: Plan = {
  layout: "centered",
  headline: "Brunch is back, and it brought pancakes",
  supporting: "Our Sunday brunch launches this weekend. Bottomless coffee, 10am till 3pm.",
  colors: { background: "#fff7ed", text: "#1a1a1a", accent: "#f97316" },
  fontRoles: { headline: "Playfair Display", body: "Inter" },
};

await mkdir(".cache/preview", { recursive: true });
for (const layout of LAYOUTS) {
  for (const sizeId of Object.keys(SIZES) as SizeId[]) {
    const { png, fit, inspection } = await renderDesign({ ...plan, layout }, brand, sizeId, collectFacts);
    const file = `.cache/preview/${layout}-${sizeId}.png`;
    await writeFile(file, png);
    console.log(file, fit.map((f) => `${f.role}:${f.fontSize}px`).join(" "));
    for (const r of checkFacts(inspection, brand, fit)) console.log(`  ${r.pass ? "PASS" : "FAIL"} ${r.rule}: ${r.details.join("; ")}`);
  }
}
await closeBrowser();
