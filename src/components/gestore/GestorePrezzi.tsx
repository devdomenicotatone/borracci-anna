"use client";

// Pagina "Prezzi" del gestore: modifica dei prezzi a gruppi di categorie.
// Flusso in tre passi, tutto in questa vista:
//   1) si scelgono le categorie (albero con conteggi; una macro include le
//      discendenti) e si carica l'elenco prodotti;
//   2) si imposta la regola: aumenta/diminuisci, in % o in euro, con
//      arrotondamento opzionale (,90 o euro intero);
//   3) si controlla l'anteprima riga per riga (prezzo attuale -> nuovo),
//      si spunta/despunta qualche prodotto e si applica.
// L'anteprima usa la STESSA funzione pura della server action
// (lib/prezzi-regola): quello che si vede e quello che viene scritto.

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import Image from "next/image";

import { formatPrezzo, parsePrezzoCents } from "@/lib/format";
import {
  etichettaCategoria,
  gruppiCategorie,
  idConDiscendenti,
} from "@/lib/categorie-albero";
import {
  calcolaNuovoPrezzoCents,
  validaRegolaPrezzi,
  type ArrotondamentoPrezzi,
  type DirezionePrezzi,
  type ModoPrezzi,
  type RegolaPrezzi,
} from "@/lib/prezzi-regola";
import {
  modificaPrezziBulkAction,
  prodottiPerCategorieAction,
  type ProdottoPrezzi,
} from "@/lib/gestore/prezzi-actions";
import type { Categoria } from "@/lib/types";
import ConfermaDialog from "@/components/gestore/ConfermaDialog";
import { Campo, ChevronSelect, Spinner, inputCls } from "@/components/gestore/ui";
import { useToast } from "@/components/gestore/Toaster";

// Attesa dopo l'ultimo tasto prima di derivare la regola: l'anteprima
// (centinaia di righe + riepilogo) ricalcola a digitazione ferma, non a ogni
// tasto — altrimenti l'input si blocca per secondi su CPU mobile.
const DEBOUNCE_VALORE_MS = 280;

// Righe dell'anteprima montate per blocco con "Mostra altri" (stesso pattern
// di GestoreMedia): con 1000+ prodotti montare tutto in un colpo satura DOM
// e memoria. Selezioni e riepilogo lavorano comunque sull'intero elenco.
const PRODOTTI_PER_BLOCCO = 50;

