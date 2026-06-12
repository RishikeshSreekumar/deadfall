import { Beta } from "../feature-b/Beta";

// Alpha <-> Beta form a dependency cycle.
export function Alpha() {
  return (
    <div>
      <Beta />
    </div>
  );
}
