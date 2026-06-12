// Registry of graph layout arrangements. Drives the layout <select> options and
// the set of label-anchor sets built up front. Adding an arrangement is one
// entry here (plus its offline position computation in src/report/layouts.ts).

import type { LayoutMode } from "../model.js";

export interface LayoutModeDef {
  id: LayoutMode;
  label: string;
}

export const LAYOUT_MODES: LayoutModeDef[] = [
  { id: "directory", label: "directory" },
  { id: "layers", label: "dependency layers" },
  { id: "clusters", label: "cohesion clusters" },
];

export const LAYOUT_MODE_IDS: LayoutMode[] = LAYOUT_MODES.map((m) => m.id);
