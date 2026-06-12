// Visual constants for the report client. Centralised so spacing/sizing/colour
// choices have names and a single place to change (previously magic numbers
// scattered through the inline script).

import type { DeadState, ComponentRole } from "../model.js";

/** Node fill by dead/usage state. */
export const STATE_COLORS: Record<DeadState, string> = {
  used: "#58a6ff",
  dead: "#f85149",
  "dead-in-prod": "#e3b341",
};

/** Node fill by graph role (when colour-mode = role). */
export const ROLE_COLORS: Record<ComponentRole, string> = {
  root: "#a371f7",
  hub: "#58a6ff",
  connector: "#8b949e",
  leaf: "#3fb950",
  orphan: "#f85149",
};

/** Node shape by dead/usage state. */
export const STATE_SHAPE: Record<DeadState, string> = {
  used: "ellipse",
  dead: "triangle",
  "dead-in-prod": "round-rectangle",
};

export const DEFAULT_NODE_COLOR = "#58a6ff";
export const DEFAULT_ROLE_COLOR = "#8b949e";

// Node sizing: base diameter + bonus scaled by the chosen metric, capped.
export const NODE_SIZE_BASE = 18;
export const NODE_SIZE_MAX_BONUS = 40;
export const NODE_SIZE_PER_UNIT = 4;

// Graph-label anchor offsets (label nodes sit just outside their group).
export const LAYER_LABEL_DX = -70; // left of a dependency-layer row
export const GROUP_LABEL_DX = -24; // left of a directory/cluster group
export const GROUP_LABEL_DY = -34; // above a directory/cluster group

// Grid packing for filtered/overview fallback layout.
export const GRID_SPACING = 64;

// Focus/ego navigation.
export const DEFAULT_FOCUS_DEPTH = 2;

// Zoom controls.
export const ZOOM_STEP = 1.4;

// Hover tooltip placement.
export const TIP_OFFSET = 14;
export const TIP_WIDTH = 300;
export const TIP_FLIP_MARGIN = 310; // offset + width, threshold to flip left

// Search input debounce.
export const SEARCH_DEBOUNCE_MS = 120;

// Panel list caps.
export const MAX_INSPECTOR_SITES = 30;
export const MAX_HUBS = 25;

// Large-graph scaling (level-of-detail). Above this component count the graph
// is treated as "large": node labels only appear once zoomed in far enough, so
// thousands of overlapping labels don't tank pan/zoom.
export const LOD_NODE_THRESHOLD = 600;
export const LABEL_MIN_ZOOM_FONT = 10; // small graphs: show labels readily
export const LABEL_MIN_ZOOM_FONT_LARGE = 16; // large graphs: only when zoomed in

// Fit/animation paddings & durations (kept close to the originals).
export const FIT_PAD_FOCUS = 80;
export const FIT_PAD_GROUP = 60;
export const FIT_PAD_OVERVIEW = 30;
export const ANIM_FOCUS_MS = 250;
export const ANIM_ZOOM_MS = 120;
export const ANIM_FIT_MS = 200;
