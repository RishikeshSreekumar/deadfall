import { writeFileSync } from "node:fs";
import path from "node:path";
import { analyze } from "../engine.js";
import { mergeOption, mergeArrayOption } from "../config/types.js";
import { cliSet, resolveProjectContext, type OptionSources } from "./shared.js";

export interface ReportCliOptions {
  out: string;
  json?: string;
  report?: string;
  framework?: string;
  includeTests?: boolean;
  ignore?: string[];
  config?: string;
}

export async function runReport(
  project: string | undefined,
  opts: ReportCliOptions,
  cmd?: OptionSources
): Promise<void> {
  const { projectPath, loaded } = resolveProjectContext(
    "report",
    project,
    opts.config
  );
  const file = loaded?.config ?? {};

  const { renderHtml } = await import("../report/html.js");
  const model = await analyze(projectPath, {
    includeTests: mergeOption(
      opts.includeTests,
      cliSet(cmd, "includeTests"),
      file.includeTests,
      false
    ),
    framework: mergeOption(
      opts.framework,
      cliSet(cmd, "framework"),
      file.framework,
      undefined as string | undefined
    ),
    ignore: mergeArrayOption(opts.ignore, file.ignore),
    ignoreComponents: file.ignoreComponents ?? [],
    onProgress: (m) => console.error(`• ${m}`),
  });

  const out = mergeOption(opts.out, cliSet(cmd, "out"), file.out, "deadfall.html");
  const outPath = path.resolve(out);
  writeFileSync(outPath, renderHtml(model), "utf8");

  const jsonOut = mergeOption(opts.json, cliSet(cmd, "json"), file.json, undefined as string | undefined);
  if (jsonOut) {
    writeFileSync(path.resolve(jsonOut), JSON.stringify(model, null, 2), "utf8");
  }

  let reportPath: string | undefined;
  const mdOut = mergeOption(opts.report, cliSet(cmd, "report"), file.report, undefined as string | undefined);
  if (mdOut) {
    const { toStructureMarkdown } = await import("../report/structure-report.js");
    reportPath = path.resolve(mdOut);
    writeFileSync(reportPath, toStructureMarkdown(model), "utf8");
  }

  const { totalComponents, dead, deadInProd } = model.stats;
  const { hubs, cycles, suggestedMoves, crossDirEdges } = model.structure;
  console.error("");
  console.error(`  components       ${totalComponents}`);
  console.error(`  dead             ${dead}`);
  console.error(`  dead-in-prod     ${deadInProd}`);
  console.error(`  hubs             ${hubs.length}`);
  console.error(`  cycles           ${cycles.length}`);
  console.error(`  move hints       ${suggestedMoves.length}`);
  console.error(`  cross-dir edges  ${crossDirEdges}`);
  console.error("");
  console.error(`  report → ${outPath}`);
  if (reportPath) console.error(`  structure → ${reportPath}`);
}
