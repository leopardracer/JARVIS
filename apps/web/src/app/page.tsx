import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, GitBranch } from "lucide-react";
import { buttonVariants, cn } from "@jarvis/ui";
import { Mascot, Wordmark } from "@/components/brand";

const LOOP = ["Capture", "Remember", "Connect", "Understand", "Reason", "Insight", "Action", "Remember"];

const REPO = "https://github.com/leopardracer/JARVIS";

export default function LandingPage() {
  return (
    <div className="bg-white">
      <nav className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-3 sm:px-8">
          <Link href="/" aria-label="JARVIS home">
            <Wordmark />
          </Link>
          <div className="hidden gap-6 text-sm md:flex">
            <a href="#memory" className="hover:text-cobalt">Memory</a>
            <a href="#graph" className="hover:text-cobalt">Graph</a>
            <a href="#briefing" className="hover:text-cobalt">Briefing</a>
            <a href="#actions" className="hover:text-cobalt">Actions</a>
            <a href="#open-source" className="hover:text-cobalt">Open source</a>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden sm:inline-flex")}>Sign in</Link>
            <Link href="/login" className={buttonVariants({ size: "sm" })}>Try the demo</Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-[1400px] px-4 sm:px-8">
        {/* 01 Hero */}
        <section className="grid grid-cols-1 gap-10 pb-16 pt-12 lg:grid-cols-12 lg:pt-20">
          <div className="space-y-8 lg:col-span-9">
            <p className="eyebrow text-gray">JARVIS — Your financial second brain</p>
            <h1 className="display text-[clamp(3rem,8.5vw,8.5rem)]">
              Remember everything. Connect the dots. <span className="text-cobalt">Act with context.</span>
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-gray">
              JARVIS keeps your notes, theses, research and trades in one memory, links them into a knowledge graph, and tells you what changed, what it touches in your portfolio, and why, with the sources it used. It proposes; you decide.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/login" className={buttonVariants({ size: "lg" })}>
                Explore the demo <ArrowRight />
              </Link>
              <a href={REPO} className={buttonVariants({ variant: "outline", size: "lg" })}>
                <GitBranch /> Source on GitHub
              </a>
            </div>
            <p className="eyebrow text-gray">Open source · runs offline with no keys · never trades on its own</p>
          </div>
          <div className="hidden items-end justify-end lg:col-span-3 lg:flex">
            <Mascot size={300} priority />
          </div>
        </section>

        <Pipeline />

        {/* 02 Persistent memory */}
        <Feature id="memory" index="02" title="Persistent memory" lede="Everything you tell JARVIS stays: typed, tagged, dated and searchable by words or by meaning.">
          <div className="grid gap-px border border-line bg-line sm:grid-cols-2">
            {[
              ["Exact", "Words and phrases, ranked by full-text search."],
              ["Semantic", "Meaning, via vector embeddings in pgvector."],
              ["By entity", "Every note that touches NVDA, a person or a theme."],
              ["Chronological", "What you thought, and when you thought it."],
            ].map(([k, v]) => (
              <div key={k} className="space-y-1 bg-white p-5">
                <p className="font-semibold">{k}</p>
                <p className="text-sm text-gray">{v}</p>
              </div>
            ))}
          </div>
          <p className="eyebrow text-gray">Notes · ideas · theses · trades · research · documents · links · goals · market events</p>
        </Feature>

        {/* 03 Knowledge graph */}
        <Feature
          id="graph"
          index="03"
          title="Knowledge graph"
          lede="Companies, assets, people, themes and events become nodes; how they relate becomes edges. Then JARVIS infers what you never linked yourself."
        >
          <Shot src="/screenshots/graph.png" alt="The knowledge graph focused on OpenAI, with the chains that reach NVDA and AMD in the sidebar" />
          <div className="grid gap-px border border-line bg-line sm:grid-cols-2">
            <div className="space-y-2 bg-white p-5">
              <p className="eyebrow text-cobalt">Impact paths</p>
              <p className="font-medium">OpenAI depends on NVIDIA, which issues NVDA.</p>
              <p className="text-sm text-gray">The shortest chain of your own links from any company or scenario to each holding, as a share of cost basis.</p>
            </div>
            <div className="space-y-2 bg-white p-5">
              <p className="eyebrow text-cobalt">Look-alikes</p>
              <p className="font-medium">NVIDIA and Advanced Micro Devices look alike.</p>
              <p className="text-sm text-gray">Shared neighbours and shared memories, drawn as dotted edges with the reason. Positions tied to look-alikes add up rather than diversify.</p>
            </div>
          </div>
        </Feature>

        {/* 04 Research and agents */}
        <Feature index="04" title="Research and agents" lede="Before JARVIS answers, it retrieves. Agents ask your memory the same question every day or week and speak up only when something new turned up.">
          <ul className="space-y-3 text-sm">
            {[
              "Retrieval before reasoning: hybrid search plus graph neighbours.",
              "Citations on every claim, linked back to the memory.",
              "Theses track the evidence for and against them, and every conviction change is remembered.",
              "Agents run when you open JARVIS or from any cron. They read your memory only; no prices, no news, no trades.",
              "Runs on Anthropic, OpenAI or a local model. Works offline without one, and never fills gaps with invented numbers.",
            ].map((t) => (
              <li key={t} className="flex gap-3 border-t border-line pt-3">
                <Check className="mt-0.5 size-4 shrink-0 text-cobalt" /> {t}
              </li>
            ))}
          </ul>
        </Feature>

        {/* 05 Briefing */}
        <Feature
          id="briefing"
          index="05"
          title="Your briefing"
          lede="Every day and every week: what needs your decision, what changed, what your agents found and what you have been writing about, ordered by what you hold."
        >
          <Shot src="/screenshots/briefing.png" alt="A weekly briefing: decisions waiting, what changed, agent findings and new links in the graph" />
        </Feature>

        {/* 06 Insights */}
        <Feature index="06" title="Insights" lede="JARVIS tells you what changed, why it matters and which memories show it. Every insight comes from a rule you can read, not a guess.">
          <article className="space-y-3 border border-line p-6">
            <span className="eyebrow bg-cobalt px-1.5 py-0.5 text-white">Second order</span>
            <h3 className="text-xl font-semibold tracking-tight">OpenAI reaches 86.3% of your portfolio</h3>
            <p className="text-sm"><span className="eyebrow mr-2 text-gray">What changed</span>OpenAI depends on NVIDIA, which issues NVDA (47.9%). It depends on Microsoft, which is linked to AMD (38.3%).</p>
            <p className="text-sm"><span className="eyebrow mr-2 text-gray">Why it matters</span>None of your holdings links to OpenAI directly, so the exposure is easy to miss.</p>
            <p className="eyebrow text-gray">From the fictional demo workspace</p>
          </article>
          <p className="eyebrow text-gray">Concentration · exposure change · goals · thesis change · contradictions · new connections · attention · second order · look-alikes</p>
        </Feature>

        {/* 07 Financial context */}
        <Feature index="07" title="Financial context" lede="Positions, transactions, watchlists and theses live next to the notes that explain them. A trade remembers why you made it.">
          <div className="overflow-x-auto border border-line">
            <div className="min-w-[440px]">
              <div className="eyebrow grid grid-cols-[56px_1fr_auto] gap-6 border-b border-line bg-surface px-4 py-2 text-gray">
                <span>Position</span><span>Thesis</span><span>Evidence</span>
              </div>
              {[
                ["NVDA", "AI infrastructure spend is still early", "1 for · 2 against"],
                ["AMD", "AMD takes share in inference", "1 for · 2 against"],
                ["ETH", "Ether as a settlement layer", "1 for · 0 against"],
              ].map(([a, t, e]) => (
                <div key={a} className="grid grid-cols-[56px_1fr_auto] items-baseline gap-6 border-b border-line px-4 py-3 text-sm last:border-b-0">
                  <span className="font-mono">{a}</span>
                  <span>{t}</span>
                  <span className="eyebrow text-gray">{e}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="eyebrow text-gray">From the fictional demo workspace</p>
        </Feature>

        {/* 08 Actions */}
        <Feature id="actions" index="08" title="Actions, never automatic" lede="JARVIS can propose a trade. Only you can approve it, by typing the order, and only you can submit it, in a separate step.">
          <ol className="grid gap-px border border-line bg-line sm:grid-cols-4">
            {[
              ["JARVIS proposes", "From a goal you set or a question you asked, with the reasoning and evidence."],
              ["You type the order", "Approval needs the exact phrase, like SELL 8.27 NVDA. It lasts 15 minutes."],
              ["You submit", "A second, separate step. The approved ticket is signed; any change after approval is refused."],
              ["It is remembered", "The fill becomes a trade memory, and every step lands in the audit log."],
            ].map(([t, d], i) => (
              <li key={t} className="space-y-2 bg-white p-4">
                <span className="font-mono text-xs text-cobalt">0{i + 1}</span>
                <p className="font-medium">{t}</p>
                <p className="text-sm text-gray">{d}</p>
              </li>
            ))}
          </ol>
          <Shot src="/screenshots/actions.png" alt="Reviewing a proposed sell order: the reasoning, the effect on exposure, and the box where you type the order to approve it" />
        </Feature>

        {/* 09 Robinhood and security */}
        <section id="robinhood" className="grid grid-cols-1 gap-8 border-t border-ink py-16 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-4">
            <Heading index="09" title="Robinhood, and your keys" />
            <p className="max-w-sm leading-relaxed text-gray">Official, documented interfaces only. Nothing reverse-engineered, nothing guessed.</p>
          </div>
          <div className="space-y-8 lg:col-span-8">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <tbody className="divide-y divide-line border-y border-line">
                  {[
                    ["Robinhood Chain", "Read-only wallet balance over the public RPC. No private keys, ever.", "Available"],
                    ["Robinhood Crypto Trading API", "Waiting on the official request and signing reference before any code is written.", "Planned"],
                    ["Demo brokerage", "Fictional account with paper fills, so the whole flow can be tried safely.", "Available"],
                  ].map(([k, v, st]) => (
                    <tr key={k}>
                      <th className="w-56 py-3 pr-4 text-left align-top font-medium">{k}</th>
                      <td className="py-3 pr-4 text-gray">{v}</td>
                      <td className={cn("eyebrow py-3 text-right align-top", st === "Available" ? "text-cobalt" : "text-gray")}>{st}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-px border border-line bg-line sm:grid-cols-3">
              {[
                ["Encrypted credentials", "AES-256-GCM, decrypted on the server only."],
                ["Keys stay server-side", "Model and broker keys never reach the browser."],
                ["Signed approvals", "HMAC-signed tickets, checked by the provider."],
                ["Audit log", "Every sign-in, approval, submission and connection."],
                ["Demo and live apart", "Every financial row carries its data mode."],
                ["No invented data", "No fetched prices; illustrative numbers are labelled."],
              ].map(([k, v]) => (
                <div key={k} className="space-y-1 bg-white p-4">
                  <p className="font-medium">{k}</p>
                  <p className="text-sm text-gray">{v}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 10 How it works */}
        <section id="how" className="grid grid-cols-1 gap-8 border-t border-ink py-16 lg:grid-cols-12">
          <Heading index="10" title="How it works" />
          <div className="lg:col-span-8">
            <ol className="grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-4">
              {LOOP.map((step, i) => (
                <li key={`${step}-${i}`} className={cn("flex min-h-28 flex-col justify-between bg-white p-4", i === 7 && "bg-cobalt text-white")}>
                  <span className={cn("font-mono text-xs", i === 7 ? "text-white/70" : "text-gray")}>{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-lg font-semibold tracking-tight">{step}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-sm text-gray">The loop closes on itself: every answer, insight, briefing and action becomes new memory.</p>
          </div>
        </section>

        {/* 11 Screenshots */}
        <section className="space-y-8 border-t border-ink py-16">
          <Heading index="11" title="The product" />
          <div className="grid gap-6 lg:grid-cols-2">
            <figure className="space-y-2">
              <Shot src="/screenshots/overview.png" alt="JARVIS overview: the command box and this week's briefing with the decisions waiting" />
              <figcaption className="eyebrow text-gray">Overview</figcaption>
            </figure>
            <figure className="space-y-2">
              <Shot src="/screenshots/ask.png" alt="An answer from JARVIS with the memories and graph entities it used listed below" />
              <figcaption className="eyebrow text-gray">Ask, with memory used</figcaption>
            </figure>
          </div>
        </section>

        {/* 12 Open source */}
        <section id="open-source" className="grid grid-cols-1 gap-8 border-t border-ink py-16 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-4">
            <Heading index="12" title="Run it yourself" />
            <p className="max-w-sm leading-relaxed text-gray">Open source. Two commands, no keys: an embedded Postgres, offline AI and the demo workspace. Add a model key when you want reasoning.</p>
          </div>
          <div className="space-y-4 lg:col-span-8">
            <pre className="overflow-x-auto bg-ink p-5 font-mono text-sm leading-relaxed text-white">
              <code>
                <span className="text-white/50"># Node.js 22</span>
                {"\n"}git clone {REPO}.git && cd JARVIS
                {"\n"}npm install
                {"\n"}npm run dev <span className="text-white/50"># http://localhost:3000</span>
              </code>
            </pre>
            <div className="flex flex-wrap gap-3">
              <a href={REPO} className={buttonVariants({ variant: "outline" })}>
                <GitBranch /> Repository
              </a>
              <a href={`${REPO}/blob/main/docs/architecture.md`} className={buttonVariants({ variant: "ghost" })}>
                Architecture <ArrowRight />
              </a>
            </div>
          </div>
        </section>

        {/* 13 CTA */}
        <section className="my-16 grid grid-cols-1 items-end gap-8 bg-cobalt p-8 text-white sm:p-12 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-8">
            <p className="eyebrow text-white/70">13 — Start</p>
            <h2 className="display text-[clamp(2.5rem,6vw,5.5rem)]">Give your portfolio a memory.</h2>
            <Link href="/login" className={buttonVariants({ variant: "secondary", size: "lg" })}>
              Explore the demo workspace <ArrowRight />
            </Link>
          </div>
          <div className="hidden justify-end sm:flex lg:col-span-4">
            <Mascot size={260} />
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="eyebrow mx-auto flex max-w-[1400px] flex-wrap justify-between gap-4 px-4 py-6 text-gray sm:px-8">
          <a href={REPO} className="hover:text-ink">JARVIS — open source</a>
          <span>Not investment advice. JARVIS never executes trades on its own.</span>
        </div>
      </footer>
    </div>
  );
}

function Heading({ index, title }: { index: string; title: string }) {
  return (
    <div className="space-y-2 lg:col-span-4">
      <p className="font-mono text-xs text-gray">{index}</p>
      <h2 className="text-4xl font-semibold leading-none tracking-[-0.035em] sm:text-5xl">{title}</h2>
    </div>
  );
}

function Feature({ id, index, title, lede, children }: { id?: string; index: string; title: string; lede: string; children: React.ReactNode }) {
  return (
    <section id={id} className="grid grid-cols-1 gap-8 border-t border-ink py-16 lg:grid-cols-12">
      <div className="space-y-4 lg:col-span-4">
        <Heading index={index} title={title} />
        <p className="max-w-sm leading-relaxed text-gray">{lede}</p>
      </div>
      <div className="space-y-4 lg:col-span-8">{children}</div>
    </section>
  );
}

function Shot({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="overflow-hidden border border-line bg-surface">
      <Image src={src} alt={alt} width={1440} height={900} className="h-auto w-full" />
    </div>
  );
}

/** MEMORY → CONNECTIONS → INTELLIGENCE → ACTION, drawn as four panels on the grid. */
function Pipeline() {
  const steps = [
    { title: "Memory", body: "Notes, theses, trades and research, stored with time and source.", art: <MemoryArt /> },
    { title: "Connections", body: "Entities and relationships extracted into a graph.", art: <GraphArt /> },
    { title: "Intelligence", body: "Retrieval, then reasoning with citations.", art: <InsightArt /> },
    { title: "Action", body: "Proposals you review and confirm. Never automatic.", art: <ActionArt /> },
  ];
  return (
    <section aria-label="Memory to connections to intelligence to action" className="grid border-y border-ink md:grid-cols-4">
      {steps.map((s, i) => (
        <div key={s.title} className={cn("flex flex-col gap-4 p-5", i > 0 && "border-t border-line md:border-l md:border-t-0")}>
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-xs text-gray">0{i + 1}</span>
            {i < 3 ? <ArrowRight className="hidden size-4 text-cobalt md:block" /> : null}
          </div>
          <div className="h-28">{s.art}</div>
          <h3 className="text-2xl font-semibold uppercase tracking-tight">{s.title}</h3>
          <p className="text-sm text-gray">{s.body}</p>
        </div>
      ))}
    </section>
  );
}

function MemoryArt() {
  return (
    <svg viewBox="0 0 200 112" className="h-full w-full" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <g key={i} transform={`translate(${i * 8} ${i * 20})`}>
          <rect x="0" y="0" width="150" height="16" fill={i === 3 ? "#3046F5" : "#F5F7FA"} />
          <rect x="6" y="6" width={60 + i * 14} height="4" fill={i === 3 ? "#FFFFFF" : "#0A0A0A"} />
        </g>
      ))}
    </svg>
  );
}

function GraphArt() {
  const n: [number, number][] = [[30, 30], [90, 20], [150, 40], [60, 80], [120, 90], [175, 95]];
  const e: [number, number][] = [[0, 1], [1, 2], [0, 3], [1, 3], [3, 4], [2, 4], [4, 5], [1, 4]];
  return (
    <svg viewBox="0 0 200 112" className="h-full w-full" aria-hidden>
      {e.map(([a, b], i) => <line key={i} x1={n[a][0]} y1={n[a][1]} x2={n[b][0]} y2={n[b][1]} stroke={i === 7 ? "#3046F5" : "#D0D5DD"} strokeWidth={i === 7 ? 2 : 1} />)}
      {n.map(([x, y], i) => (i === 1 ? <rect key={i} x={x - 7} y={y - 7} width="14" height="14" fill="#3046F5" /> : <circle key={i} cx={x} cy={y} r={i === 4 ? 8 : 5} fill="#0A0A0A" />))}
      <circle cx="120" cy="90" r="12" fill="none" stroke="#00F0FF" strokeWidth="2" />
    </svg>
  );
}

function InsightArt() {
  return (
    <svg viewBox="0 0 200 112" className="h-full w-full" aria-hidden>
      <rect x="0" y="4" width="200" height="104" fill="#F5F7FA" />
      <rect x="12" y="16" width="44" height="8" fill="#3046F5" />
      <rect x="12" y="34" width="150" height="6" fill="#0A0A0A" />
      <rect x="12" y="46" width="120" height="6" fill="#0A0A0A" />
      <rect x="12" y="66" width="170" height="3" fill="#A3A3A3" />
      <rect x="12" y="74" width="140" height="3" fill="#A3A3A3" />
      <text x="12" y="98" fontFamily="monospace" fontSize="9" fill="#3046F5">M1 · M4 · E2</text>
    </svg>
  );
}

function ActionArt() {
  return (
    <svg viewBox="0 0 200 112" className="h-full w-full" aria-hidden>
      <rect x="0.5" y="10.5" width="199" height="92" fill="#FFFFFF" stroke="#E3E6EB" />
      <rect x="12" y="24" width="90" height="6" fill="#0A0A0A" />
      <rect x="12" y="38" width="140" height="3" fill="#A3A3A3" />
      <rect x="12" y="46" width="110" height="3" fill="#A3A3A3" />
      <rect x="12" y="70" width="80" height="20" fill="#3046F5" />
      <text x="22" y="84" fontFamily="sans-serif" fontSize="9" fill="#FFFFFF">Confirm</text>
      <rect x="100.5" y="70.5" width="70" height="19" fill="#FFFFFF" stroke="#0A0A0A" />
      <text x="114" y="84" fontFamily="sans-serif" fontSize="9" fill="#0A0A0A">Review</text>
    </svg>
  );
}
