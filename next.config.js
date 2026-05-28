/**
 * Next.js config for the Lending Intelligence Terminal.
 *
 * The terminal is served as an isolated Vercel deployment and embedded into
 * datumlab.xyz/lending-terminal via an <iframe> on a one-line route in the
 * DatumLabs site repo. No basePath is needed — the dashboard renders at the
 * root of its own Vercel URL, and the parent route just frames it.
 *
 * If you ever need the terminal to live as a sub-path of a parent Next.js
 * app (rewrite-based mounting), restore `basePath: "/lending-terminal"` and
 * add the matching rewrite on the parent.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The published /reports/[slug] pages are statically prerendered at build
  // (generateStaticParams + dynamicParams=false). Each one runs the report
  // chart loaders, which hit DefiLlama + FRED + on-chain Aave/Spark reads.
  // When the public RPC rate-limits, a single report can take >60s to
  // generate; the default 60s static-generation timeout then fails the
  // whole deploy. Raise the ceiling so a slow-upstream blip doesn't block a
  // ship. (Per-request runtime is bounded separately by each route's
  // `maxDuration`.)
  staticPageGenerationTimeout: 180,
}

module.exports = nextConfig
