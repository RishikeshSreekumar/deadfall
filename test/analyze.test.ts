import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";
import { analyze } from "../src/engine.js";
import type { ReportModel } from "../src/report/model.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, "fixtures", "app-router");

let model: ReportModel;
async function getModel(): Promise<ReportModel> {
  model ??= await analyze(fixture);
  return model;
}

let modelWithTests: ReportModel;
async function getModelWithTests(): Promise<ReportModel> {
  modelWithTests ??= await analyze(fixture, { includeTests: true });
  return modelWithTests;
}

function stateOf(m: ReportModel, name: string): string | undefined {
  const c = m.components.find((c) => c.name === name);
  if (!c) return undefined;
  return m.usage.find((u) => u.id === c.id)?.state;
}

function idOf(m: ReportModel, name: string): string | undefined {
  return m.components.find((c) => c.name === name)?.id;
}

test("detects all fixture components", async () => {
  const m = await getModel();
  for (const name of ["Home", "RootLayout", "Card", "Heavy", "Unused", "DupA", "DupB", "SimA", "SimB", "OnlyTested"]) {
    assert.ok(idOf(m, name), `missing component ${name}`);
  }
});

test("entry-file components are roots (used)", async () => {
  const m = await getModel();
  assert.equal(stateOf(m, "Home"), "used");
  assert.equal(stateOf(m, "RootLayout"), "used");
});

test("barrel re-export resolves to real usage", async () => {
  const m = await getModel();
  assert.equal(stateOf(m, "Card"), "used");
});

test("dynamic import target is reachable", async () => {
  const m = await getModel();
  assert.equal(stateOf(m, "Heavy"), "used");
});

test("truly unused component is dead", async () => {
  const m = await getModel();
  assert.equal(stateOf(m, "Unused"), "dead");
});

test("tests/stories excluded by default → test-only component is dead", async () => {
  const m = await getModel();
  assert.equal(stateOf(m, "OnlyTested"), "dead");
  // The test file itself is not scanned, so its harness component is absent.
  assert.equal(idOf(m, "OnlyTestedHarness"), undefined);
});

test("component rendered only by a dead component is dead (transitive)", async () => {
  const m = await getModel();
  assert.equal(stateOf(m, "Unused"), "dead");
  assert.equal(stateOf(m, "OrphanChild"), "dead");
});

test("component used only via a config object is detected as used", async () => {
  const m = await getModel();
  // IssuesIcon appears only inside navConfig; navConfig -> Sidebar -> Home(root).
  assert.equal(stateOf(m, "IssuesIcon"), "used");
});

test("config glue is not reported as a component", async () => {
  const m = await getModel();
  assert.equal(idOf(m, "navConfig"), undefined);
  assert.equal(idOf(m, "ghostConfig"), undefined);
});

test("config referenced only by a dead component stays dead", async () => {
  const m = await getModel();
  // GhostIcon -> ghostConfig -> Unused(dead) only.
  assert.equal(stateOf(m, "GhostIcon"), "dead");
});

test("--include-tests surfaces dead-in-prod", async () => {
  const m = await getModelWithTests();
  assert.equal(stateOf(m, "OnlyTested"), "dead-in-prod");
});

test("unused twin component is dead, used twin is used", async () => {
  const m = await getModel();
  assert.equal(stateOf(m, "DupA"), "used");
  assert.equal(stateOf(m, "DupB"), "dead");
});

test("usage counts reflect JSX sites", async () => {
  const m = await getModel();
  const card = m.usage.find((u) => u.id === idOf(m, "Card"));
  assert.equal(card?.prodCount, 1);
});
