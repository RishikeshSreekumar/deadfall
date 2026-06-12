import type { DeadState } from "../report/model.js";
import type { Colors } from "./colors.js";

/** A single dead / dead-in-prod finding surfaced by `deadfall check`. */
export interface CheckIssue {
  /** Stable component id: `${relativeFilePath}#${name}`. */
  id: string;
  name: string;
  file: string;
  line: number;
  state: Exclude<DeadState, "used">;
}

export interface CheckSummary {
  /** Total reported components analyzed. */
  total: number;
  dead: number;
  deadInProd: number;
  /** Components skipped via directive or ignoreComponents patterns. */
  ignored: number;
  /** Issues already present in the baseline (when --baseline is used). */
  baselined?: number;
}

export interface CheckResult {
  projectRoot: string;
  generatedAt: string;
  issues: CheckIssue[];
  summary: CheckSummary;
}

export interface ReporterContext {
  colors: Colors;
  cwd: string;
}

/** Pure formatter: CheckResult -> string written to stdout. */
export type Reporter = (result: CheckResult, ctx: ReporterContext) => string;
