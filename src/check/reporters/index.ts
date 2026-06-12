import type { Reporter } from "../types.js";
import { compactReporter } from "./compact.js";
import { jsonReporter } from "./json.js";
import { markdownReporter } from "./markdown.js";
import { githubReporter } from "./github.js";

export const reporters: Record<string, Reporter> = {
  compact: compactReporter,
  json: jsonReporter,
  markdown: markdownReporter,
  github: githubReporter,
};

export function reporterNames(): string[] {
  return Object.keys(reporters);
}

export function selectReporter(name: string): Reporter {
  const reporter = reporters[name];
  if (!reporter) {
    throw new Error(
      `Unknown reporter "${name}" (available: ${reporterNames().join(", ")})`
    );
  }
  return reporter;
}
