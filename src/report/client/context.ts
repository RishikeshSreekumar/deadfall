// Immutable, derived singletons for the report client, built once from the
// inlined `MODEL` global. These never change at runtime (unlike UiState), so
// they live here rather than in the reactive store.

import type {
  ReportModel,
  StructureInsights,
  LayoutMode,
  NodePosition,
} from "../model.js";
import { byKey, buildAdjacency } from "./model-index.js";

declare const MODEL: ReportModel;

const EMPTY_STRUCTURE: StructureInsights = {
  metrics: [],
  clusters: [],
  cycles: [],
  suggestedMoves: [],
  hubs: [],
  crossDirEdges: 0,
};

export const model: ReportModel = MODEL;
export const structure: StructureInsights = model.structure || EMPTY_STRUCTURE;

export const usageById = byKey(model.usage);
export const compById = byKey(model.components);
export const metricById = byKey(structure.metrics || []);

/** Offline layouts keyed by mode; falls back to legacy single `positions`. */
export type Layouts = Partial<Record<LayoutMode, Record<string, NodePosition>>>;
export const layouts: Layouts | null =
  model.layouts || (model.positions ? { directory: model.positions } : null);

export const adjacency = buildAdjacency(model, new Set(compById.keys()));
