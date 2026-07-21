// Pagina di esito annullato del checkout.
// Mostrata quando l'utente abbandona Stripe Checkout (cancel_url).
// Il carrello resta intatto, cosi puo riprovare il pagamento.

import Link from "next/link";

export const metadata = {
  title: "Pagamento annullato",
  // noindex crawlabile (vedi carrello/page.tsx).
  robots: { index: false, follow: false },
};

export default function CheckoutAnnullatoPage() {
  return (
    // <div>, non <main>: il landmark main lo mette gia il layout della vetrina
    // (id="contenuto") — un secondo <main> annidato confonde gli screen reader.
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <div className="w-full max-w-md rounded-3xl bg-surface p-10 text-center shadow-soft ring-1 ring-line">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 text-lagoon ring-2 ring-line">
          <svg
            className="h-8 w-8"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground">
          Pagamento annullato
        </h1>
        <p className="mt-3 text-base leading-7 text-muted">
          Non è stato addebitato nulla. Il tuo carrello è ancora qui: puoi
          completare l&apos;acquisto quando vuoi.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/carrello"
            className="inline-flex h-12 items-center justify-center rounded-full bg-sea px-6 font-display font-bold text-white shadow-sea transition-transform hover:-translate-y-0.5"
          >
            Torna al carrello
          </Link>
          <Link
            href="/"
            className="inline-flex h-12 items-center justify-center rounded-full bg-white px-6 font-display font-bold text-sea ring-2 ring-sea transition-colors hover:bg-surface"
          >
            Continua lo shopping
          </Link>
        </div>
      </div>
    </div>
  );
}
