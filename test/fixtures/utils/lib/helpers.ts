// Called by the live Home page → reachable → used.
export function formatTitle(s: string): string {
  return s.trim().toUpperCase();
}

// Called only by deadUtil (itself never referenced) → transitively dead.
export function shout(s: string): string {
  return s + "!";
}

// Never referenced anywhere → dead util.
export function deadUtil(): string {
  return shout("nobody calls me");
}

// `use*` callable → classified as a hook; referenced by Home → used.
export function useGreeting(): string {
  return "hi";
}
