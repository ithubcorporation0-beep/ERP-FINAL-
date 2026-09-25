import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // `next dev` would otherwise append its own block to AGENTS.md/CLAUDE.md on every run.
  // AGENTS.md is our binding rules file; the equivalent advice lives there (see "Framework versions").
  agentRules: false,
};

export default nextConfig;
