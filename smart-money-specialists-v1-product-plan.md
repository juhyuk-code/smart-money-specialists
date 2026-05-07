# pref V1: Problems, Solutions, and Product Direction

Prepared: 2026-05-06

Audience: product, engineering, design, and demo stakeholders.

Source PRD: `smart-money-specialists-prd.md`

---

## 1. Executive Summary

pref is a Polymarket intelligence panel for Preference that answers one question better than any generic price or volume dashboard:

> Which side are the proven specialists in this category currently positioned on?

The v1 product scans active Polymarket markets, identifies wallets with strong realized track records in the market's parent category, intersects those wallets with current holders, and presents the specialist split by outcome with average entry price. The key distinction is category-conditional skill: a weather specialist is not merely a high-PnL wallet, but a wallet that has repeatedly made money in weather markets.

This is a defensible Preference feature because it depends on wallet history, realized PnL, market metadata, holder state, and category-level aggregation. Competitors can show prices and volumes. This panel shows who the historically profitable category specialists are backing.

V1 should be built as a signal-first product, not a broad trading terminal. The product must be honest about confidence, freshness, and data limitations. If a category has insufficient specialist density or missing historical tags, the interface should say so rather than manufacturing a weak signal.

---

## 2. V1 Product Definition

### 2.1 Core Promise

For each in-scope Polymarket market, show a compact, trader-readable signal:

> 12 weather specialists long YES at avg 22c

The signal should be visible at a glance, with expandable detail for users who want to inspect the wallets behind the count.

### 2.2 Users

- Polymarket traders who want to understand where category-proven wallets are positioned.
- Preference users who want a stronger market signal than price, volume, or social popularity.
- Preference team members demoing the unique value of the Preference wallet graph and PnL primitives.
- Social viewers who encounter a share image on Twitter/X and click back to Preference.

### 2.3 In Scope for V1

- Polymarket only.
- Public default scan of the top 40 Polymarket markets by 24h volume.
- BTC up/down and auto-spawning crypto binary markets filtered from the default scan.
- Parent-category specialist scoring:
  - politics
  - sports
  - weather
  - crypto
  - macro
  - sci-tech
- Specialist qualification by category-specific:
  - realized PnL
  - ROI
  - number of closed markets
- Multi-tag markets fully attributed to every parent tag they carry.
- Logged-in custom Polymarket URL scan.
- Expandable per-specialist detail.
- Designed share PNG, generated server-side.
- Nightly specialist registry refresh.
- Live holder/price refresh with 60-120 second market-level caching.

### 2.4 Out of Scope for V1

- DEX token, ERC-20, Solana token, or non-prediction-market tracking.
- Kalshi support.
- Copy-trading or auto-execution.
- Public unauthenticated custom URL scans.
- Leaf-tag specialist scoring.
- Perfect coverage of every wallet on Polymarket.
- A full portfolio or trader CRM.

### 2.5 The V1 UX Contract

The user should be able to:

1. Open the panel and immediately see where specialists are clustered.
2. Scan markets without reading a tutorial.
3. Expand a market to inspect which specialists are counted and why.
4. Paste a Polymarket URL after login and receive the same analysis.
5. Generate a Twitter-ready share image with a single click.
6. Understand when the product has insufficient data instead of a weak or misleading signal.

---

## 3. Signal Model

### 3.1 Specialist Definition

A wallet is a specialist in parent category `T` when it passes all category-specific thresholds:

- `realized_pnl_in_category >= min_pnl[T]`
- `realized_pnl_in_category / total_volume_in_category >= min_roi[T]`
- `closed_markets_in_category >= min_closed_markets[T]`

Threshold values are intentionally not hard-coded before the first batch run. They must be tuned from observed distributions after the initial registry is generated.

### 3.2 Why Three Gates Are Required

Realized PnL alone overweights large wallets. ROI alone overweights small lucky accounts. Closed-market count alone overweights frequent but mediocre traders. The intersection of all three is the minimum viable definition of category expertise.

### 3.3 Candidate Wallet Pool

The initial candidate pool is the deduped union of:

