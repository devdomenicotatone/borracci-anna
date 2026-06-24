// Pagina "Vieni a trovarci": dove siamo, orari, contatti e mappa interattiva.
// Server Component: la mappa e un embed OpenStreetMap (interattivo, senza cookie
// di tracciamento ne API key), quindi niente JS client ne banner di consenso.
// Dati reali da @/lib/negozio.

import Link from "next/link";

import MappaNegozio from "@/components/MappaNegozio";
import { MAPPA, NEGOZIO } from "@/lib/negozio";

export const metadata = {
  title: "Vieni a trovarci · Anna Shop",
  description:
    "Il negozio Anna Shop sul lungomare di Rimini, a Rivazzurra: Viale Regina Margherita 169/C. Mappa interattiva, orari e indicazioni stradali.",
};

export default function VieniATrovarciPage() {
  return (
    <main className="flex-1">
      {/* ===== Hero compatto ===== */}
      <section className="bg-sea-gradient relative isolate overflow-hidden text-white">
        <span
          aria-hidden="true"
          className="dots-overlay absolute inset-0 -z-10 opacity-50 [mask-image:linear-gradient(180deg,#000_0%,transparent_70%)]"
        />
        <div className="mx-auto max-w-6xl px-5 pb-20 pt-12 sm:pb-24 sm:pt-16">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 text-sm font-medium ring-1 ring-white/35 backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-sun shadow-[0_0_0_4px_rgba(255,210,63,.35)]" />
            Dove siamo
          </span>
          <h1 className="mt-4 font-display text-[clamp(2rem,7vw,3.4rem)] font-extrabold leading-[1.05] [text-shadow:0_6px_24px_rgba(0,57,99,.35)]">
            Vieni a trovarci
          </h1>
          <p className="mt-3.5 max-w-[48ch] text-base text-white/95 sm:text-lg">
            Siamo sul lungomare di Rimini, a Rivazzurra: aria di mare, vetrine
            piene di colore e capi scelti uno a uno. Passa a salutarci.
          </p>
        </div>

        {/* Onda bianca in fondo all'hero. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -bottom-px leading-[0]"
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

      {/* ===== Info + Mappa ===== */}
      <section className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-stretch">
          {/* Scheda informazioni */}
          <div className="flex flex-col rounded-3xl bg-surface p-6 shadow-soft ring-1 ring-line sm:p-8">
            <h2 className="font-display text-2xl font-extrabold text-foreground">
              Il negozio
            </h2>

            <ul className="mt-6 space-y-5">
              <li className="flex items-start gap-3.5">
                <span className="mt-0.5 grid h-10 w-10 flex-none place-items-center rounded-full bg-white text-sea ring-1 ring-line">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="h-5 w-5"
                  >
                    <path d="M12 21s-7-6.3-7-11a7 7 0 0 1 14 0c0 4.7-7 11-7 11Z" />
                    <circle cx="12" cy="10" r="2.5" />
                  </svg>
                </span>
                <div>
                  <p className="font-display text-sm font-bold uppercase tracking-wide text-muted">
                    Indirizzo
                  </p>
                  <a
                    href={MAPPA.indicazioni}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-foreground underline-offset-2 transition-colors hover:text-sea hover:underline"
                  >
                    {NEGOZIO.indirizzo.via}
                    <br />
                    {NEGOZIO.indirizzo.cap} {NEGOZIO.indirizzo.citta} (
                    {NEGOZIO.indirizzo.provincia}) · {NEGOZIO.indirizzo.zona}
                  </a>
                </div>
              </li>

              <li className="flex items-start gap-3.5">
                <span className="mt-0.5 grid h-10 w-10 flex-none place-items-center rounded-full bg-white text-sea ring-1 ring-line">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="h-5 w-5"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                </span>
                <div>
                  <p className="font-display text-sm font-bold uppercase tracking-wide text-muted">
                    Orari
                  </p>
                  <p className="font-medium text-foreground">{NEGOZIO.orari}</p>
                </div>
              </li>

              <li className="flex items-start gap-3.5">
                <span className="mt-0.5 grid h-10 w-10 flex-none place-items-center rounded-full bg-white text-sea ring-1 ring-line">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="h-5 w-5"
                  >
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="m3 7 9 6 9-6" />
                  </svg>
                </span>
                <div>
                  <p className="font-display text-sm font-bold uppercase tracking-wide text-muted">
                    Scrivici
                  </p>
                  <a
                    href={`mailto:${NEGOZIO.email}`}
                    className="font-medium text-foreground underline-offset-2 transition-colors hover:text-sea hover:underline"
                  >
                    {NEGOZIO.email}
                  </a>
                </div>
              </li>
            </ul>

            {/* Azioni */}
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <a
                href={MAPPA.indicazioni}
                target="_blank"
                rel="noreferrer"
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-coral px-6 font-display font-bold text-white shadow-coral transition-transform hover:-translate-y-0.5"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="h-5 w-5"
                >
                  <path d="m3 11 19-9-9 19-2-8-8-2Z" />
                </svg>
                Come arrivare
              </a>
              <a
                href={MAPPA.apriOsm}
                target="_blank"
                rel="noreferrer"
                className="flex h-12 flex-1 items-center justify-center rounded-full bg-white px-6 font-display font-bold text-sea ring-2 ring-surface-2 transition-colors hover:bg-surface"
              >
                Apri la mappa
              </a>
            </div>
          </div>

          {/* Mappa interattiva con pin brandizzato */}
          <div className="relative min-h-[340px] overflow-hidden rounded-3xl shadow-sea ring-1 ring-line lg:min-h-0">
            <MappaNegozio />
            {/* Pillola indicazioni sovrapposta (sopra i controlli Leaflet) */}
            <a
              href={MAPPA.indicazioni}
              target="_blank"
              rel="noreferrer"
              className="absolute bottom-4 right-4 z-[1100] inline-flex items-center gap-2 rounded-full bg-sea px-4 py-2.5 font-display text-sm font-bold text-white shadow-sea transition-transform hover:-translate-y-0.5"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="h-4 w-4"
              >
                <path d="m3 11 19-9-9 19-2-8-8-2Z" />
              </svg>
              Indicazioni
            </a>
          </div>
        </div>

        {/* Chip "carine" */}
        <div className="mt-8 flex flex-wrap justify-center gap-3 text-sm">
          {[
            { e: "🏖️", t: "A due passi dalla spiaggia" },
            { e: "☀️", t: "In pieno lungomare a Rivazzurra" },
            { e: "🧺", t: "Capi freschi scelti uno a uno" },
          ].map((c) => (
            <span
              key={c.t}
              className="inline-flex items-center gap-2 rounded-full bg-surface px-4 py-2 font-medium text-foreground ring-1 ring-line"
            >
              <span aria-hidden="true">{c.e}</span>
              {c.t}
            </span>
          ))}
        </div>

        {/* CTA finale */}
        <div className="mt-10 text-center">
          <Link
            href="/#vetrina"
            className="inline-flex h-12 items-center justify-center rounded-full bg-sea px-7 font-display font-bold text-white shadow-sea transition-transform hover:-translate-y-0.5"
          >
            Intanto sfoglia la collezione
          </Link>
        </div>
      </section>
    </main>
  );
}
