"use client";

// Preferiti ("cuoricino") — store client su localStorage, SENZA account.
// I preferiti vivono sul dispositivo: un array di id prodotto, piu recente per
// primo. Nessun round-trip: cuori, badge e pagina /preferiti leggono da qui via
// useSyncExternalStore; le modifiche notificano tutti i componenti montati con
// un evento custom, e l'evento "storage" allinea le altre schede del browser.

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

function scrivi(ids: string[]) {
  cache = ids;
  cacheRaw = JSON.stringify(ids);
  try {
    window.localStorage.setItem(CHIAVE, cacheRaw);
  } catch {
    // Quota piena / storage negato: lo stato resta almeno in memoria di pagina.
  }
  window.dispatchEvent(new Event(EVENTO_LOCALE));
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
