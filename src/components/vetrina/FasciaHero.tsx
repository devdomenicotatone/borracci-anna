// Fascia HERO della home: testata full-bleed "pop mare" con occhiello, titolo,
// sottotitolo e due CTA. Tutto parametrizzato dalla sezione (curata dal
// pannello). Immagine di sfondo opzionale (config.immagineUrl): se assente
// resta il gradiente mare con sole, puntini e sticker.

import Image from "next/image";
import Link from "next/link";

import type { FasciaVetrina } from "@/lib/vetrina-home";

/**
 * True se l'URL punta al bucket Supabase whitelistato nei remotePatterns di
 * next.config.ts: solo quegli host possono passare da next/image (un host non
 * whitelistato manderebbe l'optimizer in errore 500). Duplicata volutamente in
 * FasciaBanner.tsx: verra estratta quando servira altrove.
 */
function urlSuBucketSupabase(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      u.hostname === "ozbsslebqtzslfpqpwyz.supabase.co" &&
      u.pathname.startsWith("/storage/v1/object/public/")
    );
  } catch {
    // URL relativo o malformato: si resta sull'<img> nativo.
    return false;
  }
}

/** CTA che diventa <Link> per i path interni e <a> per hash/URL esterni. */
function BottoneCta({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: React.ReactNode;
}) {
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}

export default function FasciaHero({ fascia }: { fascia: FasciaVetrina }) {
  const { config } = fascia;
  const immagine = config.immagineUrl?.trim();

  return (
    <section
      aria-labelledby="hero-title"
      className="bg-sea-gradient relative isolate overflow-hidden text-white"
    >
      {/* Immagine di sfondo opzionale. Il velo scuro (piu sotto) e SEMPRE
          attivo: senza, sul lembo lagoon del gradiente il bianco si ferma a
          2.0-2.5:1 (audit a11y 2026-07, WCAG 1.4.3). */}
      {immagine && (
        <>
          {urlSuBucketSupabase(immagine) ? (
            // Immagine LCP della home servita dal bucket whitelistato: next/image
            // negozia AVIF/WebP e taglia le varianti sul viewport (sizes 100vw).
            // In Next 16 `priority` e deprecato -> loading="eager" +
            // fetchPriority="high" (stesso pattern di GalleriaProdotto.tsx).
            // fill si aggancia alla <section> (position: relative qui sopra).
            <Image
              src={immagine}
              alt=""
              aria-hidden="true"
              fill
              sizes="100vw"
              quality={75}
              loading="eager"
              fetchPriority="high"
              className="-z-20 object-cover"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- sfondo hero scelto dal gestore (URL libero, host non whitelistato: next/image darebbe 500)
            <img
              src={immagine}
              alt=""
              aria-hidden="true"
              // Immagine LCP della home: priorita alta e decoding asincrono per
              // non ritardare il render del testo dell'hero.
              fetchPriority="high"
              decoding="async"
              className="absolute inset-0 -z-20 h-full w-full object-cover"
            />
          )}
        </>
      )}
      {/* Velo per la leggibilita del testo: sempre attivo, con o senza foto. */}
      <span
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[#00395f]/60"
      />
      {/* Sole sfumato in alto a destra (decorativo). */}
      <span
        aria-hidden="true"
        className="absolute -right-12 -top-16 -z-10 h-60 w-60 rounded-full [background:radial-gradient(circle_at_50%_50%,rgba(255,210,63,.95),rgba(255,210,63,0)_70%)]"
      />
      {/* Puntini bianchi sfumati verso il basso. */}
      <span
        aria-hidden="true"
        className="dots-overlay absolute inset-0 -z-10 opacity-50 [-webkit-mask-image:linear-gradient(180deg,#000_0%,transparent_62%)] [mask-image:linear-gradient(180deg,#000_0%,transparent_62%)]"
      />

      {/* Sticker ruotati (decorativi), solo da md+. */}
      {(config.stickerAlto || config.stickerBasso) && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[1] hidden md:block"
        >
          {config.stickerAlto && (
            <span className="absolute right-[6%] top-10 rotate-6 rounded-xl bg-coral-ink px-4 py-2.5 font-display text-sm font-bold text-white shadow-[0_10px_24px_-10px_rgba(0,40,70,.5)]">
              {config.stickerAlto}
            </span>
          )}
          {config.stickerBasso && (
            <span className="absolute bottom-28 right-[9%] -rotate-6 rounded-xl bg-white px-4 py-2.5 font-display text-sm font-bold text-sea shadow-[0_10px_24px_-10px_rgba(0,40,70,.5)]">
              {config.stickerBasso}
            </span>
          )}
        </div>
      )}

      <div className="mx-auto max-w-6xl px-5 pb-24 pt-12 sm:pb-28 sm:pt-16 lg:pb-32 lg:pt-20">
        {config.occhiello && (
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 text-sm font-medium ring-1 ring-white/35 backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-sun shadow-[0_0_0_4px_rgba(255,210,63,.35)]" />
            {config.occhiello}
          </span>
        )}
        {fascia.titolo && (
          <h1
            id="hero-title"
            className="mt-4 max-w-[14ch] font-display text-[clamp(2.3rem,9vw,4.4rem)] font-extrabold leading-[1.05] [text-shadow:0_6px_24px_rgba(0,57,99,.35)]"
          >
            {fascia.titolo}
          </h1>
        )}
        {fascia.sottotitolo && (
          <p className="mt-3.5 max-w-[46ch] text-base text-white sm:text-lg">
            {fascia.sottotitolo}
          </p>
        )}
        {(config.ctaPrimariaLabel || config.ctaSecondariaLabel) && (
          <div className="mt-6 flex flex-wrap gap-3">
            {config.ctaPrimariaLabel && (
              <BottoneCta
                href={config.ctaPrimariaHref || "/prodotti"}
                className="inline-flex items-center justify-center rounded-full bg-coral-ink px-6 py-3.5 font-display font-bold text-white shadow-coral transition duration-200 hover:-translate-y-0.5"
              >
                {config.ctaPrimariaLabel}
              </BottoneCta>
            )}
            {config.ctaSecondariaLabel && (
              <BottoneCta
                href={config.ctaSecondariaHref || "/vieni-a-trovarci"}
                className="inline-flex items-center justify-center rounded-full bg-white/15 px-6 py-3.5 font-display font-bold text-white ring-2 ring-white/70 backdrop-blur transition duration-200 hover:-translate-y-0.5 hover:bg-white/25"
              >
                {config.ctaSecondariaLabel}
              </BottoneCta>
            )}
          </div>
        )}
      </div>

      {/* Onda bianca in fondo all'hero. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -bottom-px z-[2] leading-[0]"
      >
        <svg
          viewBox="0 0 1440 120"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
          className="block h-auto w-full"
        >
          <path
            fill="var(--background)"
            d="M0,64 C180,110 360,110 540,80 C720,50 900,8 1080,16 C1260,24 1380,72 1440,88 L1440,120 L0,120 Z"
          />
        </svg>
      </div>
    </section>
  );
}
