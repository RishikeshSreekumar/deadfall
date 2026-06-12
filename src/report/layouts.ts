import { computeLayout, shelfPack, type PackGroup } from "./layout.js";
import type {
  ComponentEdge,
  ComponentNode,
  ComponentUsage,
  LayoutMode,
  NodePosition,
  StructureInsights,
} from "./model.js";

const LAYER_COL_SPACING = 90; // px between nodes within a layer
const LAYER_ROW_SPACING = 150; // px between dependency layers

/**
 * Lay components out by their cohesion cluster: each cluster is a grid, clusters
 * shelf-packed. Singleton/unclustered nodes fall into a trailing "misc" group so
 * every component gets a position. Members ordered by usage then name.
 */
function clusterLayout(
  components: ComponentNode[],
  usage: ComponentUsage[],
  insights: StructureInsights
): Record<string, NodePosition> {
  const prodById = new Map(usage.map((u) => [u.id, u.prodCount]));
  const nameById = new Map(components.map((c) => [c.id, c.name]));
  const clusterById = new Map(
    insights.metrics.map((m) => [m.id, m.clusterId])
  );

  const byCluster = new Map<string, string[]>();
  for (const c of components) {
    const cl = clusterById.get(c.id) ?? "__misc__";
    const list = byCluster.get(cl) ?? [];
    list.push(c.id);
    byCluster.set(cl, list);
  }

  const order = (id: string) => prodById.get(id) ?? 0;
  const groups: PackGroup[] = [...byCluster.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([key, ids]) => ({
      key,
      members: ids.slice().sort((a, b) => {
        const ua = order(a);
        const ub = order(b);
        if (ua !== ub) return ub - ua;
        return (
          (nameById.get(a) ?? a).localeCompare(nameById.get(b) ?? b) ||
          a.localeCompare(b)
        );
      }),
    }));

  return shelfPack(groups);
}

/**
 * Sugiyama-lite dependency-DAG layout: nodes stacked into rows by their graph
 * layer (roots on top), ordered within a row by the barycenter of their
 * neighbours to reduce edge crossings. Deterministic.
 */
function layerLayout(
  components: ComponentNode[],
  edges: ComponentEdge[],
  insights: StructureInsights
): Record<string, NodePosition> {
  const ids = new Set(components.map((c) => c.id));
  const nameById = new Map(components.map((c) => [c.id, c.name]));
  const layerById = new Map(insights.metrics.map((m) => [m.id, m.layer]));

  const up = new Map<string, string[]>(); // node -> neighbours one layer above
  const down = new Map<string, string[]>(); // node -> neighbours one layer below
  for (const id of ids) {
    up.set(id, []);
    down.set(id, []);
  }
  for (const e of edges) {
    if (e.from === e.to || !ids.has(e.from) || !ids.has(e.to)) continue;
    const lf = layerById.get(e.from) ?? 0;
    const lt = layerById.get(e.to) ?? 0;
    if (lt > lf) {
      down.get(e.from)!.push(e.to);
      up.get(e.to)!.push(e.from);
    } else if (lf > lt) {
      down.get(e.to)!.push(e.from);
      up.get(e.from)!.push(e.to);
    }
  }

  // Group ids by layer; initial order: name then id (stable).
  const byLayer = new Map<number, string[]>();
  for (const c of components) {
    const l = layerById.get(c.id) ?? 0;
    const list = byLayer.get(l) ?? [];
    list.push(c.id);
    byLayer.set(l, list);
  }
  const layers = [...byLayer.keys()].sort((a, b) => a - b);
  for (const l of layers) {
    byLayer.get(l)!.sort(
      (a, b) =>
        (nameById.get(a) ?? a).localeCompare(nameById.get(b) ?? b) ||
        a.localeCompare(b)
    );
  }

  const posIndex = new Map<string, number>();
  const reindex = () => {
    for (const l of layers) {
      byLayer.get(l)!.forEach((id, i) => posIndex.set(id, i));
    }
  };
  reindex();

  const barycenter = (id: string, refs: Map<string, string[]>): number => {
    const ns = refs.get(id)!;
    if (ns.length === 0) return posIndex.get(id)!;
    let sum = 0;
    for (const n of ns) sum += posIndex.get(n) ?? 0;
    return sum / ns.length;
  };

  // A few down/up sweeps: order each layer by barycenter of the fixed adjacent.
  for (let sweep = 0; sweep < 4; sweep++) {
    const refs = sweep % 2 === 0 ? up : down;
    for (const l of layers) {
      const row = byLayer.get(l)!;
      const keyed = row.map((id, i) => ({ id, b: barycenter(id, refs), i }));
      keyed.sort((a, b) => a.b - b.b || a.i - b.i);
      byLayer.set(
        l,
        keyed.map((k) => k.id)
      );
    }
    reindex();
  }

  // Center each row horizontally for a tidy pyramid.
  const maxWidth =
    Math.max(...layers.map((l) => byLayer.get(l)!.length), 1) *
    LAYER_COL_SPACING;
  const positions: Record<string, NodePosition> = {};
  for (const l of layers) {
    const row = byLayer.get(l)!;
    const rowWidth = row.length * LAYER_COL_SPACING;
    const offsetX = (maxWidth - rowWidth) / 2;
    row.forEach((id, i) => {
      positions[id] = {
        x: offsetX + i * LAYER_COL_SPACING,
        y: l * LAYER_ROW_SPACING,
      };
    });
  }
  return positions;
}

/**
 * Compute every offline layout the report can switch between. All are
 * deterministic so the report renders with cytoscape's `preset` layout (no
 * in-browser physics). Returns positions keyed by mode.
 */
export function computeLayouts(
  components: ComponentNode[],
  usage: ComponentUsage[],
  edges: ComponentEdge[],
  insights: StructureInsights
): Record<LayoutMode, Record<string, NodePosition>> {
  return {
    directory: computeLayout(components, usage),
    layers: layerLayout(components, edges, insights),
    clusters: clusterLayout(components, usage, insights),
  };
}
