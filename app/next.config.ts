import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // getkin.space is the one prod hostname (passkeys are bound to it). The old hostname only serves /move (account
  // hand-over), plus /api and /.well-known for already-installed old app builds.
  async redirects() {
    return [
      {
        // Old hostname: every page → its own /move (bring the account over). /api, /.well-known and build assets stay.
        source: "/:path((?!api/|\\.well-known/|_next/|move$|.*\\.).*)",
        has: [{ type: "host", value: "kin-money.vercel.app" }],
        destination: "/move",
        permanent: false,
      },
      // www is a different passkey hostname → always the apex.
      { source: "/:path*", has: [{ type: "host", value: "www.getkin.space" }], destination: "https://getkin.space/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
