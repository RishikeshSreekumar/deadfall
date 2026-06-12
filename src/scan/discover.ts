import { globby } from "globby";
import path from "node:path";

const SOURCE_GLOBS = ["**/*.tsx", "**/*.jsx", "**/*.ts", "**/*.js"];

// Generic build-output / vendored dirs ignored for any framework. Framework-
// specific dirs (e.g. `.next`, `.svelte-kit`) are contributed by the adapter.
const IGNORE = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/out/**",
  "**/coverage/**",
  "**/*.d.ts",
];

// Test/story files are excluded by default: usage inside them does not count as
// real application usage, so a component rendered only by a test/story is dead.
const TEST_STORY_IGNORE = [
  "**/*.test.{ts,tsx,js,jsx}",
  "**/*.spec.{ts,tsx,js,jsx}",
  "**/*.stories.{ts,tsx,js,jsx}",
  "**/__tests__/**",
  "**/__mocks__/**",
];

export interface DiscoverOptions {
  /** Include test/story files as usage evidence (default false). */
  includeTests?: boolean;
  /** Framework-specific ignore globs contributed by the adapter. */
  extraIgnores?: string[];
}

/** Find all candidate source files under the project root (absolute paths). */
export async function discoverFiles(
  root: string,
  options: DiscoverOptions = {}
): Promise<string[]> {
  const ignore = [
    ...IGNORE,
    ...(options.extraIgnores ?? []),
    ...(options.includeTests ? [] : TEST_STORY_IGNORE),
  ];
  const matches = await globby(SOURCE_GLOBS, {
    cwd: root,
    ignore,
    absolute: true,
    gitignore: true,
  });
  return matches.map((p) => path.normalize(p));
}
