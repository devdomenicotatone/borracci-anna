"use client";

// CartProvider — stato del carrello lato client per la vetrina.
//
// Perche esiste: il cookie "cart_id" e httpOnly, quindi il client NON puo
// leggere il carrello da solo. Il layout server legge lo stato (statoCarrello)
// e lo passa come `statoIniziale`; da li in poi il provider e la fonte di
// verita client per badge, mini-cart e pagina carrello.
//
// Feedback istantaneo (ottimistico "manuale"): ogni metodo applica SUBITO la
// modifica allo stato reale (incremento badge, +/- quantita, rimozione) e, alla
// risposta della Server Action, RIMPIAZZA lo stato con l'esito vero. In caso di
// errore ripristina lo snapshot pre-modifica.
//
// Perche non useOptimistic: la sua azione "aggiungi" e un DELTA che resta
// applicato sopra lo stato base finche la transition non si chiude; ma noi
// aggiorniamo lo stato base al valore server appena la Server Action risponde,
// e nell'istante di sovrapposizione il carrello mostrava base + delta = DOPPIO
// (es. aggiungi 4 -> lampeggia 8 -> torna 4). Rimpiazzare invece di sommare
// elimina la sovrapposizione: la riconciliazione e idempotente.
//
// Stepper quantita (aggiorna): i tap si accumulano SUBITO sullo stato
// ottimistico; la Server Action parte una sola volta ~400ms dopo l'ultimo tap
// (debounce last-write-wins per riga). Un contatore di generazione per riga
// scarta le risposte arrivate fuori ordine, cosi una risposta vecchia non
// sovrascrive uno stato piu recente; in caso di errore si torna all'ultimo
// stato confermato dal server (`righeConfermate`) con toast. Le SCRITTURE
// della stessa riga sono inoltre serializzate (catena per riga): la prossima
// parte solo quando la precedente si e assestata, cosi anche l'ordine di
// ESECUZIONE lato server segue i tap e il server non puo restare con una
// quantita vecchia applicata dopo quella nuova.
//
// Prima di pagare (checkout/richiesta): `attendiSincronizzazioni` fa scattare
// subito i debounce pendenti e attende le scritture in volo, cosi il server
// non legge quantita piu vecchie di quelle mostrate all'utente.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  aggiungiAlCarrello,
  aggiornaQuantita,
  rimuoviDalCarrello,
  statoCarrello,
  svuotaCarrello,
} from "@/lib/cart";
import { useToast } from "@/components/Toaster";
import type {
  EsitoCarrello,
  Prodotto,
  RigaCarrello,
  Variante,
} from "@/lib/types";

type AzioneOttimistica =
  | { tipo: "aggiungi"; riga: RigaCarrello }
  | { tipo: "quantita"; rigaId: string; quantita: number }
  | { tipo: "rimuovi"; rigaId: string }
  | { tipo: "svuota" };

/** Riduce lo stato applicando una singola azione (usato per l'ottimistico). */
function riduci(
  righe: RigaCarrello[],
  azione: AzioneOttimistica,
): RigaCarrello[] {
  switch (azione.tipo) {
    case "aggiungi": {
      const i = righe.findIndex(
        (r) => r.variante.id === azione.riga.variante.id,
      );
      if (i >= 0) {
        const copia = righe.slice();
        copia[i] = {
          ...copia[i],
          quantita: copia[i].quantita + azione.riga.quantita,
        };
        return copia;
      }
      return [...righe, azione.riga];
    }
    case "quantita":
      return righe.map((r) =>
        r.id === azione.rigaId ? { ...r, quantita: azione.quantita } : r,
      );
    case "rimuovi":
      return righe.filter((r) => r.id !== azione.rigaId);
    case "svuota":
      return [];
  }
}

/** Attesa dopo l'ultimo tap sullo stepper prima di chiamare la Server Action. */
const DEBOUNCE_QUANTITA_MS = 400;

/** Sincronizzazione quantita in corso per una riga (debounce o richiesta in volo). */
interface SyncQuantita {
  /** Timer del debounce; null quando la richiesta e gia partita. */
  timer: ReturnType<typeof setTimeout> | null;
  /** Ultimo valore chiesto dall'utente (last-write-wins). */
  quantita: number;
  /** Resolver delle promise dei tap in attesa del prossimo invio. */
  inAttesa: Array<() => void>;
  /**
   * Resolver di chi attende la fine di TUTTA la sincronizzazione della riga
   * (attendiSincronizzazioni): sbloccati quando la entry viene rimossa.
   */
  alTermine: Array<() => void>;
}

