"use client";

// Form di creazione/modifica prodotto.
// - slug auto-generato dal nome finche l'utente non lo tocca;
// - prezzo inserito in euro, convertito in centesimi (hidden) con anteprima;
// - dirty-tracking: "Salva" disabilitato senza modifiche valide;
// - save-bar sticky in basso (sopra la safe-area su mobile).

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";

import { salvaProdottoAction, type StatoForm } from "@/lib/gestore/actions";
import { formatPrezzo, parsePrezzoCents } from "@/lib/format";
import { slugify } from "@/lib/gestore/slug";

export interface ProdottoForm {
  id: string;
  nome: string;
  slug: string;
  descrizione: string | null;
  prezzo_cents: number;
  valuta: string;
  attivo: boolean;
}

const inputCls =
  "h-12 w-full rounded-2xl bg-white px-4 text-base text-foreground ring-1 ring-line outline-none transition-shadow";

export default function FormProdotto({ prodotto }: { prodotto?: ProdottoForm }) {
  const modifica = !!prodotto;
  const [stato, formAction, pending] = useActionState<StatoForm, FormData>(
    salvaProdottoAction,
    {},
  );

  const [nome, setNome] = useState(prodotto?.nome ?? "");
  const [slug, setSlug] = useState(prodotto?.slug ?? "");
  const [slugDirty, setSlugDirty] = useState(modifica);
  const [descrizione, setDescrizione] = useState(prodotto?.descrizione ?? "");
  const [prezzoInput, setPrezzoInput] = useState(
    prodotto ? (prodotto.prezzo_cents / 100).toFixed(2).replace(".", ",") : "",
  );
  const [attivo, setAttivo] = useState(prodotto?.attivo ?? true);

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

  function onNome(v: string) {
    setNome(v);
    setErroriVisibili(false);
    if (!slugDirty) setSlug(slugify(v));
  }

  const valido =
    nome.trim() !== "" &&
    /^[a-z0-9-]+$/.test(slug) &&
    prezzoCents !== null &&
    prezzoCents > 0;

  const dirty = modifica
    ? nome !== prodotto.nome ||
      slug !== prodotto.slug ||
      (descrizione ?? "") !== (prodotto.descrizione ?? "") ||
      prezzoCents !== prodotto.prezzo_cents ||
      attivo !== prodotto.attivo
    : true;

  const errori = erroriVisibili ? (stato.errors ?? {}) : {};

  return (
    <form action={formAction} className="mx-auto max-w-xl">
      {modifica && <input type="hidden" name="id" value={prodotto.id} />}
      <input type="hidden" name="prezzo_cents" value={prezzoCents ?? ""} />
      <input type="hidden" name="attivo" value={attivo ? "true" : "false"} />

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

        {stato.errors?.generale && (
          <p
            role="alert"
            className="rounded-2xl bg-coral/10 px-4 py-3 text-sm font-bold text-coral"
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
            type="submit"
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
        <p className="text-xs font-bold text-coral">{errore}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
