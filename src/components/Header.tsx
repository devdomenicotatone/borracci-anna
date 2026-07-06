// Header del sito: wordmark "Anna Shop", navigazione con menu categorie e
// link al carrello. Server component async: carica le categorie da Supabase
// (degrada a nessun menu se non configurato). Su desktop ogni macro categoria
// e un link con dropdown CSS (hover/focus-within) delle figlie; su mobile la
// navigazione sta nel drawer hamburger (MenuMobile, client). Il badge
// contatore (CartBadge) e un figlio client che legge il CartProvider.

import Link from "next/link";

import CartBadge from "@/components/cart/CartBadge";
import MenuMobile from "@/components/MenuMobile";
import Wordmark from "@/components/Wordmark";
import { caricaCategoriePubbliche } from "@/lib/categorie";
import { gruppiCategorie } from "@/lib/categorie-albero";

export default async function Header() {
  const categorie = await caricaCategoriePubbliche();
  const gruppi = gruppiCategorie(categorie);

  return (
    <header className="sticky top-0 z-20 border-b border-surface-2 bg-background/85 backdrop-blur-md backdrop-saturate-150">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-5 sm:gap-4">
        <div className="flex items-center gap-2">
          {/* Hamburger: solo mobile, prima del wordmark. */}
          <MenuMobile gruppi={gruppi} />

          {/* Wordmark "Onda Sole": sigillo + "Anna" corallo / "Shop" blu.
              Il sole "sorge" all'hover grazie a .group su questo Link. */}
          <Link href="/" aria-label="Anna Shop — vai alla home" className="group">
            <Wordmark className="text-2xl" />
          </Link>
        </div>

        <nav
          className="flex items-center gap-1 sm:gap-2"
          aria-label="Navigazione principale"
        >
          <Link
            href="/"
            className="hidden rounded-full px-3 py-2 font-display text-base font-semibold text-foreground transition-colors hover:text-sea lg:inline-flex"
          >
            Vetrina
          </Link>

          {/* Menu categorie (desktop): macro cliccabile + dropdown figlie. */}
          {gruppi.map(({ radice, figlie }) => (
            <div key={radice.id} className="group relative hidden sm:block">
              <Link
                href={`/categoria/${radice.slug}`}
                className="inline-flex items-center gap-1 rounded-full px-3 py-2 font-display text-base font-semibold text-foreground transition-colors hover:text-sea"
              >
                {radice.nome}
                {figlie.length > 0 && (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-3.5 w-3.5 text-muted transition-transform duration-200 group-hover:rotate-180 group-hover:text-sea"
                    aria-hidden="true"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                )}
              </Link>

              {figlie.length > 0 && (
                // pt-2 senza gap reale: il puntatore non "cade" tra trigger e
                // pannello. Visibile su hover del gruppo o focus interno (Tab).
                <div className="invisible absolute left-0 top-full z-30 pt-2 opacity-0 transition-all duration-150 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                  {/* max-h + scroll: con figlie e nipoti il pannello puo
                      superare il viewport (header sticky a 4rem). */}
                  <div className="max-h-[calc(100vh-6rem)] min-w-48 overflow-y-auto rounded-2xl bg-white p-2 shadow-soft ring-1 ring-line">
                    <Link
                      href={`/categoria/${radice.slug}`}
                      className="block rounded-xl px-3.5 py-2.5 font-display text-sm font-bold text-sea transition-colors hover:bg-surface"
                    >
                      Tutto {radice.nome}
                    </Link>
                    {figlie.map(({ figlia, nipoti }) => (
                      <div key={figlia.id}>
                        <Link
                          href={`/categoria/${figlia.slug}`}
                          className="block rounded-xl px-3.5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface hover:text-sea"
                        >
                          {figlia.nome}
                        </Link>
                        {nipoti.map((n) => (
                          <Link
                            key={n.id}
                            href={`/categoria/${n.slug}`}
                            className="block rounded-xl py-2 pl-7 pr-3.5 text-[13px] font-medium text-muted transition-colors hover:bg-surface hover:text-sea"
                          >
                            {n.nome}
                          </Link>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          <Link
            href="/vieni-a-trovarci"
            className="hidden rounded-full px-3 py-2 font-display text-base font-semibold text-foreground transition-colors hover:text-sea sm:inline-flex"
          >
            Vieni a trovarci
          </Link>

          {/* Carrello: icon-btn tondo (tap target 44px) con badge corallo. */}
          <Link
            href="/carrello"
            aria-label="Carrello"
            className="relative grid h-11 w-11 place-items-center rounded-full bg-surface text-foreground transition duration-200 hover:-translate-y-0.5 hover:bg-surface-2"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="9" cy="20" r="1.4" />
              <circle cx="18" cy="20" r="1.4" />
              <path d="M2.5 3h2l2.3 12.2a1.6 1.6 0 0 0 1.6 1.3h8.5a1.6 1.6 0 0 0 1.6-1.3L21 7H6" />
            </svg>
            <CartBadge />
          </Link>
        </nav>
      </div>
    </header>
  );
}
