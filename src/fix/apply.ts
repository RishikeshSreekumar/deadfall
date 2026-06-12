import { realpathSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { FixPlan } from "./plan.js";

/**
 * Refuse to delete files unless the project sits in a git repo with a clean
 * working tree, so every deletion is one `git checkout` away from undo.
 * Not-a-repo counts as unclean (nothing to restore from).
 */
export function assertCleanGitTree(projectRoot: string): void {
  const res = spawnSync("git", ["status", "--porcelain"], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  if (res.status !== 0) {
    throw new Error(
      "--fix requires a git repository to make deletions recoverable " +
        "(pass --allow-dirty to override)"
    );
  }
  if (res.stdout.trim() !== "") {
    throw new Error(
      "--fix requires a clean git working tree so deletions are recoverable " +
        "(commit/stash first, or pass --allow-dirty)"
    );
  }
}

/** Delete the planned files. Returns the deleted relative paths. */
export function applyFix(plan: FixPlan, projectRoot: string): string[] {
  const rootReal = realpathSync(projectRoot);
  const deleted: string[] = [];
  for (const rel of plan.deletions) {
    const abs = path.resolve(projectRoot, rel);
    const real = realpathSync(abs);
    if (!real.startsWith(rootReal + path.sep)) {
      throw new Error(`refusing to delete ${rel}: resolves outside the project root`);
    }
    if (!statSync(real).isFile()) {
      throw new Error(`refusing to delete ${rel}: not a regular file`);
    }
    rmSync(real);
    deleted.push(rel);
  }
  return deleted;
}
