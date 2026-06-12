import { memo } from "react";
import { Base } from "./Base";

// `memo(Base)` has no JSX in its initializer — only the wrapper-call heuristic
// marks this as a component. The reference to Base also forms an edge.
export const Memoized = memo(Base);
