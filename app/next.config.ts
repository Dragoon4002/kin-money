import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // getkin.space is the one prod hostname (passkeys are bound to it). Send visitors of the old hostname there,
  // but keep its /api and /.well-known working for already-installed old app builds.
  async redirects() {
    return [
      {
        source: "/:path((?!api/|\\.well-known/).*)",
        has: [{ type: "host", value: "kin-money.vercel.app" }],
        destination: "https://getkin.space/:path",
        permanent: false,
      },
      // www is a different passkey hostname → always the apex.
      { source: "/:path*", has: [{ type: "host", value: "www.getkin.space" }], destination: "https://getkin.space/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
