import { requireGestore } from "@/lib/gestore/auth";
import { caricaCategorie } from "@/lib/categorie";
import ImportaDaUrl from "@/components/gestore/ImportaDaUrl";

// L'analisi (download dal fornitore + riscrittura della descrizione) puo
// durare decine di secondi: alziamo il limite della funzione serverless
// (le Server Action di import girano in questa route).
export const maxDuration = 60;

export default async function ImportaProdottoPage() {
  const { supabase } = await requireGestore();
  const categorie = await caricaCategorie(supabase);

  return (
    <div>
      <h1 className="mx-auto mb-1 max-w-xl text-xl font-semibold text-foreground lg:max-w-4xl">
        📦 Importa da fornitore
      </h1>
      <p className="mx-auto mb-6 max-w-xl text-sm text-muted lg:max-w-4xl">
        Incolla l&apos;indirizzo di un prodotto Ingrosso BLT oppure di
        un&apos;intera categoria: prepariamo le schede con foto, prezzo, taglie
        e descrizione. Scegli tu se rivederle una a una o importarle in
        automatico; niente va in vendita senza il tuo ok.
      </p>
      <ImportaDaUrl categorie={categorie} />
    </div>
  );
}
