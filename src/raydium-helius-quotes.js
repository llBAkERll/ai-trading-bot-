// Read-only Raydium swap quotes plus Helius priority-fee estimates.
// Pool fees are already reflected in outputAmount; do not charge them twice.
export function createRaydiumHeliusQuotes({rpcUrl,decimalsForMint,solPriceUsd,fetchImpl=fetch,usdcMint="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",computeUnits=250000}={}) {
 if(!rpcUrl||typeof decimalsForMint!=="function"||typeof solPriceUsd!=="function") throw new Error("RPC and token metadata/price providers required");
 return async ({side,tokenAddress,amount})=>{
  if(!["buy","sell"].includes(side)||!Number.isFinite(amount)||amount<=0) throw new Error("Invalid swap request");
  const decimals=await decimalsForMint(tokenAddress);
  if(!Number.isInteger(decimals)||decimals<0||decimals>18) throw new Error("Invalid token decimals");
  const buy=side==="buy";
  const inputDecimals=buy?6:decimals;
  const outputDecimals=buy?decimals:6;
  const rawAmount=BigInt(Math.floor(amount*10**inputDecimals));
  if(rawAmount<=0n) throw new Error("Amount below token precision");
  const query=new URLSearchParams({inputMint:buy?usdcMint:tokenAddress,outputMint:buy?tokenAddress:usdcMint,amount:rawAmount.toString(),slippageBps:"200",txVersion:"V0"});
  const [quoteResponse,feeResponse,solUsd]=await Promise.all([
   fetchImpl("https://transaction-v1.raydium.io/compute/swap-base-in?"+query),
   fetchImpl(rpcUrl,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"getPriorityFeeEstimate",params:[{accountKeys:[buy?usdcMint:tokenAddress,buy?tokenAddress:usdcMint],options:{recommended:true}}]})}),
   solPriceUsd()
  ]);
  if(!quoteResponse.ok) throw new Error("Raydium HTTP "+quoteResponse.status);
  if(!feeResponse.ok) throw new Error("Helius HTTP "+feeResponse.status);
  const [quote,fees]=await Promise.all([quoteResponse.json(),feeResponse.json()]);
  if(quote.success!==true||!quote.data?.outputAmount) throw new Error("Raydium route unavailable");
  const microLamports=Number(fees.result?.priorityFeeEstimate);
  if(!Number.isFinite(microLamports)||microLamports<0) throw new Error("Helius fee estimate unavailable");
  if(!Number.isFinite(solUsd)||solUsd<=0) throw new Error("SOL/USD unavailable");
  const outputAmount=Number(quote.data.outputAmount)/10**outputDecimals;
  const priorityFeeSol=(microLamports*computeUnits)/1e15;
  const baseFeeSol=5000/1e9;
  const priceImpactBps=Number(quote.data.priceImpactPct||0)*100;
  if(!Number.isFinite(outputAmount)||outputAmount<=0||!Number.isFinite(priceImpactBps)) throw new Error("Invalid quote data");
  return {inputAmount:amount,outputAmount,timestampMs:Date.now(),priceImpactBps,networkFeeUsdc:baseFeeSol*solUsd,priorityFeeUsdc:priorityFeeSol*solUsd,routingFeeUsdc:0,source:"raydium_helius_paper",poolFeesIncludedInOutput:true,priorityFeeMicroLamports:microLamports,feeEstimateScope:"token_mints_only",computeUnitsAssumed:computeUnits,routePlan:quote.data.routePlan||[]};
 };
}
