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
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-foreground">
        Il tuo carrello
      </h1>

      {righe.length === 0 ? (
        <StatoVuoto />
      ) : (
        <div className="mt-8">
          <ul className="divide-y divide-line">
            {righe.map((riga) => (
              <CartItem key={riga.id} riga={riga} />
            ))}
          </ul>

          {/* Riepilogo */}
          <div className="mt-8 rounded-3xl bg-surface p-6 shadow-soft ring-1 ring-line">
            <div className="flex items-center justify-between text-base">
              <span className="text-muted">
                Totale{" "}
                <span className="text-sm">
                  ({totaleArticoli}{" "}
                  {totaleArticoli === 1 ? "articolo" : "articoli"})
                </span>
              </span>
              <span className="font-display text-2xl font-extrabold text-sea">
                {formatPrezzo(totaleCents, valuta)}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted">
              Spedizione e imposte calcolate al pagamento.
            </p>

            <div className="mt-6">
              <CheckoutButton />
            </div>

            <div className="mt-4 text-center">
              <Link
                href="/"
                className="text-sm font-medium text-sea underline-offset-2 transition-colors hover:text-lagoon hover:underline"
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
    <div className="mt-12 flex flex-col items-center gap-4 rounded-3xl bg-surface py-16 text-center shadow-soft ring-1 ring-line">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 text-3xl">
        🏖️
      </div>
      <div>
        <p className="font-display text-lg font-bold text-foreground">
          Il carrello e vuoto
        </p>
        <p className="mt-1 text-sm text-muted">
          Non hai ancora aggiunto nessun articolo. Tuffati nella collezione!
        </p>
      </div>
      <Link
        href="/"
        className="mt-2 flex h-11 items-center justify-center rounded-full bg-coral px-6 font-display font-bold text-white shadow-coral transition-transform hover:-translate-y-0.5"
      >
        Scopri i prodotti
      </Link>
    </div>
  );
}
