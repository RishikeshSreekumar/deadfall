import { existsSync } from "node:fs";
import path from "node:path";
import type { FrameworkAdapter } from "./types.js";

// App Router (and a few Pages Router) special files are file-system entry points
// with no incoming import — they must be seeded as graph roots.
const ENTRY_BASENAMES = new Set([
  "page",
  "layout",
  "template",
  "loading",
  "error",
  "not-found",
  "global-error",
  "default",
  "route",
  "middleware",
  "instrumentation",
  "_app",
  "_document",
]);

function basename(file: string): string {
  const last = file.split("/").pop() ?? file;
  return last.replace(/\.[jt]sx?$/, "");
}

/** Next.js App Router (+ a bit of Pages Router) extraction rules. */
export const nextAppAdapter: FrameworkAdapter = {
  name: "next-app",

  detect(root) {
    return (
      existsSync(path.join(root, "next.config.js")) ||
      existsSync(path.join(root, "next.config.mjs")) ||
      existsSync(path.join(root, "next.config.ts")) ||
      existsSync(path.join(root, "app")) ||
      existsSync(path.join(root, "src", "app")) ||
      existsSync(path.join(root, "pages")) ||
      existsSync(path.join(root, "src", "pages"))
    );
  },

  ignoreGlobs() {
    return ["**/.next/**"];
  },

  isEntryFile(relFile) {
    const base = basename(relFile);
    if (ENTRY_BASENAMES.has(base)) return true;
    // Any file directly under a `pages/` dir is a route entry.
    return /(^|\/)pages\//.test(relFile);
  },

  dynamicCallNames() {
    return new Set(["dynamic", "lazy"]);
  },
};
