import assert from "node:assert/strict";
import { test } from "node:test";
import { computeStructure } from "../src/analyze/structure.js";
import type { ComponentMetrics } from "../src/report/model.js";
import { compNode, edge, id } from "./helpers.js";

function metric(
  insights: { metrics: ComponentMetrics[] },
  cid: string
): ComponentMetrics {
  const m = insights.metrics.find((x) => x.id === cid);
  assert.ok(m, `missing metric for ${cid}`);
  return m!;
}

test("empty graph yields empty insights", () => {
  const s = computeStructure([], [], new Set());
  assert.deepEqual(s.metrics, []);
  assert.deepEqual(s.clusters, []);
  assert.deepEqual(s.cycles, []);
  assert.deepEqual(s.suggestedMoves, []);
  assert.deepEqual(s.hubs, []);
  assert.equal(s.crossDirEdges, 0);
});

test("a lone node with no edges is an orphan", () => {
  const comps = [compNode("Lonely")];
  const s = computeStructure(comps, [], new Set());
  const m = metric(s, id("Lonely"));
  assert.equal(m.fanIn, 0);
  assert.equal(m.fanOut, 0);
  assert.equal(m.role, "orphan");
  assert.equal(s.cycles.length, 0);
});

test("fan-in / fan-out and the four basic roles", () => {
  // Root -> Mid -> Leaf ; Root is a prod root.
  const comps = [compNode("Root"), compNode("Mid"), compNode("Leaf")];
  const edges = [edge(id("Root"), id("Mid")), edge(id("Mid"), id("Leaf"))];
  const s = computeStructure(comps, edges, new Set([id("Root")]));
  assert.equal(metric(s, id("Root")).role, "root");
  assert.equal(metric(s, id("Mid")).role, "connector");
  assert.equal(metric(s, id("Leaf")).role, "leaf");
  assert.equal(metric(s, id("Mid")).fanIn, 1);
  assert.equal(metric(s, id("Mid")).fanOut, 1);
  assert.equal(metric(s, id("Leaf")).fanIn, 1);
  assert.equal(metric(s, id("Leaf")).fanOut, 0);
});

test("a node with no incoming edges but outgoing edges is a root role", () => {
  const comps = [compNode("Top"), compNode("Child")];
  const s = computeStructure(comps, [edge(id("Top"), id("Child"))], new Set());
  // Not seeded as a prod root, but fanIn===0 && fanOut>0 still → root.
  assert.equal(metric(s, id("Top")).role, "root");
});

test("heavily depended-on node crosses the hub threshold", () => {
  const deps = ["D0", "D1", "D2", "D3", "D4", "D5"];
  const comps = [compNode("Hub"), ...deps.map((d) => compNode(d))];
  const edges = deps.map((d) => edge(id(d), id("Hub")));
  const s = computeStructure(comps, edges, new Set());
  assert.equal(metric(s, id("Hub")).fanIn, 6);
  assert.equal(metric(s, id("Hub")).role, "hub");
  assert.ok(s.hubs.includes(id("Hub")));
  // Hubs ranked by fan-in: the hub leads.
  assert.equal(s.hubs[0], id("Hub"));
});

test("a 2-node cycle shares an scc id and is reported as a cycle", () => {
  const comps = [compNode("A"), compNode("B")];
  const edges = [edge(id("A"), id("B")), edge(id("B"), id("A"))];
  const s = computeStructure(comps, edges, new Set());
  assert.equal(metric(s, id("A")).sccId, metric(s, id("B")).sccId);
  const cyc = s.cycles.find((c) => c.includes(id("A")) && c.includes(id("B")));
  assert.ok(cyc, "expected A/B cycle");
  assert.equal(cyc!.length, 2);
});

test("acyclic graph reports no cycles and distinct scc ids", () => {
  const comps = [compNode("A"), compNode("B")];
  const s = computeStructure(comps, [edge(id("A"), id("B"))], new Set());
  assert.equal(s.cycles.length, 0);
  assert.notEqual(metric(s, id("A")).sccId, metric(s, id("B")).sccId);
});

test("dependency layers increase down an acyclic chain", () => {
  const comps = [compNode("L0"), compNode("L1"), compNode("L2")];
  const edges = [edge(id("L0"), id("L1")), edge(id("L1"), id("L2"))];
  const s = computeStructure(comps, edges, new Set([id("L0")]));
  assert.equal(metric(s, id("L0")).layer, 0);
  assert.equal(metric(s, id("L1")).layer, 1);
  assert.equal(metric(s, id("L2")).layer, 2);
});

