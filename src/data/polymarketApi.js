import crypto from "node:crypto";
import { normalizeCategories, normalizeWallet } from "../domain/polymarketSmartMoney.js";

const GAMMA_BASE_URL = "https://gamma-api.polymarket.com";
const DATA_BASE_URL = "https://data-api.polymarket.com";
const CLOB_BASE_URL = "https://clob.polymarket.com";
const TOP_MARKET_LIMIT = 40;
const MARKET_POSITION_LIMIT = 100;
const CLOSED_POSITION_LIMIT = 50;
const CURRENT_POSITION_LIMIT = 50;
const LEADERBOARD_LIMIT = 50;
const ALL_TIME_PNL_COHORT_LIMIT = 1000;
const DEFAULT_MAX_CLOSED_POSITION_PAGES = Number(process.env.POLYMARKET_CLOSED_POSITION_MAX_PAGES ?? 20);
const DEFAULT_MAX_CURRENT_POSITION_PAGES = Number(process.env.POLYMARKET_CURRENT_POSITION_MAX_PAGES ?? 20);

export class PolymarketApi {
  constructor({
    fetchImpl = globalThis.fetch,
    store = null,
    rateLimitMs = Number(process.env.POLYMARKET_RATE_LIMIT_MS ?? 120),
    maxRetries = Number(process.env.POLYMARKET_MAX_RETRIES ?? 2),
    requestTimeoutMs = Number(process.env.POLYMARKET_REQUEST_TIMEOUT_MS ?? 8000),
    rawPayloadPersistence = process.env.POLYMARKET_RAW_PAYLOAD_PERSISTENCE ?? "async",
  } = {}) {
    if (typeof fetchImpl !== "function") throw new Error("PolymarketApi requires fetch");
    this.fetchImpl = fetchImpl;
    this.store = store;
    this.rateLimitMs = rateLimitMs;
    this.maxRetries = maxRetries;
    this.requestTimeoutMs = requestTimeoutMs;
    this.rawPayloadPersistence = normalizeRawPayloadPersistence(rawPayloadPersistence);
    this.nextAllowedAt = 0;
    this.marketCache = new Map();
    this.diagnostics = {
      requests: 0,
      retries: 0,
      rawPayloadsSaved: 0,
      rawPayloadSaveErrors: 0,
      requestErrors: [],
      topMarketsFetched: 0,
      marketPositionsFetched: 0,
      currentPositionsFetched: 0,
      closedPositionsFetched: 0,
      leaderboardWalletsFetched: 0,
      priceHistoryFetched: 0,
    };
  }

  async listTrendingMarkets({ limit = TOP_MARKET_LIMIT } = {}) {
    const payload = await this.requestJson(GAMMA_BASE_URL, "/markets", {
      active: "true",
      closed: "false",
      limit,
      order: "volume24hr",
      ascending: "false",
    });
    const rows = arrayFrom(payload, ["markets", "data", "results"]);
    const markets = rows.map((row) => normalizeMarket(row)).filter((market) => market?.conditionId);
    this.diagnostics.topMarketsFetched += markets.length;
    for (const market of markets) this.marketCache.set(market.conditionId, market);
    return { markets };
  }

  async fetchMarketsBySlugs(slugs) {
    const markets = [];
    for (const slug of slugs.filter(Boolean)) {
      const payload = await this.requestJson(GAMMA_BASE_URL, "/markets", { slug });
      const rows = arrayFrom(payload, ["markets", "data", "results"]);
      for (const row of rows) {
        const market = normalizeMarket(row);
        if (market?.conditionId) {
          this.marketCache.set(market.conditionId, market);
          markets.push(market);
        }
      }
    }
    return markets;
  }

