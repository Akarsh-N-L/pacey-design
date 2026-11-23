import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Brand } from "./schema";

const FILE = process.env.BRANDS_FILE ?? "data/brands.json";

// Shown on first run so the demo works before anyone types a brand.
const SAMPLE: Brand[] = [
  {
    name: "Sunday Brunch Co",
    colors: ["#1a1a1a", "#fff7ed", "#f97316", "#fdba74"],
    fonts: ["Playfair Display", "Inter"],
    voice: "warm, playful, a little cheeky",
  },
];

export async function listBrands(): Promise<Brand[]> {
  try {
    return Brand.array().parse(JSON.parse(await readFile(FILE, "utf8")));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return SAMPLE;
    throw e;
  }
}

// ponytail: read-modify-write on one JSON file, fine for one local user; use SQLite if it ever has concurrent writers.
async function save(brands: Brand[]) {
  await mkdir(dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(brands, null, 2));
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Brands are keyed by name (case-insensitive): saving an existing name replaces it. */
export async function saveBrand(brand: Brand): Promise<Brand[]> {
  const brands = (await listBrands()).filter((b) => !same(b.name, brand.name));
  brands.push(brand);
  await save(brands);
  return brands;
}

export async function deleteBrand(name: string): Promise<Brand[]> {
  const brands = (await listBrands()).filter((b) => !same(b.name, name));
  await save(brands);
  return brands;
}
