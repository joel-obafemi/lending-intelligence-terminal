/**
 * Next.js config for the Lending Intelligence Terminal.
 *
 * `basePath: '/lending-terminal'` makes the app serve every route under that
 * prefix so it can be mounted as a sub-path of `datumlab.xyz` via a rewrite
 * on the main Datum Labs site:
 *
 *     // datumlab.xyz/next.config.js
 *     async rewrites() {
 *       return [
 *         {
 *           source: '/lending-terminal',
 *           destination: 'https://<vercel-deployment>.vercel.app/lending-terminal',
 *         },
 *         {
 *           source: '/lending-terminal/:path*',
 *           destination: 'https://<vercel-deployment>.vercel.app/lending-terminal/:path*',
 *         },
 *       ]
 *     }
 *
 * `basePath` also auto-prefixes:
 *   - `<Link href="/markets/foo">` → `/lending-terminal/markets/foo`
 *   - Static asset URLs in `_next/static/*`
 *   - API routes (e.g. `/api/overview` → `/lending-terminal/api/overview`)
 *
 * Note: this changes the dev server URL too. `npm run dev` now serves the
 * app at `http://localhost:3000/lending-terminal` (NOT the bare root).
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: "/lending-terminal",
}

module.exports = nextConfig