interface CartContextValue {
  /** Righe correnti (ottimistiche): fonte di verita per UI client. */
  righe: RigaCarrello[];
  /** Somma delle quantita (badge). */
  count: number;
  /** Subtotale in centesimi. */
  subtotaleCents: number;
  valuta: string;
  /** Stato del mini-cart drawer. */
  drawerAperto: boolean;
  apriDrawer: () => void;
  chiudiDrawer: () => void;
  /** Aggiunge una variante e apre il mini-cart. */
  aggiungi: (input: {
    prodotto: Prodotto;
    variante: Variante;
    quantita: number;
  }) => Promise<void>;
  /**
   * Imposta la quantita di una riga: feedback ottimistico immediato, Server
   * Action coalizzata con debounce (l'ultimo valore vince). La promise si
   * risolve quando l'invio che include questa scrittura si conclude.
   */
  aggiorna: (rigaId: string, quantita: number) => Promise<void>;
  rimuovi: (rigaId: string) => Promise<void>;
  svuota: () => Promise<void>;
  /** Rilegge il carrello dal server (es. dopo che il checkout lo ha riconciliato). */
  ricarica: () => Promise<void>;
  /**
   * Flush pre-pagamento: fa scattare SUBITO i debounce quantita pendenti e
   * attende la conclusione delle scritture in volo. Si risolve anche in caso
   * di errore (fa fede il rollback), cosi checkout e invio richiesta leggono
   * dal server le quantita che l'utente vede.
   */
  attendiSincronizzazioni: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

export function useCarrello(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCarrello deve essere usato dentro <CartProvider>.");
  }
  return ctx;
}

