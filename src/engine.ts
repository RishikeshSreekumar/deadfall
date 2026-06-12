import { detectDeclarations } from "./scan/components.js";
import { discoverFiles } from "./scan/discover.js";
import { ComponentRegistry } from "./scan/registry.js";
import { buildGraph } from "./graph/build.js";
import { collectRoots } from "./graph/roots.js";
import { classify } from "./graph/reachability.js";
import { buildUsage } from "./analyze/usage.js";
import { computeStructure } from "./analyze/structure.js";
import { computeLayouts } from "./report/layouts.js";
import { createProject, resolveConfig } from "./config.js";
import { selectAdapter } from "./adapters/index.js";
import type { FrameworkAdapter } from "./adapters/types.js";
import type { GraphIR, IRNode } from "./ir/model.js";
import type {
  ComponentEdge,
  ComponentNode,
  ReportModel,
  UsageSite,
} from "./report/model.js";

/** IR node kinds surfaced to the user (everything else is reachability glue). */
const REPORTED_KINDS = new Set(["component", "function", "hook"]);

/**
 * Rewrite edges so both endpoints are components: for each component, walk the
 * graph through non-component glue nodes (config objects, hooks, helpers) until
 * reaching another component, emitting a direct edge. Glue-mediated links become
 * `reference` edges; direct component->component edges keep their kind.
 */
function collapseGlueEdges(
  edges: ComponentEdge[],
  componentIds: Set<string>
): ComponentEdge[] {
  const adjacency = new Map<string, ComponentEdge[]>();
  for (const e of edges) {
    const list = adjacency.get(e.from) ?? [];
    list.push(e);
    adjacency.set(e.from, list);
  }

  const out: ComponentEdge[] = [];
  const emitted = new Set<string>();
  const emit = (from: string, to: string, kind: ComponentEdge["kind"]) => {
    const key = `${from}|${to}|${kind}`;
    if (from === to || emitted.has(key)) return;
    emitted.add(key);
    out.push({ from, to, kind });
  };

  for (const start of componentIds) {
    const visited = new Set<string>([start]);
    const queue = (adjacency.get(start) ?? []).map((e) => ({
      to: e.to,
      kind: e.kind,
    }));
    while (queue.length) {
      const { to, kind } = queue.shift()!;
      if (visited.has(to)) continue;
      visited.add(to);
      if (componentIds.has(to)) {
        emit(start, to, kind); // reached a component — stop expanding it
      } else {
        // Walk through glue, marking the indirect link as a reference.
        for (const e of adjacency.get(to) ?? []) {
          queue.push({ to: e.to, kind: "reference" });
        }
      }
    }
  }
  return out;
}

export interface AnalyzeOptions {
  /** Include test/story files as usage evidence (default false). */
  includeTests?: boolean;
  /** Progress callback for CLI logging. */
  onProgress?: (msg: string) => void;
  /** Explicit framework adapter, bypassing name/auto-detection. */
  adapter?: FrameworkAdapter;
  /** Framework id (e.g. "next-app"); auto-detected from the project if omitted. */
  framework?: string;
}

// ---------------------------------------------------------------------------
// EXTRACT layer (framework-specific): project path -> GraphIR.
//
// All framework knowledge is injected via the FrameworkAdapter (ignore globs,
// entry-file detection, dynamic-import calls). The rest — file discovery, React
// component detection, TS import resolution, edge building — is a shared toolkit
// reused by every adapter. Output is the frozen GraphIR contract.
// ---------------------------------------------------------------------------

