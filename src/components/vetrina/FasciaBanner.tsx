// Fascia BANNER promozionale: striscia larga arrotondata con titolo, testo e
// una CTA. Sfondo a gradiente (config.tono) o immagine (config.immagineUrl).

import Image from "next/image";
import Link from "next/link";

import type { FasciaVetrina } from "@/lib/vetrina-home";
import {
  sfondoVetrinaAmmesso,
  urlSuBucketSupabase,
} from "@/lib/vetrina-sfondi";

// Toni ammessi -> classi tile (globals.css). I toni con stop chiari vogliono
// testo scuro: il bianco su cyan-soft/sunset/coral si ferma a 1.48-2.27:1
// (audit a11y 2026-07, WCAG 1.4.3).
const TONI = new Set([
  "deep",
  "coral",
  "cyan",
  "sunset",
  "sun",
  "cyan-soft",
]);
const TONI_CHIARI = new Set(["sun", "sunset", "coral", "cyan-soft"]);

export default function FasciaBanner({ fascia }: { fascia: FasciaVetrina }) {
  const { config } = fascia;
  const tono = config.tono && TONI.has(config.tono) ? config.tono : "deep";
  const chiaro = TONI_CHIARI.has(tono);
  // B5: sfondi SOLO dal bucket del sito o path relativi. Il salvataggio
  // rifiuta gia gli host terzi; questa guardia copre i valori legacy a DB
  // (un URL esterno non viene renderizzato: resta il tono pieno).
  const grezzo = config.immagineUrl?.trim();
  const immagine = grezzo && sfondoVetrinaAmmesso(grezzo) ? grezzo : undefined;
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
            {urlSuBucketSupabase(immagine) ? (
              // Sfondo dal bucket whitelistato: next/image negozia AVIF/WebP e
              // taglia le varianti sul viewport. Il banner e sotto la piega:
              // lazy (default). sizes segue il contenitore max-w-6xl (1152px):
              // full-bleed sotto, ~1104px (al netto del padding) sopra.
              // fill si aggancia al div `relative` qui sopra.
              <Image
                src={immagine}
                alt=""
                aria-hidden="true"
                fill
                sizes="(max-width: 1152px) 100vw, 1104px"
                quality={75}
                className="-z-20 object-cover"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- path relativo del sito (stessa origine, ammesso da B5): niente remotePattern, si resta sull'<img> nativo
              <img
                src={immagine}
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
                className="absolute inset-0 -z-20 h-full w-full object-cover"
              />
            )}
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
                testoScuro ? "text-sea-ink" : "text-white/85"
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
