import Link from "next/link";

// 404 della vetrina pubblica: sostituisce la pagina di default (in inglese, senza
// header ne link) di Next. Vive nel route group (vetrina), quindi eredita Header
// e Footer dal layout del gruppo. La invoca `notFound()` da PDP e categorie
// (slug inesistente, prodotto ritirato) e ogni URL pubblico non trovato.
export default function NonTrovato() {
  return (
    // <div>, non <main>: il landmark main lo mette gia il layout della vetrina
    // (id="contenuto") — un secondo <main> annidato confonde gli screen reader.
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center gap-6 px-4 py-20 text-center sm:py-28">
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
    </div>
  );
}
