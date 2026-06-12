import { Memoized } from "@/components/Memoized";
import { Widget } from "@/components/widget";
import Arrow from "@/components/Arrow";

export default function Page() {
  return (
    <main>
      <Memoized />
      <Widget />
      <Arrow />
    </main>
  );
}