/** Run the framework-specific extraction and produce a GraphIR. */
export async function extract(
  targetPath: string,
  options: AnalyzeOptions = {}
): Promise<GraphIR> {
  const log = options.onProgress ?? (() => {});
  const config = resolveConfig(targetPath);
  const adapter =
    options.adapter ?? selectAdapter(config.root, options.framework).adapter;
  log(`Scanning ${config.root} [${adapter.name}]`);

  const files = await discoverFiles(config.root, {
    includeTests: options.includeTests,
    extraIgnores: adapter.ignoreGlobs(),
  });
  log(`Found ${files.length} source files`);

  const project = createProject(config);
  const sourceFiles = files.map((f) => project.addSourceFileAtPath(f));

  const registry = new ComponentRegistry(config.root);
  for (const sf of sourceFiles) {
    for (const info of detectDeclarations(config.root, sf)) registry.add(info);
  }
  log(`Detected ${registry.components().length} components`);

  const graph = buildGraph(
    project,
    registry,
    sourceFiles,
    adapter.dynamicCallNames()
  );
  log(`Built ${graph.edges.length} edges`);

  const { prodRoots, testRoots } = collectRoots(
    registry,
    graph.dynamicTargets,
    (f) => adapter.isEntryFile(f)
  );

  // Project the AST-bearing registry into the serializable IR node list.
  const nodes: IRNode[] = registry.all().map((c) => ({
    id: c.id,
    name: c.name,
    file: c.file,
    line: c.line,
    kind: c.symbolKind,
    origin: c.kind,
    isDefaultExport: c.isDefaultExport,
  }));

  const usageSites: Record<string, UsageSite[]> = Object.fromEntries(
    graph.jsxSites
  );

  return {
    schemaVersion: 1,
    projectRoot: config.root,
    framework: adapter.name,
    nodes,
    edges: graph.edges,
    roots: { prod: [...prodRoots], test: [...testRoots] },
    usageSites,
  };
}

// ---------------------------------------------------------------------------
// ANALYZE layer (framework-agnostic): GraphIR -> ReportModel.
//
// Depends on nothing but the IR. Reachability, dead-code classification,
// structure metrics, and layout all live here and would run unchanged for any
// framework whose adapter emits a valid GraphIR.
// ---------------------------------------------------------------------------

/** Enrich a GraphIR into the full ReportModel consumed by the visualizer. */
export function analyzeIR(
  ir: GraphIR,
  options: Pick<AnalyzeOptions, "onProgress"> = {}
): ReportModel {
  const log = options.onProgress ?? (() => {});

  // Reported symbols: components, functions, and hooks. Plain `module` glue
  // (config/value consts) is excluded but still carries reachability below.
  const reportNodes = ir.nodes.filter((n) => REPORTED_KINDS.has(n.kind));
  const prodRoots = new Set(ir.roots.prod);
  const testRoots = new Set(ir.roots.test);

  const states = classify(reportNodes, ir.edges, prodRoots, testRoots);
  const usage = buildUsage(reportNodes, ir.usageSites, states);

  const components = reportNodes.map((c) => ({
    id: c.id,
    name: c.name,
    file: c.file,
    kind: c.origin,
    symbolKind: c.kind as ComponentNode["symbolKind"],
    isDefaultExport: c.isDefaultExport,
    line: c.line,
  }));

  // The raw graph has edges through unreported `module` glue (config objects,
  // value consts). Collapse those into direct symbol -> symbol edges so the
  // report graph contains only nodes that exist (cytoscape rejects edges to
  // unknown nodes).
  const reportedIds = new Set(components.map((c) => c.id));
  const reportEdges = collapseGlueEdges(ir.edges, reportedIds);

  const dead = usage.filter((u) => u.state === "dead").length;
  const deadInProd = usage.filter((u) => u.state === "dead-in-prod").length;

  // Derive architecture insights (degrees, roles, clusters, cycles, moves) from
  // the collapsed component graph.
  const structure = computeStructure(components, reportEdges, prodRoots);
  log(
    `Structure: ${structure.hubs.length} hubs, ${structure.cycles.length} cycles, ` +
      `${structure.suggestedMoves.length} move hints`
  );

  // Precompute deterministic layouts (directory / dependency-layers / cohesion-
  // clusters) so the report renders instantly (preset layout, no physics).
  const layouts = computeLayouts(components, usage, reportEdges, structure);

  return {
    projectRoot: ir.projectRoot,
    generatedAt: new Date().toISOString(),
    components,
    edges: reportEdges,
    usage,
    positions: layouts.directory,
    layouts,
    structure,
    stats: {
      totalComponents: components.length,
      dead,
      deadInProd,
    },
  };
}

/** Run the full pipeline against a target project and produce a ReportModel. */
export async function analyze(
  targetPath: string,
  options: AnalyzeOptions = {}
): Promise<ReportModel> {
  const ir = await extract(targetPath, options);
  return analyzeIR(ir, options);
}
