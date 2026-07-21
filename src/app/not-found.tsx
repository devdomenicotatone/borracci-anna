import type { Metadata } from "next";
import Link from "next/link";

// 404 di RADICE: e' l'unica che Next usa per gli URL che non corrispondono a
// NESSUNA route (la not-found dentro (vetrina) scatta solo per i notFound()
// delle sue pagine: PDP/categoria inesistenti). Senza questo file gli URL
// sbagliati ricevevano la 404 di default di Next, in inglese dentro
// <html lang="it"> e senza alcun link di uscita (audit a11y 2026-07, WCAG
// 3.1.1). Qui non c'e' il layout vetrina, quindi niente Header/Footer e il
// <main> va dichiarato (non e' un annidamento: il root layout non ne ha).
export const metadata: Metadata = { title: "Pagina non trovata" };

export default function NonTrovatoRadice() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center gap-6 px-4 py-20 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-surface-2 text-4xl">
        🏖️
      </div>
      <div>
        <p className="font-display text-sm font-bold uppercase tracking-wide text-sea">
          Errore 404
        </p>
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-foreground">
          Pagina non trovata
        </h1>
        <p className="mt-3 leading-relaxed text-muted">
          La pagina che cerchi non esiste o l&apos;articolo non è più
          disponibile. Può capitare con un link vecchio o un prodotto ritirato
          dalla collezione.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="flex h-12 items-center justify-center rounded-full bg-coral-ink px-6 font-display font-bold text-white shadow-coral transition-transform hover:-translate-y-0.5"
        >
          Torna alla vetrina
        </Link>
        <Link
          href="/prodotti"
          className="flex h-12 items-center justify-center rounded-full bg-white px-6 font-display font-bold text-sea ring-2 ring-surface-2 transition-colors hover:bg-surface"
        >
          Sfoglia tutti i prodotti
        </Link>
      </div>
    </main>
  );
}