- `wsi__list_known_kols(max_smart_wallet_rank=500, require_positions=true)`
- top holders from `pm__list_top_holders` across recent high-volume markets

This pool is intentionally biased toward wallets that are either known, active, or currently relevant. That is acceptable for v1, but the UI and internal docs should describe the result as "tracked specialists," not "all specialists on Polymarket."

### 3.4 Category Attribution

V1 uses full multi-tag attribution:

- If a closed market has both `politics` and `macro`, that market contributes fully to both category records.
- This may inflate cross-category records for broad markets.
- The behavior must be documented internally and can be revisited after the first quality review.

### 3.5 Registry Freshness

The specialist registry refreshes nightly and fully rebuilds weekly. Current market holder state refreshes more frequently. This means:

- "Who is a specialist" can be up to 24 hours stale.
- "Which specialists are currently holding this market" should be near-live within cache limits.

The UI should expose this distinction with concise freshness text.

---

## 4. Problems, Root Causes, and V1 Solutions

| Problem / Limitation | Root Cause | V1 Solution |
| --- | --- | --- |
| Realized PnL primitive uncertainty | The PRD depends on `pmsg__get_subgraph_positions`, but another known primitive, `pmc1__get_user_positions_by_market`, returns unrealized open-position MTM rather than closed realized PnL. | Treat this as the keystone pre-build verification. Run a single-wallet test before building fanout. Confirm closed status, realized PnL, market id, outcome, timestamps, volume, and pagination behavior. Do not proceed to registry build until this is verified. |
| Average entry may not be available | Current holder endpoints may expose position size but not cost basis. | Inspect `pm__list_top_holders` fields. If average entry is available, compute weighted average by specialist position size. If not, compute from wallet position/trade history where feasible. If neither is reliable, ship v1 with specialist count and current price, and mark average entry as unavailable until supported. |
| Nightly fanout cost | 1k-3k candidate wallets multiplied by per-wallet position history calls can exceed practical runtime or quota. | Build a resumable, checkpointed batch. Cache wallet histories and market tags. Run nightly deltas for recently active wallets and a weekly full rebuild. Spread work over 4-8 hours if rate limits require it. |
| MCP quota and upstream rate limits | Agent keys have finite daily calls, and upstream pnl-subgraph limits may be stricter than product needs. | Use MCP for validation and prototype runs. Production should run with an approved Preference server-side integration, claimed/upgraded quota, or internal allowance. Keep batch call volume observable from day one. |
| `taskSupport: "forbidden"` is unclear | Preference tool metadata includes a flag whose operational meaning is unknown. | Ask Preference upstream what this constrains before long-running production fanout. Until clarified, do not assume MCP interactive tools are approved for unattended high-volume batch work. |
| Historical tags may be sparse | Older closed Polymarket markets may have missing or incomplete tag metadata. | Sample at least 20-30 closed markets before implementation. Cache `market_id -> parent_tags`. Fallback to `read_polymarket_event_pack` for important missing markets, and otherwise exclude unknown-tag markets from specialist scoring with explicit audit counts. |
| Parent tag mapping may be inconsistent | Polymarket tags can be leaf-level, noisy, duplicated, or product-specific. | Create a deterministic parent-tag normalization table for v1. Unknown tags map to `uncategorized` and are not used for specialist qualification until reviewed. |
| Thin specialist density in niche categories | Weather and sci-tech may have too few wallets clearing strict thresholds. | Tune thresholds per category after the first batch run. Add an "insufficient specialist data" market state when the relevant specialist set is below a minimum confidence floor. |
| Thresholds are unknown | The PRD correctly defers `min_pnl`, `min_roi`, and `min_closed_markets` until data is observed. | First batch produces distributions by category. Product and data review selects thresholds from observed percentiles and sanity checks. Store thresholds in config, not code. |
| Survivorship bias | Candidate pool starts from currently successful or visible wallets. | Accept for v1, describe results as tracked specialists, and track candidate-source metadata. Later expand with historical high-volume market participants and repeated closed-market actors. |
| Recency drift | Lifetime realized PnL can reward wallets that were good years ago but recently cold. | Store lifetime and last-90-day metrics. Use lifetime for credibility, display 90-day result in detail rows, and consider a blended ranking for row ordering. |
| Current-holder coverage may be incomplete | `pm__list_top_holders` may return only top holders rather than every holder. | Define v1 as specialist tracking among economically meaningful current holders. Use the largest supported limit and pagination if available. Document coverage if the endpoint is top-N only. |
| BTC up/down markets pollute top 40 | Auto-spawned short-horizon crypto markets can dominate volume and dilute the panel. | Filter with three layers: tag exclusion, title regex, and manual blocklist. Review the live top 40 regularly until the filter stabilizes. |
| Multi-tag attribution can inflate counts | Full attribution means one market can increase multiple category records. | Keep full attribution for v1 because it is simple and matches the PRD. Add an internal audit column for multi-tag contribution share. Revisit fractional attribution only if quality review shows distortion. |
| Wallet privacy in share images | Share PNGs expose wallet identities outside the app context. | Default to truncated wallet labels such as `0x12...3f`. Show KOL handles only when known and already public. Do not show full addresses in share images. |
| KOL identity can distort the signal | Users may overfocus on famous names instead of category performance. | In product UI, show KOL handle as secondary metadata, not the primary label. Primary evidence remains PnL, ROI, closed markets, and recent record. |
| Snapshot freshness can mislead users | Registry updates nightly while current market state updates more often. | Add a small freshness label: `Specialist registry: refreshed nightly` and `Market positions: updated <2m ago`. Show stale states when a cache exceeds the expected window. |
| Public custom scans would invite abuse | URL scans can trigger costly holder and metadata lookups. | Keep custom URL scan login-gated. Rate-limit per user and cache scans per condition id. |
| Share rendering can be inconsistent | Client screenshots vary across devices, fonts, themes, and viewport sizes. | Use server-side rendering with Puppeteer or `@vercel/og`. Generate a designed image, not a literal UI screenshot. |
| Insufficient data can look like zero conviction | A category with no qualified specialists is different from a market where specialists are evenly split or absent. | Distinguish `no specialists currently holding`, `insufficient category data`, and `data unavailable`. These must be separate UI states. |
| Kalshi temptation can expand scope | Kalshi support is attractive but unresolved. | Keep v1 Polymarket-only. Use venue-neutral internal naming where cheap, but do not build Kalshi-specific UI or pipelines until after v1. |

