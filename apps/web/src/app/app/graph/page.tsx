import { Suspense } from "react";
import { Skeleton } from "@jarvis/ui";
import { GraphExplorer } from "@/components/graph-explorer";
import { PageHeader } from "@/components/shell";

export const metadata = { title: "Knowledge Graph" };

export default function GraphPage() {
  return (
    <>
      <PageHeader index="03 — Knowledge Graph" title="Knowledge graph" description="Companies, assets, themes, theses and events from your memory, connected by how they relate. Clusters form around your themes." />
      <Suspense fallback={<Skeleton className="mx-8 h-[70vh]" />}>
        <GraphExplorer />
      </Suspense>
    </>
  );
}