  async resolvePolymarketUrl(urlValue) {
    const slug = slugFromPolymarketUrl(urlValue);
    if (!slug) return { conditionIds: [], markets: [], error: "unsupported" };

    const markets = await this.fetchMarketsBySlugs([slug]);
    if (markets.length > 0) {
      return {
        conditionIds: markets.map((market) => market.conditionId),
        markets,
        error: null,
      };
    }

    const eventPayload = await this.requestJson(GAMMA_BASE_URL, "/events", { slug });
    const events = arrayFrom(eventPayload, ["events", "data", "results"]);
    const eventMarkets = events.flatMap((event) => parseArray(event.markets)).map((row) => normalizeMarket(row)).filter(Boolean);
    for (const market of eventMarkets) {
      if (market.conditionId) this.marketCache.set(market.conditionId, market);
    }
    return {
      conditionIds: eventMarkets.map((market) => market.conditionId).filter(Boolean),
      markets: eventMarkets,
      error: eventMarkets.length > 0 ? null : "not_found",
    };
  }

  async listMarketPositions(conditionId, { limit = MARKET_POSITION_LIMIT, status = "OPEN" } = {}) {
    const fetchedAt = new Date().toISOString();
    const payload = await this.requestJson(DATA_BASE_URL, "/v1/market-positions", {
      market: conditionId,
      status,
      limit,
      sortBy: "TOKENS",
      sortDirection: "DESC",
    });
    const positions = normalizeMarketPositions(payload, conditionId);
    this.diagnostics.marketPositionsFetched += positions.length;
    return { positions, holders: positions, fetchedAt };
  }

  async listTopHolders(conditionId) {
    const { positions, fetchedAt } = await this.listMarketPositions(conditionId, { limit: MARKET_POSITION_LIMIT, status: "OPEN" });
    return { holders: positions, fetchedAt };
  }

  async listCurrentPositionsForWallet(
    walletValue,
    {
      limit = CURRENT_POSITION_LIMIT,
      maxPages = DEFAULT_MAX_CURRENT_POSITION_PAGES,
      sizeThreshold = Number(process.env.POLYMARKET_CURRENT_POSITION_SIZE_THRESHOLD ?? 0),
    } = {},
  ) {
    const wallet = normalizeWallet(walletValue);
    const fetchedAt = new Date().toISOString();
    if (!wallet) return { wallet: walletValue, positions: [], fetchedAt };

    const positions = [];
    for (let page = 0; page < maxPages; page += 1) {
      const offset = page * limit;
      const payload = await this.requestJson(DATA_BASE_URL, "/positions", {
        user: wallet,
        limit,
        offset,
        sizeThreshold,
      });
      const rows = arrayFrom(payload, ["positions", "data", "results"]);
      positions.push(...rows.map((row) => normalizeCurrentPosition(row, wallet)).filter(Boolean));
      if (rows.length < limit) break;
    }

    this.diagnostics.currentPositionsFetched += positions.length;
    return { wallet, positions, fetchedAt };
  }

  async listClosedPositionsForWallet(walletValue, { maxPages = DEFAULT_MAX_CLOSED_POSITION_PAGES } = {}) {
    const wallet = normalizeWallet(walletValue);
    if (!wallet) return { wallet: walletValue, positions: [] };

    const positions = [];
    for (let page = 0; page < maxPages; page += 1) {
      const offset = page * CLOSED_POSITION_LIMIT;
      const payload = await this.requestJson(DATA_BASE_URL, "/closed-positions", {
        user: wallet,
        limit: CLOSED_POSITION_LIMIT,
        offset,
        sortBy: "TIMESTAMP",
        sortDirection: "DESC",
      });
      const rows = arrayFrom(payload, ["positions", "data", "results"]);
      positions.push(...rows.map((row) => normalizeClosedPosition(row, wallet)).filter(Boolean));
      if (rows.length < CLOSED_POSITION_LIMIT) break;
    }

    this.diagnostics.closedPositionsFetched += positions.length;
    return { wallet, positions };
  }

