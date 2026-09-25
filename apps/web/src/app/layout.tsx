import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "JARVIS — Your financial second brain", template: "%s · JARVIS" },
  description:
    "JARVIS remembers your notes, theses, research and trades, connects them into a knowledge graph, and answers with the context that matters.",
};

export const viewport: Viewport = { themeColor: "#ffffff" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
