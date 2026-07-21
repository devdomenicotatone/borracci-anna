// Informativa privacy ex artt. 12-13 GDPR + sezione cookie (audit conformita
// 2026-07-14, finding C3 e A6). Copre tutti i punti di raccolta reali del
// sito: account, richieste d'ordine, acquisti via Stripe, rubrica indirizzi,
// preferiti, log tecnici. Niente banner cookie: il sito usa SOLO cookie
// tecnici (verificato dall'audit), qui li descriviamo come dovuto.

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
  title: "Informativa privacy",
  description:
    "Come Anna Shop tratta i tuoi dati personali: quali dati raccogliamo, perché, con quali fornitori, per quanto tempo e quali sono i tuoi diritti. Con la sezione dedicata ai cookie.",
  alternates: { canonical: "/privacy" },
};

/** Titoletto interno alle sezioni (dati trattati, cookie). */
function Voce({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="pt-1 font-display text-base font-bold text-foreground">
      {children}
    </h3>
  );
}

export default function PrivacyPage() {
  return (
    <PaginaLegale
      occhiello="Documenti legali"
      titolo="Informativa privacy e cookie"
      sottotitolo="Che dati raccogliamo quando usi il sito, perché li usiamo, con chi li condividiamo e quali diritti hai. Spiegato semplice, come piace a noi."
      aggiornata="21 luglio 2026"
    >
      <SezioneLegale titolo="1. Chi tratta i tuoi dati (titolare)">
        <p>
          Il titolare del trattamento è{" "}
          <strong>
            {NEGOZIO.ragioneSociale} ({NEGOZIO.formaGiuridica.toLowerCase()})
          </strong>
          , insegna &ldquo;{NEGOZIO.insegna}&rdquo;, {NEGOZIO.indirizzoCompleto}{" "}
          — P.IVA {NEGOZIO.partitaIva}. Per qualsiasi domanda su questa
          informativa o sui tuoi dati scrivi a{" "}
          <a href={`mailto:${NEGOZIO.email}`} className={linkLegale}>
            {NEGOZIO.email}
          </a>{" "}
          o alla PEC{" "}
          <a href={`mailto:${NEGOZIO.pec}`} className={linkLegale}>
            {NEGOZIO.pec}
          </a>
          .
        </p>
      </SezioneLegale>

      <SezioneLegale titolo="2. Quali dati trattiamo e perché">
        <Voce>Navigazione e sicurezza</Voce>
        <p>
          Quando visiti il sito trattiamo dati tecnici come l&rsquo;indirizzo
          IP e i log delle richieste, al solo scopo di far funzionare il sito e
          proteggerlo dagli abusi (ad esempio limitando le richieste ripetute
          dallo stesso indirizzo). Base giuridica: nostro legittimo interesse
          alla sicurezza del servizio (art. 6.1.f GDPR). Questi log di
          sicurezza vengono eliminati automaticamente nel giro di pochi giorni
          (di norma non oltre 7).
        </p>

        <Voce>Account cliente</Voce>
        <p>
          Se crei un account trattiamo nome, email e password
          (quest&rsquo;ultima in forma protetta, mai in chiaro) per gestire il
          tuo profilo,
          i tuoi ordini e i tuoi indirizzi. Alla conferma dell&rsquo;email
          colleghiamo all&rsquo;account anche gli ordini fatti in passato con
          lo stesso indirizzo. Base giuridica: esecuzione del contratto
          (art. 6.1.b). Niente newsletter, niente marketing: usiamo la tua
          email solo per l&rsquo;account e gli ordini.
        </p>

        <Voce>Richieste d&rsquo;ordine (&ldquo;su richiesta&rdquo;)</Voce>
        <p>
          Se invii una richiesta dal carrello trattiamo nome, email, telefono
          (facoltativo) e le note che scrivi, per verificare la disponibilità
          degli articoli, risponderti e gestire l&rsquo;eventuale ordine. Base
          giuridica: misure precontrattuali ed esecuzione del contratto
          (art. 6.1.b).
        </p>

        <Voce>Acquisti e pagamento</Voce>
        <p>
          Il pagamento avviene sulla pagina sicura di <strong>Stripe</strong>:
          lì inserisci i dati di pagamento e l&rsquo;indirizzo di spedizione.{" "}
          <strong>I dati della carta non arrivano mai ai nostri sistemi</strong>
          ; da Stripe riceviamo email, nome, indirizzo di spedizione ed esito
          del pagamento, che salviamo nell&rsquo;ordine per spedirti i prodotti
          e adempiere agli obblighi fiscali e contabili. Base giuridica:
          contratto (art. 6.1.b) e obblighi legali (art. 6.1.c).
        </p>

        <Voce>Rubrica indirizzi</Voce>
        <p>
          Gli indirizzi che salvi nel tuo account servono solo a precompilare
          le spedizioni future. Base giuridica: contratto (art. 6.1.b).
        </p>

        <Voce>Preferiti</Voce>
        <p>
          I prodotti che segni col cuore restano salvati nel tuo browser
          (localStorage). Se hai un account vengono sincronizzati anche sul tuo
          profilo, per ritrovarli da altri dispositivi.
        </p>

        <Voce>Email di servizio</Voce>
        <p>
          Ti scriviamo solo email transazionali: conferme d&rsquo;ordine,
          aggiornamenti sulle richieste, email di verifica dell&rsquo;account e
          risposte ai tuoi messaggi.
        </p>
      </SezioneLegale>

      <SezioneLegale titolo="3. Chi vede i tuoi dati (destinatari)">
        <p>
          Non vendiamo né cediamo i tuoi dati. Li trattano, per nostro conto e
          solo per far funzionare il servizio, questi fornitori:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Supabase</strong> — database e autenticazione (dove vivono
            account, ordini e carrelli);
          </li>
          <li>
            <strong>Stripe</strong> — gestione dei pagamenti (
            <a
              href="https://stripe.com/it/privacy"
              target="_blank"
              rel="noreferrer"
              className={linkLegale}
            >
              informativa Stripe
            </a>
            );
          </li>
          <li>
            <strong>Vercel</strong> — hosting del sito;
          </li>
          <li>
            <strong>Google</strong> — invio delle email di servizio;
          </li>
          <li>
            <strong>OpenStreetMap Foundation</strong> — solo se apri la pagina{" "}
            <Link href="/vieni-a-trovarci" className={linkLegale}>
              Vieni a trovarci
            </Link>
            : il tuo browser scarica le tessere della mappa dai loro server,
            che ricevono il tuo indirizzo IP.
          </li>
        </ul>
        <p>
          Alcuni di questi fornitori possono trattare dati anche fuori
          dall&rsquo;Unione Europea: in quel caso il trasferimento è coperto
          dalle garanzie previste dal GDPR (decisioni di adeguatezza o clausole
          contrattuali standard).
        </p>
      </SezioneLegale>

      <SezioneLegale titolo="4. Per quanto tempo li conserviamo">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Account</strong>: finché resta attivo; puoi eliminarlo in
            autonomia dal tuo profilo, in qualsiasi momento;
          </li>
          <li>
            <strong>Ordini e documenti d&rsquo;acquisto</strong>: 10 anni,
            come richiesto dagli obblighi fiscali e contabili — restano
            conservati anche se elimini l&rsquo;account (art. 17.3.b GDPR);
          </li>
          <li>
            <strong>Richieste senza seguito</strong>: il tempo necessario a
            gestirle e all&rsquo;assistenza collegata;
          </li>
          <li>
            <strong>Log tecnici di sicurezza</strong>: pochi giorni (di norma
            non oltre 7).
          </li>
        </ul>
      </SezioneLegale>

      <SezioneLegale titolo="5. I tuoi diritti">
        <p>
          Puoi chiederci in ogni momento l&rsquo;accesso ai tuoi dati, la
          rettifica, la cancellazione, la limitazione del trattamento, la
          portabilità e opporti ai trattamenti basati sul legittimo interesse
          (artt. 15-22 GDPR). Basta scrivere a{" "}
          <a href={`mailto:${NEGOZIO.email}`} className={linkLegale}>
            {NEGOZIO.email}
          </a>
          : rispondiamo entro un mese. L&rsquo;eliminazione dell&rsquo;account
          è self-service dal tuo profilo.
        </p>
        <p>
          Se ritieni che un trattamento violi la legge puoi proporre reclamo al
          Garante per la protezione dei dati personali (
          <a
            href="https://www.garanteprivacy.it"
            target="_blank"
            rel="noreferrer"
            className={linkLegale}
          >
            garanteprivacy.it
          </a>
          ).
        </p>
        <p>
          Il conferimento dei dati segnati come obbligatori nei moduli è
          necessario per darti il servizio richiesto (senza email, ad esempio,
          non possiamo confermarti un ordine); tutto il resto è facoltativo.
        </p>
      </SezioneLegale>

      <SezioneLegale titolo="6. Cookie e tecnologie simili">
        <p>
          Questo sito usa <strong>solo cookie tecnici</strong>, indispensabili
          al funzionamento: per questo non trovi (e non serve) alcun banner di
          consenso. Zero cookie di profilazione, zero tracker o analytics di
          terze parti.
        </p>

        <Voce>Nel dettaglio</Voce>
        <ul className="list-disc space-y-1.5 pl-5">
          {/* {" "} esplicito dopo i <strong>: se il testo che segue contiene
              un'entita HTML questo Next tronca lo spazio d'apertura del nodo. */}
          <li>
            <strong>cart_id</strong>{" "}
            &mdash; cookie tecnico che ricorda il tuo carrello tra una visita e
            l&rsquo;altra; dura 30 giorni e non è leggibile da script
            (httpOnly);
          </li>
          <li>
            <strong>sb-*</strong>{" "}
            &mdash; cookie tecnici di sessione, presenti solo se accedi al tuo
            account, per tenerti collegato;
          </li>
          <li>
            <strong>localStorage &ldquo;preferiti&rdquo;</strong>{" "}
            &mdash; memoria del browser che conserva i tuoi preferiti sul
            dispositivo (per chi è loggato include l&rsquo;identificativo
            dell&rsquo;account, usato per la sincronizzazione);
          </li>
          <li>
            <strong>pagamento su stripe.com</strong>{" "}
            &mdash; quando prosegui al pagamento passi sulla pagina di Stripe,
            dove valgono i cookie e l&rsquo;informativa di Stripe;
          </li>
          <li>
            <strong>mappa OpenStreetMap</strong> — solo sulla pagina{" "}
            <Link href="/vieni-a-trovarci" className={linkLegale}>
              Vieni a trovarci
            </Link>
            ; le tessere della mappa arrivano dai server OSMF, senza cookie di
            tracciamento.
          </li>
        </ul>
      </SezioneLegale>

      <SezioneLegale titolo="7. Aggiornamenti">
        <p>
          Se questa informativa cambia in modo sostanziale, aggiorniamo la data
          in cima alla pagina. Le condizioni che regolano gli acquisti sono
          nelle{" "}
          <Link href={PERCORSO_CONDIZIONI} className={linkLegale}>
            Condizioni di vendita
          </Link>
          .
        </p>
      </SezioneLegale>
    </PaginaLegale>
  );
}
