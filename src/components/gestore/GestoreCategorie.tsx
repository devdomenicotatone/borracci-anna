"use client";

// Gestione categorie (area gestore): CRUD + riordino drag/tastiera + gerarchia a
// 3 livelli (radici + figli + nipoti). Stato locale `righe` (fonte unica)
// riallineato allo stato canonico che ogni server action ritorna — stesso pattern
// di GestoreGalleria (`applica`): su errore niente revert custom, il prossimo
// canonico corregge.
//
// Drag: riordino tra fratelli (trascinando sui BORDI di una riga) + nidificazione
// (trascinando sul CENTRO di un'altra riga la si mette DENTRO = reparent, es. da
// 2o a 3o livello). La legalita (max 3 livelli, niente cicli) e calcolata qui e
// rispecchia la barriera DB/actions; il commit del reparent passa da `sposta`.

import {
  Fragment,
  useCallback,
  useMemo,
  useState,
  useTransition,
  useRef,
  useEffect,
} from "react";

import {
  creaCategoriaAction,
  rinominaCategoriaAction,
  spostaCategoriaAction,
  riordinaCategorieAction,
  eliminaCategoriaAction,
  contaFasceVetrinaCategoriaAction,
  riordinaTemiAction,
  type EsitoCategorie,
} from "@/lib/gestore/categorie-actions";
import { useToast } from "@/components/gestore/Toaster";
import ConfermaDialog from "@/components/gestore/ConfermaDialog";
import {
  useSortableList,
  type ContestoRiga,
  type DropIntent,
  type NestSortable,
} from "@/components/gestore/useSortableList";
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
  // Quante fasce home puntano alla categoria in corso di eliminazione: caricato
  // al volo all'apertura del dialog (null = ancora ignoto/non pertinente).
  const [fasceCollegate, setFasceCollegate] = useState<number | null>(null);
  const [confermaTemi, setConfermaTemi] = useState(false);
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
  // Figli diretti per ogni padre: copre sia i figli delle radici sia i nipoti
  // (figli dei figli), la mappa e generica sul parent_id.
  const figliPerPadre = useMemo(() => {
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
  const figliDiretti = (id: string) => figliPerPadre.get(id) ?? VUOTO;
  const contaNipoti = (id: string) =>
    figliDiretti(id).reduce((s, f) => s + figliDiretti(f.id).length, 0);

  // Reparent invocato dal drag di nidificazione; letto da ref per non
  // incapsulare una chiusura stale in `nestOpts` (memoizzato su `righe`).
  const spostaRef = useRef<(id: string, parentId: string | null) => void>(
    () => {},
  );

  // Registro globale di TUTTE le righe (box della SOLA riga, non del
  // sottoalbero): il drag hit-testa qui per capire dentro quale categoria si
  // sta rilasciando.
  const registroRighe = useRef(new Map<string, HTMLElement>());
  const registraRigaGlobale = useCallback(
    (id: string, el: HTMLElement | null) => {
      if (el) registroRighe.current.set(id, el);
      else registroRighe.current.delete(id);
    },
    [],
  );

  // Intento di rilascio corrente del drag (per l'indicatore visivo: barra di
  // riordino o evidenziazione "dentro").
  const [dropIntent, setDropIntent] = useState<DropIntent>(null);
  const dropIntentRef = useRef<DropIntent>(null);
  const setDropIntentSync = useCallback((i: DropIntent) => {
    dropIntentRef.current = i;
    setDropIntent(i);
  }, []);

  // Opzioni di nidificazione per le liste sortable. La legalita e calcolata
  // sull'albero corrente e rispecchia la barriera "max 3 livelli + niente cicli"
  // di actions/trigger (il DB resta comunque l'autorita finale).
  const nestOpts = useMemo<NestSortable>(() => {
    const parentDi = new Map<string, string | null>();
    const figliDi = new Map<string, string[]>();
    for (const c of righe) {
      parentDi.set(c.id, c.parent_id ?? null);
      if (c.parent_id) {
        const a = figliDi.get(c.parent_id);
        if (a) a.push(c.id);
        else figliDi.set(c.parent_id, [c.id]);
      }
    }
    const livello = (id: string) => {
      let l = 1;
      let p = parentDi.get(id) ?? null;
      let g = 0;
      while (p && g++ < 5) {
        l++;
        p = parentDi.get(p) ?? null;
      }
      return l;
    };
    const altezza = (id: string, g = 0): number => {
      if (g > 4) return 1;
      const f = figliDi.get(id) ?? [];
      let max = 0;
      for (const x of f) max = Math.max(max, altezza(x, g + 1));
      return 1 + max;
    };
    // È lecito mettere `dragged` DENTRO `bersaglio`?
    const puoNidificare = (dragged: string, bersaglio: string) => {
      if (dragged === bersaglio) return false;
      if ((parentDi.get(dragged) ?? null) === bersaglio) return false; // già dentro
      // Il bersaglio non deve essere un discendente della trascinata (ciclo).
      let p: string | null = bersaglio;
      let g = 0;
      while (p && g++ < 6) {
        if (p === dragged) return false;
        p = parentDi.get(p) ?? null;
      }
      return livello(bersaglio) + altezza(dragged) <= 3;
    };
    return {
      registro: registroRighe,
      puoNidificare,
      onNest: (dragged, bersaglio) => spostaRef.current(dragged, bersaglio),
      setIntent: setDropIntentSync,
      intentRef: dropIntentRef,
    };
  }, [righe, setDropIntentSync]);

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
  // `nestOpts` legge il reparent da qui: aggiorno in commit (non in render) cosi
  // punta sempre all'ultima `sposta`, mai a una chiusura stale.
  useEffect(() => {
    spostaRef.current = sposta;
  });

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

  // Apre la conferma di eliminazione e, in parallelo, chiede quante fasce home
  // agganciano questa categoria: il dato non e in pagina (a differenza di
  // prodotti/sottocategorie), serve solo per l'avviso, quindi round-trip mirato
  // best-effort che non blocca la conferma.
  function chiediElimina(cat: Categoria) {
    setFasceCollegate(null);
    setDaEliminare(cat);
    contaFasceVetrinaCategoriaAction(cat.id)
      .then(setFasceCollegate)
      .catch(() => setFasceCollegate(0));
  }

  function eliminaConfermato() {
    const cat = daEliminare;
    setDaEliminare(null);
    if (!cat) return;
    applica(() => eliminaCategoriaAction(cat.id), "Categoria eliminata.");
  }

  function riordinaTemiConfermato() {
    setConfermaTemi(false);
    applica(() => riordinaTemiAction(), "Temi riordinati per priorità.");
  }

  function messaggioElimina(cat: Categoria): string {
    const nProd = conteggiProdotti[cat.id] ?? 0;
    const nFigli = righe.filter((c) => c.parent_id === cat.id).length;
    const padre = cat.parent_id
      ? righe.find((c) => c.id === cat.parent_id)
      : null;
    const parti: string[] = [];
    if (nProd > 0) {
      parti.push(
        nProd === 1
          ? "1 prodotto restera senza categoria"
          : `${nProd} prodotti resteranno senza categoria`,
      );
    }
    if (nFigli > 0) {
      // I figli risalgono di un livello: sotto il nonno, o a principali se
      // la eliminata era una radice.
      const dove = padre ? `passera sotto "${padre.nome}"` : "diventera principale";
      const dovePlurale = padre
        ? `passeranno sotto "${padre.nome}"`
        : "diventeranno principali";
      parti.push(
        nFigli === 1
          ? `1 sottocategoria ${dove}`
          : `${nFigli} sottocategorie ${dovePlurale}`,
      );
    }
    if (fasceCollegate && fasceCollegate > 0) {
      // Sganciate lato server: la fascia non sparisce, torna a mostrare le
      // novita al posto dei prodotti di questa categoria.
      parti.push(
        fasceCollegate === 1
          ? "1 fascia della home non filtrera piu per questa categoria"
          : `${fasceCollegate} fasce della home non filtreranno piu per questa categoria`,
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
          nestOpts={nestOpts}
          className="flex flex-col gap-4"
          renderItem={(radice, ctx) => (
            <div className="rounded-3xl bg-surface p-2.5 ring-1 ring-line">
              <RigaCategoria
                categoria={radice}
                livello={1}
                ctx={ctx}
                conteggioProdotti={conteggiProdotti[radice.id] ?? 0}
                numFigli={figliDiretti(radice.id).length}
                numNipoti={contaNipoti(radice.id)}
                radici={radici}
                figliDiretti={figliDiretti}
                occupato={occupato}
                registraRiga={registraRigaGlobale}
                dropIntent={dropIntent}
                onRinomina={rinomina}
                onSposta={sposta}
                onElimina={chiediElimina}
              />
              <div className="ml-3 mt-2 border-l-2 border-line/70 pl-3">
                <ListaSortable
                  items={figliDiretti(radice.id)}
                  onCommitOrdine={(ids) => riordinaGruppo(radice.id, ids)}
                  occupato={occupato}
                  onAnnuncio={annunciaSpostamento}
                  nestOpts={nestOpts}
                  className="flex flex-col gap-2"
                  renderItem={(figlio, cctx) => (
                    <div>
                      <RigaCategoria
                        categoria={figlio}
                        livello={2}
                        ctx={cctx}
                        conteggioProdotti={conteggiProdotti[figlio.id] ?? 0}
                        numFigli={figliDiretti(figlio.id).length}
                        numNipoti={0}
                        radici={radici}
                        figliDiretti={figliDiretti}
                        occupato={occupato}
                        registraRiga={registraRigaGlobale}
                        dropIntent={dropIntent}
                        onRinomina={rinomina}
                        onSposta={sposta}
                        onElimina={chiediElimina}
                      />
                      <div className="ml-3 mt-2 border-l-2 border-line/50 pl-3">
                        <ListaSortable
                          items={figliDiretti(figlio.id)}
                          onCommitOrdine={(ids) => riordinaGruppo(figlio.id, ids)}
                          occupato={occupato}
                          onAnnuncio={annunciaSpostamento}
                          nestOpts={nestOpts}
                          className="flex flex-col gap-2"
                          renderItem={(nipote, nctx) => (
                            <RigaCategoria
                              categoria={nipote}
                              livello={3}
                              ctx={nctx}
                              conteggioProdotti={conteggiProdotti[nipote.id] ?? 0}
                              numFigli={0}
                              numNipoti={0}
                              radici={radici}
                              figliDiretti={figliDiretti}
                              occupato={occupato}
                              registraRiga={registraRigaGlobale}
                              dropIntent={dropIntent}
                              onRinomina={rinomina}
                              onSposta={sposta}
                              onElimina={chiediElimina}
                            />
                          )}
                        />
                        <AggiungiSotto
                          parentId={figlio.id}
                          occupato={occupato}
                          onCrea={creaFiglio}
                        />
                      </div>
                    </div>
                  )}
                />
                <AggiungiSotto parentId={radice.id} occupato={occupato} onCrea={creaFiglio} />
              </div>
            </div>
          )}
        />
      )}

      <p className="mt-6 text-xs text-muted">
        Trascina dalla maniglia: sui <strong>bordi</strong> di una riga per
        riordinare, sul <strong>centro</strong> per metterla dentro (fino a 3
        livelli, es. Uomo › T-shirt › Manga). In alternativa usa le frecce ↑↓ o
        il menu “Sposta”. Eliminando una categoria i prodotti restano “senza
        categoria” e le sottocategorie risalgono di un livello.
      </p>

      {righe.length > 0 && (
        <div className="mt-8 border-t border-line pt-6">
          {/* La rigenerazione in blocco degli slug e stata rimossa: sul sito
              pubblicato manderebbe in 404 tutti gli indirizzi /categoria/* gia
              indicizzati (nessun redirect dai vecchi). */}
          <div>
            <button
              type="button"
              onClick={() => setConfermaTemi(true)}
              disabled={occupato}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-sea ring-1 ring-line transition-colors hover:bg-surface-2 disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
                <path d="M4 6h11M4 12h7M4 18h4" />
              </svg>
              Ordina i temi per priorità
            </button>
            <p className="mt-2 max-w-prose text-xs text-muted">
              Riordina i temi di terzo livello (Calcio, Motorsport, Gaming, Anime
              &amp; Manga, Film &amp; Serie TV, Musica) con lo stesso ordine in
              tutti i gruppi — Calcio sempre per primo. Non tocca le categorie
              principali ne i gruppi senza temi.
            </p>
          </div>
        </div>
      )}

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

      <ConfermaDialog
        aperto={confermaTemi}
        titolo="Ordinare i temi per priorità?"
        messaggio="I temi di terzo livello (Calcio, Motorsport, Gaming, Anime & Manga, Film & Serie TV, Musica) verranno riordinati con lo stesso ordine in tutti i gruppi, con Calcio sempre per primo. Le categorie principali e i gruppi senza temi non vengono toccati."
        etichettaConferma="Ordina"
        inCorso={pending}
        onConferma={riordinaTemiConfermato}
        onAnnulla={() => setConfermaTemi(false)}
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
  nestOpts,
}: {
  items: T[];
  onCommitOrdine: (idsInOrdine: string[]) => void;
  occupato: boolean;
  className?: string;
  renderItem: (item: T, ctx: ContestoRiga) => React.ReactNode;
  onAnnuncio?: (item: T, indice: number, totale: number) => void;
  nestOpts?: NestSortable;
}) {
  const { ordine, registraRiga, contestoRiga } = useSortableList(
    items,
    onCommitOrdine,
    occupato,
    onAnnuncio,
    nestOpts,
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

// --- Riga di una categoria (parametrica per livello 1=radice / 2=figlio / 3=nipote)
function RigaCategoria({
  categoria,
  livello,
  ctx,
  conteggioProdotti,
  numFigli,
  numNipoti,
  radici,
  figliDiretti,
  occupato,
  registraRiga,
  dropIntent,
  onRinomina,
  onSposta,
  onElimina,
}: {
  categoria: Categoria;
  livello: 1 | 2 | 3;
  ctx: ContestoRiga;
  conteggioProdotti: number;
  numFigli: number;
  numNipoti: number;
  radici: Categoria[];
  figliDiretti: (id: string) => Categoria[];
  occupato: boolean;
  registraRiga: (id: string, el: HTMLElement | null) => void;
  dropIntent: DropIntent;
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
  const haNipoti = numNipoti > 0;
  // Chi ha gia due livelli sotto di se puo restare solo principale: spostarla
  // ovunque creerebbe un 4o livello. Chi ha solo figli puo andare sotto una
  // radice (i figli diventano nipoti), non sotto una figlia.
  const spostaDisabilitato = occupato || haNipoti;

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
      aria-label={`Sposta ${categoria.nome} sotto un'altra categoria`}
      title={
        haNipoti
          ? "Sposta o promuovi prima le sottocategorie"
          : "Sposta sotto un'altra categoria"
      }
      className="h-11 max-w-[9rem] rounded-lg bg-white px-2 text-xs font-semibold text-foreground ring-1 ring-line outline-none disabled:opacity-40"
    >
      <option value="">Principale</option>
      {radici
        .filter((r) => r.id !== categoria.id)
        .map((r) => (
          <Fragment key={r.id}>
            <option value={r.id}>↳ {r.nome}</option>
            {/* Destinazioni di 2o livello: ok solo per chi non ha figli
                (i suoi figli finirebbero al 4o livello). */}
            {figliDiretti(r.id)
              .filter((f) => f.id !== categoria.id)
              .map((f) => (
                <option key={f.id} value={f.id} disabled={haFigli}>
                  {"  "}↳ {f.nome}
                </option>
              ))}
          </Fragment>
        ))}
    </select>
  );

  // Indicatore di rilascio: "dentro" (reparent) o barra di riordino su questa riga.
  const dentro = dropIntent?.tipo === "dentro" && dropIntent.id === categoria.id;
  const primaDi = dropIntent?.tipo === "prima" && dropIntent.id === categoria.id;
  const dopoDi = dropIntent?.tipo === "dopo" && dropIntent.id === categoria.id;

  return (
    <div
      ref={(el) => registraRiga(categoria.id, el)}
      className={[
        "relative rounded-2xl bg-white p-2.5 shadow-soft ring-1 transition-shadow",
        dentro
          ? "bg-sea/[0.06] ring-2 ring-sea shadow-lg"
          : ctx.inTrascinamento
            ? "opacity-60 ring-2 ring-dashed ring-sea"
            : "ring-line",
      ].join(" ")}
    >
      {/* Barra di riordino: la trascinata finira prima/dopo questa riga. */}
      {primaDi && (
        <span className="pointer-events-none absolute -top-1.5 left-2 right-2 z-10 h-1 rounded-full bg-sea" />
      )}
      {dopoDi && (
        <span className="pointer-events-none absolute -bottom-1.5 left-2 right-2 z-10 h-1 rounded-full bg-sea" />
      )}
      {/* Evidenziazione "rilascia per mettere dentro" (nidificazione). */}
      {dentro && (
        <span className="pointer-events-none absolute -top-2 left-3 z-10 inline-flex items-center gap-1 rounded-full bg-sea px-2 py-0.5 text-[11px] font-bold text-white shadow-sea">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true">
            <path d="M9 10 4 15l5 5" />
            <path d="M20 4v7a4 4 0 0 1-4 4H4" />
          </svg>
          dentro
        </span>
      )}
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
          aria-label={`Trascina ${categoria.nome}: sui bordi di una riga per riordinare, sul centro per metterla dentro; frecce su e giu per riordinare`}
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
          {haFigli && (
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
        {haFigli && (
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

// --- Form inline per aggiungere una sottocategoria (a una radice o a una figlia) --
function AggiungiSotto({
  parentId,
  occupato,
  onCrea,
}: {
  parentId: string;
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
    if (n) onCrea(parentId, n);
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
