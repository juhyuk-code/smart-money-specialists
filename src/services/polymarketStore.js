import { getPool, hasDatabaseUrl } from "./db.js";

let schemaReady;

export class PolymarketStore {
  constructor({ pool = getPool() } = {}) {
    this.pool = pool;
  }

  isAvailable() {
    return Boolean(this.pool && hasDatabaseUrl());
  }

  async ensureSchema() {
    if (!this.isAvailable()) return null;
    if (schemaReady) return schemaReady;
    schemaReady = this.pool.query(`
      create table if not exists raw_polymarket_payloads (
        id bigserial primary key,
        endpoint text not null,
        params_hash text not null,
        params jsonb not null default '{}'::jsonb,
        payload jsonb,
        status_code integer,
        error text,
        fetched_at timestamptz not null default now()
      );

      create index if not exists raw_polymarket_payloads_endpoint_idx
        on raw_polymarket_payloads (endpoint, fetched_at desc);

      create table if not exists polymarket_markets (
        condition_id text primary key,
        slug text,
        question text not null,
        current_prices jsonb not null default '{}'::jsonb,
        categories text[] not null default '{}',
        tags text[] not null default '{}',
        volume_24h numeric,
        active boolean,
        closed boolean,
        raw jsonb,
        updated_at timestamptz not null default now()
      );

      create table if not exists wallet_candidates (
        wallet text primary key,
        first_seen_at timestamptz not null default now(),
        last_seen_at timestamptz not null default now(),
        candidate_sources text[] not null default '{}',
        observed_market_count integer not null default 0
      );

      create table if not exists holder_snapshots (
        id bigserial primary key,
        condition_id text not null,
        positions jsonb not null,
        raw_payload_ids jsonb not null default '[]'::jsonb,
        fetched_at timestamptz not null default now()
      );

      create index if not exists holder_snapshots_condition_idx
        on holder_snapshots (condition_id, fetched_at desc);

      create table if not exists wallet_closed_positions (
        wallet text not null,
        condition_id text not null,
        outcome text not null default '',
        asset text,
        avg_price numeric,
        total_bought numeric,
        realized_pnl numeric,
        timestamp bigint,
        title text,
        slug text,
        event_slug text,
        end_date timestamptz,
        raw jsonb not null default '{}'::jsonb,
        updated_at timestamptz not null default now(),
        primary key (wallet, condition_id, outcome)
      );

      create table if not exists wallet_category_performance (
        wallet text not null,
        category text not null,
        label text not null,
        metrics jsonb not null,
        updated_at timestamptz not null default now(),
        primary key (wallet, category)
      );

      create index if not exists wallet_category_performance_category_idx
        on wallet_category_performance (category, label);

      create table if not exists wallet_labels (
        wallet text primary key,
        wallet_label text not null,
        category_labels jsonb not null default '[]'::jsonb,
        updated_at timestamptz not null default now()
      );

      create table if not exists market_intelligence_snapshots (
        condition_id text primary key,
        payload jsonb not null,
        holder_snapshot_at timestamptz,
        registry_refreshed_at timestamptz,
        updated_at timestamptz not null default now()
      );

      create index if not exists market_intelligence_snapshots_updated_idx
        on market_intelligence_snapshots (updated_at desc);

      create table if not exists registry_runs (
        id bigserial primary key,
        status text not null,
        audit jsonb not null default '{}'::jsonb,
        started_at timestamptz not null,
        finished_at timestamptz not null default now()
      );
    `);
    return schemaReady;
  }

  async saveRawPayload({ endpoint, paramsHash, params, payload, statusCode, error }) {
    if (!this.isAvailable()) return null;
    await this.ensureSchema();
    const result = await this.pool.query(
      `
        insert into raw_polymarket_payloads (endpoint, params_hash, params, payload, status_code, error)
        values ($1, $2, $3::jsonb, $4::jsonb, $5, $6)
        returning id, fetched_at
      `,
      [endpoint, paramsHash, JSON.stringify(params ?? {}), JSON.stringify(payload), statusCode, error],
    );
    return result.rows[0] ?? null;
  }

