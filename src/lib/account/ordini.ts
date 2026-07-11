// Letture dello storico ordini del cliente. Client di sessione (anon key +
// cookie): le policy RLS "ordini_select_proprio"/"ordine_righe_select_proprio"
// garantiscono che si leggano SOLO i propri ordini — anche se un id altrui
// arrivasse dall'URL, la select non lo troverebbe.

import "server-only";

import type { SessioneCliente } from "@/lib/account/auth";
import type { OrdineDettaglioUI, RigaOrdineUI } from "@/lib/ordini-ui";
import { isStatoOrdine, type IndirizzoSpedizione, type StatoOrdine } from "@/lib/types";

/** Riepilogo di un ordine per la lista (card). */
export interface OrdineLista {
  id: string;
  stato: StatoOrdine;
  numero: number | null;
  totale_cents: number;
  creato_il: string;
  /** Somma delle quantita delle righe attive. */
  numArticoli: number;
  /** Miniature delle prime righe attive (max 3) + eccedenza. */
  miniature: (string | null)[];
  altriArticoli: number;
}

/** Dettaglio ordine per /account/ordini/[id]: righe + spedizione + token. */
export interface OrdineClienteDettaglio extends OrdineDettaglioUI {
  token: string | null;
  telefono: string | null;
  confermato_il: string | null;
  spedizione_indirizzo: IndirizzoSpedizione | null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Storico paginato (piu recenti prima). */
export async function leggiOrdiniCliente(
  sessione: SessioneCliente,
  pagina = 1,
  perPagina = 10,
): Promise<{ ordini: OrdineLista[]; totale: number }> {
  const da = (Math.max(1, pagina) - 1) * perPagina;
  const { data, count, error } = await sessione.supabase
    .from("ordini")
    .select(
      "id, stato, numero, totale_cents, creato_il, ordine_righe(quantita, immagine_url, rimossa_il)",
      { count: "exact" },
    )
    .order("creato_il", { ascending: false })
    .range(da, da + perPagina - 1);
  if (error || !data) {
    // Una pagina oltre il totale (PostgREST PGRST103) restituisce error + data
    // null SENZA count: ritornare totale 0 mostrerebbe il falso empty state
    // "Non hai ancora ordini". Recuperiamo il totale reale cosi il chiamante
    // puo riportare l'utente a una pagina valida.
    const { count: totaleReale } = await sessione.supabase
      .from("ordini")
      .select("id", { count: "exact", head: true });
    return { ordini: [], totale: totaleReale ?? 0 };
  }

  const ordini: OrdineLista[] = [];
  for (const o of data) {
    if (!isStatoOrdine(o.stato)) continue;
    const righe = (o.ordine_righe ?? []) as {
      quantita: number;
      immagine_url: string | null;
      rimossa_il: string | null;
    }[];
    const attive = righe.filter((r) => !r.rimossa_il);
    ordini.push({
      id: o.id,
      stato: o.stato,
      numero: o.numero,
      totale_cents: o.totale_cents,
      creato_il: o.creato_il,
      numArticoli: attive.reduce((acc, r) => acc + r.quantita, 0),
      miniature: attive.slice(0, 3).map((r) => r.immagine_url),
      altriArticoli: Math.max(0, attive.length - 3),
    });
  }
  return { ordini, totale: count ?? ordini.length };
}

/** Un ordine del cliente, o null se inesistente/di altri (RLS). */
export async function leggiOrdineCliente(
  sessione: SessioneCliente,
  id: string,
): Promise<OrdineClienteDettaglio | null> {
  // Un id non-uuid farebbe fallire il cast Postgres: not found diretto.
  if (!UUID_RE.test(id)) return null;

  const { data, error } = await sessione.supabase
    .from("ordini")
    .select(
      "id, stato, numero, totale_cents, costo_spedizione_cents, nome, email, telefono, token, confermato_il, spedizione_indirizzo, creato_il, ordine_righe(id, nome_prodotto, taglia, colore, prezzo_cents, quantita, immagine_url, rimossa_il, rimossa_motivo)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !data || !isStatoOrdine(data.stato)) return null;

  return {
    id: data.id,
    stato: data.stato,
    numero: data.numero,
    totale_cents: data.totale_cents,
    costo_spedizione_cents: data.costo_spedizione_cents,
    nome: data.nome,
    email: data.email,
    telefono: data.telefono,
    token: data.token,
    confermato_il: data.confermato_il,
    spedizione_indirizzo:
      (data.spedizione_indirizzo as IndirizzoSpedizione | null) ?? null,
    creato_il: data.creato_il,
    righe: (data.ordine_righe as RigaOrdineUI[] | null) ?? [],
  };
}