export default function GestorePrezzi({
  categorie,
  conteggi,
}: {
  categorie: Categoria[];
  /** Prodotti per categoria (id -> n), per i numeri accanto alle voci. */
  conteggi: Record<string, number>;
}) {
  const { mostra } = useToast();

  // --- Passo 1: selezione categorie -----------------------------------------
  const [selCategorie, setSelCategorie] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [prodotti, setProdotti] = useState<ProdottoPrezzi[] | null>(null);
  const [esclusi, setEsclusi] = useState<ReadonlySet<string>>(new Set());
  const [caricando, startCarica] = useTransition();

  const gruppi = useMemo(() => gruppiCategorie(categorie), [categorie]);

  // Conteggio aggregato per nodo (nodo + discendenti): e il numero che ci si
  // aspetta accanto a "T-shirt" (tutte le t-shirt, non solo quelle senza
  // sottocategoria).
  const contiNodo = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of categorie) {
      m.set(
        c.id,
        idConDiscendenti(categorie, c.id).reduce(
          (s, id) => s + (conteggi[id] ?? 0),
          0,
        ),
      );
    }
    return m;
  }, [categorie, conteggi]);

  // Discendenti delle categorie selezionate: nell'albero appaiono spuntati e
  // disabilitati ("gia inclusi dalla voce sopra").
  const coperti = useMemo(() => {
    const s = new Set<string>();
    for (const id of selCategorie) {
      for (const d of idConDiscendenti(categorie, id).slice(1)) s.add(d);
    }
    return s;
  }, [selCategorie, categorie]);

  // Insieme effettivo (selezionate + discendenti) e stima prodotti coinvolti.
  const effettive = useMemo(() => {
    const s = new Set<string>();
    for (const id of selCategorie) {
      for (const d of idConDiscendenti(categorie, id)) s.add(d);
    }
    return s;
  }, [selCategorie, categorie]);
  const stimaProdotti = useMemo(
    () => [...effettive].reduce((s, id) => s + (conteggi[id] ?? 0), 0),
    [effettive, conteggi],
  );

  function toggleCategoria(id: string) {
    if (coperti.has(id)) return; // inclusa da un antenato: si agisce su quello
    setSelCategorie((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function caricaProdotti() {
    const ids = [...selCategorie];
    startCarica(async () => {
      const esito = await prodottiPerCategorieAction(ids);
      if (!esito.ok || !esito.prodotti) {
        mostra(esito.error ?? "Impossibile caricare i prodotti.", "errore");
        return;
      }
      setProdotti(esito.prodotti);
      setEsclusi(new Set());
      setLimiteRighe(PRODOTTI_PER_BLOCCO);
    });
  }

  // --- Passo 2: regola -------------------------------------------------------
  const [direzione, setDirezione] = useState<DirezionePrezzi>("aumenta");
  const [modo, setModo] = useState<ModoPrezzi>("percento");
  const [valoreTxt, setValoreTxt] = useState("");
  const [arrotonda, setArrotonda] = useState<ArrotondamentoPrezzi>("no");

  // Copia "a digitazione ferma" di valoreTxt: l'input resta reattivo (legge
  // valoreTxt), la regola e tutto cio che ne deriva ripartono solo quando la
  // digitazione si e fermata (setState nel timeout, mai sincrono nell'effect).
  const [valoreFermo, setValoreFermo] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setValoreFermo(valoreTxt), DEBOUNCE_VALORE_MS);
    return () => clearTimeout(t);
  }, [valoreTxt]);

  // Deriva la regola da un testo, o null finche non e un numero sensato.
  // Callback e non solo useMemo: serve anche al click su "Applica" per
  // validare il valore VIVO (valoreTxt) senza aspettare il debounce.
  const regolaDa = useCallback(
    (testo: string): RegolaPrezzi | null => {
      const txt = testo.trim();
      if (!txt) return null;
      const valore =
        modo === "percento"
          ? Number(txt.replace(",", "."))
          : (parsePrezzoCents(txt) ?? Number.NaN);
      if (!Number.isFinite(valore)) return null;
      return { direzione, modo, valore, arrotonda };
    },
    [modo, direzione, arrotonda],
  );

  // Regola corrente (segue il valore fermo, a digitazione conclusa).
  const regola: RegolaPrezzi | null = useMemo(
    () => regolaDa(valoreFermo),
    [regolaDa, valoreFermo],
  );

  // L'errore segue il valore fermo (come la regola): niente "numero non
  // valido" lampeggiato mentre si sta ancora scrivendo.
  const erroreRegola =
    valoreFermo.trim() === ""
      ? null
      : regola
        ? validaRegolaPrezzi(regola)
        : "Inserisci un numero valido.";
  const regolaValida = regola != null && erroreRegola == null;

  // --- Passo 3: anteprima, selezione prodotti e applicazione ----------------
  const [confermaAperta, setConfermaAperta] = useState(false);
  const [applicando, startApplica] = useTransition();
  const [limiteRighe, setLimiteRighe] = useState(PRODOTTI_PER_BLOCCO);

  const selezionati = useMemo(
    () => (prodotti ?? []).filter((p) => !esclusi.has(p.id)),
    [prodotti, esclusi],
  );

  // Riepilogo dell'anteprima sui soli selezionati: totale prima/dopo e quanti
  // verrebbero saltati (risultato fuori dai limiti di sicurezza).
  const riepilogo = useMemo(() => {
    if (!regolaValida || !regola) return null;
    let prima = 0;
    let dopo = 0;
    let saltati = 0;
    let cambiano = 0;
    for (const p of selezionati) {
      const nuovo = calcolaNuovoPrezzoCents(p.prezzo_cents, regola);
      if (nuovo == null) {
        saltati++;
        continue;
      }
      prima += p.prezzo_cents;
      dopo += nuovo;
      if (nuovo !== p.prezzo_cents) cambiano++;
    }
    return { prima, dopo, saltati, cambiano };
  }, [selezionati, regola, regolaValida]);

  // Righe montate nell'anteprima (primo blocco + "Mostra altri"), con nuovo
  // prezzo ed etichetta categoria gia risolti: si ricalcolano solo al cambio
  // di regola/blocco/elenco, e le righe memoizzate ridisegnano solo se le
  // loro props cambiano davvero.
  const righeVisibili = useMemo(
    () =>
      (prodotti ?? []).slice(0, limiteRighe).map((p) => ({
        prodotto: p,
        etichetta: p.categoria_id
          ? etichettaCategoria(categorie, p.categoria_id)
          : "Senza categoria",
        nuovo:
          regolaValida && regola
            ? calcolaNuovoPrezzoCents(p.prezzo_cents, regola)
            : undefined,
      })),
    [prodotti, limiteRighe, categorie, regola, regolaValida],
  );

  // Callback stabile: le righe memoizzate non ridisegnano per colpa sua.
  const toggleProdotto = useCallback((id: string) => {
    setEsclusi((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  function applica() {
    if (!regola || !regolaValida) return;
    const ids = selezionati.map((p) => p.id);
    const regolaDaApplicare = regola;
    startApplica(async () => {
      const esito = await modificaPrezziBulkAction(ids, regolaDaApplicare);
      if (!esito.ok) {
        setConfermaAperta(false);
        mostra(esito.error ?? "Impossibile aggiornare i prezzi.", "errore");
        return;
      }
      setConfermaAperta(false);
      // Il valore si azzera per evitare un secondo "Applica" involontario
      // (la stessa regola due volte = doppio aumento). Anche la copia ferma,
      // senza aspettare il debounce: la regola decade subito.
      setValoreTxt("");
      setValoreFermo("");
      mostra(
        `Prezzi aggiornati su ${esito.aggiornati ?? 0} ${
          (esito.aggiornati ?? 0) === 1 ? "prodotto" : "prodotti"
        }.` +
          ((esito.saltati ?? 0) > 0
            ? ` ${esito.saltati} saltati perché il risultato usciva dai limiti.`
            : ""),
      );
      // Ricarica l'elenco: le righe mostrano i prezzi REALI post-modifica.
      const ricarica = await prodottiPerCategorieAction([...selCategorie]);
      if (ricarica.ok && ricarica.prodotti) setProdotti(ricarica.prodotti);
    });
  }

  const descrizioneRegola = regola
    ? `${direzione === "aumenta" ? "aumento" : "riduzione"} ${
        modo === "percento"
          ? `del ${String(regola.valore).replace(".", ",")}%`
          : `di ${formatPrezzo(regola.valore)}`
      }${
        arrotonda === "novanta"
          ? ", arrotondato a ,90"
          : arrotonda === "intero"
            ? ", arrotondato all'euro"
            : ""
      }`
    : "";

  return (
    <div className="flex flex-col gap-6">
      {/* ------- Passo 1: categorie ------- */}
      <section className="rounded-3xl bg-white p-5 shadow-soft ring-1 ring-line">
        <IntestazionePasso
          numero={1}
          titolo="Scegli le categorie"
          extra={
            selCategorie.size > 0 && (
              <button
                type="button"
                onClick={() => setSelCategorie(new Set())}
                className="text-sm font-bold text-sea hover:underline"
              >
                Azzera
              </button>
            )
          }
        />
        <p className="mt-1 text-sm text-muted">
          Spuntando una voce includi anche tutte le sue sottocategorie.
        </p>

        <div className="mt-4 flex flex-col gap-4">
          {gruppi.map(({ radice, figlie }) => (
            <div key={radice.id}>
              <RigaCategoria
                categoria={radice}
                conteggio={contiNodo.get(radice.id) ?? 0}
                spuntata={selCategorie.has(radice.id) || coperti.has(radice.id)}
                coperta={coperti.has(radice.id)}
                onToggle={toggleCategoria}
                macro
              />
              {figlie.length > 0 && (
                <div className="mt-1.5 flex flex-col gap-1.5 pl-6">
                  {figlie.map(({ figlia, nipoti }) => (
                    <div key={figlia.id}>
                      <RigaCategoria
                        categoria={figlia}
                        conteggio={contiNodo.get(figlia.id) ?? 0}
                        spuntata={
                          selCategorie.has(figlia.id) || coperti.has(figlia.id)
                        }
                        coperta={coperti.has(figlia.id)}
                        onToggle={toggleCategoria}
                      />
                      {nipoti.length > 0 && (
                        <div className="mt-1.5 flex flex-col gap-1.5 pl-6">
                          {nipoti.map((nipote) => (
                            <RigaCategoria
                              key={nipote.id}
                              categoria={nipote}
                              conteggio={contiNodo.get(nipote.id) ?? 0}
                              spuntata={
                                selCategorie.has(nipote.id) ||
                                coperti.has(nipote.id)
                              }
                              coperta={coperti.has(nipote.id)}
                              onToggle={toggleCategoria}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-5">
          <button
            type="button"
            onClick={caricaProdotti}
            disabled={selCategorie.size === 0 || caricando}
            className="inline-flex h-12 items-center gap-2 rounded-full bg-sea px-6 font-display text-sm font-bold text-white shadow-sea transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
          >
            {caricando && <Spinner className="h-4 w-4 text-white" />}
            {caricando
              ? "Carico…"
              : prodotti === null
                ? `Carica i prodotti${stimaProdotti > 0 ? ` (${stimaProdotti})` : ""}`
                : `Aggiorna l'elenco${stimaProdotti > 0 ? ` (${stimaProdotti})` : ""}`}
          </button>
        </div>
      </section>

      {/* ------- Passo 2: regola ------- */}
      <section className="rounded-3xl bg-white p-5 shadow-soft ring-1 ring-line">
        <IntestazionePasso numero={2} titolo="Imposta la modifica" />

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Campo label="Cosa fare">
            <Segmento
              opzioni={[
                { valore: "aumenta", etichetta: "Aumenta" },
                { valore: "diminuisci", etichetta: "Diminuisci" },
              ]}
              attivo={direzione}
              onCambia={(v) => setDirezione(v as DirezionePrezzi)}
            />
          </Campo>
          <Campo label="Come">
            <Segmento
              opzioni={[
                { valore: "percento", etichetta: "In percentuale (%)" },
                { valore: "euro", etichetta: "In euro (€)" },
              ]}
              attivo={modo}
              onCambia={(v) => setModo(v as ModoPrezzi)}
            />
          </Campo>
          <Campo
            label={modo === "percento" ? "Percentuale" : "Importo"}
            htmlFor="prezzi-valore"
            hint={
              modo === "percento"
                ? "Es. 10 per il 10%."
                : "Es. 2,50 per due euro e cinquanta."
            }
            errore={erroreRegola ?? undefined}
          >
            <div className="relative">
              <input
                id="prezzi-valore"
                type="text"
                inputMode="decimal"
                value={valoreTxt}
                onChange={(e) => setValoreTxt(e.target.value)}
                placeholder={modo === "percento" ? "10" : "2,50"}
                className={`${inputCls} pr-10`}
              />
              <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center font-display font-bold text-muted">
                {modo === "percento" ? "%" : "€"}
              </span>
            </div>
          </Campo>
          <Campo
            label="Arrotondamento"
            htmlFor="prezzi-arrotonda"
            hint="Applicato al prezzo finale di ogni prodotto."
          >
            <div className="relative">
              <select
                id="prezzi-arrotonda"
                value={arrotonda}
                onChange={(e) =>
                  setArrotonda(e.target.value as ArrotondamentoPrezzi)
                }
                className={`${inputCls} appearance-none pr-10`}
              >
                <option value="no">Nessuno (centesimi esatti)</option>
                <option value="novanta">A ,90 (es. 17,90 €)</option>
                <option value="intero">All&apos;euro intero (es. 18 €)</option>
              </select>
              <ChevronSelect />
            </div>
          </Campo>
        </div>

        {regolaValida && regola && (
          <p className="mt-4 rounded-2xl bg-surface px-4 py-3 text-sm text-foreground">
            Esempio: un prodotto da{" "}
            <strong className="tabular-nums">{formatPrezzo(1990)}</strong>{" "}
            passerebbe a{" "}
            <strong className="tabular-nums text-sea">
              {(() => {
                const n = calcolaNuovoPrezzoCents(1990, regola);
                return n == null ? "fuori limiti" : formatPrezzo(n);
              })()}
            </strong>
            .
          </p>
        )}
      </section>

      {/* ------- Passo 3: anteprima e conferma ------- */}
      <section className="rounded-3xl bg-white p-5 shadow-soft ring-1 ring-line">
        <IntestazionePasso
          numero={3}
          titolo="Controlla e conferma"
          extra={
            prodotti && prodotti.length > 0 ? (
              <span className="text-sm tabular-nums text-muted">
                {selezionati.length} di {prodotti.length} selezionati
              </span>
            ) : null
          }
        />

        {prodotti === null ? (
          <p className="mt-4 rounded-2xl bg-surface px-4 py-6 text-center text-sm text-muted">
            Scegli le categorie qui sopra e premi &laquo;Carica i
            prodotti&raquo;.
          </p>
        ) : prodotti.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-surface px-4 py-6 text-center text-sm text-muted">
            Nessun prodotto nelle categorie scelte.
          </p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setEsclusi(new Set())}
                disabled={esclusi.size === 0}
                className="rounded-full px-3.5 py-1.5 text-sm font-bold text-sea ring-1 ring-sea/40 transition-colors hover:bg-sea/10 disabled:opacity-40"
              >
                Seleziona tutti
              </button>
              <button
                type="button"
                onClick={() => setEsclusi(new Set(prodotti.map((p) => p.id)))}
                disabled={selezionati.length === 0}
                className="rounded-full px-3.5 py-1.5 text-sm font-bold text-muted ring-1 ring-line transition-colors hover:bg-surface disabled:opacity-40"
              >
                Deseleziona tutti
              </button>
            </div>

            <ul className="mt-4 flex flex-col gap-2 lg:gap-0 lg:divide-y lg:divide-line lg:overflow-hidden lg:rounded-2xl lg:ring-1 lg:ring-line">
              {righeVisibili.map(({ prodotto: p, etichetta, nuovo }) => (
                <RigaProdottoPrezzi
                  key={p.id}
                  id={p.id}
                  nome={p.nome}
                  attivo={p.attivo}
                  prezzoCents={p.prezzo_cents}
                  valuta={p.valuta}
                  immagineUrl={p.immagine_url}
                  etichetta={etichetta}
                  incluso={!esclusi.has(p.id)}
                  nuovo={nuovo}
                  onToggle={toggleProdotto}
                />
              ))}
            </ul>

            {prodotti.length > righeVisibili.length && (
              <div className="mt-4 flex flex-col items-center gap-2">
                <p className="text-sm tabular-nums text-muted">
                  Hai visto {righeVisibili.length} prodotti di {prodotti.length}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setLimiteRighe(righeVisibili.length + PRODOTTI_PER_BLOCCO)
                  }
                  className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-7 font-display text-sm font-bold text-sea ring-2 ring-sea transition-all hover:-translate-y-0.5 hover:bg-surface"
                >
                  Mostra altri
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* Barra di applicazione (sopra la bottom-nav mobile, come la lista). */}
      {prodotti && prodotti.length > 0 && selezionati.length > 0 && (
        <div className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 md:inset-x-auto md:bottom-6 md:left-1/2 md:w-auto md:-translate-x-1/2">
          <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-2.5 rounded-3xl bg-foreground p-3 text-white shadow-[0_18px_50px_-12px_rgba(10,31,51,0.55)] md:flex-nowrap md:rounded-full md:py-2.5 md:pl-5">
            <span className="min-w-0 flex-1 font-display text-sm font-bold">
              {regolaValida && riepilogo ? (
                <>
                  {selezionati.length}{" "}
                  {selezionati.length === 1 ? "prodotto" : "prodotti"} ·{" "}
                  <span className="tabular-nums">
                    da {formatPrezzo(riepilogo.prima)} a{" "}
                    {formatPrezzo(riepilogo.dopo)}
                  </span>
                  {riepilogo.saltati > 0 && (
                    <span className="text-white/70">
                      {" "}
                      · {riepilogo.saltati} saltati
                    </span>
                  )}
                </>
              ) : (
                <>
                  {selezionati.length}{" "}
                  {selezionati.length === 1 ? "prodotto" : "prodotti"} — imposta
                  la modifica al passo 2
                </>
              )}
            </span>
            <button
              type="button"
              onClick={() => {
                // Il debounce (~280ms) potrebbe non aver ancora recepito
                // l'ultima digitazione: si valida il valore VIVO e si
                // allinea subito la copia ferma, cosi il dialog non puo
                // aprirsi su una regola gia decaduta (conferma no-op).
                setValoreFermo(valoreTxt);
                const viva = regolaDa(valoreTxt);
                if (!viva || validaRegolaPrezzi(viva) != null) return;
                setConfermaAperta(true);
              }}
              disabled={
                !regolaValida || applicando || (riepilogo?.cambiano ?? 0) === 0
              }
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-sea px-6 font-display text-sm font-bold text-white shadow-sea transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
            >
              {applicando && <Spinner className="h-4 w-4 text-white" />}
              {applicando ? "Applico…" : "Applica"}
            </button>
          </div>
        </div>
      )}

      <ConfermaDialog
        aperto={confermaAperta}
        titolo="Applicare la modifica ai prezzi?"
        messaggio={`Stai per applicare ${descrizioneRegola} a ${selezionati.length} ${
          selezionati.length === 1 ? "prodotto" : "prodotti"
        }. I prezzi attuali verranno sovrascritti${
          riepilogo && riepilogo.saltati > 0
            ? ` (${riepilogo.saltati} verranno saltati perché il risultato uscirebbe dai limiti)`
            : ""
        }.`}
        etichettaConferma="Applica"
        inCorso={applicando}
        onConferma={applica}
        onAnnulla={() => !applicando && setConfermaAperta(false)}
      />
    </div>
  );
}

/** Numerino cerchiato + titolo di sezione, con eventuale extra a destra. */
function IntestazionePasso({
  numero,
  titolo,
  extra,
}: {
  numero: number;
  titolo: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2.5 font-display text-base font-extrabold text-foreground">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-sea text-sm font-bold text-white">
          {numero}
        </span>
        {titolo}
      </h2>
      {extra}
    </div>
  );
}

/** Controllo a due (o piu) opzioni mutuamente esclusive, stile "pillola". */
function Segmento({
  opzioni,
  attivo,
  onCambia,
}: {
  opzioni: { valore: string; etichetta: string }[];
  attivo: string;
  onCambia: (valore: string) => void;
}) {
  return (
    <div
      role="radiogroup"
      className="grid h-12 grid-flow-col auto-cols-fr items-stretch gap-1 rounded-2xl bg-surface p-1 ring-1 ring-line"
    >
      {opzioni.map((o) => {
        const on = o.valore === attivo;
        return (
          <button
            key={o.valore}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onCambia(o.valore)}
            className={[
              "rounded-xl px-3 font-display text-sm font-bold transition-colors",
              on
                ? "bg-sea text-white shadow-sea"
                : "text-muted hover:text-foreground",
            ].join(" ")}
          >
            {o.etichetta}
          </button>
        );
      })}
    </div>
  );
}

/** Riga dell'albero categorie: checkbox + nome + conteggio prodotti. */
function RigaCategoria({
  categoria,
  conteggio,
  spuntata,
  coperta,
  onToggle,
  macro = false,
}: {
  categoria: Categoria;
  conteggio: number;
  spuntata: boolean;
  /** Inclusa da un antenato spuntato: mostrata attiva ma non toccabile. */
  coperta: boolean;
  onToggle: (id: string) => void;
  macro?: boolean;
}) {
  return (
    <label
      className={[
        "flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-surface",
        coperta ? "cursor-default opacity-60" : "",
      ].join(" ")}
    >
      <input
        type="checkbox"
        checked={spuntata}
        disabled={coperta}
        onChange={() => onToggle(categoria.id)}
        className="h-5 w-5 shrink-0 cursor-pointer rounded accent-sea disabled:cursor-default"
      />
      <span
        className={`min-w-0 truncate text-sm ${
          macro
            ? "font-display font-extrabold text-foreground"
            : "font-medium text-foreground"
        }`}
      >
        {categoria.nome}
      </span>
      <span className="ml-auto shrink-0 text-xs tabular-nums text-muted">
        {conteggio}
      </span>
    </label>
  );
}

/**
 * Riga dell'anteprima prezzi, memoizzata con props primitive: quando cambia
 * la regola ridisegnano solo le righe il cui esito cambia davvero, e spuntare
 * un prodotto non ridisegna tutte le altre.
 */
const RigaProdottoPrezzi = memo(function RigaProdottoPrezzi({
  id,
  nome,
  attivo,
  prezzoCents,
  valuta,
  immagineUrl,
  etichetta,
  incluso,
  nuovo,
  onToggle,
}: {
  id: string;
  nome: string;
  attivo: boolean;
  prezzoCents: number;
  valuta: string;
  immagineUrl: string | null;
  /** Percorso leggibile della categoria, gia risolto dal genitore. */
  etichetta: string;
  incluso: boolean;
  /** Nuovo prezzo: undefined = regola non impostata, null = fuori limiti. */
  nuovo: number | null | undefined;
  onToggle: (id: string) => void;
}) {
  return (
    <li
      className={[
        "flex items-center gap-3 rounded-2xl p-3 ring-1 transition-all lg:rounded-none lg:px-4 lg:py-2.5 lg:ring-0",
        incluso
          ? "bg-white ring-line lg:bg-sea/5"
          : "bg-white opacity-55 ring-line lg:bg-white",
      ].join(" ")}
    >
      <input
        type="checkbox"
        aria-label={`Includi ${nome}`}
        checked={incluso}
        onChange={() => onToggle(id)}
        className="h-5 w-5 shrink-0 cursor-pointer rounded accent-sea"
      />
      <MiniaturaPrezzi url={immagineUrl} nome={nome} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-sm font-bold text-foreground">
          {nome}
          {!attivo && (
            <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-muted">
              Nascosto
            </span>
          )}
        </p>
        <p className="truncate text-xs text-muted">{etichetta}</p>
      </div>
      <div className="shrink-0 text-right tabular-nums">
        {nuovo === undefined ? (
          <span className="text-sm font-bold text-sea">
            {formatPrezzo(prezzoCents, valuta)}
          </span>
        ) : nuovo == null ? (
          <>
            <span className="block text-sm font-bold text-foreground">
              {formatPrezzo(prezzoCents, valuta)}
            </span>
            <span className="rounded-full bg-sun/25 px-2 py-0.5 text-[11px] font-bold text-[#8a6500]">
              fuori limiti: saltato
            </span>
          </>
        ) : nuovo === prezzoCents ? (
          <>
            <span className="block text-sm font-bold text-foreground">
              {formatPrezzo(prezzoCents, valuta)}
            </span>
            <span className="text-[11px] font-bold text-muted">invariato</span>
          </>
        ) : (
          <>
            <span className="block text-xs text-muted line-through">
              {formatPrezzo(prezzoCents, valuta)}
            </span>
            <span
              className={`block text-sm font-bold ${
                nuovo > prezzoCents ? "text-foreground" : "text-sea"
              }`}
            >
              {formatPrezzo(nuovo, valuta)}
            </span>
          </>
        )}
      </div>
    </li>
  );
});

/** Miniatura compatta (come la lista prodotti, ma quadrata e piu piccola). */
function MiniaturaPrezzi({ url, nome }: { url: string | null; nome: string }) {
  return (
    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-surface ring-1 ring-line">
      {url ? (
        // Miniatura via optimizer di Next (lazy, ~44px): mai il master pieno
        // da 2560px usato come thumbnail (pattern GestoreMedia).
        <Image
          src={url}
          alt={nome}
          fill
          sizes="44px"
          quality={75}
          loading="lazy"
          className="object-cover"
        />
      ) : (
        <div className="tile-cyan h-full w-full" />
      )}
    </div>
  );
}
