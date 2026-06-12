import type { ComponentEdge, DeadState } from "../report/model.js";
import type { IRNode } from "../ir/model.js";

/** BFS over the directed edge set from a set of seed nodes. */
function reach(seeds: Set<string>, adjacency: Map<string, string[]>): Set<string> {
  const visited = new Set<string>(seeds);
  const queue = [...seeds];
  while (queue.length) {
    const id = queue.shift()!;
    for (const next of adjacency.get(id) ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return visited;
}

/**
 * Classify every component as used / dead / dead-in-prod.
 * - Reachable from a prod entry root -> `used`.
 * - Otherwise reachable only from test/story roots -> `dead-in-prod`.
 * - Otherwise -> `dead`.
 * Test/story components themselves are scaffolding and always reported `used`.
 */
export function classify(
  components: IRNode[],
  edges: ComponentEdge[],
  prodRoots: Set<string>,
  testRoots: Set<string>
): Map<string, DeadState> {
  const adjacency = new Map<string, string[]>();
  for (const e of edges) {
    const list = adjacency.get(e.from) ?? [];
    list.push(e.to);
    adjacency.set(e.from, list);
  }

  const reachableProd = reach(prodRoots, adjacency);
  const reachableTest = reach(testRoots, adjacency);

  const result = new Map<string, DeadState>();
  for (const c of components) {
    if (c.origin !== "prod") {
      result.set(c.id, "used");
      continue;
    }
    if (reachableProd.has(c.id)) result.set(c.id, "used");
    else if (reachableTest.has(c.id)) result.set(c.id, "dead-in-prod");
    else result.set(c.id, "dead");
  }
  return result;
}
