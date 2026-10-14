import {discoverSolanaPairs,normalizePair} from "./dexscreener.js";
import {selectCandidates} from "./strategy.js";
import {loadState,saveState,summarizeState} from "./portfolio.js";
import {astraEntry,astraExit,initializeAstraState} from "./astra6-trading-loop.js";
import {indicativeQuoteProvider} from "./astra6-quote-provider.js";
const quotes=indicativeQuoteProvider();
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
    events.push({at:new Date().toISOString(),type:result.status==="simulated_fill"?"sell":"rejected_sell",token:position.baseSymbol,reason:result.reason||reason,pnlUsdc:result.trade?.pnlUsdc||0,valueUsdc:result.trade?.exitValueUsdc||0});
   } catch(error) {events.push({at:new Date().toISOString(),type:"quote_error",token:position.baseSymbol,reason:error.message});}
  }
  for(const candidate of candidates.slice(0,8)) {
   if(state.positions.length>=4) break;
   try {
    const result=await astraEntry({state,candidate,quoteProvider:quotes});
    if(result.status==="simulated_fill") events.push({at:new Date().toISOString(),type:"buy",token:candidate.baseSymbol,reason:"scored_entry",score:candidate.score,valueUsdc:result.position.entryValueUsdc});
    else if(["daily_loss_limit","exposure_or_cash_limit"].includes(result.reason)) break;
   } catch(error) {events.push({at:new Date().toISOString(),type:"quote_error",token:candidate.baseSymbol,reason:error.message});}
  }
  saveState(config,state);
  return {summary:summarizeState(state),positions:state.positions,events,mode:"indicative_paper"};
 } finally {running=false;}
}
