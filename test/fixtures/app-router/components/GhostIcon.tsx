// Used only inside a config that is referenced solely by the dead Unused
// component → must stay dead (transitive deadness through config glue).
export function GhostIcon() {
  return <svg className="ghost" viewBox="0 0 16 16" />;
}
