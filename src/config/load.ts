import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { CONFIG_KEYS, type UserConfig } from "./types.js";

export interface LoadedConfig {
  config: UserConfig;
  /** Absolute path of the file the config came from. */
  source: string;
  /** Directory `project` and other relative paths resolve against. */
  dir: string;
}

const LOOKUP_FILES = ["deadfall.json", "deadfall.config.json"];

/**
 * Locate and parse the user config: an explicit --config path, else
 * deadfall.json → deadfall.config.json → package.json `"deadfall"` key in cwd.
 * Returns undefined when no config exists. Invalid configs throw (exit 2).
 */
export function loadConfigFile(
  cwd: string,
  explicitPath?: string
): LoadedConfig | undefined {
  if (explicitPath) {
    const abs = path.resolve(cwd, explicitPath);
    if (!existsSync(abs)) {
      throw new Error(`Config file not found: ${abs}`);
    }
    return { config: parseConfig(abs, readJson(abs)), source: abs, dir: path.dirname(abs) };
  }

  for (const name of LOOKUP_FILES) {
    const abs = path.join(cwd, name);
    if (existsSync(abs)) {
      return { config: parseConfig(abs, readJson(abs)), source: abs, dir: cwd };
    }
  }

  const pkgPath = path.join(cwd, "package.json");
  if (existsSync(pkgPath)) {
    const pkg = readJson(pkgPath);
    if (pkg && typeof pkg === "object" && "deadfall" in pkg) {
      const section = (pkg as Record<string, unknown>).deadfall;
      return {
        config: parseConfig(`${pkgPath}#deadfall`, section),
        source: pkgPath,
        dir: cwd,
      };
    }
  }

  return undefined;
}

function readJson(file: string): unknown {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (err) {
    throw new Error(`Cannot read config file ${file}: ${(err as Error).message}`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Invalid JSON in ${file}: ${(err as Error).message}`);
  }
}

function fail(source: string, field: string, expected: string, got: unknown): never {
  throw new Error(
    `Invalid config in ${source}: "${field}" must be ${expected}, got ${JSON.stringify(got)}`
  );
}

function parseConfig(source: string, raw: unknown): UserConfig {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Invalid config in ${source}: expected a JSON object`);
  }
  const obj = raw as Record<string, unknown>;
  const config: UserConfig = {};

  const knownKeys = new Set<string>(CONFIG_KEYS);
  for (const key of Object.keys(obj)) {
    if (!knownKeys.has(key)) {
      console.error(`⚠ ${source}: unknown config key "${key}" ignored`);
    }
  }

  const str = (field: keyof UserConfig) => {
    const v = obj[field];
    if (v === undefined) return undefined;
    if (typeof v !== "string") fail(source, field, "a string", v);
    return v;
  };
  const strArray = (field: keyof UserConfig) => {
    const v = obj[field];
    if (v === undefined) return undefined;
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
      fail(source, field, "an array of strings", v);
    }
    return v as string[];
  };

  config.project = str("project");
  config.framework = str("framework");
  config.reporter = str("reporter");
  config.baseline = str("baseline");
  config.out = str("out");
  config.json = str("json");
  config.report = str("report");
  config.ignore = strArray("ignore");
  config.ignoreComponents = strArray("ignoreComponents");

  if (obj.includeTests !== undefined) {
    if (typeof obj.includeTests !== "boolean") {
      fail(source, "includeTests", "a boolean", obj.includeTests);
    }
    config.includeTests = obj.includeTests;
  }
  if (obj.maxDead !== undefined) {
    if (
      typeof obj.maxDead !== "number" ||
      !Number.isInteger(obj.maxDead) ||
      obj.maxDead < 0
    ) {
      fail(source, "maxDead", "a non-negative integer", obj.maxDead);
    }
    config.maxDead = obj.maxDead;
  }

  return config;
}
