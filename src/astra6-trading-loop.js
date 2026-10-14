import { ASTRA6_RISK, availableEntry, simulateSwap, equity } from "./astra6-paper-execution.js";

// Adapter contract: quoteProvider({side, tokenAddress, amount}) returns
// {inputAmount,outputAmount,timestampMs,priceImpactBps,networkFeeUsdc,priorityFeeUsdc,routingFeeUsdc}.
// Outputs must be in normalized human units. No fake fill if provider unavailable.
export function initializeAstraState(state, now=new Date()) {
  const day=now.toISOString().slice(0,10);
  if(state.astraDay!==day) {
    state.astraDay=day;
    state.dayStartEquity=equity(state);
  }
  return state;
}
export async function astraEntry({state,candidate,quoteProvider,delayMs=800,now=()=>Date.now(),sleep,config=ASTRA6_RISK}) {
  initializeAstraState(state,new Date(now()));
  const sizing=availableEntry(state,config);
  if(!sizing.allowed) return {status:"rejected",reason:sizing.reason};
  if(state.positions.some(p=>p.baseAddress===candidate.baseAddress)) return {status:"rejected",reason:"already_open"};
  const amount=sizing.amountUsdc;
  const fill=await simulateSwap({amountUsdc:amount,quoteProvider:a=>quoteProvider({side:"buy",tokenAddress:candidate.baseAddress,amount:a}),delayMs,now,sleep,config});
  if(fill.status!=="simulated_fill") return fill;
  if(fill.feeUsdc>state.cashUsdc-amount) return {status:"rejected",reason:"insufficient_fee_balance"};
  const position={id:candidate.baseAddress+"-"+now(),baseAddress:candidate.baseAddress,baseSymbol:candidate.baseSymbol,tokenAmount:fill.outputAmount,entryValueUsdc:amount+fill.feeUsdc,entryCashUsdc:amount,entryFeeUsdc:fill.feeUsdc,entryPriceUsd:amount/fill.outputAmount,openedAt:new Date(now()).toISOString(),scoreAtEntry:candidate.score,tradePlan:candidate.tradePlan,lastValueUsdc:amount};
  state.cashUsdc-=amount+fill.feeUsdc;
  state.positions.push(position);
  return {status:"simulated_fill",position,execution:fill};
}
export async function astraExit({state,positionId,quoteProvider,delayMs=800,now=()=>Date.now(),sleep,config=ASTRA6_RISK,reason="strategy_exit"}) {
  const index=state.positions.findIndex(p=>p.id===positionId);
  if(index<0) return {status:"rejected",reason:"position_not_found"};
  const position=state.positions[index];
  const fill=await simulateSwap({amountUsdc:position.tokenAmount,quoteProvider:a=>quoteProvider({side:"sell",tokenAddress:position.baseAddress,amount:a}),delayMs,now,sleep,config});
  if(fill.status!=="simulated_fill") return fill;
  const proceeds=fill.outputAmount-fill.feeUsdc;
  if(proceeds<0) return {status:"rejected",reason:"fees_exceed_proceeds"};
  const trade={...position,exitAt:new Date(now()).toISOString(),exitValueUsdc:proceeds,pnlUsdc:proceeds-position.entryValueUsdc,pnlPct:100*(proceeds-position.entryValueUsdc)/position.entryValueUsdc,exitReason:reason,exitFeeUsdc:fill.feeUsdc};
  state.cashUsdc+=proceeds;
  state.positions.splice(index,1);
  state.closedTrades=[trade,...(state.closedTrades||[])].slice(0,500);
  return {status:"simulated_fill",trade,execution:fill};
}
