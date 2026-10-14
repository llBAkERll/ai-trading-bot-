import test from "node:test";
import assert from "node:assert/strict";
import {executionRecord,summarizeExecution} from "../src/astra6-execution-telemetry.js";
test("execution metrics count fees without claiming on-chain fills",()=>{
 const fill={status:"simulated_fill",inputUsdc:50,outputAmount:2.4,feeUsdc:0.04,slippageBps:10,executionDelayMs:800,quotedAtMs:1000};
 const record=executionRecord({side:"buy",tokenAddress:"TOKEN",execution:fill,quoteSource:"raydium_helius_paper"});
 assert.equal(record.fillVerifiedOnChain,false);
 const summary=summarizeExecution([record]);
 assert.equal(summary.paperFills,1);
 assert.equal(summary.estimatedFeesUsdc,0.04);
 assert.equal(summary.averageDelayMs,800);
 assert.equal(summary.confirmedOnChain,0);
});
