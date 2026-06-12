/** Minimal ANSI color helpers — avoids a chalk dependency. */

export interface Colors {
  red(s: string): string;
  yellow(s: string): string;
  green(s: string): string;
  dim(s: string): string;
  bold(s: string): string;
}

const identity = (s: string) => s;

export const noColors: Colors = {
  red: identity,
  yellow: identity,
  green: identity,
  dim: identity,
  bold: identity,
};

function wrap(open: number, close: number) {
  return (s: string) => `[${open}m${s}[${close}m`;
}

export const ansiColors: Colors = {
  red: wrap(31, 39),
  yellow: wrap(33, 39),
  green: wrap(32, 39),
  dim: wrap(2, 22),
  bold: wrap(1, 22),
};

/** Pick colors for a stream, honoring NO_COLOR / FORCE_COLOR / TERM=dumb. */
export function createColors(
  stream: { isTTY?: boolean } = process.stdout,
  env: NodeJS.ProcessEnv = process.env
): Colors {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return noColors;
  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== "0") {
    return ansiColors;
  }
  if (!stream.isTTY || env.TERM === "dumb") return noColors;
  return ansiColors;
}
