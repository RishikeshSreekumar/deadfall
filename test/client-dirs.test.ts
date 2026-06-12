import assert from "node:assert/strict";
import { test } from "node:test";
import { aggregateDirs, aggregateDirEdges } from "../src/report/client/graph/dirs.js";
import type { ComponentNode, ComponentUsage } from "../src/report/model.js";

function comp(id: string, file: string): ComponentNode {
  return {
    id,
    name: id,
    file,
    kind: "prod",
    symbolKind: "component",
    isDefaultExport: false,
    line: 1,
  };
}

function usage(id: string, state: ComponentUsage["state"]): [string, ComponentUsage] {
  return [id, { id, prodCount: 0, testCount: 0, state, sites: [] }];
}

test("aggregateDirs groups by directory with counts and centroid", () => {
  const comps = [comp("a", "src/ui/A.tsx"), comp("b", "src/ui/B.tsx"), comp("c", "src/lib/C.tsx")];
  const usageById = new Map([usage("a", "dead"), usage("b", "used"), usage("c", "dead-in-prod")]);
  const pos = { a: { x: 0, y: 0 }, b: { x: 10, y: 20 }, c: { x: 5, y: 5 } };
  const dirs = aggregateDirs(comps, usageById, pos);
  assert.deepEqual(
    dirs.map((d) => d.dir),
    ["src/lib", "src/ui"]
  );
  const ui = dirs.find((d) => d.dir === "src/ui")!;
  assert.equal(ui.count, 2);
  assert.equal(ui.dead, 1);
  assert.equal(ui.x, 5);
  assert.equal(ui.y, 10);
  const lib = dirs.find((d) => d.dir === "src/lib")!;
  assert.equal(lib.dead, 1); // dead-in-prod counts as dead
});

test("aggregateDirs tolerates missing positions", () => {
  const dirs = aggregateDirs([comp("a", "x/A.tsx")], new Map(), {});
  assert.equal(dirs[0].x, 0);
  assert.equal(dirs[0].y, 0);
});

test("aggregateDirEdges collapses cross-dir edges and drops intra-dir ones", () => {
  const fileById = new Map([
    ["a", "src/ui/A.tsx"],
    ["b", "src/ui/B.tsx"],
    ["c", "src/lib/C.tsx"],
  ]);
  const edges = [
    { from: "a", to: "b", kind: "jsx" as const }, // intra-dir → dropped
    { from: "a", to: "c", kind: "jsx" as const },
    { from: "b", to: "c", kind: "jsx" as const },
  ];
  const agg = aggregateDirEdges(edges, fileById);
  assert.equal(agg.length, 1);
  assert.deepEqual(agg[0], { from: "src/ui", to: "src/lib", n: 2 });
});

test("aggregateDirEdges skips edges with unknown endpoints", () => {
  const agg = aggregateDirEdges([{ from: "a", to: "ghost", kind: "jsx" }], new Map([["a", "x/A.tsx"]]));
  assert.equal(agg.length, 0);
});
