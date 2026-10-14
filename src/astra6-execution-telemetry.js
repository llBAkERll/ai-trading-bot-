// Paper-only accounting and telemetry. No wallet or transaction authority.
export function executionRecord({side,tokenAddress,execution,quoteSource,at=new Date().toISOString()}) {
 if(!execution||execution.status!=="simulated_fill") throw new Error("Only simulated fills can be recorded");
 return {
  at,mode:"paper",side,tokenAddress,source:quoteSource||"unknown",
  inputAmount:execution.inputUsdc,outputAmount:execution.outputAmount,
  estimatedNetworkAndPriorityFeesUsdc:execution.feeUsdc,
  adverseRequoteSlippageBps:execution.slippageBps,
  executionDelayMs:execution.executionDelayMs,
  quotedAtMs:execution.quotedAtMs,
  fillVerifiedOnChain:false
 };
}
export function summarizeExecution(records=[]) {
 const rows=records.filter(r=>r?.mode==="paper");
 return {paperFills:rows.length,estimatedFeesUsdc:rows.reduce((s,r)=>s+Number(r.estimatedNetworkAndPriorityFeesUsdc||0),0),
  averageRequoteSlippageBps:rows.length?rows.reduce((s,r)=>s+Number(r.adverseRequoteSlippageBps||0),0)/rows.length:0,
  averageDelayMs:rows.length?rows.reduce((s,r)=>s+Number(r.executionDelayMs||0),0)/rows.length:0,
  confirmedOnChain:0};
}
