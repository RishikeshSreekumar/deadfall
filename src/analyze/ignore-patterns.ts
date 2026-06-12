/**
 * Compile `ignoreComponents` patterns into a matcher. Patterns support `*`
 * (any run) and `?` (one char) only. Patterns containing `#` match the full
 * component id (`relPath#Name`); otherwise they match the component name.
 */
export function compileIgnorePatterns(
  patterns: string[]
): (node: { id: string; name: string }) => boolean {
  if (!patterns.length) return () => false;
  const compiled = patterns.map((p) => ({
    byId: p.includes("#"),
    re: globToRegExp(p),
  }));
  return (node) =>
    compiled.some(({ byId, re }) => re.test(byId ? node.id : node.name));
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const body = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${body}$`);
}
