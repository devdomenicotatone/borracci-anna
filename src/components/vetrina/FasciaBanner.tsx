// Fascia BANNER promozionale: striscia larga arrotondata con titolo, testo e
// una CTA. Sfondo a gradiente (config.tono) o immagine (config.immagineUrl).

import Link from "next/link";

import type { FasciaVetrina } from "@/lib/vetrina-home";

// Toni ammessi -> classi tile (globals.css). tile-sun e chiara: testo scuro.
const TONI = new Set([
  "deep",
  "coral",
  "cyan",
  "sunset",
  "sun",
  "cyan-soft",
]);
const TONI_CHIARI = new Set(["sun"]);

export default function FasciaBanner({ fascia }: { fascia: FasciaVetrina }) {
  const { config } = fascia;
  const tono = config.tono && TONI.has(config.tono) ? config.tono : "deep";
  const chiaro = TONI_CHIARI.has(tono);
  const immagine = config.immagineUrl?.trim();
  const testoScuro = chiaro && !immagine;

  return (
    <section className="mx-auto max-w-6xl px-5 pt-12 sm:pt-14">
      <div
        className={`relative isolate overflow-hidden rounded-3xl px-6 py-10 shadow-soft sm:px-10 sm:py-14 tile-${tono} ${
          testoScuro ? "text-foreground" : "text-white"
        }`}
      >
        {immagine && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- sfondo banner scelto dal gestore (URL libero) */}
            <img
              src={immagine}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 -z-20 h-full w-full object-cover"
            />
            <span
              aria-hidden="true"
              className="absolute inset-0 -z-10 bg-[#00395f]/55"
            />
          </>
        )}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 opacity-30 [background-image:radial-gradient(rgba(255,255,255,.35)_1.5px,transparent_2px)] [background-size:18px_18px]"
        />

        <div className="max-w-[46ch]">
          {config.occhiello && (
            <span
              className={`font-display text-xs font-bold uppercase tracking-wide ${
                testoScuro ? "text-sea" : "text-white/85"
              }`}
            >
              {config.occhiello}
            </span>
          )}
          {fascia.titolo && (
            <h2 className="mt-1.5 font-display text-2xl font-extrabold leading-tight sm:text-3xl">
              {fascia.titolo}
            </h2>
          )}
          {config.testo && (
            <p
              className={`mt-2 text-sm sm:text-base ${
                testoScuro ? "text-foreground/80" : "text-white/90"
              }`}
            >
              {config.testo}
            </p>
          )}
          {config.ctaLabel && (
            <Link
              href={config.ctaHref || "/prodotti"}
              className={`mt-5 inline-flex items-center justify-center rounded-full px-6 py-3 font-display font-bold shadow-soft transition duration-200 hover:-translate-y-0.5 ${
                testoScuro
                  ? "bg-sea text-white"
                  : "bg-white text-sea"
              }`}
            >
              {config.ctaLabel}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
