import dynamic from "next/dynamic";
import { Card } from "@/components";
import { DupA } from "@/components/DupA";
import { SimA } from "@/components/SimA";
import { SimB } from "@/components/SimB";
import { Sidebar } from "@/components/Sidebar";

const Heavy = dynamic(() => import("@/components/Heavy"));

export default function Home() {
  return (
    <main>
      <Sidebar />
      <Card title="Hello" />
      <DupA label="ok" />
      <SimA name="a" />
      <SimB name="b" />
      <Heavy />
    </main>
  );
}
