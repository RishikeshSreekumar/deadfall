// Pure deletion-cascade computation over adjacency maps. No DOM, no cytoscape —
// unit-testable. Answers: "if I delete this component, which of its transitive
// dependencies can be deleted along with it?"

import type { Adjacency } from "../model-index.js";

/**
 * Components that become deletable together with `seed`: start from every
 * dependency transitively reachable through `deletable` nodes, then prune (to a
 * fixpoint) any member still referenced from outside the deleted set. The
 * greatest-fixpoint direction matters: it lets mutually-referencing dead
 * components (cycles) fall together, which a grow-only pass would deadlock on.
 * `deletable` gates membership (callers exclude used/ignored components).
 * Returns the cascade excluding the seed.
 */
export function cascade(adj: Adjacency, seed: string, deletable: (id: string) => boolean): string[] {
  // Candidates: dependencies reachable from the seed via deletable nodes only.
  const reach = new Set<string>();
  const stack = [...(adj.outAdj.get(seed) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === seed || reach.has(id) || !deletable(id)) continue;
    reach.add(id);
    for (const dep of adj.outAdj.get(id) ?? []) stack.push(dep);
  }
  // Prune anything a survivor still points at, until stable.
  let pruned = true;
  while (pruned) {
    pruned = false;
    for (const id of [...reach]) {
      for (const parent of adj.inAdj.get(id) ?? []) {
        if (parent !== seed && !reach.has(parent)) {
          reach.delete(id);
          pruned = true;
          break;
        }
      }
    }
  }
  return [...reach];
}

/** Cascade size for each seed id (used to rank dead components for triage). */
export function cascadeSizes(
  adj: Adjacency,
  seeds: string[],
  deletable: (id: string) => boolean
): Map<string, number> {
  const sizes = new Map<string, number>();
  for (const id of seeds) sizes.set(id, cascade(adj, id, deletable).length);
  return sizes;
}