  async upsertMarkets(markets) {
    if (!this.isAvailable() || markets.length === 0) return;
    await this.ensureSchema();
    for (const market of markets) {
      await this.pool.query(
        `
          insert into polymarket_markets
            (condition_id, slug, question, current_prices, categories, tags, volume_24h, active, closed, raw, updated_at)
          values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10::jsonb, now())
          on conflict (condition_id)
          do update set
            slug = excluded.slug,
            question = excluded.question,
            current_prices = excluded.current_prices,
            categories = excluded.categories,
            tags = excluded.tags,
            volume_24h = excluded.volume_24h,
            active = excluded.active,
            closed = excluded.closed,
            raw = excluded.raw,
            updated_at = now()
        `,
        [
          market.conditionId,
          market.marketSlug ?? market.slug,
          market.question,
          JSON.stringify(market.currentPrices ?? {}),
          market.parentTags ?? [],
          market.rawTags ?? market.tags ?? [],
          market.volume24h,
          market.active,
          market.closed,
          JSON.stringify(market.raw ?? market),
        ],
      );
    }
  }

  async upsertWalletCandidates(wallets, source = "top_live_market_holder") {
    if (!this.isAvailable() || wallets.length === 0) return;
    await this.ensureSchema();
    const uniqueWallets = [...new Set(wallets.filter(Boolean))];
    if (uniqueWallets.length === 0) return;
    await this.pool.query(
      `
        insert into wallet_candidates (wallet, candidate_sources, observed_market_count)
        select wallet, array[$2]::text[], 1
        from unnest($1::text[]) as wallet
        on conflict (wallet)
        do update set
          last_seen_at = now(),
          candidate_sources = array(
            select distinct unnest(wallet_candidates.candidate_sources || excluded.candidate_sources)
          ),
          observed_market_count = wallet_candidates.observed_market_count + 1
      `,
      [uniqueWallets, source],
    );
  }

  async saveHolderSnapshot({ conditionId, positions, rawPayloadIds = [], fetchedAt }) {
    if (!this.isAvailable()) return null;
    await this.ensureSchema();
    const result = await this.pool.query(
      `
        insert into holder_snapshots (condition_id, positions, raw_payload_ids, fetched_at)
        values ($1, $2::jsonb, $3::jsonb, $4::timestamptz)
        returning id, fetched_at
      `,
      [conditionId, JSON.stringify(positions), JSON.stringify(rawPayloadIds), fetchedAt],
    );
    return result.rows[0] ?? null;
  }

  async upsertClosedPositions(wallet, positions) {
    if (!this.isAvailable() || positions.length === 0) return;
    await this.ensureSchema();
    const rowsByKey = new Map();
    for (const position of positions) {
      const row = {
        wallet,
        conditionId: position.conditionId,
        outcome: position.outcome ?? "",
        asset: position.asset ?? null,
        averageEntry: position.averageEntry ?? null,
        totalBought: position.totalBought ?? null,
        realizedPnl: position.realizedPnl ?? null,
        timestamp: normalizeTimestamp(position.timestamp),
        title: position.title ?? null,
        slug: position.slug ?? null,
        eventSlug: position.eventSlug ?? null,
        endDate: normalizeIso(position.endDate),
        raw: position.raw ?? position,
      };
      rowsByKey.set(`${row.wallet}:${row.conditionId}:${row.outcome}`, row);
    }
    const rows = Array.from(rowsByKey.values());
    await this.pool.query(
      `
        insert into wallet_closed_positions
          (wallet, condition_id, outcome, asset, avg_price, total_bought, realized_pnl, timestamp, title, slug, event_slug, end_date, raw, updated_at)
        select
          item->>'wallet',
          item->>'conditionId',
          coalesce(item->>'outcome', ''),
          item->>'asset',
          nullif(item->>'averageEntry', '')::numeric,
          nullif(item->>'totalBought', '')::numeric,
          nullif(item->>'realizedPnl', '')::numeric,
          nullif(item->>'timestamp', '')::bigint,
          item->>'title',
          item->>'slug',
          item->>'eventSlug',
          nullif(item->>'endDate', '')::timestamptz,
          item->'raw',
          now()
        from jsonb_array_elements($1::jsonb) as item
        on conflict (wallet, condition_id, outcome)
        do update set
          asset = excluded.asset,
          avg_price = excluded.avg_price,
          total_bought = excluded.total_bought,
          realized_pnl = excluded.realized_pnl,
          timestamp = excluded.timestamp,
          title = excluded.title,
          slug = excluded.slug,
          event_slug = excluded.event_slug,
          end_date = excluded.end_date,
          raw = excluded.raw,
          updated_at = now()
      `,
      [JSON.stringify(rows)],
    );
  }

