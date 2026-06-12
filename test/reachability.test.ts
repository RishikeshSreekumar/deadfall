import assert from "node:assert/strict";
import { test } from "node:test";
import { classify } from "../src/graph/reachability.js";
import { irNode, edge, id } from "./helpers.js";

test("linear chain from a prod root is all used", () => {
  const nodes = [irNode("A"), irNode("B"), irNode("C")];
  const edges = [edge(id("A"), id("B")), edge(id("B"), id("C"))];
  const states = classify(nodes, edges, new Set([id("A")]), new Set());
  assert.equal(states.get(id("A")), "used");
  assert.equal(states.get(id("B")), "used");
  assert.equal(states.get(id("C")), "used");
});

test("node unreachable from any root is dead", () => {
  const nodes = [irNode("A"), irNode("B")];
  const states = classify(nodes, [], new Set([id("A")]), new Set());
  assert.equal(states.get(id("A")), "used");
  assert.equal(states.get(id("B")), "dead");
});

test("reachable only from a test root is dead-in-prod", () => {
  const nodes = [irNode("Tested"), irNode("Harness")];
  const edges = [edge(id("Harness"), id("Tested"))];
  const states = classify(
    nodes,
    edges,
    new Set(),
    new Set([id("Harness")])
  );
  assert.equal(states.get(id("Tested")), "dead-in-prod");
});

test("prod reachability wins over test reachability", () => {
  const nodes = [irNode("Shared")];
  const edges: ReturnType<typeof edge>[] = [];
  const states = classify(
    nodes,
    edges,
    new Set([id("Shared")]),
    new Set([id("Shared")])
  );
  assert.equal(states.get(id("Shared")), "used");
});

test("test/story-origin components are always used (scaffolding)", () => {
  const nodes = [
    irNode("StoryComp", { origin: "story" }),
    irNode("TestComp", { origin: "test" }),
  ];
  // No roots at all — prod nodes would be dead, but non-prod origin overrides.
  const states = classify(nodes, [], new Set(), new Set());
  assert.equal(states.get(id("StoryComp")), "used");
  assert.equal(states.get(id("TestComp")), "used");
});

test("transitive deadness: child of a dead node is dead", () => {
  const nodes = [irNode("Root"), irNode("Dead"), irNode("Orphan")];
  // Root is a root; Dead->Orphan but nothing reaches Dead.
  const edges = [edge(id("Dead"), id("Orphan"))];
  const states = classify(nodes, edges, new Set([id("Root")]), new Set());
  assert.equal(states.get(id("Root")), "used");
  assert.equal(states.get(id("Dead")), "dead");
  assert.equal(states.get(id("Orphan")), "dead");
});

test("cycle reachable from a root is all used; unreachable cycle is dead", () => {
  const nodes = [irNode("Root"), irNode("A"), irNode("B"), irNode("X"), irNode("Y")];
  const edges = [
    edge(id("Root"), id("A")),
    edge(id("A"), id("B")),
    edge(id("B"), id("A")), // reachable cycle A<->B
    edge(id("X"), id("Y")),
    edge(id("Y"), id("X")), // unreachable cycle X<->Y
  ];
  const states = classify(nodes, edges, new Set([id("Root")]), new Set());
  assert.equal(states.get(id("A")), "used");
  assert.equal(states.get(id("B")), "used");
  assert.equal(states.get(id("X")), "dead");
  assert.equal(states.get(id("Y")), "dead");
});

test("empty graph yields an empty state map", () => {
  const states = classify([], [], new Set(), new Set());
  assert.equal(states.size, 0);
});

test("edges referencing unknown nodes do not crash and seed nothing extra", () => {
  const nodes = [irNode("A")];
  const edges = [edge(id("A"), id("Ghost"))];
  const states = classify(nodes, edges, new Set([id("A")]), new Set());
  assert.equal(states.get(id("A")), "used");
  assert.equal(states.has(id("Ghost")), false);
});
