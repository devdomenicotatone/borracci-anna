import { requireGestore } from "@/lib/gestore/auth";
import { createAdminSupabase } from "@/lib/supabase/admin";
import ListaOrdini, {
  type OrdineGestore,
} from "@/components/gestore/ListaOrdini";

// Pannello ordini del gestore. requireGestore() fa da barriera auth; i dati
// arrivano via admin client (ordini non hanno policy anon).
export const dynamic = "force-dynamic";

export default async function OrdiniPage() {
  await requireGestore();

  const admin = createAdminSupabase();
  const { data } = await admin
    .from("ordini")
    .select(
      "id, stato, totale_cents, costo_spedizione_cents, nome, email, telefono, note, token, confermato_il, creato_il, ordine_righe(id, nome_prodotto, taglia, colore, prezzo_cents, quantita, immagine_url, rimossa_il, rimossa_motivo)",
    )
    .order("creato_il", { ascending: false })
    .limit(200);

  const ordini = (data as OrdineGestore[] | null) ?? [];
  return <ListaOrdini ordini={ordini} />;
}
