# pref

Prediction-market specialist signal dashboard for Preference.

## Run

```bash
npm run dev
```

Open `http://localhost:3000`.

## Verify

```bash
npm test
npm run build
```

## Architecture

- `src/domain/signal.js` contains the product signal logic: tag normalization, BTC spam filtering, specialist qualification, registry aggregation, holder intersection, and headline generation.
- Data source defaults to `DATA_SOURCE=mock` via `src/data/mockPreferenceApi.js`.
- Use `DATA_SOURCE=preference` with `PREFERENCE_MCP_URL` and optional `PREFERENCE_MCP_TOKEN` to call Preference MCP through `src/data/preferenceMcpApi.js`.
- `src/services/registryStore.js` builds the computed specialist registry from upstream wallet history and market tags.
- `src/services/marketScanner.js` powers default scans and custom Polymarket URL scans.
- `src/services/shareRenderer.js` generates the share-card image markup.
- `api/` contains the Vercel Function entrypoints used in deployment.
- `src/server.js` is only the local development server; Vercel should use `api/` directly.

The prototype stores registry/cache state in memory. On Vercel, that memory is temporary per warm function instance. For a demo this is acceptable; for production, move the registry and scan cache to durable storage such as Vercel Postgres, Neon, or Supabase.

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
