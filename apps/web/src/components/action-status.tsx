import { Badge } from "@jarvis/ui";

export function ActionStatus({ a }: { a: { approvalStatus: string; executionStatus: string } }) {
  if (a.executionStatus === "executed") return <Badge tone="ink">Executed</Badge>;
  if (a.executionStatus === "failed") return <Badge tone="danger">Failed</Badge>;
  if (a.executionStatus === "executing") return <Badge tone="cobalt">Submitting</Badge>;
  if (a.approvalStatus === "approved") return <Badge tone="cobalt">Approved</Badge>;
  if (a.approvalStatus === "proposed") return <Badge tone="signal">Needs review</Badge>;
  return <Badge tone="outline">{a.approvalStatus}</Badge>;
}
