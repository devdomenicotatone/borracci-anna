// Dati reali dell'attivita (visura camerale — CCIAA della Romagna FC/RN).
// UNICA fonte di verita per footer, pagina "Vieni a trovarci" e adempimenti
// legali: per un e-commerce italiano l'esposizione di P.IVA e dati impresa
// e obbligatoria.

export const NEGOZIO = {
  /** Insegna commerciale. */
  insegna: "by Frody",
  /** Ragione sociale / titolare (impresa individuale). */
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

  /** Coordinate del civico (geocodifica OpenStreetMap/Nominatim). */
  coordinate: { lat: 44.0358236, lng: 12.6160012 },

  /** Contatto cliente. */
  email: "ciao@byfrody.it",
  /** Domicilio digitale (PEC) da visura. */
  pec: "borraccianna@pec.it",

  partitaIva: "08395150728",
  rea: "RN-417723",

  /** Orario di apertura (da confermare: la visura non riporta gli orari). */
  orari: "Tutti i giorni 9:00–24:00 (stagione estiva)",
} as const;

const { lat, lng } = NEGOZIO.coordinate;

/** Link utili per la mappa e le indicazioni. */
export const MAPPA = {
  /**
   * Embed interattivo OpenStreetMap (pan/zoom). Niente cookie di tracciamento
   * ne API key: si puo incorporare senza banner di consenso.
   */
  embedOsm: `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.005}%2C${lat - 0.0018}%2C${lng + 0.005}%2C${lat + 0.0018}&layer=mapnik&marker=${lat}%2C${lng}`,
  /** Apri la mappa OSM a tutto schermo. */
  apriOsm: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`,
  /** Indicazioni stradali: apre l'app mappe (Google) su mobile e desktop. */
  indicazioni: `https://www.google.com/maps/dir/?api=1&destination=${lat}%2C${lng}`,
} as const;
