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

  /** Contatto cliente: casella del dominio su Aruba (B8, creata il 23/07). */
  email: "info@annashoprimini.it",
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

  /**
   * Orari di apertura (confermati dalla titolare il 21/07/2026). Il negozio e
   * STAGIONALE: apre ogni anno la settimana di Pasqua e chiude il 30
   * settembre; sempre orario continuato, 7 giorni su 7. Forma per la VISTA
   * (footer e "Vieni a trovarci"): riga introduttiva + una riga per fascia,
   * cosi non si rende mai come muro di testo. UNICA fonte insieme a
   * `orariStrutturati`: se gli orari cambiano, aggiornare ENTRAMBI.
   */
  orariApertura: {
    /** Riga introduttiva: stagione e formula, senza gli orari puntuali. */
    stagione:
      "Aperti tutti i giorni da Pasqua al 30 settembre, orario continuato",
    /** Fasce in ordine di stagione; la `nota` facoltativa va resa in piccolo. */
    fasce: [
      {
        periodo: "Marzo e aprile",
        orario: "9:00–20:00",
        nota: "a Pasqua anche più a lungo",
      },
      { periodo: "Maggio", orario: "8:00–22:30" },
      { periodo: "Giugno–settembre", orario: "7:30–23:30" },
    ] as readonly { periodo: string; orario: string; nota?: string }[],
  },
  /**
   * Stessi orari in forma strutturata (schema.org openingHoursSpecification,
   * JSON-LD ClothingStore in home). SOLO i periodi a date fisse: il tratto
   * marzo–aprile parte dalla settimana di Pasqua, che cambia ogni anno —
   * meglio nessun dato che date sbagliate su Google; quel tratto vive nella
   * fascia "Marzo e aprile" di `orariApertura`. `validaDa`/`validaA` sono
   * "MM-GG": l'anno corrente lo aggiunge la home al render, cosi il dato non
   * scade mai.
   */
  orariStrutturati: {
    /** Tutti i periodi valgono 7 giorni su 7 (orario continuato). */
    giorni: [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ],
    periodi: [
      { validaDa: "05-01", validaA: "05-31", apre: "08:00", chiude: "22:30" },
      { validaDa: "06-01", validaA: "09-30", apre: "07:30", chiude: "23:30" },
    ],
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
