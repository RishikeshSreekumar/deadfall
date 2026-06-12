import type {
  ComponentUsage,
  DeadState,
  UsageSite,
} from "../report/model.js";
import type { IRNode } from "../ir/model.js";

function siteIsProd(file: string): boolean {
  if (/\.(test|spec)\.[jt]sx?$/.test(file) || /__tests__/.test(file)) {
    return false;
  }
  return !/\.stories\.[jt]sx?$/.test(file);
}

/** Combine JSX usage sites with dead-state classification per component. */
export function buildUsage(
  components: IRNode[],
  usageSites: Record<string, UsageSite[]>,
  states: Map<string, DeadState>
): ComponentUsage[] {
  return components.map((c) => {
    const sites = usageSites[c.id] ?? [];
    let prodCount = 0;
    let testCount = 0;
    for (const s of sites) {
      if (siteIsProd(s.file)) prodCount++;
      else testCount++;
    }
    return {
      id: c.id,
      prodCount,
      testCount,
      state: states.get(c.id) ?? "dead",
      sites,
    };
  });
}