  async listLeaderboard({
    category = "OVERALL",
    timePeriod = "MONTH",
    orderBy = "PNL",
    limit = LEADERBOARD_LIMIT,
    offset = 0,
  } = {}) {
    const payload = await this.requestJson(DATA_BASE_URL, "/v1/leaderboard", {
      category,
      timePeriod,
      orderBy,
      limit,
      offset,
    });
    const rows = arrayFrom(payload, ["data", "results"]);
    const wallets = rows
      .map((row) => ({
        wallet: normalizeWallet(row.proxyWallet ?? row.wallet ?? row.user),
        userName: row.userName ?? null,
        rank: toNumber(row.rank),
        pnl: toNumber(row.pnl),
        volume: toNumber(row.vol ?? row.volume),
        category,
        timePeriod,
        orderBy,
        raw: row,
      }))
      .filter((row) => row.wallet);
    this.diagnostics.leaderboardWalletsFetched += wallets.length;
    return { wallets };
  }

  async listAllTimePnlLeaderboardCohort({
    limit = LEADERBOARD_LIMIT,
    maxRows = ALL_TIME_PNL_COHORT_LIMIT,
  } = {}) {
    const fetchedAt = new Date().toISOString();
    const byWallet = new Map();
    const pageSize = Math.min(limit, LEADERBOARD_LIMIT);
    for (let offset = 0; offset < maxRows; offset += pageSize) {
      const { wallets } = await this.listLeaderboard({
        category: "OVERALL",
        timePeriod: "ALL",
        orderBy: "PNL",
        limit: pageSize,
        offset,
      });
      for (const row of wallets) {
        const current = byWallet.get(row.wallet) ?? { wallet: row.wallet, sources: [] };
        current.sources.push({
          category: "OVERALL",
          timePeriod: "ALL",
          orderBy: "PNL",
          rank: row.rank,
          pnl: row.pnl,
          volume: row.volume,
        });
        byWallet.set(row.wallet, current);
      }
      if (wallets.length < pageSize) break;
    }
    return { wallets: Array.from(byWallet.values()), fetchedAt };
  }

  async discoverLeaderboardWallets({
    categories = ["OVERALL", "POLITICS", "SPORTS", "CRYPTO", "CULTURE", "WEATHER", "ECONOMICS", "TECH", "FINANCE"],
    timePeriods = ["ALL"],
    orderBys = ["PNL", "VOL"],
    limit = LEADERBOARD_LIMIT,
    maxRowsPerSlice = Number(process.env.POLYMARKET_LEADERBOARD_MAX_ROWS_PER_SLICE ?? 1000),
  } = {}) {
    const byWallet = new Map();
    for (const category of categories) {
      for (const timePeriod of timePeriods) {
        for (const orderBy of orderBys) {
          for (let offset = 0; offset < maxRowsPerSlice; offset += limit) {
            const { wallets } = await this.listLeaderboard({ category, timePeriod, orderBy, limit, offset });
            for (const row of wallets) {
              const current = byWallet.get(row.wallet) ?? { wallet: row.wallet, sources: [] };
              current.sources.push({ category, timePeriod, orderBy, rank: row.rank, pnl: row.pnl, volume: row.volume });
              byWallet.set(row.wallet, current);
            }
            if (wallets.length < limit) break;
          }
        }
      }
    }
    return { wallets: Array.from(byWallet.values()) };
  }

  async getPricesHistory({ market, startTs, endTs, interval = "1h", fidelity = 60 }) {
    const payload = await this.requestJson(CLOB_BASE_URL, "/prices-history", {
      market,
      startTs,
      endTs,
      interval,
      fidelity,
    });
    const history = arrayFrom(payload, ["history", "data", "results"])
      .map((row) => ({ t: toNumber(row.t ?? row.timestamp), p: toNumber(row.p ?? row.price) }))
      .filter((row) => row.t !== null && row.p !== null);
    this.diagnostics.priceHistoryFetched += history.length;
    return { history };
  }

  async probeTrendingMarkets() {
    const { markets } = await this.listTrendingMarkets({ limit: Math.min(5, TOP_MARKET_LIMIT) });
    return {
      markets: markets.map((market) => ({
        conditionId: market.conditionId,
        slug: market.marketSlug,
        question: market.question,
        categories: market.parentTags,
        volume24h: market.volume24h,
        currentPrices: market.currentPrices,
      })),
    };
  }

