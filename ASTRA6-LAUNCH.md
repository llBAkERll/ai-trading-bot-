# Astra 6 — launch guide (development paper mode)

This branch keeps the original DEX Screener scoring and dashboard, but routes dashboard demo cycles through the Astra 6 simulated-execution runner.

## Windows PowerShell

```powershell
git clone --branch astra6-realistic-paper-v1 https://github.com/llBAkERll/ai-trading-bot-.git astra6
cd astra6
Copy-Item .env.example .env.local
npm run dev
```

Open **http://localhost:3010** in your browser, then click **Start auto demo** and choose **Moderate**. Keep PowerShell running. This is a local site, not a publicly hosted URL. The existing dashboard still uses its original branding and controls.

## Important limits

- PAPER ONLY. The code never submits wallet transactions.
- DEX Screener prices are **indicative**, not executable Jupiter quotes. Simulated price impact and network/DEX fees are estimates. Do not interpret performance as proven live-trading profitability.
- The engine models a delayed second price lookup before every paper fill, rejects stale quotes and excessive estimated price impact/slippage, and charges estimated fees.
- Position sizing targets 5% of equity, with a 20% portfolio exposure cap and 5% daily equity loss guard.
- Scans run every 30 seconds while auto demo is active. This is NOT 100ms tick-by-tick market data.
- Dashboard risk profile affects strategy filters and exit rules, not the fixed Astra 6 position/exposure limits.
- Market API availability, liquidity withdrawal, RPC confirmation, partial fills, token taxes, and MEV are not fully modeled. No profitability guarantee.
- This development branch should be tested before merging into main. Existing state in data/paper-state.json from the legacy demo can distort results; back it up and reset demo to start fresh.

## Test

```powershell
node --test test/astra6-paper.test.js
```

The engine is not ready for real wallet funds. No private keys are required.

## Jupiter quote-only paper mode

Jupiter quote requests require an API key and a working Solana RPC endpoint. In PowerShell, before starting the server:

```powershell
$env:ASTRA6_QUOTE_MODE="jupiter"
$env:JUPITER_API_KEY="YOUR_JUPITER_API_KEY"
$env:SOLANA_RPC_URL="YOUR_SOLANA_RPC_URL"
npm run dev
```

Do not commit API keys to GitHub. These settings are read from the running PowerShell environment; `.env.local` is not used for the Jupiter-specific variables in this version.

This uses read-only swap quotes. It does not submit transactions, verify fills, model priority-fee spikes accurately, or guarantee that quoted routes would still be executable after the delay. Missing API keys or unavailable routes should fail closed, not generate fabricated profits.

Run all tests with:

```powershell
node --test
```

## Recommended: Raydium + Helius real-time fee mode

Create a Helius account and obtain a mainnet RPC URL. In PowerShell:

```powershell
$env:ASTRA6_QUOTE_MODE="raydium-helius"
$env:HELIUS_RPC_URL="YOUR_HELIUS_MAINNET_RPC_URL"
npm run dev
```

The bot obtains Raydium swap quotes and Helius priority-fee estimates on each paper entry/exit re-quote. Pool fees are included in Raydium output amounts and **not charged again**. Network and priority fees are converted from SOL into USDC using a current SOL/USD market price. A 250,000-compute-unit assumption is used; this is not an exact fee for a constructed transaction. Token-account creation, rent, MEV tips, and transaction failure remain unverified.

The simulation fails closed when no route or fee estimate is available. Raydium quotes do not cover all Solana liquidity sources. This is still **paper only**; quotes are not proof of confirmed execution. The auto cycle remains every 30 seconds, not every 100 milliseconds.
