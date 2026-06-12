import type { GraphIR } from "../ir/model.js";
import type { ReportModel } from "../report/model.js";

export interface FixPlan {
  /** Files (relative paths) safe to delete: everything in them is dead. */
  deletions: string[];
  /** Files that contain dead components but failed a safety criterion. */
  skipped: Array<{ file: string; reason: string }>;
}

export interface PlanFixOptions {
  /** Adapter entry-file predicate — entry files are never deleted. */
  isEntryFile: (relPath: string) => boolean;
}

const REPORTED_KINDS = new Set(["component", "function", "hook"]);

/**
 * Decide which files are provably safe to delete: every reported symbol in the
 * file is `dead`, no glue is referenced from outside, nothing is ignored, and —
 * the load-bearing backstop — no other discovered file imports the file at all
 * (catches barrel re-exports, type-only and side-effect imports the symbol
 * graph does not track). Pure over the IR + model; the command applies it.
 */
export function planFix(
  ir: GraphIR,
  model: ReportModel,
  opts: PlanFixOptions
): FixPlan {
  const stateById = new Map(model.usage.map((u) => [u.id, u.state]));
  const ignoredIds = new Set(
    model.components.filter((c) => c.ignored).map((c) => c.id)
  );

  const nodesByFile = new Map<string, typeof ir.nodes>();
  for (const n of ir.nodes) {
    const list = nodesByFile.get(n.file) ?? [];
    list.push(n);
    nodesByFile.set(n.file, list);
  }
  const nodeFile = new Map(ir.nodes.map((n) => [n.id, n.file]));

  // Inverted file-import map: file -> files importing it.
  const importedBy = new Map<string, string[]>();
  for (const [from, targets] of Object.entries(ir.fileImports ?? {})) {
    for (const target of targets) {
      const list = importedBy.get(target) ?? [];
      list.push(from);
      importedBy.set(target, list);
    }
  }

  const plan: FixPlan = { deletions: [], skipped: [] };

  for (const [file, nodes] of nodesByFile) {
    const reported = nodes.filter((n) => REPORTED_KINDS.has(n.kind));
    const hasDead = reported.some((n) => stateById.get(n.id) === "dead");
    if (!hasDead) continue;

    const skip = (reason: string) => plan.skipped.push({ file, reason });

    if (opts.isEntryFile(file)) {
      skip("entry file");
      continue;
    }
    const notDead = reported.find((n) => stateById.get(n.id) !== "dead");
    if (notDead) {
      skip(
        `${notDead.name} is ${stateById.get(notDead.id) ?? "untracked"}`
      );
      continue;
    }
    if (nodes.some((n) => ignoredIds.has(n.id) || n.ignored)) {
      skip("contains deadfall-ignore'd declarations");
      continue;
    }
    const externalGlueEdge = ir.edges.find(
      (e) =>
        nodeFile.get(e.to) === file &&
        nodeFile.get(e.from) !== undefined &&
        nodeFile.get(e.from) !== file &&
        !REPORTED_KINDS.has(nodes.find((n) => n.id === e.to)?.kind ?? "")
    );
    if (externalGlueEdge) {
      skip(`glue referenced from ${nodeFile.get(externalGlueEdge.from)}`);
      continue;
    }
    const importers = importedBy.get(file) ?? [];
    if (importers.length) {
      skip(`imported by ${importers[0]}${importers.length > 1 ? ` (+${importers.length - 1} more)` : ""}`);
      continue;
    }
    const externalSite = nodes
      .flatMap((n) => ir.usageSites[n.id] ?? [])
      .find((s) => s.file !== file);
    if (externalSite) {
      skip(`used in ${externalSite.file}:${externalSite.line}`);
      continue;
    }

    plan.deletions.push(file);
  }

  plan.deletions.sort();
  plan.skipped.sort((a, b) => a.file.localeCompare(b.file));
  return plan;
}