---

## 5. First-Version Architecture

### 5.1 Pre-Build Verification

Run these checks before committing the engineering team to the full registry:

1. Call `preference_account_status` and confirm authenticated agent/server identity.
2. Use `search_capabilities` / `browse_capabilities` to confirm current schemas for required tools.
3. Verify `pmsg__get_subgraph_positions` on one known wallet:
   - closed positions are included
   - realized PnL is present
   - market identifier is stable
   - volume or cost basis can be derived
   - timestamps support last-90-day metrics
4. Run `pmmd__scan_markets(closed=true)` and sample 20-30 closed markets for tag coverage.
5. Run `pmmd__list_trending(order=volume24hr, limit=40)` and inspect BTC up/down tags and titles.
6. Run `pm__list_top_holders` on several active markets and inspect:
   - wallet address
   - outcome side
   - position size
   - average entry or cost basis availability
   - pagination / top-N limits
7. Ask Preference upstream what `taskSupport: "forbidden"` means for long-running fanout.

### 5.2 Nightly Specialist Registry

Purpose: create a persistent table mapping wallet-category expertise before live market scans run.

Pipeline:

1. Build candidate wallet pool:
   - known KOL/smart-wallet list
   - top holders from recent high-volume markets
   - dedupe by normalized wallet address
2. Fetch closed-position history for each candidate via `pmsg__get_subgraph_positions`.
3. Resolve market metadata and tags via `pmmd__scan_markets(closed=true)`.
4. Normalize market tags to parent categories.
5. Aggregate per wallet and parent category:
   - realized PnL
   - total traded volume
   - ROI
   - closed market count
   - last-90-day realized PnL
   - last-90-day ROI where possible
   - candidate source
