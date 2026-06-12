import assert from "node:assert/strict";
import { test } from "node:test";
import { computeLayout, shelfPack, type PackGroup } from "../src/report/layout.js";
import { computeLayouts } from "../src/report/layouts.js";
import { computeStructure } from "../src/analyze/structure.js";
import type { ComponentUsage } from "../src/report/model.js";
import { compNode, edge, id } from "./helpers.js";

function usageFor(ids: string[], prod: Record<string, number> = {}): ComponentUsage[] {
  return ids.map((cid) => ({
    id: cid,
    prodCount: prod[cid] ?? 0,
    testCount: 0,
    state: "used" as const,
    sites: [],
  }));
}

test("shelfPack on no groups returns empty positions", () => {
  assert.deepEqual(shelfPack([]), {});
});

test("shelfPack skips empty groups but positions every member", () => {
  const groups: PackGroup[] = [
    { key: "empty", members: [] },
    { key: "g", members: ["a", "b", "c", "d"] },
  ];
  const pos = shelfPack(groups);
  for (const m of ["a", "b", "c", "d"]) {
    assert.ok(pos[m], `missing ${m}`);
    assert.equal(typeof pos[m].x, "number");
    assert.equal(typeof pos[m].y, "number");
  }
});

test("shelfPack is deterministic", () => {
  const groups: PackGroup[] = [
    { key: "x", members: ["a", "b"] },
    { key: "y", members: ["c", "d", "e"] },
  ];
  assert.equal(JSON.stringify(shelfPack(groups)), JSON.stringify(shelfPack(groups)));
});

test("computeLayout positions every component, grouped by directory", () => {
  const comps = [
    compNode("A", "feature-a/A.tsx"),
    compNode("B", "feature-a/B.tsx"),
    compNode("C", "feature-b/C.tsx"),
  ];
  const ids = comps.map((c) => c.id);
  const pos = computeLayout(comps, usageFor(ids));
  for (const c of comps) assert.ok(pos[c.id], `missing ${c.name}`);
});

test("computeLayout orders most-used components first within a directory", () => {
  const comps = [compNode("Low", "d/Low.tsx"), compNode("High", "d/High.tsx")];
  const ids = comps.map((c) => c.id);
  const pos = computeLayout(comps, usageFor(ids, { [id("High", "d/High.tsx")]: 10 }));
  // Higher usage sorts first → smaller grid index → its x is <= the other's.
  assert.ok(
    pos[id("High", "d/High.tsx")].x <= pos[id("Low", "d/Low.tsx")].x
  );
});

test("computeLayouts provides all three modes and covers every node", () => {
  const comps = [compNode("Root"), compNode("Mid"), compNode("Leaf")];
  const edges = [edge(id("Root"), id("Mid")), edge(id("Mid"), id("Leaf"))];
  const ids = comps.map((c) => c.id);
  const usage = usageFor(ids);
  const structure = computeStructure(comps, edges, new Set([id("Root")]));
  const layouts = computeLayouts(comps, usage, edges, structure);
  for (const mode of ["directory", "layers", "clusters"] as const) {
    const pos = layouts[mode];
    for (const c of comps) assert.ok(pos[c.id], `missing ${mode} pos for ${c.name}`);
  }
});

test("layer layout stacks deeper layers lower on the canvas", () => {
  const comps = [compNode("L0"), compNode("L1"), compNode("L2")];
  const edges = [edge(id("L0"), id("L1")), edge(id("L1"), id("L2"))];
  const usage = usageFor(comps.map((c) => c.id));
  const structure = computeStructure(comps, edges, new Set([id("L0")]));
  const layers = computeLayouts(comps, usage, edges, structure).layers;
  assert.ok(layers[id("L0")].y < layers[id("L1")].y);
  assert.ok(layers[id("L1")].y < layers[id("L2")].y);
});
