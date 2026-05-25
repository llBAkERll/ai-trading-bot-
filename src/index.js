import { config } from "./config.js";
import { discoverSolanaPairs, normalizePair } from "./dexscreener.js";
import { assertLiveTradingDisabled } from "./live-trader.js";
import { loadState, markPositions, openPaperPositions, saveState, summarizeState } from "./portfolio.js";
import { selectCandidates } from "./strategy.js";

function money(value) {
  return `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function printCandidates(candidates) {
  if (!candidates.length) {
    console.log("No candidates passed the filters.");
    return;
  }

  console.table(
    candidates.map((pair) => ({
      score: pair.score,
      token: pair.baseSymbol,
      price: pair.priceUsd,
      liquidity: Math.round(pair.liquidityUsd),
      volume24h: Math.round(pair.volume24h),
      change5m: pair.priceChange5m,
      buys5m: pair.buys5m,
      sells5m: pair.sells5m,
      dex: pair.dexId
    }))
  );
}

async function getCandidates() {
  const rawPairs = await discoverSolanaPairs(config);
  const pairs = rawPairs.map(normalizePair);
  return { pairs, candidates: selectCandidates(pairs, config) };
}

async function scan() {
  const { candidates } = await getCandidates();
  printCandidates(candidates);
}

async function paper() {
  assertLiveTradingDisabled(config);
  const state = loadState(config);
  const { pairs, candidates } = await getCandidates();
  const closed = markPositions(state, pairs, config);
  const opened = openPaperPositions(state, candidates, config);
  saveState(config, state);

  console.log(`Closed positions: ${closed.length}`);
  for (const trade of closed) {
    console.log(`${trade.exitReason}: ${trade.baseSymbol} ${money(trade.pnlUsdc)} (${trade.pnlPct.toFixed(2)}%)`);
  }

  console.log(`Opened positions: ${opened.length}`);
  for (const position of opened) {
    console.log(`BUY PAPER ${position.baseSymbol} ${money(position.entryValueUsdc)} score=${position.scoreAtEntry}`);
  }

  console.log("Summary:", summarizeState(state));
}

function status() {
  const state = loadState(config);
  const summary = summarizeState(state);
  console.log("Portfolio summary");
  console.table([summary]);

  if (state.positions.length) {
    console.log("Open positions");
    console.table(
      state.positions.map((position) => ({
        token: position.baseSymbol,
        entry: position.entryPriceUsd,
        last: position.lastPriceUsd,
        value: money(position.lastValueUsdc),
        pnlPct: Number(position.unrealizedPnlPct || 0).toFixed(2),
        openedAt: position.openedAt
      }))
    );
  }
}

const command = process.argv[2] || "paper";

try {
  if (command === "scan") await scan();
  else if (command === "status") status();
  else if (command === "paper") await paper();
  else {
    console.error(`Unknown command: ${command}`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
