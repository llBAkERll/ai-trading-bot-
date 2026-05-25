import fs from "node:fs";
import path from "node:path";

function readDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs.readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      })
  );
}

const localEnv = readDotEnv(path.resolve(".env.local"));
const env = { ...process.env, ...localEnv };

function numberEnv(key, fallback) {
  const value = Number(env[key]);
  return Number.isFinite(value) ? value : fallback;
}

function boolEnv(key, fallback) {
  if (env[key] === undefined) return fallback;
  return String(env[key]).toLowerCase() === "true";
}

export const config = {
  mode: env.MODE || "paper",
  discoveryQueries: String(env.DISCOVERY_QUERIES || env.WATCHLIST_QUERY || "solana,SOL,USDC,pump,raydium,meteora,moonshot")
    .split(",")
    .map((query) => query.trim())
    .filter(Boolean),
  watchlistQuery: env.WATCHLIST_QUERY || "solana",
  startingUsdc: numberEnv("STARTING_USDC", 1000),
  maxOpenPositions: numberEnv("MAX_OPEN_POSITIONS", 0),
  maxPositionUsdc: numberEnv("MAX_POSITION_USDC", 0),
  minPositionUsdc: numberEnv("MIN_POSITION_USDC", 10),
  reserveCashPct: numberEnv("RESERVE_CASH_PCT", 40),
  maxBalanceAllocationPct: numberEnv("MAX_BALANCE_ALLOCATION_PCT", 2),
  maxDeployedPct: numberEnv("MAX_DEPLOYED_PCT", 35),
  estimatedRoundTripFeePct: numberEnv("ESTIMATED_ROUND_TRIP_FEE_PCT", 0.7),
  minNetProfitPct: numberEnv("MIN_NET_PROFIT_PCT", 0.8),
  minLiquidityUsd: numberEnv("MIN_LIQUIDITY_USD", 5000),
  minVolume24hUsd: numberEnv("MIN_VOLUME_24H_USD", 25000),
  maxBuyPriceChange5mPct: numberEnv("MAX_BUY_PRICE_CHANGE_5M_PCT", 35),
  takeProfitPct: numberEnv("TAKE_PROFIT_PCT", 35),
  quickProfitPct: numberEnv("QUICK_PROFIT_PCT", 1.5),
  stopLossPct: numberEnv("STOP_LOSS_PCT", 15),
  earlyRugExitPct: numberEnv("EARLY_RUG_EXIT_PCT", 8),
  trailingStopPct: numberEnv("TRAILING_STOP_PCT", 18),
  momentumBreakdown1hPct: numberEnv("MOMENTUM_BREAKDOWN_1H_PCT", -18),
  momentumBreakdown5mPct: numberEnv("MOMENTUM_BREAKDOWN_5M_PCT", -6),
  lossCooldownMinutes: numberEnv("LOSS_COOLDOWN_MINUTES", 360),
  maxTokenLosses: numberEnv("MAX_TOKEN_LOSSES", 1),
  stateFile: env.PAPER_STATE_FILE || "data/paper-state.json",
  enableLiveTrading: boolEnv("ENABLE_LIVE_TRADING", false),
  solanaRpcUrl: env.SOLANA_RPC_URL || "",
  walletPrivateKey: env.WALLET_PRIVATE_KEY || ""
};
