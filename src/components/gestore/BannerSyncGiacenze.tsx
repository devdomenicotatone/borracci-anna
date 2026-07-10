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
