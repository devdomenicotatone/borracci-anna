// Pagina di esito annullato del checkout.
// Mostrata quando l'utente abbandona Stripe Checkout (cancel_url).
// Il carrello resta intatto, cosi puo riprovare il pagamento.

import Link from "next/link";

export const metadata = {
  title: "Pagamento annullato · by Frody",
};

export default function CheckoutAnnullatoPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-10 text-center shadow-sm">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full border border-line text-2xl text-muted">
          ×
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Pagamento annullato
        </h1>
        <p className="mt-3 text-base leading-7 text-muted">
          Non e stato addebitato nulla. Il tuo carrello e ancora qui: puoi
          completare l&apos;acquisto quando vuoi.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/carrello"
            className="inline-flex h-12 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            Torna al carrello
          </Link>
          <Link
            href="/"
            className="inline-flex h-12 items-center justify-center rounded-full border border-line px-6 text-sm font-medium text-foreground transition-colors hover:bg-black/[.04]"
          >
            Continua lo shopping
          </Link>
        </div>
      </div>
    </main>
  );
}
