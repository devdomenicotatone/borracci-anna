"use client";

// Gestione categorie (area gestore): CRUD + riordino drag/tastiera + gerarchia a
// 2 livelli (radici + figli). Stato locale `righe` (fonte unica) riallineato allo
// stato canonico che ogni server action ritorna — stesso pattern di GestoreGalleria
// (`applica`): su errore niente revert custom, il prossimo canonico corregge.

import { useMemo, useState, useTransition, useRef, useEffect } from "react";

import {
  creaCategoriaAction,
  rinominaCategoriaAction,
  spostaCategoriaAction,
  riordinaCategorieAction,
  eliminaCategoriaAction,
  type EsitoCategorie,
} from "@/lib/gestore/categorie-actions";
import { useToast } from "@/components/gestore/Toaster";
import ConfermaDialog from "@/components/gestore/ConfermaDialog";
import { useSortableList, type ContestoRiga } from "@/components/gestore/useSortableList";
import type { Categoria } from "@/lib/types";

const inputCls =
  "h-11 w-full rounded-2xl bg-white px-4 text-base text-foreground ring-1 ring-line outline-none transition-shadow focus:ring-2 focus:ring-sea";

// Riferimento stabile per i gruppi figli vuoti: un `[]` nuovo a ogni render
// farebbe scattare inutilmente l'allineamento render-phase di useSortableList.
const VUOTO: Categoria[] = [];