  async upsertCategoryPerformance(records) {
    if (!this.isAvailable() || records.length === 0) return;
    await this.ensureSchema();
    for (const record of records) {
      await this.pool.query(
        `
          insert into wallet_category_performance (wallet, category, label, metrics, updated_at)
          values ($1, $2, $3, $4::jsonb, now())
          on conflict (wallet, category)
          do update set label = excluded.label, metrics = excluded.metrics, updated_at = now()
        `,
        [record.wallet, record.category, record.label, JSON.stringify(record)],
      );
    }
  }

  async upsertWalletLabel(wallet, walletLabel, categoryLabels) {
    if (!this.isAvailable()) return;
    await this.ensureSchema();
    await this.pool.query(
      `
        insert into wallet_labels (wallet, wallet_label, category_labels, updated_at)
        values ($1, $2, $3::jsonb, now())
        on conflict (wallet)
        do update set wallet_label = excluded.wallet_label, category_labels = excluded.category_labels, updated_at = now()
      `,
      [wallet, walletLabel, JSON.stringify(categoryLabels)],
    );
  }

  async saveMarketIntelligence(markets) {
    if (!this.isAvailable() || markets.length === 0) return;
    await this.ensureSchema();
    for (const market of markets) {
      await this.pool.query(
        `
          insert into market_intelligence_snapshots
            (condition_id, payload, holder_snapshot_at, registry_refreshed_at, updated_at)
          values ($1, $2::jsonb, $3::timestamptz, $4::timestamptz, now())
          on conflict (condition_id)
          do update set
            payload = excluded.payload,
            holder_snapshot_at = excluded.holder_snapshot_at,
            registry_refreshed_at = excluded.registry_refreshed_at,
            updated_at = now()
        `,
        [
          market.conditionId,
          JSON.stringify(market),
          market.holderSnapshotAt ?? market.marketDataRefreshedAt,
          market.registryRefreshedAt,
        ],
      );
    }
  }

  async readLatestMarketIntelligence({ limit = 40 } = {}) {
    if (!this.isAvailable()) return null;
    await this.ensureSchema();
    const result = await this.pool.query(
      `
        select payload, updated_at
        from market_intelligence_snapshots
        order by coalesce((payload->>'volume24h')::numeric, 0) desc, updated_at desc
        limit $1
      `,
      [limit],
    );
    if (result.rows.length === 0) return null;
    const markets = result.rows.map((row) => row.payload);
    return {
      markets,
      registryRefreshedAt: markets.find((market) => market.registryRefreshedAt)?.registryRefreshedAt ?? null,
      cachedAt: result.rows[0]?.updated_at?.toISOString?.() ?? new Date().toISOString(),
    };
  }

