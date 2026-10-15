/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow the Google AI Studio preview to access Next.js development resources.
  allowedDevOrigins: [
    'ais-dev-nsie6n6lp3v3dkzwqmnggy-790190637134.asia-southeast1.run.app',
  ],


  // Generate /checkout/index.html and similar static routes.
  trailingSlash: false,

  // Allow images to work without the Next.js image optimization server.
  images: {
    unoptimized: true,
  },

  reactStrictMode: true,
};

export default nextConfig;