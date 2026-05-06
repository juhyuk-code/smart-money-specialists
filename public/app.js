import { layoutWithLines, prepareWithSegments } from "https://esm.sh/@chenglou/pretext@0.0.6";

const PRETEXT_FONT = "20px Iowan Old Style";
const PRETEXT_LINE_HEIGHT = 27;

const state = {
  markets: [],
  category: "all",
  sort: "volume",
  hideInsufficient: false,
  search: "",
  preparedCorpus: null,
  corpusText: "",
  mouse: { x: 0, y: 0 },
};

const list = document.querySelector("#marketList");
const freshness = document.querySelector("#registryFreshness");
const marketCount = document.querySelector("#marketCount");
const signalCount = document.querySelector("#signalCount");
const dominantSignal = document.querySelector("#dominantSignal");
const coverageState = document.querySelector("#coverageState");
const signalCanvas = document.querySelector("#signalCanvas");
const signalContext = signalCanvas.getContext("2d");
const categoryFilter = document.querySelector("#categoryFilter");
const sortMode = document.querySelector("#sortMode");
const hideInsufficient = document.querySelector("#hideInsufficient");
const marketSearch = document.querySelector("#marketSearch");
const customScanForm = document.querySelector("#customScanForm");
const customUrl = document.querySelector("#customUrl");
const customScanNotice = document.querySelector("#customScanNotice");

window.addEventListener("resize", resizeSignalCanvas);
window.addEventListener("pointermove", (event) => {
  state.mouse = { x: event.clientX, y: event.clientY };
});

resizeSignalCanvas();
requestAnimationFrame(drawSignalCanvas);
loadMarkets();

categoryFilter.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-category]");
  if (!button) return;
  state.category = button.dataset.category;
  categoryFilter.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
  render();
});

sortMode.addEventListener("change", () => {
  state.sort = sortMode.value;
  render();
});

hideInsufficient.addEventListener("change", () => {
  state.hideInsufficient = hideInsufficient.checked;
  render();
});

marketSearch.addEventListener("input", () => {
  state.search = marketSearch.value.trim().toLowerCase();
  render();
});

customScanForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  customScanNotice.hidden = false;
  customScanNotice.textContent = "Resolving market";
  try {
    const response = await fetch("/api/smart-money/custom-scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: customUrl.value }),
    });
    const result = await response.json();
    if (!response.ok) {
      customScanNotice.textContent = result.error ?? "We could not resolve this market yet.";
      return;
    }
    state.markets = mergeMarkets(result.markets, state.markets);
    prepareSignalCorpus(state.markets);
    customScanNotice.textContent = "Custom scan added";
    render();
  } catch {
    customScanNotice.textContent = "Custom scan failed";
  }
});

async function loadMarkets() {
  list.innerHTML = `<div class="empty">Loading specialist signals</div>`;
  const response = await fetch("/api/smart-money/markets");
  const data = await response.json();
  state.markets = data.markets;
  prepareSignalCorpus(state.markets);
  freshness.textContent = `Registry refreshed ${relativeTime(data.registryRefreshedAt)}`;
  render();
}

function render() {
  const markets = sorted(filtered(state.markets));
  renderSummary(markets);
  if (markets.length === 0) {
    list.innerHTML = `<div class="empty">No markets match the current filters.</div>`;
    return;
  }
  list.innerHTML = markets.map(renderMarket).join("");
  list.querySelectorAll(".market-summary").forEach((button) => {
    button.addEventListener("click", () => button.closest(".market").classList.toggle("open"));
  });
}

function filtered(markets) {
  return markets.filter((market) => {
    if (state.category !== "all" && !market.parentTags.includes(state.category)) return false;
    if (state.hideInsufficient && market.status === "insufficient_category_data") return false;
    if (state.search && !market.question.toLowerCase().includes(state.search)) return false;
    return true;
  });
}

function sorted(markets) {
  return [...markets].sort((a, b) => {
    if (state.sort === "specialists") return specialistCount(b) - specialistCount(a);
    if (state.sort === "skew") return skew(b) - skew(a);
    return (b.volume24h ?? 0) - (a.volume24h ?? 0);
  });
}

