// FrameworkAdapter — the seam that makes the EXTRACT layer framework-pluggable.
//
// The engine drives a fixed pipeline (discover files -> detect nodes -> build
// edges -> seed roots -> emit GraphIR) using a shared React/TS toolkit. An
// adapter supplies only the handful of framework-specific decisions:
//   * which build-output dirs to ignore,
//   * which files are file-system entry points (roots),
//   * which calls are lazy/dynamic component imports.
//
// Adding a framework = implement this interface. Nothing downstream of GraphIR
// changes.

export interface FrameworkAdapter {
  /** Adapter id, recorded in `GraphIR.framework` (e.g. "next-app"). */
  readonly name: string;

  /**
   * Cheap heuristic: does this project look like this framework? Used by the
   * adapter registry to auto-select when `--framework` is not given.
   */
  detect(root: string): boolean;

  /** Globs to ignore *in addition* to the generic build-output ignores. */
  ignoreGlobs(): string[];

  /**
   * Is this file a framework entry point (file-system route or special file)
   * whose default export must be seeded as a reachability root? `relPath` is
   * relative to the project root with `/` separators.
   */
  isEntryFile(relPath: string): boolean;

  /**
   * Names of calls that lazily import a component (e.g. `dynamic`, `lazy`).
   * Their import targets become roots and `dynamic` edges.
   */
  dynamicCallNames(): Set<string>;
}
