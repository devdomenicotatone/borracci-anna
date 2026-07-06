import { requireGestore } from "@/lib/gestore/auth";
import { caricaCategorie } from "@/lib/categorie";
import { leggiSezioniAdmin, type VetrinaSezioneAdmin } from "@/lib/gestore/vetrina";
import GestoreVetrina from "@/components/gestore/GestoreVetrina";
import type { Prodotto } from "@/lib/types";

// Pagina "Vetrina": compone la home a fasce (sezioni ordinabili + prodotti
// scelti a mano). Dipende da dati DB del gestore: niente prerender statico.
export const dynamic = "force-dynamic";

export default async function VetrinaPage() {
  const { supabase } = await requireGestore();

  const [categorie, prodRes] = await Promise.all([
    caricaCategorie(supabase),
    // Catalogo completo per il selettore "aggiungi prodotto" (ricerca locale:
    // il catalogo boutique e piccolo). Anche i non attivi, cosi il gestore vede
    // e gestisce i pinnati messi in bozza.
    supabase
      .from("prodotti")
      .select("id, slug, nome, immagine_url, prezzo_cents, valuta, attivo")
      .order("nome", { ascending: true }),
  ]);

  // La tabella potrebbe non esistere se la migration non e ancora applicata:
  // in tal caso la pagina rende comunque, con l'elenco vuoto.
  let sezioni: VetrinaSezioneAdmin[] = [];
  try {
    sezioni = await leggiSezioniAdmin(supabase);
  } catch {
    sezioni = [];
  }

  const prodotti = (prodRes.data as Prodotto[] | null) ?? [];

  return (
    <div className="mx-auto max-w-xl pb-24 lg:max-w-4xl">
      <h1 className="mb-1 text-xl font-semibold text-foreground">Vetrina</h1>
      <p className="mb-6 text-sm text-muted">
        Componi la home: aggiungi e riordina le fasce con un trascinamento.
        Scegli i prodotti a mano o lasciali riempire in automatico. Le modifiche
        vanno subito online.
      </p>
      <GestoreVetrina
        sezioniIniziali={sezioni}
        categorie={categorie}
        prodotti={prodotti}
      />
    </div>
  );
}
