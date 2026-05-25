# Solana Memecoin AI Bot App

Paper-first web app for Solana memecoin trading. It scans Solana pairs, scores candidates, simulates entries/exits, connects a browser wallet for identity, and presents a Pro membership path.

There is no foolproof trading bot. Memecoins can go to zero, liquidity can vanish, and swaps can fail or be MEV’d. This project is built to prove behavior with paper logs before any live wallet code is enabled.

## Plan

1. Scan Solana token pairs with DEX Screener search data.
2. Filter out low-liquidity and low-volume pairs.
3. Score candidates by liquidity, volume, buy/sell activity, and price momentum.
4. Paper buy only within strict per-position and max-open-position limits.
5. Paper sell on take-profit, stop-loss, or trailing-stop rules.
6. Log every decision so the strategy can be audited.
7. Add live Jupiter execution only behind an explicit `ENABLE_LIVE_TRADING=true` gate after paper testing.

## Run

```powershell
cd C:\Users\center\solana-memecoin-bot
Copy-Item .env.example .env.local
npm run dev
```

Open `http://localhost:3010`.

CLI tools are still available:

```powershell
npm run scan
npm run paper
npm run status
```

## App Features

- Demo starts with `$1,000` paper USDC.
- Live Solana token candidate table from DEX Screener.
- AI-style scoring filters by liquidity, volume, momentum, and buy/sell flow.
- Paper bot opens and closes simulated positions.
- Phantom wallet connect in the browser.
- Pro membership panel set to `$200/month`.
- Checkout endpoint scaffolded for Stripe integration.

## Data Sources

- DEX Screener API for pair/liquidity/volume/transaction metrics.
- Jupiter Swap API is the intended execution path later, after the paper-trading engine is reviewed.

## Safety Defaults

- Live trading disabled.
- Position count and position size are adaptive by default.
- Demo sizing uses cash balance, candidate score, rank, and a small reserve.
- Minimum liquidity and volume filters enabled.
- No private key is needed for the MVP.
