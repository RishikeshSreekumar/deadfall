// Shared builders for unit tests. Not a *.test.ts file, so the test runner does
// not execute it directly — it is only imported by the suites.
import type { IRNode, IROrigin } from "../src/ir/model.js";
import type {
  ComponentEdge,
  ComponentNode,
  EdgeKind,
} from "../src/report/model.js";

let counter = 0;

/** Minimal IRNode (a tracked declaration: component or glue "module"). */
export function irNode(
  name: string,
  opts: Partial<IRNode> = {}
): IRNode {
  const file = opts.file ?? `src/${name}.tsx`;
  return {
    id: opts.id ?? `${file}#${name}`,
    name,
    file,
    line: opts.line ?? ++counter,
    kind: opts.kind ?? "component",
    origin: (opts.origin ?? "prod") as IROrigin,
    isDefaultExport: opts.isDefaultExport ?? false,
    ...opts,
  };
}

/** Minimal ComponentNode for structure/layout units. */
export function compNode(
  name: string,
  file = `src/${name}.tsx`
): ComponentNode {
  return {
    id: `${file}#${name}`,
    name,
    file,
    kind: "prod",
    isDefaultExport: false,
    line: ++counter,
  };
}

/** Build a `${file}#${name}` id from a node-like or a raw name+file. */
export function id(name: string, file = `src/${name}.tsx`): string {
  return `${file}#${name}`;
}

/** Convenience edge builder. */
export function edge(
  from: string,
  to: string,
  kind: EdgeKind = "jsx"
): ComponentEdge {
  return { from, to, kind };
}
