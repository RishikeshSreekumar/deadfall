import { test } from "node:test";
import assert from "node:assert/strict";
import { diffBaseline, serializeBaseline, type Baseline } from "../src/check/baseline.js";
import type { CheckIssue, CheckResult } from "../src/check/types.js";

function issue(
  name: string,
  state: CheckIssue["state"] = "dead",
  file = `src/${name}.tsx`
): CheckIssue {
  return { id: `${file}#${name}`, name, file, line: 1, state };
}

function result(issues: CheckIssue[]): CheckResult {
  return {
    projectRoot: "/proj",
    generatedAt: "2026-06-12T00:00:00.000Z",
    issues,
    summary: {
      total: 10,
      dead: issues.filter((i) => i.state === "dead").length,
      deadInProd: issues.filter((i) => i.state === "dead-in-prod").length,
      ignored: 0,
    },
  };
}

function baseline(issues: Record<string, CheckIssue["state"]>): Baseline {
  return { version: 1, generatedAt: "earlier", issues };
}

test("known issues are filtered out, new ones kept", () => {
  const a = issue("A");
  const b = issue("B");
  const diffed = diffBaseline(result([a, b]), baseline({ [a.id]: "dead" }));
  assert.deepEqual(diffed.issues.map((i) => i.name), ["B"]);
  assert.equal(diffed.summary.baselined, 1);
});

test("escalation dead-in-prod -> dead counts as new", () => {
  const a = issue("A", "dead");
  const diffed = diffBaseline(result([a]), baseline({ [a.id]: "dead-in-prod" }));
  assert.equal(diffed.issues.length, 1);
});

test("de-escalation dead -> dead-in-prod stays baselined", () => {
  const a = issue("A", "dead-in-prod");
  const diffed = diffBaseline(result([a]), baseline({ [a.id]: "dead" }));
  assert.equal(diffed.issues.length, 0);
  assert.equal(diffed.summary.baselined, 1);
});

test("issues fixed since the baseline simply disappear", () => {
  const diffed = diffBaseline(
    result([]),
    baseline({ "src/Gone.tsx#Gone": "dead" })
  );
  assert.equal(diffed.issues.length, 0);
  assert.equal(diffed.summary.baselined, 0);
});

test("serializeBaseline sorts ids for stable diffs and round-trips", () => {
  const text = serializeBaseline(result([issue("Zed"), issue("Alpha")]));
  const keys = Object.keys((JSON.parse(text) as Baseline).issues);
  assert.deepEqual(keys, ["src/Alpha.tsx#Alpha", "src/Zed.tsx#Zed"]);
  assert.ok(text.indexOf("Alpha") < text.indexOf("Zed"));
  assert.equal((JSON.parse(text) as Baseline).version, 1);
});
