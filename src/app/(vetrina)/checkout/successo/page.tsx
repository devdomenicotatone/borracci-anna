// Pagina di esito positivo del checkout.
// Mostrata quando Stripe reindirizza al success_url dopo il pagamento.
// L'ordine viene confermato in modo affidabile dal webhook, non da questa pagina.

import Link from "next/link";

export const metadata = {
  title: "Ordine confermato · by Frody",
};

export default function CheckoutSuccessoPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <div className="w-full max-w-md rounded-3xl bg-surface p-10 text-center shadow-soft ring-1 ring-line">
        <div className="bg-sea-gradient mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full text-white shadow-sea">
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
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground">
          Grazie per il tuo ordine
        </h1>
        <p className="mt-3 text-base leading-7 text-muted">
          Il pagamento e andato a buon fine. Riceverai a breve una email di
          conferma con il riepilogo dell&apos;ordine.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex h-12 items-center justify-center rounded-full bg-coral px-6 font-display font-bold text-white shadow-coral transition-transform hover:-translate-y-0.5"
        >
          Torna alla vetrina
        </Link>
      </div>
    </main>
  );
}
