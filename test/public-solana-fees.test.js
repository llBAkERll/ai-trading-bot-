import test from "node:test";
import assert from "node:assert/strict";
import {createPublicSolanaFeeEstimator} from "../src/public-solana-fees.js";
test("free RPC fees convert lamports per CU into dollars",async()=>{
 const fetchImpl=async()=>({ok:true,json:async()=>({result:[{prioritizationFee:100},{prioritizationFee:200},{prioritizationFee:300},{prioritizationFee:400}]})});
 const fees=await createPublicSolanaFeeEstimator({fetchImpl,computeUnits:250000,solPriceUsd:async()=>200})();
 assert.equal(fees.lamportsPerCu,300);
 assert.equal(fees.priorityFeeUsdc,15);
 assert.equal(fees.networkFeeUsdc,0.001);
});
test("free RPC fee estimate fails closed on missing data",async()=>{
 const estimate=createPublicSolanaFeeEstimator({fetchImpl:async()=>({ok:true,json:async()=>({result:[]})}),solPriceUsd:async()=>200});
 await assert.rejects(estimate,/No recent/);
});
