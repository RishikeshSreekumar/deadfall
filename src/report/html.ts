import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { ReportModel } from "./model.js";

const require = createRequire(import.meta.url);

/** Read the bundled cytoscape build so it can be inlined (no CDN, works offline). */
function cytoscapeSource(): string {
  // The package's `exports` map blocks deep imports, so resolve the main entry
  // (dist/cytoscape.cjs.js) and read the minified build sitting beside it.
  const main = require.resolve("cytoscape");
  const file = path.join(path.dirname(main), "cytoscape.min.js");
  return readFileSync(file, "utf8");
}

/**
 * Read the bundled browser client so it can be inlined. The client lives in
 * `src/report/client` and is bundled by `scripts/build-client.mjs` (esbuild)
 * into `dist/report/client.bundle.js`. Resolved relative to the package root so
 * it works both from the built CLI (dist/report/html.js) and from tests run via
 * tsx (src/report/html.ts) — both find the same bundle under dist/report.
 */
function clientBundleSource(): string {
  const dir = path.dirname(fileURLToPath(import.meta.url)); // src/report or dist/report
  const root = path.resolve(dir, "..", "..");
  const file = path.join(root, "dist", "report", "client.bundle.js");
  return readFileSync(file, "utf8");
}

/**
 * Read a static report asset (template.html / styles.css) that lives beside this
 * module. The source copies in `src/report` (used by tests via tsx) and the
 * built copies in `dist/report` (copied by scripts/build-client.mjs) are both
 * adjacent to the html module, so resolving relative to its own dir works for
 * both.
 */
function readAsset(name: string): string {
  const dir = path.dirname(fileURLToPath(import.meta.url)); // src/report or dist/report
  return readFileSync(path.join(dir, name), "utf8");
}

/** Make a string safe to embed inside a <script> element. */
function scriptSafe(s: string): string {
  return s.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
}

/**
 * Render the report as a single self-contained HTML file: the ReportModel and
 * the cytoscape library are both inlined, so there is no server, build step, or
 * network dependency — open the file directly in a browser.
 *
 * The graph uses precomputed positions (`model.layouts`) via cytoscape's
 * `preset` layout so it opens instantly with no in-browser physics. The UI is
 * task-shaped: a Triage panel (dead code ranked by deletion payoff, cycles,
 * hubs, move hints) lands first; named view presets (Triage / Architecture /
 * Hotspots / Modules) bundle layout + colour + size encodings, with the raw
 * knobs under an advanced disclosure; large graphs open as per-directory
 * bubbles (semantic zoom) that expand on click; the inspector shows each dead
 * component's "deletable together" cascade and open-in-editor links.
 */
export function renderHtml(model: ReportModel): string {
  const data = scriptSafe(JSON.stringify(model));
  const cyLib = scriptSafe(cytoscapeSource());
  const clientJs = scriptSafe(clientBundleSource());
  return readAsset("template.html")
    .replace("{{STYLES}}", () => readAsset("styles.css"))
    .replace("{{CYTOSCAPE}}", () => cyLib)
    .replace("{{MODEL}}", () => data)
    .replace("{{CLIENT}}", () => clientJs);
}
