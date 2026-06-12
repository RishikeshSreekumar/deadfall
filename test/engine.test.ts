import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { analyzeIR, extract, analyze } from "../src/engine.js";
import type { GraphIR } from "../src/ir/model.js";
import type { ReportModel } from "../src/report/model.js";
import { irNode, edge, id } from "./helpers.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const edgeFixture = path.join(here, "fixtures", "edge");

function buildIR(): GraphIR {
  return {
    schemaVersion: 1,
    projectRoot: "/virtual",
    framework: "test",
    nodes: [
      irNode("Page", { origin: "prod" }),
      irNode("Sidebar", { origin: "prod" }),
      // Non-component glue (a config object). Must not surface as a component.
      irNode("navConfig", { kind: "module", origin: "prod" }),
      irNode("Icon", { origin: "prod" }),
      irNode("Dead", { origin: "prod" }),
    ],
    edges: [
      edge(id("Page"), id("Sidebar"), "jsx"),
      edge(id("Sidebar"), id("navConfig"), "reference"),
      edge(id("navConfig"), id("Icon"), "reference"),
    ],
    roots: { prod: [id("Page")], test: [] },
    usageSites: {
      [id("Sidebar")]: [{ file: "app/page.tsx", line: 3 }],
      [id("Icon")]: [{ file: "nav/config.tsx", line: 5 }],
    },
  };
}

function stateOf(m: ReportModel, name: string): string | undefined {
  const c = m.components.find((c) => c.name === name);
  return c ? m.usage.find((u) => u.id === c.id)?.state : undefined;
}

test("analyzeIR drops glue nodes from the reported components", () => {
  const m = analyzeIR(buildIR());
  assert.ok(m.components.find((c) => c.name === "Page"));
  assert.equal(m.components.some((c) => c.name === "navConfig"), false);
  assert.equal(m.stats.totalComponents, 4);
});

test("analyzeIR collapses glue-mediated links into direct component edges", () => {
  const m = analyzeIR(buildIR());
  // No edge should point at the glue node.
  assert.equal(m.edges.some((e) => e.to === id("navConfig")), false);
  // Sidebar -> Icon appears as a collapsed reference edge.
  const collapsed = m.edges.find(
    (e) => e.from === id("Sidebar") && e.to === id("Icon")
  );
  assert.ok(collapsed, "expected collapsed Sidebar->Icon edge");
  assert.equal(collapsed!.kind, "reference");
});

test("analyzeIR classifies reachable-through-glue as used and isolated as dead", () => {
  const m = analyzeIR(buildIR());
  assert.equal(stateOf(m, "Page"), "used");
  assert.equal(stateOf(m, "Sidebar"), "used");
  assert.equal(stateOf(m, "Icon"), "used"); // reached via collapsed edge
  assert.equal(stateOf(m, "Dead"), "dead");
  assert.equal(m.stats.dead, 1);
});

test("analyzeIR carries through the generated report scaffolding", () => {
  const m = analyzeIR(buildIR());
  assert.equal(m.projectRoot, "/virtual");
  assert.ok(m.generatedAt);
  assert.ok(m.layouts);
  assert.ok(m.positions);
  assert.ok(m.structure);
});

// ---- end-to-end extraction over a real fixture project ----

test("extract emits a valid GraphIR with components and roots", async () => {
  const ir = await extract(edgeFixture);
  assert.equal(ir.schemaVersion, 1);
  assert.equal(ir.framework, "next-app");
  assert.ok(ir.nodes.length > 0);
  assert.ok(ir.roots.prod.length > 0);
});

test("memo-wrapped declaration is detected as a component", async () => {
  const m = await analyze(edgeFixture);
  assert.equal(stateOf(m, "Memoized"), "used");
  // memo(Base) creates a reference edge → Base is reachable.
  assert.equal(stateOf(m, "Base"), "used");
});

test("anonymous default-export arrow gets a file-derived name", async () => {
  const m = await analyze(edgeFixture);
  // defaultNameFromFile derives "Arrow" from components/Arrow.tsx even though
  // the export is anonymous, so the component is still detected and reported.
  assert.ok(m.components.find((c) => c.name === "Arrow"));
});

test("JSX usage of an anonymous default export is currently unresolved", async () => {
  const m = await analyze(edgeFixture);
  // Known limitation: a `<Arrow/>` tag cannot be linked back to an anonymous
  // `export default () => ...`, so no edge forms and the node reads as dead.
  // Pinning this documents the behavior; flipping to "used" means it was fixed.
  assert.equal(stateOf(m, "Arrow"), "dead");
});

test(".jsx files are scanned for components", async () => {
  const m = await analyze(edgeFixture);
  assert.equal(stateOf(m, "Widget"), "used");
});

test("entry file with no default export seeds all its components as roots", async () => {
  const m = await analyze(edgeFixture);
  // pages/multi.tsx exports First and Second, no default → both are roots.
  assert.equal(stateOf(m, "First"), "used");
  assert.equal(stateOf(m, "Second"), "used");
});
