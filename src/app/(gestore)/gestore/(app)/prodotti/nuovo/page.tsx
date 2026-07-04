import { requireGestore } from "@/lib/gestore/auth";
import FormProdotto from "@/components/gestore/FormProdotto";
import { caricaCategorie } from "@/lib/categorie";

export default async function NuovoProdottoPage() {
  const { supabase } = await requireGestore();
  const categorie = await caricaCategorie(supabase);

  return (
    <div>
      <h1 className="mx-auto mb-5 max-w-xl text-xl font-semibold text-foreground lg:max-w-5xl">
        Nuovo prodotto
      </h1>
      <FormProdotto categorie={categorie} />
    </div>
  );
}
