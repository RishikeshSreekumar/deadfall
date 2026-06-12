// Bundles the browser client (src/report/client) into a single self-contained
// IIFE that renderHtml inlines into the report. cytoscape stays an external
// global (it is inlined separately by renderHtml), matching the runtime where
// the cytoscape <script> tag runs before the client bundle.
import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await build({
  entryPoints: [path.join(root, "src/report/client/index.ts")],
  outfile: path.join(root, "dist/report/client.bundle.js"),
  bundle: true,
  format: "iife",
  target: "es2017",
  minify: true,
  legalComments: "none",
  // cytoscape is provided as a global by an earlier inlined <script>.
  external: ["cytoscape"],
});

// Copy the static report assets next to the built html module so the published
// CLI (dist/report/html.js) can read them via readAsset().
mkdirSync(path.join(root, "dist/report"), { recursive: true });
for (const name of ["template.html", "styles.css"]) {
  copyFileSync(path.join(root, "src/report", name), path.join(root, "dist/report", name));
}

console.error("• built dist/report/client.bundle.js (+ template.html, styles.css)");
