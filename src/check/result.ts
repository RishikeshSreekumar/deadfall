import type { ComponentNode, ReportModel } from "../report/model.js";
import type { CheckIssue, CheckResult } from "./types.js";

/**
 * Project a ReportModel into the flat issue list `deadfall check` reports:
 * every component classified `dead` or `dead-in-prod`, sorted by file then
 * line for stable output.
 */
export function buildCheckResult(model: ReportModel): CheckResult {
  const byId = new Map<string, ComponentNode>(
    model.components.map((c) => [c.id, c])
  );

  const issues: CheckIssue[] = [];
  for (const u of model.usage) {
    if (u.state === "used") continue;
    const node = byId.get(u.id);
    if (!node) continue;
    issues.push({
      id: node.id,
      name: node.name,
      file: node.file,
      line: node.line,
      state: u.state,
    });
  }
  issues.sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line
  );

  return {
    projectRoot: model.projectRoot,
    generatedAt: model.generatedAt,
    issues,
    summary: {
      total: model.stats.totalComponents,
      dead: model.stats.dead,
      deadInProd: model.stats.deadInProd,
      ignored: model.stats.ignored ?? 0,
    },
  };
}
