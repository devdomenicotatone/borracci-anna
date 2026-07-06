"use client";

// Sortable dependency-free su Pointer Events (mouse/touch/penna in un solo
// code-path). Scelto al posto di una libreria DnD per zero rischio compat con
// React 19 e bundle minimo: le liste categorie sono cortissime.
//
//  - riordino LOCALE fluido tra fratelli, commit UNA volta a pointerup;
//  - nidificazione OPZIONALE (`nest`): trascinando sopra un'altra riga
//    dell'albero (registro globale) la si mette DENTRO quella riga (reparent);
//    senza `nest` il drag resta confinato ai fratelli, come prima;
//  - handle dedicato con touch-action:none cosi il resto resta scrollabile;
//  - `muovi(delta)` per bottoni su/giu e frecce da tastiera (stesso commit);
//  - nessun revert custom: su errore il chiamante riallinea con lo stato canonico.

import { useCallback, useEffect, useRef, useState } from "react";

/** Fascia verticale della riga sotto il puntatore (per distinguere dentro/riordino). */
export type FasciaRiga = "alto" | "centro" | "basso";

/**
 * Nidificazione ad albero (opzionale). `registro` mappa OGNI riga dell'albero al
 * suo elemento (box della sola riga, non del sottoalbero). `decidi` sceglie tra
 * mettere la trascinata DENTRO il bersaglio ("nest"), riordinarla tra i fratelli
 * ("reorder") o ignorare (null). `onNest` esegue il reparent.
 */
export interface NestSortable {
  registro: React.RefObject<Map<string, HTMLElement>>;
  decidi: (
    trascinatoId: string,
    bersaglioId: string,
    fascia: FasciaRiga,
  ) => "nest" | "reorder" | null;
  onNest: (trascinatoId: string, bersaglioId: string) => void;
  setBersaglio: (id: string | null) => void;
  bersaglioRef: React.RefObject<string | null>;
}

export interface ContestoRiga {
  /** Posizione nella lista (0-based). */
  indice: number;
  /** Lunghezza della lista (per disabilitare su/giu ai bordi). */
  totale: number;
  /** True se questa riga e quella attualmente trascinata. */
  inTrascinamento: boolean;
  /** Handler da spreddare SOLO sull'handle di trascinamento. */
  handleProps: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: () => void;
  };
  /** Sposta questa riga di `delta` posizioni (bottoni/tastiera). */
  muovi: (delta: number) => void;
}

/** Riga dell'albero sotto il puntatore + fascia verticale, o null. */
function rigaSottoPuntatore(
  registro: Map<string, HTMLElement>,
  x: number,
  y: number,
): { id: string; fascia: FasciaRiga } | null {
  for (const [id, el] of registro) {
    const r = el.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
      const rel = (y - r.top) / r.height;
      const fascia: FasciaRiga = rel < 0.28 ? "alto" : rel > 0.72 ? "basso" : "centro";
      return { id, fascia };
    }
  }
  return null;
}

