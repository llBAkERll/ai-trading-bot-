import test from "node:test";
import assert from "node:assert/strict";
import {liveReadiness,assertLiveReady} from "../src/astra6-live-readiness.js";
test("live trading stays locked even with opt-in environment variables",()=>{
 const result=liveReadiness({ENABLE_LIVE_TRADING:"true",WALLET_PRIVATE_KEY:"fake"});
 assert.equal(result.ready,false);
 assert.equal(result.enabled,false);
 assert.equal(result.checks.executionAdapterInstalled,false);
 assert.throws(()=>assertLiveReady(),/disabled/);
});
