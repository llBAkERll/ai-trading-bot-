// Astra 6 realistic paper execution: quotes are indicative until a delayed re-quote.
// No wallet signatures or live orders are sent.
export const ASTRA6_RISK = Object.freeze({
  startingUsdc: 1000, positionFraction: 0.05, maxExposureFraction: 0.20,
  dailyLossFraction: 0.05, maxQuoteAgeMs: 1500,
  minExecutionDelayMs: 400, maxExecutionDelayMs: 2500,
  maxSlippageBps: 200, maxPriceImpactBps: 200
});
export function equity(state) {
  return Number(state.cashUsdc || 0) + (state.positions || []).reduce((s,p)=>s+Number(p.lastValueUsdc ?? p.entryValueUsdc ?? 0),0);
}
export function availableEntry(state, config=ASTRA6_RISK) {
  const eq=equity(state);
  const exposure=(state.positions||[]).reduce((s,p)=>s+Number(p.lastValueUsdc ?? p.entryValueUsdc ?? 0),0);
  const start=Number(state.dayStartEquity ?? config.startingUsdc);
  const dayPnl=eq-start;
  if (dayPnl <= -start*config.dailyLossFraction) return {allowed:false,reason:"daily_loss_limit",amountUsdc:0};
  const amount=Math.max(0,Math.min(eq*config.positionFraction,eq*config.maxExposureFraction-exposure,Number(state.cashUsdc||0)));
  return {allowed:amount>0,reason:amount>0?"ok":"exposure_or_cash_limit",amountUsdc:amount};
}
export function validateQuote(quote, now=Date.now(), config=ASTRA6_RISK) {
  if (!quote || !Number.isFinite(quote.inputAmount) || !Number.isFinite(quote.outputAmount) || quote.inputAmount<=0 || quote.outputAmount<=0) return {ok:false,reason:"invalid_quote"};
  if (!Number.isFinite(quote.timestampMs) || now-quote.timestampMs>config.maxQuoteAgeMs || now<quote.timestampMs) return {ok:false,reason:"stale_quote"};
  if (!Number.isFinite(quote.priceImpactBps) || quote.priceImpactBps>config.maxPriceImpactBps) return {ok:false,reason:"price_impact"};
  return {ok:true};
}
// quoteProvider must retrieve a NEW executable quote after the simulated delay.
// A quote alone does not prove an on-chain fill; mark all results simulated.
export async function simulateSwap({amountUsdc,quoteProvider,delayMs=800,now=()=>Date.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms)),config=ASTRA6_RISK}) {
  if (!Number.isFinite(amountUsdc)||amountUsdc<=0) throw new Error("Invalid amount");
  if (delayMs<config.minExecutionDelayMs||delayMs>config.maxExecutionDelayMs) return {status:"rejected",reason:"execution_delay_out_of_bounds"};
  const initial=await quoteProvider(amountUsdc);
  const validInitial=validateQuote(initial,now(),config);
  if (!validInitial.ok) return {status:"rejected",reason:validInitial.reason};
  await sleep(delayMs);
  const final=await quoteProvider(amountUsdc);
  const validFinal=validateQuote(final,now(),config);
  if (!validFinal.ok) return {status:"rejected",reason:validFinal.reason};
  const slipBps=Math.max(0,(1-final.outputAmount/initial.outputAmount)*10000);
  if (slipBps>config.maxSlippageBps) return {status:"rejected",reason:"slippage",slippageBps:slipBps};
  const feeUsdc=Number(final.networkFeeUsdc||0)+Number(final.priorityFeeUsdc||0)+Number(final.routingFeeUsdc||0);
  if (!Number.isFinite(feeUsdc)||feeUsdc<0) return {status:"rejected",reason:"invalid_fees"};
  return {status:"simulated_fill",inputUsdc:amountUsdc,outputAmount:final.outputAmount,feeUsdc,slippageBps:slipBps,executionDelayMs:delayMs,quotedAtMs:final.timestampMs,warning:"Indicative simulation, not verified on-chain execution"};
}
