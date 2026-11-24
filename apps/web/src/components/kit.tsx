import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cx, isLive, statusColor, statusLabel } from "@/lib/format";
import type { Effect, RunStatus } from "@/lib/types";

/* keel mark: a hull in section, the keel running down the centre */
export function Mark({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none">
      <path d="M3 7.5h18l-3.2 6.6a6 6 0 0 1-5.4 3.4h-.8a6 6 0 0 1-5.4-3.4L3 7.5Z" fill="currentColor" />
      <path d="M12 17.5V22" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2 text-ink", className)}>
      <Mark className="size-[18px]" />
      <span className="font-serif text-[22px] leading-none tracking-tight">keel</span>
    </span>
  );
}

export function StatusDot({ status, className }: { status: RunStatus; className?: string }) {
  return (
    <span
      className={cx("inline-block size-2 shrink-0 rounded-full", isLive(status) && "animate-pulse-dot", className)}
      style={{ background: statusColor[status] }}
      aria-hidden
    />
  );
}

export function StatusBadge({ status }: { status: RunStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] text-ink-2">
      <StatusDot status={status} />
      {statusLabel[status]}
    </span>
  );
}

const effectStyle: Record<Effect, string> = {
  pure: "text-muted-foreground border-rule",
  sandboxed: "text-st-waiting border-[color-mix(in_oklab,var(--st-waiting)_30%,transparent)]",
  external: "text-st-review border-[color-mix(in_oklab,var(--st-review)_35%,transparent)]",
};

export function EffectTag({ effect }: { effect: Effect }) {
  return (
    <span className={cx("inline-flex h-5 items-center rounded-full border px-2 text-[11.5px] font-medium", effectStyle[effect])}>
      {effect}
    </span>
  );
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
const btn: Record<BtnVariant, string> = {
  primary: "bg-ink text-paper hover:bg-ink-2 shadow-[inset_0_1px_0_rgb(255_255_255/0.12)]",
  secondary: "bg-raised text-ink border border-rule-strong hover:bg-wash shadow-[0_1px_0_var(--rule)]",
  ghost: "text-ink-2 hover:bg-wash hover:text-ink",
  danger: "bg-raised text-st-failed border border-rule-strong hover:bg-wash",
};
const size = { sm: "h-7 px-2.5 text-[13px] gap-1.5", md: "h-8 px-3 text-[13.5px] gap-2", lg: "h-10 px-4 text-[14.5px] gap-2" };

export function Button({
  variant = "secondary",
  size: s = "md",
  className,
  ...rest
}: ComponentProps<"button"> & { variant?: BtnVariant; size?: keyof typeof size }) {
  return (
    <button
      className={cx("inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:opacity-50", btn[variant], size[s], className)}
      {...rest}
    />
  );
}

export function ButtonLink({
  variant = "secondary",
  size: s = "md",
  className,
  ...rest
}: ComponentProps<typeof Link> & { variant?: BtnVariant; size?: keyof typeof size }) {
  return (
    <Link
      className={cx("inline-flex items-center justify-center rounded-md font-medium transition-colors", btn[variant], size[s], className)}
      {...rest}
    />
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-rule bg-raised px-1 font-sans text-[11px] text-muted-foreground">
      {children}
    </kbd>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name.replace(/[^A-Za-z ]/g, "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span
      className={cx("inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[9.5px] font-semibold text-white", className)}
      style={{ background: `oklch(0.58 0.09 ${h})` }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("font-mono text-[12.5px] tracking-tight", className)}>{children}</span>;
}
