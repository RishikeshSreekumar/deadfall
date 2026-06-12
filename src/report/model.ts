// Shared data model produced by the engine and consumed by the HTML report.

export type ComponentKind = "prod" | "test" | "story";

export type EdgeKind = "jsx" | "dynamic" | "reference";

/** What a reported symbol represents in the navigation/report. */
export type SymbolKind = "component" | "function" | "hook";

/** A reported top-level symbol: a React component, a function, or a hook. */
export interface ComponentNode {
  /** Stable id: `${relativeFilePath}#${name}`. */
  id: string;
  name: string;
  /** Path relative to the scanned project root. */
  file: string;
  kind: ComponentKind;
  /** Component / function / hook — drives the nav glyph and inspector label. */
  symbolKind: SymbolKind;
  isDefaultExport: boolean;
  line: number;
}

/** A directed "A renders/references B" edge between two components. */
export interface ComponentEdge {
  from: string;
  to: string;
  kind: EdgeKind;
}

/** Where a component is used as JSX. */
export interface UsageSite {
  file: string;
  line: number;
}

export type DeadState = "used" | "dead" | "dead-in-prod";

export interface ComponentUsage {
  id: string;
  /** Number of JSX usage sites in prod code. */
  prodCount: number;
  /** Number of JSX usage sites in test/story code. */
  testCount: number;
  state: DeadState;
  sites: UsageSite[];
}

/** A precomputed 2D position for a component node (preset graph layout). */
export interface NodePosition {
  x: number;
  y: number;
}

/** The available graph arrangements the report can switch between. */
export type LayoutMode = "directory" | "layers" | "clusters";

/**
 * A component's position in the dependency graph:
 * - `root`     entry point / nothing renders it but it renders others
 * - `hub`      heavily depended-on shared component (high fan-in)
 * - `connector`general node with both dependents and dependencies
 * - `leaf`     depended-on but depends on nothing (pure presentational)
 * - `orphan`   no edges either way (often dead or top-level isolated)
 */
export type ComponentRole = "root" | "hub" | "connector" | "leaf" | "orphan";

/** Graph metrics for one component, derived from the collapsed edge set. */
export interface ComponentMetrics {
  id: string;
  /** Distinct components that depend on this one (in-degree). */
  fanIn: number;
  /** Distinct components this one depends on (out-degree). */
  fanOut: number;
  role: ComponentRole;
  /** Cohesion-cluster id (shared by components that reference each other). */
  clusterId: string;
  /** Layer in the dependency DAG (0 = roots), used by the "layers" layout. */
  layer: number;
  /** Strongly-connected-component id; shared id with others => a cycle. */
  sccId: string;
}

/** A cohesion cluster: components that tightly reference each other. */
export interface Cluster {
  id: string;
  label: string;
  members: string[];
  /** Directories the members live in, most-populated first. */
  dirs: string[];
  /** intra-cluster edges / total incident edges, 0..1 (higher = tighter). */
  cohesion: number;
}

/** A restructuring hint: a component that lives away from its dependents. */
export interface SuggestedMove {
  id: string;
  fromDir: string;
  toDir: string;
  /** Fraction of dependents that live in `toDir`, 0..1. */
  share: number;
  /** Total number of dependents considered. */
  dependents: number;
}

/** Architecture insights derived from the component graph. */
export interface StructureInsights {
  metrics: ComponentMetrics[];
  clusters: Cluster[];
  /** Each entry is the member ids of one dependency cycle (SCC size > 1). */
  cycles: string[][];
  suggestedMoves: SuggestedMove[];
  /** Component ids ranked by fan-in (the most depended-on shared code). */
  hubs: string[];
  /** Edges whose endpoints live in different directories. */
  crossDirEdges: number;
}

export interface ReportModel {
  projectRoot: string;
  generatedAt: string;
  components: ComponentNode[];
  edges: ComponentEdge[];
  usage: ComponentUsage[];
  /**
   * Deterministic graph layout computed offline (by `computeLayout`), keyed by
   * component id. Lets the HTML report render with cytoscape's `preset` layout —
   * no in-browser physics, so the report opens instantly. Optional: older JSON
   * without it falls back to an in-browser layout. Mirrors `layouts.directory`.
   */
  positions?: Record<string, NodePosition>;
  /**
   * All offline-computed layouts keyed by mode, so the report can switch between
   * directory / dependency-layers / cohesion-cluster arrangements with no
   * in-browser physics. Optional for back-compat with older JSON.
   */
  layouts?: Record<LayoutMode, Record<string, NodePosition>>;
  /** Architecture metrics & restructuring hints derived from the graph. */
  structure: StructureInsights;
  stats: {
    totalComponents: number;
    dead: number;
    deadInProd: number;
  };
}
