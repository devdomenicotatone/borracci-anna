"use client";

// Contenuto della pagina /carrello, guidato dal CartProvider (stessa fonte di
// verita di badge e mini-cart). Aggiunge: barra spedizione gratuita, riepilogo
// con breakdown dei costi, trust signals vicino al CTA (pagamento sicuro,
// acquisto come ospite) — leve note contro l'abbandono.
//
// Carrello MISTO (righe in pronta consegna + righe su richiesta): DUE SEZIONI
// con flussi separati e indipendenti — gli articoli disponibili si pagano
// subito con Stripe, quelli su richiesta passano dal modulo di richiesta
// (prima l'intero carrello degradava al flusso richiesta, pagamento compreso).
// Con un solo tipo di articoli la pagina resta a sezione unica, come prima.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import CartItem, { CheckoutButton } from "@/components/CartItem";
import FreeShippingBar from "@/components/cart/FreeShippingBar";
import ModuloRichiesta, {
  type PrefillRichiesta,
} from "@/components/cart/ModuloRichiesta";
import { useCarrello } from "@/components/cart/CartProvider";
import { formatPrezzo } from "@/lib/format";
import type { RigaCarrello } from "@/lib/types";

/** Subtotale in centesimi di un sottoinsieme di righe. */
function subtotaleDi(righe: RigaCarrello[]): number {
  return righe.reduce((a, r) => a + r.prodotto.prezzo_cents * r.quantita, 0);
}

/** Somma delle quantita di un sottoinsieme di righe. */
function quantitaDi(righe: RigaCarrello[]): number {
  return righe.reduce((a, r) => a + r.quantita, 0);
}

/** "1 articolo" / "N articoli". */
function articoli(n: number): string {
  return `${n} ${n === 1 ? "articolo" : "articoli"}`;
}

