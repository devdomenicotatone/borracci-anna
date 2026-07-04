"use client";

// Form di creazione/modifica prodotto — UN SOLO salvataggio.
// - slug auto-generato dal nome finche l'utente non lo tocca;
// - "Codice (SKU)" opzionale: base degli SKU delle varianti (o lo slug);
// - le varianti (colori × taglie) si scelgono qui e si applicano SOLO al
//   "Salva modifiche", insieme ai campi prodotto (niente doppio salvataggio);
// - prezzo inserito in euro, convertito in centesimi (hidden) con anteprima;
// - dirty-tracking: "Salva" disabilitato senza modifiche valide;
// - save-bar sticky in basso (sopra la safe-area su mobile).

import {
  startTransition,
  useActionState,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";

import {
  salvaProdottoAction,
  type StatoForm,
  type VarianteSalvata,
} from "@/lib/gestore/actions";
import { formatPrezzo, parsePrezzoCents } from "@/lib/format";
import { slugify } from "@/lib/gestore/slug";
import { ordinaTaglie, skuVariante } from "@/lib/catalogo";
import ConfermaDialog from "@/components/gestore/ConfermaDialog";
import EditorVarianti from "@/components/gestore/EditorVarianti";
import type { Categoria, VarianteInput } from "@/lib/types";

export interface ProdottoForm {
  id: string;
  nome: string;
  slug: string;
  codice: string | null;
  descrizione: string | null;
  prezzo_cents: number;
  valuta: string;
  attivo: boolean;
  categoria_id: string | null;
  disponibilita_su_richiesta: boolean;
}

/** Chiave stabile di una combinazione colore|taglia (vuoto = null). */
function comboKey(colore: string | null, taglia: string | null): string {
  return `${colore ?? ""}|${taglia ?? ""}`;
}

/** Uguaglianza tra due insiemi di stringhe (ordine irrilevante). */
function stessoSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

const inputCls =
  "h-12 w-full rounded-2xl bg-white px-4 text-base text-foreground ring-1 ring-line outline-none transition-shadow";

export default function FormProdotto({
  prodotto,
  categorie = [],
  variantiIniziali = [],
}: {
  prodotto?: ProdottoForm;
  categorie?: Categoria[];
  variantiIniziali?: VarianteSalvata[];
}) {
  const modifica = !!prodotto;
  const [stato, formAction, pending] = useActionState<StatoForm, FormData>(
    salvaProdottoAction,
    {},
  );

  const [nome, setNome] = useState(prodotto?.nome ?? "");
  const [slug, setSlug] = useState(prodotto?.slug ?? "");
  const [slugDirty, setSlugDirty] = useState(modifica);
  const [codice, setCodice] = useState(prodotto?.codice ?? "");
  const [descrizione, setDescrizione] = useState(prodotto?.descrizione ?? "");
  const [categoriaId, setCategoriaId] = useState(prodotto?.categoria_id ?? "");
  const [prezzoInput, setPrezzoInput] = useState(
    prodotto ? (prodotto.prezzo_cents / 100).toFixed(2).replace(".", ",") : "",
  );
  const [attivo, setAttivo] = useState(prodotto?.attivo ?? true);
  const [suRichiesta, setSuRichiesta] = useState(
    prodotto?.disponibilita_su_richiesta ?? true,
  );

  // ----- Varianti (colori × taglie): selezione tenuta qui, applicata al save.
  const [colori, setColori] = useState<string[]>(() => [
    ...new Set(
      variantiIniziali.map((v) => v.colore).filter((c): c is string => !!c),
    ),
  ]);
  const [taglie, setTaglie] = useState<string[]>(() =>
    ordinaTaglie(
      variantiIniziali.map((v) => v.taglia).filter((t): t is string => !!t),
    ),
  );
  const [confermaApri, setConfermaApri] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Gli errori per-campo del server scompaiono appena l'utente ricomincia a
  // modificare (evita messaggi "fantasma" su un valore gia cambiato); tornano
  // visibili quando arriva un nuovo esito dal server (`stato` cambia). Pattern
  // "adjust state during render", senza useEffect.
  const [erroriVisibili, setErroriVisibili] = useState(true);
  const [statoVisto, setStatoVisto] = useState(stato);
  if (stato !== statoVisto) {
    setStatoVisto(stato);
    setErroriVisibili(true);
  }

  const prezzoCents = useMemo(
    () => parsePrezzoCents(prezzoInput),
    [prezzoInput],
  );

  // Categorie in gerarchia a 2 livelli: macro (senza parent) con le loro figlie.
  const categorieRaggruppate = useMemo(() => {
    const radici = categorie
      .filter((c) => !c.parent_id)
      .sort((a, b) => a.ordine - b.ordine || a.id.localeCompare(b.id));
    return radici.map((radice) => ({
      radice,
      figli: categorie
        .filter((c) => c.parent_id === radice.id)
        .sort((a, b) => a.ordine - b.ordine || a.id.localeCompare(b.id)),
    }));
  }, [categorie]);

  function onNome(v: string) {
    setNome(v);
    setErroriVisibili(false);
    if (!slugDirty) setSlug(slugify(v));
  }

  function toggleColore(nome: string) {
    setColori((cs) =>
      cs.includes(nome) ? cs.filter((c) => c !== nome) : [...cs, nome],
    );
  }
  function toggleTaglia(t: string) {
    setTaglie((ts) =>
      ts.includes(t) ? ts.filter((x) => x !== t) : ordinaTaglie([...ts, t]),
    );
  }

  // SKU base delle varianti: dal codice (se valido) o, in mancanza, dallo slug.
  const skuBase = codice.trim() ? slugify(codice) : "";
  const codiceValido = codice.trim() === "" || skuBase !== "";
  const baseSku = codice.trim() || slug;

  // Combinazioni desiderate. Solo colori -> taglia null; solo taglie -> colore
  // null; entrambi -> matrice; nessuno -> nessuna variante.
  const combos = useMemo(() => {
    if (colori.length === 0 && taglie.length === 0) return [];
    const cs: (string | null)[] = colori.length ? colori : [null];
    const ts: (string | null)[] = taglie.length ? taglie : [null];
    const out: { colore: string | null; taglia: string | null }[] = [];
    for (const c of cs) for (const t of ts) out.push({ colore: c, taglia: t });
    return out;
  }, [colori, taglie]);

  // combo -> { id, stock } delle varianti gia a DB, per preservarle nel diff.
  const esistenti = useMemo(
    () =>
      new Map(
        variantiIniziali.map((v) => [
          comboKey(v.colore, v.taglia),
          { id: v.id, stock: v.stock },
        ]),
      ),
    [variantiIniziali],
  );

  // Payload varianti serializzato nel form (letto dalla server action).
  const variantiPayload = useMemo<VarianteInput[]>(
    () =>
      combos.map(({ colore, taglia }) => {
        const ex = esistenti.get(comboKey(colore, taglia));
        return {
          id: ex?.id,
          colore,
          taglia,
          sku: skuVariante(baseSku, colore, taglia),
          stock: ex?.stock ?? 0,
        };
      }),
    [combos, esistenti, baseSku],
  );

  // Varianti gia salvate che la nuova selezione NON copre piu -> da eliminare
  // (distruttivo: CASCADE sui carrelli -> conferma prima del salvataggio).
  const idsDaEliminare = useMemo(() => {
    const tenuti = new Set(
      combos
        .map(({ colore, taglia }) => esistenti.get(comboKey(colore, taglia))?.id)
        .filter((id): id is string => !!id),
    );
    return [...esistenti.values()]
      .map((e) => e.id)
      .filter((id) => !tenuti.has(id));
  }, [combos, esistenti]);

  const valido =
    nome.trim() !== "" &&
    /^[a-z0-9-]+$/.test(slug) &&
    codiceValido &&
    prezzoCents !== null &&
    prezzoCents > 0;

  // Baseline varianti (dai dati a DB) per il dirty-tracking.
  const variantiCambiate = useMemo(() => {
    const colBase = [
      ...new Set(
        variantiIniziali.map((v) => v.colore).filter((c): c is string => !!c),
      ),
    ];
    const tagBase = ordinaTaglie(
      variantiIniziali.map((v) => v.taglia).filter((t): t is string => !!t),
    );
    return !stessoSet(colori, colBase) || !stessoSet(taglie, tagBase);
  }, [variantiIniziali, colori, taglie]);

  const dirty = modifica
    ? nome !== prodotto.nome ||
      slug !== prodotto.slug ||
      codice !== (prodotto.codice ?? "") ||
      (descrizione ?? "") !== (prodotto.descrizione ?? "") ||
      categoriaId !== (prodotto.categoria_id ?? "") ||
      prezzoCents !== prodotto.prezzo_cents ||
      attivo !== prodotto.attivo ||
      suRichiesta !== prodotto.disponibilita_su_richiesta ||
      variantiCambiate
    : true;

  const errori = erroriVisibili ? (stato.errors ?? {}) : {};

  // Salvataggio unico. Se la selezione elimina varianti gia salvate (potenziale
  // svuotamento di carrelli), chiede conferma; poi invia il form come FormData.
  function salva() {
    if (!valido || !dirty || pending) return;
    if (modifica && idsDaEliminare.length > 0) {
      setConfermaApri(true);
      return;
    }
    esegui();
  }
  function esegui() {
    setConfermaApri(false);
    const el = formRef.current;
    if (!el) return;
    const fd = new FormData(el);
    startTransition(() => formAction(fd));
  }

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        salva();
      }}
      className="mx-auto max-w-xl"
    >
      {modifica && <input type="hidden" name="id" value={prodotto.id} />}
      <input type="hidden" name="prezzo_cents" value={prezzoCents ?? ""} />
      <input type="hidden" name="attivo" value={attivo ? "true" : "false"} />
      <input
        type="hidden"
        name="disponibilita_su_richiesta"
        value={suRichiesta ? "true" : "false"}
      />
      {modifica && (
        <input
          type="hidden"
          name="varianti"
          value={JSON.stringify(variantiPayload)}
        />
      )}

      <div className="flex flex-col gap-5 pb-28">
        <Campo label="Nome" htmlFor="nome" errore={errori.nome}>
          <input
            id="nome"
            name="nome"
            value={nome}
            onChange={(e) => onNome(e.target.value)}
            required
            className={inputCls}
          />
        </Campo>

        <Campo
          label="Slug (indirizzo)"
          htmlFor="slug"
          errore={errori.slug}
          hint={`Indirizzo pubblico: /prodotti/${slug || "…"}`}
        >
          <input
            id="slug"
            name="slug"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugDirty(true);
              setErroriVisibili(false);
            }}
            required
            spellCheck={false}
            autoCapitalize="none"
            className={`${inputCls} font-mono text-sm`}
          />
        </Campo>

        <Campo
          label="Codice (SKU)"
          htmlFor="codice"
          errore={errori.codice}
          hint={
            !codice.trim()
              ? "Facoltativo. Vuoto = lo SKU usa lo slug. Es. ABC123"
              : skuBase
                ? `SKU varianti: ${skuBase}-colore-taglia`
                : "Codice non valido: usa lettere o numeri."
          }
        >
          <input
            id="codice"
            name="codice"
            value={codice}
            onChange={(e) => {
              setCodice(e.target.value);
              setErroriVisibili(false);
            }}
            spellCheck={false}
            autoCapitalize="none"
            placeholder="Es. ABC123 (facoltativo)"
            className={`${inputCls} font-mono text-sm`}
          />
        </Campo>

        <Campo label="Descrizione" htmlFor="descrizione">
          <textarea
            id="descrizione"
            name="descrizione"
            value={descrizione}
            onChange={(e) => setDescrizione(e.target.value)}
            rows={4}
            className="min-h-24 w-full resize-y rounded-2xl bg-white px-4 py-3 text-base text-foreground ring-1 ring-line outline-none transition-shadow"
          />
        </Campo>

        <Campo label="Categoria" htmlFor="categoria_id">
          <div className="relative">
            <select
              id="categoria_id"
              name="categoria_id"
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              className={`${inputCls} appearance-none pr-9`}
            >
              <option value="">Nessuna categoria</option>
              {categorieRaggruppate.map(({ radice, figli }) =>
                figli.length === 0 ? (
                  <option key={radice.id} value={radice.id}>
                    {radice.nome}
                  </option>
                ) : (
                  <optgroup key={radice.id} label={radice.nome}>
                    <option value={radice.id}>{radice.nome} (tutto)</option>
                    {figli.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nome}
                      </option>
                    ))}
                  </optgroup>
                ),
              )}
            </select>
            <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-muted">
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
                <path d="m6 9 6 6 6-6" />
              </svg>
            </span>
          </div>
        </Campo>

        <Campo
          label="Prezzo"
          htmlFor="prezzo"
          errore={errori.prezzo}
          hint={
            prezzoCents !== null && prezzoCents > 0
              ? `= ${formatPrezzo(prezzoCents)}`
              : "Es. 29,99"
          }
        >
          <div className="relative">
            <input
              id="prezzo"
              value={prezzoInput}
              onChange={(e) => {
                setPrezzoInput(e.target.value);
                setErroriVisibili(false);
              }}
              inputMode="decimal"
              placeholder="0,00"
              className={`${inputCls} pr-9`}
            />
            <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-muted">
              €
            </span>
          </div>
        </Campo>

        <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3.5 shadow-soft ring-1 ring-line">
          <div className="pr-4">
            <p className="font-display text-sm font-bold text-foreground">
              In vendita
            </p>
            <p className="text-xs text-muted">
              Se disattivo, il prodotto non compare in vetrina.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={attivo}
            aria-label="In vendita"
            onClick={() => setAttivo((a) => !a)}
            className={[
              "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors",
              attivo ? "bg-sea" : "bg-line",
            ].join(" ")}
          >
            <span
              className={[
                "inline-block h-5 w-5 transform rounded-full bg-white shadow-soft transition-transform",
                attivo ? "translate-x-6" : "translate-x-1",
              ].join(" ")}
            />
          </button>
        </div>

        <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3.5 shadow-soft ring-1 ring-line">
          <div className="pr-4">
            <p className="font-display text-sm font-bold text-foreground">
              Scrivici per la disponibilità
            </p>
            <p className="text-xs text-muted">
              Il cliente sceglie colore e taglia e ti contatta: nessun pagamento
              online e nessun conteggio del magazzino.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={suRichiesta}
            aria-label="Scrivici per la disponibilità"
            onClick={() => setSuRichiesta((v) => !v)}
            className={[
              "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors",
              suRichiesta ? "bg-sea" : "bg-line",
            ].join(" ")}
          >
            <span
              className={[
                "inline-block h-5 w-5 transform rounded-full bg-white shadow-soft transition-transform",
                suRichiesta ? "translate-x-6" : "translate-x-1",
              ].join(" ")}
            />
          </button>
        </div>

        {/* Varianti: solo in modifica (in creazione il prodotto non ha ancora
            un id a cui agganciarle; si aggiungono dopo il primo salvataggio). */}
        {modifica && (
          <EditorVarianti
            colori={colori}
            taglie={taglie}
            nCombo={combos.length}
            onToggleColore={toggleColore}
            onToggleTaglia={toggleTaglia}
            onSetTaglie={(t) => setTaglie(ordinaTaglie(t))}
            suRichiesta={suRichiesta}
          />
        )}

        {stato.errors?.generale && (
          <p
            role="alert"
            className="rounded-2xl bg-coral/10 px-4 py-3 text-sm font-bold text-coral-ink"
          >
            {stato.errors.generale}
          </p>
        )}
        {stato.ok && stato.message && (
          <p
            role="status"
            className="rounded-2xl bg-surface-2 px-4 py-3 text-sm font-bold text-sea"
          >
            {stato.message}
            {stato.avviso ? ` ${stato.avviso}` : ""}
          </p>
        )}
      </div>

      {/* Save-bar sticky in basso */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur md:left-60">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
          <Link
            href="/gestore/prodotti"
            className="flex h-12 items-center rounded-full px-4 font-display text-sm font-bold text-muted transition-colors hover:text-foreground"
          >
            Annulla
          </Link>
          <button
            type="button"
            onClick={salva}
            disabled={!valido || !dirty || pending}
            className="flex h-12 items-center rounded-full bg-sea px-7 font-display text-sm font-bold text-white shadow-sea transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
          >
            {pending
              ? "Salvataggio…"
              : modifica
                ? "Salva modifiche"
                : "Crea prodotto"}
          </button>
        </div>
      </div>

      <ConfermaDialog
        aperto={confermaApri}
        titolo="Salvare le modifiche?"
        messaggio={`${idsDaEliminare.length} variante/i non più coperta/e dalla selezione verrà/nno eliminata/e. Se sono in carrelli di clienti, quelle righe verranno svuotate.`}
        etichettaConferma="Salva"
        inCorso={pending}
        onConferma={esegui}
        onAnnulla={() => setConfermaApri(false)}
      />
    </form>
  );
}

function Campo({
  label,
  htmlFor,
  errore,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  errore?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="font-display text-sm font-bold text-foreground"
      >
        {label}
      </label>
      {children}
      {errore ? (
        <p className="text-xs font-bold text-coral-ink">{errore}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
