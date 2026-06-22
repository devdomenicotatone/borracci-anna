// Footer della vetrina: banda inchiostro con onda superiore, wordmark, contatti
// e social. Server Component puro (nessuno stato, nessuna interazione client).

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
          {/* Brand + social */}
          <div>
            <span className="wordmark text-2xl text-white [&_.wm-by]:text-lagoon">
              <span className="wm-by">by</span>
              <span className="wm-frody">Frody</span>
            </span>
            <p className="mt-3 max-w-[34ch] text-[#9fb6c6]">
              Abbigliamento fresco e leggero, scelto uno a uno sul lungomare di
              Rimini.
            </p>
            <div className="mt-4 flex gap-3">
              <a
                href="https://instagram.com"
                aria-label="Instagram di by Frody"
                className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition duration-200 hover:-translate-y-0.5 hover:bg-coral"
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
                  <rect x="3" y="3" width="18" height="18" rx="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
                </svg>
              </a>
              <a
                href="https://facebook.com"
                aria-label="Facebook di by Frody"
                className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition duration-200 hover:-translate-y-0.5 hover:bg-coral"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                  className="h-5 w-5"
                >
                  <path d="M14 9h3V5.5h-3c-2.2 0-3.6 1.4-3.6 3.6V11H8v3.4h2.4V22h3.4v-7.6H16l.5-3.4h-2.7V9.4c0-.3.2-.4.5-.4Z" />
                </svg>
              </a>
            </div>
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
              <span>Lungomare Tintori 9, Rimini</span>
            </p>
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
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              <span>Tutti i giorni 9–24 in estate</span>
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
                href="mailto:ciao@byfrody.it"
                className="transition-colors hover:text-white"
              >
                ciao@byfrody.it
              </a>
            </p>
          </div>
        </div>

        <p className="mt-8 border-t border-white/10 pt-5 text-sm text-[#90a6b8]">
          © 2026 by Frody
        </p>
      </div>
    </footer>
  );
}