export default function CarrelloContenuto({
  prefill = null,
}: {
  /** Dati del cliente loggato (null = ospite: comportamento identico a prima). */
  prefill?: PrefillRichiesta | null;
}) {
  const { righe, count, valuta } = useCarrello();
  // Token dell'ultima richiesta inviata da un carrello misto: mostra il banner
  // di conferma mentre l'utente completa il pagamento delle righe rimaste.
  const [tokenRichiesta, setTokenRichiesta] = useState<string | null>(null);

  if (count === 0) {
    // Carrello svuotato a mano dopo l'invio della richiesta (caso raro): il
    // banner di conferma resta visibile sopra lo stato vuoto.
    if (!tokenRichiesta) return <StatoVuoto />;
    return (
      <div className="mt-8">
        <BannerRichiestaInviata
          token={tokenRichiesta}
          restanoDisponibili={false}
        />
        <StatoVuoto />
      </div>
    );
  }

  const disponibili = righe.filter(
    (r) => !r.prodotto.disponibilita_su_richiesta,
  );
  const suRichiesta = righe.filter(
    (r) => r.prodotto.disponibilita_su_richiesta,
  );
  const misto = disponibili.length > 0 && suRichiesta.length > 0;

  // Invito accedi (solo ospiti) + continua shopping: nel carrello misto vivono
  // una volta sola (accedi sotto il pagamento, che e cio che velocizza; il link
  // di ritorno in fondo alla pagina), altrimenti in coda all'unico riepilogo.
  const footerRiepilogo = (
    <>
      {!prefill && <InvitoAccedi />}
      <LinkContinua />
    </>
  );

  return (
    <div className="mt-8">
      {tokenRichiesta && (
        <BannerRichiestaInviata token={tokenRichiesta} restanoDisponibili />
      )}

      {misto ? (
        <>
          <SezioneDisponibili
            righe={disponibili}
            valuta={valuta}
            misto
            slotFooter={!prefill ? <InvitoAccedi /> : null}
          />
          <div className="mt-12">
            <SezioneRichiesta
              righe={suRichiesta}
              valuta={valuta}
              misto
              prefill={prefill}
              onInviata={setTokenRichiesta}
            />
          </div>
          <LinkContinua />
        </>
      ) : suRichiesta.length > 0 ? (
        <SezioneRichiesta
          righe={suRichiesta}
          valuta={valuta}
          misto={false}
          prefill={prefill}
          onInviata={setTokenRichiesta}
          slotFooter={footerRiepilogo}
        />
      ) : (
        <SezioneDisponibili
          righe={disponibili}
          valuta={valuta}
          misto={false}
          slotFooter={footerRiepilogo}
        />
      )}

      {/* Barra totale+CTA solo mobile: con 3+ righe totale e CTA finirebbero
          sotto la piega, pattern noto di abbandono carrello. STICKY (non fixed)
          come ultimo figlio del wrapper: aderisce al fondo dello schermo durante
          lo scroll del carrello ma si sgancia a fine contenuto, cosi il Footer
          (riga legale inclusa) resta leggibile senza padding compensativi.
          -mx-4 annulla il px-4 del <main> della pagina → full-bleed su mobile.
          z-30 come le save-bar del gestore: sotto i drawer (z-50) e i toast
          (z-60). Il riepilogo esteso qui sopra resta per il dettaglio voci e
          per desktop. Nel carrello MISTO la barra spinge il pagamento (totale
          dei soli disponibili) e linka la sezione richiesta. */}
      <div className="sticky bottom-0 z-30 -mx-4 mt-6 border-t border-line bg-white/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur sm:hidden">
        <div className="flex items-center justify-between">
          <span className="font-display text-sm font-bold text-foreground">
            {misto ? "Disponibili subito" : "Totale stimato"}
          </span>
          <span className="font-display text-lg font-extrabold tabular-nums text-sea">
            {formatPrezzo(
              misto ? subtotaleDi(disponibili) : subtotaleDi(righe),
              valuta,
            )}
          </span>
        </div>
        <div className="mt-2">
          {disponibili.length === 0 ? (
            // Flusso richiesta: i campi del modulo sono obbligatori, quindi il
            // CTA porta al modulo invece di inviare da qui.
            <a
              href="#richiesta"
              className="flex h-12 w-full items-center justify-center rounded-full bg-coral-ink px-6 font-display font-bold text-white shadow-coral"
            >
              Compila la richiesta
            </a>
          ) : (
            <CheckoutButton />
          )}
        </div>
        {misto && (
          <a
            href="#richiesta"
            className="mt-1 flex min-h-10 items-center justify-center text-center text-xs font-bold text-sea underline-offset-2 hover:underline"
          >
            E {articoli(quantitaDi(suRichiesta))} su richiesta → compila la
            richiesta
          </a>
        )}
      </div>
    </div>
  );
}

/** Intestazione di una sezione del carrello misto. */
function IntestazioneSezione({
  id,
  titolo,
  sottotitolo,
  count,
}: {
  id: string;
  titolo: string;
  sottotitolo: string;
  count: number;
}) {
  return (
    <div>
      <h2
        id={id}
        className="font-display text-xl font-extrabold tracking-tight text-foreground"
      >
        {titolo}{" "}
        <span className="text-base font-bold text-muted">
          ({articoli(count)})
        </span>
      </h2>
      <p className="mt-0.5 text-sm text-muted">{sottotitolo}</p>
    </div>
  );
}

/**
 * Sezione degli articoli in pronta consegna: lista + riepilogo con barra
 * spedizione gratuita e pagamento diretto Stripe.
 */
