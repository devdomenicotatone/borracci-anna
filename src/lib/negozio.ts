// Dati reali dell'attivita (visura camerale — CCIAA della Romagna FC/RN).
// UNICA fonte di verita per footer, pagina "Vieni a trovarci" e adempimenti
// legali: per un e-commerce italiano l'esposizione di P.IVA e dati impresa
// e obbligatoria.

export const NEGOZIO = {
  /** Insegna commerciale (marchio del negozio, da visura). */
  insegna: "Anna Shop",
  /** Ragione sociale / titolare (impresa individuale), per footer e legale. */
  ragioneSociale: "Borracci Anna",
  formaGiuridica: "Impresa individuale",

  indirizzo: {
    via: "Viale Regina Margherita 169/C",
    cap: "47924",
    citta: "Rimini",
    provincia: "RN",
    zona: "Rivazzurra",
  },
  /** Indirizzo in una riga, pronto da mostrare. */
  indirizzoCompleto: "Viale Regina Margherita 169/C, 47924 Rimini (RN)",

  /** Coordinate del civico 169/C (nodo indirizzo OpenStreetMap "169c"). */
  coordinate: { lat: 44.0357392, lng: 12.6160953 },

  /** Contatto cliente. */
  email: "1.domenicotatone@gmail.com",
  /**
   * Numero WhatsApp in formato internazionale SENZA "+" ne spazi (es.
   * "393331234567"). Lascia "" per nascondere il bottone WhatsApp finche non
   * c'e un numero. Tipato `string` cosi il bottone si attiva appena lo compili.
   */
  whatsapp: "393917395716" as string,
  /** Numero di telefono mostrabile (es. "+39 333 123 4567"). "" = nascosto. */
  telefono: "+39 391 739 5716" as string,
  /** Domicilio digitale (PEC) da visura. */
  pec: "borraccianna@pec.it",

  partitaIva: "08395150728",
  rea: "RN-417723",

  /** Orario di apertura (da confermare: la visura non riporta gli orari). */
  orari: "Tutti i giorni 9:00–24:00 (stagione estiva)",
  /**
   * Stesso orario in forma strutturata (schema.org openingHoursSpecification,
   * usato dal JSON-LD ClothingStore in home). UNICA fonte insieme a `orari`:
   * quando la titolare conferma gli orari, aggiornare ENTRAMBI. "24:00" si
   * esprime come 23:59 (mezzanotte non e' un orario di chiusura valido).
   */
  orariStrutturati: {
    giorni: [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ],
    apre: "09:00",
    chiude: "23:59",
  },
} as const;

const { lat, lng } = NEGOZIO.coordinate;
const queryIndirizzo = encodeURIComponent(
  `${NEGOZIO.indirizzo.via}, ${NEGOZIO.indirizzo.cap} ${NEGOZIO.indirizzo.citta} ${NEGOZIO.indirizzo.provincia}`,
);

/** Link utili per la mappa e le indicazioni. */
export const MAPPA = {
  /** Apri la mappa OSM a tutto schermo. */
  apriOsm: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`,
  /**
   * Indicazioni stradali (Google). Usiamo l'INDIRIZZO testuale, non le
   * coordinate: passando le coordinate Google le aggancia al civico piu vicino
   * del suo database (qui "179"), mentre col testo instrada al 169/C ufficiale.
   * Fix definitivo per l'etichetta: registrare l'attivita su Google Business
   * Profile, cosi le indicazioni puntano al luogo verificato.
   */
  indicazioni: `https://www.google.com/maps/dir/?api=1&destination=${queryIndirizzo}`,
} as const;
