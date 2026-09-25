"use client";

import { useRouter } from "next/navigation";
import type { GraphData } from "@jarvis/types";
import { GraphCanvas } from "./graph-canvas";

export function GraphPreview({ data }: { data: GraphData }) {
  const router = useRouter();
  return (
    <GraphCanvas
      data={data}
      clusters
      interactive={false}
      onSelect={(id) => router.push(id ? `/app/graph?focus=${id}` : "/app/graph")}
      className="h-full w-full"
    />
  );
}
