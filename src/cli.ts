#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { analyze } from "./engine.js";
import { adapterNames } from "./adapters/index.js";

const program = new Command();

program
  .name("deadfall")
  .description("Map React/Next.js component usage and dead components.")
  .argument("<project>", "path to the target project")
  .option("-o, --out <file>", "output HTML report path", "deadfall.html")
  .option("-j, --json <file>", "also write the raw ReportModel JSON")
  .option("-r, --report <file>", "also write a Markdown structure report")
  .option(
    "-f, --framework <id>",
    `framework adapter (auto-detected if omitted): ${adapterNames().join(", ")}`
  )
  .option("--include-tests", "count usage in test/story files (off by default)", false)
  .action(async (project: string, opts) => {
    const { renderHtml } = await import("./report/html.js");
    const model = await analyze(project, {
      includeTests: Boolean(opts.includeTests),
      framework: opts.framework,
      onProgress: (m) => console.error(`• ${m}`),
    });

    const outPath = path.resolve(opts.out);
    writeFileSync(outPath, renderHtml(model), "utf8");

    if (opts.json) {
      writeFileSync(path.resolve(opts.json), JSON.stringify(model, null, 2), "utf8");
    }

    let reportPath: string | undefined;
    if (opts.report) {
      const { toStructureMarkdown } = await import("./report/structure-report.js");
      reportPath = path.resolve(opts.report);
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
  });

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
