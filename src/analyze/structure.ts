import path from "node:path";
import type {
  Cluster,
  ComponentMetrics,
  ComponentNode,
  ComponentRole,
  ComponentEdge,
  StructureInsights,
  SuggestedMove,
} from "../report/model.js";

const dirOf = (file: string): string => {
  const d = path.dirname(file);
  return d === "." ? "." : d;
};

/** Build de-duped out/in adjacency over the collapsed component edge set. */
function buildAdjacency(
  ids: Set<string>,
  edges: ComponentEdge[]
): { out: Map<string, Set<string>>; in: Map<string, Set<string>> } {
  const out = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();
  for (const id of ids) {
    out.set(id, new Set());
    incoming.set(id, new Set());
  }
  for (const e of edges) {
    if (e.from === e.to) continue;
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    out.get(e.from)!.add(e.to);
    incoming.get(e.to)!.add(e.from);
  }
  return { out, in: incoming };
}

/**
 * Iterative Tarjan SCC. Returns a stable scc id per node (`scc:<smallest id>`)
 * so a cycle's members share an id and acyclic nodes get their own.
 */
function tarjanScc(
  ids: string[],
  out: Map<string, Set<string>>
): Map<string, string> {
  let index = 0;
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccOf = new Map<string, string>();

  // Sorted iteration => deterministic component discovery order.
  const order = [...ids].sort();
  for (const root of order) {
    if (idx.has(root)) continue;
    // Explicit work stack: each frame tracks the node and its neighbour cursor.
    const work: Array<{ v: string; neighbors: string[]; i: number }> = [
      { v: root, neighbors: [...(out.get(root) ?? [])].sort(), i: 0 },
    ];
    idx.set(root, index);
    low.set(root, index);
    index++;
    stack.push(root);
    onStack.add(root);

    while (work.length) {
      const frame = work[work.length - 1];
      const { v, neighbors } = frame;
      if (frame.i < neighbors.length) {
        const w = neighbors[frame.i++];
        if (!idx.has(w)) {
          idx.set(w, index);
          low.set(w, index);
          index++;
          stack.push(w);
          onStack.add(w);
          work.push({ v: w, neighbors: [...(out.get(w) ?? [])].sort(), i: 0 });
        } else if (onStack.has(w)) {
          low.set(v, Math.min(low.get(v)!, idx.get(w)!));
        }
      } else {
        if (low.get(v) === idx.get(v)) {
          const members: string[] = [];
          let w: string;
          do {
            w = stack.pop()!;
            onStack.delete(w);
            members.push(w);
          } while (w !== v);
          const sccId = "scc:" + members.slice().sort()[0];
          for (const m of members) sccOf.set(m, sccId);
        }
        work.pop();
        if (work.length) {
          const parent = work[work.length - 1].v;
          low.set(parent, Math.min(low.get(parent)!, low.get(v)!));
        }
      }
    }
  }
  return sccOf;
}

/**
 * Deterministic label propagation on the undirected projection to find cohesion
 * clusters (natural module boundaries). Nodes are processed in sorted order and
 * adopt the most common neighbour label, breaking ties lexicographically, so the
 * same input always yields the same labels.
 */
