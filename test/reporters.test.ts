import { test } from "node:test";
import assert from "node:assert/strict";
import { reporters, selectReporter } from "../src/check/reporters/index.js";
import { noColors } from "../src/check/colors.js";
import type { CheckResult, ReporterContext } from "../src/check/types.js";

const ctx: ReporterContext = { colors: noColors, cwd: "/tmp" };

const result: CheckResult = {
  projectRoot: "/proj",
  generatedAt: "2026-06-12T00:00:00.000Z",
  issues: [
    {
      id: "components/Unused.tsx#Unused",
      name: "Unused",
      file: "components/Unused.tsx",
      line: 4,
      state: "dead",
    },
    {
      id: "components/OnlyTested.tsx#OnlyTested",
      name: "OnlyTested",
      file: "components/OnlyTested.tsx",
      line: 2,
      state: "dead-in-prod",
    },
  ],
  summary: { total: 10, dead: 1, deadInProd: 1, ignored: 2 },
};

const clean: CheckResult = {
  ...result,
  issues: [],
  summary: { total: 10, dead: 0, deadInProd: 0, ignored: 0 },
};

test("compact: groups by state with file:line lines and summary", () => {
  const out = reporters.compact(result, ctx);
  assert.match(out, /dead \(1\)\n  components\/Unused\.tsx:4 Unused/);
  assert.match(out, /dead-in-prod \(1\)\n  components\/OnlyTested\.tsx:2 OnlyTested/);
  assert.match(out, /10 components, 1 dead, 1 dead-in-prod, 2 ignored/);
});

test("compact: clean run prints a success line", () => {
  const out = reporters.compact(clean, ctx);
  assert.match(out, /no dead components/);
});

test("json: parses and contains both issue groups", () => {
  const out = reporters.json(result, ctx);
  const parsed = JSON.parse(out);
  assert.equal(parsed.dead.length, 1);
  assert.equal(parsed.dead[0].name, "Unused");
  assert.equal(parsed.deadInProd.length, 1);
  assert.equal(parsed.counts.total, 10);
});

test("markdown: emits a table row per issue", () => {
  const out = reporters.markdown(result, ctx);
  assert.match(out, /\| Component \| File \| State \|/);
  assert.match(out, /\| `Unused` \| `components\/Unused\.tsx:4` \| dead \|/);
});

test("markdown: clean run says so without a table", () => {
  const out = reporters.markdown(clean, ctx);
  assert.match(out, /No dead components found/);
  assert.doesNotMatch(out, /\| Component/);
});

test("github: one ::warning annotation per issue", () => {
  const out = reporters.github(result, ctx);
  const lines = out.trim().split("\n");
  assert.equal(lines.length, 2);
  assert.match(
    lines[0],
    /^::warning file=components\/Unused\.tsx,line=4,title=deadfall::Dead component Unused$/
  );
});

test("github: clean run emits nothing", () => {
  assert.equal(reporters.github(clean, ctx), "");
});

test("selectReporter rejects unknown names", () => {
  assert.throws(() => selectReporter("nope"), /Unknown reporter "nope"/);
});
