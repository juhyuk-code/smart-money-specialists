import clsx from "clsx";
import type { ReactNode, HTMLAttributes } from "react";

export function Pill({
  children,
  tone = "ink",
  className,
}: {
  children: ReactNode;
  tone?: "ink" | "accent";
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 px-2 py-[2px] rounded-[2px] text-[10px] uppercase tracking-[0.6px] font-mono border",
        tone === "accent"
          ? "text-accent border-accent bg-[rgba(96,165,250,0.08)]"
          : "text-ink-2 border-ink-3 bg-transparent",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Note({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={style}
      className={clsx(
        "inline-block px-2 py-1 border border-dashed border-accent rounded-[2px]",
        "bg-black/40 text-accent text-[10px] uppercase tracking-[0.4px] leading-[1.4] font-mono",
        className,
      )}
    >
      <span className="opacity-60">{"// "}</span>
      {children}
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="text-accent text-[10px] uppercase tracking-[2px] font-mono">
      {children}
    </div>
  );
}

export function Stripes({
  height = 60,
  label,
  className,
}: {
  height?: number;
  label?: string;
  className?: string;
}) {
  return (
    <div
      style={{
        height,
        backgroundImage:
          "repeating-linear-gradient(135deg, transparent 0 6px, rgba(255,255,255,0.03) 6px 7px)",
      }}
      className={clsx(
        "rounded-[2px] border border-ink-3 flex items-center justify-center",
        className,
      )}
    >
      {label ? (
        <span className="text-ink-3 text-[10px] uppercase tracking-[1px] font-mono">
          {label}
        </span>
      ) : null}
    </div>
  );
}

export function SparkLine({
  width = 90,
  height = 22,
  up = true,
  className,
}: {
  width?: number;
  height?: number;
  up?: boolean;
  className?: string;
}) {
  const points = up
    ? "2,18 12,15 22,16 32,11 42,13 52,7 62,9 72,4 82,6 88,2"
    : "2,4 12,8 22,5 32,12 42,9 52,15 62,11 72,17 82,14 88,20";
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={clsx("block", className)}
    >
      <polyline
        points={points}
        fill="none"
        stroke={up ? "var(--accent)" : "var(--ink-2)"}
        strokeWidth="1.2"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

export function LiveDot({ label = "LIVE" }: { label?: string }) {
  return (
    <div className="flex items-center gap-[6px]">
      <span className="live-dot" aria-hidden="true" />
      <span className="text-[10px] uppercase tracking-[1px] text-ink-2 font-mono">
        {label}
      </span>
    </div>
  );
}

export function StatCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex-1 border border-ink-3 rounded-[2px] px-[14px] py-3 bg-paper-2">
      <div className="text-[9px] uppercase tracking-[1.2px] text-ink-3 font-mono mb-[6px]">
        {label}
      </div>
      <div
        className={clsx(
          "text-[22px] font-medium font-mono leading-[1.2]",
          highlight ? "text-accent" : "text-ink",
        )}
        style={{ letterSpacing: "-0.01em" }}
      >
        {value}
      </div>
    </div>
  );
}

export function Frame({
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={clsx(
        "frame-grid w-full min-h-screen bg-paper text-ink font-mono",
        rest.className,
      )}
    >
      {children}
    </div>
  );
}
