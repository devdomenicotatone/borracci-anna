// Cron giornaliero: allinea le giacenze del catalogo al CSV di Ingrosso BLT.
// Lo chiama Vercel Cron (vedi vercel.json) con l'header
// `Authorization: Bearer <CRON_SECRET>`. Per un primo giro sicuro in produzione:
//   GET /api/cron/sync-catalogo?dryRun=1   → calcola e riporta SENZA scrivere.

import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

import { eseguiSyncCatalogo, salvaEsitoSync } from "@/lib/gestore/sync-catalogo";
import { segnalaProblema } from "@/lib/osservabilita";
import { TAG_CORRELATI } from "@/lib/correlati";
import { TAG_FACETTE_VETRINA } from "@/lib/vetrina";
import { TAG_VETRINA_HOME } from "@/lib/vetrina-home";

// Runtime Node (serve fetch con cookie, crypto, supabase service role): NON edge.
export const runtime = "nodejs";
// Mai cachare: il cron deve girare davvero a ogni invocazione.
export const dynamic = "force-dynamic";
// Il job e leggero (download + qualche SELECT + 1 RPC); 60s coprono il caso
// peggiore. Su Vercel Hobby 60 e il massimo; su Pro si puo alzare.
export const maxDuration = 60;

/** Solo chi presenta il CRON_SECRET (Vercel Cron, o un trigger manuale). */
function autorizzato(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // secret non configurato: nega, non aprire.
  // Confronto a TEMPO COSTANTE: `===` su stringhe esce al primo carattere diverso
  // (timing side-channel sul segreto). timingSafeEqual richiede buffer di ugual
  // lunghezza, quindi confrontiamo prima la lunghezza (la sola lunghezza attesa
  // non e un'informazione utile a un attaccante).
  const atteso = Buffer.from(`Bearer ${secret}`);
  const ricevuto = Buffer.from(req.headers.get("authorization") ?? "");
  return atteso.length === ricevuto.length && timingSafeEqual(atteso, ricevuto);
}

export async function GET(req: NextRequest) {
  if (!autorizzato(req)) {
    return NextResponse.json({ ok: false, error: "Non autorizzato." }, { status: 401 });
  }

  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";
  const report = await eseguiSyncCatalogo({ dryRun });

  // Persisti l'esito (solo run reali, salta internamente i dry-run) cosi il
  // gestore lo vede nel banner della lista prodotti. Best effort: non blocca.
  await salvaEsitoSync(report);

  // Sync REALE fallito: oltre al banner (passivo), un'email alla titolare —
  // senza, la vetrina continua a vendere giacenze vecchie finche qualcuno non
  // apre la lista prodotti. Finestra 20h, NON 24: il cron gira ogni 24h in
  // punto e con una finestra pari il dedup sopprimerebbe l'avviso del giorno
  // dopo. segnalaProblema non lancia mai: il report al cron esce comunque.
  if (!report.ok && !dryRun) {
    await segnalaProblema({
      titolo: "Aggiornamento giacenze BLT fallito",
      chiave: "sync-giacenze",
      finestraMinuti: 20 * 60,
      dettaglio: `Il sync giornaliero delle giacenze dal CSV di Ingrosso BLT NON e andato a buon fine.\n\nErrore: ${report.error ?? "sconosciuto"}\n\nFinche non riesce un nuovo sync, il sito vende con le giacenze dell'ultimo aggiornamento riuscito (rischio di vendere articoli nel frattempo esauriti dal fornitore). L'esito e visibile anche nel banner della lista prodotti del gestore.\n\nCause tipiche: credenziali BLT scadute o cambiate, sito del fornitore giu, formato del CSV cambiato.`,
    });
  }

  // Dopo un run reale andato a buon fine: giacenze e disponibilita sono
  // cambiate, quindi rivalida vetrina, schede prodotto e lista gestore.
  if (report.ok && !dryRun) {
    revalidatePath("/");
    revalidatePath("/prodotti/[slug]", "page");
    revalidatePath("/gestore/prodotti");
    revalidateTag(TAG_FACETTE_VETRINA, "max");
    revalidateTag(TAG_CORRELATI, "max");
    revalidateTag(TAG_VETRINA_HOME, "max");
  }

  return NextResponse.json(report, { status: report.ok ? 200 : 500 });
}
