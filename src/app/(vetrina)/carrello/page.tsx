// Pagina del carrello (Server Component).
// Legge le righe dal DB tramite la Server Action leggiCarrello() — che degrada
// a [] se Supabase non e configurato — e mostra il riepilogo con il totale.
// force-dynamic: dipende dai cookie (cart_id) e dal DB, niente prerender statico.

import Link from "next/link";

import CartItem, { CheckoutButton } from "@/components/CartItem";
import { leggiCarrello } from "@/lib/cart";
import { formatPrezzo } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Carrello · by Frody",
};

export default async function CarrelloPage() {
  const righe = await leggiCarrello();

  const totaleCents = righe.reduce(
    (acc, riga) => acc + riga.prodotto.prezzo_cents * riga.quantita,
    0,
  );
  const totaleArticoli = righe.reduce((acc, riga) => acc + riga.quantita, 0);
  // La valuta del totale segue quella della prima riga (tutto in EUR per ora).
  const valuta = righe[0]?.prodotto.valuta ?? "EUR";

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Il tuo carrello
      </h1>

      {righe.length === 0 ? (
        <StatoVuoto />
      ) : (
        <div className="mt-8">
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {righe.map((riga) => (
              <CartItem key={riga.id} riga={riga} />
            ))}
          </ul>

          {/* Riepilogo */}
          <div className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
            <div className="flex items-center justify-between text-base">
              <span className="text-zinc-600 dark:text-zinc-400">
                Totale{" "}
                <span className="text-sm">
                  ({totaleArticoli}{" "}
                  {totaleArticoli === 1 ? "articolo" : "articoli"})
                </span>
              </span>
              <span className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                {formatPrezzo(totaleCents, valuta)}
              </span>
            </div>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Spedizione e imposte calcolate al pagamento.
            </p>

            <div className="mt-6">
              <CheckoutButton />
            </div>

            <div className="mt-4 text-center">
              <Link
                href="/"
                className="text-sm font-medium text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400"
              >
                Continua lo shopping
              </Link>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/** Stato vuoto curato quando non ci sono righe nel carrello. */
function StatoVuoto() {
  return (
    <div className="mt-12 flex flex-col items-center gap-4 rounded-2xl border border-dashed border-zinc-200 py-16 text-center dark:border-zinc-800">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 text-2xl dark:bg-zinc-900">
        🛍️
      </div>
      <div>
        <p className="font-medium text-zinc-900 dark:text-zinc-50">
          Il carrello e vuoto
        </p>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Non hai ancora aggiunto nessun articolo.
        </p>
      </div>
      <Link
        href="/"
        className="mt-2 flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-colors hover:opacity-90"
      >
        Scopri i prodotti
      </Link>
    </div>
  );
}
