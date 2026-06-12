import type { CheckIssue, Reporter } from "../types.js";

/**
 * Default terminal reporter: one `file:line Name` per issue, grouped by state,
 * with a one-line summary footer.
 */
export const compactReporter: Reporter = (result, ctx) => {
  const { colors } = ctx;
  const dead = result.issues.filter((i) => i.state === "dead");
  const deadInProd = result.issues.filter((i) => i.state === "dead-in-prod");

  const lines: string[] = [];
  const section = (title: string, paint: (s: string) => string, issues: CheckIssue[]) => {
    if (!issues.length) return;
    if (lines.length) lines.push("");
    lines.push(paint(colors.bold(`${title} (${issues.length})`)));
    for (const i of issues) {
      lines.push(`  ${i.file}:${i.line} ${colors.bold(i.name)}`);
    }
  };

  section("dead", colors.red, dead);
  section("dead-in-prod", colors.yellow, deadInProd);

  if (lines.length) lines.push("");
  const s = result.summary;
  const parts = [
    `${s.total} components`,
    `${s.dead} dead`,
    ...(s.deadInProd ? [`${s.deadInProd} dead-in-prod`] : []),
    ...(s.ignored ? [`${s.ignored} ignored`] : []),
    ...(s.baselined !== undefined ? [`${s.baselined} baselined`] : []),
  ];
  const successText =
    s.baselined !== undefined ? "✓ no new dead components" : "✓ no dead components";
  lines.push(
    result.issues.length
      ? colors.dim(parts.join(", "))
      : colors.green(successText) + colors.dim(` (${parts.join(", ")})`)
  );
  return lines.join("\n") + "\n";
};
