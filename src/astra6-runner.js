import {discoverSolanaPairs,normalizePair} from "./dexscreener.js";
import {selectCandidates} from "./strategy.js";
import {loadState,saveState,summarizeState} from "./portfolio.js";
import {astraEntry,astraExit,initializeAstraState} from "./astra6-trading-loop.js";
import {indicativeQuoteProvider} from "./astra6-quote-provider.js";
import {executionRecord,summarizeExecution} from "./astra6-execution-telemetry.js";
import {createJupiterQuoteProvider} from "./jupiter-quote-only.js";
import {createRaydiumHeliusQuotes} from "./raydium-helius-quotes.js";
import {searchSolanaPairs} from "./dexscreener.js";
const USDC_MINT="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
async function tokenDecimals(mint) {
 const rpc=process.env.SOLANA_RPC_URL||process.env.SOLANA_PUBLIC_RPC_URL;
 if(!rpc && !process.env.HELIUS_RPC_URL) throw new Error("RPC URL required for token decimals");
 const response=await fetch(rpc||process.env.HELIUS_RPC_URL,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"getTokenSupply",params:[mint]})});
 if(!response.ok) throw new Error("RPC HTTP "+response.status);
 const data=await response.json();
 const value=data?.result?.value?.decimals;
 if(!Number.isInteger(value)) throw new Error("Token decimals unavailable");
 return value;
}
async function solPriceUsd() {
 const pairs=(await searchSolanaPairs("SOL USDC")).map(normalizePair).filter(p=>p.baseSymbol==="SOL"&&p.priceUsd>0).sort((a,b)=>b.liquidityUsd-a.liquidityUsd);
 if(!pairs.length) throw new Error("SOL/USD unavailable");
 return pairs[0].priceUsd;
}
const quotes=process.env.ASTRA6_QUOTE_MODE==="raydium-free"
 ? createRaydiumHeliusQuotes({rpcUrl:process.env.SOLANA_PUBLIC_RPC_URL||"https://api.mainnet-beta.solana.com",decimalsForMint:tokenDecimals,solPriceUsd,freeRpc:true})
 : process.env.ASTRA6_QUOTE_MODE==="raydium-helius"
 ? createRaydiumHeliusQuotes({rpcUrl:process.env.HELIUS_RPC_URL,decimalsForMint:tokenDecimals,solPriceUsd})
 : process.env.ASTRA6_QUOTE_MODE==="jupiter"
 ? createJupiterQuoteProvider({apiKey:process.env.JUPITER_API_KEY,usdcMint:USDC_MINT,decimalsForMint:tokenDecimals})
 : indicativeQuoteProvider();
let running=false;
export async function runAstraCycle(config) {
 if(running) return {skipped:true};
 running=true;
 try {
  const state=initializeAstraState(loadState(config));
  const pairs=(await discoverSolanaPairs(config)).map(normalizePair);
  const candidates=selectCandidates(pairs,config);
  const market=new Map(pairs.map(p=>[p.baseAddress,p]));
  const events=[];
  state.executionRecords=state.executionRecords||[];
  for(const position of [...state.positions]) {
   const pair=market.get(position.baseAddress);
   if(!pair?.priceUsd) continue;
   position.lastPriceUsd=pair.priceUsd;
   position.lastValueUsdc=position.tokenAmount*pair.priceUsd;
   position.highWaterPriceUsd=Math.max(position.highWaterPriceUsd||position.entryPriceUsd,pair.priceUsd);
   const pnl=(pair.priceUsd/position.entryPriceUsd-1)*100;
   const drawdown=(1-pair.priceUsd/position.highWaterPriceUsd)*100;
   const plan=position.tradePlan||{};
   const reason=pnl<=-Number(plan.stopLossPct||config.stopLossPct)?"stop_loss":pnl>=Number(plan.targetProfitPct||config.takeProfitPct)?"take_profit":pnl>0&&drawdown>=config.trailingStopPct?"trailing_stop":null;
   if(!reason) continue;
   try {
    const result=await astraExit({state,positionId:position.id,quoteProvider:quotes,reason});
    if(result.status==="simulated_fill") state.executionRecords.push(executionRecord({side:"sell",tokenAddress:position.baseAddress,execution:result.execution,quoteSource:result.execution.source}));
    events.push({at:new Date().toISOString(),type:result.status==="simulated_fill"?"sell":"rejected_sell",token:position.baseSymbol,reason:result.reason||reason,pnlUsdc:result.trade?.pnlUsdc||0,valueUsdc:result.trade?.exitValueUsdc||0});
   } catch(error) {events.push({at:new Date().toISOString(),type:"quote_error",token:position.baseSymbol,reason:error.message});}
  }
  for(const candidate of candidates.slice(0,8)) {
   if(state.positions.length>=4) break;
   try {
    const result=await astraEntry({state,candidate,quoteProvider:quotes});
    if(result.status==="simulated_fill") state.executionRecords.push(executionRecord({side:"buy",tokenAddress:candidate.baseAddress,execution:result.execution,quoteSource:result.execution.source}));
    if(result.status==="simulated_fill") events.push({at:new Date().toISOString(),type:"buy",token:candidate.baseSymbol,reason:"scored_entry",score:candidate.score,valueUsdc:result.position.entryValueUsdc});
    else if(["daily_loss_limit","exposure_or_cash_limit"].includes(result.reason)) break;
   } catch(error) {events.push({at:new Date().toISOString(),type:"quote_error",token:candidate.baseSymbol,reason:error.message});}
  }
  state.executionRecords=state.executionRecords.slice(-1000);
  saveState(config,state);
  return {summary:summarizeState(state),positions:state.positions,events,executionMetrics:summarizeExecution(state.executionRecords),mode:process.env.ASTRA6_QUOTE_MODE==="raydium-free"?"raydium_free_paper":process.env.ASTRA6_QUOTE_MODE==="raydium-helius"?"raydium_helius_paper":process.env.ASTRA6_QUOTE_MODE==="jupiter"?"jupiter_quote_paper":"indicative_paper"};
 } finally {running=false;}
}
