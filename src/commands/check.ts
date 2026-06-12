import { writeFileSync } from "node:fs";
import path from "node:path";
import { extract, analyzeIR } from "../engine.js";
import { selectAdapter } from "../adapters/index.js";
import { buildCheckResult } from "../check/result.js";
import { createColors } from "../check/colors.js";
import { selectReporter } from "../check/reporters/index.js";
import { readBaseline, diffBaseline, serializeBaseline } from "../check/baseline.js";
import { planFix } from "../fix/plan.js";
import { assertCleanGitTree, applyFix } from "../fix/apply.js";
import { mergeOption, mergeArrayOption } from "../config/types.js";
import { cliSet, resolveProjectContext, type OptionSources } from "./shared.js";
import type { CheckResult } from "../check/types.js";

export interface CheckCliOptions {
  reporter: string;
  maxDead?: string;
  framework?: string;
  includeTests?: boolean;
  ignore?: string[];
  ignoreComponents?: string[];
  config?: string;
  baseline?: string;
  updateBaseline?: boolean;
  fix?: boolean;
  fixDryRun?: boolean;
  allowDirty?: boolean;
}

function parseMaxDead(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`--max-dead must be a non-negative integer, got "${raw}"`);
  }
  return n;
}

/**
 * Terminal-first dead-component audit. Prints issues to stdout (progress and
 * notes stay on stderr so stdout is pipeable) and sets the exit code:
 * 0 = clean (or within --max-dead), 1 = issues found. Runtime/config errors
 * throw and exit 2 via the CLI-level handler.
 */
export async function runCheck(
  project: string | undefined,
  opts: CheckCliOptions,
  cmd?: OptionSources
): Promise<void> {
  const { projectPath, loaded } = resolveProjectContext(
    "check",
    project,
    opts.config
  );
  const file = loaded?.config ?? {};

  const reporterName = mergeOption(
    opts.reporter,
    cliSet(cmd, "reporter"),
    file.reporter,
    "compact"
  );
  const reporter = selectReporter(reporterName);
  const maxDead = mergeOption(
    parseMaxDead(opts.maxDead),
    cliSet(cmd, "maxDead"),
    file.maxDead,
    0
  );
  const framework = mergeOption(
    opts.framework,
    cliSet(cmd, "framework"),
    file.framework,
    undefined as string | undefined
  );

  const analyzeOptions = {
    includeTests: mergeOption(
      opts.includeTests,
      cliSet(cmd, "includeTests"),
      file.includeTests,
      false
    ),
    framework,
    ignore: mergeArrayOption(opts.ignore, file.ignore),
    ignoreComponents: mergeArrayOption(opts.ignoreComponents, file.ignoreComponents),
    onProgress: (m: string) => console.error(`• ${m}`),
  };

  const ir = await extract(projectPath, analyzeOptions);
  const model = analyzeIR(ir, analyzeOptions);
  let result = buildCheckResult(model);

  const baselinePath = mergeOption(
    opts.baseline,
    cliSet(cmd, "baseline"),
    file.baseline,
    undefined as string | undefined
  );

  if (opts.updateBaseline) {
    if (!baselinePath) {
      throw new Error("--update-baseline requires --baseline <file> (or config `baseline`)");
    }
    const abs = path.resolve(baselinePath);
    writeFileSync(abs, serializeBaseline(result), "utf8");
    console.error(`• Baseline written: ${abs} (${result.issues.length} issues recorded)`);
    return;
  }

  if (baselinePath) {
    const baseline = readBaseline(path.resolve(baselinePath));
    result = diffBaseline(result, baseline);
  }

  if (opts.fix || opts.fixDryRun) {
    result = runFix(ir, model, result, {
      framework,
      apply: Boolean(opts.fix),
      allowDirty: Boolean(opts.allowDirty),
    });
  }

  process.stdout.write(
    reporter(result, { colors: createColors(), cwd: process.cwd() })
  );

  if (result.issues.length > maxDead) {
    process.exitCode = 1;
  }
}

function runFix(
  ir: Parameters<typeof planFix>[0],
  model: Parameters<typeof planFix>[1],
  result: CheckResult,
  opts: { framework?: string; apply: boolean; allowDirty: boolean }
): CheckResult {
  const { adapter } = selectAdapter(ir.projectRoot, opts.framework);
  const plan = planFix(ir, model, { isEntryFile: (f) => adapter.isEntryFile(f) });

  for (const { file, reason } of plan.skipped) {
    console.error(`• skip ${file} — ${reason}`);
  }

  if (!opts.apply) {
    if (plan.deletions.length) {
      console.error(`• would delete ${plan.deletions.length} file(s) (--fix to apply):`);
      for (const f of plan.deletions) console.error(`    ${f}`);
    } else {
      console.error("• nothing safe to delete");
    }
    return result;
  }

  if (!opts.allowDirty) assertCleanGitTree(ir.projectRoot);
  const deleted = applyFix(plan, ir.projectRoot);
  const deletedSet = new Set(deleted);
  const remaining = result.issues.filter((i) => !deletedSet.has(i.file));
  console.error(
    `• deleted ${deleted.length} file(s); ${remaining.length} dead component issue(s) remain (manual cleanup)`
  );
  for (const f of deleted) console.error(`    ✗ ${f}`);
  return { ...result, issues: remaining };
}
