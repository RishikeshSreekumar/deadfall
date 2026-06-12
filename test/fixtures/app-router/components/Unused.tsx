import { OrphanChild } from "./OrphanChild";
import { ghostConfig } from "@/nav/config";

// Never imported/rendered anywhere → dead. It references ghostConfig and renders
// OrphanChild, but because Unused itself is dead, both stay dead (transitive).
export function Unused() {
  return (
    <div className="unused">
      nobody renders me
      {ghostConfig.map((g) => g.icon)}
      <OrphanChild />
    </div>
  );
}
