// Revalidation condivisa del catalogo (lista gestore + vetrina pubblica).
// Centralizza l'invalidazione ISR che PRIMA era ricopiata a mano in 8+ server
// action su due file: quando si aggiunge una cache taggata (com'e successo con
// TAG_CORRELATI e TAG_FACETTE_VETRINA) basta toccarla QUI, senza la caccia ai
// blocchi sparsi che lasciavano card/correlati stantii a ogni dimenticanza
// (era gia successo a copiaFotoTraProdottiAction, che scordava i due tag).
//
// NB: modulo helper, NON "use server" — le funzioni girano dentro le action
// che lo importano; esportarle come action non serve e ne cambierebbe il tipo.

import { revalidatePath, revalidateTag } from "next/cache";

import { TAG_CORRELATI } from "@/lib/correlati";
import { TAG_FACETTE_VETRINA } from "@/lib/vetrina";
import { TAG_VETRINA_HOME } from "@/lib/vetrina-home";

/**
 * Invalida tutto cio che una mutazione di prodotto puo cambiare: la lista
 * gestore, la home, le PDP pubbliche (rotta dinamica -> pattern + tipo 'page',
 * non la URL letterale) e i tag delle cache derivate (correlati + facette
 * vetrina, che dipendono anche da ALTRI prodotti). Con `prodottoId` rinfresca
 * anche la scheda gestore specifica.
 */
export function revalidaProdotto(prodottoId?: string): void {
  revalidatePath("/gestore/prodotti");
  if (prodottoId) revalidatePath(`/gestore/prodotti/${prodottoId}`);
  revalidatePath("/");
  revalidatePath("/prodotti/[slug]", "page");
  revalidateTag(TAG_CORRELATI, "max");
  revalidateTag(TAG_FACETTE_VETRINA, "max");
  revalidateTag(TAG_VETRINA_HOME, "max");
}

/**
 * Revalidation minima della sola scheda gestore, per il flusso foto batch:
 * importando centinaia di bozze (attivo=false, invisibili in vetrina) NON ha
 * senso invalidare home + tutte le PDP + i tag globali a OGNI foto — butterebbe
 * la cache della vetrina rigenerandola di continuo senza rendere visibile nulla.
 * Il chiamante batch usa questa e fa UNA revalidaProdotto() complessiva a fine
 * corsa (o pubblica, che gia revalida in pieno via toggleAttivoAction).
 */
export function revalidaSchedaGestore(prodottoId: string): void {
  revalidatePath(`/gestore/prodotti/${prodottoId}`);
}