function renderMarket(market) {
  return `
    <article class="market ${market.status === "ready" ? "ready" : "insufficient"}">
      <button class="market-summary" type="button">
        <div>
          <p class="question">${escapeHtml(market.question)}</p>
          <div class="tags">${market.parentTags.map((tag) => `<span class="tag">${tag}</span>`).join("")}</div>
          <div class="meta">24h volume ${currency(market.volume24h)} · positions ${relativeTime(market.marketDataRefreshedAt)}</div>
        </div>
        <div class="prices">${Object.entries(market.currentPrices).map(renderPrice).join("")}</div>
        <div>
          <div class="headline">${escapeHtml(market.headline)}</div>
          <div class="status"><span>${statusLabel(market.status)}</span></div>
        </div>
        <div class="actions">
          <span class="icon-button" title="Expand">⌄</span>
          <a class="icon-button" title="Share image" href="/api/smart-money/share/${encodeURIComponent(market.conditionId)}.png" target="_blank" rel="noreferrer" onclick="event.stopPropagation()">↗</a>
        </div>
      </button>
      <div class="details">
        ${renderSplit(market)}
        ${renderSpecialists(market)}
      </div>
    </article>
  `;
}

function renderSummary(markets) {
  const ready = markets.filter((market) => market.status === "ready");
  marketCount.textContent = String(markets.length);
  signalCount.textContent = String(ready.length);
  dominantSignal.textContent = ready[0]?.headline ?? "No ready specialist signal";
  const thin = markets.filter((market) => market.status === "insufficient_category_data").length;
  coverageState.textContent = thin === 0 ? "All visible markets have category coverage" : `${thin} visible markets need more specialist density`;
}

