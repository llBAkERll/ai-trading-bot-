import test from "node:test";
import assert from "node:assert/strict";
import {ASTRA6_RISK,availableEntry,simulateSwap} from "../src/astra6-paper-execution.js";
import {astraEntry,astraExit} from "../src/astra6-trading-loop.js";
const quote=(amount,output=amount,fee=0.01)=>({inputAmount:amount,outputAmount:output,timestampMs:1000,priceImpactBps:20,networkFeeUsdc:fee});
test("balanced sizing caps entry at $50",()=>{const s={cashUsdc:1000,positions:[],dayStartEquity:1000};assert.equal(availableEntry(s).amountUsdc,50)});
test("20 percent exposure blocks new entries",()=>{const s={cashUsdc:800,positions:[{lastValueUsdc:200}],dayStartEquity:1000};assert.equal(availableEntry(s).allowed,false)});
test("5 percent daily equity drawdown blocks entries",()=>{const s={cashUsdc:949,positions:[],dayStartEquity:1000};assert.equal(availableEntry(s).reason,"daily_loss_limit")});
test("delayed requote rejects adverse slippage",async()=>{let n=0;const r=await simulateSwap({amountUsdc:50,quoteProvider:async a=>quote(a,++n===1?100:95),now:()=>1000,sleep:async()=>{}});assert.equal(r.reason,"slippage")});
test("entry and exit account for both fee legs",async()=>{const state={cashUsdc:1000,positions:[],closedTrades:[]};const now=()=>1000;const sleep=async()=>{};const buy=async ({amount})=>quote(amount,10,0.1);const entered=await astraEntry({state,candidate:{baseAddress:"token",baseSymbol:"T",score:50},quoteProvider:buy,now,sleep});assert.equal(entered.status,"simulated_fill");assert.equal(state.cashUsdc,949.9);const sell=async ({amount})=>quote(amount,55,0.2);const exited=await astraExit({state,positionId:entered.position.id,quoteProvider:sell,now,sleep});assert.ok(Math.abs(exited.trade.pnlUsdc-4.7)<1e-8);assert.ok(Math.abs(state.cashUsdc-1004.7)<1e-8)});

test("stale quotes cannot create simulated fills",async()=>{const r=await simulateSwap({amountUsdc:50,quoteProvider:async a=>({...quote(a),timestampMs:0}),now:()=>2000,sleep:async()=>{}});assert.equal(r.reason,"stale_quote")});
test("unacceptable market impact prevents fill",async()=>{const r=await simulateSwap({amountUsdc:50,quoteProvider:async a=>({...quote(a),priceImpactBps:250}),now:()=>1000,sleep:async()=>{}});assert.equal(r.reason,"price_impact")});
