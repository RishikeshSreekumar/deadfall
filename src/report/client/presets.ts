// Named view presets: each bundles layout + colour + size + filter + edge
// behaviour into one task-shaped choice, so the top bar offers "what do you
// want to see?" instead of five independent knobs. The raw knobs survive under
// the ⚙ advanced disclosure; touching one switches the view to "custom".

import type { LayoutMode } from "../model.js";
import type { ColorMode, SizeMode } from "./encodings.js";
import type { TreeFilter } from "./graph/tree.js";

export type PresetId = "triage" | "architecture" | "hotspots" | "modules";

export interface ViewPreset {
  id: PresetId;
  label: string;
  layoutMode: LayoutMode;
  colorMode: ColorMode;
  sizeMode: SizeMode;
  /** Left-rail/graph filter applied when the preset activates. */
  filter: TreeFilter;
  /** Component-edge default: on/off, or auto (on when few nodes are visible). */
  edges: "auto" | "on" | "off";
  /** Overview level: directory bubbles, all components, or auto by graph size. */
  overview: "dirs" | "comps" | "auto";
}

export const VIEW_PRESETS: ViewPreset[] = [
  {
    id: "triage",
    label: "Triage — dead code",
    layoutMode: "directory",
    colorMode: "state",
    sizeMode: "usage",
    filter: "all",
    edges: "auto",
    overview: "auto",
  },
  {
    id: "architecture",
    label: "Architecture — layers",
    layoutMode: "layers",
    colorMode: "role",
    sizeMode: "fanIn",
    filter: "all",
    edges: "on",
    overview: "comps",
  },
  {
    id: "hotspots",
    label: "Hotspots — fan-in",
    layoutMode: "directory",
    colorMode: "role",
    sizeMode: "fanIn",
    filter: "all",
    edges: "auto",
    overview: "comps",
  },
  {
    id: "modules",
    label: "Modules — clusters",
    layoutMode: "clusters",
    colorMode: "cluster",
    sizeMode: "usage",
    filter: "all",
    edges: "off",
    overview: "comps",
  },
];

export function presetById(id: string): ViewPreset | undefined {
  return VIEW_PRESETS.find((p) => p.id === id);
}
