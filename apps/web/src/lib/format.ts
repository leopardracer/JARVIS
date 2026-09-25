const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const shortFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export const formatDate = (d: string | Date) => dateFmt.format(new Date(d));
export const formatShortDate = (d: string | Date) => shortFmt.format(new Date(d));

export function timeAgo(d: string | Date) {
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  return formatShortDate(d);
}

export function money(n: number | null | undefined, currency = "USD") {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: n < 100 ? 2 : 0 }).format(n);
}

export const quantity = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(n);
export const percent = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(1)}%`);

export const label = (s: string) => s.replace(/_/g, " ");
