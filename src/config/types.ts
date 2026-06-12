/** User-facing config file shape (deadfall.json / package.json#deadfall). */
export interface UserConfig {
  /** Path to the analyzed project, relative to the config file's directory. */
  project?: string;
  /** Framework adapter id (e.g. "next-app"); auto-detected when omitted. */
  framework?: string;
  /** Count usage in test/story files. */
  includeTests?: boolean;
  /** Extra file ignore globs (merged with built-in + adapter ignores). */
  ignore?: string[];
  /** Component name patterns to keep alive (`*` and `?` wildcards). */
  ignoreComponents?: string[];
  /** `check`: tolerate up to this many issues before exiting 1. */
  maxDead?: number;
  /** `check`: default reporter name. */
  reporter?: string;
  /** `check`: default baseline file path. */
  baseline?: string;
  /** `report`: output HTML path. */
  out?: string;
  /** `report`: ReportModel JSON output path. */
  json?: string;
  /** `report`: Markdown structure report output path. */
  report?: string;
}

export const CONFIG_KEYS: ReadonlyArray<keyof UserConfig> = [
  "project",
  "framework",
  "includeTests",
  "ignore",
  "ignoreComponents",
  "maxDead",
  "reporter",
  "baseline",
  "out",
  "json",
  "report",
];

/**
 * Merge one option three ways: CLI flag (when the user actually passed it) >
 * config file > built-in default. `cliSet` must come from commander's
 * getOptionValueSource() so a flag's default value never shadows the config.
 */
export function mergeOption<T>(
  cliValue: T | undefined,
  cliSet: boolean,
  fileValue: T | undefined,
  fallback: T
): T {
  if (cliSet && cliValue !== undefined) return cliValue;
  if (fileValue !== undefined) return fileValue;
  if (cliValue !== undefined) return cliValue; // commander default
  return fallback;
}

/** Array options are additive: CLI values concatenate onto config values. */
export function mergeArrayOption(
  cliValue: string[] | undefined,
  fileValue: string[] | undefined
): string[] {
  return [...(fileValue ?? []), ...(cliValue ?? [])];
}
