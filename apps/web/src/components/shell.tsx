"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Command, LogOut } from "lucide-react";
import { Badge, cn, Kbd } from "@jarvis/ui";
import { Wordmark } from "./brand";
import { useAsk } from "./ask";

export const NAV = [
  { href: "/app", label: "Overview" },
  { href: "/app/memory", label: "Memory" },
  { href: "/app/graph", label: "Knowledge Graph" },
  { href: "/app/portfolio", label: "Portfolio" },
  { href: "/app/research", label: "Research" },
  { href: "/app/insights", label: "Insights" },
  { href: "/app/actions", label: "Actions" },
  { href: "/app/watchlist", label: "Watchlist" },
  { href: "/app/activity", label: "Activity" },
  { href: "/app/settings", label: "Settings" },
] as const;

type ShellUser = { email: string; displayName: string | null; mode: "demo" | "live" };

export function Shell({ user, children, badges = {} }: { user: ShellUser; children: React.ReactNode; badges?: Record<string, number> }) {
  const pathname = usePathname();
  const router = useRouter();
  const { setOpen } = useAsk();
  const active = (href: string) => (href === "/app" ? pathname === "/app" : pathname.startsWith(href));

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="sticky top-0 z-30 border-b border-line bg-white lg:h-dvh lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-4 py-3 lg:px-5 lg:py-5">
          <Link href="/app" aria-label="JARVIS overview">
            <Wordmark />
          </Link>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 border border-line px-2 py-1 text-xs text-gray hover:border-ink hover:text-ink lg:hidden"
          >
            <Command className="size-3" /> Ask
          </button>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 lg:flex-col lg:gap-0 lg:px-3 lg:pb-0" aria-label="Main">
          {NAV.map((item, i) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active(item.href) ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-baseline gap-3 px-2 py-1.5 text-sm transition-colors lg:py-2",
                active(item.href) ? "bg-ink text-white" : "text-ink hover:bg-surface",
              )}
            >
              <span className={cn("hidden font-mono text-[10px] lg:inline", active(item.href) ? "text-white/60" : "text-gray")}>
                {String(i + 1).padStart(2, "0")}
              </span>
              {item.label}
              {badges[item.href] ? (
                <span className="tabular ml-auto self-center bg-signal px-1.5 font-mono text-[10px] leading-4 text-ink" aria-label={`${badges[item.href]} waiting for review`}>
                  {badges[item.href]}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>

        <div className="hidden px-5 pt-6 lg:block">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex w-full items-center justify-between border border-line px-3 py-2 text-sm text-gray transition-colors hover:border-ink hover:text-ink"
          >
            Ask JARVIS <Kbd>⌘K</Kbd>
          </button>
        </div>

        <div className="absolute inset-x-0 bottom-0 hidden space-y-3 border-t border-line p-5 lg:block">
          <Badge tone={user.mode === "demo" ? "signal" : "ink"}>{user.mode === "demo" ? "Demo data" : "Live account"}</Badge>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs text-gray" title={user.email}>
              {user.displayName ?? user.email}
            </span>
            <button type="button" onClick={signOut} aria-label="Sign out" className="text-gray hover:text-ink">
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      <main className="min-w-0">
        {user.mode === "demo" ? (
          <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-1.5 text-xs text-gray sm:px-8">
            <span>
              You are in the demo workspace. Companies, notes and trades are fictional; prices are illustrative, not market data.
            </span>
            <button type="button" onClick={signOut} className="shrink-0 underline underline-offset-2 hover:text-ink lg:hidden">
              Sign out
            </button>
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}

/** Page header on the grid: eyebrow, title, optional description and actions. */
export function PageHeader({ index, title, description, actions }: { index: string; title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="flex flex-col gap-4 px-4 pb-6 pt-8 sm:px-8 md:flex-row md:items-end md:justify-between lg:pt-12">
      <div className="space-y-3">
        <p className="eyebrow text-gray">{index}</p>
        <h1 className={cn("display text-balance", title.length > 28 ? "max-w-4xl text-3xl sm:text-5xl" : "text-5xl sm:text-6xl")}>{title}</h1>
        {typeof description === "string" ? <p className="max-w-xl text-sm leading-relaxed text-gray">{description}</p> : description}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </header>
  );
}
