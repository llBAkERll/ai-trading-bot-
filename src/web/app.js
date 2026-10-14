let walletAddress = null;

const money = (value) => `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const short = (value) => value ? `${value.slice(0, 4)}...${value.slice(-4)}` : "";

async function api(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body;
}

function renderSummary(summary) {
  document.querySelector("#cash").textContent = money(summary.cashUsdc);
  document.querySelector("#openValue").textContent = money(summary.openValueUsdc);
  document.querySelector("#equity").textContent = money(summary.equityUsdc);
  document.querySelector("#closedPnl").textContent = money(summary.closedPnlUsdc);
}

function renderPositions(positions) {
  const tbody = document.querySelector("#positionRows");
  tbody.innerHTML = "";
  if (!positions.length) {
    tbody.innerHTML = `<tr><td colspan="6">No open demo positions yet.</td></tr>`;
    return;
  }
  for (const position of positions) {
    const pnl = Number(position.unrealizedPnlPct || 0);
    tbody.insertAdjacentHTML("beforeend", `
      <tr>
        <td><strong>${position.baseSymbol}</strong></td>
        <td>${position.entryPriceUsd}</td>
        <td>${position.lastPriceUsd}</td>
        <td>${money(position.entryValueUsdc)}</td>
        <td>${money(position.lastValueUsdc || position.entryValueUsdc)}</td>
        <td class="${pnl >= 0 ? "positive" : "negative"}">${pnl.toFixed(2)}%</td>
        <td><small>${position.evaluation || ""}<br>${position.tradePlan?.plan || ""}</small></td>
      </tr>
    `);
  }
}

function renderAuto(auto) {
  document.querySelector("#autoStatus").textContent = auto?.enabled ? auto.running ? "Running now" : "Watching market" : "Stopped";
  document.querySelector("#lastCycle").textContent = auto?.lastRun ? new Date(auto.lastRun).toLocaleTimeString() : "Never";
  const latest = auto?.events?.[0];
  document.querySelector("#latestAction").textContent = latest ? `${latest.type.toUpperCase()} ${latest.token}` : auto?.lastError || "Waiting";

  const feed = document.querySelector("#eventFeed");
  feed.innerHTML = "";
  if (!auto?.events?.length) {
    feed.innerHTML = `<p class="status-text">No bot actions yet. Start auto demo or run one bot cycle.</p>`;
    return;
  }

  for (const event of auto.events.slice(0, 12)) {
    const isSell = event.type === "sell";
    const pnl = event.pnlPct === undefined ? "" : ` · ${Number(event.pnlPct).toFixed(2)}%`;
    feed.insertAdjacentHTML("beforeend", `
      <div class="event">
        <strong class="${isSell ? "negative" : "positive"}">${event.type.toUpperCase()}</strong>
        <div>
          <strong>${event.token}</strong>
          <small>${event.reason}${pnl}</small>
        </div>
        <span>${money(event.valueUsdc)}</span>
      </div>
    `);
  }
}

function renderAvoided(tokens) {
  const feed = document.querySelector("#avoidFeed");
  feed.innerHTML = "";
  if (!tokens?.length) {
    feed.innerHTML = `<p class="status-text">No avoided tokens yet.</p>`;
    return;
  }
  for (const token of tokens.slice(0, 12)) {
    feed.insertAdjacentHTML("beforeend", `
      <div class="event">
        <strong class="negative">AVOID</strong>
        <div>
          <strong>${short(token.address)}</strong>
          <small>losses: ${token.losses || 0} · reason: ${token.lastExitReason || "loss cooldown"}</small>
        </div>
        <span>${token.avoidUntil ? new Date(token.avoidUntil).toLocaleTimeString() : "blocked"}</span>
      </div>
    `);
  }
}

function renderMarket(candidates) {
  const tbody = document.querySelector("#marketRows");
  tbody.innerHTML = "";
  if (!candidates.length) {
    tbody.innerHTML = `<tr><td colspan="7">No live tokens returned yet.</td></tr>`;
    return;
  }
  for (const pair of candidates) {
    const change = Number(pair.priceChange5m || 0);
    tbody.insertAdjacentHTML("beforeend", `
      <tr>
        <td><a href="${pair.url}" target="_blank" rel="noreferrer"><strong>${pair.baseSymbol}</strong></a><br><small>${pair.baseName}</small></td>
        <td>${pair.score}</td>
        <td>${pair.priceUsd}</td>
        <td>${money(pair.liquidityUsd)}</td>
        <td>${money(pair.volume24h)}</td>
        <td class="${change >= 0 ? "positive" : "negative"}">${change.toFixed(2)}%</td>
        <td><small>${pair.tradePlan?.thesis || "Live Solana pair from broad scan."}<br>${pair.tradePlan?.plan || ""}</small></td>
      </tr>
    `);
  }
}

async function loadMarket() {
  document.querySelector("#marketRows").innerHTML = `<tr><td colspan="6">Loading live tokens...</td></tr>`;
  const data = await api("/api/market");
  renderMarket(data.candidates.length ? data.candidates : data.pairs);
}

async function loadStatus() {
  const data = await api("/api/demo/status");
  renderSummary(data.summary);
  renderPositions(data.positions);
  renderAuto(data.auto);
  renderAvoided(data.avoidedTokens);
  const metrics=data.executionMetrics||{};
  document.querySelector("#executionFees").textContent=money(metrics.estimatedFeesUsdc);
  document.querySelector("#executionSlippage").textContent=Number(metrics.averageRequoteSlippageBps||0).toFixed(2)+" bps";
  document.querySelector("#executionDelay").textContent=Math.round(metrics.averageDelayMs||0)+" ms";
  document.querySelector("#executionFills").textContent=String(metrics.paperFills||0);
}

async function connectWallet() {
  if (!window.solana?.isPhantom) {
    document.querySelector("#walletStatus").textContent = "Install Phantom to connect";
    return;
  }
  const result = await window.solana.connect();
  walletAddress = result.publicKey.toString();
  document.querySelector("#walletStatus").textContent = short(walletAddress);
}

async function startAuto(riskLevel) {
  const data = await api("/api/demo/auto/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ riskLevel })
  });
  renderSummary(data.summary);
  renderPositions(data.positions);
  renderAuto(data.auto);
  renderAvoided([]);
  closeRiskMenu();
}

async function stopAuto() {
  const data = await api("/api/demo/auto/stop", { method: "POST" });
  renderSummary(data.summary);
  renderPositions(data.positions);
  renderAuto(data.auto);
}

async function resetDemo() {
  const data = await api("/api/demo/reset", { method: "POST" });
  renderSummary(data.summary);
  renderPositions(data.positions);
  renderAuto(data.auto);
}

async function upgradePro() {
  const data = await api("/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wallet: walletAddress })
  });
  document.querySelector("#checkoutStatus").textContent = data.message;
}

document.querySelector("#connectWallet").addEventListener("click", connectWallet);
document.querySelector("#refreshMarket").addEventListener("click", loadMarket);
document.querySelector("#openRiskMenu").addEventListener("click", openRiskMenu);
document.querySelector("#closeRiskMenu").addEventListener("click", closeRiskMenu);
document.querySelectorAll(".risk-card").forEach((button) => {
  button.addEventListener("click", () => startAuto(button.dataset.risk));
});
document.querySelector("#stopAuto").addEventListener("click", stopAuto);
document.querySelector("#resetDemo").addEventListener("click", resetDemo);
document.querySelector("#upgradePro").addEventListener("click", upgradePro);

function openRiskMenu() {
  document.querySelector("#riskModal").classList.remove("hidden");
}

function closeRiskMenu() {
  document.querySelector("#riskModal").classList.add("hidden");
}

loadStatus();
loadMarket();
setInterval(loadStatus, 5_000);
setInterval(loadMarket, 30_000);
