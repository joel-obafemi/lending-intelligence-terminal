# Lending Intelligence Terminal

Multi-protocol lending analytics for Ethereum. Unified view of **Aave V3, Spark, Morpho Blue, Fluid** — TVL, rates, utilization, revenue, liquidations, collateral risk.

Product of Datum Labs. Companion to the Liquidator Economy terminal.

## Pages

1. **Overview** — aggregate market metrics across all four protocols.
2. **Protocols** — per-protocol deep dive (TVL, utilization, revenue, rate curves).
3. **Rates** — cross-protocol supply/borrow rate comparison per asset.
4. **Collateral** — collateral risk monitor (peg stability, oracle config, cross-chain dependency).
5. **Events** — stress-event timeline (rsETH exploit, Aug 2024 crash, Feb 2025 selloff).

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind
- Neon Postgres (`@neondatabase/serverless`)
- viem for on-chain reads
- Recharts for visualization
- DefiLlama for aggregate TVL / borrow / fees history

## Getting started

```bash
cp .env.example .env
# fill in DATABASE_URL and ETH_RPC_URL
npm install
npm run db:init     # applies lib/schema.sql to the Neon DB
npm run dev         # http://localhost:3000
```

## Phase 1 scope

- Page 1 (Overview) with DefiLlama aggregates
- Page 2 (Protocols) with Aave V3 + Spark first (shared ABI), then Morpho + Fluid

See the project brief for the full build sequence.
