// Dettaglio articoli + totali di un ordine cliente. Estratto (a parita di
// markup) dalla pagina /ordine/[token] per il riuso in /account/ordini/[id]:
// banner di conferma parziale, righe con sbarrature, breakdown merce/
// spedizione/totale. Il bottone "Paga ora" NON vive qui: resta sulla pagina
// token, unica superficie di pagamento.

import { formatPrezzo } from "@/lib/format";
import type { OrdineDettaglioUI } from "@/lib/ordini-ui";
import MiniaturaProdotto from "@/components/ordini/MiniaturaProdotto";

export default function DettaglioOrdine({
  ordine,
}: {
  ordine: OrdineDettaglioUI;
}) {
  // Breakdown: merce (somma delle sole righe attive: le rimosse in conferma
  // parziale restano visibili ma escluse) + spedizione (concordata dal gestore
  // in conferma; null finche in attesa) = totale. Etichetta "stimato" finche
  // non confermato.
  const merceCents = ordine.righe.reduce(
    (acc, r) => (r.rimossa_il ? acc : acc + r.prezzo_cents * r.quantita),
    0,
  );
  const numRimosse = ordine.righe.filter((r) => r.rimossa_il != null).length;
  // Banner solo a ordine confermato/pagato: con l'annullato il messaggio di
  // stato basta da solo.
  const mostraBannerParziale =
    numRimosse > 0 &&
    (ordine.stato === "confermato" || ordine.stato === "pagato");
  const spedizioneCents = ordine.costo_spedizione_cents;
  const totaleStimato = ordine.stato === "in_attesa";

  return (
    <>
      {/* Conferma parziale: avviso sopra gli articoli, i dettagli sono sbarrati in lista. */}
      {mostraBannerParziale && (
        <p className="mt-8 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-foreground ring-1 ring-line">
          {numRimosse === 1
            ? "1 articolo non era disponibile: è sbarrato qui sotto e non è incluso nel totale."
            : `${numRimosse} articoli non erano disponibili: sono sbarrati qui sotto e non sono inclusi nel totale.`}
        </p>
      )}

      {/* Articoli */}
      <section className="mt-8 rounded-3xl bg-surface p-6 shadow-soft ring-1 ring-line">
        <h2 className="font-display text-base font-extrabold text-foreground">
          Articoli richiesti
        </h2>
        <ul className="mt-4 divide-y divide-line">
          {ordine.righe.map((r) => {
            const dettagli = [
              r.colore,
              r.taglia ? `Taglia ${r.taglia}` : null,
            ].filter(Boolean);
            const rimossa = r.rimossa_il != null;
            return (
              <li key={r.id} className="flex items-start gap-4 py-3">
                <MiniaturaProdotto url={r.immagine_url} />
                <div className="min-w-0 flex-1">
                  <p
                    className={`font-display text-sm font-bold text-foreground ${rimossa ? "line-through opacity-60" : ""}`}
                  >
                    {r.nome_prodotto}
                  </p>
                  {dettagli.length > 0 && (
                    <p className="text-xs text-muted">{dettagli.join(" · ")}</p>
                  )}
                  <p className="text-xs text-muted">Quantità: {r.quantita}</p>
                  {rimossa && (
                    <>
                      <span className="mt-1 inline-flex rounded-full bg-coral/10 px-2 py-0.5 text-xs font-bold text-[#b91c1c]">
                        Non disponibile
                      </span>
                      <p className="mt-1 text-xs text-coral-ink">
                        {r.rimossa_motivo ?? "Non disponibile"}
                      </p>
                    </>
                  )}
                </div>
                <span
                  className={`shrink-0 font-display text-sm font-bold tabular-nums text-foreground ${rimossa ? "line-through opacity-60" : ""}`}
                >
                  {formatPrezzo(r.prezzo_cents * r.quantita)}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 space-y-2 border-t border-line pt-4">
          <div className="flex items-center justify-between text-sm text-muted">
            <span>Subtotale</span>
            <span className="tabular-nums text-foreground">
              {formatPrezzo(merceCents)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm text-muted">
            <span>Spedizione</span>
            <span className="tabular-nums text-foreground">
              {spedizioneCents == null
                ? "Da concordare"
                : spedizioneCents > 0
                  ? formatPrezzo(spedizioneCents)
                  : "Gratuita"}
            </span>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
          <span className="font-display font-bold text-foreground">
            {totaleStimato ? "Totale stimato" : "Totale"}
          </span>
          <span className="font-display text-xl font-extrabold text-sea">
            {formatPrezzo(ordine.totale_cents)}
          </span>
        </div>
        {/* Gli ordini da acquisto diretto non hanno `nome`: niente riga vuota. */}
        {(ordine.nome != null || spedizioneCents == null) && (
          <p className="mt-2 text-xs text-muted">
            {ordine.nome ? `Intestato a ${ordine.nome}.` : ""}
            {spedizioneCents == null
              ? " La spedizione viene concordata alla conferma."
              : ""}
          </p>
        )}
      </section>
    </>
  );
}
