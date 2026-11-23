import { useEffect, useState } from "react";
import type { Design, DesignResult } from "../server/pipeline";
import { LAYOUTS, type Brand, type LayoutId } from "../server/schema";
import type { Attempt } from "../server/model";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { "content-type": "application/json" }, ...init });
  const data = await res.json().catch(() => ({ error: res.statusText }));
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data as T;
}

const FONTS = ["Inter", "Playfair Display", "Poppins", "Montserrat", "Lora"];
const EMPTY: Brand = { name: "", colors: ["#111111", "#ffffff"], fonts: ["Inter", "Inter"], voice: "" };
const EXAMPLES = [
  "Instagram post for our Sunday brunch launch",
  "Announce our new autumn menu",
  "We're hiring a head chef",
];
// <input type="color"> only takes #rrggbb.
const sixDigit = (hex: string) => (/^#[0-9a-f]{3}$/i.test(hex) ? "#" + [...hex.slice(1)].map((c) => c + c).join("") : hex);

export function App() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brand, setBrand] = useState<Brand>(EMPTY);
  const [request, setRequest] = useState(EXAMPLES[0]);
  const [layout, setLayout] = useState<LayoutId | "">("");
  const [result, setResult] = useState<DesignResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "saving" | "generating">("");
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    api<Brand[]>("/api/brands")
      .then((list) => {
        setBrands(list);
        if (list[0]) setBrand(list[0]);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (busy !== "generating") return;
    const start = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - start) / 1000)), 500);
    return () => clearInterval(t);
  }, [busy]);

  const set = <K extends keyof Brand>(key: K, value: Brand[K]) => setBrand((b) => ({ ...b, [key]: value }));
  const setColor = (i: number, c: string) => set("colors", brand.colors.map((x, j) => (j === i ? c : x)));
  const setFont = (i: 0 | 1, f: string) => set("fonts", (i === 0 ? [f, brand.fonts[1]] : [brand.fonts[0], f]) as Brand["fonts"]);

  async function run<T>(kind: "saving" | "generating", fn: () => Promise<T>) {
    setBusy(kind);
    setError("");
    try {
      return await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const save = () =>
    run("saving", async () => setBrands(await api<Brand[]>("/api/brands", { method: "POST", body: JSON.stringify(brand) })));

  const remove = () => {
    if (!confirm(`Delete brand "${brand.name}"?`)) return;
    run("saving", async () => {
      const list = await api<Brand[]>(`/api/brands/${encodeURIComponent(brand.name)}`, { method: "DELETE" });
      setBrands(list);
      setBrand(list[0] ?? EMPTY);
    });
  };

  const generate = () =>
    run("generating", async () => {
      setResult(null);
      setResult(await api<DesignResult>("/api/generate", { method: "POST", body: JSON.stringify({ brand, request, layout: layout || undefined }) }));
    });

  const saved = brands.some((b) => b.name.toLowerCase() === brand.name.trim().toLowerCase());
  const canGenerate = !busy && brand.name && brand.fonts.every(Boolean) && brand.voice && request.trim().length >= 3;

  return (
    <div className="app">
      <aside className="panel">
        <h1>Design engine</h1>

        <section>
          <h2>Brand</h2>
          <select
            value={saved ? brand.name : ""}
            onChange={(e) => setBrand(brands.find((b) => b.name === e.target.value) ?? EMPTY)}
          >
            <option value="">New brand…</option>
            {brands.map((b) => (
              <option key={b.name}>{b.name}</option>
            ))}
          </select>

          <label>
            Name
            <input value={brand.name} maxLength={40} onChange={(e) => set("name", e.target.value)} placeholder="Sunday Brunch Co" />
          </label>

          <div className="field">
            <span>Colours (2–5)</span>
            {brand.colors.map((c, i) => (
              <div className="color-row" key={i}>
                <input type="color" value={sixDigit(c)} onChange={(e) => setColor(i, e.target.value)} />
                <input value={c} onChange={(e) => setColor(i, e.target.value)} aria-label={`Colour ${i + 1} hex`} />
                <button
                  className="ghost"
                  disabled={brand.colors.length <= 2}
                  onClick={() => set("colors", brand.colors.filter((_, j) => j !== i))}
                  aria-label={`Remove colour ${i + 1}`}
                >
                  ×
                </button>
              </div>
            ))}
            {brand.colors.length < 5 && (
              <button className="ghost" onClick={() => set("colors", [...brand.colors, "#888888"])}>
                + Add colour
              </button>
            )}
          </div>

          <label>
            Headline font
            <FontSelect value={brand.fonts[0]} onChange={(f) => setFont(0, f)} />
          </label>
          <label>
            Body font
            <FontSelect value={brand.fonts[1]} onChange={(f) => setFont(1, f)} />
          </label>
          <label>
            Voice
            <textarea rows={2} value={brand.voice} onChange={(e) => set("voice", e.target.value)} placeholder="warm, playful, a little cheeky" />
          </label>

          <div className="row">
            <button onClick={save} disabled={!!busy || !brand.name}>
              {busy === "saving" ? "Saving…" : saved ? "Update brand" : "Save brand"}
            </button>
            {saved && (
              <button className="ghost" onClick={remove} disabled={!!busy}>
                Delete
              </button>
            )}
          </div>
        </section>

        <section>
          <h2>Request</h2>
          <textarea rows={3} value={request} onChange={(e) => setRequest(e.target.value)} />
          <div className="chips">
            {EXAMPLES.map((x) => (
              <button key={x} className="chip" onClick={() => setRequest(x)}>
                {x}
              </button>
            ))}
          </div>
          <label>
            Layout
            <select value={layout} onChange={(e) => setLayout(e.target.value as LayoutId | "")}>
              <option value="">Auto (model picks)</option>
              {LAYOUTS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <button className="primary" onClick={generate} disabled={!canGenerate}>
            {busy === "generating" ? `Generating… ${elapsed}s` : "Generate"}
          </button>
        </section>

        {error && <p className="error">{error}</p>}
      </aside>

      <main>
        {busy === "generating" && <p className="muted">Planning with the local model, then rendering both sizes. This can take a minute.</p>}
        {!result && !busy && <p className="muted">Pick a brand, write a one-line request and press Generate.</p>}
        {result && <Result result={result} brandName={brand.name} />}
      </main>
    </div>
  );
}

function Result({ result, brandName }: { result: DesignResult; brandName: string }) {
  if (result.stage === "plan") {
    return (
      <div className="notice fail">
        <h2>No design: the model couldn't produce a valid plan</h2>
        <p>It was asked {result.attempts.length} times and every answer was rejected, so nothing was rendered.</p>
        <Attempts attempts={result.attempts} open />
      </div>
    );
  }
  return (
    <>
      <div className={`notice ${result.ok ? "pass" : "fail"}`}>
        <h2>{result.ok ? "Ready to post" : "Failed the brand check"}</h2>
        <p>
          Layout <b>{result.plan.layout}</b>. {result.ok ? "Both sizes passed every check." : "Failed sizes are withheld. Adjust the brand or try again."}
        </p>
        {result.attempts.length > 0 && <Attempts attempts={result.attempts} />}
      </div>
      <div className="designs">
        {result.designs.map((d) => (
          <DesignCard key={d.size} design={d} brandName={brandName} />
        ))}
      </div>
    </>
  );
}

function DesignCard({ design: d, brandName }: { design: Design; brandName: string }) {
  const src = d.png && `data:image/png;base64,${d.png}`;
  const file = `${brandName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${d.width}x${d.height}.png`;
  return (
    <figure className={`design ${d.pass ? "" : "failed"}`}>
      {src ? (
        <img src={src} alt={`${d.size} design ${d.width}×${d.height}`} style={{ aspectRatio: `${d.width} / ${d.height}` }} />
      ) : (
        // The server never sends a design that failed the brand check.
        <div className="withheld" style={{ aspectRatio: `${d.width} / ${d.height}` }}>
          <b>Design withheld</b>
          <span>It failed the brand check below, so it isn't shown.</span>
        </div>
      )}
      <figcaption>
        <div className="row spread">
          <b>
            {d.size} · {d.width}×{d.height}
          </b>
          {src ? (
            <a className="button" href={src} download={file}>
              Download PNG
            </a>
          ) : (
            <span className="badge fail">Not ready</span>
          )}
        </div>
        <ul className="checks">
          {d.checks.map((c) => (
            <li key={c.rule} className={c.pass ? "pass" : "fail"}>
              <span>{c.pass ? "✓" : "✗"}</span>
              <b>{c.rule}</b> {c.details.join("; ")}
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}

// A saved brand may use a font outside the list; keep it selectable.
function FontSelect({ value, onChange }: { value: string; onChange: (font: string) => void }) {
  const options = FONTS.includes(value) ? FONTS : [value, ...FONTS];
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((f) => (
        <option key={f} style={{ fontFamily: f }}>
          {f}
        </option>
      ))}
    </select>
  );
}

function Attempts({ attempts, open = false }: { attempts: Attempt[]; open?: boolean }) {
  return (
    <details open={open}>
      <summary>
        {attempts.length} rejected answer{attempts.length === 1 ? "" : "s"} from the model
      </summary>
      <ol>
        {attempts.map((a, i) => (
          <li key={i}>
            <b>{a.kind}</b>: {a.reasons.join(" ")}
          </li>
        ))}
      </ol>
    </details>
  );
}
