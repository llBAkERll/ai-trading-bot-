import test from "node:test";
import assert from "node:assert/strict";
import {createJupiterQuoteProvider} from "../src/jupiter-quote-only.js";
test("Jupiter quote converts USDC input and token output decimals",async()=>{
 let seen;
 const fetchImpl=async url=>{seen=new URL(url);return {ok:true,json:async()=>({outAmount:"2500000000",priceImpactPct:"0.25",contextSlot:123})}};
 const provider=createJupiterQuoteProvider({apiKey:"test-key",usdcMint:"USDC",decimalsForMint:async()=>9,fetchImpl});
 const q=await provider({side:"buy",tokenAddress:"TOKEN",amount:50});
 assert.equal(seen.searchParams.get("amount"),"50000000");
 assert.equal(q.outputAmount,2.5);
 assert.equal(q.priceImpactBps,25);
 assert.equal(q.source,"jupiter_quote_only");
});
test("Jupiter quote converts token input for sell",async()=>{
 let seen;
 const provider=createJupiterQuoteProvider({apiKey:"test-key",usdcMint:"USDC",decimalsForMint:async()=>9,fetchImpl:async url=>{seen=new URL(url);return {ok:true,json:async()=>({outAmount:"12300000",priceImpactPct:"0"})}}});
 const q=await provider({side:"sell",tokenAddress:"TOKEN",amount:2.5});
 assert.equal(seen.searchParams.get("amount"),"2500000000");
 assert.equal(q.outputAmount,12.3);
});
test("Jupiter quote rejects API failure",async()=>{
 const provider=createJupiterQuoteProvider({apiKey:"test-key",usdcMint:"USDC",decimalsForMint:async()=>9,fetchImpl:async()=>({ok:false,status:429})});
 await assert.rejects(()=>provider({side:"buy",tokenAddress:"TOKEN",amount:50}),/429/);
});
