import type { ComponentInfo } from "../scan/components.js";
import type { ComponentRegistry } from "../scan/registry.js";

/**
 * Seed reachability roots: default exports of framework entry files (decided by
 * the adapter's `isEntryFile`) plus any component targeted by a dynamic import.
 * Framework-agnostic — the only framework knowledge is the injected predicate.
 */
export function collectRoots(
  registry: ComponentRegistry,
  dynamicTargets: Set<string>,
  isEntryFile: (relFile: string) => boolean
): { prodRoots: Set<string>; testRoots: Set<string> } {
  const prodRoots = new Set<string>(dynamicTargets);
  const testRoots = new Set<string>();

  const byFile = new Map<string, ComponentInfo[]>();
  for (const c of registry.components()) {
    const list = byFile.get(c.file) ?? [];
    list.push(c);
    byFile.set(c.file, list);
  }

  for (const [file, comps] of byFile) {
    // Test/story files are entry points for their runner — seed test roots.
    if (comps[0].kind !== "prod") {
      for (const c of comps) testRoots.add(c.id);
      continue;
    }
    if (!isEntryFile(file)) continue;
    const def = comps.find((c) => c.isDefaultExport);
    if (def) prodRoots.add(def.id);
    else for (const c of comps) prodRoots.add(c.id); // no clear default → seed all
  }

  return { prodRoots, testRoots };
}
