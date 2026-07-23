// Footer della vetrina: banda inchiostro con onda superiore, wordmark, contatti
// e social. Server Component puro (nessuno stato, nessuna interazione client).
// Dati impresa reali da @/lib/negozio (P.IVA/REA in footer: obbligo di legge).

import Link from "next/link";

import Wordmark from "@/components/Wordmark";
import {
  PERCORSO_CONDIZIONI,
  PERCORSO_PRIVACY,
  PERCORSO_RECESSO,
} from "@/lib/legale";
import { MAPPA, NEGOZIO } from "@/lib/negozio";

export default function Footer() {
  return (
    <footer
      id="contatti"
      className="relative scroll-mt-20 bg-foreground pb-8 pt-12 text-[#dfe9f1] sm:pt-14"
    >
      {/* Onda superiore che stacca dalla sezione sopra (fill inchiostro). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-[68px] leading-[0]"
      >
        <svg
          viewBox="0 0 1440 70"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
          className="block h-[70px] w-full"
        >
          <path
            fill="var(--foreground)"
            d="M0,40 C200,10 400,10 720,34 C1040,58 1240,58 1440,30 L1440,70 L0,70 Z"
          />
        </svg>
      </div>

      <div className="mx-auto max-w-6xl px-5">
        <div className="grid gap-8 md:grid-cols-[1.4fr_1fr_1fr]">
          {/* Brand */}
          <div>
            <Wordmark onDark className="text-2xl" />
            <p className="mt-3 max-w-[34ch] text-[#9fb6c6]">
              Abbigliamento fresco e leggero, scelto uno a uno sul lungomare di
              Rimini.
            </p>
          </div>

          {/* Dove e quando */}
          <div className="space-y-2">
            <p className="flex items-start gap-2.5 text-[#b9cad8]">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="mt-0.5 h-[18px] w-[18px] flex-none text-lagoon"
              >
                <path d="M12 21s-7-6.3-7-11a7 7 0 0 1 14 0c0 4.7-7 11-7 11Z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
              <a
                href={MAPPA.indicazioni}
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-white"
              >
                {NEGOZIO.indirizzoCompleto}
              </a>
            </p>
            {/* div, non p: contiene una lista (ul dentro p = HTML non valido). */}
            <div className="flex items-start gap-2.5 text-[#b9cad8]">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="mt-0.5 h-[18px] w-[18px] flex-none text-lagoon"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              <div>
                <p>{NEGOZIO.orariApertura.stagione}:</p>
                <ul className="mt-1.5 space-y-1">
                  {NEGOZIO.orariApertura.fasce.map((f) => (
                    <li key={f.periodo}>
                      {f.periodo} ·{" "}
                      <span className="font-semibold tabular-nums text-[#dfe9f1]">
                        {f.orario}
                      </span>
                      {f.nota ? (
                        <span className="block text-sm text-[#90a6b8]">
                          {f.nota}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p>
              <Link
                href="/vieni-a-trovarci"
                className="inline-flex items-center gap-1.5 font-semibold text-lagoon transition-colors hover:text-white"
              >
                Come arrivare
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
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            </p>
          </div>

          {/* Contatti */}
          <div className="space-y-2">
            <p className="font-display font-semibold text-white">Scrivici</p>
            <p className="flex items-start gap-2.5 text-[#b9cad8]">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="mt-0.5 h-[18px] w-[18px] flex-none text-lagoon"
              >
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m3 7 9 6 9-6" />
              </svg>
              <a
                href={`mailto:${NEGOZIO.email}`}
                className="transition-colors hover:text-white"
              >
                {NEGOZIO.email}
              </a>
            </p>
            <p>
              <Link
                href="/account"
                className="inline-flex items-center gap-1.5 font-semibold text-lagoon transition-colors hover:text-white"
              >
                Il mio account
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
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-8 border-t border-white/10 pt-5 text-sm text-[#90a6b8]">
          {/* Documenti legali: sempre raggiungibili da ogni pagina (GDPR
              art. 12 e Cod. Consumo art. 49; audit conformita 2026-07-14). */}
          <nav aria-label="Documenti legali">
            <ul className="flex flex-wrap gap-x-2 gap-y-1">
              <li>
                <Link
                  href={PERCORSO_CONDIZIONI}
                  className="transition-colors hover:text-white"
                >
                  Condizioni di vendita
                </Link>
              </li>
              <li aria-hidden="true">·</li>
              <li>
                <Link
                  href={PERCORSO_RECESSO}
                  className="transition-colors hover:text-white"
                >
                  Diritto di recesso
                </Link>
              </li>
              <li aria-hidden="true">·</li>
              <li>
                <Link
                  href={PERCORSO_PRIVACY}
                  className="transition-colors hover:text-white"
                >
                  Privacy e cookie
                </Link>
              </li>
            </ul>
          </nav>
          <p className="mt-2">
            {NEGOZIO.ragioneSociale} · P.IVA {NEGOZIO.partitaIva} · REA{" "}
            {NEGOZIO.rea} · PEC{" "}
            <a
              href={`mailto:${NEGOZIO.pec}`}
              className="transition-colors hover:text-white"
            >
              {NEGOZIO.pec}
            </a>
          </p>
          <p className="mt-2">© 2026 Borracci Anna</p>
        </div>
      </div>
    </footer>
  );
}