6. Apply category-specific thresholds.
7. Persist specialist records and audit counters.
8. Emit quality report for review.

Cadence:

- Nightly incremental refresh for candidate wallets active recently.
- Weekly full rebuild.
- Manual rebuild after threshold changes.

### 5.3 Live Market Scan

Purpose: show current specialist positioning for active markets.

Default scan:

1. Fetch `pmmd__list_trending(order=volume24hr, limit=40)`.
2. Apply BTC up/down filter:
   - exclude known spam tags
   - title regex for BTC / Bitcoin / up or down / hourly language
   - manual blocklist
3. For each remaining market:
   - resolve parent tags
   - load specialist sets for those tags
   - fetch current holders via `pm__list_top_holders`
   - intersect holders with specialist sets
   - group by outcome
   - compute specialist count, total size, and weighted average entry if available
4. Cache each market result for 60-120 seconds.
5. Return a market scan response sorted by 24h volume unless the user changes sort.

Custom scan:

1. Require login.
2. Accept a Polymarket URL.
3. Resolve condition id(s) via `read_polymarket_event_pack`.
4. Run the same market scan logic against those condition ids.
5. Cache by condition id, not raw URL.

### 5.4 Screenshot Renderer

The share export is a designed card, not a viewport capture.

Renderer requirements:

- Input: a market scan result and selected headline outcome.
- Output: PNG, 1200x675.
- Includes:
  - Preference watermark
  - market title
  - current YES/NO price
  - primary tag
  - headline specialist signal
  - 2-3 specialist rows
  - timestamp
  - permalink / share URL
- Default wallet display:
  - KOL handle if known
  - otherwise truncated address
- No full wallet addresses in public share images.

Recommended implementation:

- Use `@vercel/og` if the app is already on a compatible Vercel/Next stack.
- Use Puppeteer if the design needs richer layout, custom fonts, or exact browser parity.

### 5.5 Caching and Persistence

Minimum caches:

- `market_id -> parent_tags`
- `condition_id -> market metadata`
- `wallet -> closed position history snapshot`
- `tag -> specialist set`
- `condition_id -> live holder scan result`
- `share_id -> rendered PNG metadata`

Cache durations:

- Live holder scan: 60-120 seconds.
- Trending market list: 60-120 seconds.
- Market metadata/tags: long-lived, invalidated on rebuild.
- Specialist registry: nightly.
- Share image: immutable once generated, tied to timestamp.

### 5.6 Failure States

The product must not collapse all failures into "0 specialists."

Use distinct states:

- `ready`: specialist signal available.
- `insufficient_category_data`: category exists but specialist set is too thin.
- `no_specialists_currently_holding`: specialist set exists, but none are current holders.
- `average_entry_unavailable`: count is valid, average entry cannot be computed.
- `market_metadata_unavailable`: market could not be resolved or tagged.
- `holder_fetch_failed`: current holder data unavailable.
- `registry_stale`: specialist registry older than expected.
- `login_required`: custom scan attempted without auth.

---

## 6. Proposed Minimum Interfaces

These are not final API contracts, but they are the minimum shapes engineering should support to avoid ambiguity between data, API, UI, and share rendering.

### 6.1 Specialist Registry Record

```ts
type ParentCategory =
  | "politics"
  | "sports"
  | "weather"
  | "crypto"
  | "macro"
  | "sci-tech";

type SpecialistRegistryRecord = {
  wallet: string;
  category: ParentCategory;
  realizedPnl: number;
  totalVolume: number;
  roi: number;
  closedMarkets: number;
  last90dPnl: number | null;
  last90dRoi: number | null;
  knownHandle: string | null;
  candidateSources: Array<"known_kol" | "top_holder_recent_market">;
  qualifies: boolean;
  thresholdVersion: string;
  registryRefreshedAt: string;
};
```

### 6.2 Market Scan Response

