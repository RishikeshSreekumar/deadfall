import type { Reporter } from "../types.js";

/** Machine-readable output for piping (jq, CI scripts). No color, ever. */
export const jsonReporter: Reporter = (result) => {
  const pick = (state: "dead" | "dead-in-prod") =>
    result.issues
      .filter((i) => i.state === state)
      .map(({ id, name, file, line }) => ({ id, name, file, line }));

  return (
    JSON.stringify(
      {
        projectRoot: result.projectRoot,
        generatedAt: result.generatedAt,
        dead: pick("dead"),
        deadInProd: pick("dead-in-prod"),
        counts: result.summary,
      },
      null,
      2
    ) + "\n"
  );
};
