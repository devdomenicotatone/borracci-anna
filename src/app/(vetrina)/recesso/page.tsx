// Diritto di recesso (audit conformita 2026-07-14, finding C1): informativa
// completa ex artt. 49 co. 1 lett. h e 52-59 Cod. Consumo + modulo tipo
// (Allegato I-B) precompilato coi dati del venditore. Vale per entrambi i
// flussi d'acquisto (pagamento diretto e ordine su richiesta): sono entrambi
// contratti a distanza.

import type { Metadata } from "next";
import Link from "next/link";

import {
  PaginaLegale,
  SezioneLegale,
  linkLegale,
} from "@/components/legale/PaginaLegale";
import { PERCORSO_CONDIZIONI } from "@/lib/legale";
import { NEGOZIO } from "@/lib/negozio";

export const metadata: Metadata = {
  title: "Diritto di recesso",
  description:
    "Hai 14 giorni dalla consegna per cambiare idea sugli acquisti fatti su Anna Shop: come comunicare il recesso, come restituire i prodotti, tempi di rimborso e modulo tipo.",
};

/** Modulo tipo di recesso (Allegato I-B, D.lgs. 206/2005), precompilato. */
const MODULO_RECESSO = [
  `Destinatario: ${NEGOZIO.insegna} di ${NEGOZIO.ragioneSociale}`,
  NEGOZIO.indirizzoCompleto,
  `Email: ${NEGOZIO.email} — PEC: ${NEGOZIO.pec}`,
  "",
  "Con la presente io/noi (*) notifico/notifichiamo (*) il recesso dal",
  "mio/nostro (*) contratto di vendita dei seguenti beni (*):",
  "",
  "— Ordinato il (*) / ricevuto il (*): ______________________________",
  "— Riferimento dell'ordine (se disponibile): _______________________",
  "— Nome del/dei consumatore/i: _____________________________________",
  "— Indirizzo del/dei consumatore/i: ________________________________",
  "— Firma del/dei consumatore/i (solo se il modulo è inviato in",
  "  versione cartacea): _____________________________________________",
  "— Data: ___________________________________________________________",
  "",
  "(*) Cancellare la dicitura inutile.",
].join("\n");