```ts
type OutcomeSpecialistSummary = {
  outcome: string;
  specialistCount: number;
  totalCurrentSize: number | null;
  weightedAverageEntry: number | null;
  averageEntryStatus: "available" | "unavailable";
  topSpecialists: SpecialistDetail[];
};

type MarketScanResult = {
  conditionId: string;
  marketSlug: string | null;
  question: string;
  currentPrices: Record<string, number>;
  parentTags: ParentCategory[];
  volume24h: number | null;
  outcomes: OutcomeSpecialistSummary[];
  status:
    | "ready"
    | "insufficient_category_data"
    | "no_specialists_currently_holding"
    | "market_metadata_unavailable"
    | "holder_fetch_failed"
    | "registry_stale";
  registryRefreshedAt: string;
  marketDataRefreshedAt: string;
};
```

### 6.3 Specialist Detail

```ts
type SpecialistDetail = {
  wallet: string;
  displayLabel: string;
  knownHandle: string | null;
  category: ParentCategory;
  currentOutcome: string;
  currentSize: number | null;
  averageEntry: number | null;
  realizedPnl: number;
  roi: number;
  closedMarkets: number;
  last90dPnl: number | null;
};
```

### 6.4 Share Image Input

```ts
type ShareImageInput = {
  market: MarketScanResult;
  selectedOutcome: string;
  headline: string;
  specialistRows: SpecialistDetail[];
  generatedAt: string;
  permalink: string;
};
```

---

## 7. UI Suggestions

### 7.1 Product Posture

This should feel like a dense intelligence surface, not a marketing landing page. The first screen should be the tool itself.

Design principles:

- Prioritize scan speed and signal clarity.
- Keep layouts compact and aligned.
- Avoid decorative cards inside cards.
- Use restrained color, with color carrying meaning:
  - YES / bullish outcome emphasis
  - NO / opposing outcome emphasis
  - warning for stale or insufficient data
- Do not hide uncertainty. Small confidence labels are part of the product's credibility.

### 7.2 Dashboard Layout

Recommended desktop layout:

- Top bar:
  - product label: `pref`
  - freshness text: `Registry refreshed <date/time>`
  - URL scan input
  - login state / account button
  - share/export only when a market is selected
- Control row:
  - category segmented filter
  - sort menu: `24h volume`, `specialist count`, `strongest skew`, `recently updated`
  - toggle: `Hide insufficient data`
  - search/filter input for market title
- Main content:
  - market list occupying the full page width
  - each market row expandable in place
  - no separate marketing hero above the tool

Market rows should be easy to scan vertically. Use stable row heights for collapsed state so the list does not jump.

### 7.3 Market Summary Row

Each collapsed market row should include:

- Market question.
- Parent tags.
- 24h volume.
- Current YES/NO price.
- Specialist split by outcome.
- Strongest headline:
  - `12 weather specialists YES @ avg 22c`
  - `8 politics specialists NO @ avg 61c`
  - `No tracked specialists currently holding`
  - `Insufficient weather specialist data`
- Freshness indicator:
  - `positions <2m old`
  - `registry 14h old`

Suggested visual structure:

- Left: question and tags.
- Middle: compact YES/NO price cells.
- Right: specialist summary with count, side, average entry, and confidence/status.
- Far right: expand icon and share icon.

### 7.4 Specialist Split Visualization

Use a simple two-sided horizontal split, not a complex chart:

- YES side count and avg entry.
- NO side count and avg entry.
- Relative bar width based on specialist count or total current size.
- Label the metric clearly: `by specialist count` or `by current size`.

Default v1 should use specialist count as the primary visual metric because it is simpler and less dependent on holder size completeness.

### 7.5 Expanded Market Detail

Expanded rows should show:

- Market title and current prices.
- Specialist summary by parent tag.
- Table of counted specialists:
  - wallet label
  - KOL handle if known
  - current outcome
  - average entry
  - category realized PnL
  - ROI
  - closed markets
  - last-90-day PnL
- Data notes:
  - registry refresh time
  - holder data refresh time
  - whether average entry is available

Row ordering:

1. Specialists on the dominant outcome first.
2. Within outcome, sort by a blended credibility score:
   - category realized PnL
   - ROI
   - closed-market count
   - recent 90-day PnL

If no blended score exists in v1, sort by category realized PnL descending.

### 7.6 Custom URL Scan Flow

