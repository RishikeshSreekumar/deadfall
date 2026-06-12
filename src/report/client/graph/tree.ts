// Pure directory-tree builder for the left rail. No DOM — unit-testable.

import type {
  ReportModel,
  ComponentUsage,
  DeadState,
  SymbolKind,
} from "../../model.js";
import { baseOf, dirOf } from "../dom.js";

export interface TreeLeaf {
  id: string;
  name: string;
  kind: SymbolKind;
  state: DeadState | undefined;
}

export interface TreeNode {
  name: string;
  dirs: Map<string, TreeNode>;
  comps: TreeLeaf[];
  /** True when this node represents a file (its children are symbols). */
  isFile?: boolean;
  /** Dead (or dead-in-prod) symbol count in this subtree. */
  dead: number;
  /** Total symbol count in this subtree. */
  total: number;
}

function emptyNode(name: string, isFile = false): TreeNode {
  return { name, dirs: new Map(), comps: [], isFile, dead: 0, total: 0 };
}

/**
 * Group symbols into a nested directory -> file -> symbol tree and aggregate
 * dead/total counts up the tree.
 */
export function buildTree(model: ReportModel, usageById: Map<string, ComponentUsage>): TreeNode {
  const root = emptyNode("");
  for (const c of model.components) {
    const u = usageById.get(c.id);
    let node = root;
    for (const seg of dirOf(c.file).split("/")) {
      let child = node.dirs.get(seg);
      if (!child) node.dirs.set(seg, (child = emptyNode(seg)));
      node = child;
    }
    // Descend into a file node so symbols are grouped by their defining file.
    const base = baseOf(c.file);
    let file = node.dirs.get(base);
    if (!file) node.dirs.set(base, (file = emptyNode(base, true)));
    node = file;
    node.comps.push({ id: c.id, name: c.name, kind: c.symbolKind, state: u?.state });
  }
  (function agg(n: TreeNode) {
    n.dirs.forEach(agg);
    for (const c of n.comps) {
      n.total++;
      if (c.state === "dead" || c.state === "dead-in-prod") n.dead++;
    }
    n.dirs.forEach((d) => {
      n.total += d.total;
      n.dead += d.dead;
    });
  })(root);
  return root;
}

export type TreeFilter = "all" | "dead" | "dead-in-prod";

/** Tree-rail filter: "dead" includes dead-in-prod (unlike the graph filter). */
export function treeFilterMatch(state: DeadState | undefined, f: TreeFilter): boolean {
  if (f === "dead") return state === "dead" || state === "dead-in-prod";
  if (f === "dead-in-prod") return state === "dead-in-prod";
  return true;
}
