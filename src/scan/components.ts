import path from "node:path";
import {
  Node,
  SourceFile,
  SyntaxKind,
  type ArrowFunction,
  type FunctionDeclaration,
  type FunctionExpression,
} from "ts-morph";
import type {
  ComponentKind,
  ComponentNode,
  SymbolKind,
} from "../report/model.js";

/**
 * A tracked top-level declaration. Classified by `symbolKind`:
 * `component`/`function`/`hook` are reported to the user; plain value
 * consts/objects stay `module` glue — kept only as reachability intermediaries
 * so usage flowing through config objects is not lost.
 */
export interface ComponentInfo extends Omit<ComponentNode, "symbolKind"> {
  /** The declaration node (function/arrow/variable) that defines it. */
  decl: Node;
  /** What this declaration represents (component / function / hook / glue). */
  symbolKind: GlueSymbolKind;
  /** True for actual React components; false for everything else. */
  isComponent: boolean;
}

/** `SymbolKind` plus the internal-only `module` glue classification. */
export type GlueSymbolKind = SymbolKind | "module";

const WRAPPER_CALLS = new Set([
  "forwardRef",
  "memo",
  "dynamic",
  "observer",
  "styled",
]);

function isPascalCase(name: string): boolean {
  return /^[A-Z][A-Za-z0-9]*$/.test(name);
}

function fileKind(file: string): ComponentKind {
  if (/\.(test|spec)\.[jt]sx?$/.test(file) || /__tests__/.test(file)) {
    return "test";
  }
  if (/\.stories\.[jt]sx?$/.test(file)) return "story";
  return "prod";
}

function containsJsx(node: Node): boolean {
  return (
    node.getFirstDescendantByKind(SyntaxKind.JsxElement) !== undefined ||
    node.getFirstDescendantByKind(SyntaxKind.JsxSelfClosingElement) !==
      undefined ||
    node.getFirstDescendantByKind(SyntaxKind.JsxFragment) !== undefined
  );
}

/** Is this initializer a known component-wrapper call like forwardRef/memo/dynamic? */
function isWrapperCall(node: Node | undefined): boolean {
  if (!node || !Node.isCallExpression(node)) return false;
  const expr = node.getExpression();
  const text = expr.getText();
  const name = text.includes(".") ? text.split(".").pop()! : text;
  return WRAPPER_CALLS.has(name);
}

function looksLikeComponent(name: string, body: Node, init?: Node): boolean {
  if (!isPascalCase(name)) return false;
  if (isWrapperCall(init)) return true;
  return containsJsx(body);
}

/**
 * Is this declaration callable? Either a `function`/arrow declaration itself, or
 * a const whose initializer is an arrow/function expression (incl. component
 * wrappers like `memo(() => ...)`). Plain value consts/objects are not callable.
 */
function isCallable(decl: Node, init?: Node): boolean {
  if (Node.isFunctionDeclaration(decl)) return true;
  if (!init) return false;
  return (
    Node.isArrowFunction(init) ||
    Node.isFunctionExpression(init) ||
    isWrapperCall(init)
  );
}

/** Classify a declaration into a reported symbol kind or `module` glue. */
function classifySymbol(
  name: string,
  decl: Node,
  body: Node,
  init?: Node
): GlueSymbolKind {
  if (looksLikeComponent(name, body, init)) return "component";
  if (!isCallable(decl, init)) return "module";
  if (/^use[A-Z]/.test(name)) return "hook";
  return "function";
}

function toRelative(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join("/");
}

function makeNode(
  root: string,
  sf: SourceFile,
  name: string,
  decl: Node,
  isDefault: boolean,
  symbolKind: GlueSymbolKind
): ComponentInfo {
  const file = toRelative(root, sf.getFilePath());
  return {
    id: `${file}#${name}`,
    name,
    file,
    kind: fileKind(file),
    isDefaultExport: isDefault,
    line: decl.getStartLineNumber(),
    decl,
    symbolKind,
    isComponent: symbolKind === "component",
  };
}

/**
 * Detect all top-level declarations defined in a file (ignores re-exports).
 * Returns every named function/variable plus the default export, each flagged
 * `isComponent`. Non-component declarations are retained so reachability can
 * flow through config objects, hooks, and helper functions.
 */
export function detectDeclarations(
  root: string,
  sf: SourceFile
): ComponentInfo[] {
  const found: ComponentInfo[] = [];
  const seen = new Set<string>();

  const push = (
    name: string,
    decl: Node,
    body: Node,
    init: Node | undefined,
    isDefault: boolean
  ) => {
    const node = makeNode(
      root,
      sf,
      name,
      decl,
      isDefault,
      classifySymbol(name, decl, body, init)
    );
    if (seen.has(node.id)) return;
    seen.add(node.id);
    found.push(node);
  };

  // Top-level function declarations.
  for (const fn of sf.getFunctions()) {
    const name = fn.getName();
    if (!name) continue;
    push(name, fn, fn, undefined, fn.isDefaultExport());
  }

  // Top-level variable declarations (const/let), incl. non-exported glue.
  for (const stmt of sf.getVariableStatements()) {
    for (const v of stmt.getDeclarations()) {
      const name = v.getName();
      const init = v.getInitializer();
      push(name, v, init ?? v, init, false);
    }
  }

  // `export default function Foo() {}` / `export default () => <.../>`
  const defaultExport = sf.getDefaultExportSymbol();
  if (defaultExport) {
    const decl = defaultExport.getDeclarations()[0];
    if (decl) {
      const resolved = resolveDefaultDecl(decl);
      if (resolved) {
        const name = resolved.name ?? defaultNameFromFile(sf.getFilePath());
        push(name, resolved.decl, resolved.body, resolved.init, true);
      }
    }
  }

  return found;
}

function defaultNameFromFile(filePath: string): string {
  const base = path.basename(filePath).replace(/\.[jt]sx?$/, "");
  if (base === "index" || base === "page" || base === "layout") {
    const parent = path.basename(path.dirname(filePath));
    return isPascalCase(cap(parent)) ? cap(parent) : cap(base);
  }
  return cap(base);
}

function cap(s: string): string {
  const cleaned = s.replace(/[^A-Za-z0-9]/g, "");
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

interface ResolvedDecl {
  name?: string;
  decl: Node;
  body: Node;
  init?: Node;
}

/** Unwrap a default export to the underlying function/arrow/wrapper. */
function resolveDefaultDecl(decl: Node): ResolvedDecl | undefined {
  if (Node.isFunctionDeclaration(decl)) {
    return { name: decl.getName(), decl, body: decl };
  }
  if (Node.isExportAssignment(decl)) {
    const expr = decl.getExpression();
    if (Node.isIdentifier(expr)) {
      // `export default Foo` — resolve to its definition for JSX check.
      const def = expr.getSymbol()?.getDeclarations()?.[0];
      if (def && Node.isVariableDeclaration(def)) {
        const init = def.getInitializer();
        return { name: def.getName(), decl: def, body: init ?? def, init };
      }
      if (def && Node.isFunctionDeclaration(def)) {
        return { name: def.getName(), decl: def, body: def };
      }
      return undefined;
    }
    return { decl: expr, body: expr, init: expr };
  }
  return undefined;
}

export type { ArrowFunction, FunctionDeclaration, FunctionExpression };
