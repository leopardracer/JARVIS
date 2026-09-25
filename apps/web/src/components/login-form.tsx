"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, cn, Input, Label, Spinner } from "@jarvis/ui";
import { api, ApiError } from "@/lib/api";

export function LoginForm({ next, demoEnabled }: { next: string; demoEnabled: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [form, setForm] = useState({ email: "", password: "", displayName: "" });
  const [pending, setPending] = useState<"form" | "demo" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<Record<string, string[]>>({});

  async function run(kind: "form" | "demo") {
    setPending(kind);
    setError(null);
    setIssues({});
    try {
      if (kind === "demo") await api("/api/auth/demo", { method: "POST" });
      else
        await api(mode === "signin" ? "/api/auth/login" : "/api/auth/signup", {
          method: "POST",
          body: JSON.stringify(mode === "signin" ? { email: form.email, password: form.password } : form),
        });
      router.push(next);
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.issues ? null : e.message);
        setIssues(e.issues ?? {});
      } else setError("Could not reach JARVIS. Try again.");
      setPending(null);
    }
  }

  return (
    <div className="space-y-6">
      {demoEnabled ? (
        <>
          <Button size="lg" className="w-full" onClick={() => run("demo")} disabled={!!pending}>
            {pending === "demo" ? <Spinner /> : null} Explore the demo workspace
          </Button>
          <div className="eyebrow flex items-center gap-3 text-gray">
            <span className="h-px flex-1 bg-line" /> or use your account <span className="h-px flex-1 bg-line" />
          </div>
        </>
      ) : null}

      <div className="flex border-b border-line" role="tablist">
        {(["signin", "signup"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            type="button"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cn("-mb-px border-b-2 px-1 pb-2 mr-6 text-sm", mode === m ? "border-cobalt text-ink" : "border-transparent text-gray hover:text-ink")}
          >
            {m === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          run("form");
        }}
      >
        {mode === "signup" ? (
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" autoComplete="name" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} aria-invalid={!!issues.email} />
          {issues.email ? <p className="text-xs text-danger">{issues.email[0]}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
            minLength={10}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            aria-invalid={!!issues.password}
          />
          {issues.password ? <p className="text-xs text-danger">{issues.password[0]}</p> : mode === "signup" ? <p className="text-xs text-gray">At least 10 characters.</p> : null}
        </div>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" variant="secondary" className="w-full" disabled={!!pending}>
          {pending === "form" ? <Spinner /> : null} {mode === "signin" ? "Sign in" : "Create account"}
        </Button>
      </form>
    </div>
  );
}
