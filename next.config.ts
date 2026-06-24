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
    // Le foto sono caricate a max 1600px (1400 per "Genera da foto"): l'optimizer
    // non produce varianti utili oltre quella soglia. Togliamo i breakpoint piu
    // grandi del default (1920/2048/3840) per non sprecare encode + cache a freddo
    // — nessuna immagine del sito viene servita oltre i 1600px.
    deviceSizes: [640, 750, 828, 1080, 1200, 1600],
    // Varianti piccole e strette per le immagini con `sizes` sotto i 640px: le
    // miniature della galleria (80px, 2x=160) e la thumb del carrello (96px, 2x=192).
    imageSizes: [16, 32, 48, 64, 80, 96, 128, 160, 192, 256, 384],
    // Ogni url Storage porta un cache-bust `?v=<upload>` stabile (l'invalidazione
    // avviene cambiando src su un nuovo upload), quindi una TTL lunga e sicura e
    // tiene calda la cache dell'optimizer tra richieste e deploy. Default Next = 4h.
    minimumCacheTTL: 2592000, // 30 giorni
  },
  experimental: {
    // L'upload foto passa da una Server Action. Il flusso "Genera da foto" puo
    // inviare piu immagini in un'unica richiesta (prodotto + etichetta), quindi
    // alziamo il limite del body per non farle rigettare al confine del framework.
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
