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
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-10 text-center shadow-sm">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-2xl text-background">
          ✓
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Grazie per il tuo ordine
        </h1>
        <p className="mt-3 text-base leading-7 text-muted">
          Il pagamento e andato a buon fine. Riceverai a breve una email di
          conferma con il riepilogo dell&apos;ordine.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex h-12 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          Torna alla vetrina
        </Link>
      </div>
    </main>
  );
}