  getDiagnostics() {
    return { ...this.diagnostics };
  }

  async requestJson(baseUrl, path, params = {}) {
    const url = new URL(path, baseUrl);
    for (const [key, value] of Object.entries(params)) {
      if (value === null || value === undefined || value === "") continue;
      if (Array.isArray(value)) {
        for (const item of value) url.searchParams.append(key, item);
      } else {
        url.searchParams.set(key, String(value));
      }
    }

    let lastError;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      await this.waitForRateLimit();
      this.diagnostics.requests += 1;
      try {
        const response = await this.fetchWithTimeout(url, { headers: { accept: "application/json" } });
        const text = await response.text();
        const payload = text ? JSON.parse(text) : null;
        await this.recordRawPayload({
          endpoint: `${baseUrl}${path}`,
          params,
          payload,
          statusCode: response.status,
          error: response.ok ? null : `HTTP ${response.status}`,
        });
        if (response.ok) return payload;
        lastError = new Error(`Polymarket ${path} failed with ${response.status}`);
        if (!shouldRetry(response.status) || attempt === this.maxRetries) break;
      } catch (error) {
        lastError = error;
        await this.recordRawPayload({
          endpoint: `${baseUrl}${path}`,
          params,
          payload: null,
          statusCode: null,
          error: error?.message ?? String(error),
        });
        if (attempt === this.maxRetries) break;
      }
      this.diagnostics.retries += 1;
      await sleep((attempt + 1) * 450);
    }

