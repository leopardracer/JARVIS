import Image from "next/image";
import Link from "next/link";

const features = [
  {
    title: "Remembers everything",
    body: "Notes, links, documents and voice memos in one place. Ask a question and JARVIS answers with quotes from what you wrote.",
  },
  {
    title: "Understands your portfolio",
    body: "Connect a Robinhood Chain address to see balances and transactions explained in plain language.",
  },
  {
    title: "Keeps you honest",
    body: "JARVIS links each position to your own thesis and reminds you of the rules you set for yourself.",
  },
  {
    title: "Read-only by design",
    body: "No private keys, no trades. JARVIS reads public chain data and explains it. It never moves your money.",
  },
];

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-4 py-16">
      <section className="grid items-center gap-10 md:grid-cols-[1fr_minmax(0,420px)]">
        <div className="flex flex-col items-start gap-6">
          <span className="rounded-2xl bg-brand px-6 py-3 text-5xl font-extrabold lowercase text-brand-foreground">
            jarvis
          </span>
          <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
            Your AI second brain for ideas and money.
          </h1>
          <p className="max-w-2xl text-lg text-muted">
            JARVIS remembers what you think and explains what you hold on
            Robinhood Chain, so every decision has its reasoning next to it.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/chat"
              className="rounded-full bg-brand px-5 py-2.5 font-semibold text-brand-foreground hover:opacity-90"
            >
              Talk to JARVIS
            </Link>
            <Link
              href="/wallet"
              className="rounded-full border border-border px-5 py-2.5 font-semibold hover:bg-surface"
            >
              Check a wallet
            </Link>
          </div>
        </div>
        <Image
          src="/jarvis-mascot.png"
          alt="JARVIS robot mascot"
          width={1312}
          height={1199}
          priority
          className="mx-auto w-full max-w-sm md:max-w-none"
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {features.map((f) => (
          <div
            key={f.title}
            className="rounded-2xl border border-border bg-surface p-6"
          >
            <h2 className="mb-2 text-lg font-bold">{f.title}</h2>
            <p className="text-muted">{f.body}</p>
          </div>
        ))}
      </section>

      <p className="text-sm text-muted">
        JARVIS is an information tool, not investment advice. Robinhood Stock
        Tokens are not available in every country.
      </p>
    </div>
  );
}
