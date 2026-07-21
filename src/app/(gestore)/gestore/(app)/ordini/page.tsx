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
      "id, stato, totale_cents, costo_spedizione_cents, nome, email, telefono, note, token, confermato_il, creato_il, stock_mancante, ordine_righe(id, nome_prodotto, taglia, colore, prezzo_cents, quantita, immagine_url, rimossa_il, rimossa_motivo)",
    )
    .order("creato_il", { ascending: false })
    .limit(200);

  const ordini = (data as OrdineGestore[] | null) ?? [];

  // Esito email di conferma (M11): query SEPARATA e protetta, cosi il pannello
  // non dipende dalla migration 20260721120000 — se le colonne non esistono
  // ancora fallisce solo questa lettura e nessun badge viene mostrato. I pagati
  // piu recenti (limit 200, stesso ordinamento) coprono tutti i pagati della
  // lista principale, che e a sua volta un limit 200 su tutti gli stati.
  try {
    const { data: flags, error } = await admin
      .from("ordini")
      .select("id, email_conferma_inviata")
      .eq("stato", "pagato")
      .order("creato_il", { ascending: false })
      .limit(200);
    if (!error && flags) {
      const perId = new Map(
        flags.map((f) => [f.id, f.email_conferma_inviata] as const),
      );
      for (const o of ordini) {
        o.email_conferma_inviata = perId.get(o.id) ?? null;
      }
    }
  } catch {
    // Colonne non ancora migrate o lettura fallita: semplicemente niente badge.
  }

  return <ListaOrdini ordini={ordini} />;
}
