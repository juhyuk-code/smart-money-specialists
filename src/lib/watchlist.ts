export type WatchTargetType = "market" | "wallet";

export type WatchTarget = {
  type: WatchTargetType;
  id: string;
  label: string;
  href: string;
  subtitle?: string;
  tags?: string[];
};

export type WatchItem = WatchTarget & {
  addedAt: string;
};

export const WATCHLIST_KEY = "pref:watchlist";

export function readWatchlist(): WatchItem[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(WATCHLIST_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isWatchItem) : [];
  } catch {
    return [];
  }
}

export function isWatched(type: WatchTargetType, id: string) {
  const key = watchKey(type, id);
  return readWatchlist().some((item) => watchKey(item.type, item.id) === key);
}

export function toggleWatch(target: WatchTarget): WatchItem[] {
  const current = readWatchlist();
  const key = watchKey(target.type, target.id);
  const existing = current.some((item) => watchKey(item.type, item.id) === key);
  const next = existing
    ? current.filter((item) => watchKey(item.type, item.id) !== key)
    : [{ ...target, addedAt: new Date().toISOString() }, ...current];
  writeWatchlist(next);
  return next;
}

export function removeWatch(type: WatchTargetType, id: string) {
  const key = watchKey(type, id);
  const next = readWatchlist().filter((item) => watchKey(item.type, item.id) !== key);
  writeWatchlist(next);
  return next;
}

export function watchKey(type: WatchTargetType, id: string) {
  return `${type}:${id.toLowerCase()}`;
}

function writeWatchlist(items: WatchItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("pref:watchlist-change", { detail: items }));
}

function isWatchItem(value: unknown): value is WatchItem {
  if (!value || typeof value !== "object") return false;
  const item = value as WatchItem;
  return (
    (item.type === "market" || item.type === "wallet") &&
    typeof item.id === "string" &&
    typeof item.label === "string" &&
    typeof item.href === "string" &&
    typeof item.addedAt === "string"
  );
}
