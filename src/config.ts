import { existsSync } from "node:fs";
import path from "node:path";
import { Project } from "ts-morph";

export interface ScanConfig {
  /** Absolute path to the target Next.js project root. */
  root: string;
  /** Absolute path to the project's tsconfig, if found. */
  tsConfigPath?: string;
}

/**
 * Build a ts-morph Project for the target repo. ts-morph reads the project's
 * tsconfig directly, so `compilerOptions.paths` + `baseUrl` aliases resolve for
 * free. Falls back to a permissive in-memory config when no tsconfig exists.
 */
export function createProject(config: ScanConfig): Project {
  if (config.tsConfigPath) {
    return new Project({
      tsConfigFilePath: config.tsConfigPath,
      // We add source files ourselves so we control the glob (skip .next, etc.).
      skipAddingFilesFromTsConfig: true,
    });
  }
  return new Project({
    compilerOptions: {
      allowJs: true,
      jsx: 4 /* ts.JsxEmit.ReactJSX */,
      baseUrl: config.root,
    },
  });
}

export function resolveConfig(targetPath: string): ScanConfig {
  const root = path.resolve(targetPath);
  if (!existsSync(root)) {
    throw new Error(`Target project path does not exist: ${root}`);
  }
  const tsConfigPath = path.join(root, "tsconfig.json");
  return {
    root,
    tsConfigPath: existsSync(tsConfigPath) ? tsConfigPath : undefined,
  };
}
