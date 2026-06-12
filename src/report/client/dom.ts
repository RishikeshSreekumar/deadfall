// Tiny DOM helpers shared across the client. Kept dependency-free so view
// modules read clearly.

/** `document.getElementById` with a typed return (callers know the id exists). */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

/** Escape a value for safe insertion into HTML text/attribute content. */
export function esc(s: unknown): string {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
}

/** Directory portion of a relative file path (".", if none). */
export function dirOf(file: string): string {
  const i = file.lastIndexOf("/");
  return i < 0 ? "." : file.slice(0, i);
}

/** Filename portion of a relative file path (the whole path, if no "/"). */
export function baseOf(file: string): string {
  const i = file.lastIndexOf("/");
  return i < 0 ? file : file.slice(i + 1);
}

/** Read a CSS custom property off :root (used to feed cytoscape canvas colours). */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
