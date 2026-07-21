// Sfondi hero/banner della vetrina (finding B5 audit conformita 2026-07-14):
// il gestore puo usare SOLO immagini del sito — bucket Supabase Storage
// pubblico o path relativi — mai host terzi. Un URL esterno farebbe
// connettere OGNI visitatore della home a quell'host (tracking di fatto),
// invalidando la premessa "nessuna terza parte" di privacy/cookie policy
// senza toccare il codice.
//
// UNICA fonte di verita su cosa e "ammesso", condivisa tra:
//   - salvataggio (vetrina-actions: rifiuta con errore chiaro),
//   - rendering (FasciaHero/FasciaBanner: guardia sui valori legacy a DB).
// Importabile sia lato server sia client (NEXT_PUBLIC_* e inlined nel bundle).

/**
 * True se l'URL punta al bucket pubblico Supabase del progetto (host derivato
 * da NEXT_PUBLIC_SUPABASE_URL). Solo questi URL possono passare da next/image:
 * i remotePatterns di next.config.ts whitelistano quell'host, un altro host
 * manderebbe l'optimizer in errore 500.
 */
export function urlSuBucketSupabase(url: string): boolean {
  let host = "";
  try {
    host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    // Env assente/malformata: nessun bucket riconoscibile.
    return false;
  }
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      u.hostname === host &&
      u.pathname.startsWith("/storage/v1/object/public/")
    );
  } catch {
    // URL relativo o malformato: non e un URL del bucket.
    return false;
  }
}

/**
 * True se il path e relativo al sito ("/…"). Il doppio slash iniziale e
 * ESCLUSO: "//host/x" e un URL protocol-relative, cioe un host esterno.
 */
export function pathRelativoSito(url: string): boolean {
  return url.startsWith("/") && !url.startsWith("//");
}

/** Sfondo ammesso per hero/banner: bucket del sito o path relativo al sito. */
export function sfondoVetrinaAmmesso(url: string): boolean {
  return urlSuBucketSupabase(url) || pathRelativoSito(url);
}
