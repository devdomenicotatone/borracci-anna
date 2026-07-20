// Condizioni generali di vendita (audit conformita 2026-07-14, finding C2).
// Coprono ENTRAMBI i flussi d'acquisto: pagamento diretto e ordine "su
// richiesta" (pagamento differito dopo conferma del negozio). Cifre di
// spedizione e identita del venditore arrivano dalle costanti condivise
// (@/lib/spedizione, @/lib/negozio): mai numeri incollati che possano divergere
// da quanto addebitato al checkout.

import type { Metadata } from "next";
import Link from "next/link";

import {
  PaginaLegale,
  SezioneLegale,
  linkLegale,
} from "@/components/legale/PaginaLegale";
import { PERCORSO_PRIVACY, PERCORSO_RECESSO } from "@/lib/legale";
import { NEGOZIO } from "@/lib/negozio";
import {
  CONSEGNA_MAX_GG,
  CONSEGNA_MIN_GG,
  SOGLIA_SPEDIZIONE_GRATUITA_CENTS,
  SPEDIZIONE_ITALIA_CENTS,
} from "@/lib/spedizione";
import { formatPrezzo } from "@/lib/format";

export const metadata: Metadata = {
  title: "Condizioni di vendita",
  description:
    "Condizioni generali di vendita di Anna Shop: come si acquista, prezzi e spedizioni in Italia, diritto di recesso di 14 giorni, garanzia legale e assistenza.",
};

