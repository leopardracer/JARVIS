import { redirect } from "next/navigation";
import { Providers } from "@/components/providers";
import { Shell } from "@/components/shell";
import { getSessionUser } from "@/server/auth";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return (
    <Providers>
      <Shell user={{ email: user.email, displayName: user.displayName, mode: user.mode }}>{children}</Shell>
    </Providers>
  );
}
