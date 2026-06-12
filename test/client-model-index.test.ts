import assert from "node:assert/strict";
import { test } from "node:test";
import { byKey, buildAdjacency } from "../src/report/client/model-index.js";
import type { ReportModel, ComponentEdge } from "../src/report/model.js";

test("byKey indexes items by id", () => {
  const m = byKey([{ id: "a", v: 1 }, { id: "b", v: 2 }]);
  assert.equal(m.get("a")?.v, 1);
  assert.equal(m.get("b")?.v, 2);
  assert.equal(m.size, 2);
});

function model(edges: ComponentEdge[]): ReportModel {
  return { edges } as unknown as ReportModel;
}

test("buildAdjacency builds directed maps", () => {
  const compIds = new Set(["A", "B", "C"]);
  const { outAdj, inAdj } = buildAdjacency(
    model([
      { from: "A", to: "B", kind: "jsx" },
      { from: "A", to: "C", kind: "jsx" },
      { from: "B", to: "C", kind: "jsx" },
    ]),
    compIds
  );
  assert.deepEqual([...outAdj.get("A")!].sort(), ["B", "C"]);
  assert.deepEqual([...inAdj.get("C")!].sort(), ["A", "B"]);
  assert.equal(outAdj.has("C"), false); // C has no out-edges
});

test("buildAdjacency drops self-loops and edges to unknown components", () => {
  const compIds = new Set(["A", "B"]);
  const { outAdj } = buildAdjacency(
    model([
      { from: "A", to: "A", kind: "jsx" }, // self-loop dropped
      { from: "A", to: "Z", kind: "jsx" }, // unknown target dropped
      { from: "A", to: "B", kind: "jsx" }, // kept
    ]),
    compIds
  );
  assert.deepEqual([...outAdj.get("A")!], ["B"]);
});
