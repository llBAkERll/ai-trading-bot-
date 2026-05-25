export function assertLiveTradingDisabled(config) {
  if (!config.enableLiveTrading) {
    return;
  }

  throw new Error(
    "Live trading is not implemented in this MVP. Review paper logs first, then add a Jupiter execution adapter with wallet, RPC, slippage, and kill-switch controls."
  );
}
