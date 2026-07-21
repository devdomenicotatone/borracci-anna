"use client";

// Menu di navigazione mobile (hamburger nell'header): drawer da sinistra con
// la ricerca del catalogo, le pagine principali e l'albero categorie (macro +
// figlie e nipoti indentate). Resta disponibile anche da lg in su sui
// dispositivi senza puntatore fine (pointer-fine:lg:hidden): su iPad in
// landscape i dropdown hover-only dell'header non si aprono al tocco, quindi
// figlie e nipoti si raggiungono da qui.
// Stessa accessibilita dei drawer esistenti: dialog modale, ESC, overlay,
// scroll-lock, focus trap, focus ripristinato. Si chiude a ogni navigazione,
// anche quella esterna del back/forward del browser (usePathname); il tasto
// back col drawer aperto lo chiude invece di lasciare la pagina (entry
// fittizia in cronologia + popstate).

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";

import type { GruppoCategorie } from "@/lib/categorie-albero";
import { bloccaScrollBody } from "@/lib/scroll-lock";
import Wordmark from "@/components/Wordmark";
import AvatarCliente from "@/components/account/AvatarCliente";
import type { ClienteHeader } from "@/components/Header";

export default function MenuMobile({
  gruppi,
  cliente,
}: {
  gruppi: GruppoCategorie[];
  cliente: ClienteHeader | null;
}) {
  const [aperto, setAperto] = useState(false);
  const [ricerca, setRicerca] = useState("");
  const pannelloRef = useRef<HTMLDivElement>(null);
  const elementoPrecedenteRef = useRef<HTMLElement | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  // true finche la entry fittizia spinta in cronologia all'apertura non e
  // stata consumata (dal back dell'utente o dalla chiusura esplicita).
  const entryDaConsumareRef = useRef(false);

  // Chiusura esplicita (X, overlay, ESC): consuma con un back la entry
  // fittizia, cosi il prossimo back del browser esce davvero dalla pagina.
  const chiudi = useCallback(() => {
    setAperto(false);
    if (entryDaConsumareRef.current) {
      entryDaConsumareRef.current = false;
      window.history.back();
    }
  }, []);

  // Chiusura per navigazione (tap su un link o submit della ricerca): la
  // nuova route finisce in cronologia SOPRA la entry fittizia, quindi qui
  // niente back (annullerebbe la navigazione appena chiesta); la entry
  // residua e una copia della pagina di partenza e un eventuale back la
  // attraversa senza effetti visibili.
  const chiudiPerNavigazione = useCallback(() => {
    entryDaConsumareRef.current = false;
    setAperto(false);
  }, []);

  // Route cambiata per cause esterne (back/forward del browser, redirect):
  // il drawer non deve restare aperto sulla pagina nuova. Aggiustamento di
  // stato durante il render (pattern React "adjusting state when props
  // change") invece di un effect: niente setState sincrono post-commit, la
  // pagina nuova non vede mai il drawer aperto. Il flag della entry fittizia
  // viene azzerato dalla cleanup dell'effect qui sotto.
  const [pathnamePrecedente, setPathnamePrecedente] = useState(pathname);
  if (pathname !== pathnamePrecedente) {
    setPathnamePrecedente(pathname);
    setAperto(false);
  }

  // Entry fittizia in cronologia finche il drawer e aperto: il tasto back
  // (fisico o gesture) chiude il menu invece di lasciare la pagina. Next
  // integra pushState/popstate nativi nel router e l'URL resta invariato,
  // quindi nessuna navigazione reale.
  useEffect(() => {
    if (!aperto) return;

    window.history.pushState({ menuMobile: true }, "");
    entryDaConsumareRef.current = true;

    function onPopstate() {
      // Il back ha gia consumato la entry: il flag evita che la chiusura
      // esplicita ne faccia un secondo (= due pagine indietro).
      entryDaConsumareRef.current = false;
      setAperto(false);
    }

    window.addEventListener("popstate", onPopstate);
    return () => {
      window.removeEventListener("popstate", onPopstate);
      // Drawer chiuso (o componente smontato): nessuna entry da tracciare.
      // Copre la chiusura per navigazione esterna (usePathname qui sopra),
      // dove nessun handler azzera il flag. La chiusura esplicita non ne
      // risente: chiudi() legge il flag in modo sincrono, prima del commit.
      entryDaConsumareRef.current = false;
    };
  }, [aperto]);

  useEffect(() => {
    if (!aperto) return;

    elementoPrecedenteRef.current = document.activeElement as HTMLElement | null;
    const sbloccaScroll = bloccaScrollBody();

    const pannello = pannelloRef.current;
    const focusabili = () =>
      Array.from(
        pannello?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    focusabili()[0]?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        chiudi();
        return;
      }
      if (e.key === "Tab") {
        const items = focusabili();
        if (items.length === 0) return;
        const primo = items[0];
        const ultimo = items[items.length - 1];
        const attivo = document.activeElement;
        if (e.shiftKey && attivo === primo) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && attivo === ultimo) {
          e.preventDefault();
          primo.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      sbloccaScroll();
      elementoPrecedenteRef.current?.focus?.();
    };
  }, [aperto, chiudi]);

  return (
    <>
      {/* pointer-fine:lg:hidden (media query annidate: pointer fine E >=lg):
          da lg in su l'hamburger sparisce solo col mouse/trackpad, dove i
          dropdown hover dell'header funzionano; su touch puro resta l'unico
          accesso alle sotto-categorie. */}
      <button
        type="button"
        onClick={() => setAperto(true)}
        aria-label="Apri il menu"
        aria-haspopup="dialog"
        aria-expanded={aperto}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface text-foreground transition duration-200 hover:-translate-y-0.5 hover:bg-surface-2 active:scale-95 sm:h-11 sm:w-11 pointer-fine:lg:hidden"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      {/* Portal su <body>: l'header ha un backdrop-filter, che lo rende
          containing block per i figli position:fixed. Renderizzato inline, il
          drawer resterebbe intrappolato nei 64px dell'header invece di coprire
          il viewport. Il portal lo sgancia direttamente al body (come il
          CartDrawer, che vive gia fuori dall'header nel layout). */}
      {aperto &&
        createPortal(
          // Stessa condizione del bottone (pointer-fine:lg:hidden): senza, su
          // touch >=lg il drawer aperto resterebbe display:none.
          <div className="fixed inset-0 z-50 pointer-fine:lg:hidden">
            {/* Overlay */}
            <button
              type="button"
              aria-label="Chiudi il menu"
              onClick={chiudi}
              className="animate-fade-in absolute inset-0 cursor-default bg-foreground/40 backdrop-blur-[2px]"
            />

            {/* Pannello (da sinistra) */}
            <div
              ref={pannelloRef}
              role="dialog"
              aria-modal="true"
              aria-label="Menu di navigazione"
              className="animate-drawer-in-left absolute inset-y-0 left-0 flex w-full max-w-xs flex-col bg-background shadow-[0_0_60px_-15px_rgba(10,31,51,0.5)]"
            >
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <Wordmark className="text-xl" />
                <button
                  type="button"
                  onClick={chiudi}
                  aria-label="Chiudi"
                  className="grid h-10 w-10 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-foreground"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    className="h-5 w-5"
                    aria-hidden="true"
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <nav
                aria-label="Navigazione principale"
                className="flex-1 overflow-y-auto overscroll-contain px-3 py-4"
              >
                {/* Ricerca in testa: e l'unico accesso alla ricerca da tutte
                    le pagine (la toolbar vive solo nel catalogo); il submit
                    porta a /prodotti?q=. text-base (16px): sotto, iOS zooma
                    la pagina al focus del campo. */}
                <form
                  role="search"
                  className="mb-3 px-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const testo = ricerca.trim();
                    router.push(
                      testo
                        ? `/prodotti?q=${encodeURIComponent(testo)}`
                        : "/prodotti",
                    );
                    chiudiPerNavigazione();
                  }}
                >
                  <label className="relative block">
                    <span className="sr-only">Cerca nel catalogo</span>
                    <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-muted">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-5 w-5"
                        aria-hidden="true"
                      >
                        <circle cx="11" cy="11" r="7" />
                        <path d="m21 21-4.3-4.3" />
                      </svg>
                    </span>
                    <input
                      type="search"
                      value={ricerca}
                      onChange={(e) => setRicerca(e.target.value)}
                      enterKeyHint="search"
                      placeholder="Cerca un prodotto…"
                      aria-label="Cerca nel catalogo"
                      className="h-12 w-full rounded-full bg-white pl-12 pr-4 font-display text-base text-foreground ring-1 ring-line-strong outline-none transition-shadow placeholder:text-muted focus:ring-2 focus:ring-sea"
                    />
                  </label>
                </form>

                {/* Account: card del cliente loggato, o CTA di
                    accesso/registrazione per l'ospite. */}
                {cliente ? (
                  <div className="mb-3">
                    <Link
                      href="/account"
                      onClick={chiudiPerNavigazione}
                      className="flex items-center gap-3 rounded-2xl bg-surface p-4 transition-colors hover:bg-surface-2"
                    >
                      <AvatarCliente
                        nome={cliente.nome}
                        email={cliente.email}
                        dimensione="sm"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-sm font-bold text-foreground">
                          Ciao, {cliente.nome ?? cliente.email}
                        </span>
                        <span className="block text-xs text-muted">
                          Il mio account
                        </span>
                      </span>
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4 shrink-0 text-muted"
                        aria-hidden="true"
                      >
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </Link>
                    <div className="mt-1 flex gap-1">
                      <Link
                        href="/account/ordini"
                        onClick={chiudiPerNavigazione}
                        className="flex-1 rounded-xl px-4 py-2.5 text-center text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground"
                      >
                        I miei ordini
                      </Link>
                      <Link
                        href="/account/indirizzi"
                        onClick={chiudiPerNavigazione}
                        className="flex-1 rounded-xl px-4 py-2.5 text-center text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground"
                      >
                        I miei indirizzi
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="mb-3 grid grid-cols-2 gap-2 px-1">
                    <Link
                      href="/accedi"
                      onClick={chiudiPerNavigazione}
                      className="flex h-11 items-center justify-center rounded-full bg-sea font-display text-sm font-bold text-white shadow-sea transition-transform hover:-translate-y-0.5"
                    >
                      Accedi
                    </Link>
                    <Link
                      href="/registrati"
                      onClick={chiudiPerNavigazione}
                      className="flex h-11 items-center justify-center rounded-full font-display text-sm font-bold text-sea ring-2 ring-sea transition-colors hover:bg-sea/5"
                    >
                      Registrati
                    </Link>
                  </div>
                )}

                <Link
                  href="/"
                  onClick={chiudiPerNavigazione}
                  className="block rounded-2xl px-4 py-3 font-display text-base font-bold text-foreground transition-colors hover:bg-surface"
                >
                  Vetrina
                </Link>

                <Link
                  href="/prodotti"
                  onClick={chiudiPerNavigazione}
                  className="mt-1 block rounded-2xl px-4 py-3 font-display text-base font-bold text-foreground transition-colors hover:bg-surface"
                >
                  Tutti i prodotti
                </Link>

                {gruppi.map(({ radice, figlie }) => (
                  <div key={radice.id} className="mt-1">
                    <Link
                      href={`/categoria/${radice.slug}`}
                      onClick={chiudiPerNavigazione}
                      className="block rounded-2xl px-4 py-3 font-display text-base font-bold text-foreground transition-colors hover:bg-surface"
                    >
                      {radice.nome}
                    </Link>
                    {figlie.length > 0 && (
                      <div className="ml-4 border-l-2 border-surface-2 pl-1">
                        {figlie.map(({ figlia, nipoti }) => (
                          <div key={figlia.id}>
                            <Link
                              href={`/categoria/${figlia.slug}`}
                              onClick={chiudiPerNavigazione}
                              className="block rounded-xl px-4 py-2.5 text-[15px] font-medium text-muted transition-colors hover:bg-surface hover:text-foreground"
                            >
                              {figlia.nome}
                            </Link>
                            {nipoti.length > 0 && (
                              <div className="ml-4 border-l-2 border-surface-2 pl-1">
                                {nipoti.map((n) => (
                                  <Link
                                    key={n.id}
                                    href={`/categoria/${n.slug}`}
                                    onClick={chiudiPerNavigazione}
                                    className="block rounded-xl px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground"
                                  >
                                    {n.nome}
                                  </Link>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                <Link
                  href="/preferiti"
                  onClick={chiudiPerNavigazione}
                  className="mt-1 block rounded-2xl px-4 py-3 font-display text-base font-bold text-foreground transition-colors hover:bg-surface"
                >
                  I tuoi preferiti
                </Link>

                <Link
                  href="/vieni-a-trovarci"
                  onClick={chiudiPerNavigazione}
                  className="mt-1 block rounded-2xl px-4 py-3 font-display text-base font-bold text-foreground transition-colors hover:bg-surface"
                >
                  Vieni a trovarci
                </Link>
              </nav>

              <div className="border-t border-line bg-surface px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                <Link
                  href="/carrello"
                  onClick={chiudiPerNavigazione}
                  className="flex h-12 items-center justify-center rounded-full bg-sea font-display text-sm font-bold text-white shadow-sea transition-transform hover:-translate-y-0.5"
                >
                  Vai al carrello
                </Link>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
