import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Externaliza pacotes pesados que não devem ser empacotados no edge/server bundle
  serverExternalPackages: ["pg"],

  // Desabilita telemetria em produção
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