export default function GestoreCategorie({
  iniziali,
  conteggiProdotti,
}: {
  iniziali: Categoria[];
  conteggiProdotti: Record<string, number>;
}) {
  const { mostra } = useToast();
  const [righe, setRighe] = useState<Categoria[]>(iniziali);
  const [pending, startTransition] = useTransition();
  const [daEliminare, setDaEliminare] = useState<Categoria | null>(null);
  const [nuovaRadice, setNuovaRadice] = useState("");
  const [annuncio, setAnnuncio] = useState("");
  const occupato = pending;

  // Tie-break per id: ordine deterministico anche con `ordine` duplicati (race).
  const radici = useMemo(
    () =>
      righe
        .filter((c) => !c.parent_id)
        .sort((a, b) => a.ordine - b.ordine || a.id.localeCompare(b.id)),
    [righe],
  );
  const figliPerRadice = useMemo(() => {
    const m = new Map<string, Categoria[]>();
    for (const c of righe) {
      if (!c.parent_id) continue;
      const arr = m.get(c.parent_id);
      if (arr) arr.push(c);
      else m.set(c.parent_id, [c]);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => a.ordine - b.ordine || a.id.localeCompare(b.id));
    }
    return m;
  }, [righe]);

  function applica(azione: () => Promise<EsitoCategorie>, successo?: string) {
    startTransition(async () => {
      const esito = await azione();
      // Applica il canonico se presente, anche su errore: riallinea l'ottimistico
      // del riordino quando il riordino fallisce a meta.
      if (esito.categorie) setRighe(esito.categorie);
      if (!esito.ok) {
        mostra(esito.error ?? "Operazione non riuscita.", "errore");
        return;
      }
      if (successo) mostra(successo, "ok");
    });
  }

  function annunciaSpostamento(cat: Categoria, indice: number, totale: number) {
    setAnnuncio(`${cat.nome} spostata in posizione ${indice + 1} di ${totale}.`);
  }

  function creaRadice(e: React.FormEvent) {
    e.preventDefault();
    const nome = nuovaRadice.trim();
    if (!nome) return;
    setNuovaRadice("");
    applica(() => creaCategoriaAction({ nome, parentId: null }), "Categoria creata.");
  }

  function creaFiglio(parentId: string, nome: string) {
    applica(() => creaCategoriaAction({ nome, parentId }), "Sottocategoria creata.");
  }

  function rinomina(id: string, nome: string) {
    applica(() => rinominaCategoriaAction(id, nome), "Nome aggiornato.");
  }

  function sposta(id: string, parentId: string | null) {
    applica(() => spostaCategoriaAction(id, parentId), "Categoria spostata.");
  }

  function riordinaGruppo(parentId: string | null, ids: string[]) {
    // Ottimistico: riassegno `ordine` ai membri del gruppo (i memo riordinano).
    setRighe((prev) =>
      prev.map((c) => {
        const idx = ids.indexOf(c.id);
        return idx >= 0 ? { ...c, ordine: idx } : c;
      }),
    );
    applica(() => riordinaCategorieAction(parentId, ids));
  }

  function eliminaConfermato() {
    const cat = daEliminare;
    setDaEliminare(null);
    if (!cat) return;
    applica(() => eliminaCategoriaAction(cat.id), "Categoria eliminata.");
  }

  function messaggioElimina(cat: Categoria): string {
    const nProd = conteggiProdotti[cat.id] ?? 0;
    const nFigli = righe.filter((c) => c.parent_id === cat.id).length;
    const parti: string[] = [];
    if (nProd > 0) {
      parti.push(
        nProd === 1
          ? "1 prodotto restera senza categoria"
          : `${nProd} prodotti resteranno senza categoria`,
      );
    }
    if (nFigli > 0) {
      parti.push(
        nFigli === 1
          ? "1 sottocategoria diventera principale"
          : `${nFigli} sottocategorie diventeranno principali`,
      );
    }
    const coda = parti.length ? ` ${parti.join(" e ")}.` : "";
    return `"${cat.nome}" verra eliminata.${coda}`;
  }

  return (
    <div>
      {/* A lg l'input non si stira a tutta larghezza (lg:w-80): il form resta
          in flusso, compatto sotto l'header. */}
      <form onSubmit={creaRadice} className="mb-6 flex items-center gap-2">
        <input
          value={nuovaRadice}
          onChange={(e) => setNuovaRadice(e.target.value)}
          placeholder="Nuova categoria principale (es. Bambino)"
          disabled={occupato}
          className={`${inputCls} lg:w-80`}
        />
        <button
          type="submit"
          disabled={occupato || !nuovaRadice.trim()}
          className="flex h-11 flex-none items-center rounded-full bg-sea px-5 font-display text-sm font-bold text-white shadow-sea transition-all hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50"
        >
          Aggiungi
        </button>
      </form>

      {radici.length === 0 ? (
        <div className="rounded-3xl bg-surface px-6 py-10 text-center ring-1 ring-dashed ring-line">
          <p className="font-display text-sm font-bold text-foreground">
            Nessuna categoria
          </p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-muted">
            Crea la prima categoria principale qui sopra (es. Uomo, Donna). Poi
            potrai aggiungere sottocategorie, riordinarle e spostarle.
          </p>
        </div>
      ) : (
        <ListaSortable
          items={radici}
          onCommitOrdine={(ids) => riordinaGruppo(null, ids)}
          occupato={occupato}
          onAnnuncio={annunciaSpostamento}
          className="flex flex-col gap-4"
          renderItem={(radice, ctx) => (
            <div className="rounded-3xl bg-surface p-2.5 ring-1 ring-line">
              <RigaCategoria
                categoria={radice}
                livello={1}
                ctx={ctx}
                conteggioProdotti={conteggiProdotti[radice.id] ?? 0}
                numFigli={figliPerRadice.get(radice.id)?.length ?? 0}
                radici={radici}
                occupato={occupato}
                onRinomina={rinomina}
                onSposta={sposta}
                onElimina={setDaEliminare}
              />
              <div className="ml-3 mt-2 border-l-2 border-line/70 pl-3">
                <ListaSortable
                  items={figliPerRadice.get(radice.id) ?? VUOTO}
                  onCommitOrdine={(ids) => riordinaGruppo(radice.id, ids)}
                  occupato={occupato}
                  onAnnuncio={annunciaSpostamento}
                  className="flex flex-col gap-2"
                  renderItem={(figlio, cctx) => (
                    <RigaCategoria
                      categoria={figlio}
                      livello={2}
                      ctx={cctx}
                      conteggioProdotti={conteggiProdotti[figlio.id] ?? 0}
                      numFigli={0}
                      radici={radici}
                      occupato={occupato}
                      onRinomina={rinomina}
                      onSposta={sposta}
                      onElimina={setDaEliminare}
                    />
                  )}
                />
                <AggiungiSotto radiceId={radice.id} occupato={occupato} onCrea={creaFiglio} />
              </div>
            </div>
          )}
        />
      )}

      <p className="mt-6 text-xs text-muted">
        Trascina dalla maniglia per riordinare (o usa le frecce ↑↓ / i tasti
        freccia). “Sposta” cambia la categoria principale. Eliminando una
        categoria i prodotti restano “senza categoria” e le sottocategorie
        diventano principali.
      </p>

      <div aria-live="polite" role="status" className="sr-only">
        {annuncio}
      </div>

      <ConfermaDialog
        aperto={daEliminare !== null}
        titolo="Eliminare la categoria?"
        messaggio={daEliminare ? messaggioElimina(daEliminare) : ""}
        etichettaConferma="Elimina"
        inCorso={pending}
        onConferma={eliminaConfermato}
        onAnnulla={() => setDaEliminare(null)}
      />
    </div>
  );
}

