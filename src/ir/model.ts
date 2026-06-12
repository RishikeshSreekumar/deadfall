// GraphIR — the FROZEN contract between the framework adapter (EXTRACT layer)
// and the framework-agnostic core (ANALYZE layer).
//
// Everything *before* this structure is framework-specific (how to find nodes,
// what counts as a root, which imports form edges). Everything *after* it —
// reachability, dead-code, metrics, clusters, layout, rendering — consumes only
// GraphIR and never knows which framework produced it.
//
// Rules that keep it stable across frameworks:
//   * `id` format is frozen: `${relativeFilePath}#${name}`.
//   * `kind` fields are OPEN unions (string). The core treats unknown edge kinds
//     as plain references and unknown node kinds as opaque, so a new framework
//     can add types without touching the core.
//   * The core never reads `meta`; it is an adapter-only escape hatch.
//   * The whole structure is JSON-serializable (no class instances, no AST
//     nodes) so it can be cached, diffed between runs, or fed in from outside.

import type { ComponentEdge, UsageSite } from "../report/model.js";

/**
 * What a node represents. Open union. Reported to the user:
 * "component" | "function" | "hook". "module" = plain config/value glue, kept
 * only as a reachability intermediary and never shown.
 */
export type IRNodeKind =
  | "component"
  | "function"
  | "hook"
  | "module"
  | (string & {});

/** Which kind of code a node lives in. */
export type IROrigin = "prod" | "test" | "story";

/**
 * A tracked declaration in the project. Includes non-component "glue" (config
 * objects, hooks, helpers) so reachability can flow through them; the core
 * reports only `kind === "component"` nodes to the user.
 *
 * This is the AST-free, serializable form of `scan/components.ts:ComponentInfo`.
 */
export interface IRNode {
  /** Stable id: `${relativeFilePath}#${name}`. */
  id: string;
  name: string;
  /** Path relative to `projectRoot`. */
  file: string;
  line: number;
  kind: IRNodeKind;
  origin: IROrigin;
  isDefaultExport: boolean;
  /**
   * Marked intentionally-kept via a `deadfall-ignore` comment. The core adds
   * ignored nodes to the prod reachability roots. Optional + additive.
   */
  ignored?: boolean;
  /** Adapter-only escape hatch (route path, "use server", selector, ...). */
  meta?: Record<string, unknown>;
}

/**
 * Reachability seeds the adapter identified. These are the framework-specific
 * decision: App Router `page`/`layout`, `pages/` files, dynamic-import targets,
 * router-manifest entries, test-runner entry files, etc.
 */
export interface IRRoots {
  /** Entry points of shipped/production code. */
  prod: string[];
  /** Entry points that only a test runner / story renderer reaches. */
  test: string[];
}

/**
 * The fixed input data structure. An adapter's entire job is to produce one of
 * these from a project path; the visualizer pipeline depends on nothing else.
 */
export interface GraphIR {
  schemaVersion: 1;
  /** Absolute path to the scanned project root. */
  projectRoot: string;
  /** Adapter that produced this IR, e.g. "next-app", "vite-react". */
  framework: string;

  /** All tracked declarations (components + glue), AST-free. */
  nodes: IRNode[];
  /**
   * Raw directed edges over *all* nodes, possibly passing through glue. The core
   * collapses glue-mediated links into direct component->component edges.
   */
  edges: ComponentEdge[];
  roots: IRRoots;
  /** nodeId -> the JSX/usage sites where it is referenced. */
  usageSites: Record<string, UsageSite[]>;
  /**
   * file -> files it imports/re-exports (relative paths, discovered files
   * only). Includes type-only, side-effect, and barrel re-export imports the
   * symbol graph does not track — the safety backstop for `check --fix`.
   * Optional + additive.
   */
  fileImports?: Record<string, string[]>;
}
