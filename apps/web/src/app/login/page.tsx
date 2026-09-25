import Link from "next/link";
import { redirect } from "next/navigation";
import { Mascot, Wordmark } from "@/components/brand";
import { LoginForm } from "@/components/login-form";
import { getSessionUser } from "@/server/auth";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getSessionUser()) redirect("/app");
  const next = (await searchParams).next;
  const safeNext = typeof next === "string" && next.startsWith("/app") ? next : "/app";
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <section className="flex flex-col justify-between gap-12 px-4 py-6 sm:px-10">
        <Link href="/" aria-label="JARVIS home"><Wordmark /></Link>
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2">
            <h1 className="display text-5xl">Welcome back.</h1>
            <p className="text-sm text-gray">Your memory, graph and theses are where you left them.</p>
          </div>
          <LoginForm next={safeNext} demoEnabled={process.env.JARVIS_DISABLE_DEMO !== "1"} />
        </div>
        <p className="eyebrow text-gray">Not investment advice · JARVIS never trades on its own</p>
      </section>
      <section className="relative hidden flex-col justify-between overflow-hidden bg-cobalt p-10 text-white lg:flex">
        <p className="eyebrow text-white/70">Memory → Connections → Intelligence → Action</p>
        <Mascot size={420} priority className="self-center" />
        <p className="max-w-md text-2xl font-medium leading-snug tracking-tight">
          Remember everything. Connect the dots. Act with context.
        </p>
      </section>
    </div>
  );
}
