"use client";

// Selettore colori × taglie (presentazionale, controllato dal FormProdotto).
// Il gestore SCEGLIE i colori (palette a campioni) e le taglie (scala S–6XL):
// la selezione e tenuta dal componente padre, che genera le varianti
// (colore × taglia) con SKU dedotto da baseSku (codice prodotto o slug) e le
// salva INSIEME al resto del prodotto con un unico "Salva modifiche".
// In modalita "Scrivici per la disponibilita" le giacenze non si gestiscono
// (magazzino non in tempo reale): si configurano solo le opzioni disponibili.

import {
  COLORI,
  TAGLIA_UNICA,
  TAGLIE,
  TAGLIE_BAMBINO_ETA,
  TAGLIE_BAMBINO_NUM,
  TAGLIE_CAPPELLO,
  coloreChiaro,
  coloreHex,
} from "@/lib/catalogo";

export default function EditorVarianti({
  colori,
  taglie,
  nCombo,
  onToggleColore,
  onToggleTaglia,
  onSetTaglie,
  suRichiesta,
}: {
  colori: string[];
  taglie: string[];
  /** Numero di varianti che la selezione generera (calcolato dal padre). */
  nCombo: number;
  onToggleColore: (nome: string) => void;
  onToggleTaglia: (t: string) => void;
  onSetTaglie: (taglie: string[]) => void;
  suRichiesta: boolean;
}) {
  // Adulto e bambino vivono nella stessa selezione `taglie`: i "Tutte/Nessuna"
  // agiscono SOLO sulla propria scala, senza azzerare l'altra.
  const TAGLIE_BAMBINO = [...TAGLIE_BAMBINO_ETA, ...TAGLIE_BAMBINO_NUM];
  const impostaScala = (scala: readonly string[], attiva: boolean) => {
    const fuori = taglie.filter((t) => !scala.includes(t));
    onSetTaglie(attiva ? [...fuori, ...scala] : fuori);
  };
  const chipTaglia = (t: string) => {
    const sel = taglie.includes(t);
    return (
      <button
        key={t}
        type="button"
        aria-pressed={sel}
        onClick={() => onToggleTaglia(t)}
        className={[
          "h-11 min-w-[3rem] rounded-xl px-3 font-display text-sm font-bold transition-all",
          sel
            ? "bg-sea text-white shadow-sea"
            : "bg-white text-foreground ring-1 ring-line hover:-translate-y-0.5 hover:ring-lagoon",
        ].join(" ")}
      >
        {t}
      </button>
    );
  };

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <span className="inline-flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-sea">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M4 7h16M4 12h16M4 17h10" />
            </svg>
            Disponibilità
          </span>
          <h2 className="font-display text-base font-extrabold text-foreground">
            Colori e taglie
          </h2>
        </div>
        <span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-bold text-sea">
          {nCombo} {nCombo === 1 ? "variante" : "varianti"}
        </span>
      </div>

      {/* COLORI ------------------------------------------------------------ */}
      <fieldset className="rounded-2xl bg-white p-4 shadow-soft ring-1 ring-line">
        <legend className="px-1 font-display text-xs font-bold uppercase tracking-wide text-muted">
          Colori
        </legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {COLORI.map((c) => {
            const sel = colori.includes(c.nome);
            return (
              <button
                key={c.nome}
                type="button"
                aria-pressed={sel}
                onClick={() => onToggleColore(c.nome)}
                className={[
                  "inline-flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 font-display text-sm font-bold transition-all",
                  sel
                    ? "bg-sea text-white shadow-sea"
                    : "bg-white text-foreground ring-1 ring-line hover:ring-lagoon",
                ].join(" ")}
              >
                <span
                  aria-hidden="true"
                  className={[
                    "grid h-6 w-6 place-items-center rounded-full",
                    coloreChiaro(c.hex) ? "ring-1 ring-line" : "",
                  ].join(" ")}
                  style={{ backgroundColor: c.hex }}
                >
                  {sel && (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={coloreChiaro(c.hex) ? "#0b3a5b" : "#ffffff"}
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-3.5 w-3.5"
                    >
                      <path d="m5 13 4 4L19 7" />
                    </svg>
                  )}
                </span>
                {c.nome}
              </button>
            );
          })}

          {/* Colori del prodotto fuori palette (es. dalla AI): mostrati come
              selezionati e rimovibili, cosi non restano "invisibili". */}
          {colori
            .filter(
              (c) =>
                !COLORI.some((p) => p.nome.toLowerCase() === c.toLowerCase()),
            )
            .map((c) => {
              const hex = coloreHex(c);
              return (
                <button
                  key={`extra-${c}`}
                  type="button"
                  aria-pressed={true}
                  onClick={() => onToggleColore(c)}
                  title={`${c} (fuori palette)`}
                  className="inline-flex items-center gap-2 rounded-full bg-sea py-1.5 pl-1.5 pr-3 font-display text-sm font-bold text-white shadow-sea transition-all"
                >
                  <span
                    aria-hidden="true"
                    className={[
                      "grid h-6 w-6 place-items-center rounded-full",
                      coloreChiaro(hex) ? "ring-1 ring-line" : "",
                    ].join(" ")}
                    style={{ backgroundColor: hex }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={coloreChiaro(hex) ? "#0b3a5b" : "#ffffff"}
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-3.5 w-3.5"
                    >
                      <path d="m5 13 4 4L19 7" />
                    </svg>
                  </span>
                  {c}
                </button>
              );
            })}
        </div>
      </fieldset>

      {/* TAGLIE ------------------------------------------------------------ */}
      <fieldset className="mt-3 rounded-2xl bg-white p-4 shadow-soft ring-1 ring-line">
        <legend className="px-1 font-display text-xs font-bold uppercase tracking-wide text-muted">
          Taglie
        </legend>

        {/* Adulto: scala XXS→6XL */}
        <div className="mt-1 flex items-center justify-between px-1">
          <span className="font-display text-xs font-bold text-foreground">
            Adulto
          </span>
          <div className="flex gap-3 text-xs font-bold">
            <button
              type="button"
              onClick={() => impostaScala(TAGLIE, true)}
              className="text-sea transition-colors hover:text-lagoon"
            >
              Tutte
            </button>
            <button
              type="button"
              onClick={() => impostaScala(TAGLIE, false)}
              className="text-muted transition-colors hover:text-foreground"
            >
              Nessuna
            </button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">{TAGLIE.map(chipTaglia)}</div>

        {/* Bambino: range per eta (5-6, 9-11, ...) e numeri (6, 8, ...) del
            fornitore, tenuti verbatim. */}
        <div className="mt-4 flex items-center justify-between px-1">
          <span className="font-display text-xs font-bold text-foreground">
            Bambino{" "}
            <span className="font-medium normal-case text-muted">
              · età e numero
            </span>
          </span>
          <div className="flex gap-3 text-xs font-bold">
            <button
              type="button"
              onClick={() => impostaScala(TAGLIE_BAMBINO, true)}
              className="text-sea transition-colors hover:text-lagoon"
            >
              Tutte
            </button>
            <button
              type="button"
              onClick={() => impostaScala(TAGLIE_BAMBINO, false)}
              className="text-muted transition-colors hover:text-foreground"
            >
              Nessuna
            </button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {TAGLIE_BAMBINO_ETA.map(chipTaglia)}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {TAGLIE_BAMBINO_NUM.map(chipTaglia)}
        </div>

        {/* Cappello: circonferenza in cm (48–62). */}
        <div className="mt-4 flex items-center justify-between px-1">
          <span className="font-display text-xs font-bold text-foreground">
            Cappello{" "}
            <span className="font-medium normal-case text-muted">
              · misura in cm
            </span>
          </span>
          <div className="flex gap-3 text-xs font-bold">
            <button
              type="button"
              onClick={() => impostaScala(TAGLIE_CAPPELLO, true)}
              className="text-sea transition-colors hover:text-lagoon"
            >
              Tutte
            </button>
            <button
              type="button"
              onClick={() => impostaScala(TAGLIE_CAPPELLO, false)}
              className="text-muted transition-colors hover:text-foreground"
            >
              Nessuna
            </button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {TAGLIE_CAPPELLO.map(chipTaglia)}
        </div>

        {/* Taglia unica: accessori senza scala (berretti, cappelli, ...). */}
        <div className="mt-4 px-1">
          <span className="font-display text-xs font-bold text-foreground">
            Taglia unica{" "}
            <span className="font-medium normal-case text-muted">
              · accessori
            </span>
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {chipTaglia(TAGLIA_UNICA)}
        </div>

        <p className="mt-3 px-1 text-xs text-muted">
          Scegli l&apos;intervallo (adulto o bambino). Le taglie bambino seguono
          le etichette del fornitore (es. 5-6, 9-11 oppure 6, 8, 10). Senza
          taglie il prodotto resta solo per colore.
        </p>
      </fieldset>

      {/* Riepilogo --------------------------------------------------------- */}
      <div className="mt-3 rounded-2xl bg-surface px-4 py-3 text-sm text-muted ring-1 ring-line">
        {nCombo === 0 ? (
          "Nessuna variante: scegli almeno un colore o una taglia."
        ) : (
          <>
            Genererà <strong className="text-foreground">{nCombo}</strong>{" "}
            {nCombo === 1 ? "variante" : "varianti"}
            {colori.length > 0 && taglie.length > 0
              ? ` (${colori.length} colori × ${taglie.length} taglie).`
              : "."}{" "}
            {suRichiesta
              ? "Le giacenze non si gestiscono in modalità “Scrivici per la disponibilità”."
              : null}
          </>
        )}
      </div>
    </section>
  );
}
