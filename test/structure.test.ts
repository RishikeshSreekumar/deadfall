import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";
import { analyze } from "../src/engine.js";
import { computeLayouts } from "../src/report/layouts.js";
import type { ComponentMetrics, ReportModel } from "../src/report/model.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, "fixtures", "structure");

let model: ReportModel;
async function getModel(): Promise<ReportModel> {
  model ??= await analyze(fixture);
  return model;
}

function idOf(m: ReportModel, name: string): string {
  const c = m.components.find((c) => c.name === name);
  assert.ok(c, `missing component ${name}`);
  return c!.id;
}
function metricOf(m: ReportModel, name: string): ComponentMetrics {
  const id = idOf(m, name);
  const met = m.structure.metrics.find((x) => x.id === id);
  assert.ok(met, `missing metrics for ${name}`);
  return met!;
}

test("fan-in / fan-out reflect the edge set", async () => {
  const m = await getModel();
  const shared = metricOf(m, "Shared");
  assert.equal(shared.fanIn, 2); // PanelOne + PanelTwo
  assert.equal(shared.fanOut, 0); // renders nothing
});

test("Shared is classified as a leaf", async () => {
  const m = await getModel();
  assert.equal(metricOf(m, "Shared").role, "leaf");
});

test("Alpha <-> Beta detected as a dependency cycle", async () => {
  const m = await getModel();
  const alpha = idOf(m, "Alpha");
  const beta = idOf(m, "Beta");
  const cyc = m.structure.cycles.find(
    (c) => c.includes(alpha) && c.includes(beta)
  );
  assert.ok(cyc, "Alpha/Beta cycle not found");
  // Cycle members share an scc id.
  assert.equal(metricOf(m, "Alpha").sccId, metricOf(m, "Beta").sccId);
});

test("misplaced component yields a move hint", async () => {
  const m = await getModel();
  const shared = idOf(m, "Shared");
  const move = m.structure.suggestedMoves.find((mv) => mv.id === shared);
  assert.ok(move, "expected a move hint for Shared");
  assert.equal(move!.fromDir, "feature-a");
  assert.equal(move!.toDir, "feature-b");
  assert.equal(move!.dependents, 2);
  assert.equal(move!.share, 1);
});

test("cross-directory edges are counted", async () => {
  const m = await getModel();
  assert.ok(m.structure.crossDirEdges >= 1);
});

test("clusters and layouts are deterministic", async () => {
  const m = await getModel();
  // Re-analyze and compare structure + layouts byte-for-byte.
  const m2 = await analyze(fixture);
  assert.equal(
    JSON.stringify(m.structure),
    JSON.stringify(m2.structure),
    "structure not deterministic"
  );
  const l1 = computeLayouts(m.components, m.usage, m.edges, m.structure);
  const l2 = computeLayouts(m.components, m.usage, m.edges, m.structure);
  assert.equal(JSON.stringify(l1), JSON.stringify(l2), "layouts not deterministic");
});

test("all three layouts cover every component", async () => {
  const m = await getModel();
  assert.ok(m.layouts);
  for (const mode of ["directory", "layers", "clusters"] as const) {
    const pos = m.layouts![mode];
    for (const c of m.components) {
      assert.ok(pos[c.id], `missing ${mode} position for ${c.name}`);
    }
  }
});
