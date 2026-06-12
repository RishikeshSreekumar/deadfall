// Builds cytoscape element definitions (component nodes, graph-label anchors,
// edges) from the model + indexes. No cytoscape instance and no DOM, so the
// shapes are inspectable/testable on their own.

import type { LayoutMode, NodePosition } from "../model.js";
import { model, usageById, metricById, structure, compById } from "./context.js";
import type { Layouts } from "./context.js";
import { nodeColor, nodeSize } from "./encodings.js";
import type { ColorMode, SizeMode } from "./encodings.js";
import { dirOf } from "./dom.js";
import { STATE_SHAPE, LAYER_LABEL_DX, GROUP_LABEL_DX, GROUP_LABEL_DY } from "./constants.js";
import { LAYOUT_MODE_IDS } from "./layout-modes.js";

export interface ElementDef {
  data: Record<string, unknown>;
  position?: { x: number; y: number };
  selectable?: boolean;
  grabbable?: boolean;
}

/** Component nodes, positioned from `basePos` when a position is known. */
export function buildNodes(
  colorMode: ColorMode,
  sizeMode: SizeMode,
  basePos: Record<string, NodePosition>
): ElementDef[] {
  return model.components.map((c) => {
    const u = usageById.get(c.id);
    const m = metricById.get(c.id);
    const node: ElementDef = {
      data: {
        id: c.id,
        type: "comp",
        label: c.name,
        state: u?.state || "used",
        dir: dirOf(c.file),
        file: c.file,
        color: nodeColor(colorMode, c.id, u, m),
        size: nodeSize(sizeMode, u, m),
        shape: (u?.state && STATE_SHAPE[u.state]) || "ellipse",
      },
    };
    const p = basePos[c.id];
    if (p) node.position = { x: p.x, y: p.y };
    return node;
  });
}

/**
 * Text-only anchor nodes for one layout mode, positioned in that mode's
 * coordinates. We build the set for every mode up front and show only the active
 * one, so switching needs no repositioning.
 */
export function buildLabelNodes(mode: LayoutMode, layouts: Layouts): ElementDef[] {
  const pos = layouts[mode];
  if (!pos) return [];
  const out: ElementDef[] = [];

  if (mode === "layers") {
    // One label per layer row, anchored at the row's left edge.
    const byLayer: Record<string, { minX: number; y: number }> = {};
    for (const c of model.components) {
      const p = pos[c.id];
      if (!p) continue;
      const L = String(metricById.get(c.id)?.layer || 0);
      const b = byLayer[L] || (byLayer[L] = { minX: Infinity, y: p.y });
      if (p.x < b.minX) b.minX = p.x;
    }
    for (const L of Object.keys(byLayer)) {
      out.push({
        data: { id: "__lbl__" + mode + "__" + L, type: "label", mode, label: "layer " + L },
        position: { x: byLayer[L].minX + LAYER_LABEL_DX, y: byLayer[L].y },
        selectable: false,
        grabbable: false,
      });
    }
    return out;
  }

  // directory / clusters: anchor a label at each group's top-left.
  const bounds: Record<string, { minX: number; minY: number }> = {};
  for (const c of model.components) {
    const p = pos[c.id];
    if (!p) continue;
    const key = mode === "clusters" ? metricById.get(c.id)?.clusterId || c.id : dirOf(c.file);
    const b = bounds[key] || (bounds[key] = { minX: Infinity, minY: Infinity });
    if (p.x < b.minX) b.minX = p.x;
    if (p.y < b.minY) b.minY = p.y;
  }
  const clusterLabel: Record<string, string> = {};
  for (const cl of structure.clusters || []) clusterLabel[cl.id] = cl.label;
  for (const key of Object.keys(bounds)) {
    const text =
      mode === "clusters"
        ? "◆ " + (clusterLabel[key] || "misc")
        : (key.split("/").pop() || key) + "/";
    out.push({
      data: { id: "__lbl__" + mode + "__" + key, type: "label", mode, label: text, full: key },
      position: { x: bounds[key].minX + GROUP_LABEL_DX, y: bounds[key].minY + GROUP_LABEL_DY },
      selectable: false,
      grabbable: false,
    });
  }
  return out;
}

/** All label anchors across every available layout mode. */
export function buildAllLabels(layouts: Layouts | null): ElementDef[] {
  if (!layouts) return [];
  let out: ElementDef[] = [];
  for (const m of LAYOUT_MODE_IDS) {
    if (layouts[m]) out = out.concat(buildLabelNodes(m, layouts));
  }
  return out;
}

/** Directed edges between real components (self-loops/dangling dropped). */
export function buildEdges(nodeIds: Set<string>): ElementDef[] {
  return model.edges
    .filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to) && e.from !== e.to)
    .map((e, i) => {
      const cross = dirOf(compById.get(e.from)!.file) !== dirOf(compById.get(e.to)!.file);
      return { data: { id: "e" + i, source: e.from, target: e.to, kind: e.kind, cross: cross ? 1 : 0 } };
    });
}
