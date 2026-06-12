import type { Reporter } from "../types.js";

/** GitHub Actions workflow annotations: one ::warning per issue. */
export const githubReporter: Reporter = (result) => {
  const lines = result.issues.map(
    (i) =>
      `::warning file=${i.file},line=${i.line},title=deadfall::` +
      `${i.state === "dead" ? "Dead component" : "Component only used by tests"} ${i.name}`
  );
  return lines.length ? lines.join("\n") + "\n" : "";
};