// --- Lista sortable generica (riusata per radici e per i figli di ogni radice) --
function ListaSortable<T extends { id: string }>({
  items,
  onCommitOrdine,
  occupato,
  className,
  renderItem,
  onAnnuncio,
}: {
  items: T[];
  onCommitOrdine: (idsInOrdine: string[]) => void;
  occupato: boolean;
  className?: string;
  renderItem: (item: T, ctx: ContestoRiga) => React.ReactNode;
  onAnnuncio?: (item: T, indice: number, totale: number) => void;
}) {
  const { ordine, registraRiga, contestoRiga } = useSortableList(
    items,
    onCommitOrdine,
    occupato,
    onAnnuncio,
  );
  if (ordine.length === 0) return null;
  return (
    <ul role="list" className={className}>
      {ordine.map((item, i) => (
        <li key={item.id} ref={(el) => registraRiga(item.id, el)}>
          {renderItem(item, contestoRiga(item, i))}
        </li>
      ))}
    </ul>
  );
}

// --- Riga di una categoria (parametrica per livello 1=radice / 2=figlio) --------
function RigaCategoria({
  categoria,
  livello,
  ctx,
  conteggioProdotti,
  numFigli,
  radici,
  occupato,
  onRinomina,
  onSposta,
  onElimina,
}: {
  categoria: Categoria;
  livello: 1 | 2;
  ctx: ContestoRiga;
  conteggioProdotti: number;
  numFigli: number;
  radici: Categoria[];
  occupato: boolean;
  onRinomina: (id: string, nome: string) => void;
  onSposta: (id: string, parentId: string | null) => void;
  onElimina: (categoria: Categoria) => void;
}) {
  const [modifica, setModifica] = useState(false);
  const [bozza, setBozza] = useState(categoria.nome);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const ripristinaFocus = useRef(false);

  useEffect(() => {
    if (modifica) {
      inputRef.current?.focus();
    } else if (ripristinaFocus.current) {
      // Torna al pulsante del nome dopo Invio/Esc (non su blur, per non rubare
      // il focus a un click altrove).
      ripristinaFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [modifica]);

  function apriModifica() {
    setBozza(categoria.nome);
    setModifica(true);
  }

  const isRadice = livello === 1;
  const haFigli = numFigli > 0;
  // Una radice con figli puo restare solo principale: spostarla creerebbe nipoti.
  const spostaDisabilitato = occupato || (isRadice && haFigli);

  function chiudiModifica(salva: boolean, conFocus: boolean) {
    if (conFocus) ripristinaFocus.current = true;
    setModifica(false);
    const nome = bozza.trim();
    if (salva && nome && nome !== categoria.nome) onRinomina(categoria.id, nome);
    else setBozza(categoria.nome);
  }

  // Stesso elemento riusato in due punti: riga compatta (solo lg) e seconda
  // riga (solo sotto lg); ne e visibile sempre uno solo.
  const selectSposta = (
    <select
      value={categoria.parent_id ?? ""}
      onChange={(e) => onSposta(categoria.id, e.target.value || null)}
      disabled={spostaDisabilitato}
      aria-label={`Sposta ${categoria.nome} sotto una categoria principale`}
      title={
        isRadice && haFigli
          ? "Sposta o promuovi prima le sottocategorie"
          : "Sposta sotto una categoria principale"
      }
      className="h-11 max-w-[9rem] rounded-lg bg-white px-2 text-xs font-semibold text-foreground ring-1 ring-line outline-none disabled:opacity-40"
    >
      <option value="">Principale</option>
      {radici
        .filter((r) => r.id !== categoria.id)
        .map((r) => (
          <option key={r.id} value={r.id}>
            ↳ {r.nome}
          </option>
        ))}
    </select>
  );

  return (
    <div
      className={[
        "rounded-2xl bg-white p-2.5 shadow-soft ring-1 transition-shadow",
        ctx.inTrascinamento ? "shadow-lg ring-sea" : "ring-line",
      ].join(" ")}
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          {...ctx.handleProps}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") {
              e.preventDefault();
              ctx.muovi(-1);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              ctx.muovi(1);
            }
          }}
          disabled={occupato}
          aria-label={`Trascina per riordinare ${categoria.nome}; frecce su e giu per spostare`}
          className="grid h-11 w-11 flex-none touch-none cursor-grab select-none place-items-center rounded-lg text-muted transition-colors hover:bg-surface active:cursor-grabbing disabled:opacity-40"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <circle cx="9" cy="6" r="1.5" />
            <circle cx="15" cy="6" r="1.5" />
            <circle cx="9" cy="12" r="1.5" />
            <circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="18" r="1.5" />
            <circle cx="15" cy="18" r="1.5" />
          </svg>
        </button>

        <div className="min-w-0 flex-1 lg:flex lg:items-center lg:gap-2">
          {modifica ? (
            <input
              ref={inputRef}
              value={bozza}
              onChange={(e) => setBozza(e.target.value)}
              onBlur={() => chiudiModifica(true, false)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  chiudiModifica(true, true);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  chiudiModifica(false, true);
                }
              }}
              className="h-11 w-full rounded-lg bg-white px-2.5 text-sm font-semibold text-foreground ring-2 ring-sea outline-none"
            />
          ) : (
            <button
              ref={triggerRef}
              type="button"
              onClick={apriModifica}
              disabled={occupato}
              className="block max-w-full truncate rounded-lg px-1 py-1 text-left transition-colors hover:bg-surface disabled:opacity-50 lg:min-w-0"
              title="Tocca per rinominare"
            >
              <span
                className={[
                  "font-display font-bold text-foreground",
                  isRadice ? "text-base" : "text-sm",
                ].join(" ")}
              >
                {categoria.nome}
              </span>
            </button>
          )}
          {/* Riga compatta a lg: i badge affiancano il nome (sotto lg vivono
              nella seconda riga). */}
          {conteggioProdotti > 0 && (
            <span className="hidden flex-none whitespace-nowrap rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-sea lg:inline-flex">
              {conteggioProdotti} {conteggioProdotti === 1 ? "prodotto" : "prodotti"}
            </span>
          )}
          {isRadice && haFigli && (
            <span className="hidden flex-none whitespace-nowrap rounded-full bg-surface px-2 py-0.5 text-[11px] font-bold text-muted ring-1 ring-line lg:inline-flex">
              {numFigli} sottocat.
            </span>
          )}
        </div>

        <label className="hidden flex-none items-center gap-1.5 lg:flex">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
            Sposta
          </span>
          {selectSposta}
        </label>

        <button
          type="button"
          aria-label={`Sposta su ${categoria.nome}`}
          disabled={occupato || ctx.indice === 0}
          onClick={() => ctx.muovi(-1)}
          className="grid h-11 w-11 flex-none place-items-center rounded-full bg-white text-sea ring-1 ring-line transition-colors hover:bg-surface disabled:opacity-40"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
            <path d="m18 15-6-6-6 6" />
          </svg>
        </button>
        <button
          type="button"
          aria-label={`Sposta giu ${categoria.nome}`}
          disabled={occupato || ctx.indice === ctx.totale - 1}
          onClick={() => ctx.muovi(1)}
          className="grid h-11 w-11 flex-none place-items-center rounded-full bg-white text-sea ring-1 ring-line transition-colors hover:bg-surface disabled:opacity-40"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <button
          type="button"
          aria-label={`Elimina ${categoria.nome}`}
          disabled={occupato}
          onClick={() => onElimina(categoria)}
          className="grid h-11 w-11 flex-none place-items-center rounded-full text-coral transition-colors hover:bg-coral/10 disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
          </svg>
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-8 lg:hidden">
        {conteggioProdotti > 0 && (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-sea">
            {conteggioProdotti} {conteggioProdotti === 1 ? "prodotto" : "prodotti"}
          </span>
        )}
        {isRadice && haFigli && (
          <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-bold text-muted ring-1 ring-line">
            {numFigli} sottocat.
          </span>
        )}
        <label className="ml-auto flex items-center gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
            Sposta
          </span>
          {selectSposta}
        </label>
      </div>
    </div>
  );
}

