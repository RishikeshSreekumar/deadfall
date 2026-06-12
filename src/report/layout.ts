import path from "node:path";
import type { ComponentNode, ComponentUsage, NodePosition } from "./model.js";

const NODE_SPACING = 64; // px between node centers within a block
const DIR_GAP = 140; // px gap between blocks

/** One group of node ids to pack together (members are pre-ordered). */
export interface PackGroup {
  key: string;
  members: string[];
}

/**
 * Shelf-pack a list of pre-ordered groups across a roughly square canvas: each
 * group becomes a small grid, and grids are laid left-to-right wrapping onto new
 * shelves. Deterministic — same input → byte-identical output. Shared by the
 * directory and cluster layouts.
 */
export function shelfPack(groups: PackGroup[]): Record<string, NodePosition> {
  const totalNodes = groups.reduce((n, g) => n + g.members.length, 0);
  const targetRowWidth = Math.sqrt(Math.max(1, totalNodes)) * NODE_SPACING * 3;

  const positions: Record<string, NodePosition> = {};
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;

  for (const group of groups) {
    const members = group.members;
    if (members.length === 0) continue;
    const cols = Math.ceil(Math.sqrt(members.length));
    const rows = Math.ceil(members.length / cols);
    const blockW = cols * NODE_SPACING;
    const blockH = rows * NODE_SPACING;

    if (cursorX > 0 && cursorX + blockW > targetRowWidth) {
      cursorX = 0;
      cursorY += rowHeight + DIR_GAP;
      rowHeight = 0;
    }

    members.forEach((id, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      positions[id] = {
        x: cursorX + col * NODE_SPACING,
        y: cursorY + row * NODE_SPACING,
      };
    });

    cursorX += blockW + DIR_GAP;
    rowHeight = Math.max(rowHeight, blockH);
  }

  return positions;
}

/**
 * Compute a deterministic, directory-clustered graph layout offline so the HTML
 * report can render with cytoscape's `preset` layout (no in-browser physics →
 * instant open) and so the spatial structure mirrors the source tree, which is
 * what makes a 1000+ node graph navigable.
 *
 * Components are grouped by their directory; each group is packed into a small
 * grid (most-used components first), and the groups are shelf-packed across a
 * roughly square canvas. Same input → byte-identical output.
 */
export function computeLayout(
  components: ComponentNode[],
  usage: ComponentUsage[]
): Record<string, NodePosition> {
  const prodById = new Map(usage.map((u) => [u.id, u.prodCount]));

  const byDir = new Map<string, ComponentNode[]>();
  for (const c of components) {
    const dir = path.dirname(c.file);
    const list = byDir.get(dir) ?? [];
    list.push(c);
    byDir.set(dir, list);
  }

  // Stable ordering: directories by path, members by usage (desc) then name.
  const dirs = [...byDir.keys()].sort();
  const groups: PackGroup[] = dirs.map((dir) => {
    const members = byDir.get(dir)!.slice().sort((a, b) => {
      const ua = prodById.get(a.id) ?? 0;
      const ub = prodById.get(b.id) ?? 0;
      if (ua !== ub) return ub - ua;
      return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
    });
    return { key: dir, members: members.map((c) => c.id) };
  });

  return shelfPack(groups);
}