export function useSortableList<T extends { id: string }>(
  items: T[],
  onCommit: (idsInOrdine: string[]) => void,
  disabilitato = false,
  annuncia?: (item: T, nuovoIndice: number, totale: number) => void,
  nest?: NestSortable,
) {
  const [ordine, setOrdine] = useState<T[]>(items);
  const [snapshot, setSnapshot] = useState<T[]>(items);
  const [trascinato, setTrascinato] = useState<string | null>(null);

  const ordineRef = useRef<T[]>(items);
  const trascinatoRef = useRef<string | null>(null);
  const pointerRef = useRef<number | null>(null);
  const righeRef = useRef(new Map<string, HTMLElement>());
  // `nest` cambia identita a ogni render (chiusure sull'albero corrente): lo
  // tengo in un ref (aggiornato in commit, non in render) cosi i pointer handler
  // restano stabili ma leggono sempre l'ultimo `nest`, mai una chiusura stale.
  const nestRef = useRef(nest);
  useEffect(() => {
    nestRef.current = nest;
  });

  // Quando cambiano gli items dal canonico (refetch dopo una mutazione,
  // promozione di un figlio a radice, ecc.) e NON si sta trascinando, riallineo
  // l'ordine locale DURANTE il render (pattern "you might not need an effect"),
  // non in un useEffect: niente render a cascata.
  if (trascinato === null && items !== snapshot) {
    setSnapshot(items);
    setOrdine(items);
  }

  // Tiene `ordineRef` allineato all'ordine renderizzato: lo leggono i pointer
  // handler senza closure stale. Nessun setState qui (la mutazione del ref in
  // render non e ammessa, in un effect senza setState si').
  useEffect(() => {
    ordineRef.current = ordine;
  }, [ordine]);

  const registraRiga = useCallback((id: string, el: HTMLElement | null) => {
    if (el) righeRef.current.set(id, el);
    else righeRef.current.delete(id);
  }, []);

  const setTrascinatoSync = useCallback((id: string | null) => {
    trascinatoRef.current = id;
    setTrascinato(id);
  }, []);

  const ripristina = useCallback(() => {
    pointerRef.current = null;
    nestRef.current?.setBersaglio(null);
    setTrascinatoSync(null);
    setOrdine(items);
    ordineRef.current = items;
  }, [items, setTrascinatoSync]);

  const commit = useCallback(() => {
    pointerRef.current = null;
    const idCorrente = trascinatoRef.current;
    const nestCorrente = nestRef.current;
    const bersaglioNest = nestCorrente?.bersaglioRef.current ?? null;
    setTrascinatoSync(null);
    nestCorrente?.setBersaglio(null);
    if (!idCorrente) return;
    // Nidificazione: annulla ogni riordino locale e delega il reparent.
    if (bersaglioNest && nestCorrente) {
      setOrdine(items);
      ordineRef.current = items;
      nestCorrente.onNest(idCorrente, bersaglioNest);
      return;
    }
    const nuovi = ordineRef.current.map((c) => c.id);
    const originali = items.map((c) => c.id);
    if (nuovi.join("|") !== originali.join("|")) {
      const idx = ordineRef.current.findIndex((c) => c.id === idCorrente);
      if (idx >= 0) annuncia?.(ordineRef.current[idx], idx, ordineRef.current.length);
      onCommit(nuovi);
    }
  }, [items, onCommit, setTrascinatoSync, annuncia]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent, id: string) => {
      if (disabilitato) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      pointerRef.current = e.pointerId;
      ordineRef.current = ordine;
      setTrascinatoSync(id);
    },
    [disabilitato, ordine, setTrascinatoSync],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (pointerRef.current === null || e.pointerId !== pointerRef.current) return;
    const nestCorrente = nestRef.current;
    const dragged = trascinatoRef.current;

    // Nidificazione: cerca la riga sotto il puntatore in TUTTO l'albero.
    if (nestCorrente && dragged) {
      const hit = rigaSottoPuntatore(
        nestCorrente.registro.current,
        e.clientX,
        e.clientY,
      );
      if (hit) {
        const esito = nestCorrente.decidi(dragged, hit.id, hit.fascia);
        if (esito === "nest") {
          if (nestCorrente.bersaglioRef.current !== hit.id) {
            nestCorrente.setBersaglio(hit.id);
          }
          // Congela il riordino locale: la trascinata resta al suo posto.
          if (ordineRef.current !== items) {
            ordineRef.current = items;
            setOrdine(items);
          }
          return;
        }
        if (nestCorrente.bersaglioRef.current !== null) {
          nestCorrente.setBersaglio(null);
        }
        // Riga di un ALTRO gruppo ma non un fratello di questa lista: niente
        // riordino spurio (il riordino qui sotto vale solo per i fratelli).
        if (!righeRef.current.has(hit.id)) return;
      } else if (nestCorrente.bersaglioRef.current !== null) {
        nestCorrente.setBersaglio(null);
      }
    }

    // Riordino locale (confinato ai fratelli di questa lista).
    const corrente = ordineRef.current;
    const from = corrente.findIndex((c) => c.id === trascinatoRef.current);
    if (from < 0) return;
    const y = e.clientY;
    let target = corrente.length - 1;
    for (let i = 0; i < corrente.length; i++) {
      const el = righeRef.current.get(corrente[i].id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (y < r.top + r.height / 2) {
        target = i;
        break;
      }
    }
    if (target !== from) {
      const next = [...corrente];
      const [m] = next.splice(from, 1);
      next.splice(target, 0, m);
      ordineRef.current = next;
      setOrdine(next);
    }
  }, [items]);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (pointerRef.current !== null && e.pointerId === pointerRef.current) commit();
    },
    [commit],
  );

  const muovi = useCallback(
    (index: number, delta: number) => {
      if (disabilitato) return;
      const lista = ordineRef.current;
      const j = index + delta;
      if (j < 0 || j >= lista.length) return;
      const spostato = lista[index];
      const next = [...lista];
      [next[index], next[j]] = [next[j], next[index]];
      setOrdine(next);
      ordineRef.current = next;
      annuncia?.(spostato, j, next.length);
      onCommit(next.map((c) => c.id));
    },
    [disabilitato, onCommit, annuncia],
  );

  return {
    ordine,
    trascinato,
    registraRiga,
    contestoRiga(item: T, indice: number): ContestoRiga {
      return {
        indice,
        totale: ordine.length,
        inTrascinamento: trascinato === item.id,
        handleProps: {
          onPointerDown: (e) => onPointerDown(e, item.id),
          onPointerMove,
          onPointerUp,
          onPointerCancel: ripristina,
        },
        muovi: (delta) => muovi(indice, delta),
      };
    },
  };
}