// --- Form inline per aggiungere una sottocategoria a una radice -----------------
function AggiungiSotto({
  radiceId,
  occupato,
  onCrea,
}: {
  radiceId: string;
  occupato: boolean;
  onCrea: (parentId: string, nome: string) => void;
}) {
  const [aperto, setAperto] = useState(false);
  const [nome, setNome] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const eraAperto = useRef(false);

  useEffect(() => {
    if (aperto) {
      eraAperto.current = true;
      inputRef.current?.focus();
    } else if (eraAperto.current) {
      // Riporta il focus al pulsante "+ sottocategoria" dopo chiusura/annulla.
      eraAperto.current = false;
      triggerRef.current?.focus();
    }
  }, [aperto]);

  function conferma() {
    const n = nome.trim();
    setNome("");
    setAperto(false);
    if (n) onCrea(radiceId, n);
  }

  if (!aperto) {
    return (
      <button
        ref={triggerRef}
        type="button"
        disabled={occupato}
        onClick={() => setAperto(true)}
        className="mt-2 inline-flex items-center gap-1 rounded-full px-2 py-1.5 text-xs font-bold text-sea transition-colors hover:bg-surface-2 disabled:opacity-50"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className="h-3.5 w-3.5" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        sottocategoria
      </button>
    );
  }

  return (
    <div className="mt-2 flex items-center gap-1.5">
      <input
        ref={inputRef}
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            conferma();
          } else if (e.key === "Escape") {
            setNome("");
            setAperto(false);
          }
        }}
        placeholder="Nome sottocategoria"
        disabled={occupato}
        className="h-9 flex-1 rounded-lg bg-white px-2.5 text-sm text-foreground ring-1 ring-line outline-none focus:ring-2 focus:ring-sea"
      />
      <button
        type="button"
        onClick={conferma}
        disabled={occupato || !nome.trim()}
        className="h-9 flex-none rounded-full bg-sea px-3 text-xs font-bold text-white shadow-sea transition-all hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50"
      >
        Aggiungi
      </button>
      <button
        type="button"
        onClick={() => {
          setNome("");
          setAperto(false);
        }}
        className="h-9 flex-none rounded-full px-2.5 text-xs font-bold text-muted transition-colors hover:bg-surface"
      >
        Annulla
      </button>
    </div>
  );
}
