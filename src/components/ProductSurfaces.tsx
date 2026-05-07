import Link from "next/link";
import { Eyebrow, Frame, Pill, SparkLine, StatCard } from "@/components/ui";
import { NavBar } from "@/components/NavBar";

const LEADER_ROWS = Array.from({ length: 8 });
const FEED_ROWS = Array.from({ length: 7 });
const WALLET_ROWS = Array.from({ length: 6 });
const POSITION_ROWS = Array.from({ length: 5 });

export function LeadersSurface() {
  return (
    <Frame>
      <NavBar />
      <main className="px-4 py-5 sm:px-5 md:px-8 md:py-7">
        <section className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-[6px]">
            <Eyebrow>{"// LEADERBOARD ▸ 30D"}</Eyebrow>
            <h1 className="font-mono text-[19px] font-medium uppercase leading-tight tracking-[1px] text-ink sm:text-[21px] md:text-[24px]">
              PREF · LEADERS
            </h1>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:overflow-visible sm:pb-0">
            <Pill>30d</Pill>
            <Pill tone="accent">7d</Pill>
            <Pill>24h</Pill>
            <Pill>filter</Pill>
          </div>
        </section>

        <section className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard label="tracked wallets" value="--" />
          <StatCard label="avg roi" value="--" highlight />
          <StatCard label="volume / 24h" value="--" highlight />
          <StatCard label="consensus market" value="--" />
        </section>

        <section className="overflow-x-auto border border-ink-3 bg-paper-2">
          <div className="min-w-[820px]">
            <TableHeader columns="42px 44px 1fr 128px 84px 100px 160px 86px">
              <span>#</span>
              <span />
              <span>wallet</span>
              <span>p&l</span>
              <span>win %</span>
              <span>volume</span>
              <span>trend</span>
              <span />
            </TableHeader>
            {LEADER_ROWS.map((_, index) => (
              <Link
                key={index}
                href={`/wallets/wallet-${index + 1}`}
                className="grid items-center gap-3 border-b border-dashed border-ink-3 px-3 py-3 last:border-b-0 hover:bg-ink-bg-soft"
                style={{ gridTemplateColumns: "42px 44px 1fr 128px 84px 100px 160px 86px" }}
              >
                <span className="font-mono text-[12px] text-ink-3">{String(index + 1).padStart(2, "0")}</span>
                <span className="h-6 w-6 border border-ink-3" />
                <SkeletonLine width={index % 2 === 0 ? "70%" : "56%"} />
                <SkeletonLine width="76%" accent={index < 3} />
                <SkeletonLine width="42%" />
                <SkeletonLine width="60%" />
                <SparkLine up={index < 5} width={120} />
                <span className="justify-self-end border border-ink-3 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.7px] text-ink-3">
                  view
                </span>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </Frame>
  );
}

export function FeedSurface() {
  return (
    <Frame>
      <NavBar />
      <main className="grid min-h-[calc(100vh-51px)] lg:grid-cols-[1fr_320px]">
        <section className="border-r border-ink-3">
          <header className="flex flex-col gap-4 border-b border-ink-3 bg-paper-2 px-4 py-5 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-[6px]">
              <Eyebrow>{"// FEED ▸ STREAM"}</Eyebrow>
              <h1 className="font-mono text-[20px] font-medium uppercase tracking-[1px] text-ink sm:text-[24px]">
                LIVE SPECIALIST FEED
              </h1>
              <div className="flex items-center gap-[6px]">
                <span className="live-dot" />
                <span className="font-mono text-[10px] uppercase tracking-[1px] text-ink-2">
                  stream surface
                </span>
              </div>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 sm:overflow-visible sm:pb-0">
              <Pill tone="accent">all</Pill>
              <Pill>buys</Pill>
              <Pill>sells</Pill>
              <Pill>size</Pill>
            </div>
          </header>

          <div>
            {FEED_ROWS.map((_, index) => (
              <article
                key={index}
                className="grid grid-cols-[52px_36px_1fr_auto] gap-3 border-b border-dashed border-ink-3 px-4 py-4 sm:px-6"
              >
                <span className="font-mono text-[11px] text-ink-3">--:--</span>
                <span className="h-6 w-6 border border-ink-3" />
                <div className="grid min-w-0 gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <SkeletonLine width="120px" />
                    <SkeletonLine width="54px" accent={index % 3 === 0} />
                    <SkeletonLine width="62px" />
                  </div>
                  <SkeletonLine width={index % 2 === 0 ? "72%" : "52%"} height="14px" />
                </div>
                <span className="hidden self-start border border-ink-3 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.7px] text-ink-3 sm:block">
                  view
                </span>
              </article>
            ))}
          </div>
        </section>

        <aside className="grid content-between gap-6 bg-paper-2 p-4 sm:p-5">
          <section className="grid gap-3">
            <h2 className="font-mono text-[9px] uppercase tracking-[1.4px] text-ink-3">
              trending with specialists
            </h2>
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex items-center justify-between border border-ink-3 bg-paper px-3 py-3">
                <SkeletonLine width={index % 2 === 0 ? "64%" : "48%"} />
                <SkeletonLine width="34px" accent={index === 0} />
              </div>
            ))}
          </section>
          <div className="border border-dashed border-accent p-3 font-mono text-[10px] uppercase tracking-[1px] text-accent">
            context rail
          </div>
        </aside>
      </main>
    </Frame>
  );
}

