#!/usr/bin/env node
import { Command } from "commander";
import { adapterNames } from "./adapters/index.js";
import { runReport } from "./commands/report.js";
import { runCheck } from "./commands/check.js";
import { reporterNames } from "./check/reporters/index.js";

const program = new Command();

program
  .name("deadfall")
  .description("Map React/Next.js component usage and dead components.");

const frameworkHelp = `framework adapter (auto-detected if omitted): ${adapterNames().join(", ")}`;
const collect = (value: string, previous: string[]) => [...previous, value];

program
  .command("check [project]")
  .description("list dead components and exit non-zero when any are found")
  .option(
    "--reporter <name>",
    `output format: ${reporterNames().join(", ")}`,
    "compact"
  )
  .option("--max-dead <n>", "tolerate up to <n> issues before failing")
  .option("--ignore <glob>", "extra file ignore glob (repeatable)", collect, [])
  .option(
    "--ignore-components <pattern>",
    "component name pattern to keep alive (repeatable, * and ? wildcards)",
    collect,
    []
  )
  .option("--baseline <file>", "only fail on issues not present in this baseline")
  .option("--update-baseline", "write the current issues to the baseline file and exit")
  .option("--fix", "delete files whose every declaration is dead (needs a clean git tree)")
  .option("--fix-dry-run", "show what --fix would delete without deleting")
  .option("--allow-dirty", "let --fix run without a clean git tree")
  .option("-c, --config <path>", "explicit config file path")
  .option("-f, --framework <id>", frameworkHelp)
  .option("--include-tests", "count usage in test/story files (off by default)")
  .action(runCheck);

program
  .command("report [project]", { isDefault: true })
  .description("write the interactive HTML report (default command)")
  .option("-o, --out <file>", "output HTML report path", "deadfall.html")
  .option("-j, --json <file>", "also write the raw ReportModel JSON")
  .option("-r, --report <file>", "also write a Markdown structure report")
  .option("--ignore <glob>", "extra file ignore glob (repeatable)", collect, [])
  .option("-c, --config <path>", "explicit config file path")
  .option("-f, --framework <id>", frameworkHelp)
  .option("--include-tests", "count usage in test/story files (off by default)")
  .action(runReport);

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(2);
});
