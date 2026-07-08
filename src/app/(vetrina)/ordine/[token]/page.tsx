// Pagina pubblica di stato/pagamento di un ordine: /ordine/[token].
// Il token (UUID imprevedibile) e l'unica chiave d'accesso: lettura server-side
// con admin client (gli ordini non hanno policy anon). Mostra lo stato e, se
// confermato, il bottone "Paga ora".

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

import PulsantePaga from "@/components/prodotto/PulsantePaga";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { formatPrezzo } from "@/lib/format";
import { isStatoOrdine, type StatoOrdine } from "@/lib/types";

export const dynamic = "force-dynamic";

// Pagina gated da token con PII dell'ordine: mai indicizzata.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

interface RigaOrdine {
  id: string;
  nome_prodotto: string;
  taglia: string | null;
  colore: string | null;
  prezzo_cents: number;
  quantita: number;
  immagine_url: string | null;
  rimossa_il: string | null;
  rimossa_motivo: string | null;
}
interface OrdineDettaglio {
  id: string;
  stato: StatoOrdine;
  totale_cents: number;
  costo_spedizione_cents: number | null;
  nome: string | null;
  email: string | null;
  creato_il: string;
  righe: RigaOrdine[];
}

async function caricaOrdine(token: string): Promise<OrdineDettaglio | null> {
  try {
    const admin = createAdminSupabase();
    const { data, error } = await admin
      .from("ordini")
      .select(
        "id, stato, totale_cents, costo_spedizione_cents, nome, email, creato_il, ordine_righe(id, nome_prodotto, taglia, colore, prezzo_cents, quantita, immagine_url, rimossa_il, rimossa_motivo)",
      )
      .eq("token", token)
      .maybeSingle();
    // Narrow runtime di `stato` (dal DB arriva come string): uno stato ignoto
    // -> trattato come ordine non trovato, niente STATO_UI[undefined].
    if (error || !data || !isStatoOrdine(data.stato)) return null;
    return {
      id: data.id,
      stato: data.stato,
      totale_cents: data.totale_cents,
      costo_spedizione_cents: data.costo_spedizione_cents,
      nome: data.nome,
      email: data.email,
      creato_il: data.creato_il,
      righe: (data.ordine_righe as RigaOrdine[] | null) ?? [],
    };
  } catch {
    return null;
  }
}

const STATO_UI: Record<
  StatoOrdine,
  { titolo: string; testo: string; chip: string; chipCls: string }
> = {
  in_attesa: {
    titolo: "Richiesta ricevuta",
    testo:
      "Stiamo verificando la disponibilità di tutti gli articoli. Ti ricontattiamo a breve: appena confermiamo potrai pagare da questa pagina.",
    chip: "In attesa di conferma",
    chipCls: "bg-sun/30 text-[#8a6500]",
  },
  confermato: {
    titolo: "Disponibile!",
    testo:
      "Abbiamo confermato la disponibilità. Completa il pagamento in sicurezza con Stripe per finalizzare l'ordine.",
    chip: "Da pagare",
    chipCls: "bg-lagoon/15 text-sea",
  },
  pagato: {
    titolo: "Ordine pagato",
    testo:
      "Grazie! Abbiamo ricevuto il pagamento. Ti contatteremo per la consegna o il ritiro.",
    chip: "Pagato",
    chipCls: "bg-sea/15 text-sea",
  },
  annullato: {
    titolo: "Richiesta annullata",
    testo:
      "Questa richiesta è stata annullata. Se pensi sia un errore, scrivici pure: troviamo una soluzione.",
    chip: "Annullato",
    chipCls: "bg-coral/15 text-coral-ink",
  },
};

export default async function PaginaOrdine({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ pagato?: string }>;
}) {
  const { token } = await params;
  const { pagato } = await searchParams;
  const ordine = await caricaOrdine(token);
  if (!ordine) notFound();

  const ui = STATO_UI[ordine.stato];
  // Reduce dal pagamento Stripe: il webhook potrebbe non aver ancora aggiornato.
  const inElaborazione = pagato === "1" && ordine.stato !== "pagato";
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
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:px-6">
      <p className="font-display text-sm font-bold uppercase tracking-wide text-sea">
        Il tuo ordine
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-foreground">
          {ui.titolo}
        </h1>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${ui.chipCls}`}
        >
          {ui.chip}
        </span>
      </div>

      {inElaborazione ? (
        <p className="mt-4 rounded-2xl bg-sun/15 px-4 py-3 text-sm text-[#8a6500] ring-1 ring-sun/40">
          Stiamo registrando il pagamento… aggiorna la pagina tra qualche
          secondo.
        </p>
      ) : (
        <p className="mt-4 max-w-prose leading-relaxed text-muted">{ui.testo}</p>
      )}

      {/* "Paga ora" nascosto mentre un pagamento e in elaborazione (ritorno da
          Stripe con webhook ancora in ritardo): evita che un secondo clic apra
          una nuova sessione mentre la prima e gia stata pagata. */}
      {ordine.stato === "confermato" && !inElaborazione && (
        <div className="mt-6">
          <PulsantePaga token={token} />
        </div>
      )}

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
                <MiniaturaRiga url={r.immagine_url} />
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
                      <span className="mt-1 inline-flex rounded-full bg-coral/10 px-2 py-0.5 text-xs font-bold text-coral-ink">
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
        <p className="mt-2 text-xs text-muted">
          Intestato a {ordine.nome ?? "—"}.
          {spedizioneCents == null
            ? " La spedizione viene concordata alla conferma."
            : ""}
        </p>
      </section>

      <div className="mt-6 text-center">
        <Link
          href="/"
          className="text-sm font-medium text-sea underline-offset-2 transition-colors hover:text-lagoon hover:underline"
        >
          Torna alla vetrina
        </Link>
      </div>
    </main>
  );
}

// Miniatura della riga: snapshot foto salvato sull'ordine, fallback tile con
// l'icona maglietta (stessa di ListaProdotti).
function MiniaturaRiga({ url }: { url: string | null }) {
  return (
    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-surface ring-1 ring-line">
      {url ? (
        <Image src={url} alt="" fill sizes="48px" className="object-cover" />
      ) : (
        <div className="tile-cyan grid h-full w-full place-items-center text-white">
          <svg
            viewBox="0 0 100 100"
            fill="currentColor"
            aria-hidden="true"
            className="w-1/2 drop-shadow-[0_4px_8px_rgba(0,40,70,0.25)]"
          >
            <path d="M32 18 L18 28 L24 40 L31 35 L31 84 L69 84 L69 35 L76 40 L82 28 L68 18 C64 24 56 26 50 26 C44 26 36 24 32 18 Z" />
          </svg>
        </div>
      )}
    </div>
  );
}
