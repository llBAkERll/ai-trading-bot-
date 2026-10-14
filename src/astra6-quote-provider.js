import {getPairsByTokenAddresses,normalizePair} from "./dexscreener.js";
// DEX Screener publishes indicative spot prices, NOT executable swap quotes.
// This conservative approximation charges estimated price impact and fees.
// Realistic execution validation requires Jupiter quote + RPC confirmation replay.
export function indicativeQuoteProvider({networkFeeUsdc=0.015,priorityFeeUsdc=0.015,dexFeeBps=30}={}) {
  return async ({side,tokenAddress,amount})=>{
    const raw=await getPairsByTokenAddresses([tokenAddress]);
    const pair=raw.map(normalizePair).filter(p=>p.baseAddress===tokenAddress&&p.priceUsd>0&&p.liquidityUsd>=10000).sort((a,b)=>b.liquidityUsd-a.liquidityUsd)[0];
    if(!pair) throw new Error("No liquid live market quote for "+tokenAddress);
    // Conservative reserve approximation, not an AMM-specific executable quote.
    const tradeUsd=side==="buy"?amount:amount*pair.priceUsd;
    const impactBps=Math.min(10000,Math.ceil(10000*tradeUsd/Math.max(1,pair.liquidityUsd/2)));
    const feeFraction=dexFeeBps/10000;
    const impactFraction=impactBps/10000;
    const outputAmount=side==="buy"?(amount/pair.priceUsd)*(1-impactFraction-feeFraction):tradeUsd*(1-impactFraction-feeFraction);
    return {inputAmount:amount,outputAmount,timestampMs:Date.now(),priceImpactBps:impactBps,networkFeeUsdc,priorityFeeUsdc,routingFeeUsdc:0,marketPriceUsd:pair.priceUsd,pairAddress:pair.pairAddress,source:"dexscreener_indicative"};
  };
}
