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

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
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
  aggiorna: (rigaId: string, quantita: number) => Promise<void>;
  rimuovi: (rigaId: string) => Promise<void>;
  svuota: () => Promise<void>;
  /** Rilegge il carrello dal server (es. dopo che il checkout lo ha riconciliato). */
  ricarica: () => Promise<void>;
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
        setRighe(esito.righe);
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
    [righe, mostra],
  );

  const aggiorna = useCallback<CartContextValue["aggiorna"]>(
    async (rigaId, quantita) => {
      const snapshot = righe;
      setRighe(riduci(righe, { tipo: "quantita", rigaId, quantita }));

      const esito = await aggiornaQuantita(rigaId, quantita);

      if (esito.ok) {
        setRighe(esito.righe);
        if (esito.avviso) {
          mostra(esito.avviso, "errore");
        }
      } else {
        setRighe(snapshot);
        if (esito.motivo !== "non_configurato") {
          mostra("Aggiornamento non riuscito. Riprova.", "errore");
        }
      }
    },
    [righe, mostra],
  );

  const rimuovi = useCallback<CartContextValue["rimuovi"]>(
    async (rigaId) => {
      const snapshot = righe;
      setRighe(riduci(righe, { tipo: "rimuovi", rigaId }));

      const esito = await rimuoviDalCarrello(rigaId);

      if (esito.ok) {
        setRighe(esito.righe);
      } else {
        setRighe(snapshot);
        if (esito.motivo !== "non_configurato") {
          mostra("Rimozione non riuscita. Riprova.", "errore");
        }
      }
    },
    [righe, mostra],
  );

  // Rilettura dal server: usata quando lo stato client puo essere disallineato
  // da una mutazione avvenuta FUORI dalle action del provider — es. il checkout
  // (/api/checkout) che riconcilia il carrello alle giacenze e risponde 409. Senza
  // questo, la lista mostrata resterebbe quella vecchia nonostante il "controllalo".
  const ricarica = useCallback<CartContextValue["ricarica"]>(async () => {
    const esito = await statoCarrello();
    if (esito.ok) setRighe(esito.righe);
  }, []);

  const svuota = useCallback<CartContextValue["svuota"]>(async () => {
    const snapshot = righe;
    setRighe([]);

    const esito = await svuotaCarrello();

    if (esito.ok) {
      setRighe(esito.righe);
    } else {
      setRighe(snapshot);
      if (esito.motivo !== "non_configurato") {
        mostra("Svuotamento non riuscito. Riprova.", "errore");
      }
    }
  }, [righe, mostra]);

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
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