Interaction:

1. User pastes a Polymarket URL into the top input.
2. If logged out, show login prompt before running expensive resolution.
3. After login, resolve URL via `read_polymarket_event_pack`.
4. Show loading states by step:
   - `Resolving market`
   - `Checking specialist registry`
   - `Fetching current holders`
   - `Building signal`
5. Render result in the same market detail component used by default scan.

Validation:

- Non-Polymarket URL: `Paste a Polymarket market URL.`
- Unsupported or unresolved market: `We could not resolve this market yet.`
- Multi-condition event: show each condition as a separate market result under the event title.

### 7.7 Share Modal

Open from a market row or expanded view.

Contents:

- Preview of the 1200x675 share card.
- Outcome selector if multiple meaningful headlines exist.
- Toggle for row detail density:
  - `Headline only`
  - `Headline + top specialists`
- Button: `Generate PNG`
- Button after generation: `Copy share link`

Privacy default:

- Show KOL handle if known.
- Otherwise show truncated address.
- Do not offer full address display in public v1 share cards.

### 7.8 Share PNG Composition

Canvas: 1200x675.

Recommended layout:

- Top-left: `pref`.
- Top-right: timestamp.
- Main title: market question, two lines max.
- Price strip: YES/NO current prices.
- Primary headline in large type:
  - `12 weather specialists long YES`
  - `avg entry 22c`
- Detail rows:
  - 2-3 specialists
  - label, outcome, avg entry, category PnL, ROI
- Footer:
  - permalink
  - `Registry refreshed nightly`

Visual tone:

- High contrast.
- Tight information hierarchy.
- No fake trading advice language.
- No overdecorated background.
- The screenshot should read clearly in a Twitter feed without zooming.

### 7.9 Empty, Loading, and Error States

Loading:

- Use row-level skeletons for default scan.
- Use step labels for custom URL scan.
- Avoid blocking the whole dashboard when one market fails.

Empty states:

- `No tracked specialists currently holding this market.`
- `Insufficient specialist data for this category.`
- `This market does not have supported tags yet.`

Error states:

- Holder fetch failed:
  - keep market metadata visible
  - show retry affordance
- Registry stale:
  - show warning label
  - still display last known data if available
- Custom scan unauthenticated:
  - login prompt
  - preserve pasted URL after login

### 7.10 Mobile Behavior

Mobile should preserve the core signal, not every table column.

Collapsed card:

- Question.
- Current prices.
- Primary specialist headline.
- Freshness/status.

Expanded card:

- Specialist rows as compact stacked rows.
- Hide lower-priority metrics behind a details disclosure:
  - closed markets
  - last-90-day record
  - candidate source

Share generation should remain available from mobile, but the share card itself stays 1200x675.

---

## 8. First-Version Execution Plan

### Phase 0: Verification Spike

Goal: prove the data primitives are real before building product surfaces.

Deliverables:

- One known wallet PnL inspection.
- Closed market tag coverage sample.
- Top 40 trending market sample with BTC filter notes.
- Top holder response shape inspection.
- Written answer on `taskSupport: "forbidden"`.
- Recommendation: proceed, proceed with caveats, or block.

Exit criteria:

- Realized PnL can be trusted or a fallback signal is explicitly approved.
- Parent tags are available for enough closed markets to build category records.
- Current holder data supports outcome intersection.

### Phase 1: Specialist Registry

Goal: produce the persistent wallet-category table.

Deliverables:

- Candidate wallet collection.
- Wallet closed-position history fetcher.
- Market tag cache.
- Parent-tag aggregation.
- Threshold config.
- Registry persistence.
- Quality report.

Exit criteria:

- At least 20 manually inspected markets produce sane specialist records.
- Weather and politics specialist lists pass an eyeball test.
- Thin categories have defined insufficient-data behavior.

### Phase 2: Live Market Scan

Goal: render the public top-40 dashboard from real data.

Deliverables:

- Trending market fetch.
- BTC up/down filter.
- Specialist-holder intersection.
- Outcome grouping.
- Average entry computation or explicit unavailable state.
- 60-120 second cache.
- API response for dashboard.