    if (this.diagnostics.requestErrors.length < 10) {
      this.diagnostics.requestErrors.push({
        endpoint: `${baseUrl}${path}`,
        params,
        message: lastError?.message ?? String(lastError),
      });
    }
    throw lastError;
  }

  async fetchWithTimeout(url, init = {}) {
    const timeoutMs = Number.isFinite(this.requestTimeoutMs) && this.requestTimeoutMs > 0 ? this.requestTimeoutMs : 8000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (error?.name === "AbortError") throw new Error(`Polymarket request timed out after ${timeoutMs}ms`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async waitForRateLimit() {
    const now = Date.now();
    const waitMs = Math.max(0, this.nextAllowedAt - now);
    this.nextAllowedAt = Math.max(now, this.nextAllowedAt) + this.rateLimitMs;
    if (waitMs > 0) await sleep(waitMs);
  }

  recordRawPayload(args) {
    if (this.rawPayloadPersistence === "off" || typeof this.store?.saveRawPayload !== "function") return;
    const savePromise = this.saveRawPayload(args).catch((error) => this.recordRawPayloadError(error));
    if (this.rawPayloadPersistence === "await") return savePromise;
    return undefined;
  }

  async saveRawPayload({ endpoint, params, payload, statusCode, error }) {
    await this.store.saveRawPayload({
      endpoint,
      params,
      paramsHash: hashParams(params),
      payload,
      statusCode,
      error,
    });
    this.diagnostics.rawPayloadsSaved += 1;
  }

  recordRawPayloadError(error) {
    this.diagnostics.rawPayloadSaveErrors += 1;
    if (this.diagnostics.requestErrors.length < 10) {
      this.diagnostics.requestErrors.push({
        endpoint: "raw-payload-save",
        params: {},
        message: error?.message ?? String(error),
      });
    }
  }
}

export function normalizeMarket(row) {
  if (!row || typeof row !== "object") return null;
  const outcomes = parseArray(row.outcomes);
  const outcomePrices = parseArray(row.outcomePrices ?? row.outcome_prices ?? row.prices);
  const currentPrices = normalizeCurrentPrices(row.currentPrices ?? row.current_prices, outcomes, outcomePrices);
  const tags = collectTags(row);
  const question = row.question ?? row.title ?? row.groupItemTitle ?? "";

  return {
    conditionId: row.conditionId ?? row.condition_id ?? row.conditionID ?? row.condition ?? null,
    marketSlug: row.slug ?? row.marketSlug ?? row.market_slug ?? null,
    slug: row.slug ?? row.marketSlug ?? row.market_slug ?? null,
    question,
    currentPrices,
    parentTags: normalizeCategories({ question, slug: row.slug, tags }),
    rawTags: tags,
    tags,
    volume24h: toNumber(row.volume24hr ?? row.volume24h ?? row.volume_24h ?? row.volumeNum ?? row.volume),
    active: toBoolean(row.active),
    closed: toBoolean(row.closed),
    raw: row,
  };
}

export function normalizeMarketPositions(payload, conditionId) {
  const groups = Array.isArray(payload) ? payload : arrayFrom(payload, ["data", "positions", "results"]);
  const rows = [];
  for (const group of groups) {
    if (Array.isArray(group?.positions)) {
      for (const position of group.positions) rows.push(normalizeOpenPosition(position, conditionId, group.token));
    } else {
      rows.push(normalizeOpenPosition(group, conditionId, group?.token));
    }
  }
  return rows.filter(Boolean);
}

function normalizeOpenPosition(position, conditionId, token) {
  if (!position || typeof position !== "object") return null;
  const wallet = normalizeWallet(position.proxyWallet ?? position.wallet ?? position.user);
  if (!wallet) return null;
  const size = toNumber(position.size ?? position.amount);
  if (!size || size <= 0) return null;
  return {
    wallet,
    proxyWallet: wallet,
    displayLabel: position.name ?? position.pseudonym ?? null,
    knownHandle: null,
    outcome: position.outcome ?? outcomeName(position.outcomeIndex),
    outcomeIndex: toNumber(position.outcomeIndex),
    size,
    averageEntry: toNumber(position.avgPrice ?? position.averageEntry),
    currentPrice: toNumber(position.currPrice ?? position.curPrice),
    currentValue: toNumber(position.currentValue),
    cashPnl: toNumber(position.cashPnl),
    realizedPnl: toNumber(position.realizedPnl),
    totalPnl: toNumber(position.totalPnl),
    totalBought: toNumber(position.totalBought),
    asset: position.asset ?? token ?? null,
    conditionId: position.conditionId ?? conditionId,
    verified: Boolean(position.verified),
    raw: position,
  };
}

function normalizeCurrentPosition(row, wallet) {
  if (!row || typeof row !== "object") return null;
  const normalizedWallet = normalizeWallet(row.proxyWallet ?? row.wallet ?? row.user ?? wallet);
  if (!normalizedWallet) return null;
  const conditionId = row.conditionId ?? row.condition_id ?? row.conditionID ?? row.market ?? row.marketId ?? null;
  if (!conditionId) return null;
  const size = toNumber(row.size ?? row.amount ?? row.quantity);
  if (!size || size <= 0) return null;
  const currentPrice = toNumber(row.curPrice ?? row.currPrice ?? row.currentPrice ?? row.price);
  const averageEntry = toNumber(row.avgPrice ?? row.averageEntry ?? row.average_entry);
  const currentValue = toNumber(row.currentValue ?? row.value) ?? (typeof currentPrice === "number" ? size * currentPrice : null);
  const title = row.title ?? row.question ?? row.marketTitle ?? null;
  const slug = row.slug ?? row.marketSlug ?? row.market_slug ?? row.eventSlug ?? null;
  const outcome = row.outcome ?? outcomeName(row.outcomeIndex);
  const currentPrices = {};
  if (outcome && typeof currentPrice === "number") currentPrices[String(outcome).toUpperCase()] = currentPrice;
  return {
    wallet: normalizedWallet,
    proxyWallet: normalizedWallet,
    conditionId,
    asset: row.asset ?? row.tokenId ?? row.token ?? null,
    outcome,
    outcomeIndex: toNumber(row.outcomeIndex),
    size,
    averageEntry,
    currentPrice,
    currentValue: currentValue === null ? null : Math.round(currentValue * 10000) / 10000,
    cashPnl: toNumber(row.cashPnl),
    realizedPnl: toNumber(row.realizedPnl),
    totalPnl: toNumber(row.totalPnl),
    totalBought: toNumber(row.totalBought),
    question: title,
    title,
    marketSlug: slug,
    slug,
    eventSlug: row.eventSlug ?? null,
    endDate: row.endDate ?? null,
    currentPrices,
    active: row.active === undefined ? true : toBoolean(row.active),
    closed: row.closed === undefined ? false : toBoolean(row.closed),
    raw: row,
  };
}

function normalizeClosedPosition(row, wallet) {
  if (!row || typeof row !== "object") return null;
  const conditionId = row.conditionId ?? row.condition_id ?? row.market;
  if (!conditionId) return null;
  return {
    wallet,
    conditionId,
    asset: row.asset ?? null,
    averageEntry: toNumber(row.avgPrice ?? row.averageEntry),
    totalBought: toNumber(row.totalBought),
    realizedPnl: toNumber(row.realizedPnl),
    currentPrice: toNumber(row.curPrice ?? row.currPrice),
    timestamp: row.timestamp ?? null,
    title: row.title ?? null,
    slug: row.slug ?? null,
    eventSlug: row.eventSlug ?? null,
    outcome: row.outcome ?? null,
    outcomeIndex: toNumber(row.outcomeIndex),
    oppositeOutcome: row.oppositeOutcome ?? null,
    endDate: row.endDate ?? null,
    closed: true,
    raw: row,
  };
}

function normalizeCurrentPrices(value, outcomes, prices) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, price]) => [key, toNumber(price)]).filter(([, price]) => price !== null));
  }
  const result = {};
  for (let index = 0; index < Math.min(outcomes.length, prices.length); index += 1) {
    const price = toNumber(prices[index]);
    if (price !== null) result[String(outcomes[index]).toUpperCase()] = price;
  }
  return result;
}

