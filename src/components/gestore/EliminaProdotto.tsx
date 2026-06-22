"use client";

// Eliminazione prodotto, dietro conferma. La Server Action decide soft/hard:
// se il prodotto e stato venduto viene solo nascosto (storico preservato).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { eliminaProdottoAction } from "@/lib/gestore/actions";
import { useToast } from "@/components/gestore/Toaster";
import ConfermaDialog from "@/components/gestore/ConfermaDialog";

export default function EliminaProdotto({
  id,
  nome,
}: {
  id: string;
  nome: string;
}) {
  const router = useRouter();
  const { mostra } = useToast();
  const [apri, setApri] = useState(false);
  const [pending, startTransition] = useTransition();

  function elimina() {
    startTransition(async () => {
      const esito = await eliminaProdottoAction(id);
      if (!esito.ok) {
        mostra(esito.error ?? "Impossibile eliminare il prodotto.", "errore");
        setApri(false);
        return;
      }
      mostra(
        esito.soft
          ? "Prodotto gia venduto: nascosto invece di eliminato (storico preservato)."
          : "Prodotto eliminato.",
        "ok",
      );
      router.push("/gestore/prodotti");
      router.refresh();
    });
  }

  return (
    <section className="mx-auto mt-10 max-w-xl border-t border-line pt-6">
      <button
        type="button"
        onClick={() => setApri(true)}
        className="inline-flex items-center gap-2 rounded-full px-3 py-2 font-display text-sm font-bold text-coral transition-colors hover:bg-coral/10"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" />
        </svg>
        Elimina prodotto
      </button>

      <ConfermaDialog
        aperto={apri}
        titolo="Eliminare il prodotto?"
        messaggio={`"${nome}" verra eliminato. Se e gia stato venduto verra invece nascosto, per non perdere lo storico ordini.`}
        etichettaConferma="Elimina"
        inCorso={pending}
        onConferma={elimina}
        onAnnulla={() => setApri(false)}
      />
    </section>
  );
}
