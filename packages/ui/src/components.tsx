import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-cobalt text-white hover:bg-cobalt-deep",
        secondary: "bg-ink text-white hover:bg-ink/85",
        outline: "border border-line bg-white text-ink hover:border-ink",
        ghost: "text-ink hover:bg-surface",
        danger: "border border-line bg-white text-danger hover:border-danger",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

const field =
  "w-full border border-line bg-white px-3 text-sm text-ink placeholder:text-gray transition-colors focus:border-cobalt focus:outline-none disabled:opacity-50 aria-invalid:border-danger";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(field, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(field, "min-h-28 resize-y py-2.5 leading-relaxed", className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(field, "h-10 appearance-none pr-8", className)} {...props} />;
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("eyebrow block text-gray", className)} {...props} />;
}

export const badgeVariants = cva("inline-flex items-center gap-1 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em]", {
  variants: {
    tone: {
      neutral: "bg-surface text-ink",
      cobalt: "bg-cobalt text-white",
      outline: "border border-line text-gray",
      ink: "bg-ink text-white",
      signal: "bg-signal text-ink",
      danger: "bg-danger/10 text-danger",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/** A bordered block on the grid. Use sparingly: most content sits directly on the page. */
export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border border-line bg-white", className)} {...props} />;
}

/** Numbered section label, e.g. "01 Memory". */
export function SectionLabel({ index, children, className, action }: { index?: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 border-t border-ink pt-2", className)}>
      <h2 className="eyebrow flex gap-3 text-ink">
        {index ? <span className="text-gray">{index}</span> : null}
        <span>{children}</span>
      </h2>
      {action}
    </div>
  );
}

export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <kbd className={cn("border border-line px-1 font-mono text-[10px] text-gray", className)} {...props} />;
}

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse bg-surface", className)} {...props} />;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn("inline-block size-3.5 animate-spin border-2 border-current border-r-transparent", className)}
    />
  );
}
