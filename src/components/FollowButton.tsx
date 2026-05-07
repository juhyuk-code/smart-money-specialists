"use client";

import { useEffect, useState } from "react";
import { isWatched, toggleWatch, type WatchTarget } from "@/lib/watchlist";

export function FollowButton({
  target,
  className = "",
  compact = false,
}: {
  target: WatchTarget;
  className?: string;
  compact?: boolean;
}) {
  const [followed, setFollowed] = useState(false);

  useEffect(() => {
    setFollowed(isWatched(target.type, target.id));

    function handleChange() {
      setFollowed(isWatched(target.type, target.id));
    }

    window.addEventListener("pref:watchlist-change", handleChange);
    window.addEventListener("storage", handleChange);
    return () => {
      window.removeEventListener("pref:watchlist-change", handleChange);
      window.removeEventListener("storage", handleChange);
    };
  }, [target.id, target.type]);

  return (
    <button
      type="button"
      aria-pressed={followed}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const next = toggleWatch(target);
        setFollowed(next.some((item) => item.type === target.type && item.id === target.id));
      }}
      className={`rounded-[2px] border px-3 py-2 font-mono text-[10px] uppercase tracking-[1px] transition-colors active:translate-y-px ${
        followed
          ? "border-accent bg-[rgba(97,168,255,0.13)] text-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
          : "border-ink-3 bg-[rgba(255,255,255,0.015)] text-ink-2 hover:border-accent hover:bg-[rgba(97,168,255,0.08)] hover:text-accent"
      } ${compact ? "px-2 py-1 tracking-[0.7px]" : ""} ${className}`}
    >
      {followed ? "following" : "follow"}
    </button>
  );
}
