import { buildHeadline } from "../domain/signal.js";

export function renderShareSvg(scan, selectedOutcome = null) {
  const outcome = selectedOutcome
    ? scan.outcomes.find((item) => item.outcome === selectedOutcome)
    : scan.outcomes[0];
  const headline = scan.headline ?? buildHeadline(scan);
  const rows = (outcome?.topSpecialists ?? []).slice(0, 3);
  const generatedAt = new Date().toISOString();
  const safeTitle = escapeXml(scan.question);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
  <rect width="1200" height="675" fill="#f7f4ee"/>
  <rect x="48" y="42" width="1104" height="591" rx="8" fill="#151515"/>
  <text x="82" y="92" fill="#f7f4ee" font-family="Arial, sans-serif" font-size="28" font-weight="700">pref</text>
  <text x="880" y="92" fill="#a7aca2" font-family="Arial, sans-serif" font-size="20">${escapeXml(formatDate(generatedAt))}</text>
  <text x="82" y="170" fill="#f7f4ee" font-family="Arial, sans-serif" font-size="44" font-weight="700">${safeTitle}</text>
  <text x="82" y="250" fill="#ffcf5a" font-family="Arial, sans-serif" font-size="52" font-weight="700">${escapeXml(headline)}</text>
  <text x="82" y="312" fill="#a7aca2" font-family="Arial, sans-serif" font-size="24">Current prices: ${escapeXml(priceLine(scan.currentPrices))}</text>
  ${rows.map((row, index) => renderRow(row, 380 + index * 66)).join("")}
  <text x="82" y="586" fill="#a7aca2" font-family="Arial, sans-serif" font-size="21">Registry refreshed nightly · pref/${escapeXml(scan.conditionId)}</text>
</svg>`;
}

function renderRow(row, y) {
  return `
  <rect x="82" y="${y - 36}" width="1036" height="54" rx="6" fill="#242424"/>
  <text x="108" y="${y}" fill="#f7f4ee" font-family="Arial, sans-serif" font-size="25" font-weight="700">${escapeXml(row.displayLabel)}</text>
  <text x="406" y="${y}" fill="#f7f4ee" font-family="Arial, sans-serif" font-size="24">${escapeXml(row.currentOutcome)} · avg ${formatEntry(row.averageEntry)}</text>
  <text x="746" y="${y}" fill="#a7aca2" font-family="Arial, sans-serif" font-size="24">PnL $${Math.round(row.realizedPnl).toLocaleString()} · ROI ${Math.round(row.roi * 100)}%</text>`;
}

function priceLine(prices) {
  return Object.entries(prices)
    .map(([outcome, price]) => `${outcome} ${Math.round(price * 100)}c`)
    .join(" / ");
}

function formatEntry(value) {
  return typeof value === "number" ? `${Math.round(value * 100)}c` : "unavailable";
}

function formatDate(value) {
  return new Date(value).toISOString().slice(0, 16).replace("T", " ");
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