Exit criteria:

- Top 40 scan loads in under 60 seconds for demo.
- Individual cached market refreshes are fast enough for interactive use.
- No failed market collapses the whole dashboard.

### Phase 3: Custom URL Scan and Auth

Goal: allow logged-in users to paste a Polymarket URL.

Deliverables:

- Login gate.
- URL validation.
- `read_polymarket_event_pack` resolution.
- Multi-condition event handling.
- Shared result component with default scan.
- Per-user rate limit.

Exit criteria:

- Logged-out users see a clear login requirement.
- Logged-in users can scan a valid Polymarket URL.
- Invalid URLs fail gracefully.

### Phase 4: Share Image

Goal: generate social-ready marketing assets from real scan results.

Deliverables:

- Share card template.
- Server-side PNG renderer.
- Share preview modal.
- Permalink.
- Privacy-safe wallet labels.

Exit criteria:

- Generated PNG is readable at Twitter feed size.
- Image includes market, price, headline signal, timestamp, permalink, and Preference watermark.
- No full wallet addresses leak in default public share cards.

---

## 9. Acceptance Criteria

### Product Acceptance

- Default dashboard shows top Polymarket markets by 24h volume, excluding BTC up/down spam.
- Each ready market shows current prices, parent tags, specialist count by outcome, and average entry when available.
- Each market can expand to show specialist detail.
- Insufficient data, no current specialists, and data failures are visually distinct.
- Logged-in custom URL scan uses the same output format as default scan.
- Share export produces a designed PNG rather than a literal UI screenshot.

### Data Acceptance

- Realized PnL source has been verified before full fanout.
- Specialist scoring uses parent categories only.
- Thresholds are category-specific and configurable.
- Multi-tag full attribution is documented.
- Registry refresh time is stored and shown.
- Last-90-day metrics are available in specialist detail where source data supports them.

### UX Acceptance

- A new user can understand the strongest specialist signal from a market row without opening detail.
- A power user can inspect why a wallet counted as a specialist.
- The UI does not imply trading advice or certainty.
- The product handles weak data honestly.
- Share image is legible, attractive, and privacy-safe.

### Operational Acceptance

- Batch job is resumable.
- Tool/API call volume is observable.
- Failures are logged with market id, wallet, tool name, and error type.
- Cached live scans avoid repeated expensive holder fetches.
- Manual blocklist for BTC spam can be updated without a code deploy if possible.

---

## 10. Metrics

### Sanity Metrics

- Number of markets inspected manually.
- Percent of closed positions with usable realized PnL.
- Percent of closed markets with usable parent tags.
- Specialist counts by category.
- Thin-category rate.

### Product Metrics

- Default dashboard load time.
- Market expand rate.
- Custom URL scans per logged-in user per week.
- Share PNG generation count.
- Share URL click-through.

### Signal Quality Metrics

- Specialist distribution by category.
- Outcome skew by market.
- Percentage of markets with no tracked specialists currently holding.
- Percentage of markets with insufficient category data.
- Percentage of markets where average entry is unavailable.

---

## 11. Copy Guidance

Use confident but precise copy.

Good:

- `12 weather specialists long YES at avg 22c`
- `Registry refreshed 14h ago`
- `No tracked specialists currently holding`
- `Insufficient sci-tech specialist data`
- `Avg entry unavailable for this market`

Avoid:

- `Smart money says buy YES`
- `Experts guarantee YES`
- `Best traders are all in`
- `This market is mispriced`

The panel should imply useful intelligence, not financial advice.

---

## 12. Final Recommendation

Build v1 only after the verification spike confirms realized closed-position PnL and usable historical tags. If those two primitives hold, the product is feasible and differentiated.

The first release should optimize for trustworthy signal presentation over broad coverage. A smaller number of markets with honest specialist data is better than a wide dashboard that treats missing data as conviction. The winning v1 is simple:

- public top-40 scan
- category specialist counts by outcome
- average entry where available
- expandable evidence
- login-gated custom scan
- privacy-safe share PNG

That is enough for the demo dashboard to make Preference's uniqueness visible.
