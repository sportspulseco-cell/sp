/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: process.cwd() + "/../..",
  transpilePackages: [
    "@sportspulse/api-client","@sportspulse/auth", "@sportspulse/ui"]
};

export default nextConfig;
