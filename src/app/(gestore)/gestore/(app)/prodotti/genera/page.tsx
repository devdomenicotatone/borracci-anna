import { requireGestore } from "@/lib/gestore/auth";
import GeneraDaFoto from "@/components/gestore/GeneraDaFoto";
import { caricaCategorie } from "@/lib/categorie";

// La generazione AI (vision) puo durare alcune decine di secondi: alziamo il
// limite della funzione serverless (la Server Action gira in questa route).
export const maxDuration = 60;

export default async function GeneraSchedaPage() {
  const { supabase } = await requireGestore();
  const categorie = await caricaCategorie(supabase);

  return (
    <div>
      <h1 className="mx-auto mb-1 max-w-xl text-xl font-semibold text-foreground lg:max-w-4xl">
        ✨ Genera scheda da foto
      </h1>
      <p className="mx-auto mb-6 max-w-xl text-sm text-muted lg:max-w-4xl">
        Carica le foto del prodotto (anche in piu colori) e dell&apos;etichetta:
        l&apos;AI compila una bozza con descrizione, composizione, lavaggio e
        varianti colore. La rivedi e la crei.
      </p>
      <GeneraDaFoto categorie={categorie} />
    </div>
  );
}
