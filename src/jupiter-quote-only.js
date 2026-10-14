// Jupiter quote-only adapter. Never signs or submits a transaction.
// Supply token decimals from trusted RPC metadata; amounts are human-readable.
export function createJupiterQuoteProvider({apiKey,usdcMint,decimalsForMint,fetchImpl=fetch}) {
  if(!apiKey||!usdcMint||typeof decimalsForMint!=="function") throw new Error("Jupiter quote configuration missing");
  return async ({side,tokenAddress,amount}) => {
    if(side!=="buy"&&side!=="sell") throw new Error("Invalid side");
    if(!Number.isFinite(amount)||amount<=0) throw new Error("Invalid amount");
    const decimals=await decimalsForMint(tokenAddress);
    if(!Number.isInteger(decimals)||decimals<0||decimals>18) throw new Error("Invalid token decimals");
    const inputDecimals=side==="buy"?6:decimals;
    const outputDecimals=side==="buy"?decimals:6;
    const inputMint=side==="buy"?usdcMint:tokenAddress;
    const outputMint=side==="buy"?tokenAddress:usdcMint;
    const units=BigInt(Math.floor(amount*10**inputDecimals));
    if(units<=0n) throw new Error("Amount too small");
    const params=new URLSearchParams({inputMint,outputMint,amount:String(units),swapMode:"ExactIn",slippageBps:"200"});
    const response=await fetchImpl("https://api.jup.ag/swap/v1/quote?"+params,{headers:{"x-api-key":apiKey,accept:"application/json"}});
    if(!response.ok) throw new Error("Jupiter quote HTTP "+response.status);
    const data=await response.json();
    const outputAmount=Number(data.outAmount)/10**outputDecimals;
    const priceImpactBps=Number(data.priceImpactPct||0)*100;
    if(!Number.isFinite(outputAmount)||outputAmount<=0||!Number.isFinite(priceImpactBps)) throw new Error("Invalid Jupiter quote response");
    return {inputAmount:amount,outputAmount,timestampMs:Date.now(),priceImpactBps,networkFeeUsdc:0.03,priorityFeeUsdc:0,routingFeeUsdc:0,source:"jupiter_quote_only",contextSlot:data.contextSlot};
  };
}
