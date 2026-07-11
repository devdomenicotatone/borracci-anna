"use client";

// Sincronizzazione preferiti <-> account. Montato nel layout vetrina con lo
// userId del cliente (null = ospite). Render: null. Protocollo:
//   - marker localStorage `anna_preferiti_sync_v1` = userId dell'ultimo merge;
//   - login "fresco" (marker != userId) -> UNIONE una tantum dispositivo+account;
//   - load successivi (marker == userId) -> PULL (server autoritativo: le
//     rimozioni fatte da un altro dispositivo non risorgono);
//   - logout (userId null con marker presente) -> azzera il dispositivo
//     (niente contaminazione tra account su PC condivisi);
//   - ogni scrittura locale da loggato -> replica debounced sul server,
//     fire-and-forget con un solo toast d'errore.

import { useEffect, useRef } from "react";

import {
  leggiPreferiti,
  registraReplicaServer,
  sostituisciPreferiti,
  svuotaPreferiti,
} from "@/lib/preferiti-client";
import {
  leggiPreferitiAction,
  salvaPreferitiServerAction,
  sincronizzaPreferitiAction,
} from "@/lib/account/preferiti-actions";
import { useToast } from "@/components/Toaster";

const CHIAVE_MARKER = "anna_preferiti_sync_v1";
const DEBOUNCE_MS = 800;

function leggiMarker(): string | null {
  try {
    return window.localStorage.getItem(CHIAVE_MARKER);
  } catch {
    return null;
  }
}
function scriviMarker(valore: string | null): void {
  try {
    if (valore == null) window.localStorage.removeItem(CHIAVE_MARKER);
    else window.localStorage.setItem(CHIAVE_MARKER, valore);
  } catch {
    // Storage negato: si riprovera al prossimo load.
  }
}

export default function SincronizzaPreferiti({
  userId,
}: {
  userId: string | null;
}) {
  const { mostra } = useToast();
  // Un solo toast d'errore per sessione di pagina: i toggle sono best effort.
  const erroreNotificato = useRef(false);

  useEffect(() => {
    // Ospite: se c'e un marker il logout e appena avvenuto -> azzera.
    if (!userId) {
      if (leggiMarker() != null) {
        svuotaPreferiti();
        scriviMarker(null);
      }
      return;
    }

    let attivo = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let sgancia: () => void = () => {};

    const replica = (ids: string[]) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void salvaPreferitiServerAction(ids).then((esito) => {
          if (!esito.ok && !erroreNotificato.current) {
            erroreNotificato.current = true;
            mostra("Preferiti non sincronizzati: riproviamo più tardi", "errore");
          }
        });
      }, DEBOUNCE_MS);
    };

    void (async () => {
      const esito =
        leggiMarker() !== userId
          ? await sincronizzaPreferitiAction(leggiPreferiti()) // unione una tantum
          : await leggiPreferitiAction(); // pull: server autoritativo
      if (!attivo) return;
      if (esito.ok && esito.ids) {
        sostituisciPreferiti(esito.ids);
        scriviMarker(userId);
      } else if (!erroreNotificato.current) {
        erroreNotificato.current = true;
        mostra("Preferiti non sincronizzati: riproviamo più tardi", "errore");
      }
      // La replica full-state (aggiunte E rimozioni) si registra SOLO ORA, a
      // merge completato: registrarla prima significherebbe che un toggle
      // avvenuto durante il merge iniziale la farebbe partire con uno stato
      // locale ancora privo dei preferiti dell'account in arrivo, cancellandoli
      // dal server. I toggle nella brevissima finestra del merge non vengono
      // replicati (li riallinea comunque il sostituisciPreferiti sopra).
      if (attivo) sgancia = registraReplicaServer(replica);
    })();

    return () => {
      attivo = false;
      if (timer) clearTimeout(timer);
      sgancia();
    };
  }, [userId, mostra]);

  return null;
}
