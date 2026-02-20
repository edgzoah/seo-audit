import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    tsconfigPath: "./tsconfig.next.json",
  },
  outputFileTracingIncludes: {
    "/*": ["./dist/**/*"],
  },
};

export default nextConfig;
