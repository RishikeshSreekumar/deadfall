import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";
import { analyze } from "../src/engine.js";
import type { ReportModel, SymbolKind } from "../src/report/model.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, "fixtures", "utils");

let model: ReportModel;
async function getModel(): Promise<ReportModel> {
  model ??= await analyze(fixture);
  return model;
}

function find(m: ReportModel, name: string) {
  return m.components.find((c) => c.name === name);
}
function stateOf(m: ReportModel, name: string): string | undefined {
  const c = find(m, name);
  return c && m.usage.find((u) => u.id === c.id)?.state;
}
function kindOf(m: ReportModel, name: string): SymbolKind | undefined {
  return find(m, name)?.symbolKind;
}

test("functions and hooks appear as reported symbols", async () => {
  const m = await getModel();
  assert.equal(kindOf(m, "formatTitle"), "function");
  assert.equal(kindOf(m, "deadUtil"), "function");
  assert.equal(kindOf(m, "useGreeting"), "hook");
  assert.equal(kindOf(m, "Home"), "component");
});

test("util used by a live component is used; unreferenced util is dead", async () => {
  const m = await getModel();
  assert.equal(stateOf(m, "formatTitle"), "used");
  assert.equal(stateOf(m, "useGreeting"), "used");
  assert.equal(stateOf(m, "deadUtil"), "dead");
  // shout is only called by deadUtil (itself dead) → transitively dead.
  assert.equal(stateOf(m, "shout"), "dead");
});

test("reference sites are recorded so used functions have non-zero counts", async () => {
  const m = await getModel();
  const c = find(m, "formatTitle")!;
  const u = m.usage.find((x) => x.id === c.id)!;
  assert.ok(u.prodCount >= 1, "expected a recorded reference site");
});
