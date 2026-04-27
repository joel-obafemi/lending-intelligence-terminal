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
const nextConfig = {}

module.exports = nextConfig
