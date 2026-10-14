import test from "node:test";
import assert from "node:assert/strict";
import {createRaydiumHeliusQuotes} from "../src/raydium-helius-quotes.js";
test("Raydium output and Helius priority fee are accounted once",async()=>{
 const fetchImpl=async (url)=>{
  if(String(url).includes("raydium")) return {ok:true,json:async()=>({success:true,data:{outputAmount:"2500000000",priceImpactPct:0.2,routePlan:[{feeAmount:"1000"}]}})};
  return {ok:true,json:async()=>({result:{priorityFeeEstimate:100000}})};
 };
 const quote=createRaydiumHeliusQuotes({rpcUrl:"https://example.invalid",decimalsForMint:async()=>9,solPriceUsd:async()=>200,fetchImpl});
 const result=await quote({side:"buy",tokenAddress:"TOKEN",amount:50});
 assert.equal(result.outputAmount,2.5);
 assert.equal(result.priceImpactBps,20);
 assert.equal(result.priorityFeeUsdc,0.005);
 assert.equal(result.networkFeeUsdc,0.001);
 assert.equal(result.poolFeesIncludedInOutput,true);
});
test("No Helius fee estimate rejects paper quote",async()=>{
 const fetchImpl=async url=>String(url).includes("raydium")?{ok:true,json:async()=>({success:true,data:{outputAmount:"2500000000"}})}:{ok:true,json:async()=>({result:{}})};
 const quote=createRaydiumHeliusQuotes({rpcUrl:"https://example.invalid",decimalsForMint:async()=>9,solPriceUsd:async()=>200,fetchImpl});
 await assert.rejects(()=>quote({side:"buy",tokenAddress:"TOKEN",amount:50}),/fee estimate/);
});