function collectTags(row) {
  const tags = [];
  for (const field of [row.tags, row.rawTags]) {
    for (const item of parseArray(field)) {
      if (!item) continue;
      if (typeof item === "string") tags.push(item);
      else if (typeof item === "object") tags.push(item.label ?? item.name ?? item.slug ?? item.title ?? "");
    }
  }
  for (const event of parseArray(row.events)) {
    for (const item of parseArray(event.tags)) {
      if (typeof item === "string") tags.push(item);
      else if (item && typeof item === "object") tags.push(item.label ?? item.name ?? item.slug ?? "");
    }
  }
  return [...new Set(tags.filter(Boolean))];
}

function arrayFrom(payload, paths) {
  if (Array.isArray(payload)) return payload;
  for (const path of paths) {
    const value = path.split(".").reduce((current, key) => current?.[key], payload);
    const parsed = parseArray(value);
    if (parsed.length > 0) return parsed;
  }
  return [];
}

function parseArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

function slugFromPolymarketUrl(value) {
  try {
    const url = new URL(value);
    if (!/(^|\.)polymarket\.com$/i.test(url.hostname)) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const markerIndex = parts.findIndex((part) => ["event", "market"].includes(part));
    return markerIndex >= 0 ? parts[markerIndex + 1] ?? null : parts.at(-1) ?? null;
  } catch {
    return null;
  }
}

function normalizeRawPayloadPersistence(value) {
  const normalized = String(value ?? "async").toLowerCase();
  if (["off", "false", "0", "disabled"].includes(normalized)) return "off";
  if (["await", "sync", "blocking"].includes(normalized)) return "await";
  return "async";
}

function hashParams(params) {
  return crypto.createHash("sha256").update(JSON.stringify(sortObject(params))).digest("hex");
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
}

function shouldRetry(status) {
  return status === 429 || status >= 500;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function outcomeName(index) {
  if (index === 0 || index === "0") return "YES";
  if (index === 1 || index === "1") return "NO";
  return "UNKNOWN";
}

function toBoolean(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  return Boolean(value);
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}
