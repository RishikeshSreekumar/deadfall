import assert from "node:assert/strict";
import { test } from "node:test";
import { ego, edgeKey } from "../src/report/client/graph/ego.js";
import type { Adjacency } from "../src/report/client/model-index.js";

/** Build an Adjacency from an out-edge map (in-edges derived). */
function adj(out: Record<string, string[]>): Adjacency {
  const outAdj = new Map<string, Set<string>>();
  const inAdj = new Map<string, Set<string>>();
  for (const [from, tos] of Object.entries(out)) {
    for (const to of tos) {
      (outAdj.get(from) ?? outAdj.set(from, new Set()).get(from)!).add(to);
      (inAdj.get(to) ?? inAdj.set(to, new Set()).get(to)!).add(from);
    }
  }
  return { outAdj, inAdj };
}

const g = adj({ A: ["B", "D"], B: ["C"] }); // A→B→C, A→D

test("dependencies follows out-edges only", () => {
  const r = ego(g, "A", 1, "dependencies");
  assert.deepEqual([...r.nodes].sort(), ["A", "B", "D"]);
  assert.ok(r.edgeKeys.has(edgeKey("A", "B")));
  assert.ok(r.edgeKeys.has(edgeKey("A", "D")));
  assert.ok(!r.edgeKeys.has(edgeKey("B", "C")));
});

test("depth expands transitively", () => {
  const r = ego(g, "A", 2, "dependencies");
  assert.deepEqual([...r.nodes].sort(), ["A", "B", "C", "D"]);
  assert.ok(r.edgeKeys.has(edgeKey("B", "C")));
});

test("dependents follows in-edges only", () => {
  const r = ego(g, "C", 1, "dependents");
  assert.deepEqual([...r.nodes].sort(), ["B", "C"]);
  assert.ok(r.edgeKeys.has(edgeKey("B", "C")));
});

test("both is the undirected neighbourhood", () => {
  const r = ego(g, "B", 1, "both");
  assert.deepEqual([...r.nodes].sort(), ["A", "B", "C"]);
});

test("cycles terminate and include the back-edge", () => {
  const c = adj({ A: ["B"], B: ["A"] }); // A↔B
  const r = ego(c, "A", 5, "both");
  assert.deepEqual([...r.nodes].sort(), ["A", "B"]);
  assert.ok(r.edgeKeys.has(edgeKey("A", "B")));
  assert.ok(r.edgeKeys.has(edgeKey("B", "A")));
});

test("isolated node returns only itself", () => {
  const r = ego(g, "Z", 3, "both");
  assert.deepEqual([...r.nodes], ["Z"]);
  assert.equal(r.edgeKeys.size, 0);
});
