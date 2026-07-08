import "server-only";

// Scansione di tabelle grandi a blocchi, contro il troncamento silenzioso di
// PostgREST. Supabase limita OGNI risposta a max-rows (default 1000) senza
// errore: una lettura "tutte le righe" su una tabella oltre quella soglia perde
// righe in silenzio (conteggi sbagliati, elenchi parziali, "seleziona tutti"
// incompleto). Il catalogo supera gia le 1000 righe, quindi le scansioni
// integrali DEVONO paginare a blocchi guidate dal count.

/** Ampiezza di un blocco: pari al max-rows di Supabase (default 1000). */
export const BLOCCO_SCANSIONE = 1000;

/** Esito grezzo di un `.range()` Supabase (query builder o rpc). */
interface RisultatoBlocco {
  data: unknown;
  error: unknown;
  count: number | null;
}

/** Cio che `costruisci` deve restituire: un builder su cui chiamare `.range()`. */
interface QueryBlocco {
  range(da: number, a: number): PromiseLike<RisultatoBlocco>;
}

/**
 * Legge le righe di una query paginando a blocchi da {@link BLOCCO_SCANSIONE},
 * aggirando il troncamento max-rows di PostgREST.
 *
 * `costruisci(conteggio)` DEVE restituire un builder NUOVO a ogni chiamata, con
 * filtri e ordinamento gia applicati e un ORDER BY STABILE e univoco (di norma
 * su `id`): `.range()` muta il builder — non se ne puo riusare uno solo — e
 * senza un ordine stabile i blocchi si rimescolano, saltando o duplicando righe.
 * Quando `conteggio` e true (solo il primo blocco) il builder deve includere
 * `{ count: "exact" }`: quel totale guida la scansione. C'e comunque la guardia
 * anti-loop sul blocco vuoto/corto.
 *
 * `limite` opzionale: si ferma dopo aver raccolto quel numero di righe (per le
 * griglie "Mostra altri" cumulative che non vogliono l'intera tabella). `totale`
 * resta il count completo dei match, non le righe raccolte.
 *
 * LANCIA in caso di errore Supabase (non maschera un problema come "0 righe"):
 * il chiamante decide se degradare (try/catch) o propagare.
 */
export async function scansionaBlocchi<T>(
  costruisci: (conteggio: boolean) => QueryBlocco,
  opzioni: { limite?: number } = {},
): Promise<{ righe: T[]; totale: number }> {
  const limite = opzioni.limite ?? Number.POSITIVE_INFINITY;
  const righe: T[] = [];
  let totale = 0;
  let attese: number | null = null;

  while (righe.length < limite) {
    const primo = righe.length === 0;
    const ampiezza = Math.min(BLOCCO_SCANSIONE, limite - righe.length);
    const { data, error, count } = await costruisci(primo).range(
      righe.length,
      righe.length + ampiezza - 1,
    );
    if (error) throw error;

    const blocco = (data as T[] | null) ?? [];
    righe.push(...blocco);
    if (primo) {
      attese = count ?? null;
      totale = count ?? righe.length;
    }

    if (blocco.length === 0) break; // guardia anti-loop (mai fidarsi del count)
    if (attese != null && righe.length >= attese) break;
    if (blocco.length < ampiezza) break; // blocco corto = tabella esaurita
  }

  return { righe, totale };
}

/**
 * Scorciatoia per la scansione INTEGRALE (senza limite): ritorna solo le righe.
 * Per i casi in cui serve tutta la tabella e il totale non interessa.
 */
export async function leggiTutteLeRighe<T>(
  costruisci: (conteggio: boolean) => QueryBlocco,
): Promise<T[]> {
  const { righe } = await scansionaBlocchi<T>(costruisci);
  return righe;
}
