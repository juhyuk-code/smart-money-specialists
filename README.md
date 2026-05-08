# pref

Prediction-market specialist signal dashboard for Preference.

## Run

```bash
npm run dev
```

Open `http://localhost:3000`.

For local Polymarket API development, run the Vercel-style API server and proxy Next requests to it:

```bash
PORT=3001 DATA_SOURCE=polymarket npm run api:dev
API_PROXY_URL=http://localhost:3001 DATA_SOURCE=polymarket npm run dev
```

## Verify

```bash
npm test
npm run build
```

## Architecture

- `src/domain/signal.js` contains the product signal logic: tag normalization, BTC spam filtering, specialist qualification, registry aggregation, holder intersection, and headline generation.
- Data source defaults to `DATA_SOURCE=mock` via `src/data/mockPreferenceApi.js`.
- Use `DATA_SOURCE=preference` with `PREFERENCE_MCP_URL` and optional `PREFERENCE_MCP_TOKEN` to call Preference MCP through `src/data/preferenceMcpApi.js`.
- Use `DATA_SOURCE=polymarket` with `DATABASE_URL` to ingest official public Polymarket API data into Postgres, retain raw payloads, build the smart-wallet registry, and serve live market intelligence.
- `src/services/registryStore.js` builds the computed specialist registry from upstream wallet history and market tags.
- `src/services/marketScanner.js` powers default scans and custom Polymarket URL scans.
- `src/services/polymarketIntelligenceService.js` powers the persistent Polymarket V1 pipeline.
- `src/services/shareRenderer.js` generates the share-card image markup.
- `api/` contains the Vercel Function entrypoints used in deployment.
- `src/server.js` is only the local development server; Vercel should use `api/` directly.

The mock and Preference paths can run with in-memory state. The Polymarket V1 path expects durable Postgres storage such as Vercel Postgres, Neon, or Supabase.

## Polymarket V1 jobs

```bash
DATA_SOURCE=polymarket
DATABASE_URL=<postgres connection string>
JOB_SECRET=<optional shared secret>
```

- `GET /api/smart-money/live/refresh` refreshes top markets, top per-outcome holders, candidates, and market intelligence.
- `GET /api/smart-money/registry/rebuild` rebuilds category performance and wallet labels from candidate closed positions.
- `GET /api/smart-money/raw-payloads` audits recent retained Polymarket API payloads.

When `JOB_SECRET` is set, call protected job routes with `x-job-secret: <secret>` or `?secret=<secret>`.

## Vercel

Deploy the repo root to Vercel. The project uses:

- Next.js for the frontend.
- `api/smart-money/*` for serverless API routes.
- `vercel.json` for function settings.

Recommended Vercel env vars:

```bash
DATA_SOURCE=mock
```

When Preference MCP is ready in deployment:

```bash
DATA_SOURCE=preference
PREFERENCE_MCP_URL=<mcp endpoint>
PREFERENCE_MCP_TOKEN=<token if required>
```
