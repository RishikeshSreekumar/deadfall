import { Node, SyntaxKind } from "ts-morph";

const DIRECTIVE = /\bdeadfall-ignore\b/;

/**
 * Does a `deadfall-ignore` comment sit above this declaration? The comment
 * attaches to the enclosing *statement* — for `export const Foo = ...` that is
 * the VariableStatement, not the inner VariableDeclaration; for
 * `export default <expr>` it is the ExportAssignment.
 */
export function hasIgnoreDirective(decl: Node): boolean {
  for (const node of commentCarriers(decl)) {
    for (const range of node.getLeadingCommentRanges()) {
      if (DIRECTIVE.test(range.getText())) return true;
    }
  }
  return false;
}

/** The nodes whose leading comments count for this declaration. */
function* commentCarriers(decl: Node): Iterable<Node> {
  yield decl;
  const stmt = decl.getFirstAncestorByKind(SyntaxKind.VariableStatement);
  if (stmt) yield stmt;
  const exportAssignment = decl.getFirstAncestorByKind(
    SyntaxKind.ExportAssignment
  );
  if (exportAssignment) yield exportAssignment;
}
