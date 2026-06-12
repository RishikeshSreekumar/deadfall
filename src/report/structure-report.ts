import type { ComponentMetrics, ReportModel } from "./model.js";

/**
 * Render the architecture insights as a Markdown summary suitable for a PR
 * comment or CI artifact: headline stats, the most depended-on hubs, dependency
 * cycles, and restructuring (move) suggestions.
 */
export function toStructureMarkdown(model: ReportModel): string {
  const { structure, stats } = model;
  const nameById = new Map(model.components.map((c) => [c.id, c.name]));
  const fileById = new Map(model.components.map((c) => [c.id, c.file]));
  const metricById = new Map<string, ComponentMetrics>(
    structure.metrics.map((m) => [m.id, m])
  );
  const label = (id: string) => nameById.get(id) ?? id;

  const lines: string[] = [];
  lines.push("# Component structure report");
  lines.push("");
  lines.push(`- Project: \`${model.projectRoot}\``);
  lines.push(`- Generated: ${model.generatedAt}`);
  lines.push("");
  lines.push("## Overview");
  lines.push("");
  lines.push("| metric | value |");
  lines.push("| --- | ---: |");
  lines.push(`| components | ${stats.totalComponents} |`);
  lines.push(`| dead | ${stats.dead} |`);
  lines.push(`| dead-in-prod | ${stats.deadInProd} |`);
  lines.push(`| cross-directory edges | ${structure.crossDirEdges} |`);
  lines.push(`| cohesion clusters | ${structure.clusters.length} |`);
  lines.push(`| dependency cycles | ${structure.cycles.length} |`);
  lines.push(`| move suggestions | ${structure.suggestedMoves.length} |`);
  lines.push("");

  // ---- hubs ----
  lines.push("## Hubs (most depended-on)");
  lines.push("");
  if (structure.hubs.length === 0) {
    lines.push("_None — no component crosses the hub threshold._");
  } else {
    lines.push("| component | fan-in | fan-out | file |");
    lines.push("| --- | ---: | ---: | --- |");
    for (const id of structure.hubs.slice(0, 20)) {
      const m = metricById.get(id);
      lines.push(
        `| ${label(id)} | ${m?.fanIn ?? 0} | ${m?.fanOut ?? 0} | \`${fileById.get(id) ?? ""}\` |`
      );
    }
  }
  lines.push("");

  // ---- cycles ----
  lines.push("## Dependency cycles");
  lines.push("");
  if (structure.cycles.length === 0) {
    lines.push("_None — the component graph is acyclic. 🎉_");
  } else {
    for (const cyc of structure.cycles) {
      lines.push(`- ${cyc.map(label).join(" → ")} → ${label(cyc[0])}`);
    }
  }
  lines.push("");

  // ---- suggested moves ----
  lines.push("## Suggested moves");
  lines.push("");
  if (structure.suggestedMoves.length === 0) {
    lines.push("_None — components sit with their dependents._");
  } else {
    lines.push("| component | from | to | dependents in target |");
    lines.push("| --- | --- | --- | ---: |");
    for (const mv of structure.suggestedMoves) {
      const inTarget = Math.round(mv.share * mv.dependents);
      lines.push(
        `| ${label(mv.id)} | \`${mv.fromDir}\` | \`${mv.toDir}\` | ${inTarget}/${mv.dependents} (${Math.round(mv.share * 100)}%) |`
      );
    }
  }
  lines.push("");

  // ---- clusters ----
  lines.push("## Cohesion clusters");
  lines.push("");
  if (structure.clusters.length === 0) {
    lines.push("_No multi-member clusters found._");
  } else {
    lines.push("| cluster | size | cohesion | directories |");
    lines.push("| --- | ---: | ---: | --- |");
    for (const c of structure.clusters.slice(0, 20)) {
      lines.push(
        `| ${c.label} | ${c.members.length} | ${Math.round(c.cohesion * 100)}% | ${c.dirs
          .slice(0, 3)
          .map((d) => `\`${d}\``)
          .join(", ")} |`
      );
    }
  }
  lines.push("");

  return lines.join("\n");
}
