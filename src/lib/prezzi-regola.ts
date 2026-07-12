// Regola di modifica prezzi in blocco (pagina "Prezzi" del gestore): tipi,
// validazione e calcolo PURI, senza dipendenze server. Il modulo e condiviso
// tra il client (anteprima riga per riga mentre si compone la regola) e la
// server action che applica davvero: stessa formula da entrambe le parti,
// cosi cio che si vede in anteprima e ESATTAMENTE cio che finisce a DB.

export type DirezionePrezzi = "aumenta" | "diminuisci";
export type ModoPrezzi = "percento" | "euro";
/** Arrotondamento del prezzo risultante: nessuno, a ,90 o all'euro intero. */
export type ArrotondamentoPrezzi = "no" | "novanta" | "intero";

export interface RegolaPrezzi {
  direzione: DirezionePrezzi;
  modo: ModoPrezzi;
  /** percento: punti percentuali (es. 10 = 10%); euro: importo in CENTESIMI. */
  valore: number;
  arrotonda: ArrotondamentoPrezzi;
}

/** Sotto i 50 cent Stripe rifiuta il pagamento in EUR: mai scendere oltre. */
export const PREZZO_MINIMO_CENTS = 50;
/** Tetto di sicurezza contro errori di battitura (es. % scritta come euro). */
export const PREZZO_MASSIMO_CENTS = 99_999_00;

/**
 * Valida la regola: messaggio d'errore (in italiano, da mostrare cosi com'e)
 * oppure null se applicabile. Server e client usano QUESTA, cosi i limiti
 * non divergono mai.
 */
export function validaRegolaPrezzi(regola: RegolaPrezzi): string | null {
  const { valore, modo, direzione } = regola;
  if (!Number.isFinite(valore) || valore <= 0) {
    return "Inserisci un valore maggiore di zero.";
  }
  if (modo === "percento") {
    if (direzione === "diminuisci" && valore >= 100) {
      return "La riduzione deve essere sotto il 100%.";
    }
    if (direzione === "aumenta" && valore > 500) {
      return "Aumento massimo: 500%.";
    }
  } else {
    // In euro il valore viaggia in centesimi interi.
    if (!Number.isInteger(valore)) {
      return "Importo in euro non valido.";
    }
    if (valore > PREZZO_MASSIMO_CENTS) {
      return "Importo in euro troppo alto.";
    }
  }
  return null;
}

/** Il multiplo di 100 che termina in ,90 piu vicino (mai sotto i 90 cent). */
function arrotondaANovanta(cents: number): number {
  const k = Math.round((cents - 90) / 100);
  return Math.max(0, k) * 100 + 90;
}

/**
 * Applica la regola a un prezzo (centesimi) e ritorna il nuovo prezzo, oppure
 * null se il risultato uscirebbe dai limiti di sicurezza (sotto il minimo
 * Stripe o sopra il tetto): quel prodotto va SALTATO, mai forzato a un prezzo
 * clampato che il gestore non ha chiesto.
 */
export function calcolaNuovoPrezzoCents(
  attuale: number,
  regola: RegolaPrezzi,
): number | null {
  const delta =
    regola.modo === "percento"
      ? Math.round((attuale * regola.valore) / 100)
      : regola.valore;
  let nuovo = regola.direzione === "aumenta" ? attuale + delta : attuale - delta;

  if (regola.arrotonda === "novanta") nuovo = arrotondaANovanta(nuovo);
  else if (regola.arrotonda === "intero") nuovo = Math.round(nuovo / 100) * 100;

  if (nuovo < PREZZO_MINIMO_CENTS || nuovo > PREZZO_MASSIMO_CENTS) return null;
  return nuovo;
}
