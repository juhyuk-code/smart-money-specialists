# Dashboard Performance Implementation Plan — 2026-05-13

Goal: make dashboard/API loading fast and robust when Postgres/Supabase is slow or unavailable.

## Item 1 — Backend read path is stale-first
- [x] Goal: Interactive read endpoints should return cached/snapshot data quickly and never trigger expensive refresh/fanout unless explicitly requested.
- [x] Done when:
  - Dev `src/server.js` and production `api/smart-money/markets.js` use stale/snapshot-first behavior for `/api/smart-money/markets`.
  - Dashboard read path does not call cohort/live refresh unless `refresh=1` or `/live/refresh` is used.
  - Related read surfaces (`leaders`, `feed`, `wallets`, market detail, wallet detail) avoid full scans where a default snapshot can serve the request.
  - Tests cover scanner failure/DB outage fallback where practical.
  - Verified: `npm test -- tests/vercelHandlers.test.js` passed.
- Key files: `src/server.js`, `api/smart-money/markets.js`, `api/smart-money/{leaders,feed,wallets}.js`, `api/smart-money/markets/[conditionId].js`, `api/smart-money/wallets/[wallet].js`, `src/services/internalSurfaces.js`, `src/services/snapshotStore.js`, `src/services/polymarketIntelligenceService.js`, `tests/vercelHandlers.test.js`.
- Size: large.

## Item 2 — Frontend bounded fetch + stale/error UX
- [x] Goal: UI must not look like it loads forever; show cached/stale data immediately, bound network waits, and surface timeout/error status.
- [x] Done when:
  - `fetchMarkets` and related read helpers use bounded fetch/timeout behavior.
  - Dashboard tracks loading/refreshing/stale/error status separately from data presence.
  - If cached data exists, it remains visible while refresh is attempted.
  - If no cached data and API times out/fails, user sees actionable error/empty state instead of indefinite skeleton.
  - Tests or typecheck/build verify changes.
  - Verified: `npm test -- tests/smartMoneyFetch.test.js` and `npm run typecheck` passed.
- Key files: `src/lib/smartMoney.ts`, `src/components/MarketsDashboard.tsx`, optionally `ProductSurfaces.tsx`, `MarketDetailSurface.tsx`.
- Dependencies: Item 1 preferred but can be developed independently.
- Size: medium.

## Item 3 — DB pool/observability guardrails
- [x] Goal: Make DB waits short, visible, and safer in Vercel/Supabase/serverless.
- [x] Done when:
  - `src/services/db.js` supports env-driven pool settings including shorter connection timeout, idle timeout, query/statement timeout where applicable, and exposes safe pool stats.
  - `/api/smart-money/debug` or `/db-debug` exposes sanitized pool config/stats and connection latency without leaking secrets.
  - Runtime logs/metadata make it clear whether time was spent in cache, DB, scan, or refresh.
  - Tests/typecheck/build pass.
  - Verified: `npm test -- tests/db.test.js` and `npm run typecheck` passed.
- Key files: `src/services/db.js`, `api/smart-money/debug.js`, `api/smart-money/db-debug.js`, `src/appContext.js`, possibly `src/http.js`.
- Dependencies: can follow Item 1.
- Size: medium.

## Item 4 — Decouple refresh/raw payload work from interactive reads
- [x] Goal: Expensive refresh and raw-payload DB writes should not block dashboard reads.
- [x] Done when:
  - Raw payload logging in `src/data/polymarketApi.js` is best-effort/configurable and not awaited on dashboard-critical paths.
  - Refresh remains explicit via `/api/smart-money/live/refresh`; overlapping refresh protection is noted or implemented if small.
  - Any deferred migration/runtime-schema changes are documented if not implemented in this slice.
  - Verified: `npm test -- tests/polymarketSmartMoney.test.js` and `npm run typecheck` passed. Deferred: refresh locking and schema migration cleanup.
- Key files: `src/data/polymarketApi.js`, `src/services/polymarketIntelligenceService.js`, `api/smart-money/live/refresh.js`.
- Dependencies: Item 1.
- Size: medium.

## Verification checklist
- [x] `npm test`
- [x] `npm run typecheck`
- [x] Smoke: `/api/smart-money/markets` responds quickly when DB is unavailable/slow or scanner throws, using stale data if present. Verified first cold stale DB snapshot read 3.55s with DB timeout, subsequent memory last-good read 0.004s.
- [x] Smoke: dashboard page returns 200 OK after restart; frontend timeout/error behavior covered by `tests/smartMoneyFetch.test.js` and typecheck.
