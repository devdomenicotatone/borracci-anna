// Dettaglio di un ordine del cliente: /account/ordini/[id].
// La RLS garantisce "solo i miei": un id altrui equivale a notFound().
// Il pagamento resta SOLO su /ordine/[token] (unica superficie): qui, per gli
// ordini confermati del flusso richiesta, c'e il link "Vai al pagamento".

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import BadgeStatoOrdine from "@/components/ordini/BadgeStatoOrdine";
import DettaglioOrdine from "@/components/ordini/DettaglioOrdine";
import TimelineOrdine from "@/components/account/TimelineOrdine";
import { requireCliente } from "@/lib/account/auth";
import { leggiOrdineCliente } from "@/lib/account/ordini";
import { etichettaNumeroOrdine } from "@/lib/ordini-ui";
import { formatDataLunga } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dettaglio ordine",
};

export default async function PaginaOrdineAccount({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, sessione] = await Promise.all([params, requireCliente()]);
  const ordine = await leggiOrdineCliente(sessione, id);
  if (!ordine) notFound();

  // La timeline racconta il flusso richiesta (token presente); gli acquisti
  // diretti nascono gia "pagato" e non hanno passi intermedi da mostrare.
  const daFlussoRichiesta = ordine.token != null;
  const spedizione = ordine.spedizione_indirizzo;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/account/ordini"
        className="inline-flex items-center gap-1 text-sm font-medium text-sea underline-offset-2 hover:underline"
      >
        ← I miei ordini
      </Link>

      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-2xl font-extrabold tracking-tight text-foreground">
            {etichettaNumeroOrdine(ordine)}
          </h2>
          <BadgeStatoOrdine stato={ordine.stato} />
        </div>
        <p className="mt-1 text-sm text-muted">
          {daFlussoRichiesta ? "Richiesto" : "Effettuato"} il{" "}
          {formatDataLunga(ordine.creato_il)}
        </p>
      </div>

      {daFlussoRichiesta && <TimelineOrdine stato={ordine.stato} />}

      {ordine.stato === "confermato" && ordine.token && (
        <div className="animate-pop-in rounded-2xl bg-lagoon/10 px-4 py-4 ring-1 ring-lagoon/30">
          <p className="text-sm text-foreground">
            Disponibilità confermata dal negozio: puoi completare il pagamento
            in sicurezza con Stripe.
          </p>
          <Link
            href={`/ordine/${ordine.token}`}
            className="mt-3 inline-flex h-11 items-center justify-center rounded-full bg-coral px-6 font-display font-bold text-white shadow-coral transition hover:-translate-y-0.5"
          >
            Vai al pagamento
          </Link>
        </div>
      )}

      <DettaglioOrdine ordine={ordine} />

      {spedizione?.indirizzo && (
        <section className="rounded-3xl bg-white p-6 shadow-soft ring-1 ring-line">
          <h3 className="font-display text-base font-extrabold text-foreground">
            Spedizione
          </h3>
          <p className="mt-2 text-sm text-muted">
            {spedizione.nome && (
              <>
                <span className="font-bold text-foreground">
                  {spedizione.nome}
                </span>
                <br />
              </>
            )}
            {[spedizione.indirizzo.line1, spedizione.indirizzo.line2]
              .filter(Boolean)
              .join(", ")}
            <br />
            {[
              spedizione.indirizzo.cap,
              spedizione.indirizzo.citta,
              spedizione.indirizzo.provincia,
            ]
              .filter(Boolean)
              .join(" ")}
            {spedizione.indirizzo.paese
              ? `, ${spedizione.indirizzo.paese}`
              : ""}
          </p>
        </section>
      )}

      <p className="text-sm text-muted">
        Serve aiuto con quest&apos;ordine?{" "}
        <Link
          href="/vieni-a-trovarci"
          className="font-bold text-sea underline-offset-2 hover:underline"
        >
          Scrivici o passa a trovarci
        </Link>
        {ordine.numero != null && (
          <> citando l&apos;ordine #{ordine.numero}</>
        )}
        .
      </p>
    </div>
  );
}