export default function RecessoPage() {
  return (
    <PaginaLegale
      occhiello="Documenti legali"
      titolo="Diritto di recesso"
      sottotitolo="Hai cambiato idea? Nessun problema: per gli acquisti online hai 14 giorni di tempo dalla consegna per recedere, senza dover spiegare il perché."
      aggiornata="21 luglio 2026"
    >
      <SezioneLegale titolo="1. Cos'è e quando si applica">
        <p>
          Se acquisti su questo sito come consumatore — con pagamento immediato
          o con un ordine su richiesta — hai il diritto di recedere dal
          contratto ai sensi degli artt. 52 e seguenti del Codice del Consumo
          (D.lgs. 206/2005), <strong>senza indicare alcun motivo</strong>, entro{" "}
          <strong>14 giorni</strong>:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            dal giorno in cui tu (o un terzo da te designato, diverso dal
            corriere) ricevi i prodotti;
          </li>
          <li>
            se l&rsquo;ordine comprende più prodotti consegnati separatamente,
            dal giorno in cui ricevi l&rsquo;ultimo.
          </li>
        </ul>
      </SezioneLegale>

      <SezioneLegale titolo="2. Come comunicarci il recesso">
        <p>
          Basta una dichiarazione esplicita della tua decisione, inviata prima
          della scadenza del termine:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            via email a{" "}
            <a href={`mailto:${NEGOZIO.email}`} className={linkLegale}>
              {NEGOZIO.email}
            </a>
            ;
          </li>
          <li>
            via PEC a{" "}
            <a href={`mailto:${NEGOZIO.pec}`} className={linkLegale}>
              {NEGOZIO.pec}
            </a>
            ;
          </li>
          <li>
            oppure per posta a {NEGOZIO.insegna} di {NEGOZIO.ragioneSociale},{" "}
            {NEGOZIO.indirizzoCompleto}.
          </li>
        </ul>
        <p>
          Puoi usare il modulo tipo qui sotto (punto 6), ma non è obbligatorio:
          va bene qualsiasi messaggio da cui risulti chiara la volontà di
          recedere, con il riferimento dell&rsquo;ordine se lo hai. Ti
          confermeremo la ricezione via email.
        </p>
      </SezioneLegale>

      <SezioneLegale titolo="3. Come restituire i prodotti">
        <p>
          Rispedisci (o riconsegna a mano in negozio) i prodotti{" "}
          <strong>entro 14 giorni</strong> da quando ci hai comunicato il
          recesso, a: {NEGOZIO.insegna} di {NEGOZIO.ragioneSociale},{" "}
          {NEGOZIO.indirizzoCompleto}.
        </p>
        <p>
          <strong>I costi diretti della restituzione sono a tuo carico.</strong>{" "}
          Ti consigliamo di usare un imballo adeguato e una spedizione
          tracciata: i prodotti viaggiano sotto la tua responsabilità fino a
          quando non li riceviamo.
        </p>
      </SezioneLegale>

      <SezioneLegale titolo="4. Rimborso">
        <p>
          Ti rimborsiamo <strong>tutti i pagamenti ricevuti</strong> per i
          prodotti oggetto di recesso <strong>entro 14 giorni</strong> dal
          giorno in cui ci comunichi il recesso. Se il recesso riguarda
          l&rsquo;intero ordine rimborsiamo anche le spese di consegna
          standard, se addebitate (restano escluse le eventuali maggiorazioni
          per una modalità di consegna diversa da quella standard da noi
          proposta); se restituisci solo una parte dell&rsquo;ordine, le spese
          di consegna — dovute comunque per i prodotti che tieni — non vengono
          rimborsate. Possiamo trattenere il rimborso finché non abbiamo
          ricevuto i prodotti o finché non ci dimostri di averli rispediti, se
          precedente.
        </p>
        <p>
          Il rimborso avviene con lo stesso mezzo di pagamento usato per
          l&rsquo;acquisto (tramite Stripe), senza costi aggiuntivi per te.
        </p>
        <p>
          Sei responsabile soltanto dell&rsquo;eventuale diminuzione di valore
          dei prodotti risultante da una manipolazione diversa da quella
          necessaria per stabilirne natura, caratteristiche e funzionamento —
          come faresti in negozio: puoi provare un capo, non usarlo.
        </p>
      </SezioneLegale>

      <SezioneLegale titolo="5. Quando il recesso è escluso">
        <p>
          Nei casi previsti dall&rsquo;art. 59 del Codice del Consumo il
          recesso non si applica; per il nostro catalogo rilevano in
          particolare:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            prodotti <strong>confezionati su misura o personalizzati</strong>;
          </li>
          <li>
            prodotti sigillati che non possono essere restituiti{" "}
            <strong>per motivi igienici</strong> (ad esempio intimo o costumi
            con sigillo di protezione), se il sigillo è stato rimosso dopo la
            consegna.
          </li>
        </ul>
        <p>
          Se un&rsquo;esclusione riguarda un prodotto specifico, lo trovi
          indicato nella sua scheda.
        </p>
      </SezioneLegale>

      <SezioneLegale titolo="6. Modulo tipo di recesso">
        <p>
          Facsimile ai sensi dell&rsquo;Allegato I, parte B, del Codice del
          Consumo — compila e inviaci questo modulo solo se desideri recedere
          dal contratto:
        </p>
        {/* whitespace-pre-wrap: a 320px il modulo deve andare a capo, non
            chiedere scroll orizzontale (WCAG 1.4.10, reflow). */}
        <pre className="whitespace-pre-wrap break-words rounded-3xl bg-surface p-5 text-[13px] leading-relaxed text-foreground ring-1 ring-line sm:p-6 sm:text-sm">
          {MODULO_RECESSO}
        </pre>
      </SezioneLegale>

      <SezioneLegale titolo="7. Tutto il resto">
        <p>
          Il recesso è un diritto in più e non tocca la{" "}
          <strong>garanzia legale di conformità di 24 mesi</strong>: se un
          prodotto è difettoso, scrivici e lo sistemiamo. Per il quadro completo
          leggi le{" "}
          <Link href={PERCORSO_CONDIZIONI} className={linkLegale}>
            Condizioni di vendita
          </Link>
          .
        </p>
      </SezioneLegale>
    </PaginaLegale>
  );
}
