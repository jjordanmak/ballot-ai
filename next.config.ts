import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Legacy ZIP-first ballot URLs → archived June 2026 primary prototype.
      {
        source: "/ballot/:zip(\\d{5})/:electionId",
        destination: "/archive/:electionId/:zip",
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
