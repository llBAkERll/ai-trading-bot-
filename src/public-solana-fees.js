// Public Solana RPC fee estimator. No API key or paid subscription required.
// getRecentPrioritizationFees returns recent lamports per compute unit.
// Uses an upper-quartile recent sample; this is not a guaranteed execution fee.
export function createPublicSolanaFeeEstimator({rpcUrl="https://api.mainnet-beta.solana.com",fetchImpl=fetch,computeUnits=250000,solPriceUsd}={}) {
 if(typeof solPriceUsd!=="function") throw new Error("SOL/USD provider required");
 return async () => {
  const response=await fetchImpl(rpcUrl,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"getRecentPrioritizationFees",params:[]})});
  if(!response.ok) throw new Error("Solana RPC HTTP "+response.status);
  const body=await response.json();
  if(body.error) throw new Error("Solana RPC: "+body.error.message);
  const values=(body.result||[]).map(r=>Number(r.prioritizationFee)).filter(n=>Number.isFinite(n)&&n>=0).sort((a,b)=>a-b);
  if(!values.length) throw new Error("No recent prioritization fee samples");
  const lamportsPerCu=values[Math.floor((values.length-1)*0.75)];
  const solUsd=await solPriceUsd();
  if(!Number.isFinite(solUsd)||solUsd<=0) throw new Error("SOL/USD unavailable");
  return {priorityFeeUsdc:lamportsPerCu*computeUnits/1e9*solUsd,networkFeeUsdc:5000/1e9*solUsd,lamportsPerCu,source:"public_solana_rpc",computeUnitsAssumed:computeUnits};
 };
}
