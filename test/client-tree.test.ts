import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTree, treeFilterMatch } from "../src/report/client/graph/tree.js";
import type { ReportModel, ComponentNode, ComponentUsage } from "../src/report/model.js";

function comp(file: string, name: string): ComponentNode {
  return { id: file + "#" + name, name, file, kind: "prod", symbolKind: "component", isDefaultExport: false, line: 1 };
}

const components = [comp("a/Foo.tsx", "Foo"), comp("a/b/Bar.tsx", "Bar"), comp("a/Dead.tsx", "Dead")];
const model = { components } as unknown as ReportModel;
const usageById = new Map<string, ComponentUsage>([
  ["a/Foo.tsx#Foo", { id: "a/Foo.tsx#Foo", prodCount: 1, testCount: 0, state: "used", sites: [] }],
  ["a/b/Bar.tsx#Bar", { id: "a/b/Bar.tsx#Bar", prodCount: 1, testCount: 0, state: "used", sites: [] }],
  ["a/Dead.tsx#Dead", { id: "a/Dead.tsx#Dead", prodCount: 0, testCount: 0, state: "dead", sites: [] }],
]);

test("buildTree nests by directory then file and aggregates counts", () => {
  const root = buildTree(model, usageById);
  const a = root.dirs.get("a")!;
  assert.equal(a.total, 3); // Foo, Dead, and nested Bar
  assert.equal(a.dead, 1); // only Dead
  // Symbols live under a file node, not directly under the directory.
  const foo = a.dirs.get("Foo.tsx")!;
  assert.equal(foo.isFile, true);
  assert.equal(foo.comps[0].name, "Foo");
  const b = a.dirs.get("b")!;
  assert.equal(b.total, 1);
  assert.equal(b.dead, 0);
  const bar = b.dirs.get("Bar.tsx")!;
  assert.equal(bar.isFile, true);
  assert.equal(bar.comps[0].name, "Bar");
});

test("buildTree carries leaf state through the file level", () => {
  const root = buildTree(model, usageById);
  const dead = root.dirs.get("a")!.dirs.get("Dead.tsx")!.comps.find((c) => c.name === "Dead")!;
  assert.equal(dead.state, "dead");
});

test("treeFilterMatch: dead includes dead-in-prod", () => {
  assert.equal(treeFilterMatch("dead", "dead"), true);
  assert.equal(treeFilterMatch("dead-in-prod", "dead"), true);
  assert.equal(treeFilterMatch("used", "dead"), false);
});

test("treeFilterMatch: dead-in-prod is exact, all passes everything", () => {
  assert.equal(treeFilterMatch("dead-in-prod", "dead-in-prod"), true);
  assert.equal(treeFilterMatch("dead", "dead-in-prod"), false);
  assert.equal(treeFilterMatch("used", "all"), true);
  assert.equal(treeFilterMatch(undefined, "all"), true);
});
