import { mkdir, readFile, writeFile } from "node:fs/promises";

const DIR = ".cache/fonts";
// Google serves woff2 + unicode-range subsets only to modern browsers.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function fetchGoogleCss(family: string): Promise<string> {
  const fam = family.trim().replace(/ /g, "+");
  // Not every family has every weight; Google 400s on a missing one, so step down.
  for (const q of [`${fam}:wght@400;600;700`, `${fam}:wght@400;700`, fam]) {
    const res = await fetch(`https://fonts.googleapis.com/css2?family=${q}&display=block`, { headers: { "user-agent": UA } });
    if (res.ok) return res.text();
  }
  throw new Error(`"${family}" was not found on Google Fonts. Check the spelling, e.g. "Playfair Display".`);
}

/** Keep Latin subsets only; falls back to everything if Google didn't label them. */
function latinOnly(css: string): string {
  const blocks = css.split(/(?=\/\* [a-z-]+ \*\/)/);
  const latin = blocks.filter((b) => /^\/\* latin(-ext)? \*\//.test(b));
  return latin.length ? latin.join("") : css;
}

/**
 * @font-face rules for a Google Font with the font files inlined as data URIs,
 * cached on disk. Renders work offline after the first fetch.
 */
export async function fontFaceCss(family: string): Promise<string> {
  const file = `${DIR}/${family.replace(/ /g, "_")}.css`;
  try {
    return await readFile(file, "utf8");
  } catch {}

  let css = latinOnly(await fetchGoogleCss(family));
  const urls = [...new Set(css.match(/https:\/\/fonts\.gstatic\.com\/[^)\s]+/g) ?? [])];
  for (const url of urls) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download font file for "${family}" (${res.status}).`);
    const b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
    css = css.replaceAll(url, `data:font/woff2;base64,${b64}`);
  }
  await mkdir(DIR, { recursive: true });
  await writeFile(file, css);
  return css;
}
