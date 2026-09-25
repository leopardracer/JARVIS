import type { Metadata } from "next";
import Link from "next/link";
import { Inter_Tight } from "next/font/google";
import "./globals.css";

const grotesk = Inter_Tight({
  variable: "--font-grotesk",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: "JARVIS",
  description:
    "Your AI second brain that remembers your notes and explains your portfolio on Robinhood Chain.",
};

const nav = [
  { href: "/chat", label: "Chat" },
  { href: "/wallet", label: "Wallet" },
  { href: "/#info", label: "Info" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${grotesk.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <header className="sticky top-0 z-10 bg-background/90 backdrop-blur">
          <nav className="flex items-baseline justify-between px-4 py-4 text-sm uppercase tracking-wide sm:px-6">
            <Link href="/" className="font-semibold">
              Jarvis
            </Link>
            <div className="flex gap-6">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="hover:underline underline-offset-4"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
        <footer className="flex justify-between border-t border-hairline px-4 py-4 text-xs uppercase tracking-wide text-muted sm:px-6">
          <span>Jarvis © 2026</span>
          <span>Not investment advice</span>
        </footer>
      </body>
    </html>
  );
}
