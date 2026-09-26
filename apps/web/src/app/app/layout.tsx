import { redirect } from "next/navigation";
import { Providers } from "@/components/providers";
import { Shell } from "@/components/shell";
import { pendingActionCount } from "@/server/actions";
import { getSessionUser } from "@/server/auth";
import { services } from "@/server/container";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { db } = await services();
  const pending = await pendingActionCount(db, user.id);
  return (
    <Providers>
      <Shell user={{ email: user.email, displayName: user.displayName, mode: user.mode }} badges={{ "/app/actions": pending }}>
        {children}
      </Shell>
    </Providers>
  );
}
