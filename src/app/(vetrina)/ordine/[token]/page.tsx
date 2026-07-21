// Pagina pubblica di stato/pagamento di un ordine: /ordine/[token].
// Il token (UUID imprevedibile) e l'unica chiave d'accesso: lettura server-side
// con admin client (gli ordini non hanno policy anon). Mostra lo stato e, se
// confermato, il bottone "Paga ora".
//
// Articoli e totali sono renderizzati da DettaglioOrdine, condiviso con l'area
// utente (/account/ordini/[id]): qui resta solo l'hero con i testi per stato.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import PulsantePaga from "@/components/prodotto/PulsantePaga";
import AttesaPagamento from "@/components/ordini/AttesaPagamento";
import BadgeStatoOrdine from "@/components/ordini/BadgeStatoOrdine";
import DettaglioOrdine from "@/components/ordini/DettaglioOrdine";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { formatDataLunga } from "@/lib/format";
import {
  etichettaNumeroOrdine,
  type OrdineDettaglioUI,
  type RigaOrdineUI,
} from "@/lib/ordini-ui";
import { isStatoOrdine, type StatoOrdine } from "@/lib/types";

export const dynamic = "force-dynamic";

// Pagina gated da token con PII dell'ordine: mai indicizzata. Il title
// (WCAG 2.4.2) resta generico: niente numero ordine o dati personali.
export const metadata: Metadata = {
  title: "Il tuo ordine",
  robots: { index: false, follow: false },
};

async function caricaOrdine(token: string): Promise<OrdineDettaglioUI | null> {
  try {
    const admin = createAdminSupabase();
    const { data, error } = await admin
      .from("ordini")
      .select(
        "id, stato, numero, totale_cents, costo_spedizione_cents, nome, email, creato_il, ordine_righe(id, nome_prodotto, taglia, colore, prezzo_cents, quantita, immagine_url, rimossa_il, rimossa_motivo)",
      )
      .eq("token", token)
      .maybeSingle();
    // Narrow runtime di `stato` (dal DB arriva come string): uno stato ignoto
    // -> trattato come ordine non trovato, niente STATO_UI[undefined].
    if (error || !data || !isStatoOrdine(data.stato)) return null;
    return {
      id: data.id,
      stato: data.stato,
      numero: data.numero,
      totale_cents: data.totale_cents,
      costo_spedizione_cents: data.costo_spedizione_cents,
      nome: data.nome,
      email: data.email,
      creato_il: data.creato_il,
      righe: (data.ordine_righe as RigaOrdineUI[] | null) ?? [],
    };
  } catch {
    return null;
  }
}

// Titolo e testo dell'hero per stato (i chip vivono in STATO_ORDINE_UI).
const STATO_UI: Record<StatoOrdine, { titolo: string; testo: string }> = {
  in_attesa: {
    titolo: "Richiesta ricevuta",
    testo:
      "Stiamo verificando la disponibilità di tutti gli articoli. Ti ricontattiamo a breve: appena confermiamo potrai pagare da questa pagina.",
  },
  confermato: {
    titolo: "Disponibile!",
    testo:
      "Abbiamo confermato la disponibilità. Completa il pagamento in sicurezza con Stripe per finalizzare l'ordine.",
  },
  pagato: {
    titolo: "Ordine pagato",
    testo:
      "Grazie! Abbiamo ricevuto il pagamento. Ti contatteremo per la consegna o il ritiro.",
  },
  annullato: {
    titolo: "Richiesta annullata",
    testo:
      "Questa richiesta è stata annullata. Se pensi sia un errore, scrivici pure: troviamo una soluzione.",
  },
};

export default async function PaginaOrdine({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ pagato?: string }>;
}) {
  const { token } = await params;
  const { pagato } = await searchParams;
  const ordine = await caricaOrdine(token);
  if (!ordine) notFound();

  const ui = STATO_UI[ordine.stato];
  // Reduce dal pagamento Stripe: il webhook potrebbe non aver ancora aggiornato.
  const inElaborazione = pagato === "1" && ordine.stato !== "pagato";

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:px-6">
      <p className="font-display text-sm font-bold uppercase tracking-wide text-sea">
        Il tuo ordine
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-foreground">
          {ui.titolo}
        </h1>
        <BadgeStatoOrdine stato={ordine.stato} />
      </div>
      <p className="mt-1 text-sm text-muted">
        {etichettaNumeroOrdine(ordine)} · {formatDataLunga(ordine.creato_il)}
      </p>

      {/* Live region SEMPRE montata (WCAG 4.1.3): quando il polling di
          AttesaPagamento porta l'ordine a "pagato" (o al fallback "scaduto"),
          il refresh sostituisce i figli di questo div; solo una regione live
          gia presente nel DOM fa annunciare il nuovo testo di stato agli
          screen reader. */}
      <div aria-live="polite">
        {inElaborazione ? (
          // Polling client-side: router.refresh() periodico finche il webhook
          // non registra il pagamento (poi il componente non viene piu montato).
          <AttesaPagamento />
        ) : (
          <p className="mt-4 max-w-prose leading-relaxed text-muted">
            {ui.testo}
          </p>
        )}
      </div>

      {/* "Paga ora" nascosto mentre un pagamento e in elaborazione (ritorno da
          Stripe con webhook ancora in ritardo): evita che un secondo clic apra
          una nuova sessione mentre la prima e gia stata pagata. */}
      {ordine.stato === "confermato" && !inElaborazione && (
        <div className="mt-6">
          <PulsantePaga token={token} />
        </div>
      )}

      <DettaglioOrdine ordine={ordine} />

      <div className="mt-6 text-center">
        <Link
          href="/"
          className="text-sm font-medium text-sea underline underline-offset-2 transition-colors hover:text-lagoon-ink"
        >
          Torna alla vetrina
        </Link>
      </div>
    </main>
  );
}
