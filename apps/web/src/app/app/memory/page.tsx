import { Suspense } from "react";
import { Skeleton } from "@jarvis/ui";
import { MemoryBrowser } from "@/components/memory-browser";
import { PageHeader } from "@/components/shell";

export const metadata = { title: "Memory" };

export default function MemoryPage() {
  return (
    <>
      <PageHeader index="03 — Memory" title="Memory" description="Everything you have told JARVIS: notes, theses, trades, research and events. Search by words, by meaning, or both." />
      <Suspense fallback={<Skeleton className="mx-8 h-96" />}>
        <MemoryBrowser />
      </Suspense>
    </>
  );
}
