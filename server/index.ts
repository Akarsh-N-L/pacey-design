import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { deleteBrand, listBrands, saveBrand } from "./brands";
import { fontFaceCss } from "./fonts";
import { generateDesign } from "./pipeline";
import { Brand, LAYOUTS } from "./schema";

const PORT = Number(process.env.PORT ?? 3001);
const app = express();
app.use(express.json({ limit: "100kb" }));

class BadRequest extends Error {}
function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequest(r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return r.data;
}

/** Reject a brand whose fonts aren't real Google Fonts now, not halfway through a render. */
async function checkFonts(brand: Brand) {
  try {
    await Promise.all(brand.fonts.map(fontFaceCss));
  } catch (e) {
    throw new BadRequest((e as Error).message);
  }
}

app.get("/api/brands", async (_req, res) => {
  res.json(await listBrands());
});

app.post("/api/brands", async (req, res) => {
  const brand = parse(Brand, req.body);
  await checkFonts(brand);
  res.json(await saveBrand(brand));
});

app.delete("/api/brands/:name", async (req, res) => {
  res.json(await deleteBrand(req.params.name));
});

const GenerateBody = z.object({ brand: Brand, request: z.string().trim().min(3).max(300), layout: z.enum(LAYOUTS).optional() });

app.post("/api/generate", async (req, res) => {
  const { brand, request, layout } = parse(GenerateBody, req.body);
  await checkFonts(brand);
  const started = Date.now();
  const result = await generateDesign(brand, request, undefined, layout);
  console.log(`generate "${request}" -> ${result.stage} ok=${result.ok} retries=${result.attempts.length} ${Date.now() - started}ms`);
  res.json(result);
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof BadRequest) return void res.status(400).json({ error: err.message });
  console.error(err);
  // Most likely Ollama is down or a font failed: say so rather than a bare 500.
  res.status(502).json({ error: err.message });
});

app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
