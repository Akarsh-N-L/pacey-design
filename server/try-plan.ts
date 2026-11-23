// Manual check against a live Ollama: npm run plan -- "Instagram post for our Sunday brunch launch"
import { generatePlan, MODEL } from "./model";
import type { Brand } from "./schema";

const brand: Brand = {
  name: "Sunday Brunch Co",
  colors: ["#1a1a1a", "#fff7ed", "#f97316", "#fdba74"],
  fonts: ["Playfair Display", "Inter"],
  voice: "warm, playful, a little cheeky",
};
const request = process.argv.slice(2).join(" ") || "Instagram post for our Sunday brunch launch";

console.log(`model: ${MODEL}\nrequest: ${request}\n`);
const t = Date.now();
const r = await generatePlan(brand, request);
for (const [i, a] of r.attempts.entries()) console.log(`attempt ${i + 1} rejected (${a.kind}):\n  ${a.reasons.join("\n  ")}\n`);
console.log(r.ok ? JSON.stringify(r.plan, null, 2) : "FAILED: no valid plan");
console.log(`\n${((Date.now() - t) / 1000).toFixed(1)}s`);
