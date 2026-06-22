import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Le foto prodotto sono servite dal bucket pubblico di Supabase Storage.
    // Nota: NON impostiamo `search` (le url avranno un cache-bust `?v=...`,
    // che con `search: ""` verrebbe rifiutato da next/image — usato nella PDP).
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ozbsslebqtzslfpqpwyz.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
    // Next 16 richiede di dichiarare esplicitamente le quality ammesse.
    qualities: [75],
  },
  experimental: {
    // L'upload foto passa da una Server Action: alziamo il limite del body
    // (default 1MB) in linea col limite del bucket (5MB), per non far fallire
    // gli upload di immagini un po' piu pesanti dopo la compressione.
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
