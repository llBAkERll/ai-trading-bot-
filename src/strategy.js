function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function scoreMomentum(pair) {
  const mildPositive = clamp(pair.priceChange1h, -20, 40);
  const overheatedPenalty = pair.priceChange5m > 35 ? pair.priceChange5m - 35 : 0;
  return mildPositive - overheatedPenalty * 2;
}

function scoreFlow(pair) {
  const buys = pair.buys5m + pair.buys1h;
  const sells = pair.sells5m + pair.sells1h;
  if (buys + sells === 0) return 0;
  return ((buys - sells) / (buys + sells)) * 40;
}

function scoreBreakout(pair) {
  const volumeAcceleration = pair.volume24h > 0 ? clamp((pair.volume1h * 24) / pair.volume24h, 0, 4) : 0;
  const earlyMomentum = pair.priceChange5m > 0 && pair.priceChange1h > pair.priceChange5m ? 12 : 0;
  const buyerPressure = pair.buys5m > pair.sells5m ? 10 : 0;
  return volumeAcceleration * 12 + earlyMomentum + buyerPressure;
}

export function scorePair(pair, config) {
  const liquidityScore = clamp(pair.liquidityUsd / config.minLiquidityUsd, 0, 4) * 15;
  const volumeScore = clamp(pair.volume24h / config.minVolume24hUsd, 0, 4) * 12;
  const momentumScore = scoreMomentum(pair);
  const flowScore = scoreFlow(pair);
  const breakoutScore = scoreBreakout(pair);
  const tooNewPenalty = pair.pairCreatedAt && Date.now() - pair.pairCreatedAt < 10 * 60 * 1000 ? 40 : 0;
  const score = liquidityScore + volumeScore + momentumScore + flowScore + breakoutScore - tooNewPenalty;

  return Math.round(score * 100) / 100;
}

export function buildTradePlan(pair, config) {
  const score = pair.score ?? scorePair(pair, config);
  const strongMomentum = pair.priceChange1h > 15 && pair.buys5m >= pair.sells5m;
  const breakout = pair.volume24h > 0 && pair.volume1h * 24 > pair.volume24h * 1.4 && pair.priceChange5m > 0;
  const feeBuffer = Number(config.estimatedRoundTripFeePct || 0) + Number(config.minNetProfitPct || 0);
  const targetProfitPct = Math.max(strongMomentum || breakout ? config.takeProfitPct * 1.5 : config.takeProfitPct, feeBuffer);
  const stopLossPct = pair.priceChange5m > 20 ? Math.min(config.stopLossPct, 10) : config.stopLossPct;
  const targetExitPriceUsd = pair.priceUsd * (1 + targetProfitPct / 100);
  const stopPriceUsd = pair.priceUsd * (1 - stopLossPct / 100);
  const reentryPriceUsd = pair.priceUsd * 0.94;
  const holdRule = strongMomentum
    ? "Hold past first target while buyer pressure stays positive; exit on trailing stop or sell pressure."
    : "Take profit near target unless volume and buy flow are still accelerating.";

  const reasons = [];
  if (pair.liquidityUsd >= config.minLiquidityUsd) reasons.push(`liquidity ${Math.round(pair.liquidityUsd).toLocaleString()} USD`);
  if (pair.volume24h >= config.minVolume24hUsd) reasons.push(`24h volume ${Math.round(pair.volume24h).toLocaleString()} USD`);
  if (pair.priceChange1h > 0) reasons.push(`1h momentum ${pair.priceChange1h.toFixed(2)}%`);
  if (pair.buys5m > pair.sells5m) reasons.push("buyers outpacing sellers");
  if (breakout) reasons.push("volume acceleration suggests breakout setup");

  return {
    score,
    thesis: reasons.length ? reasons.join("; ") : "Speculative entry based on relative score.",
    setup: breakout ? "breakout" : strongMomentum ? "momentum_ride" : "trend_follow",
    targetProfitPct,
    stopLossPct,
    targetExitPriceUsd,
    stopPriceUsd,
    reentryPriceUsd,
    holdRule,
    plan: `Target ${targetExitPriceUsd.toPrecision(6)}, stop ${stopPriceUsd.toPrecision(6)}, re-entry watch ${reentryPriceUsd.toPrecision(6)}. ${holdRule}`
  };
}

export function explainReject(pair, config) {
  const reasons = [];
  if (!pair.baseAddress) reasons.push("missing token address");
  if (!pair.priceUsd) reasons.push("missing USD price");
  if (pair.liquidityUsd < config.minLiquidityUsd) reasons.push(`liquidity below $${config.minLiquidityUsd}`);
  if (pair.volume24h < config.minVolume24hUsd) reasons.push(`24h volume below $${config.minVolume24hUsd}`);
  if (pair.priceChange5m > config.maxBuyPriceChange5mPct) reasons.push("5m move is too hot");
  return reasons;
}

export function selectCandidates(pairs, config) {
  return pairs
    .map((pair) => ({ ...pair, rejectReasons: explainReject(pair, config) }))
    .filter((pair) => pair.rejectReasons.length === 0)
    .map((pair) => ({ ...pair, score: scorePair(pair, config) }))
    .map((pair) => ({ ...pair, tradePlan: buildTradePlan(pair, config) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 25);
}
