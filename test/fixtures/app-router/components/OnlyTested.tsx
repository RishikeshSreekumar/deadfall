// Imported only by a test file → dead in production.
export function OnlyTested() {
  return <div className="only-tested">used in tests only</div>;
}
