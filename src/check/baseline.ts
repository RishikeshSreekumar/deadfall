import { readFileSync } from "node:fs";
import type { CheckIssue, CheckResult } from "./types.js";

/**
 * Baseline snapshot of known issues, keyed by component id. Lets legacy
 * codebases adopt `check` incrementally: only NEW issues fail CI. Ids are
 * `relPath#name`, so moving/renaming a file re-flags its components — accepted
 * and documented.
 */
export interface Baseline {
  version: 1;
  generatedAt: string;
  issues: Record<string, CheckIssue["state"]>;
}

export function readBaseline(path: string): Baseline {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new Error(
      `Baseline file not found: ${path} (create it with --update-baseline)`
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new Error(`Invalid JSON in baseline ${path}: ${(err as Error).message}`);
  }
  if (
    raw === null ||
    typeof raw !== "object" ||
    (raw as Baseline).version !== 1 ||
    typeof (raw as Baseline).issues !== "object"
  ) {
    throw new Error(`Unrecognized baseline format in ${path} (expected version 1)`);
  }
  return raw as Baseline;
}

/** Is this issue new relative to the baseline? Absent, or escalated from
 * dead-in-prod to dead (strictly worse), counts as new. */
function isNew(issue: CheckIssue, baseline: Baseline): boolean {
  const known = baseline.issues[issue.id];
  if (known === undefined) return true;
  return known === "dead-in-prod" && issue.state === "dead";
}

/** Filter the result down to issues not covered by the baseline. */
export function diffBaseline(result: CheckResult, baseline: Baseline): CheckResult {
  const fresh = result.issues.filter((i) => isNew(i, baseline));
  return {
    ...result,
    issues: fresh,
    summary: {
      ...result.summary,
      baselined: result.issues.length - fresh.length,
    },
  };
}

/** Serialize the full current issue set as a stable, diff-friendly baseline. */
export function serializeBaseline(result: CheckResult): string {
  const issues: Record<string, CheckIssue["state"]> = {};
  for (const i of [...result.issues].sort((a, b) => a.id.localeCompare(b.id))) {
    issues[i.id] = i.state;
  }
  const baseline: Baseline = {
    version: 1,
    generatedAt: result.generatedAt,
    issues,
  };
  return JSON.stringify(baseline, null, 2) + "\n";
}
