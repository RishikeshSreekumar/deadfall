import assert from "node:assert/strict";
import { test } from "node:test";
import { cascade, cascadeSizes } from "../src/report/client/graph/cascade.js";
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

const all = () => true;

test("chain collapses entirely", () => {
  // A→B→C, nothing else references B or C: deleting A frees both.
  const g = adj({ A: ["B"], B: ["C"] });
  assert.deepEqual(cascade(g, "A", all).sort(), ["B", "C"]);
});

test("shared dependency stays", () => {
  // A→B, X→B: B has a dependent outside the cascade.
  const g = adj({ A: ["B"], X: ["B"] });
  assert.deepEqual(cascade(g, "A", all), []);
});

test("diamond joins once both parents are in", () => {
  // A→B, A→C, B→D, C→D: D joins because B and C both join.
  const g = adj({ A: ["B", "C"], B: ["D"], C: ["D"] });
  assert.deepEqual(cascade(g, "A", all).sort(), ["B", "C", "D"]);
});

test("non-deletable members block themselves and their subtree", () => {
  // A→B→C but B is used (not deletable): neither B nor C joins via B.
  const g = adj({ A: ["B"], B: ["C"] });
  assert.deepEqual(cascade(g, "A", (id) => id !== "B"), []);
});

test("cycle among dependencies is consumed", () => {
  // A→B, B→C, C→B: B and C only reference each other plus A's entry.
  const g = adj({ A: ["B"], B: ["C"], C: ["B"] });
  assert.deepEqual(cascade(g, "A", all).sort(), ["B", "C"]);
});

test("seed is excluded from its own cascade", () => {
  const g = adj({ A: ["B"] });
  assert.ok(!cascade(g, "A", all).includes("A"));
});

test("cascadeSizes ranks seeds", () => {
  const g = adj({ A: ["B"], B: ["C"], X: [] });
  const sizes = cascadeSizes(g, ["A", "X"], all);
  assert.equal(sizes.get("A"), 2);
  assert.equal(sizes.get("X"), 0);
});
