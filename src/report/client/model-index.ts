// Pure index builders over a ReportModel. No DOM, no cytoscape — unit-testable.

import type { ReportModel } from "../model.js";

/** Index any `{id}` list by its id. */
export function byKey<T extends { id: string }>(items: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const it of items) m.set(it.id, it);
  return m;
}

/** Directed adjacency over the component graph (self-loops and dangling edges dropped). */
export interface Adjacency {
  /** id -> ids it depends on (out-edges). */
  outAdj: Map<string, Set<string>>;
  /** id -> ids that depend on it (in-edges). */
  inAdj: Map<string, Set<string>>;
}

/**
 * Build directed adjacency maps from the model's edges, keeping only edges whose
 * endpoints are real components and that are not self-loops (mirrors the original
 * inline guard).
 */
export function buildAdjacency(model: ReportModel, compIds: Set<string>): Adjacency {
  const outAdj = new Map<string, Set<string>>();
  const inAdj = new Map<string, Set<string>>();
  for (const e of model.edges) {
    if (!compIds.has(e.from) || !compIds.has(e.to) || e.from === e.to) continue;
    (outAdj.get(e.from) ?? outAdj.set(e.from, new Set()).get(e.from)!).add(e.to);
    (inAdj.get(e.to) ?? inAdj.set(e.to, new Set()).get(e.to)!).add(e.from);
  }
  return { outAdj, inAdj };
}
