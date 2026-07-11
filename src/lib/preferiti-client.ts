"use client";

// Preferiti ("cuoricino") — store client su localStorage.
// I preferiti vivono sul dispositivo: un array di id prodotto, piu recente per
// primo. Nessun round-trip: cuori, badge e pagina /preferiti leggono da qui via
// useSyncExternalStore; le modifiche notificano tutti i componenti montati con
// un evento custom, e l'evento "storage" allinea le altre schede del browser.
//
// Con un CLIENTE LOGGATO localStorage resta l'unico store della UI, ma ogni
// scrittura viene replicata sul server (tabella `preferiti`) tramite la
// callback registrata da SincronizzaPreferiti — che al login fa anche il merge
// e al logout azzera il dispositivo. Per gli ospiti nulla cambia.

import { useSyncExternalStore } from "react";

const CHIAVE = "anna_preferiti_v1";
const EVENTO_LOCALE = "anna:preferiti";

/** Snapshot server/SSR: riferimento STABILE (mai un nuovo array a ogni chiamata,
 *  useSyncExternalStore andrebbe in loop). Lato server i preferiti non esistono. */
const VUOTO: string[] = [];

// Cache dell'ultimo parse: useSyncExternalStore richiede che getSnapshot
// ritorni lo STESSO riferimento finche il dato non cambia.
let cache: string[] = VUOTO;
let cacheRaw: string | null | undefined; // undefined = mai letto

function leggi(): string[] {
  if (typeof window === "undefined") return VUOTO;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(CHIAVE);
  } catch {
    // localStorage negato (es. impostazioni privacy): preferiti disattivi.
    return VUOTO;
  }
  if (raw === cacheRaw) return cache;

  let ids: string[] = VUOTO;
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        ids = parsed.filter((x): x is string => typeof x === "string");
      }
    } catch {
      // Dato corrotto: si riparte da vuoto alla prossima scrittura.
    }
  }
  cacheRaw = raw;
  cache = ids;
  return cache;
}

// Replica verso il server per i clienti loggati (registrata da
// SincronizzaPreferiti). Viene invocata SOLO dalle scritture locali della
// scheda corrente: gli allineamenti dal server (sostituisciPreferiti) e le
// altre schede (evento "storage") non la innescano — niente eco.
let replicaServer: ((ids: string[]) => void) | null = null;

/** Registra la replica server; ritorna la funzione di sgancio. */
export function registraReplicaServer(
  fn: (ids: string[]) => void,
): () => void {
  replicaServer = fn;
  return () => {
    if (replicaServer === fn) replicaServer = null;
  };
}

function scrivi(ids: string[], replica = true) {
  cache = ids;
  cacheRaw = JSON.stringify(ids);
  try {
    window.localStorage.setItem(CHIAVE, cacheRaw);
  } catch {
    // Quota piena / storage negato: lo stato resta almeno in memoria di pagina.
  }
  window.dispatchEvent(new Event(EVENTO_LOCALE));
  if (replica) replicaServer?.(ids);
}

/** Snapshot corrente (per il merge al login). */
export function leggiPreferiti(): string[] {
  return leggi();
}

/** Riscrive la lista SENZA innescare la replica (allineamenti dal server). */
export function sostituisciPreferiti(ids: string[]): void {
  scrivi(ids, false);
}

/** Azzera i preferiti del dispositivo (logout), senza replica. */
export function svuotaPreferiti(): void {
  scrivi([], false);
}

/** Aggiunge o toglie un prodotto dai preferiti. Ritorna il nuovo stato (true = salvato). */
export function togglePreferito(prodottoId: string): boolean {
  const correnti = leggi();
  const attivo = correnti.includes(prodottoId);
  scrivi(
    attivo
      ? correnti.filter((id) => id !== prodottoId)
      : [prodottoId, ...correnti],
  );
  return !attivo;
}

function sottoscrivi(callback: () => void): () => void {
  window.addEventListener(EVENTO_LOCALE, callback);
  // Modifiche fatte in un'ALTRA scheda dello stesso browser.
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENTO_LOCALE, callback);
    window.removeEventListener("storage", callback);
  };
}

/** Id dei prodotti preferiti (piu recente per primo), reattivo alle modifiche. */
export function usePreferiti(): string[] {
  return useSyncExternalStore(sottoscrivi, leggi, () => VUOTO);
}