export default function CondizioniDiVenditaPage() {
  const tariffa = formatPrezzo(SPEDIZIONE_ITALIA_CENTS);
  const soglia = formatPrezzo(SOGLIA_SPEDIZIONE_GRATUITA_CENTS);

  return (
    <PaginaLegale
      occhiello="Documenti legali"
      titolo="Condizioni generali di vendita"
      sottotitolo="Le regole, in chiaro, degli acquisti su Anna Shop: come si ordina, quanto costa la spedizione, come funzionano recesso e garanzia."
      aggiornata="21 luglio 2026"
    >
      <SezioneLegale titolo="1. Chi vende">
        <p>
          I prodotti offerti su questo sito sono venduti da{" "}
          <strong>
            {NEGOZIO.ragioneSociale} ({NEGOZIO.formaGiuridica.toLowerCase()})
          </strong>
          , con insegna &ldquo;{NEGOZIO.insegna}&rdquo;, sede in{" "}
          {NEGOZIO.indirizzoCompleto} — P.IVA {NEGOZIO.partitaIva}, REA{" "}
          {NEGOZIO.rea}.
        </p>
        <p>
          Contatti:{" "}
          <a href={`mailto:${NEGOZIO.email}`} className={linkLegale}>
            {NEGOZIO.email}
          </a>
          {NEGOZIO.telefono ? <> · tel. {NEGOZIO.telefono}</> : null} · PEC{" "}
          <a href={`mailto:${NEGOZIO.pec}`} className={linkLegale}>
            {NEGOZIO.pec}
          </a>
          .
        </p>
      </SezioneLegale>

      <SezioneLegale titolo="2. A cosa si applicano queste condizioni">
        <p>
          Queste condizioni regolano tutte le vendite a distanza concluse sul
          sito tra il venditore e i clienti consumatori, ai sensi del Codice del
          Consumo (D.lgs. 206/2005). Il contratto si conclude in lingua
          italiana. Effettuando un ordine confermi di averle lette e accettate:
          sono sempre disponibili su questa pagina e ti vengono richiamate al
          momento del pagamento e nell&rsquo;email di conferma.
        </p>
      </SezioneLegale>

      <SezioneLegale titolo="3. Prodotti, disponibilità e prezzi">
        <p>
          Le caratteristiche essenziali di ogni prodotto (descrizione, taglie,
          colori, foto) sono indicate nella relativa scheda. Le foto sono il più
          fedeli possibile; piccole differenze di colore possono dipendere dallo
          schermo utilizzato.
        </p>
        <p>
          Nel catalogo convivono due tipi di articoli, chiaramente distinti nel
          carrello:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>articoli in pronta consegna</strong>: disponibili a
            magazzino, si acquistano con pagamento immediato;
          </li>
          <li>
            <strong>articoli &ldquo;su richiesta&rdquo;</strong>: la
            disponibilità va verificata dal negozio, quindi si ordinano con il
            flusso a pagamento differito descritto al punto 5.
          </li>
        </ul>
        <p>
          Tutti i prezzi sono espressi in euro e si intendono{" "}
          <strong>IVA inclusa</strong>. Le eventuali spese di spedizione (punto
          7) sono indicate prima della conclusione dell&rsquo;ordine e
          riepilogate nella pagina di pagamento.
        </p>
      </SezioneLegale>

      <SezioneLegale titolo="4. Acquisto con pagamento immediato">
        <p>
          Per gli articoli in pronta consegna: aggiungi al carrello, premi
          &ldquo;Vai al pagamento&rdquo; e completa l&rsquo;acquisto sulla
          pagina di pagamento sicura di Stripe, dove trovi il riepilogo di
          articoli, spedizione e totale. L&rsquo;ordine con obbligo di pagamento
          si perfeziona quando confermi il pagamento su quella pagina:{" "}
          <strong>
            il contratto è concluso nel momento in cui il pagamento va a buon
            fine
          </strong>
          . Ricevi quindi un&rsquo;email di conferma con il riepilogo
          dell&rsquo;ordine e tutte le informazioni di legge.
        </p>
        <p>
          Prima di creare la sessione di pagamento il sito riverifica le
          giacenze reali: se un articolo non è più disponibile, il carrello
          viene aggiornato e il pagamento non parte.
        </p>
      </SezioneLegale>

      <SezioneLegale titolo="5. Ordine su richiesta (pagamento differito)">
        <p>
          Per gli articoli &ldquo;su richiesta&rdquo; il percorso è in tre
          passi:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>invii la richiesta</strong> dal carrello lasciando i tuoi
            contatti: non è un ordine vincolante e non paghi nulla in questa
            fase;
          </li>
          <li>
            <strong>il negozio verifica la disponibilità</strong> e ti risponde
            via email: la conferma indica gli articoli effettivamente
            disponibili (gli altri vengono rimossi dal totale), il costo di
            spedizione concordato e il totale definitivo, con il link alla tua
            pagina ordine personale;
          </li>
          <li>
            <strong>completi il pagamento</strong> dalla tua pagina ordine,
            sempre tramite Stripe:{" "}
            <strong>
              il contratto è concluso nel momento in cui il pagamento va a buon
              fine
            </strong>
            . Se preferisci, puoi concordare con il negozio il ritiro e il
            pagamento in negozio.
          </li>
        </ul>
        <p>
          Se la disponibilità non può essere confermata, la richiesta viene
          annullata e te lo comunichiamo via email, senza alcun addebito.
        </p>
      </SezioneLegale>

      <SezioneLegale titolo="6. Pagamenti">
        <p>
          I pagamenti online avvengono esclusivamente tramite{" "}
          <strong>Stripe Checkout</strong>, sulla pagina sicura di Stripe, con i
          metodi lì proposti (carte di pagamento e altri metodi abilitati). I
          dati della carta sono trattati direttamente da Stripe: non transitano
          mai dai nostri sistemi e non li conserviamo.
        </p>
      </SezioneLegale>

      <SezioneLegale titolo="7. Spedizione e consegna">
        <p>
          Spediamo <strong>solo in Italia</strong>. La spedizione standard costa{" "}
          <strong>{tariffa}</strong> (tariffa unica nazionale) ed è{" "}
          <strong>gratuita per ordini da {soglia} in su</strong>. La consegna è
          stimata in {CONSEGNA_MIN_GG}&ndash;{CONSEGNA_MAX_GG}{" "}
          giorni lavorativi dall&rsquo;affidamento al corriere e avviene
          comunque entro 30 giorni dalla conclusione del contratto.
        </p>
        <p>
          Per gli ordini su richiesta il costo di spedizione è quello indicato
          nell&rsquo;email di conferma della disponibilità (può essere
          azzerato, ad esempio in caso di ritiro in negozio concordato).
        </p>
        <p>
          Al momento della consegna ti invitiamo a verificare che il pacco sia
          integro; eventuali anomalie evidenti vanno segnalate al corriere e a
          noi il prima possibile.
        </p>
      </SezioneLegale>

      <SezioneLegale titolo="8. Diritto di recesso (14 giorni)">
        <p>
          Se sei un consumatore hai il diritto di recedere dal contratto{" "}
          <strong>entro 14 giorni</strong> dalla consegna dei prodotti, senza
          dover indicare alcun motivo. Termini, modalità, effetti, esclusioni e
          il modulo tipo di recesso sono nella pagina dedicata:{" "}
          <Link href={PERCORSO_RECESSO} className={linkLegale}>
            Diritto di recesso
          </Link>
          . In sintesi: comunichi il recesso via email o PEC, rispedisci i
          prodotti a tue spese entro 14 giorni e ti rimborsiamo entro 14 giorni
          dalla tua comunicazione (se il recesso riguarda l&rsquo;intero
          ordine, il rimborso comprende anche le spese di consegna standard
          eventualmente addebitate).
        </p>
      </SezioneLegale>

      <SezioneLegale titolo="9. Garanzia legale di conformità">
        <p>
          Tutti i prodotti sono coperti dalla{" "}
          <strong>garanzia legale di conformità</strong> prevista dagli artt.
          128 e seguenti del Codice del Consumo: risponde il venditore per i
          difetti di conformità che si manifestano{" "}
          <strong>entro 24 mesi dalla consegna</strong>. In caso di difetto hai
          diritto, a tua scelta e alle condizioni di legge, al ripristino della
          conformità (riparazione o sostituzione), oppure a una riduzione del
          prezzo o alla risoluzione del contratto. L&rsquo;azione si prescrive
          in 26 mesi dalla consegna.
        </p>
        <p>
          Per attivare la garanzia scrivici a{" "}
          <a href={`mailto:${NEGOZIO.email}`} className={linkLegale}>
            {NEGOZIO.email}
          </a>{" "}
          descrivendo il difetto (con qualche foto, se possibile) e indicando il
          riferimento dell&rsquo;ordine.
        </p>
      </SezioneLegale>

      <SezioneLegale titolo="10. Assistenza, reclami e ADR">
        <p>
          Per assistenza post-vendita e reclami puoi scriverci a{" "}
          <a href={`mailto:${NEGOZIO.email}`} className={linkLegale}>
            {NEGOZIO.email}
          </a>
          {NEGOZIO.telefono ? (
            <>
              {" "}
              o chiamarci al {NEGOZIO.telefono}
            </>
          ) : null}
          : rispondiamo il prima possibile e cerchiamo sempre una soluzione
          diretta.
        </p>
        <p>
          Se un reclamo non trovasse soluzione, puoi ricorrere a un organismo di{" "}
          <strong>
            risoluzione alternativa delle controversie di consumo (ADR)
          </strong>{" "}
          ai sensi degli artt. 141 e seguenti del Codice del Consumo:
          l&rsquo;elenco degli organismi ADR accreditati è pubblicato sul sito
          del Ministero delle Imprese e del Made in Italy. Resta ferma la
          possibilità di rivolgerti al giudice ordinario.
        </p>
      </SezioneLegale>

      <SezioneLegale titolo="11. Legge applicabile e foro competente">
        <p>
          Le vendite sono regolate dalla legge italiana. Per ogni controversia
          con un consumatore è competente il giudice del luogo di residenza o di
          domicilio del consumatore, se ubicati in Italia.
        </p>
      </SezioneLegale>

      <SezioneLegale titolo="12. Conservazione del contratto e dei documenti">
        <p>
          Conserviamo i dati dei tuoi ordini per il tempo previsto dagli
          obblighi di legge. Trovi sempre il riepilogo dei tuoi acquisti
          nell&rsquo;email di conferma; se hai un account, anche nella sezione{" "}
          <Link href="/account/ordini" className={linkLegale}>
            I miei ordini
          </Link>
          , e per gli ordini su richiesta nella pagina ordine personale che ti
          inviamo via email. Per sapere come trattiamo i tuoi dati leggi
          l&rsquo;
          <Link href={PERCORSO_PRIVACY} className={linkLegale}>
            Informativa privacy
          </Link>
          .
        </p>
      </SezioneLegale>
    </PaginaLegale>
  );
}
