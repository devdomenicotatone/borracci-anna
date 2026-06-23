"use client";

// CartProvider — stato del carrello lato client per la vetrina.
//
// Perche esiste: il cookie "cart_id" e httpOnly, quindi il client NON puo
// leggere il carrello da solo. Il layout server legge lo stato (statoCarrello)
// e lo passa come `statoIniziale`; da li in poi il provider e la fonte di
// verita client per badge, mini-cart e pagina carrello.
//
// Feedback istantaneo: useOptimistic (React 19) applica subito la modifica
// (incremento badge, +/- quantita, rimozione) mentre la Server Action gira;
// alla risposta lo stato reale rimpiazza l'ottimistico. Le Server Actions
// ritornano l'EsitoCarrello aggiornato, quindi niente round-trip extra.
//
// IMPORTANTE: i metodi chiamano `applica()` (dispatch ottimistico) PRIMA del
// primo await; vanno percio invocati dentro una transition del chiamante
// (es. startTransition in AddToCart/CartItem), come da pattern React 19.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useOptimistic,
  useState,
} from "react";

import {
  aggiungiAlCarrello,
  aggiornaQuantita,
  rimuoviDalCarrello,
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

/** Riduce lo stato ottimistico applicando una singola azione. */
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
  const [righeOttimistiche, applica] = useOptimistic(righe, riduci);
  const [drawerAperto, setDrawerAperto] = useState(false);

  const apriDrawer = useCallback(() => setDrawerAperto(true), []);
  const chiudiDrawer = useCallback(() => setDrawerAperto(false), []);

  /** Allinea lo stato reale all'esito server (solo se ok). */
  const riconcilia = useCallback((esito: EsitoCarrello) => {
    if (esito.ok) {
      setRighe(esito.righe);
    }
  }, []);

  const aggiungi = useCallback<CartContextValue["aggiungi"]>(
    async ({ prodotto, variante, quantita }) => {
      // Riga ottimistica (id provvisorio, rimpiazzata dall'esito reale).
      applica({
        tipo: "aggiungi",
        riga: { id: `ott-${variante.id}`, quantita, prodotto, variante },
      });

      const esito = await aggiungiAlCarrello(variante.id, quantita);
      riconcilia(esito);

      if (esito.ok) {
        setDrawerAperto(true);
        if (esito.avviso) {
          mostra(esito.avviso, "errore");
        }
      } else if (esito.motivo === "esaurito") {
        mostra("Articolo esaurito.", "errore");
      } else if (esito.motivo !== "non_configurato") {
        mostra("Impossibile aggiungere al carrello. Riprova.", "errore");
      }
    },
    [applica, mostra, riconcilia],
  );

  const aggiorna = useCallback<CartContextValue["aggiorna"]>(
    async (rigaId, quantita) => {
      applica({ tipo: "quantita", rigaId, quantita });
      const esito = await aggiornaQuantita(rigaId, quantita);
      riconcilia(esito);
      if (esito.ok && esito.avviso) {
        mostra(esito.avviso, "errore");
      } else if (!esito.ok && esito.motivo !== "non_configurato") {
        mostra("Aggiornamento non riuscito. Riprova.", "errore");
      }
    },
    [applica, mostra, riconcilia],
  );

  const rimuovi = useCallback<CartContextValue["rimuovi"]>(
    async (rigaId) => {
      applica({ tipo: "rimuovi", rigaId });
      const esito = await rimuoviDalCarrello(rigaId);
      riconcilia(esito);
      if (!esito.ok && esito.motivo !== "non_configurato") {
        mostra("Rimozione non riuscita. Riprova.", "errore");
      }
    },
    [applica, mostra, riconcilia],
  );

  const svuota = useCallback<CartContextValue["svuota"]>(async () => {
    applica({ tipo: "svuota" });
    const esito = await svuotaCarrello();
    if (esito.ok) {
      setRighe([]);
    }
  }, [applica]);

  const count = righeOttimistiche.reduce((a, r) => a + r.quantita, 0);
  const subtotaleCents = righeOttimistiche.reduce(
    (a, r) => a + r.prodotto.prezzo_cents * r.quantita,
    0,
  );
  const valuta = righeOttimistiche[0]?.prodotto.valuta ?? statoIniziale.valuta;

  const value = useMemo<CartContextValue>(
    () => ({
      righe: righeOttimistiche,
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
    }),
    [
      righeOttimistiche,
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
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
