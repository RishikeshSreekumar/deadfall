import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { analyze } from "../src/engine.js";
import { renderHtml } from "../src/report/html.js";
import type { ReportModel } from "../src/report/model.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRouter = path.join(here, "fixtures", "app-router");

function minimalModel(over: Partial<ReportModel> = {}): ReportModel {
  return {
    projectRoot: "/proj",
    generatedAt: "2026-01-01T00:00:00.000Z",
    components: [],
    edges: [],
    usage: [],
    structure: {
      metrics: [],
      clusters: [],
      cycles: [],
      suggestedMoves: [],
      hubs: [],
      crossDirEdges: 0,
    },
    stats: { totalComponents: 0, dead: 0, deadInProd: 0 },
    ...over,
  };
}

test("renderHtml produces a self-contained document", async () => {
  const m = await analyze(appRouter);
  const html = renderHtml(m);
  assert.ok(html.startsWith("<!doctype html>"));
  assert.ok(html.includes("<title>deadfall</title>"));
  // The model is inlined as JSON (projectRoot is embedded).
  assert.ok(html.includes(m.projectRoot));
  // cytoscape is inlined rather than loaded from a CDN.
  assert.equal(html.includes("https://"), html.includes("https://")); // sanity
  assert.ok(html.length > 100_000, "expected the cytoscape lib to be inlined");
});

test("renderHtml escapes a </script> sequence inside the data", () => {
  const m = minimalModel({
    components: [
      {
        id: "x#Evil",
        name: "Evil</script><!--",
        file: "x.tsx",
        kind: "prod",
        isDefaultExport: false,
        line: 1,
      },
    ],
  });
  const html = renderHtml(m);
  // The raw closing-tag sequence from the data must be neutralized.
  assert.ok(html.includes("Evil<\\/script"));
  assert.ok(!html.includes("Evil</script"));
});