function SezioneDisponibili({
  righe,
  valuta,
  misto,
  slotFooter = null,
}: {
  righe: RigaCarrello[];
  valuta: string;
  misto: boolean;
  slotFooter?: React.ReactNode;
}) {
  const sub = subtotaleDi(righe);
  const n = quantitaDi(righe);

  return (
    <section aria-labelledby={misto ? "sezione-disponibili" : undefined}>
      {misto && (
        <IntestazioneSezione
          id="sezione-disponibili"
          titolo="Disponibili subito"
          sottotitolo="In negozio adesso: li paghi ora e partono subito."
          count={n}
        />
      )}

      <ul className={`divide-y divide-line ${misto ? "mt-2" : ""}`}>
        {righe.map((riga) => (
          <CartItem key={riga.id} riga={riga} />
        ))}
      </ul>

      {/* Riepilogo */}
      <div className="mt-8 rounded-3xl bg-surface p-6 shadow-soft ring-1 ring-line">
        <FreeShippingBar />

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-sm text-muted">
            <span>Subtotale ({articoli(n)})</span>
            <span className="tabular-nums text-foreground">
              {formatPrezzo(sub, valuta)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm text-muted">
            <span>Spedizione</span>
            <span>Calcolata al pagamento</span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
          <span className="font-display font-bold text-foreground">
            Totale stimato
          </span>
          <span className="font-display text-2xl font-extrabold text-sea">
            {formatPrezzo(sub, valuta)}
          </span>
        </div>

        <div className="mt-5">
          <CheckoutButton />
        </div>
        <p className="mt-3 text-center text-xs text-muted">
          Pagamento sicuro con Stripe · Spedizione e imposte calcolate al
          pagamento
        </p>
        {misto && (
          <p className="mt-1 text-center text-xs text-muted">
            Gli articoli su richiesta (qui sotto) non fanno parte di questo
            pagamento.
          </p>
        )}

        {slotFooter}
      </div>
    </section>
  );
}

/**
 * Sezione degli articoli su richiesta: lista + riepilogo con spiegazione del
 * flusso (nessun pagamento ora) e modulo di invio richiesta.
 */
function SezioneRichiesta({
  righe,
  valuta,
  misto,
  prefill,
  onInviata,
  slotFooter = null,
}: {
  righe: RigaCarrello[];
  valuta: string;
  misto: boolean;
  prefill: PrefillRichiesta | null;
  onInviata: (token: string) => void;
  slotFooter?: React.ReactNode;
}) {
  const sub = subtotaleDi(righe);
  const n = quantitaDi(righe);

  return (
    <section aria-labelledby={misto ? "sezione-richiesta" : undefined}>
      {misto && (
        <IntestazioneSezione
          id="sezione-richiesta"
          titolo="Su richiesta"
          sottotitolo="Non in pronta consegna: verifichiamo noi la disponibilità."
          count={n}
        />
      )}

      <ul className={`divide-y divide-line ${misto ? "mt-2" : ""}`}>
        {righe.map((riga) => (
          <CartItem key={riga.id} riga={riga} />
        ))}
      </ul>

      {/* Riepilogo */}
      <div className="mt-8 rounded-3xl bg-surface p-6 shadow-soft ring-1 ring-line">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm text-muted">
            <span>Subtotale ({articoli(n)})</span>
            <span className="tabular-nums text-foreground">
              {formatPrezzo(sub, valuta)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm text-muted">
            <span>Spedizione</span>
            <span>Da concordare</span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
          <span className="font-display font-bold text-foreground">
            Totale stimato
          </span>
          <span className="font-display text-2xl font-extrabold text-sea">
            {formatPrezzo(sub, valuta)}
          </span>
        </div>

        {/* Come funziona: niente pagamento ora */}
        <div className="mt-5 flex items-start gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-line">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="mt-0.5 h-5 w-5 flex-none text-sea"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4l2.5 2.5" />
          </svg>
          <p className="text-sm text-muted">
            <span className="font-bold text-foreground">
              Nessun pagamento ora.
            </span>{" "}
            {misto ? (
              <>
                Invii la richiesta per <em>questi</em> articoli, confermiamo la
                disponibilità e solo dopo li paghi — separatamente da quelli
                disponibili subito.
              </>
            ) : (
              <>
                Invii la richiesta, confermiamo la disponibilità di tutti gli
                articoli e <span className="font-semibold">solo dopo</span>{" "}
                paghi in sicurezza con Stripe.
              </>
            )}
          </p>
        </div>

        {prefill && (
          <p className="mt-4 text-xs text-muted">
            Richiesta collegata al tuo account: la ritroverai in{" "}
            <Link
              href="/account/ordini"
              className="font-bold text-sea underline-offset-2 hover:underline"
            >
              I miei ordini
            </Link>
            .
          </p>
        )}
        {/* scroll-mt: l'ancora #richiesta non deve finire sotto l'header sticky. */}
        <div id="richiesta" className="mt-5 scroll-mt-24">
          <ModuloRichiesta prefill={prefill} misto={misto} onInviata={onInviata} />
        </div>

        {slotFooter}
      </div>
    </section>
  );
}

/**
 * Conferma dell'invio richiesta da carrello misto: la sezione "su richiesta"
 * sparisce (righe rimosse) e senza questo banner l'utente resterebbe a meta
 * pagina senza feedback ne link all'ordine appena creato.
 */
function BannerRichiestaInviata({
  token,
  restanoDisponibili,
}: {
  token: string;
  restanoDisponibili: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Porta il banner in vista e dagli il focus (screen reader inclusi): dopo
  // l'invio il modulo scompare e il fuoco andrebbe perso in fondo alla pagina.
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    ref.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="status"
      className="mb-6 scroll-mt-24 rounded-3xl bg-surface p-5 shadow-soft ring-2 ring-sea/40 outline-none"
    >
      <p className="font-display font-bold text-foreground">
        <span aria-hidden="true">🎉</span> Richiesta inviata!
      </p>
      <p className="mt-1 text-sm text-muted">
        Ti abbiamo mandato un&apos;email di conferma. Appena verifichiamo la
        disponibilità ti avvisiamo e potrai pagare{" "}
        <Link
          href={`/ordine/${token}`}
          className="font-bold text-sea underline-offset-2 hover:underline"
        >
          dalla pagina della richiesta
        </Link>
        .
      </p>
      {restanoDisponibili && (
        <p className="mt-2 text-sm font-semibold text-foreground">
          Qui sotto restano gli articoli disponibili subito: completa
          l&apos;acquisto quando vuoi.
        </p>
      )}
    </div>
  );
}

/** Invito discreto per gli ospiti: mai un ostacolo al guest checkout. */
function InvitoAccedi() {
  return (
    <p className="mt-3 text-center text-xs text-muted">
      Hai un account?{" "}
      <Link
        href="/accedi?da=/carrello"
        className="font-bold text-sea underline-offset-2 hover:underline"
      >
        Accedi
      </Link>{" "}
      per un checkout più veloce.
    </p>
  );
}

/** Link di ritorno alla vetrina. */
function LinkContinua() {
  return (
    <div className="mt-4 text-center">
      <Link
        href="/"
        className="text-sm font-medium text-sea underline underline-offset-2 transition-colors hover:text-lagoon-ink"
      >
        Continua lo shopping
      </Link>
    </div>
  );
}

/** Stato vuoto curato quando non ci sono righe nel carrello. */
function StatoVuoto() {
  return (
    <div className="mt-12 flex flex-col items-center gap-4 rounded-3xl bg-surface py-16 text-center shadow-soft ring-1 ring-line">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 text-3xl">
        🏖️
      </div>
      <div>
        <p className="font-display text-lg font-bold text-foreground">
          Il carrello è vuoto
        </p>
        <p className="mt-1 text-sm text-muted">
          Non hai ancora aggiunto nessun articolo. Tuffati nella collezione!
        </p>
      </div>
      <Link
        href="/"
        className="mt-2 flex h-11 items-center justify-center rounded-full bg-coral-ink px-6 font-display font-bold text-white shadow-coral transition-transform hover:-translate-y-0.5"
      >
        Scopri i prodotti
      </Link>
    </div>
  );
}
