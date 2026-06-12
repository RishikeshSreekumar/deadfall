// Data-driven colour/size encodings. Each mode is a single registry entry —
// adding one (e.g. a new colour scheme) means appending an object here, not
// editing a switch in four places. The <select> options, legend, and node
// styling all derive from these arrays.

import type { ComponentUsage, ComponentMetrics, DeadState } from "../model.js";
import {
  STATE_COLORS,
  ROLE_COLORS,
  DEFAULT_NODE_COLOR,
  DEFAULT_ROLE_COLOR,
  NODE_SIZE_BASE,
  NODE_SIZE_MAX_BONUS,
  NODE_SIZE_PER_UNIT,
} from "./constants.js";

export type ColorMode = "state" | "role" | "cluster";
export type SizeMode = "usage" | "fanIn" | "fanOut";

/** Colour for a dead/usage state, with the shared default fallback. */
export function stateColor(s: DeadState | undefined): string {
  return (s && STATE_COLORS[s]) || DEFAULT_NODE_COLOR;
}

/** Deterministic, stable hue from a cluster id so each module keeps its colour. */
export function clusterColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return "hsl(" + (h % 360) + ",55%,60%)";
}

// State legend doubles as a filter: clicking an entry applies it to the graph.
const STATE_LEGEND =
  '<span data-filter="all" title="click: show everything"><i class="dot" style="background:var(--used)"></i>used</span>' +
  '<span data-filter="dead" title="click: dead only"><i class="lg-tri"></i>dead</span>' +
  '<span data-filter="dead-in-prod" title="click: dead-in-prod only"><i class="lg-sq"></i>dead-in-prod</span>';

function roleLegend(): string {
  return (Object.keys(ROLE_COLORS) as (keyof typeof ROLE_COLORS)[])
    .map((r) => '<span><i class="dot" style="background:' + ROLE_COLORS[r] + '"></i>' + r + "</span>")
    .join("");
}

export interface ColorEncoding {
  id: ColorMode;
  label: string;
  color(compId: string, usage: ComponentUsage | undefined, metric: ComponentMetrics | undefined): string;
  legend(): string;
}

export const COLOR_ENCODINGS: ColorEncoding[] = [
  { id: "state", label: "state", color: (_id, u) => stateColor(u?.state), legend: () => STATE_LEGEND },
  {
    id: "role",
    label: "role",
    color: (_id, _u, m) => (m && ROLE_COLORS[m.role]) || DEFAULT_ROLE_COLOR,
    legend: roleLegend,
  },
  {
    id: "cluster",
    label: "cluster",
    color: (id, _u, m) => clusterColor(m?.clusterId || id),
    legend: () => '<span class="muted">colour = cohesion cluster</span>',
  },
];

export interface SizeEncoding {
  id: SizeMode;
  label: string;
  value(usage: ComponentUsage | undefined, metric: ComponentMetrics | undefined): number;
}

export const SIZE_ENCODINGS: SizeEncoding[] = [
  { id: "usage", label: "usage", value: (u) => u?.prodCount || 0 },
  { id: "fanIn", label: "fan-in", value: (_u, m) => m?.fanIn || 0 },
  { id: "fanOut", label: "fan-out", value: (_u, m) => m?.fanOut || 0 },
];

function colorEncoding(mode: ColorMode): ColorEncoding {
  return COLOR_ENCODINGS.find((e) => e.id === mode) || COLOR_ENCODINGS[0];
}

function sizeEncoding(mode: SizeMode): SizeEncoding {
  return SIZE_ENCODINGS.find((e) => e.id === mode) || SIZE_ENCODINGS[0];
}

/** Node fill for the active colour mode. */
export function nodeColor(
  mode: ColorMode,
  compId: string,
  usage: ComponentUsage | undefined,
  metric: ComponentMetrics | undefined
): string {
  return colorEncoding(mode).color(compId, usage, metric);
}

/** Node diameter for the active size mode (base + capped, scaled bonus). */
export function nodeSize(
  mode: SizeMode,
  usage: ComponentUsage | undefined,
  metric: ComponentMetrics | undefined
): number {
  const v = sizeEncoding(mode).value(usage, metric);
  return NODE_SIZE_BASE + Math.min(NODE_SIZE_MAX_BONUS, v * NODE_SIZE_PER_UNIT);
}

/** Legend markup for the active colour mode. */
export function legendHtml(mode: ColorMode): string {
  return colorEncoding(mode).legend();
}
