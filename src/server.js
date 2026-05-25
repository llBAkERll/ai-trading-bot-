import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { discoverSolanaPairs, normalizePair } from "./dexscreener.js";
import { loadState, markPositions, openPaperPositions, saveState, summarizeState } from "./portfolio.js";
import { applyRiskProfile, listRiskProfiles } from "./risk-profiles.js";
import { selectCandidates } from "./strategy.js";

const publicDir = path.resolve("src/web");
const port = Number(process.env.PORT || 3010);
let autoTimer = null;
let autoRunning = false;
let autoLastRun = null;
let autoLastError = null;
let autoEvents = [];
let activeRiskLevel = "moderate";

function activeConfig() {
  return applyRiskProfile(config, activeRiskLevel);
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function marketPayload() {
  const tunedConfig = activeConfig();
  const rawPairs = await discoverSolanaPairs(tunedConfig);
  const pairs = rawPairs.map(normalizePair);
  const candidates = selectCandidates(pairs, tunedConfig);
  return {
    query: tunedConfig.discoveryQueries.join(", "),
    riskLevel: tunedConfig.riskLevel,
    updatedAt: new Date().toISOString(),
    pairs: pairs.slice(0, 60),
    candidates
  };
}

async function runDemoBot() {
  const tunedConfig = activeConfig();
  const state = loadState(tunedConfig);
  const rawPairs = await discoverSolanaPairs(tunedConfig);
  const pairs = rawPairs.map(normalizePair);
  const candidates = selectCandidates(pairs, tunedConfig);
  const closed = markPositions(state, pairs, tunedConfig);
  const opened = openPaperPositions(state, candidates, tunedConfig);
  saveState(tunedConfig, state);
  const events = [
    ...closed.map((trade) => ({
      at: trade.exitAt,
      type: "sell",
      token: trade.baseSymbol,
      reason: trade.exitReason,
      pnlPct: trade.pnlPct,
      pnlUsdc: trade.pnlUsdc,
      valueUsdc: trade.exitValueUsdc
    })),
    ...opened.map((position) => ({
      at: position.openedAt,
      type: "buy",
      token: position.baseSymbol,
      reason: "candidate_score",
      score: position.scoreAtEntry,
      valueUsdc: position.entryValueUsdc
    }))
  ];
  autoEvents = [...events, ...autoEvents].slice(0, 50);
  return { summary: summarizeState(state), positions: state.positions, closed, opened, events };
}

async function autoCycle() {
  if (autoRunning) return;
  autoRunning = true;
  autoLastError = null;
  try {
    await runDemoBot();
    autoLastRun = new Date().toISOString();
  } catch (error) {
    autoLastError = error instanceof Error ? error.message : "Auto cycle failed";
  } finally {
    autoRunning = false;
  }
}

function startAuto() {
  if (autoTimer) return;
  autoCycle();
  autoTimer = setInterval(autoCycle, 30_000);
}

function stopAuto() {
  if (!autoTimer) return;
  clearInterval(autoTimer);
  autoTimer = null;
}

function autoStatus() {
  return {
    enabled: Boolean(autoTimer),
    running: autoRunning,
    riskLevel: activeRiskLevel,
    intervalSeconds: 30,
    lastRun: autoLastRun,
    lastError: autoLastError,
    events: autoEvents
  };
}

async function handleApi(req, res) {
  if (req.method === "GET" && req.url.startsWith("/api/market")) {
    return json(res, 200, await marketPayload());
  }

  if (req.method === "GET" && req.url.startsWith("/api/risk-profiles")) {
    return json(res, 200, { activeRiskLevel, profiles: listRiskProfiles() });
  }

  if (req.method === "GET" && req.url.startsWith("/api/demo/status")) {
    const tunedConfig = activeConfig();
    const state = loadState(tunedConfig);
    const avoidedTokens = Object.entries(state.tokenMemory || {})
      .filter(([, memory]) => memory.avoidUntil || Number(memory.losses || 0) >= tunedConfig.maxTokenLosses)
      .map(([address, memory]) => ({ address, ...memory }))
      .slice(0, 25);
    return json(res, 200, { summary: summarizeState(state), positions: state.positions, closedTrades: state.closedTrades?.slice(0, 20) || [], avoidedTokens, auto: autoStatus() });
  }

  if (req.method === "POST" && req.url.startsWith("/api/demo/run")) {
    return json(res, 200, await runDemoBot());
  }

  if (req.method === "POST" && req.url.startsWith("/api/demo/auto/start")) {
    const body = await readBody(req);
    if (body.riskLevel) activeRiskLevel = String(body.riskLevel);
    startAuto();
    const state = loadState(activeConfig());
    return json(res, 200, { auto: autoStatus(), summary: summarizeState(state), positions: state.positions });
  }

  if (req.method === "POST" && req.url.startsWith("/api/demo/auto/stop")) {
    stopAuto();
    const state = loadState(activeConfig());
    return json(res, 200, { auto: autoStatus(), summary: summarizeState(state), positions: state.positions });
  }

  if (req.method === "POST" && req.url.startsWith("/api/demo/reset")) {
    const tunedConfig = activeConfig();
    const state = { cashUsdc: tunedConfig.startingUsdc, positions: [], closedTrades: [], tokenMemory: {} };
    autoEvents = [];
    saveState(tunedConfig, state);
    return json(res, 200, { summary: summarizeState(state), positions: [], auto: autoStatus() });
  }

  if (req.method === "POST" && req.url.startsWith("/api/checkout")) {
    const body = await readBody(req);
    return json(res, 200, {
      mode: "demo",
      priceMonthlyUsd: 200,
      wallet: body.wallet || null,
      message: "Stripe checkout is scaffolded. Add STRIPE_SECRET_KEY and STRIPE_PRICE_ID to create real Pro subscriptions."
    });
  }

  return json(res, 404, { error: "Not found" });
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://localhost:${port}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.resolve(publicDir, `.${pathname}`);
  if (!filePath.startsWith(publicDir) || !fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath);
  const contentType = ext === ".css" ? "text/css" : ext === ".js" ? "text/javascript" : "text/html";
  res.writeHead(200, { "content-type": contentType });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) await handleApi(req, res);
    else serveStatic(req, res);
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : "Server error" });
  }
});

server.listen(port, () => {
  console.log(`Solana memecoin demo app running at http://localhost:${port}`);
});
