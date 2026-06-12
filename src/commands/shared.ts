import path from "node:path";
import { loadConfigFile, type LoadedConfig } from "../config/load.js";

/** Subset of commander's Command used for option-source introspection. */
export interface OptionSources {
  getOptionValueSource(key: string): string | undefined;
}

/** True when the user explicitly passed the flag (vs. commander's default). */
export function cliSet(cmd: OptionSources | undefined, key: string): boolean {
  return cmd?.getOptionValueSource(key) === "cli";
}

export interface ProjectContext {
  projectPath: string;
  loaded?: LoadedConfig;
}

/**
 * Resolve the analyzed project path: CLI argument > config `project` (relative
 * to the config file) > error. Also surfaces the loaded config for merging.
 */
export function resolveProjectContext(
  commandName: string,
  projectArg: string | undefined,
  configPath: string | undefined,
  cwd = process.cwd()
): ProjectContext {
  const loaded = loadConfigFile(cwd, configPath);
  const projectPath =
    projectArg ??
    (loaded?.config.project !== undefined
      ? path.resolve(loaded.dir, loaded.config.project)
      : undefined);
  if (!projectPath) {
    throw new Error(
      `No project path given (deadfall ${commandName} <project>) and no config file provides one`
    );
  }
  return { projectPath, loaded };
}
