import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Badge, SectionLabel } from "@jarvis/ui";
import { ApproveForm, ExecuteForm, RejectButton } from "@/components/action-forms";
import { ActionStatus } from "@/components/action-status";
import { InsightCard } from "@/components/insight-card";
import { PageHeader } from "@/components/shell";
import { actionDetail } from "@/server/actions";
import { pageUser } from "@/server/auth";
import { services } from "@/server/container";
import { formatDate, label, money, percent, quantity } from "@/lib/format";

export const metadata = { title: "Review action" };

type Props = { params: Promise<{ id: string }> };

const dateTime = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });

export default async function ActionPage({ params }: Props) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const user = await pageUser();
  const { db } = await services();
  const a = await actionDetail(db, user.id, id.data);
  if (!a) notFound();
  const qty = Number(a.quantity ?? 0);
  const price = a.estimatedPrice ? Number(a.estimatedPrice) : null;
  const target = a.canExecute ? "the demo brokerage as a paper order" : "a brokerage";
  const priceSource = typeof a.context.priceSource === "string" ? a.context.priceSource : a.proposedBy === "user" && price ? "entered by you" : null;
  const result = a.executionResult as { note?: string; averagePrice?: string; error?: string; memoryId?: string };

  return (
    <>
      <PageHeader
        index="08 — Actions / Review"
        title={a.phrase}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <ActionStatus a={a} />
            <Badge tone={a.dataMode === "demo" ? "signal" : "ink"}>{a.dataMode === "demo" ? "Demo · paper" : "Live"}</Badge>
            <span className="eyebrow text-gray">{a.proposedBy === "ai" ? `Proposed by JARVIS (${a.context.method === "model" ? "model" : "rules"})` : "Your proposal"} · {formatDate(a.createdAt)}</span>
          </span>
        }
        actions={
          <Link href="/app/actions" className="eyebrow flex items-center gap-1 text-gray hover:text-ink">
            <ArrowLeft className="size-3" /> All actions
          </Link>
        }
      />
      <div className="grid gap-x-10 gap-y-12 px-4 pb-20 sm:px-8 lg:grid-cols-[1fr_340px]">
        <div className="space-y-12">
          <section className="space-y-4">
            <SectionLabel index="01">Order</SectionLabel>
            <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              <Fact k="Side" v={a.type.toUpperCase()} />
              <Fact k="Asset" v={a.symbol ?? "—"} mono />
              <Fact k="Quantity" v={quantity(qty)} />
              <Fact k={a.dataMode === "demo" ? "Paper price" : "Limit price"} v={price ? money(price) : "Market, not estimated"} />
            </dl>
            {priceSource ? <p className="text-xs text-gray">Price: {priceSource}. JARVIS does not fetch or invent market prices.</p> : null}
            {a.held ? (
              <p className="text-sm text-gray">
                {a.executedAt ? "Before this order you held" : "You hold"} {quantity(a.held.quantity)} {a.symbol} with a cost basis of {money(a.held.cost)}.
                {a.type === "sell" && qty > a.held.quantity ? <span className="text-danger"> This is more than you hold.</span> : null}
              </p>
            ) : null}
          </section>

          <section className="space-y-3">
            <SectionLabel index="02">Why</SectionLabel>
            <p className="max-w-3xl whitespace-pre-line leading-relaxed">{a.reasoning}</p>
            {a.evidence.length ? (
              <ul className="space-y-1 text-sm">
                {a.evidence.map((m) => (
                  <li key={m.id}>
                    <Link href={`/app/memory?id=${m.id}`} className="text-cobalt hover:underline">{m.title}</Link> <span className="eyebrow text-gray">{label(m.type)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          {a.impact.length ? (
            <section className="space-y-4">
              <SectionLabel index="03">{a.executedAt ? "Effect of this order" : "If carried out"}</SectionLabel>
              <ul className="divide-y divide-line border-y border-line">
                {a.impact.map((i) => (
                  <li key={i.theme} className="grid grid-cols-[1fr_auto] gap-4 py-3 text-sm">
                    <span>{i.theme}</span>
                    <span className="tabular">{percent(i.before)} → <span className="font-medium">{percent(i.after)}</span></span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-gray">Share of cost basis, before and after. Market value would differ.</p>
            </section>
          ) : null}

          {a.insight ? (
            <section className="space-y-4">
              <SectionLabel index="04">The insight behind it</SectionLabel>
              <div className="max-w-xl"><InsightCard insight={a.insight} /></div>
            </section>
          ) : null}
        </div>

        <aside className="space-y-8">
          <section className="space-y-4 border border-ink p-5">
            <p className="eyebrow flex items-center gap-2 text-ink"><ShieldCheck className="size-4 text-cobalt" /> Your decision</p>
            {a.approvalStatus === "proposed" ? (
              <>
                <ApproveForm id={a.id} phrase={a.phrase} />
                <p className="text-xs leading-relaxed text-gray">
                  Approving does not place the order. You submit it in a second step within 15 minutes, and the approval is signed so the order cannot change in between.
                  {a.expiresAt ? ` This proposal lapses on ${formatDate(a.expiresAt)} if you do nothing.` : ""}
                </p>
              </>
            ) : a.approvalStatus === "approved" && a.executionStatus === "not_started" ? (
              a.canExecute ? (
                <ExecuteForm id={a.id} target={target} />
              ) : (
                <div className="space-y-3 text-sm">
                  <p>Approved. No connected brokerage accepts orders for live accounts yet, so JARVIS will not submit it.</p>
                  <p className="text-gray">Place the order yourself, then save it as a trade memory so JARVIS remembers why.</p>
                  <RejectButton id={a.id} />
                </div>
              )
            ) : a.executionStatus === "executed" ? (
              <div className="space-y-2 text-sm">
                <p>Executed {a.executedAt ? dateTime.format(a.executedAt) : ""} UTC{result.averagePrice ? ` at ${money(Number(result.averagePrice))}` : ""}.</p>
                {result.note ? <p className="text-gray">{result.note}</p> : null}
                {result.memoryId ? <Link href={`/app/memory?id=${result.memoryId}`} className="text-cobalt hover:underline">Saved as a trade memory</Link> : null}
              </div>
            ) : a.executionStatus === "failed" ? (
              <p className="text-sm text-danger">{result.error ?? result.note ?? "The order was not filled."}</p>
            ) : (
              <p className="text-sm text-gray">This action is {a.approvalStatus}. Nothing was submitted.</p>
            )}
          </section>

          <section className="space-y-3">
            <SectionLabel>Decision log</SectionLabel>
            {a.approvals.length ? (
              <ol className="space-y-3 text-sm">
                {a.approvals.map((p) => (
                  <li key={p.id} className="space-y-0.5">
                    <p className="eyebrow text-gray">{dateTime.format(p.decidedAt)} UTC</p>
                    <p>
                      {p.decision === "approved" ? `Approved with “${p.phrase}”` : `Rejected${p.reason ? `: ${p.reason}` : ""}`}
                    </p>
                    {p.confirmationHash ? <p className="truncate font-mono text-[10px] text-gray" title={p.confirmationHash}>sha256 {p.confirmationHash}</p> : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-gray">No decision yet.</p>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}

function Fact({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div>
      <dt className="eyebrow text-gray">{k}</dt>
      <dd className={`tabular text-2xl font-semibold tracking-tight ${mono ? "font-mono" : ""}`}>{v}</dd>
    </div>
  );
}
