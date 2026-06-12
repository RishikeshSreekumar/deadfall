import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { analyze } from "../src/engine.js";
import { toStructureMarkdown } from "../src/report/structure-report.js";
import type { ReportModel } from "../src/report/model.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const structureFixture = path.join(here, "fixtures", "structure");

test("markdown report has the headline sections", async () => {
  const md = toStructureMarkdown(await analyze(structureFixture));
  for (const heading of [
    "# Component structure report",
    "## Overview",
    "## Hubs (most depended-on)",
    "## Dependency cycles",
    "## Suggested moves",
    "## Cohesion clusters",
  ]) {
    assert.ok(md.includes(heading), `missing section: ${heading}`);
  }
});

test("markdown overview reports the component count", async () => {
  const m = await analyze(structureFixture);
  const md = toStructureMarkdown(m);
  assert.ok(md.includes(`| components | ${m.stats.totalComponents} |`));
  assert.ok(md.includes(`| dependency cycles | ${m.structure.cycles.length} |`));
});

test("markdown lists the Alpha/Beta cycle and the Shared move", async () => {
  const md = toStructureMarkdown(await analyze(structureFixture));
  assert.match(md, /Alpha.*Beta|Beta.*Alpha/);
  assert.ok(md.includes("Shared"));
  assert.ok(md.includes("feature-a"));
  assert.ok(md.includes("feature-b"));
});

test("empty model renders the 'None' placeholders", () => {
  const empty: ReportModel = {
    projectRoot: "/x",
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
  };
  const md = toStructureMarkdown(empty);
  assert.ok(md.includes("no component crosses the hub threshold"));
  assert.ok(md.includes("the component graph is acyclic"));
  assert.ok(md.includes("components sit with their dependents"));
  assert.ok(md.includes("No multi-member clusters found"));
});