test("cross-directory edges counted once per distinct endpoint pair", () => {
  const comps = [
    compNode("A", "feature-a/A.tsx"),
    compNode("B", "feature-b/B.tsx"),
    compNode("C", "feature-a/C.tsx"),
  ];
  const edges = [
    edge(id("A", "feature-a/A.tsx"), id("B", "feature-b/B.tsx"), "jsx"),
    edge(id("A", "feature-a/A.tsx"), id("B", "feature-b/B.tsx"), "reference"), // dup pair
    edge(id("A", "feature-a/A.tsx"), id("C", "feature-a/C.tsx")), // same dir
  ];
  const s = computeStructure(comps, edges, new Set());
  assert.equal(s.crossDirEdges, 1);
});

test("suggested move when a component sits away from all its dependents", () => {
  const comps = [
    compNode("Shared", "feature-a/Shared.tsx"),
    compNode("P1", "feature-b/P1.tsx"),
    compNode("P2", "feature-b/P2.tsx"),
  ];
  const edges = [
    edge(id("P1", "feature-b/P1.tsx"), id("Shared", "feature-a/Shared.tsx")),
    edge(id("P2", "feature-b/P2.tsx"), id("Shared", "feature-a/Shared.tsx")),
  ];
  const s = computeStructure(comps, edges, new Set());
  const mv = s.suggestedMoves.find(
    (m) => m.id === id("Shared", "feature-a/Shared.tsx")
  );
  assert.ok(mv, "expected a move hint");
  assert.equal(mv!.fromDir, "feature-a");
  assert.equal(mv!.toDir, "feature-b");
  assert.equal(mv!.dependents, 2);
  assert.equal(mv!.share, 1);
});

test("no move hint when a dependent already lives in the same dir", () => {
  const comps = [
    compNode("Shared", "feature-a/Shared.tsx"),
    compNode("Local", "feature-a/Local.tsx"),
    compNode("Far", "feature-b/Far.tsx"),
  ];
  const edges = [
    edge(id("Local", "feature-a/Local.tsx"), id("Shared", "feature-a/Shared.tsx")),
    edge(id("Far", "feature-b/Far.tsx"), id("Shared", "feature-a/Shared.tsx")),
  ];
  const s = computeStructure(comps, edges, new Set());
  assert.equal(
    s.suggestedMoves.some((m) => m.id === id("Shared", "feature-a/Shared.tsx")),
    false
  );
});

test("entry roots are never suggested for a move", () => {
  const comps = [
    compNode("Shared", "feature-a/Shared.tsx"),
    compNode("P1", "feature-b/P1.tsx"),
    compNode("P2", "feature-b/P2.tsx"),
  ];
  const sharedId = id("Shared", "feature-a/Shared.tsx");
  const edges = [
    edge(id("P1", "feature-b/P1.tsx"), sharedId),
    edge(id("P2", "feature-b/P2.tsx"), sharedId),
  ];
  const s = computeStructure(comps, edges, new Set([sharedId]));
  assert.equal(s.suggestedMoves.some((m) => m.id === sharedId), false);
});

test("clusters only contain multi-member groups with cohesion in [0,1]", () => {
  const comps = [compNode("A"), compNode("B"), compNode("C")];
  const edges = [edge(id("A"), id("B")), edge(id("B"), id("A"))];
  const s = computeStructure(comps, edges, new Set());
  for (const c of s.clusters) {
    assert.ok(c.members.length > 1, "clusters must be multi-member");
    assert.ok(c.cohesion >= 0 && c.cohesion <= 1);
  }
});

test("output is deterministic byte-for-byte", () => {
  const comps = [
    compNode("Root"),
    compNode("A"),
    compNode("B"),
    compNode("Hub"),
  ];
  const edges = [
    edge(id("Root"), id("A")),
    edge(id("A"), id("B")),
    edge(id("B"), id("A")),
    edge(id("A"), id("Hub")),
    edge(id("B"), id("Hub")),
  ];
  const a = computeStructure(comps, edges, new Set([id("Root")]));
  const b = computeStructure(comps, edges, new Set([id("Root")]));
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});
