import type { Reporter } from "../types.js";

/** Markdown table for PR comments / CI artifacts. */
export const markdownReporter: Reporter = (result) => {
  const s = result.summary;
  const lines: string[] = ["## deadfall check", ""];

  if (!result.issues.length) {
    lines.push(`No dead components found (${s.total} analyzed).`);
    return lines.join("\n") + "\n";
  }

  lines.push(
    `${result.issues.length} issue(s) across ${s.total} components` +
      (s.ignored ? `, ${s.ignored} ignored` : "") +
      (s.baselined !== undefined ? `, ${s.baselined} baselined` : "") +
      ".",
    "",
    "| Component | File | State |",
    "| --- | --- | --- |"
  );
  for (const i of result.issues) {
    lines.push(`| \`${i.name}\` | \`${i.file}:${i.line}\` | ${i.state} |`);
  }
  return lines.join("\n") + "\n";
};
