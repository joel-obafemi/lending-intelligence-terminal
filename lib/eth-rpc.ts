/**
 * Single shared viem PublicClient for Ethereum mainnet reads.
 *
 * Public RPCs each have their own quirks with large responses (Aave's
 * `getReservesData()` returns ~60KB across ~66 reserves). Cloudflare returns
 * "Internal error" on responses over a certain size, LlamaRPC sometimes
 * returns malformed JSON under load, Ankr is generally reliable but
 * rate-limits aggressively. We use viem's `fallback()` transport so a
 * failure on one provider rolls over to the next without per-call code.
 *
 * Set `ETH_RPC_URL` to a private Alchemy/Infura/Quicknode URL in production
 * — it gets prepended to the fallback chain and skips the public quirks.
 */
import { createPublicClient, fallback, http, type PublicClient } from "viem"
import { mainnet } from "viem/chains"

// Order matters: Ankr first (most-reliable on big calls), then 1rpc, then
// LlamaRPC (good aggregate but flakes on large responses), Cloudflare last
// (works for small calls but errors on large ones).
const PUBLIC_RPCS = [
  "https://rpc.ankr.com/eth",
  "https://1rpc.io/eth",
  "https://eth.llamarpc.com",
  "https://cloudflare-eth.com",
]

let cached: PublicClient | null = null

export function getEthClient(): PublicClient {
  if (cached) return cached
  const customUrl = process.env.ETH_RPC_URL?.trim()
  const urls = customUrl ? [customUrl, ...PUBLIC_RPCS] : PUBLIC_RPCS
  const transports = urls.map((url) =>
    http(url, { timeout: 30_000, retryCount: 1, retryDelay: 200 }),
  )
  cached = createPublicClient({
    chain: mainnet,
    // `fallback` rotates to the next transport on any error. `rank` checks
    // latency and re-orders periodically so fast providers keep being chosen.
    transport: fallback(transports, { rank: false, retryCount: 0 }),
    // Multicall DISABLED on purpose: Aave's `getReservesData()` returns a
    // multi-KB struct that doesn't fit cleanly inside Multicall3's wrapper
    // on most public RPCs. We send the call direct.
  })
  return cached
}
