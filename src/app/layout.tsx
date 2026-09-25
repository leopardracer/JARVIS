import type { Metadata } from "next";
import Link from "next/link";
import { Nunito } from "next/font/google";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: "JARVIS",
  description:
    "Your AI second brain that remembers your notes and explains your portfolio on Robinhood Chain.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${nunito.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <header className="border-b border-border">
          <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
            <Link
              href="/"
              className="rounded-lg bg-brand px-3 py-1 text-lg font-extrabold lowercase text-brand-foreground"
            >
              jarvis
            </Link>
            <Link href="/chat" className="text-muted hover:text-foreground">
              Chat
            </Link>
            <Link href="/wallet" className="text-muted hover:text-foreground">
              Wallet
            </Link>
          </nav>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
      </body>
    </html>
  );
}
