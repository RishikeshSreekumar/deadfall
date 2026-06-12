// Adapter registry: maps framework ids to adapters and auto-detects which one
// fits a project. To register a new framework, implement FrameworkAdapter and
// add it to ADAPTERS — nothing else changes.

import { nextAppAdapter } from "./next-app.js";
import type { FrameworkAdapter } from "./types.js";

/** All known adapters, in detection-priority order (most specific first). */
export const ADAPTERS: FrameworkAdapter[] = [nextAppAdapter];

/** The fallback used when nothing detects (most general adapter). */
export const DEFAULT_ADAPTER = nextAppAdapter;

/** Adapter ids available for `--framework`. */
export function adapterNames(): string[] {
  return ADAPTERS.map((a) => a.name);
}

/** Look up an adapter by its `name`, or undefined if unknown. */
export function getAdapter(name: string): FrameworkAdapter | undefined {
  return ADAPTERS.find((a) => a.name === name);
}

/**
 * Pick an adapter for a project root. An explicit `name` wins (throws if it is
 * not a known id); otherwise the first adapter whose `detect()` matches; else
 * the default. Returns the chosen adapter and how it was chosen.
 */
export function selectAdapter(
  root: string,
  name?: string
): { adapter: FrameworkAdapter; reason: "explicit" | "detected" | "default" } {
  if (name) {
    const adapter = getAdapter(name);
    if (!adapter) {
      throw new Error(
        `Unknown framework "${name}". Known: ${adapterNames().join(", ")}`
      );
    }
    return { adapter, reason: "explicit" };
  }
  const detected = ADAPTERS.find((a) => a.detect(root));
  if (detected) return { adapter: detected, reason: "detected" };
  return { adapter: DEFAULT_ADAPTER, reason: "default" };
}

export type { FrameworkAdapter } from "./types.js";
