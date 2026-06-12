import { Alpha } from "../feature-a/Alpha";

// Beta <-> Alpha form a dependency cycle.
export function Beta() {
  return (
    <div>
      <Alpha />
    </div>
  );
}
