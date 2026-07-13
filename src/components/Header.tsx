// Header del sito: wordmark "Anna Shop", navigazione con menu categorie e
// link al carrello. Server component async: carica le categorie da Supabase
// (degrada a nessun menu se non configurato). Con puntatore fine (mouse o
// trackpad, da lg in su) ogni macro categoria e un link con dropdown CSS
// (hover/focus-within) delle figlie; su mobile e sui dispositivi touch senza
// puntatore fine (dove l'hover non scatta, anche iPad >=lg) la navigazione
// sta nel drawer hamburger (MenuMobile, client). Il badge contatore
// (CartBadge) e un figlio client che legge il CartProvider.

import Link from "next/link";

import CartBadge from "@/components/cart/CartBadge";
import MenuMobile from "@/components/MenuMobile";
import PreferitiBadge from "@/components/preferiti/PreferitiBadge";
import Wordmark from "@/components/Wordmark";
import AvatarCliente from "@/components/account/AvatarCliente";
import { logoutClienteAction } from "@/lib/account/auth-actions";
import type { GruppoCategorie } from "@/lib/categorie-albero";

/** Il minimo del cliente loggato che serve alla UI (dal layout vetrina). */
export interface ClienteHeader {
  nome: string | null;
  email: string;
}

// I gruppi categorie arrivano come prop dal layout: cosi il fetch categorie e
// quello del carrello partono in parallelo (Promise.all nel layout) invece di
// serializzarsi (statoCarrello -> render Header -> fetch categorie).
export default function Header({
  gruppi,
  cliente,
}: {
  gruppi: GruppoCategorie[];
  cliente: ClienteHeader | null;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-surface-2 bg-background/85 backdrop-blur-md backdrop-saturate-150">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-3 sm:gap-4 sm:px-5">
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Hamburger, prima del wordmark: sempre sotto lg; da lg in su solo
              sui dispositivi senza puntatore fine (touch), dove la nav inline
              qui sotto e nascosta (pointer-fine:) perche i suoi dropdown
              hover-only non si aprirebbero mai. */}
          <MenuMobile gruppi={gruppi} cliente={cliente} />

          {/* Wordmark "Onda Sole": sigillo + "Anna" corallo / "Shop" blu.
              Il sole "sorge" all'hover grazie a .group su questo Link.
              Dimensione a scalini: sotto i 360px hamburger + lockup + 3 icone
              entrano solo a 16px, tra 360 e 640 a 18px. flex-nowrap col ! per
              vincere sul flex-wrap:wrap di .wordmark (globals.css e fuori dai
              layer, quindi batte le utility normali): senza, su schermi
              stretti "Anna Shop" andava a capo sotto il sigillo. */}
          <Link href="/" aria-label="Anna Shop — vai alla home" className="group">
            <Wordmark className="flex-nowrap! text-base min-[360px]:text-lg sm:text-2xl" />
          </Link>
        </div>

        <nav
          className="flex items-center gap-1 sm:gap-2"
          aria-label="Navigazione principale"
        >
          <Link
            href="/"
            className="hidden rounded-full px-3 py-2 font-display text-base font-semibold text-foreground transition-colors hover:text-sea pointer-fine:lg:inline-flex"
          >
            Vetrina
          </Link>

          {/* Catalogo completo: unico punto della nav che porta a /prodotti
              (dove vive anche la ricerca della toolbar). */}
          <Link
            href="/prodotti"
            className="hidden rounded-full px-3 py-2 font-display text-base font-semibold text-foreground transition-colors hover:text-sea pointer-fine:lg:inline-flex"
          >
            Tutti i prodotti
          </Link>

          {/* Menu categorie: inline solo con puntatore fine E da lg in su
              (pointer-fine:lg:, media query annidate come l'hamburger in
              MenuMobile). Sotto lg le categorie vivono nell'hamburger
              (MenuMobile), cosi con molte radici la riga header non sfonda ne
              spinge fuori le icone carrello/preferiti. Su touch >=lg (iPad
              landscape) il dropdown hover non si aprirebbe (hover: in
              Tailwind v4 è sotto @media (hover:hover)) e l'hamburger resta
              visibile: la nav inline sparisce del tutto e l'header rimane
              quello mobile, che entra sempre; figlie e nipoti si raggiungono
              dal drawer. */}
          {gruppi.map(({ radice, figlie }) => (
            <div
              key={radice.id}
              className="group relative hidden pointer-fine:lg:block"
            >
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
                    className="h-3.5 w-3.5 text-muted transition-transform duration-200 group-hover:rotate-180 group-hover:text-sea group-has-[:focus-visible]:rotate-180 group-has-[:focus-visible]:text-sea"
                    aria-hidden="true"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                )}
              </Link>

              {figlie.length > 0 && (
                // pt-2 senza gap reale: il puntatore non "cade" tra trigger e
                // pannello. Visibile su hover del gruppo o focus DA TASTIERA
                // interno (:focus-visible via :has). NON usiamo focus-within: il
                // click del mouse lascia il focus sul trigger <Link> e terrebbe
                // il pannello aperto, cosi passando col mouse su un'altra voce se
                // ne aprivano due insieme.
                <div className="invisible absolute left-0 top-full z-30 pt-2 opacity-0 transition-all duration-150 group-has-[:focus-visible]:visible group-has-[:focus-visible]:opacity-100 group-hover:visible group-hover:opacity-100">
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

          {/* Account: ospite -> login; loggato -> avatar a iniziali con
              dropdown CSS-only su desktop (stesso pattern del menu categorie:
              hover o focus da tastiera via :has(:focus-visible)); su touch
              (anche iPad >=lg, dove l'hover non scatta) il tap porta
              direttamente a /account, da cui si raggiunge il logout. Nessun
              chevron qui, quindi niente da nascondere su pointer-coarse. */}
          {cliente ? (
            <div className="group relative">
              <Link
                href="/account"
                aria-label="Il tuo account"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface transition duration-200 hover:-translate-y-0.5 hover:bg-surface-2 active:scale-95 sm:h-11 sm:w-11"
              >
                <AvatarCliente
                  nome={cliente.nome}
                  email={cliente.email}
                  dimensione="sm"
                />
              </Link>
              <div className="invisible absolute right-0 top-full z-30 hidden pt-2 opacity-0 transition-all duration-150 group-has-[:focus-visible]:visible group-has-[:focus-visible]:opacity-100 group-hover:visible group-hover:opacity-100 lg:block">
                <div className="min-w-52 rounded-2xl bg-white p-2 shadow-soft ring-1 ring-line">
                  <p className="truncate px-3.5 py-2 text-xs text-muted">
                    Ciao, {cliente.nome ?? cliente.email}
                  </p>
                  <Link
                    href="/account"
                    className="block rounded-xl px-3.5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface hover:text-sea"
                  >
                    Il mio account
                  </Link>
                  <Link
                    href="/account/ordini"
                    className="block rounded-xl px-3.5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface hover:text-sea"
                  >
                    I miei ordini
                  </Link>
                  <Link
                    href="/account/indirizzi"
                    className="block rounded-xl px-3.5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface hover:text-sea"
                  >
                    I miei indirizzi
                  </Link>
                  <form
                    action={logoutClienteAction}
                    className="mt-1 border-t border-line pt-1"
                  >
                    <button
                      type="submit"
                      className="block w-full rounded-xl px-3.5 py-2.5 text-left text-sm font-bold text-coral-ink transition-colors hover:bg-coral/10"
                    >
                      Esci
                    </button>
                  </form>
                </div>
              </div>
            </div>
          ) : (
            <Link
              href="/accedi"
              aria-label="Accedi o registrati"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface text-foreground transition duration-200 hover:-translate-y-0.5 hover:bg-surface-2 active:scale-95 sm:h-11 sm:w-11"
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
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </Link>
          )}

          {/* Preferiti: cuore con badge, stessi codici visivi del carrello. */}
          <Link
            href="/preferiti"
            aria-label="I tuoi preferiti"
            className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface text-foreground transition duration-200 hover:-translate-y-0.5 hover:bg-surface-2 active:scale-95 sm:h-11 sm:w-11"
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
              <path d="M12 20.7S4.6 16 2.8 11.6C1.5 8.6 3.2 5.3 6.4 4.9c2-.3 3.8.7 4.7 2.2h1.8c.9-1.5 2.7-2.5 4.7-2.2 3.2.4 4.9 3.7 3.6 6.7C19.4 16 12 20.7 12 20.7Z" />
            </svg>
            <PreferitiBadge />
          </Link>

          {/* Carrello: icon-btn tondo (tap target 40px, 44 da sm) con badge
              corallo. shrink-0 su tutti i tondi: senza, su schermi stretti il
              flex li schiacciava a ovali. */}
          <Link
            href="/carrello"
            aria-label="Carrello"
            className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface text-foreground transition duration-200 hover:-translate-y-0.5 hover:bg-surface-2 active:scale-95 sm:h-11 sm:w-11"
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
