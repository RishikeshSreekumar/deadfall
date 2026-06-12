import assert from "node:assert/strict";
import { test } from "node:test";
import { buildUsage } from "../src/analyze/usage.js";
import type { DeadState, UsageSite } from "../src/report/model.js";
import { irNode, id } from "./helpers.js";

function statesMap(entries: Record<string, DeadState>): Map<string, DeadState> {
  return new Map(Object.entries(entries));
}

test("splits prod vs test/story usage sites", () => {
  const nodes = [irNode("Card")];
  const sites: Record<string, UsageSite[]> = {
    [id("Card")]: [
      { file: "app/page.tsx", line: 3 },
      { file: "components/Card.test.tsx", line: 5 },
      { file: "components/Card.stories.tsx", line: 7 },
      { file: "__tests__/smoke.tsx", line: 9 },
      { file: "components/Card.spec.ts", line: 2 },
    ],
  };
  const usage = buildUsage(nodes, sites, statesMap({ [id("Card")]: "used" }));
  const card = usage[0];
  assert.equal(card.prodCount, 1); // only app/page.tsx
  assert.equal(card.testCount, 4); // test + stories + __tests__ + spec
  assert.equal(card.sites.length, 5);
  assert.equal(card.state, "used");
});

test("component with no recorded sites gets zero counts", () => {
  const nodes = [irNode("Unused")];
  const usage = buildUsage(nodes, {}, statesMap({ [id("Unused")]: "dead" }));
  assert.equal(usage[0].prodCount, 0);
  assert.equal(usage[0].testCount, 0);
  assert.deepEqual(usage[0].sites, []);
  assert.equal(usage[0].state, "dead");
});

test("missing state defaults to dead", () => {
  const nodes = [irNode("Mystery")];
  const usage = buildUsage(nodes, {}, statesMap({}));
  assert.equal(usage[0].state, "dead");
});

test("output preserves the input component order one-to-one", () => {
  const nodes = [irNode("A"), irNode("B"), irNode("C")];
  const usage = buildUsage(
    nodes,
    {},
    statesMap({ [id("A")]: "used", [id("B")]: "dead", [id("C")]: "used" })
  );
  assert.deepEqual(
    usage.map((u) => u.id),
    [id("A"), id("B"), id("C")]
  );
});
