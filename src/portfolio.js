import fs from "node:fs";
import path from "node:path";

export function loadState(config) {
  const filePath = path.resolve(config.stateFile);
  if (!fs.existsSync(filePath)) {
    return { cashUsdc: config.startingUsdc, positions: [], closedTrades: [], tokenMemory: {} };
  }
  const state = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return { tokenMemory: {}, ...state };
}

export function saveState(config, state) {
  const filePath = path.resolve(config.stateFile);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`);
}

export function markPositions(state, latestPairs, config) {
  const byAddress = new Map(latestPairs.map((pair) => [pair.baseAddress, pair]));
  const now = new Date().toISOString();
  const nowMs = Date.now();
  const remaining = [];
  const closed = [];

  for (const position of state.positions) {
    const latest = byAddress.get(position.baseAddress);
    if (!latest?.priceUsd) {
      remaining.push(position);
      continue;
    }

    const currentValue = position.tokenAmount * latest.priceUsd;
    const pnlPct = ((latest.priceUsd - position.entryPriceUsd) / position.entryPriceUsd) * 100;
    const netPnlPct = pnlPct - Number(config.estimatedRoundTripFeePct || 0);
    const highWaterPrice = Math.max(position.highWaterPriceUsd || position.entryPriceUsd, latest.priceUsd);
    const drawdownFromHigh = ((highWaterPrice - latest.priceUsd) / highWaterPrice) * 100;
    const plan = position.tradePlan || {};
    const targetProfitPct = Number(plan.targetProfitPct || config.takeProfitPct);
    const stopLossPct = Number(plan.stopLossPct || config.stopLossPct);
    const buyersStillWinning = latest.buys5m > latest.sells5m && latest.priceChange5m > 1 && latest.priceChange1h > -5;
    const worthSellingForProfit = netPnlPct >= Number(config.minNetProfitPct || 0);
    const shouldQuickScalp = worthSellingForProfit && pnlPct >= config.quickProfitPct && !buyersStillWinning;
    const shouldTakeProfit = worthSellingForProfit && pnlPct >= targetProfitPct;
    const shouldStopLoss = pnlPct <= -stopLossPct;
    const shouldTrail = pnlPct > 0 && drawdownFromHigh >= config.trailingStopPct;
    const shouldEarlyRugExit =
      pnlPct <= -config.earlyRugExitPct &&
      latest.sells5m > latest.buys5m &&
      (latest.priceChange5m < 0 || latest.priceChange1h < 0);
    const shouldCutBrokenMomentum =
      pnlPct < 0 &&
      latest.priceChange1h <= config.momentumBreakdown1hPct &&
      latest.priceChange5m <= config.momentumBreakdown5mPct &&
      latest.sells5m > latest.buys5m;
    const recoverySignal =
      pnlPct < 0 &&
      latest.buys5m > latest.sells5m * 1.5 &&
      latest.priceChange5m > 3 &&
      latest.volume1h * 24 > latest.volume24h * 1.25;

    if (shouldQuickScalp || shouldTakeProfit || shouldStopLoss || shouldTrail || shouldEarlyRugExit || (shouldCutBrokenMomentum && !recoverySignal)) {
      const exitReason = shouldQuickScalp
        ? "quick_scalp_profit"
        : shouldTakeProfit
          ? "take_profit"
          : shouldStopLoss
            ? "hard_stop_loss"
            : shouldTrail
              ? "trailing_stop"
              : shouldEarlyRugExit
                ? "early_rug_exit"
                : "momentum_breakdown";
      closed.push({
        ...position,
        exitAt: now,
        exitPriceUsd: latest.priceUsd,
        exitValueUsdc: currentValue,
        pnlUsdc: currentValue - position.entryValueUsdc,
        pnlPct,
        netPnlPct,
        exitReason
      });
      state.cashUsdc += currentValue;
      const memory = state.tokenMemory[position.baseAddress] || { losses: 0, wins: 0 };
      if (currentValue < position.entryValueUsdc) {
        memory.losses = Number(memory.losses || 0) + 1;
        memory.lastLossAt = now;
        memory.avoidUntil = new Date(nowMs + config.lossCooldownMinutes * 60_000).toISOString();
        memory.lastExitReason = exitReason;
      } else {
        memory.wins = Number(memory.wins || 0) + 1;
        memory.lastWinAt = now;
        memory.lastExitReason = exitReason;
      }
      state.tokenMemory[position.baseAddress] = memory;
    } else {
      remaining.push({
        ...position,
        lastPriceUsd: latest.priceUsd,
        lastValueUsdc: currentValue,
        highWaterPriceUsd: highWaterPrice,
        unrealizedPnlPct: pnlPct,
        unrealizedNetPnlPct: netPnlPct,
        updatedAt: now
      });
    }
  }

  state.positions = remaining;
  state.closedTrades = [...closed, ...(state.closedTrades || [])].slice(0, 500);
  return closed;
}

export function openPaperPositions(state, candidates, config) {
  const now = new Date().toISOString();
  const nowMs = Date.now();
  const openAddresses = new Set(state.positions.map((position) => position.baseAddress));
  const opened = [];
  const startingCash = Number(state.cashUsdc || 0);
  const reserveCash = startingCash * (Number(config.reserveCashPct || 0) / 100);
  const fixedMaxPositions = Number(config.maxOpenPositions || 0);
  const fixedMaxPositionUsdc = Number(config.maxPositionUsdc || 0);
  const equity =
    state.cashUsdc +
    state.positions.reduce((sum, position) => sum + Number(position.lastValueUsdc || position.entryValueUsdc || 0), 0);
  const maxAdaptivePosition = equity * (Number(config.maxBalanceAllocationPct || 100) / 100);
  const currentExposure = state.positions.reduce((sum, position) => sum + Number(position.lastValueUsdc || position.entryValueUsdc || 0), 0);
  const maxExposure = equity * (Number(config.maxDeployedPct || 100) / 100);
  let remainingExposure = Math.max(0, maxExposure - currentExposure);

  for (const [index, candidate] of candidates.entries()) {
    if (fixedMaxPositions > 0 && state.positions.length >= fixedMaxPositions) break;
    if (openAddresses.has(candidate.baseAddress)) continue;
    const memory = state.tokenMemory?.[candidate.baseAddress];
    if (memory?.avoidUntil && Date.parse(memory.avoidUntil) > nowMs) continue;
    if (Number(memory?.losses || 0) >= config.maxTokenLosses) continue;
    const tradableCash = state.cashUsdc - reserveCash;
    if (tradableCash < config.minPositionUsdc) break;
    if (remainingExposure < config.minPositionUsdc) break;

    const confidence = Math.max(0.03, Math.min(0.22, Number(candidate.score || 0) / 260));
    const rankTaper = Math.max(0.35, 1 - index * 0.08);
    const adaptiveSize = tradableCash * confidence * rankTaper;
    const entryValueUsdc = Math.min(
      fixedMaxPositionUsdc > 0 ? fixedMaxPositionUsdc : adaptiveSize,
      maxAdaptivePosition,
      remainingExposure,
      adaptiveSize,
      tradableCash
    );
    if (entryValueUsdc < config.minPositionUsdc) continue;
    const tokenAmount = entryValueUsdc / candidate.priceUsd;
    const position = {
      id: `${candidate.baseAddress}-${Date.now()}`,
      openedAt: now,
      baseSymbol: candidate.baseSymbol,
      baseName: candidate.baseName,
      baseAddress: candidate.baseAddress,
      pairAddress: candidate.pairAddress,
      dexId: candidate.dexId,
      url: candidate.url,
      entryPriceUsd: candidate.priceUsd,
      lastPriceUsd: candidate.priceUsd,
      highWaterPriceUsd: candidate.priceUsd,
      tokenAmount,
      entryValueUsdc,
      lastValueUsdc: entryValueUsdc,
      estimatedRoundTripFeePct: config.estimatedRoundTripFeePct,
      scoreAtEntry: candidate.score,
      tradePlan: candidate.tradePlan,
      evaluation: candidate.tradePlan?.thesis || "Entered from top-ranked live Solana market scan.",
      targetExitPriceUsd: candidate.tradePlan?.targetExitPriceUsd,
      stopPriceUsd: candidate.tradePlan?.stopPriceUsd,
      reentryPriceUsd: candidate.tradePlan?.reentryPriceUsd
    };

    state.positions.push(position);
    state.cashUsdc -= entryValueUsdc;
    remainingExposure -= entryValueUsdc;
    opened.push(position);
  }

  return opened;
}

export function summarizeState(state) {
  const openValue = state.positions.reduce((sum, position) => sum + Number(position.lastValueUsdc || position.entryValueUsdc || 0), 0);
  const closedPnl = (state.closedTrades || []).reduce((sum, trade) => sum + Number(trade.pnlUsdc || 0), 0);
  return {
    cashUsdc: state.cashUsdc,
    openPositions: state.positions.length,
    openValueUsdc: openValue,
    equityUsdc: state.cashUsdc + openValue,
    closedPnlUsdc: closedPnl
  };
}
