import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyze } from "../src/engine.js";
import { compileIgnorePatterns } from "../src/analyze/ignore-patterns.js";
import type { ReportModel } from "../src/report/model.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, "fixtures", "ignored");

let model: ReportModel;

test.before(async () => {
  model = await analyze(fixture);
});

function stateOf(name: string): string {
  const node = model.components.find((c) => c.name === name);
  assert.ok(node, `component ${name} not found`);
  const usage = model.usage.find((u) => u.id === node.id);
  assert.ok(usage, `usage for ${name} not found`);
  return usage.state;
}

function ignoredFlag(name: string): boolean {
  const node = model.components.find((c) => c.name === name);
  assert.ok(node, `component ${name} not found`);
  return Boolean(node.ignored);
}

test("// deadfall-ignore on a const keeps it alive and flags it ignored", () => {
  assert.equal(stateOf("KeptConst"), "used");
  assert.equal(ignoredFlag("KeptConst"), true);
});

test("root semantics: child rendered only by an ignored component is used", () => {
  assert.equal(stateOf("KeptChild"), "used");
  assert.equal(ignoredFlag("KeptChild"), false);
});

test("/* deadfall-ignore */ block comment on a function works", () => {
  assert.equal(stateOf("KeptFunc"), "used");
  assert.equal(ignoredFlag("KeptFunc"), true);
});

test("// deadfall-ignore on a default export works", () => {
  assert.equal(stateOf("KeptDefault"), "used");
  assert.equal(ignoredFlag("KeptDefault"), true);
});

test("component without directive stays dead", () => {
  assert.equal(stateOf("StillDead"), "dead");
  assert.equal(ignoredFlag("StillDead"), false);
});

test("stats.ignored counts directive-kept components", () => {
  assert.ok((model.stats.ignored ?? 0) >= 3);
});

test("ignoreComponents pattern keeps matching components alive", async () => {
  const patterned = await analyze(fixture, { ignoreComponents: ["*Icon"] });
  const icon = patterned.components.find((c) => c.name === "PatternIcon");
  assert.ok(icon);
  assert.equal(icon.ignored, true);
  assert.equal(
    patterned.usage.find((u) => u.id === icon.id)?.state,
    "used"
  );
});

test("ignore globs drop files from the scan entirely", async () => {
  const filtered = await analyze(fixture, {
    ignore: ["components/PatternIcon.tsx"],
  });
  assert.equal(
    filtered.components.find((c) => c.name === "PatternIcon"),
    undefined
  );
});

test("compileIgnorePatterns: name vs id matching", () => {
  const byName = compileIgnorePatterns(["*Icon", "Debug?"]);
  assert.ok(byName({ id: "x#ChevronIcon", name: "ChevronIcon" }));
  assert.ok(byName({ id: "x#DebugA", name: "DebugA" }));
  assert.ok(!byName({ id: "x#Debug", name: "Debug" }));
  assert.ok(!byName({ id: "x#Iconography", name: "Iconography" }));

  const byId = compileIgnorePatterns(["components/legacy/*#*"]);
  assert.ok(byId({ id: "components/legacy/Old.tsx#Old", name: "Old" }));
  assert.ok(!byId({ id: "components/Old.tsx#Old", name: "Old" }));
});
