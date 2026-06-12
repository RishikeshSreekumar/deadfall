import assert from "node:assert/strict";
import { test } from "node:test";
import {
  stateColor,
  clusterColor,
  nodeColor,
  nodeSize,
  legendHtml,
  COLOR_ENCODINGS,
  SIZE_ENCODINGS,
} from "../src/report/client/encodings.js";
import { STATE_COLORS, ROLE_COLORS, DEFAULT_NODE_COLOR, NODE_SIZE_BASE } from "../src/report/client/constants.js";
import type { ComponentUsage, ComponentMetrics } from "../src/report/model.js";

const usage = (over: Partial<ComponentUsage>): ComponentUsage => ({
  id: "x",
  prodCount: 0,
  testCount: 0,
  state: "used",
  sites: [],
  ...over,
});
const metric = (over: Partial<ComponentMetrics>): ComponentMetrics => ({
  id: "x",
  fanIn: 0,
  fanOut: 0,
  role: "leaf",
  clusterId: "c",
  layer: 0,
  sccId: "s",
  ...over,
});

test("stateColor maps known states and falls back", () => {
  assert.equal(stateColor("dead"), STATE_COLORS.dead);
  assert.equal(stateColor("dead-in-prod"), STATE_COLORS["dead-in-prod"]);
  assert.equal(stateColor(undefined), DEFAULT_NODE_COLOR);
});

test("clusterColor is deterministic and stable per id", () => {
  assert.equal(clusterColor("module/a"), clusterColor("module/a"));
  assert.match(clusterColor("module/a"), /^hsl\(\d+,55%,60%\)$/);
});

test("nodeColor honours the active mode", () => {
  assert.equal(nodeColor("state", "id", usage({ state: "dead" }), undefined), STATE_COLORS.dead);
  assert.equal(nodeColor("role", "id", undefined, metric({ role: "hub" })), ROLE_COLORS.hub);
  assert.equal(nodeColor("cluster", "id", undefined, metric({ clusterId: "k" })), clusterColor("k"));
  // cluster mode falls back to the component id when no clusterId
  assert.equal(nodeColor("cluster", "id", undefined, undefined), clusterColor("id"));
});

test("nodeSize scales the chosen metric, capped", () => {
  assert.equal(nodeSize("usage", usage({ prodCount: 0 }), undefined), NODE_SIZE_BASE);
  assert.equal(nodeSize("usage", usage({ prodCount: 2 }), undefined), NODE_SIZE_BASE + 8);
  assert.equal(nodeSize("usage", usage({ prodCount: 100 }), undefined), NODE_SIZE_BASE + 40); // capped
  assert.equal(nodeSize("fanIn", undefined, metric({ fanIn: 3 })), NODE_SIZE_BASE + 12);
  assert.equal(nodeSize("fanOut", undefined, metric({ fanOut: 1 })), NODE_SIZE_BASE + 4);
});

test("registries expose every selectable mode", () => {
  assert.deepEqual(COLOR_ENCODINGS.map((e) => e.id), ["state", "role", "cluster"]);
  assert.deepEqual(SIZE_ENCODINGS.map((e) => e.id), ["usage", "fanIn", "fanOut"]);
});

test("legendHtml varies by colour mode", () => {
  assert.match(legendHtml("state"), /dead-in-prod/);
  assert.match(legendHtml("role"), /orphan/);
  assert.match(legendHtml("cluster"), /cohesion cluster/);
});
