"use client";

// Ritorno da Stripe con webhook in ritardo: l'ordine risulta ancora
// "confermato" anche se il pagamento e andato a buon fine, e senza intervento
// l'utente resterebbe su una pagina che non conferma nulla. Montato SOLO
// mentre l'ordine e in elaborazione (?pagato=1 ma stato non ancora "pagato"),
// questo componente rilancia router.refresh() ogni 4 secondi: la pagina e
// force-dynamic, quindi ogni refresh riesegue caricaOrdine sul server. Appena
// il webhook scrive "pagato" il server non monta piu il componente e il
// polling si spegne da solo. Dopo MAX_TENTATIVI refresh (~40s) si arrende e
// invita a ricaricare manualmente.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** Pausa tra un refresh automatico e il successivo. */
const INTERVALLO_MS = 4000;
/** Refresh automatici prima di arrendersi (~40s totali). */
const MAX_TENTATIVI = 10;

export default function AttesaPagamento() {
  const router = useRouter();
  // Tempo scaduto: webhook piu lento del previsto, la mano passa all'utente.
  const [scaduto, setScaduto] = useState(false);
  // Refresh gia lanciati: in un ref, cosi il tick non rischedula l'effetto.
  const tentativi = useRef(0);

  useEffect(() => {
    if (scaduto) return;
    const timer = setInterval(() => {
      tentativi.current += 1;
      router.refresh();
      // setState solo dentro il callback dell'interval (mai sincrono nel corpo
      // dell'effetto); al cambio di `scaduto` il cleanup spegne il timer.
      if (tentativi.current >= MAX_TENTATIVI) setScaduto(true);
    }, INTERVALLO_MS);
    return () => clearInterval(timer);
  }, [scaduto, router]);

  // Ripartenza manuale: azzera il conteggio, riarma l'effetto (e quindi
  // l'interval) e nel frattempo chiede subito uno stato fresco al server.
  function riprova() {
    tentativi.current = 0;
    setScaduto(false);
    router.refresh();
  }

  // Niente role="status" qui: la pagina ordine monta il componente dentro un
  // <div aria-live="polite"> sempre presente (WCAG 4.1.3), che annuncia ogni
  // cambio di testo — compreso il passaggio a "pagato", quando questo
  // componente non viene piu renderizzato. Una live region annidata qui
  // causerebbe doppi annunci all'inserimento.
  if (scaduto) {
    return (
      <p className="mt-4 rounded-2xl bg-sun/15 px-4 py-3 text-sm text-sun-ink ring-1 ring-sun/40">
        La conferma sta impiegando più del previsto. Se hai completato il
        pagamento non serve ripeterlo:{" "}
        <button
          type="button"
          onClick={riprova}
          className="font-semibold underline underline-offset-2"
        >
          ricarica la pagina
        </button>{" "}
        per controllare di nuovo.
      </p>
    );
  }

  return (
    <p className="mt-4 flex items-center gap-3 rounded-2xl bg-sun/15 px-4 py-3 text-sm text-sun-ink ring-1 ring-sun/40">
      <span
        aria-hidden="true"
        className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-sun-ink border-t-transparent"
      />
      Stiamo registrando il pagamento… questa pagina si aggiorna da sola.
    </p>
  );
}
