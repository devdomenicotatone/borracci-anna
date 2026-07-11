// Dashboard "Panoramica" dell'area account: banner di esito (verifica email,
// password aggiornata) + card di riepilogo con ingresso scaglionato.

import type { Metadata } from "next";
import Link from "next/link";

import BadgeStatoOrdine from "@/components/ordini/BadgeStatoOrdine";
import MiniaturaProdotto from "@/components/ordini/MiniaturaProdotto";
import { requireCliente } from "@/lib/account/auth";
import { indirizzoPredefinito } from "@/lib/account/dati";
import { leggiOrdiniCliente } from "@/lib/account/ordini";
import { etichettaNumeroOrdine } from "@/lib/ordini-ui";
import { formatDataLunga, formatPrezzo } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Il mio account",
};

/** Link "freccia" in coda alle card. */
function LinkCard({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="group/link mt-auto inline-flex items-center gap-1 pt-4 font-display text-sm font-bold text-sea transition-colors hover:text-lagoon-ink"
    >
      {children}
      <span
        aria-hidden="true"
        className="transition-transform group-hover/link:translate-x-0.5"
      >
        →
      </span>
    </Link>
  );
}

const CARD_CLS =
  "flex animate-pop-in flex-col rounded-3xl bg-white p-6 shadow-soft ring-1 ring-line";

export default async function PaginaAccount({
  searchParams,
}: {
  searchParams: Promise<{ verificata?: string; password?: string }>;
}) {
  const [{ verificata, password }, sessione] = await Promise.all([
    searchParams,
    requireCliente(),
  ]);
  const [{ ordini }, predefinito] = await Promise.all([
    leggiOrdiniCliente(sessione, 1, 1),
    indirizzoPredefinito(sessione),
  ]);
  const ultimo = ordini[0] ?? null;

  return (
    <div className="flex flex-col gap-4">
      {verificata === "1" && (
        <p
          role="status"
          className="animate-pop-in rounded-2xl bg-sea/10 px-4 py-3 text-sm text-sea-ink ring-1 ring-sea/20"
        >
          Email verificata, benvenuta/o! Abbiamo collegato al tuo account anche
          gli ordini fatti in passato con questa email.
        </p>
      )}
      {password === "aggiornata" && (
        <p
          role="status"
          className="animate-pop-in rounded-2xl bg-lagoon/15 px-4 py-3 text-sm text-lagoon-ink ring-1 ring-lagoon/30"
        >
          Password aggiornata: sei di nuovo al sicuro.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Ultimo ordine */}
        <div className={CARD_CLS}>
          <h2 className="font-display text-base font-extrabold text-foreground">
            Ultimo ordine
          </h2>
          {ultimo ? (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted">
                  {etichettaNumeroOrdine(ultimo)} ·{" "}
                  {formatDataLunga(ultimo.creato_il)}
                </span>
                <BadgeStatoOrdine stato={ultimo.stato} />
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex -space-x-3">
                  {ultimo.miniature.map((url, i) => (
                    <MiniaturaProdotto
                      key={i}
                      url={url}
                      className="h-12 w-12 ring-2 ring-white"
                    />
                  ))}
                </div>
                {ultimo.altriArticoli > 0 && (
                  <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-bold text-muted">
                    +{ultimo.altriArticoli}
                  </span>
                )}
                <span className="ml-auto font-display font-bold tabular-nums text-foreground">
                  {formatPrezzo(ultimo.totale_cents)}
                </span>
              </div>
              <LinkCard href="/account/ordini">Vedi tutti gli ordini</LinkCard>
            </>
          ) : (
            <>
              <p className="mt-3 text-sm text-muted">
                Non hai ancora ordini: quando compri qualcosa lo ritrovi qui.
              </p>
              <LinkCard href="/prodotti">Scopri la collezione</LinkCard>
            </>
          )}
        </div>

        {/* Indirizzo predefinito */}
        <div className={CARD_CLS} style={{ animationDelay: "60ms" }}>
          <h2 className="font-display text-base font-extrabold text-foreground">
            Indirizzo predefinito
          </h2>
          {predefinito ? (
            <>
              <p className="mt-3 text-sm font-bold text-foreground">
                {predefinito.etichetta ? `${predefinito.etichetta} — ` : ""}
                {predefinito.nome}
              </p>
              <p className="text-sm text-muted">
                {predefinito.line1}
                {predefinito.line2 ? `, ${predefinito.line2}` : ""}
                <br />
                {predefinito.cap} {predefinito.citta} ({predefinito.provincia})
              </p>
              <LinkCard href="/account/indirizzi">Gestisci indirizzi</LinkCard>
            </>
          ) : (
            <>
              <p className="mt-3 text-sm text-muted">
                Salva un indirizzo per compilare il checkout in un attimo.
              </p>
              <LinkCard href="/account/indirizzi">Aggiungi indirizzo</LinkCard>
            </>
          )}
        </div>

        {/* Preferiti */}
        <div className={CARD_CLS} style={{ animationDelay: "120ms" }}>
          <h2 className="font-display text-base font-extrabold text-foreground">
            Preferiti
          </h2>
          <p className="mt-3 text-sm text-muted">
            I tuoi cuoricini ora sono salvati sull&apos;account: li ritrovi su
            ogni dispositivo.
          </p>
          <LinkCard href="/preferiti">Vai ai preferiti</LinkCard>
        </div>

        {/* Profilo */}
        <div className={CARD_CLS} style={{ animationDelay: "180ms" }}>
          <h2 className="font-display text-base font-extrabold text-foreground">
            Profilo
          </h2>
          <p className="mt-3 text-sm text-muted">
            Dati personali, email e password del tuo account.
          </p>
          <LinkCard href="/account/profilo">Apri il profilo</LinkCard>
        </div>
      </div>
    </div>
  );
}
