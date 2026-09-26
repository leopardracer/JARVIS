import { redirect } from "next/navigation";
import { after } from "next/server";
import { Providers } from "@/components/providers";
import { Shell } from "@/components/shell";
import { pendingActionCount } from "@/server/actions";
import { getSessionUser } from "@/server/auth";
import { services } from "@/server/container";
import { catchUp } from "@/server/scheduler";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const svc = await services();
  const pending = await pendingActionCount(svc.db, user.id);
  // Agents whose turn has passed run after the page is sent, so no install needs a scheduler.
  after(() => catchUp(svc, user.id).catch((error) => console.error("Agent catch-up failed", error)));
  return (
    <Providers>
      <Shell user={{ email: user.email, displayName: user.displayName, mode: user.mode }} badges={{ "/app/actions": pending }}>
        {children}
      </Shell>
    </Providers>
  );
}
