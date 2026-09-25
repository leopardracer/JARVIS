import Image from "next/image";
import { cn } from "@jarvis/ui";

/** Lowercase "jarvis" wordmark: white rounded letters on cobalt. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[6px] bg-cobalt px-2 pb-[3px] pt-px text-[17px] font-semibold lowercase leading-none tracking-[-0.04em] text-white",
        className,
      )}
    >
      jarvis
    </span>
  );
}

export function Mascot({ size = 160, className, priority }: { size?: number; className?: string; priority?: boolean }) {
  return (
    <Image
      src="/jarvis-mascot.png"
      alt="The JARVIS rover"
      width={size}
      height={Math.round(size * (1199 / 1312))}
      priority={priority}
      className={cn("select-none", className)}
    />
  );
}

/** Empty state with the mascot. Used where there is nothing to show yet. */
export function EmptyState({ title, children, action, size = 120 }: { title: string; children?: React.ReactNode; action?: React.ReactNode; size?: number }) {
  return (
    <div className="flex flex-col items-start gap-5 border border-dashed border-line p-8 sm:flex-row sm:items-center">
      <Mascot size={size} />
      <div className="max-w-md space-y-2">
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        {children ? <div className="text-sm leading-relaxed text-gray">{children}</div> : null}
        {action ? <div className="pt-2">{action}</div> : null}
      </div>
    </div>
  );
}
