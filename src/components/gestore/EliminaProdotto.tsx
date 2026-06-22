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
        className="text-sm font-medium text-red-700 transition-colors hover:text-red-800"
      >
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
