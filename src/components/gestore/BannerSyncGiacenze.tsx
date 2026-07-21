// Banner riepilogo dell'ultimo sync giacenze (giacenze BLT), mostrato in cima
// alla lista prodotti del gestore. Presentazionale: riceve l'ultimo esito e lo
// riassume. Server component (nessuna interazione): la data e formattata qui,
// niente rischio di hydration mismatch.

import type { UltimoSync } from "@/lib/gestore/sync-catalogo";

/** Data leggibile in fuso Italia (es. "8 lug, 06:00"). */
function dataIt(iso: string): string {
  return new Date(iso).toLocaleString("it-IT", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Rome",
  });
}

export default function BannerSyncGiacenze({
  ultimo,
}: {
  ultimo: UltimoSync | null;
}) {
  // Mai eseguito o migration non applicata: niente banner.
  if (!ultimo) return null;

  const quando = dataIt(ultimo.eseguitoIl);

  // Sync FERMO: l'ultimo run (riuscito o no) e piu vecchio di 30h — il cron e
  // giornaliero, quindi ha saltato un giro (24h + margine per il drift dei cron
  // Vercel Hobby). E l'unico segnale possibile per un cron MORTO (config
  // Vercel, secret ruotato): un runner che non parte non puo nemmeno inviare
  // email di allarme. Il fallimento di un run che invece GIRA arriva anche via
  // email (segnalaProblema nel cron). Le ore arrivano calcolate da
  // leggiUltimoSync: niente Date.now() nel render (react-hooks/purity).
  const oreFermo = ultimo.oreDallUltimoRun;
  if (oreFermo > 30) {
    const giorni = Math.max(1, Math.floor(oreFermo / 24));
    return (
      <div className="mb-4 flex items-start gap-3 rounded-2xl bg-sun/15 px-4 py-3 text-sm ring-1 ring-sun/40">
        <span aria-hidden="true" className="text-base leading-none">
          ⚠️
        </span>
        <p className="text-[#8a6500]">
          <span className="font-bold">
            Aggiornamento giacenze fermo da{" "}
            {giorni === 1 ? "oltre un giorno" : `${giorni} giorni`}
          </span>{" "}
          (ultimo run: {quando}
          {ultimo.ok ? "" : ", non riuscito"}). Il sito sta vendendo con
          giacenze vecchie: controlla il cron su Vercel (o segnalalo a chi
          gestisce il sito).
        </p>
      </div>
    );
  }

  // Run fallito: avviso in ambra con il motivo.
  if (!ultimo.ok) {
    return (
      <div className="mb-4 flex items-start gap-3 rounded-2xl bg-sun/15 px-4 py-3 text-sm ring-1 ring-sun/40">
        <span aria-hidden="true" className="text-base leading-none">
          ⚠️
        </span>
        <p className="text-[#8a6500]">
          <span className="font-bold">
            Aggiornamento giacenze non riuscito
          </span>{" "}
          ({quando}).{" "}
          {ultimo.report?.error ?? "Controlla la configurazione del fornitore."}
        </p>
      </div>
    );
  }

  const v = ultimo.report?.varianti;
  const avvisi = ultimo.report?.avvisiPrezzo?.length ?? 0;
  const orfani = ultimo.report?.prodotti?.orfani?.length ?? 0;

  const parti: string[] = [];
  if (v) {
    parti.push(`${v.accese} ${v.accese === 1 ? "accesa" : "accese"}`);
    parti.push(`${v.spente} ${v.spente === 1 ? "spenta" : "spente"}`);
  }
  if (avvisi > 0) {
    parti.push(`${avvisi} ${avvisi === 1 ? "avviso prezzo" : "avvisi prezzo"}`);
  }
  if (orfani > 0) {
    parti.push(`${orfani} senza riscontro`);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl bg-surface px-4 py-2.5 text-sm ring-1 ring-line">
      <span aria-hidden="true">🔄</span>
      <span className="font-semibold text-foreground">
        Giacenze aggiornate
      </span>
      <span className="text-muted">{quando}</span>
      {parti.length > 0 && (
        <span className="text-muted">· {parti.join(" · ")}</span>
      )}
    </div>
  );
}
