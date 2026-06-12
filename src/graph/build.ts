import path from "node:path";
import { Node, Project, SourceFile, SyntaxKind } from "ts-morph";
import type { ComponentEdge, UsageSite } from "../report/model.js";
import { ComponentRegistry, declKey } from "../scan/registry.js";
import { resolveModuleSpecifier, resolveToDecl } from "../scan/resolve.js";

export interface Graph {
  edges: ComponentEdge[];
  /** componentId -> JSX usage sites (one per `<Tag/>` occurrence). */
  jsxSites: Map<string, UsageSite[]>;
  /** Components targeted by a dynamic import — treated as reachability roots. */
  dynamicTargets: Set<string>;
}

/**
 * Build the dependency graph over *all* tracked declarations (components plus
 * config/hook/helper glue). Edges flow `owner -> target` for JSX usage, dynamic
 * imports, and plain value references, so a component referenced only inside a
 * config object or hook is still reachable from whatever imports that config.
 *
 * `dynamicCalls` are the framework's lazy-import call names (e.g. `dynamic`,
 * `lazy`), supplied by the adapter.
 */
export function buildGraph(
  project: Project,
  registry: ComponentRegistry,
  files: SourceFile[],
  dynamicCalls: Set<string>
): Graph {
  const edges: ComponentEdge[] = [];
  const jsxSites = new Map<string, UsageSite[]>();
  const dynamicTargets = new Set<string>();
  const edgeSeen = new Set<string>();
  const root = registry.root;

  // Per-file set of names that *could* reference a tracked declaration (imports
  // + local top-level decls). Used to skip symbol resolution for everything else.
  const localNamesByFile = new Map<string, Set<string>>();
  for (const d of registry.all()) {
    const f = d.decl.getSourceFile().getFilePath();
    const set = localNamesByFile.get(f) ?? new Set<string>();
    set.add(d.name);
    localNamesByFile.set(f, set);
  }

  const addEdge = (from: string, to: string, kind: ComponentEdge["kind"]) => {
    if (from === to) return;
    const key = `${from}|${to}|${kind}`;
    if (edgeSeen.has(key)) return;
    edgeSeen.add(key);
    edges.push({ from, to, kind });
  };

  const addSite = (id: string, sf: SourceFile, node: Node) => {
    const rel = path.relative(root, sf.getFilePath()).split(path.sep).join("/");
    const list = jsxSites.get(id) ?? [];
    list.push({ file: rel, line: node.getStartLineNumber() });
    jsxSites.set(id, list);
  };

  for (const sf of files) {
    const candidates = candidateNames(sf, localNamesByFile);

    sf.forEachDescendant((node) => {
      // JSX element usage: <Foo /> or <Foo>...</Foo>
      if (Node.isJsxOpeningElement(node) || Node.isJsxSelfClosingElement(node)) {
        const tag = node.getTagNameNode();
        const target = resolveToDecl(tag, registry);
        if (!target) return;
        if (target.isComponent) addSite(target.id, sf, node);
        const owner = findOwner(node, registry);
        if (owner) addEdge(owner.id, target.id, "jsx");
        return;
      }

      // Dynamic import: dynamic(() => import('./Foo')) / lazy(() => import(...))
      if (Node.isCallExpression(node)) {
        const callName = lastName(node.getExpression().getText());
        if (dynamicCalls.has(callName)) {
          const spec = findDynamicImportSpec(node);
          if (spec) {
            const targetSf = resolveModuleSpecifier(project, sf.getFilePath(), spec);
            const target = targetSf
              ? registry.defaultExportOf(targetSf.getFilePath())
              : undefined;
            if (target) {
              if (target.isComponent) dynamicTargets.add(target.id);
              const owner = findOwner(node, registry);
              if (owner) addEdge(owner.id, target.id, "dynamic");
            }
          }
          return;
        }
      }

      // Value reference: an identifier resolving to a tracked declaration used as
      // a value (config entries, props, hook returns). This is what carries usage
      // through non-component glue like nav config objects.
      if (
        Node.isIdentifier(node) &&
        candidates.has(node.getText()) &&
        isReferenceUse(node)
      ) {
        const target = resolveToDecl(node, registry);
        if (!target) return;
        // Functions/hooks have no JSX sites; record their reference (call) sites
        // so the inspector can show usage counts and locations for them too.
        if (target.symbolKind === "function" || target.symbolKind === "hook") {
          addSite(target.id, sf, node);
        }
        const owner = findOwner(node, registry);
        if (owner && owner.id !== target.id) {
          addEdge(owner.id, target.id, "reference");
        }
      }
    });
  }

  return { edges, jsxSites, dynamicTargets };
}

/** Names that could reference a tracked decl in this file: imports + local decls. */
function candidateNames(
  sf: SourceFile,
  localNamesByFile: Map<string, Set<string>>
): Set<string> {
  const names = new Set<string>(localNamesByFile.get(sf.getFilePath()) ?? []);
  for (const imp of sf.getImportDeclarations()) {
    const def = imp.getDefaultImport();
    if (def) names.add(def.getText());
    const ns = imp.getNamespaceImport();
    if (ns) names.add(ns.getText());
    for (const ni of imp.getNamedImports()) {
      names.add((ni.getAliasNode() ?? ni.getNameNode()).getText());
    }
  }
  return names;
}

/** Nearest enclosing tracked declaration (component or glue). */
function findOwner(node: Node, registry: ComponentRegistry) {
  let current: Node | undefined = node.getParent();
  while (current) {
    const hit = registry.byDeclKey(declKey(current));
    if (hit) return hit;
    current = current.getParent();
  }
  return undefined;
}

function lastName(text: string): string {
  return text.includes(".") ? text.split(".").pop()! : text;
}

/** Extract the string spec from `() => import('spec')` inside a dynamic call. */
function findDynamicImportSpec(call: Node): string | undefined {
  const importCall = call.getFirstDescendant(
    (d) =>
      Node.isCallExpression(d) &&
      d.getExpression().getKind() === SyntaxKind.ImportKeyword
  );
  if (!importCall || !Node.isCallExpression(importCall)) return undefined;
  const arg = importCall.getArguments()[0];
  if (arg && Node.isStringLiteral(arg)) return arg.getLiteralValue();
  return undefined;
}

/**
 * True when an identifier is a real value *use* of a binding (not a declaration
 * name, import/export binding, property key, or the `.member` side of access).
 */
function isReferenceUse(id: Node): boolean {
  const parent = id.getParent();
  if (!parent) return false;

  // Declaration / binding positions — the name is being defined, not used.
  if (
    Node.isImportSpecifier(parent) ||
    Node.isImportClause(parent) ||
    Node.isNamespaceImport(parent) ||
    Node.isExportSpecifier(parent) ||
    Node.isVariableDeclaration(parent) ||
    Node.isFunctionDeclaration(parent) ||
    Node.isParameterDeclaration(parent) ||
    Node.isBindingElement(parent) ||
    Node.isJsxOpeningElement(parent) ||
    Node.isJsxSelfClosingElement(parent) ||
    Node.isJsxClosingElement(parent)
  ) {
    return false;
  }

  // `obj.member` — only the object side is a use; the `.member` name is not.
  if (Node.isPropertyAccessExpression(parent) && parent.getNameNode() === id) {
    return false;
  }
  // `{ key: value }` — the key is not a use (the value is a separate node).
  if (Node.isPropertyAssignment(parent) && parent.getNameNode() === id) {
    return false;
  }
  return true;
}
