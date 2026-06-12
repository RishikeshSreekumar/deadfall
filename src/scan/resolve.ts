import { Node, Project, SourceFile, Symbol as MorphSymbol, ts } from "ts-morph";
import { declKey, ComponentRegistry } from "./registry.js";
import type { ComponentInfo } from "./components.js";

/**
 * Resolve a module specifier string (e.g. from a dynamic `import('./Foo')`) to
 * its SourceFile, honoring tsconfig paths/baseUrl via the TS resolver.
 */
export function resolveModuleSpecifier(
  project: Project,
  fromFile: string,
  spec: string
): SourceFile | undefined {
  const result = ts.resolveModuleName(
    spec,
    fromFile,
    project.getCompilerOptions(),
    project.getModuleResolutionHost()
  );
  const resolved = result.resolvedModule?.resolvedFileName;
  if (!resolved) return undefined;
  return project.getSourceFile(resolved);
}

/**
 * Resolve an identifier (a JSX tag name or a referenced value) to the tracked
 * declaration it points at — a component or any glue declaration. Relies on the
 * TS checker: `getAliasedSymbol()` walks import and re-export (barrel) chains to
 * the original declaration, so `@/components` aliases and `export * from`
 * barrels resolve transparently.
 */
export function resolveToDecl(
  node: Node,
  registry: ComponentRegistry
): ComponentInfo | undefined {
  let symbol = node.getSymbol();
  if (!symbol) return undefined;
  symbol = unwrapAlias(symbol);

  for (const decl of symbol.getDeclarations()) {
    const hit = registry.byDeclKey(declKey(decl));
    if (hit) return hit;
  }

  // Fallback: match by defining file + exported name (covers default exports
  // whose declaration node differs from the one we indexed).
  const declared = symbol.getDeclarations()[0];
  if (declared) {
    const absFile = declared.getSourceFile().getFilePath();
    const hit = registry.byFileAndName(absFile, symbol.getName());
    if (hit) return hit;
  }
  return undefined;
}

function unwrapAlias(symbol: MorphSymbol): MorphSymbol {
  let current = symbol;
  // Follow alias chains (import -> re-export -> ... -> original).
  for (let i = 0; i < 16; i++) {
    const aliased = safeAliased(current);
    if (!aliased || aliased === current) break;
    current = aliased;
  }
  return current;
}

function safeAliased(symbol: MorphSymbol): MorphSymbol | undefined {
  try {
    return symbol.getAliasedSymbol();
  } catch {
    return undefined;
  }
}
