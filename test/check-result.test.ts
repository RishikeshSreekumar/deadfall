import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCheckResult } from "../src/check/result.js";
import type { ReportModel } from "../src/report/model.js";

function modelWith(
  entries: Array<{
    name: string;
    file: string;
    line: number;
    state: "used" | "dead" | "dead-in-prod";
  }>,
  ignored = 0
): ReportModel {
  const components = entries.map((e) => ({
    id: `${e.file}#${e.name}`,
    name: e.name,
    file: e.file,
    kind: "prod" as const,
    symbolKind: "component" as const,
    isDefaultExport: false,
    line: e.line,
  }));
  const usage = entries.map((e) => ({
    id: `${e.file}#${e.name}`,
    prodCount: 0,
    testCount: 0,
    state: e.state,
    sites: [],
  }));
  return {
    projectRoot: "/proj",
    generatedAt: "now",
    components,
    edges: [],
    usage,
    structure: {
      metrics: [],
      clusters: [],
      cycles: [],
      suggestedMoves: [],
      hubs: [],
      crossDirEdges: 0,
    },
    stats: {
      totalComponents: components.length,
      dead: entries.filter((e) => e.state === "dead").length,
      deadInProd: entries.filter((e) => e.state === "dead-in-prod").length,
      ...(ignored ? { ignored } : {}),
    },
  };
}

test("only dead and dead-in-prod become issues", () => {
  const result = buildCheckResult(
    modelWith([
      { name: "A", file: "src/A.tsx", line: 1, state: "used" },
      { name: "B", file: "src/B.tsx", line: 2, state: "dead" },
      { name: "C", file: "src/C.tsx", line: 3, state: "dead-in-prod" },
    ])
  );
  assert.deepEqual(
    result.issues.map((i) => i.name),
    ["B", "C"]
  );
});

test("issues sort by file then line", () => {
  const result = buildCheckResult(
    modelWith([
      { name: "Z", file: "src/z.tsx", line: 1, state: "dead" },
      { name: "A2", file: "src/a.tsx", line: 9, state: "dead" },
      { name: "A1", file: "src/a.tsx", line: 2, state: "dead" },
    ])
  );
  assert.deepEqual(
    result.issues.map((i) => i.name),
    ["A1", "A2", "Z"]
  );
});

test("summary mirrors model stats including ignored", () => {
  const result = buildCheckResult(
    modelWith([{ name: "B", file: "src/B.tsx", line: 2, state: "dead" }], 4)
  );
  assert.equal(result.summary.total, 1);
  assert.equal(result.summary.dead, 1);
  assert.equal(result.summary.ignored, 4);
});
