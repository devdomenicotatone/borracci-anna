// Tipi e costanti UI condivisi per la presentazione degli ordini lato cliente.
// Usati sia dalla pagina pubblica /ordine/[token] (accesso ospite via token)
// sia dall'area utente /account/ordini: un'unica fonte per etichette e colori
// degli stati, cosi le due superfici non divergono.

import type { StatoOrdine } from "@/lib/types";

/** Riga d'ordine con i soli campi che servono alla UI cliente. */
export interface RigaOrdineUI {
  id: string;
  nome_prodotto: string;
  taglia: string | null;
  colore: string | null;
  prezzo_cents: number;
  quantita: number;
  immagine_url: string | null;
  rimossa_il: string | null;
  rimossa_motivo: string | null;
}

/** Ordine con righe embeddate, come lo consumano le pagine cliente. */
export interface OrdineDettaglioUI {
  id: string;
  stato: StatoOrdine;
  /** Numero ordine leggibile ("Ordine #1042"); null solo su righe pre-backfill. */
  numero: number | null;
  totale_cents: number;
  costo_spedizione_cents: number | null;
  nome: string | null;
  email: string | null;
  creato_il: string;
  righe: RigaOrdineUI[];
}

/** Chip di stato: etichetta + classi colore (palette pop-mare, contrasto AA). */
export const STATO_ORDINE_UI: Record<
  StatoOrdine,
  { chip: string; chipCls: string }
> = {
  in_attesa: { chip: "In attesa di conferma", chipCls: "bg-sun/30 text-sun-ink" },
  confermato: { chip: "Da pagare", chipCls: "bg-lagoon/15 text-lagoon-ink" },
  pagato: { chip: "Pagato", chipCls: "bg-sea/15 text-sea-ink" },
  annullato: { chip: "Annullato", chipCls: "bg-coral/15 text-coral-ink" },
};

/** Etichetta breve per l'intestazione ("Ordine #1042", fallback su uuid corto). */
export function etichettaNumeroOrdine(ordine: {
  numero: number | null;
  id: string;
}): string {
  return ordine.numero != null
    ? `Ordine #${ordine.numero}`
    : `Rif. ${ordine.id.slice(0, 8).toUpperCase()}`;
}