function labelPropagation(
  ids: string[],
  out: Map<string, Set<string>>,
  incoming: Map<string, Set<string>>
): Map<string, string> {
  const sorted = [...ids].sort();
  const neighbors = new Map<string, string[]>();
  for (const id of sorted) {
    const set = new Set([...(out.get(id) ?? []), ...(incoming.get(id) ?? [])]);
    neighbors.set(id, [...set].sort());
  }
  const label = new Map<string, string>(sorted.map((id) => [id, id]));

  for (let pass = 0; pass < 20; pass++) {
    let changed = false;
    for (const id of sorted) {
      const ns = neighbors.get(id)!;
      if (ns.length === 0) continue;
      const counts = new Map<string, number>();
      for (const n of ns) {
        const l = label.get(n)!;
        counts.set(l, (counts.get(l) ?? 0) + 1);
      }
      // Most frequent label; tie-break on smallest label for determinism.
      let best = label.get(id)!;
      let bestCount = -1;
      for (const [l, c] of [...counts.entries()].sort((a, b) =>
        a[0].localeCompare(b[0])
      )) {
        if (c > bestCount) {
          bestCount = c;
          best = l;
        }
      }
      if (best !== label.get(id)) {
        label.set(id, best);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return label;
}

/**
 * Layer each node in the dependency DAG: layer = longest path from any root.
 * Cyclic edges are ignored for layering (members of a cycle share whatever layer
 * the longest acyclic path reaches), keeping the computation finite.
 */
function computeLayers(
  ids: string[],
  out: Map<string, Set<string>>,
  incoming: Map<string, Set<string>>,
  sccOf: Map<string, string>
): Map<string, number> {
  const layer = new Map<string, number>(ids.map((id) => [id, 0]));
  // Process in topological-ish order via repeated relaxation over acyclic edges.
  // Acyclic edge = endpoints in different SCCs.
  const acyclic: Array<[string, string]> = [];
  for (const from of ids) {
    for (const to of out.get(from) ?? []) {
      if (sccOf.get(from) !== sccOf.get(to)) acyclic.push([from, to]);
    }
  }
  acyclic.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  // Relax up to N passes (N = node count bounds longest path); break when stable.
  for (let pass = 0; pass < ids.length; pass++) {
    let changed = false;
    for (const [from, to] of acyclic) {
      const cand = layer.get(from)! + 1;
      if (cand > layer.get(to)!) {
        layer.set(to, cand);
        changed = true;
      }
    }
    if (!changed) break;
  }
  // Nodes with no incoming acyclic edge stay at layer 0 (roots/orphans).
  void incoming;
  return layer;
}

function classifyRole(
  id: string,
  fanIn: number,
  fanOut: number,
  prodRoots: Set<string>,
  hubIds: Set<string>
): ComponentRole {
  if (hubIds.has(id)) return "hub";
  if (prodRoots.has(id) || (fanIn === 0 && fanOut > 0)) return "root";
  if (fanIn === 0 && fanOut === 0) return "orphan";
  if (fanOut === 0 && fanIn > 0) return "leaf";
  return "connector";
}

/** p-quantile of a numeric array (linear interpolation). */
function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Derive architecture insights from the collapsed component graph: per-component
 * degree/role/cluster/layer metrics, dependency cycles, cohesion clusters,
 * misplacement-based move suggestions, and cross-directory coupling. Pure and
 * deterministic — same input yields byte-identical output.
 */
export function computeStructure(
  components: ComponentNode[],
  edges: ComponentEdge[],
  prodRoots: Set<string>
): StructureInsights {
  const ids = new Set(components.map((c) => c.id));
  const idList = [...ids].sort();
  const dirById = new Map(components.map((c) => [c.id, dirOf(c.file)]));
  const { out, in: incoming } = buildAdjacency(ids, edges);

  const fanInOf = (id: string) => incoming.get(id)!.size;
  const fanOutOf = (id: string) => out.get(id)!.size;

  // Hub threshold: fan-in at or above max(p90, 5) — but never below 2.
  const fanIns = idList.map(fanInOf).sort((a, b) => a - b);
  const hubThreshold = Math.max(2, Math.ceil(quantile(fanIns, 0.9)), 5);
  const hubIds = new Set(idList.filter((id) => fanInOf(id) >= hubThreshold));

  const sccOf = tarjanScc(idList, out);
  const clusterOf = labelPropagation(idList, out, incoming);
  const layerOf = computeLayers(idList, out, incoming, sccOf);

  const metrics: ComponentMetrics[] = idList.map((id) => ({
    id,
    fanIn: fanInOf(id),
    fanOut: fanOutOf(id),
    role: classifyRole(id, fanInOf(id), fanOutOf(id), prodRoots, hubIds),
    clusterId: clusterOf.get(id)!,
    layer: layerOf.get(id)!,
    sccId: sccOf.get(id)!,
  }));

  // ---- cycles: SCCs with more than one member ----
  const sccMembers = new Map<string, string[]>();
  for (const id of idList) {
    const s = sccOf.get(id)!;
    (sccMembers.get(s) ?? sccMembers.set(s, []).get(s)!).push(id);
  }
  const cycles = [...sccMembers.values()]
    .filter((m) => m.length > 1)
    .map((m) => m.slice().sort())
    .sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));

  // ---- clusters: summarize each label group ----
  const byCluster = new Map<string, string[]>();
  for (const id of idList) {
    const c = clusterOf.get(id)!;
    (byCluster.get(c) ?? byCluster.set(c, []).get(c)!).push(id);
  }
  const nameById = new Map(components.map((c) => [c.id, c.name]));
  const clusters: Cluster[] = [...byCluster.entries()]
    .map(([id, members]): Cluster => {
      const m = members.slice().sort();
      // Dirs by population (desc), then name.
      const dirCount = new Map<string, number>();
      for (const mid of m) {
        const d = dirById.get(mid)!;
        dirCount.set(d, (dirCount.get(d) ?? 0) + 1);
      }
      const dirs = [...dirCount.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([d]) => d);
      // Cohesion = intra-cluster incident edge ends / total incident edge ends.
      let intra = 0;
      let total = 0;
      for (const mid of m) {
        for (const t of out.get(mid) ?? []) {
          total++;
          if (clusterOf.get(t) === id) intra++;
        }
        for (const s of incoming.get(mid) ?? []) {
          total++;
          if (clusterOf.get(s) === id) intra++;
        }
      }
      const cohesion = total === 0 ? 0 : intra / total;
      return {
        id,
        label: nameById.get(m[0]) ?? m[0],
        members: m,
        dirs,
        cohesion: Math.round(cohesion * 1000) / 1000,
      };
    })
    .filter((c) => c.members.length > 1)
    .sort((a, b) => b.members.length - a.members.length || a.id.localeCompare(b.id));

  // ---- suggested moves: component lives away from its dependents ----
  const isEntry = (id: string) => prodRoots.has(id);
  const suggestedMoves: SuggestedMove[] = [];
  for (const id of idList) {
    if (isEntry(id)) continue;
    const deps = [...incoming.get(id)!];
    if (deps.length < 2) continue;
    const ownDir = dirById.get(id)!;
    const dirCount = new Map<string, number>();
    for (const d of deps) {
      const dd = dirById.get(d)!;
      dirCount.set(dd, (dirCount.get(dd) ?? 0) + 1);
    }
    if (dirCount.has(ownDir)) continue; // a dependent already lives here — keep
    let toDir = ownDir;
    let topCount = 0;
    for (const [d, c] of [...dirCount.entries()].sort((a, b) =>
      a[0].localeCompare(b[0])
    )) {
      if (c > topCount) {
        topCount = c;
        toDir = d;
      }
    }
    const share = topCount / deps.length;
    if (toDir !== ownDir && share >= 0.6) {
      suggestedMoves.push({
        id,
        fromDir: ownDir,
        toDir,
        share: Math.round(share * 1000) / 1000,
        dependents: deps.length,
      });
    }
  }
  suggestedMoves.sort(
    (a, b) => b.share - a.share || b.dependents - a.dependents || a.id.localeCompare(b.id)
  );

  // ---- hubs ranked by fan-in ----
  const hubs = [...hubIds].sort(
    (a, b) => fanInOf(b) - fanInOf(a) || a.localeCompare(b)
  );

  // ---- cross-directory edge count ----
  let crossDirEdges = 0;
  const seen = new Set<string>();
  for (const e of edges) {
    if (e.from === e.to || !ids.has(e.from) || !ids.has(e.to)) continue;
    const key = e.from + "|" + e.to;
    if (seen.has(key)) continue;
    seen.add(key);
    if (dirById.get(e.from) !== dirById.get(e.to)) crossDirEdges++;
  }

  return { metrics, clusters, cycles, suggestedMoves, hubs, crossDirEdges };
}
