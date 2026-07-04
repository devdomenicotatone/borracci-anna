import { requireGestore } from "@/lib/gestore/auth";
import ImportaDaUrl from "@/components/gestore/ImportaDaUrl";

// L'analisi (download dal fornitore + riscrittura della descrizione) puo
// durare decine di secondi: alziamo il limite della funzione serverless
// (le Server Action di import girano in questa route).
export const maxDuration = 60;

export default async function ImportaProdottoPage() {
  await requireGestore();

  return (
    <div>
      <h1 className="mx-auto mb-1 max-w-xl text-xl font-semibold text-foreground lg:max-w-4xl">
        📦 Importa da fornitore
      </h1>
      <p className="mx-auto mb-6 max-w-xl text-sm text-muted lg:max-w-4xl">
        Incolla l&apos;indirizzo di un prodotto Ingrosso BLT: prepariamo una
        bozza con foto, prezzo, taglie e descrizione. La rivedi, la crei e la
        pubblichi dalla scheda: niente va in vendita da solo.
      </p>
      <ImportaDaUrl />
    </div>
  );
}
