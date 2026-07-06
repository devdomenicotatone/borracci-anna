"use client";

// Sortable dependency-free su Pointer Events (mouse/touch/penna in un solo
// code-path). Scelto al posto di una libreria DnD per zero rischio compat con
// React 19 e bundle minimo: le liste categorie sono cortissime.
//
// Due modalita, scelte da `nest`:
//  - SENZA `nest` (es. vetrina): riordino LOCALE dal vivo tra fratelli, commit
//    a pointerup. La riga trascinata si sposta mentre trascini.
//  - CON `nest` (categorie ad albero): modello A INDICATORE. Nulla si muove
//    durante il drag; si calcola solo l'INTENTO di rilascio (riordino tra
//    fratelli sui bordi, oppure "dentro" un'altra riga = reparent sul centro)
//    e lo si applica a pointerup. Cosi il riordino dal vivo non "ruba" il
//    centro del fratello e la nidificazione 2o->3o livello e raggiungibile.
//
//  - handle dedicato con touch-action:none cosi il resto resta scrollabile;
//  - `muovi(delta)` per bottoni su/giu e frecce da tastiera (riordino, commit);
//  - nessun revert custom: su errore il chiamante riallinea con lo stato canonico.

import { useCallback, useEffect, useRef, useState } from "react";

/** Fascia verticale della riga sotto il puntatore. */
export type FasciaRiga = "alto" | "centro" | "basso";

/**
 * Intento di rilascio del drag ad albero:
 *  - "dentro": nidifica la trascinata DENTRO la riga `id` (reparent);
 *  - "prima"/"dopo": riordina la trascinata prima/dopo il fratello `id`.
 */
export type DropIntent = { tipo: "dentro" | "prima" | "dopo"; id: string } | null;

/**
 * Nidificazione ad albero (opzionale). `registro` mappa OGNI riga dell'albero al
 * suo elemento (box della sola riga, non del sottoalbero). `puoNidificare` dice
 * se e lecito mettere la trascinata dentro il bersaglio (max 3 livelli, niente
 * cicli). `onNest` esegue il reparent; `setIntent`/`intentRef` pubblicano
 * l'intento corrente per l'indicatore visivo.
 */
export interface NestSortable {
  registro: React.RefObject<Map<string, HTMLElement>>;
  puoNidificare: (trascinatoId: string, bersaglioId: string) => boolean;
  onNest: (trascinatoId: string, bersaglioId: string) => void;
  setIntent: (intent: DropIntent) => void;
  intentRef: React.RefObject<DropIntent>;
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
      const fascia: FasciaRiga = rel < 0.3 ? "alto" : rel > 0.7 ? "basso" : "centro";
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
    nestRef.current?.setIntent(null);
    setTrascinatoSync(null);
    setOrdine(items);
    ordineRef.current = items;
  }, [items, setTrascinatoSync]);

  const commit = useCallback(() => {
    pointerRef.current = null;
    const idCorrente = trascinatoRef.current;
    const nestC = nestRef.current;
    setTrascinatoSync(null);

    // Modello a indicatore (albero): applica l'intento calcolato.
    if (nestC) {
      const intent = nestC.intentRef.current;
      nestC.setIntent(null);
      if (!idCorrente || !intent) return;
      if (intent.tipo === "dentro") {
        nestC.onNest(idCorrente, intent.id);
        return;
      }
      // Riordino tra i fratelli di QUESTA lista (prima/dopo il bersaglio).
      const base = items.map((c) => c.id).filter((x) => x !== idCorrente);
      const pos = base.indexOf(intent.id);
      if (pos < 0) return;
      base.splice(intent.tipo === "prima" ? pos : pos + 1, 0, idCorrente);
      if (base.join("|") !== items.map((c) => c.id).join("|")) {
        const it = items.find((c) => c.id === idCorrente);
        if (it) annuncia?.(it, base.indexOf(idCorrente), base.length);
        onCommit(base);
      }
      return;
    }

    // Riordino dal vivo (senza nest): committa l'ordine locale corrente.
    if (!idCorrente) return;
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
    const nestC = nestRef.current;
    const dragged = trascinatoRef.current;

    // Modello a indicatore (albero): calcola l'intento, NON riordina dal vivo.
    if (nestC && dragged) {
      const hit = rigaSottoPuntatore(nestC.registro.current, e.clientX, e.clientY);
      let intent: DropIntent = null;
      if (hit && hit.id !== dragged) {
        // Stessa lista => stesso padre (fratello): bordi = riordino.
        const fratello = righeRef.current.has(hit.id);
        if (hit.fascia === "centro" && nestC.puoNidificare(dragged, hit.id)) {
          intent = { tipo: "dentro", id: hit.id };
        } else if (fratello) {
          intent = { tipo: hit.fascia === "alto" ? "prima" : "dopo", id: hit.id };
        } else if (nestC.puoNidificare(dragged, hit.id)) {
          // Riga di un altro gruppo: qualsiasi fascia nidifica (se lecito).
          intent = { tipo: "dentro", id: hit.id };
        }
      }
      const prev = nestC.intentRef.current;
      if (prev?.tipo !== intent?.tipo || prev?.id !== intent?.id) {
        nestC.setIntent(intent);
      }
      return;
    }

    // Riordino dal vivo (senza nest): confinato ai fratelli di questa lista.
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
  }, []);

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
