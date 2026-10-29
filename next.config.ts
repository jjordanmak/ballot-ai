import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Legacy ZIP-first ballot URLs: the landing page in production (the June
      // prototype is internal-only); the frozen prototype on previews.
      {
        source: "/ballot/:zip(\\d{5})/:electionId",
        destination: process.env.VERCEL_ENV === "production" ? "/" : "/archive/:electionId/:zip",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        // Address-derived pages: never indexed, never leak the URL as a referrer.
        source: "/ballot/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