  async readMarketIntelligence(conditionIdOrSlug) {
    if (!this.isAvailable()) return null;
    await this.ensureSchema();
    const normalized = String(conditionIdOrSlug ?? "").toLowerCase();
    const result = await this.pool.query(
      `
        select payload, updated_at
        from market_intelligence_snapshots
        where lower(condition_id) = $1 or lower(payload->>'marketSlug') = $1
        limit 1
      `,
      [normalized],
    );
    return result.rows[0]?.payload ?? null;
  }

  async readCandidateWallets({ limit = 2500 } = {}) {
    if (!this.isAvailable()) return [];
    await this.ensureSchema();
    const result = await this.pool.query(
      `select wallet from wallet_candidates order by last_seen_at desc limit $1`,
      [limit],
    );
    return result.rows.map((row) => row.wallet);
  }

  async readMarketMetadataByConditionIds(conditionIds) {
    if (!this.isAvailable() || conditionIds.length === 0) return new Map();
    await this.ensureSchema();
    const result = await this.pool.query(
      `
        select condition_id, slug, question, current_prices, categories, tags, volume_24h, raw
        from polymarket_markets
        where condition_id = any($1)
      `,
      [conditionIds],
    );
    return new Map(
      result.rows.map((row) => [
        row.condition_id,
        {
          conditionId: row.condition_id,
          marketSlug: row.slug,
          slug: row.slug,
          question: row.question,
          currentPrices: row.current_prices,
          parentTags: row.categories ?? [],
          rawTags: row.tags ?? [],
          tags: row.tags ?? [],
          volume24h: Number(row.volume_24h ?? 0),
          raw: row.raw,
        },
      ]),
    );
  }

  async readCategoryPerformanceByCategories(categories) {
    if (!this.isAvailable() || categories.length === 0) return [];
    await this.ensureSchema();
    const result = await this.pool.query(
      `
        select wallet, category, label, metrics
        from wallet_category_performance
        where category = any($1)
      `,
      [categories],
    );
    return result.rows.map((row) => ({
      wallet: row.wallet,
      category: row.category,
      label: row.label,
      metrics: row.metrics,
      ...row.metrics,
    }));
  }

  async readAllCategoryPerformance() {
    if (!this.isAvailable()) return [];
    await this.ensureSchema();
    const result = await this.pool.query(
      `select wallet, category, label, metrics from wallet_category_performance`,
    );
    return result.rows.map((row) => ({
      wallet: row.wallet,
      category: row.category,
      label: row.label,
      metrics: row.metrics,
      ...row.metrics,
    }));
  }

  async saveRegistryRun({ startedAt, status, audit }) {
    if (!this.isAvailable()) return null;
    await this.ensureSchema();
    const result = await this.pool.query(
      `
        insert into registry_runs (status, audit, started_at, finished_at)
        values ($1, $2::jsonb, $3::timestamptz, now())
        returning id, finished_at
      `,
      [status, JSON.stringify(audit), startedAt],
    );
    return result.rows[0] ?? null;
  }

  async readRegistryAudit() {
    if (!this.isAvailable()) return null;
    await this.ensureSchema();
    const result = await this.pool.query(
      `select status, audit, started_at, finished_at from registry_runs order by finished_at desc limit 1`,
    );
    return result.rows[0] ?? null;
  }

  async readRawPayloadAudit({ limit = 50 } = {}) {
    if (!this.isAvailable()) return [];
    await this.ensureSchema();
    const result = await this.pool.query(
      `
        select endpoint, params_hash, params, status_code, error, fetched_at
        from raw_polymarket_payloads
        order by fetched_at desc
        limit $1
      `,
      [limit],
    );
    return result.rows.map((row) => ({
      endpoint: row.endpoint,
      paramsHash: row.params_hash,
      params: row.params,
      statusCode: row.status_code,
      error: row.error,
      fetchedAt: row.fetched_at?.toISOString?.() ?? row.fetched_at,
    }));
  }
}

function normalizeTimestamp(value) {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.trunc(numberValue) : null;
}

function normalizeIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
