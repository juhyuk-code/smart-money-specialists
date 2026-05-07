# Codex Desktop Handoff

## Current Goal

Build and deploy pref with real Preference MCP data, then put it on a real domain.

The app currently works locally with mock data. A real Preference MCP adapter has been added, but live mode needs a valid Preference auth token.

## Current App

Run locally:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Verify:

```bash
npm test
npm run build
```

Both passed after the latest changes.

## Important Files

- `src/server.js` - Node HTTP server and API routes.
- `src/data/mockPreferenceApi.js` - fake demo data adapter. Default mode still uses this.
- `src/data/preferenceMcpApi.js` - new real Preference MCP adapter.
- `src/services/registryStore.js` - builds computed specialist registry from adapter data.
- `src/services/marketScanner.js` - scans markets and intersects holders with specialists.
- `src/domain/signal.js` - core signal logic.
- `public/index.html`, `public/styles.css`, `public/app.js` - frontend.
- `tests/domain.test.js` - domain and adapter-shape tests.
- `README.md` - basic run docs.

## Data Modes

The app now supports two data sources:

Mock mode:

```bash
DATA_SOURCE=mock npm run dev
```

Preference mode:

```bash
DATA_SOURCE=preference \
PREFERENCE_MCP_URL=https://pref.trade/mcp \
PREFERENCE_MCP_TOKEN=YOUR_TOKEN_HERE \
npm run dev
```

Default is `mock`.

## What Was Added

Added `src/data/preferenceMcpApi.js`.

It implements the same methods as `MockPreferenceApi`:

- `listKnownWallets()`
- `listClosedPositions()`
- `listClosedMarketTags()`
- `listTrendingMarkets()`
- `listTopHolders(conditionId)`
- `resolvePolymarketUrl(url)`

It maps Preference MCP responses into the shapes the rest of the app already expects.

Preference MCP capabilities wired:

- Trending markets: `pmmd__list_trending`
- Market details / condition IDs / prices: `pmdat__get_market`
- Known wallets / KOLs: `wsi__list_known_kols`
- Current KOL holders: `wsi__get_market_kol_holders`
- Closed realized PnL: `pmsg__get_subgraph_realized_pnl`

`src/server.js` now chooses the adapter by `DATA_SOURCE`.

## What We Tested

Local checks passed:

```bash
npm test
npm run build
```

Live Preference test without token failed as expected:

```text
401 Authentication required
```

This means `https://pref.trade/mcp` is reachable, but the app needs a valid bearer token.

## Current Blocker

The app needs `PREFERENCE_MCP_TOKEN`.

Without it, Preference returns:

```text
Authentication required for tools/call.
```

Codex in-chat can access Preference MCP through its own session, but the local Node app needs its own token in the environment.

## Next Work

1. Get or create a valid Preference MCP token.
2. Run the app in real-data mode:

```bash
DATA_SOURCE=preference \
PREFERENCE_MCP_URL=https://pref.trade/mcp \
PREFERENCE_MCP_TOKEN=YOUR_TOKEN_HERE \
npm run dev
```

3. Test:

```text
http://localhost:3000/api/smart-money/registry
http://localhost:3000/api/smart-money/markets
```

4. Fix any live payload mapping bugs in `src/data/preferenceMcpApi.js`.
5. Deploy the app.
6. Attach a domain.

## Domain / Deployment Plan

Preferred first step: use a subdomain instead of buying a new domain.

Example:

```text
smart-money.pref.trade
```

Deployment options:

- Render or Railway: easiest for this plain Node server.
- Vercel: better later if the app becomes Next.js.

Production env vars:

```bash
DATA_SOURCE=preference
PREFERENCE_MCP_URL=https://pref.trade/mcp
PREFERENCE_MCP_TOKEN=YOUR_TOKEN_HERE
```

After deployment, test:

```text
https://YOUR_DOMAIN/api/smart-money/registry
https://YOUR_DOMAIN/api/smart-money/markets
https://YOUR_DOMAIN
```

## Notes For Codex Desktop

Start by reading:

```bash
sed -n '1,260p' src/data/preferenceMcpApi.js
sed -n '1,120p' src/server.js
npm test
npm run build
```

Do not remove mock mode. Keep it as fallback/demo mode.

The most likely next bugs are response-shape mismatches from live Preference payloads, especially:

- holder rows from `wsi__get_market_kol_holders`
- realized PnL rows from `pmsg__get_subgraph_realized_pnl`
- artifact-envelope responses from Preference MCP
- timeouts from the realized PnL subgraph

Keep fixes scoped to `src/data/preferenceMcpApi.js` unless live testing proves another layer is wrong.