function renderSplit(market) {
  if (market.outcomes.length === 0) return `<div class="empty">${statusLabel(market.status)}</div>`;
  const max = Math.max(...market.outcomes.map((outcome) => outcome.specialistCount), 1);
  return `
    <div class="split">
      ${market.outcomes
        .map(
          (outcome) => `
            <div class="bar-row">
              <strong>${escapeHtml(outcome.outcome)}</strong>
              <div class="bar-track"><div class="bar-fill" style="width:${(outcome.specialistCount / max) * 100}%"></div></div>
              <span>${outcome.specialistCount} wallets · ${entry(outcome.weightedAverageEntry)}</span>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderSpecialists(market) {
  const rows = market.outcomes.flatMap((outcome) => outcome.topSpecialists);
  if (rows.length === 0) return "";
  return `
    <table class="specialists">
      <thead><tr><th>Wallet</th><th>Outcome</th><th>Avg entry</th><th>PnL</th><th>ROI</th><th>Closed</th><th>90d PnL</th></tr></thead>
      <tbody>
        ${rows
          .map(
            (row) => `
              <tr>
                <td>${escapeHtml(row.displayLabel)}</td>
                <td>${escapeHtml(row.currentOutcome)}</td>
                <td>${entry(row.averageEntry)}</td>
                <td>${currency(row.realizedPnl)}</td>
                <td>${Math.round(row.roi * 100)}%</td>
                <td>${row.closedMarkets}</td>
                <td>${currency(row.last90dPnl)}</td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderPrice([outcome, price]) {
  return `<div class="price">${escapeHtml(outcome)}<strong>${Math.round(price * 100)}c</strong></div>`;
}

function specialistCount(market) {
  return market.outcomes.reduce((sum, outcome) => sum + outcome.specialistCount, 0);
}

function skew(market) {
  const counts = market.outcomes.map((outcome) => outcome.specialistCount);
  if (counts.length < 2) return counts[0] ?? 0;
  return Math.max(...counts) - Math.min(...counts);
}

function mergeMarkets(incoming, existing) {
  const byId = new Map(existing.map((market) => [market.conditionId, market]));
  for (const market of incoming) byId.set(market.conditionId, market);
  return [...byId.values()];
}

function prepareSignalCorpus(markets) {
  const text = markets
    .map((market) => {
      const tags = market.parentTags.join(", ") || "untagged";
      return `${market.question} ${market.headline}. ${tags}. Registry and holder freshness are separate. `;
    })
    .join("");
  state.corpusText = text;
  state.preparedCorpus = prepareWithSegments(text, PRETEXT_FONT);
}

function resizeSignalCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  signalCanvas.width = Math.floor(window.innerWidth * dpr);
  signalCanvas.height = Math.floor(window.innerHeight * dpr);
  signalCanvas.style.width = `${window.innerWidth}px`;
  signalCanvas.style.height = `${window.innerHeight}px`;
  signalContext.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawSignalCanvas(time = 0) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  signalContext.clearRect(0, 0, width, height);
  drawVignette(width, height);

  if (state.preparedCorpus) {
    const columnWidth = Math.max(320, Math.min(760, width * 0.58));
    const lines = layoutWithLines(state.preparedCorpus, columnWidth, PRETEXT_LINE_HEIGHT).lines;
    const pulseX = state.mouse.x || width * 0.72;
    const pulseY = state.mouse.y || height * 0.28;
    const pulse = 54 + Math.sin(time / 620) * 18;
    const startX = Math.max(24, width - columnWidth - 42);
    const startY = 34 - (time / 90) % PRETEXT_LINE_HEIGHT;

    signalContext.save();
    signalContext.font = PRETEXT_FONT;
    signalContext.textBaseline = "top";
    for (let i = 0; i < lines.length; i += 1) {
      const y = startY + i * PRETEXT_LINE_HEIGHT;
      if (y < -PRETEXT_LINE_HEIGHT || y > height + PRETEXT_LINE_HEIGHT) continue;
      const distance = Math.hypot(startX + lines[i].width * 0.5 - pulseX, y - pulseY);
      const displacedX = distance < pulse + 120 ? startX - (pulse + 120 - distance) * 0.32 : startX;
      const alpha = Math.max(0.045, 0.16 - Math.abs(y - height * 0.42) / height * 0.12);
      signalContext.fillStyle = `rgba(246, 241, 232, ${alpha})`;
      signalContext.fillText(lines[i].text, displacedX, y);
    }
    signalContext.restore();

    signalContext.save();
    signalContext.beginPath();
    signalContext.arc(pulseX, pulseY, pulse, 0, Math.PI * 2);
    signalContext.strokeStyle = "rgba(232, 199, 102, 0.42)";
    signalContext.lineWidth = 1;
    signalContext.stroke();
    signalContext.beginPath();
    signalContext.arc(pulseX, pulseY, Math.max(10, pulse * 0.34), 0, Math.PI * 2);
    signalContext.fillStyle = "rgba(232, 199, 102, 0.18)";
    signalContext.fill();
    signalContext.restore();
  }

  requestAnimationFrame(drawSignalCanvas);
}

function drawVignette(width, height) {
  const gradient = signalContext.createRadialGradient(width * 0.5, height * 0.18, 40, width * 0.5, height * 0.2, width);
  gradient.addColorStop(0, "rgba(232, 199, 102, 0.1)");
  gradient.addColorStop(0.48, "rgba(13, 13, 11, 0.0)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0.52)");
  signalContext.fillStyle = gradient;
  signalContext.fillRect(0, 0, width, height);
}

function statusLabel(status) {
  return {
    ready: "Signal ready",
    insufficient_category_data: "Insufficient specialist data",
    no_specialists_currently_holding: "No tracked specialists holding",
    average_entry_unavailable: "Avg entry unavailable",
    market_metadata_unavailable: "Market metadata unavailable",
    holder_fetch_failed: "Holder fetch failed",
    registry_stale: "Registry stale",
    login_required: "Login required",
  }[status] ?? status;
}

function entry(value) {
  return typeof value === "number" ? `${Math.round(value * 100)}c` : "avg unavailable";
}

function currency(value) {
  if (typeof value !== "number") return "n/a";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function relativeTime(value) {
  if (!value) return "unknown";
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60_000));
  if (minutes < 2) return "<2m ago";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
