// Pagina di esito del checkout, mostrata quando Stripe reindirizza al success_url.
// Verifica la sessione (session_id) PRIMA di dichiarare il pagamento riuscito e
// di svuotare il carrello: senza verifica, chiunque aprisse questo URL vedrebbe
// un falso "pagamento riuscito" e si ritroverebbe il carrello svuotato.
// La finalizzazione affidabile dell'ordine resta comunque nel webhook Stripe.

import Link from "next/link";

import SvuotaCarrelloAlSuccesso from "@/components/cart/SvuotaCarrelloAlSuccesso";
import { verificaSessioneCliente } from "@/lib/account/auth";
import { leggiCarrello } from "@/lib/cart";
import { CONSEGNA_MAX_GG, CONSEGNA_MIN_GG } from "@/lib/spedizione";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Ordine confermato · Anna Shop",
};

type EsitoPagamento = "pagato" | "in_attesa" | "sconosciuto";

/** Stato reale del pagamento a partire dal session_id restituito da Stripe. */
async function statoPagamento(sessionId?: string): Promise<EsitoPagamento> {
  if (!sessionId || !process.env.STRIPE_SECRET_KEY) return "sconosciuto";
  try {
    const sessione = await getStripe().checkout.sessions.retrieve(sessionId);
    // "Pagato" SOLO su payment_status: una sessione puo essere complete ma
    // unpaid (metodi a regolamento asincrono) — in quel caso il webhook aspetta
    // async_payment_succeeded e qui non va dichiarato il successo.
    if (
      sessione.payment_status === "paid" ||
      sessione.payment_status === "no_payment_required"
    ) {
      return "pagato";
    }
    // Checkout inviato, pagamento in registrazione (metodo asincrono).
    if (sessione.status === "complete") return "in_attesa";
    // Sessione ancora aperta o scaduta: nessun pagamento inviato (es. URL
    // aperto a mano o ritorno dalla history) -> non svuotare, non confermare.
    return "sconosciuto";
  } catch {
    // session_id assente/invalido o Stripe non raggiungibile.
    return "sconosciuto";
  }
}

export default async function CheckoutSuccessoPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  const [esito, sessioneCliente] = await Promise.all([
    statoPagamento(session_id),
    verificaSessioneCliente(),
  ]);

  // Sessione non verificabile: nessun falso successo, nessuno svuotamento del
  // carrello. Si invita a tornare al carrello per riprovare.
  if (esito === "sconosciuto") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
        <div className="w-full max-w-md rounded-3xl bg-surface p-10 text-center shadow-soft ring-1 ring-line">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground">
            Pagamento non confermato
          </h1>
          <p className="mt-3 text-base leading-7 text-muted">
            Non siamo riusciti a verificare questo pagamento. Se hai completato
            l&apos;acquisto, l&apos;email di conferma arriverà comunque; in caso
            contrario puoi riprovare dal carrello.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/carrello"
              className="inline-flex h-12 items-center justify-center rounded-full bg-coral px-6 font-display font-bold text-white shadow-coral transition-transform hover:-translate-y-0.5"
            >
              Torna al carrello
            </Link>
            <Link
              href="/"
              className="inline-flex h-12 items-center justify-center rounded-full bg-white px-6 font-display font-bold text-sea ring-2 ring-surface-2 transition-colors hover:bg-surface"
            >
              Vai alla vetrina
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const inAttesa = esito === "in_attesa";

  // Carrello misto: il pagamento ha coperto solo la parte in pronta consegna.
  // Se restano articoli su richiesta, il secondo flusso e ancora da completare:
  // va detto QUI, o l'utente crede di aver finito. (Il conteggio non risente
  // dello svuotamento parziale client-side: quello toglie solo le righe pagate.)
  let richiestaResidua = 0;
  if (!inAttesa) {
    const righeCarrello = await leggiCarrello();
    richiestaResidua = righeCarrello
      .filter((r) => r.prodotto.disponibilita_su_richiesta)
      .reduce((a, r) => a + r.quantita, 0);
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      {/* Svuotiamo il carrello SOLO a pagamento verificato: se il pagamento e
          ancora in registrazione (asincrono) e poi fallisse, il cliente non
          deve aver perso il carrello. La verita dell'ordine e nel webhook. */}
      {!inAttesa && <SvuotaCarrelloAlSuccesso />}

      <div className="w-full max-w-md rounded-3xl bg-surface p-10 text-center shadow-soft ring-1 ring-line">
        <div className="bg-sea-gradient mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full text-white shadow-sea">
          <svg
            className="h-8 w-8"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground">
          Grazie per il tuo ordine
        </h1>
        <p className="mt-3 text-base leading-7 text-muted">
          {inAttesa
            ? "Stiamo registrando il pagamento: appena confermato riceverai una email con il riepilogo dell'ordine."
            : "Il pagamento è andato a buon fine. Riceverai a breve una email di conferma con il riepilogo dell'ordine."}
        </p>

        {/* Carrello misto: promemoria del flusso richiesta ancora aperto. */}
        {richiestaResidua > 0 && (
          <div className="mt-6 rounded-2xl bg-surface-2 p-4 text-left">
            <p className="text-sm text-muted">
              <span className="font-bold text-foreground">
                Nel carrello hai ancora {richiestaResidua}{" "}
                {richiestaResidua === 1
                  ? "articolo su richiesta"
                  : "articoli su richiesta"}
                .
              </span>{" "}
              {richiestaResidua === 1
                ? "Non fa parte di questo pagamento: invia la richiesta e lo paghi solo dopo la nostra conferma di disponibilità."
                : "Non fanno parte di questo pagamento: invia la richiesta e li paghi solo dopo la nostra conferma di disponibilità."}
            </p>
            <Link
              href="/carrello#richiesta"
              className="mt-3 inline-flex h-11 items-center justify-center rounded-full bg-coral px-5 font-display text-sm font-bold text-white shadow-coral transition-transform hover:-translate-y-0.5"
            >
              Invia la richiesta
            </Link>
          </div>
        )}

        {/* Prossimi passi */}
        <ul className="mt-6 space-y-2 text-left text-sm text-muted">
          <li className="flex items-start gap-2.5">
            <span aria-hidden="true">📧</span>
            <span>Email di conferma in arrivo nella tua casella.</span>
          </li>
          <li className="flex items-start gap-2.5">
            <span aria-hidden="true">📦</span>
            <span>
              Prepariamo la spedizione: consegna in {CONSEGNA_MIN_GG}–
              {CONSEGNA_MAX_GG} giorni lavorativi.
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <span aria-hidden="true">🏖️</span>
            <span>Sei a Rimini? Passa a trovarci sul lungomare.</span>
          </li>
        </ul>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="inline-flex h-12 items-center justify-center rounded-full bg-coral px-6 font-display font-bold text-white shadow-coral transition-transform hover:-translate-y-0.5"
          >
            Continua lo shopping
          </Link>
          {/* Cliente loggato: l'ordine appena pagato e gia nel suo storico. */}
          {sessioneCliente && (
            <Link
              href="/account/ordini"
              className="inline-flex h-12 items-center justify-center rounded-full bg-white px-6 font-display font-bold text-sea ring-2 ring-surface-2 transition-colors hover:bg-surface"
            >
              Vai ai tuoi ordini
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
