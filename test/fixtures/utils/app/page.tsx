import { formatTitle, useGreeting } from "@/lib/helpers";

export default function Home() {
  const greeting = useGreeting();
  return <main>{formatTitle(greeting)}</main>;
}