export function WalletsSurface() {
  return (
    <Frame>
      <NavBar />
      <main className="px-4 py-5 sm:px-5 md:px-8 md:py-7">
        <section className="mb-5 flex flex-col gap-[6px]">
          <Eyebrow>{"// WALLETS ▸ INDEX"}</Eyebrow>
          <h1 className="font-mono text-[20px] font-medium uppercase tracking-[1px] text-ink sm:text-[24px]">
            SPECIALIST WALLETS
          </h1>
        </section>

        <section className="overflow-hidden border border-ink-3 bg-paper-2">
          {WALLET_ROWS.map((_, index) => (
            <Link
              key={index}
              href={`/wallets/wallet-${index + 1}`}
              className="grid grid-cols-[36px_1fr_auto] items-center gap-3 border-b border-dashed border-ink-3 px-4 py-3 last:border-b-0 hover:bg-ink-bg-soft"
            >
              <span className="h-6 w-6 border border-ink-3" />
              <div className="grid gap-2">
                <SkeletonLine width={index % 2 === 0 ? "220px" : "160px"} />
                <SkeletonLine width="110px" />
              </div>
              <Pill>detail</Pill>
            </Link>
          ))}
        </section>
      </main>
    </Frame>
  );
}

export function WalletDetailSurface({ wallet }: { wallet: string }) {
  return (
    <Frame>
      <NavBar />
      <main className="grid gap-6 px-4 py-5 sm:px-5 md:px-8 md:py-7">
        <nav className="font-mono text-[10px] uppercase tracking-[1px] text-ink-3">
          <Link href="/" className="hover:text-ink-2">leaders</Link>
          <span className="px-1">/</span>
          <span className="text-ink-2">{wallet}</span>
        </nav>

        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="h-14 w-14 shrink-0 border border-ink-3" />
            <div className="min-w-0">
              <h1 className="truncate font-mono text-[22px] text-ink sm:text-[28px]">{wallet}</h1>
              <div className="mt-2 flex flex-wrap gap-2">
                <Pill tone="accent">rank</Pill>
                <Pill>specialist</Pill>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="border border-accent bg-[rgba(96,165,250,0.08)] px-3 py-2 font-mono text-[10px] uppercase tracking-[1px] text-accent">
              follow
            </button>
            <button className="border border-ink-3 px-3 py-2 font-mono text-[10px] uppercase tracking-[1px] text-ink-2">
              mirror
            </button>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <StatCard label="p&l all-time" value="--" highlight />
            <StatCard label="p&l 30d" value="--" highlight />
            <StatCard label="win rate" value="--" />
            <StatCard label="avg position" value="--" />
          </div>
          <div className="border border-ink-3 bg-paper-2 p-4">
            <div className="mb-3 font-mono text-[10px] uppercase tracking-[1.2px] text-accent">
              pnl over time
            </div>
            <div className="flex h-[260px] items-center justify-center border border-dashed border-ink-3 bg-ink-bg-soft">
              <span className="font-mono text-[10px] uppercase tracking-[1px] text-ink-3">curve surface</span>
            </div>
          </div>
        </section>

        <section className="overflow-x-auto border border-ink-3 bg-paper-2">
          <div className="min-w-[720px]">
            <TableHeader columns="1fr 72px 96px 128px 100px">
              <span>market</span>
              <span>side</span>
              <span>size</span>
              <span>entry / now</span>
              <span>p&l</span>
            </TableHeader>
            {POSITION_ROWS.map((_, index) => (
              <div
                key={index}
                className="grid items-center gap-3 border-b border-dashed border-ink-3 px-3 py-3 last:border-b-0"
                style={{ gridTemplateColumns: "1fr 72px 96px 128px 100px" }}
              >
                <SkeletonLine width={index % 2 === 0 ? "72%" : "54%"} />
                <SkeletonLine width="34px" accent={index % 2 === 0} />
                <SkeletonLine width="58px" />
                <SkeletonLine width="84px" />
                <SkeletonLine width="60px" accent={index < 3} />
              </div>
            ))}
          </div>
        </section>
      </main>
    </Frame>
  );
}

function TableHeader({
  columns,
  children,
}: {
  columns: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="grid items-center gap-3 border-b border-ink-3 bg-ink-bg-soft px-3 py-2 font-mono text-[9px] uppercase tracking-[1px] text-ink-3"
      style={{ gridTemplateColumns: columns }}
    >
      {children}
    </div>
  );
}

function SkeletonLine({
  width,
  height = "10px",
  accent = false,
}: {
  width: string;
  height?: string;
  accent?: boolean;
}) {
  return (
    <span
      className={accent ? "block bg-accent/70" : "block bg-ink-3"}
      style={{ width, height }}
    />
  );
}
