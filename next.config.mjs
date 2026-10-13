/** @type {import('next').NextConfig} */
const nextConfig = {
  // Frontend-only: export plain static files into ./out (no Node server, no API routes, no SSR).
  output: 'export',
  // /checkout/ → out/checkout/index.html. Works on any static host and keeps the service worker simple.
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