export function CartProvider({
  statoIniziale,
  children,
}: {
  statoIniziale: EsitoCarrello;
  children: React.ReactNode;
}) {
  const { mostra } = useToast();
  const [righe, setRighe] = useState<RigaCarrello[]>(statoIniziale.righe);
  const [drawerAperto, setDrawerAperto] = useState(false);

  // `righe` (closure) e lo snapshot pre-modifica per il rollback in caso di
  // errore: e tra le dipendenze dei metodi, che quindi si rigenerano a ogni
  // cambio del carrello — nessun costo extra, il context cambia comunque.

  // --- Stepper quantita: tap accumulati + debounce last-write-wins ---------
  // `syncQuantita` tiene, per riga, la sincronizzazione in corso (timer del
  // debounce e/o richiesta in volo); `generazioneRiga` numera gli invii per
  // scartare le risposte fuori ordine; `righeConfermate` e l'ultimo stato
  // autorevole del server, target del rollback in caso di errore.
  // (Ref mutati solo in handler/timeout, mai durante il render.)
  const syncQuantita = useRef<Map<string, SyncQuantita>>(new Map());
  const generazioneRiga = useRef<Map<string, number>>(new Map());
  const righeConfermate = useRef<RigaCarrello[]>(statoIniziale.righe);
  // Coda delle scritture PER RIGA: la prossima chiamata al server parte solo
  // quando la precedente si e assestata, cosi l'ordine di ESECUZIONE lato
  // server segue i tap (i contatori di generazione scartano le risposte
  // vecchie solo lato client). Vive FUORI dalla entry di sincronizzazione:
  // sopravvive a rimuovi/svuota falliti e a entry ricreate, cosi una
  // scrittura orfana ancora in volo resta comunque ordinata con le nuove.
  // La entry si ripulisce da sola quando la catena si assesta ed e ancora
  // l'ultima della riga (mappa limitata alle righe attive).
  const catenaRiga = useRef<Map<string, Promise<void>>>(new Map());

  /**
   * Applica uno stato autorevole del server preservando le quantita
   * ottimistiche delle righe con sincronizzazione ancora in corso: cosi la
   * risposta di un'altra azione non fa "saltare indietro" lo stepper.
   */
  const applicaRigheServer = useCallback((nuove: RigaCarrello[]) => {
    righeConfermate.current = nuove;
    let visibili = nuove;
    for (const [rigaId, sync] of syncQuantita.current) {
      visibili = riduci(visibili, {
        tipo: "quantita",
        rigaId,
        quantita: sync.quantita,
      });
    }
    setRighe(visibili);
  }, []);

  /**
   * Annulla la sincronizzazione pendente di una riga (es. prima di rimuoverla):
   * ferma il debounce, invalida l'eventuale richiesta in volo (la risposta
   * verra scartata) e sblocca le promise in attesa (tap e flush).
   */
  const annullaSyncQuantita = useCallback((rigaId: string) => {
    const sync = syncQuantita.current.get(rigaId);
    if (!sync) return;
    if (sync.timer !== null) clearTimeout(sync.timer);
    syncQuantita.current.delete(rigaId);
    generazioneRiga.current.set(
      rigaId,
      (generazioneRiga.current.get(rigaId) ?? 0) + 1,
    );
    for (const risolvi of sync.inAttesa) risolvi();
    for (const risolvi of sync.alTermine) risolvi();
  }, []);

  const apriDrawer = useCallback(() => setDrawerAperto(true), []);
  const chiudiDrawer = useCallback(() => setDrawerAperto(false), []);

  const aggiungi = useCallback<CartContextValue["aggiungi"]>(
    async ({ prodotto, variante, quantita }) => {
      const snapshot = righe;
      // Feedback immediato: id provvisorio, rimpiazzato dall'esito reale.
      setRighe(
        riduci(righe, {
          tipo: "aggiungi",
          riga: { id: `ott-${variante.id}`, quantita, prodotto, variante },
        }),
      );

      const esito = await aggiungiAlCarrello(variante.id, quantita);

      if (esito.ok) {
        applicaRigheServer(esito.righe);
        setDrawerAperto(true);
        if (esito.avviso) {
          mostra(esito.avviso, "errore");
        }
      } else {
        setRighe(snapshot);
        if (esito.motivo === "esaurito") {
          mostra("Articolo esaurito.", "errore");
        } else if (esito.motivo !== "non_configurato") {
          mostra("Impossibile aggiungere al carrello. Riprova.", "errore");
        }
      }
    },
    [righe, mostra, applicaRigheServer],
  );

  /**
   * Corpo dell'invio coalizzato dello stepper: parte allo scadere del debounce
   * oppure subito (attendiSincronizzazioni). Chi lo chiama SENZA passare dal
   * timer deve prima cancellarlo con clearTimeout, altrimenti scatterebbe
   * comunque producendo un secondo invio.
   */
  const inviaQuantita = useCallback(
    async (rigaId: string, sync: SyncQuantita) => {
      sync.timer = null;
      // Numera l'invio: solo il piu recente puo applicare la risposta.
      const gen = (generazioneRiga.current.get(rigaId) ?? 0) + 1;
      generazioneRiga.current.set(rigaId, gen);
      const richiesta = sync.quantita;
      const daRisolvere = sync.inAttesa;
      sync.inAttesa = [];

      // Serializzazione per riga (vedi catenaRiga): la scrittura parte solo
      // quando la precedente si e assestata. Valore e generazione restano
      // quelli catturati QUI sopra, al dispatch: la semantica last-write-wins
      // non cambia.
      const precedente = catenaRiga.current.get(rigaId) ?? Promise.resolve();
      const invio = (async (): Promise<EsitoCarrello | null> => {
        // La catena non rigetta mai (gli errori diventano esito null), il
        // catch e solo una cintura di sicurezza.
        await precedente.catch(() => {});
        // Superata gia in coda (nuovo tap o annulla mentre si aspettava il
        // turno): il round-trip sarebbe morto — la risposta verrebbe scartata
        // e l'invio piu nuovo, gia serializzato dopo questo, scrivera il
        // valore giusto. Si salta la chiamata (accorcia anche il flush).
        if (gen !== generazioneRiga.current.get(rigaId) || sync.timer !== null) {
          return null;
        }
        try {
          return await aggiornaQuantita(rigaId, richiesta);
        } catch {
          // Errore di rete/imprevisto: trattato come esito negativo.
          return null;
        }
      })();
      const catena = invio.then(() => {});
      catenaRiga.current.set(rigaId, catena);
      void catena.then(() => {
        // Pulizia: se nessun invio piu nuovo ha allungato la catena, la
        // entry non serve piu.
        if (catenaRiga.current.get(rigaId) === catena) {
          catenaRiga.current.delete(rigaId);
        }
      });
      const esito = await invio;

      // Risposta superata se nel frattempo la riga e stata annullata
      // (rimuovi/svuota) o un tap ha rimesso in coda un invio piu nuovo:
      // sara quello a riconciliare, questa risposta va scartata.
      const superata =
        gen !== generazioneRiga.current.get(rigaId) || sync.timer !== null;
      if (!superata) {
        syncQuantita.current.delete(rigaId);
        if (esito?.ok) {
          applicaRigheServer(esito.righe);
          if (esito.avviso) {
            mostra(esito.avviso, "errore");
          }
        } else {
          // Rollback all'ultimo stato confermato dal server.
          applicaRigheServer(righeConfermate.current);
          if (esito === null || esito.motivo !== "non_configurato") {
            mostra("Aggiornamento non riuscito. Riprova.", "errore");
          }
        }
        // Sincronizzazione della riga conclusa (bene o male): sblocca anche
        // chi la attende tutta con attendiSincronizzazioni.
        for (const risolvi of sync.alTermine) risolvi();
      }
      for (const risolvi of daRisolvere) risolvi();
    },
    [mostra, applicaRigheServer],
  );

  const aggiorna = useCallback<CartContextValue["aggiorna"]>(
    (rigaId, quantita) => {
      // Feedback immediato: functional update, cosi i tap ravvicinati si
      // accumulano senza dipendere dalla closure su `righe`.
      setRighe((correnti) =>
        riduci(correnti, { tipo: "quantita", rigaId, quantita }),
      );

      // Coalizza gli invii: un'unica entry per riga, riusata dai tap successivi.
      const sync: SyncQuantita = syncQuantita.current.get(rigaId) ?? {
        timer: null,
        quantita,
        inAttesa: [],
        alTermine: [],
      };
      syncQuantita.current.set(rigaId, sync);
      sync.quantita = quantita; // last-write-wins
      if (sync.timer !== null) clearTimeout(sync.timer);

      return new Promise<void>((risolvi) => {
        sync.inAttesa.push(risolvi);
        sync.timer = setTimeout(() => {
          void inviaQuantita(rigaId, sync);
        }, DEBOUNCE_QUANTITA_MS);
      });
    },
    [inviaQuantita],
  );

  /**
   * Flush pre-pagamento: anticipa i debounce pendenti (cancellando i timer
   * originali, cosi nessun invio doppio) e attende che ogni riga con
   * sincronizzazione in corso arrivi a conclusione — anche in caso di errore,
   * dove fa fede il rollback di `inviaQuantita`. La semantica last-write-wins
   * resta intatta: e lo stesso invio del debounce, solo senza attesa.
   */
  const attendiSincronizzazioni = useCallback<
    CartContextValue["attendiSincronizzazioni"]
  >(async () => {
    const attese: Array<Promise<void>> = [];
    for (const [rigaId, sync] of syncQuantita.current) {
      if (sync.timer !== null) {
        clearTimeout(sync.timer);
        void inviaQuantita(rigaId, sync);
      }
      attese.push(new Promise<void>((risolvi) => sync.alTermine.push(risolvi)));
    }
    await Promise.all(attese);
  }, [inviaQuantita]);

  const rimuovi = useCallback<CartContextValue["rimuovi"]>(
    async (rigaId) => {
      // La rimozione supera un eventuale aggiornamento quantita in corso.
      annullaSyncQuantita(rigaId);
      const snapshot = righe;
      setRighe(riduci(righe, { tipo: "rimuovi", rigaId }));

      const esito = await rimuoviDalCarrello(rigaId);

      if (esito.ok) {
        applicaRigheServer(esito.righe);
      } else {
        setRighe(snapshot);
        if (esito.motivo !== "non_configurato") {
          mostra("Rimozione non riuscita. Riprova.", "errore");
        }
      }
    },
    [righe, mostra, annullaSyncQuantita, applicaRigheServer],
  );

  // Rilettura dal server: usata quando lo stato client puo essere disallineato
  // da una mutazione avvenuta FUORI dalle action del provider — es. il checkout
  // (/api/checkout) che riconcilia il carrello alle giacenze e risponde 409. Senza
  // questo, la lista mostrata resterebbe quella vecchia nonostante il "controllalo".
  const ricarica = useCallback<CartContextValue["ricarica"]>(async () => {
    const esito = await statoCarrello();
    if (esito.ok) applicaRigheServer(esito.righe);
  }, [applicaRigheServer]);

  const svuota = useCallback<CartContextValue["svuota"]>(async () => {
    // Lo svuotamento supera tutti gli aggiornamenti quantita in corso.
    for (const rigaId of Array.from(syncQuantita.current.keys())) {
      annullaSyncQuantita(rigaId);
    }
    const snapshot = righe;
    setRighe([]);

    const esito = await svuotaCarrello();

    if (esito.ok) {
      applicaRigheServer(esito.righe);
    } else {
      setRighe(snapshot);
      if (esito.motivo !== "non_configurato") {
        mostra("Svuotamento non riuscito. Riprova.", "errore");
      }
    }
  }, [righe, mostra, annullaSyncQuantita, applicaRigheServer]);

  const count = righe.reduce((a, r) => a + r.quantita, 0);
  const subtotaleCents = righe.reduce(
    (a, r) => a + r.prodotto.prezzo_cents * r.quantita,
    0,
  );
  const valuta = righe[0]?.prodotto.valuta ?? statoIniziale.valuta;

  const value = useMemo<CartContextValue>(
    () => ({
      righe,
      count,
      subtotaleCents,
      valuta,
      drawerAperto,
      apriDrawer,
      chiudiDrawer,
      aggiungi,
      aggiorna,
      rimuovi,
      svuota,
      ricarica,
      attendiSincronizzazioni,
    }),
    [
      righe,
      count,
      subtotaleCents,
      valuta,
      drawerAperto,
      apriDrawer,
      chiudiDrawer,
      aggiungi,
      aggiorna,
      rimuovi,
      svuota,
      ricarica,
      attendiSincronizzazioni,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
