import Image from "next/image";
import Link from "next/link";

const meta = [
  { label: "Year", value: "2026" },
  { label: "Status", value: "Private beta" },
  { label: "Network", value: "Robinhood Chain · 4663" },
  { label: "Access", value: "Read-only" },
];

const capabilities = [
  {
    no: "01",
    title: "Memory",
    body: "Notes, links, documents and voice memos, connected into one graph. Ask anything and JARVIS answers with quotes from what you wrote.",
    status: "Next",
  },
  {
    no: "02",
    title: "Chat",
    body: "A conversational layer over your own knowledge, powered by Claude.",
    status: "Live",
    href: "/chat",
  },
  {
    no: "03",
    title: "Portfolio",
    body: "Balances and transactions on Robinhood Chain, explained in plain language. No keys, no trades.",
    status: "Live",
    href: "/wallet",
  },
  {
    no: "04",
    title: "Theses",
    body: "Link every position to the reason you took it, and get reminded when your own rules are hit.",
    status: "Planned",
  },
];

const stack = [
  { label: "Model", value: "Claude" },
  { label: "Chain", value: "Robinhood Chain (Arbitrum L2)" },
  { label: "Prices", value: "Chainlink" },
  { label: "Memory", value: "Postgres · pgvector" },
  { label: "Web", value: "Next.js" },
];

export default function Home() {
  return (
    <div className="flex flex-col">
      <section className="px-4 pt-6 sm:px-6">
        <h1 className="rise text-[30vw] font-semibold uppercase leading-[0.8] tracking-[-0.06em]">
          Jarvis
        </h1>
      </section>

      <section className="grid grid-cols-2 gap-x-4 gap-y-6 border-b border-hairline px-4 py-8 text-sm sm:px-6 md:grid-cols-4">
        {meta.map((m) => (
          <div key={m.label}>
            <p className="uppercase tracking-wide text-muted">{m.label}</p>
            <p>{m.value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-8 px-4 py-16 sm:px-6 md:grid-cols-12">
        <p className="rise text-3xl leading-[1.1] tracking-tight md:col-span-9 md:text-5xl">
          An AI second brain for ideas and money. JARVIS remembers what you
          think and explains what you hold on Robinhood Chain, so every decision
          keeps its reasoning next to it.
        </p>
        <div className="flex flex-col items-start gap-3 text-sm uppercase tracking-wide md:col-span-3 md:items-end md:justify-end">
          <Link
            href="/chat"
            className="bg-foreground px-4 py-2 text-background hover:bg-brand hover:text-brand-foreground"
          >
            Talk to Jarvis
          </Link>
          <Link href="/wallet" className="underline underline-offset-4">
            Check a wallet
          </Link>
        </div>
      </section>

      <section className="bg-surface px-4 py-10 sm:px-6">
        <Image
          src="/jarvis-mascot.png"
          alt="JARVIS robot"
          width={1312}
          height={1199}
          priority
          className="mx-auto h-auto w-full max-w-3xl"
        />
      </section>

      <section id="info" className="px-4 py-16 sm:px-6">
        <h2 className="mb-6 text-sm uppercase tracking-wide text-muted">
          Index
        </h2>
        <ul className="border-t border-border">
          {capabilities.map((c) => {
            const row = (
              <div className="grid grid-cols-12 gap-4 py-5 transition-colors group-hover:bg-foreground group-hover:text-background">
                <span className="col-span-2 pl-1 text-sm text-muted md:col-span-1">
                  {c.no}
                </span>
                <span className="col-span-10 text-2xl font-medium tracking-tight md:col-span-3">
                  {c.title}
                </span>
                <span className="col-span-12 text-muted md:col-span-6">
                  {c.body}
                </span>
                <span className="col-span-12 text-sm uppercase tracking-wide md:col-span-2 md:pr-1 md:text-right">
                  {c.status}
                </span>
              </div>
            );
            return (
              <li key={c.no} className="group border-b border-border">
                {c.href ? <Link href={c.href}>{row}</Link> : row}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="grid gap-8 border-t border-hairline px-4 py-16 text-sm sm:px-6 md:grid-cols-12">
        <h2 className="uppercase tracking-wide text-muted md:col-span-3">
          Built with
        </h2>
        <dl className="grid grid-cols-2 gap-y-3 md:col-span-6">
          {stack.map((s) => (
            <div key={s.label} className="contents">
              <dt className="text-muted">{s.label}</dt>
              <dd>{s.value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-muted md:col-span-3">
          JARVIS is an information tool, not investment advice. Robinhood Stock
          Tokens are not available in every country.
        </p>
      </section>
    </div>
  );
}
