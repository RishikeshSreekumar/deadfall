import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extract, analyzeIR } from "../src/engine.js";
import { planFix } from "../src/fix/plan.js";
import { nextAppAdapter } from "../src/adapters/next-app.js";
import type { GraphIR } from "../src/ir/model.js";
import type { ReportModel } from "../src/report/model.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, "fixtures", "fixable");

let ir: GraphIR;
let model: ReportModel;

test.before(async () => {
  ir = await extract(fixture);
  model = analyzeIR(ir);
});

const isEntryFile = (f: string) => nextAppAdapter.isEntryFile(f);

test("fileImports records imports including barrel re-exports", () => {
  assert.ok(ir.fileImports);
  assert.deepEqual(ir.fileImports!["components/index.ts"], [
    "components/BarrelDead.tsx",
  ]);
  assert.ok(
    ir.fileImports!["app/page.tsx"].includes("components/Live.tsx")
  );
});

test("fully-dead unreferenced file is deletable", () => {
  const plan = planFix(ir, model, { isEntryFile });
  assert.deepEqual(plan.deletions, ["components/Orphan.tsx"]);
});

test("barrel re-exported dead file is skipped via fileImports", () => {
  const plan = planFix(ir, model, { isEntryFile });
  const skip = plan.skipped.find((s) => s.file === "components/BarrelDead.tsx");
  assert.ok(skip, "expected BarrelDead to be skipped");
  assert.match(skip.reason, /imported by components\/index\.ts/);
});

test("file with a still-used component is skipped", () => {
  const plan = planFix(ir, model, { isEntryFile });
  const skip = plan.skipped.find((s) => s.file === "components/HalfDead.tsx");
  assert.ok(skip, "expected HalfDead to be skipped");
  assert.match(skip.reason, /UsedHalf is used/);
});

test("dead-in-prod components are never deletable", async () => {
  const appRouter = path.join(here, "fixtures", "app-router");
  const routerIr = await extract(appRouter, { includeTests: true });
  const routerModel = analyzeIR(routerIr);
  const plan = planFix(routerIr, routerModel, { isEntryFile });
  const onlyTested = plan.skipped.find(
    (s) => s.file === "components/OnlyTested.tsx"
  );
  // OnlyTested is dead-in-prod (referenced by its test) — must not be deleted.
  assert.ok(
    !plan.deletions.includes("components/OnlyTested.tsx"),
    "OnlyTested must not be deletable"
  );
  assert.ok(onlyTested === undefined || /dead-in-prod|imported/.test(onlyTested.reason));
});

test("ignored components block deletion of their file", async () => {
  const ignoredFixture = path.join(here, "fixtures", "ignored");
  const igIr = await extract(ignoredFixture);
  const igModel = analyzeIR(igIr);
  const plan = planFix(igIr, igModel, { isEntryFile });
  assert.ok(!plan.deletions.includes("components/KeptFunc.tsx"));
});
