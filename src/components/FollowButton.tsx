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
      className={`border px-3 py-2 font-mono text-[10px] uppercase tracking-[1px] transition-colors ${
        followed
          ? "border-accent bg-[rgba(96,165,250,0.12)] text-accent"
          : "border-ink-3 bg-transparent text-ink-2 hover:border-accent hover:text-accent"
      } ${compact ? "px-2 py-1 tracking-[0.7px]" : ""} ${className}`}
    >
      {followed ? "following" : "follow"}
    </button>
  );
}
