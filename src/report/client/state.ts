// Central UI state for the report client. Replaces the ~6 mutable closure
// globals (colour/size/layout mode, focus depth/direction, current focus) with
// one object plus a tiny subscribe/setState so view code reacts to changes
// instead of being poked imperatively from scattered event handlers.

import type { LayoutMode } from "../model.js";
import type { ColorMode, SizeMode } from "./encodings.js";
import type { EgoDir } from "./graph/ego.js";
import type { PresetId } from "./presets.js";
import { DEFAULT_FOCUS_DEPTH } from "./constants.js";

export interface UiState {
  /** Active named view, or "custom" once an advanced knob is touched. */
  preset: PresetId | "custom";
  colorMode: ColorMode;
  sizeMode: SizeMode;
  layoutMode: LayoutMode;
  /** Overview granularity: directory bubbles or every component. */
  overviewLevel: "dirs" | "comps";
  focusDepth: number;
  focusDir: EgoDir;
  /** Currently-focused component id, or null in overview. */
  currentFocus: string | null;
}

const state: UiState = {
  preset: "triage",
  colorMode: "state",
  sizeMode: "usage",
  layoutMode: "directory",
  overviewLevel: "comps",
  focusDepth: DEFAULT_FOCUS_DEPTH,
  focusDir: "both",
  currentFocus: null,
};

type Listener = (s: Readonly<UiState>, changed: ReadonlySet<keyof UiState>) => void;
const listeners = new Set<Listener>();

export function getState(): Readonly<UiState> {
  return state;
}

/** Merge a patch; notify listeners only for keys whose value actually changed. */
export function setState(patch: Partial<UiState>): void {
  const changed = new Set<keyof UiState>();
  (Object.keys(patch) as (keyof UiState)[]).forEach((key) => {
    if (state[key] !== patch[key]) {
      (state as Record<keyof UiState, unknown>)[key] = patch[key];
      changed.add(key);
    }
  });
  if (changed.size) listeners.forEach((l) => l(state, changed));
}

export function subscribe(l: Listener): void {
  listeners.add(l);
}
