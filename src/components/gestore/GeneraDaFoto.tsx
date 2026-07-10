"use client";

// Flusso "Genera scheda da foto" (area gestore).
// 1) UPLOAD: foto prodotto (diventano la galleria) + foto etichetta (solo per
//    l'AI: composizione/lavaggio). Compressione WebP lato client.
// 2) GENERA: manda le foto a Sonnet 4.6 -> bozza strutturata.
// 3) REVISIONE: form pre-compilato editabile (nome, slug, descrizione, prezzo,
//    categoria, colori). "Crea bozza" -> crea il prodotto (attivo=false) e porta
//    alla pagina di modifica per rifinire/pubblicare.

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import imageCompression from "browser-image-compression";

import { generaBlurDataUrl } from "@/lib/blur";
import { autoTrimmaImmagine } from "@/lib/trim";

import {
  generaSchedaDaFotoAction,
  creaSchedaDaFotoAction,
} from "@/lib/gestore/ai-actions";
import { aggiungiFotoGalleriaAction } from "@/lib/gestore/actions";
import { useToast } from "@/components/gestore/Toaster";
import OpzioniCategorie from "@/components/gestore/OpzioniCategorie";
import { slugify } from "@/lib/gestore/slug";
import { coloreCanonico } from "@/lib/catalogo";
import { formatPrezzo, parsePrezzoCents } from "@/lib/format";
import { gruppiCategorie } from "@/lib/categorie-albero";
import { Campo, inputCls } from "@/components/gestore/ui";
import type { Categoria } from "@/lib/types";

interface FotoLocale {
  file: File;
  preview: string;
}
interface ColoreBozza {
  nome: string;
  foto_indici: number[];
}

const MAX_FOTO = 10;

// MASTER nitido per le foto prodotto (diventano la GALLERIA): 2560px / q0.92,
// come l'upload manuale. In creazione vengono caricate UNA A UNA (non in un unico
// body), quindi non c'e piu il vincolo del limite della Server Action.
async function preparaMaster(file: File): Promise<File> {
  return imageCompression(file, {
    maxWidthOrHeight: 2560,
    maxSizeMB: 8,
    initialQuality: 0.92,
    fileType: "image/webp",
    useWebWorker: true,
  });
}

// Copia LEGGERA per la vision di Claude: 1568px e il massimo utile (oltre, l'API
// ridimensiona comunque), q0.8 basta a riconoscere capo e colori. Usata sia per
// le foto prodotto (copia usa-e-getta: il master resta intatto) sia per le foto
// etichetta (che non vengono mai salvate).
async function perAI(file: File): Promise<File> {
  return imageCompression(file, {
    maxWidthOrHeight: 1568,
    maxSizeMB: 0.8,
    initialQuality: 0.8,
    fileType: "image/webp",
    useWebWorker: true,
  });
}

export default function GeneraDaFoto({
  categorie,
}: {
  categorie: Categoria[];
}) {
  const router = useRouter();
  const { mostra } = useToast();

  const [fotoProdotto, setFotoProdotto] = useState<FotoLocale[]>([]);
  const [fotoEtichetta, setFotoEtichetta] = useState<FotoLocale[]>([]);
  const [fase, setFase] = useState<"upload" | "revisione">("upload");
  const [preparando, setPreparando] = useState(false);
  const [generando, startGenera] = useTransition();
  const [creando, startCrea] = useTransition();

  // Campi della bozza (fase revisione).
  const [nome, setNome] = useState("");
  const [slug, setSlug] = useState("");
  const [slugDirty, setSlugDirty] = useState(false);
  const [descrizione, setDescrizione] = useState("");
  const [prezzoInput, setPrezzoInput] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [colori, setColori] = useState<ColoreBozza[]>([]);

  const inputProdRef = useRef<HTMLInputElement>(null);
  const inputEtiRef = useRef<HTMLInputElement>(null);

  // Revoca tutti gli object URL allo smontaggio: dopo "Crea", router.push smonta
  // il componente senza reload, quindi i blob resterebbero in memoria.
  const fotoRef = useRef<FotoLocale[][]>([]);
  useEffect(() => {
    fotoRef.current = [fotoProdotto, fotoEtichetta];
  });
  useEffect(
    () => () => {
      fotoRef.current.flat().forEach((f) => URL.revokeObjectURL(f.preview));
    },
    [],
  );

  const prezzoCents = useMemo(() => parsePrezzoCents(prezzoInput), [prezzoInput]);

  // Gerarchia a 3 livelli: macro con figlie e nipoti (helper condiviso).
  const categorieRaggruppate = useMemo(
    () => gruppiCategorie(categorie),
    [categorie],
  );

  async function aggiungiFoto(
    e: React.ChangeEvent<HTMLInputElement>,
    quale: "prodotto" | "etichetta",
  ) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setPreparando(true);
    try {
      const nuove: FotoLocale[] = [];
      for (const f of files) {
        if (!f.type.startsWith("image/")) continue;
        // Foto prodotto -> master nitido (diventano la galleria). Etichette ->
        // copia leggera: servono solo all'AI, non vengono mai salvate.
        const c =
          quale === "prodotto" ? await preparaMaster(f) : await perAI(f);
        nuove.push({ file: c, preview: URL.createObjectURL(c) });
      }
      if (quale === "prodotto") setFotoProdotto((p) => [...p, ...nuove]);
      else setFotoEtichetta((p) => [...p, ...nuove]);
    } catch {
      mostra("Impossibile elaborare le immagini.", "errore");
    } finally {
      setPreparando(false);
    }
  }

  function rimuoviFoto(quale: "prodotto" | "etichetta", i: number) {
    const setter = quale === "prodotto" ? setFotoProdotto : setFotoEtichetta;
    setter((arr) => {
      const f = arr[i];
      if (f) URL.revokeObjectURL(f.preview);
      return arr.filter((_, idx) => idx !== i);
    });
  }

  function genera() {
    if (fotoProdotto.length === 0) {
      mostra("Carica almeno una foto del prodotto.", "errore");
      return;
    }
    if (fotoProdotto.length + fotoEtichetta.length > MAX_FOTO) {
      mostra(`Massimo ${MAX_FOTO} foto per scheda: rimuovine qualcuna.`, "errore");
      return;
    }
    startGenera(async () => {
      try {
        // A Claude mandiamo COPIE leggere delle foto prodotto: i master restano
        // intatti per la galleria. Le etichette sono gia in formato AI.
        const fd = new FormData();
        for (const f of fotoProdotto) {
          fd.append("prodotto", await perAI(f.file), "p.webp");
        }
        for (const f of fotoEtichetta) {
          fd.append("etichetta", f.file, "e.webp");
        }
        const esito = await generaSchedaDaFotoAction(fd);
        if (!esito.ok || !esito.bozza) {
          mostra(esito.error ?? "Generazione non riuscita.", "errore");
          return;
        }
        const b = esito.bozza;
        setNome(b.nome);
        setSlug(slugify(b.nome));
        setSlugDirty(false);
        setDescrizione(b.descrizione);
        setPrezzoInput(
          b.prezzo_cents > 0
            ? (b.prezzo_cents / 100).toFixed(2).replace(".", ",")
            : "",
        );
        setColori(b.colori.length ? b.colori : [{ nome: "", foto_indici: [] }]);
        setFase("revisione");
        mostra("Bozza generata. Controlla e crea.", "ok");
      } catch {
        mostra(
          "Generazione non riuscita: foto troppo pesanti o connessione lenta. Riprova con meno foto.",
          "errore",
        );
      }
    });
  }

  function crea() {
    if (!nome.trim() || prezzoCents === null || prezzoCents <= 0) {
      mostra("Servono almeno nome e prezzo validi.", "errore");
      return;
    }
    const dati = {
      nome: nome.trim(),
      slug: slug.trim(),
      descrizione,
      prezzo_cents: prezzoCents,
      categoria_id: categoriaId || null,
      // Canonicalizza il nome colore GIA qui: cosi le varianti a DB e il tag
      // `colore` delle foto (colorePerIndice sotto) usano lo stesso nome della
      // palette. Il server ricanonicalizza le varianti ma NON il tag foto: se
      // restasse grezzo, sulla PDP variante e foto (match per uguaglianza stretta)
      // non combacerebbero (es. digitato "blu navy" vs canonico "Navy").
      colori: colori
        .filter((c) => c.nome.trim())
        .map((c) => ({ nome: coloreCanonico(c.nome.trim()), foto_indici: c.foto_indici })),
    };
    startCrea(async () => {
      try {
        // 1) Crea prodotto + varianti (senza foto: niente piu limite body).
        const esito = await creaSchedaDaFotoAction(dati);
        if (!esito.ok || !esito.id) {
          mostra(esito.error ?? "Creazione non riuscita.", "errore");
          return;
        }
        const prodottoId = esito.id;

        // 2) Carica i master UNO A UNO, taggati per colore (come la galleria).
        //    Il colore per indice viene dalla mappa colore -> foto_indici.
        const colorePerIndice = new Map<number, string>();
        for (const c of dati.colori) {
          for (const idx of c.foto_indici) colorePerIndice.set(idx, c.nome);
        }
        let erroriFoto = 0;
        for (let i = 0; i < fotoProdotto.length; i++) {
          const f = fotoProdotto[i];
          const { blob: pulita } = await autoTrimmaImmagine(f.file);
          const fd = new FormData();
          fd.append("foto", pulita, "p.webp");
          const blur = (await generaBlurDataUrl(pulita)) ?? "";
          if (blur) fd.append("blur", blur);
          const colore = colorePerIndice.get(i);
          if (colore) fd.append("colore", colore);
          const r = await aggiungiFotoGalleriaAction(prodottoId, fd);
          if (!r.ok) erroriFoto++;
        }

        if (esito.error) mostra(esito.error, "errore");
        else if (erroriFoto > 0)
          mostra(
            `Bozza creata, ma ${erroriFoto} foto non caricate: aggiungile dalla scheda.`,
            "errore",
          );
        else mostra("Bozza creata. Rivedi e pubblica.", "ok");
        router.push(`/gestore/prodotti/${prodottoId}`);
      } catch {
        mostra("Creazione non riuscita: riprova.", "errore");
      }
    });
  }

  // ---- FASE UPLOAD ----------------------------------------------------------
  if (fase === "upload") {
    return (
      // A lg le due zone (prodotto/etichetta) stanno affiancate; la barra fissa
      // e fuori flusso, quindi non entra nel grid.
      <div className="mx-auto max-w-xl pb-28 lg:grid lg:max-w-4xl lg:grid-cols-2 lg:items-start lg:gap-8">
        <ZonaUpload
          titolo="Foto del prodotto"
          sottotitolo="Una o piu foto del capo, anche in piu colori. Diventeranno la galleria."
          foto={fotoProdotto}
          onAggiungi={(e) => aggiungiFoto(e, "prodotto")}
          onRimuovi={(i) => rimuoviFoto("prodotto", i)}
          inputRef={inputProdRef}
          preparando={preparando}
        />
        <div className="h-5 lg:hidden" />
        <ZonaUpload
          titolo="Foto dell'etichetta"
          sottotitolo="Composizione e lavaggio. Non finisce in galleria, serve solo all'AI."
          foto={fotoEtichetta}
          onAggiungi={(e) => aggiungiFoto(e, "etichetta")}
          onRimuovi={(i) => rimuoviFoto("etichetta", i)}
          inputRef={inputEtiRef}
          preparando={preparando}
        />

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur md:left-60">
          <div className="mx-auto flex max-w-xl items-center justify-end lg:max-w-4xl">
            <button
              type="button"
              onClick={genera}
              disabled={fotoProdotto.length === 0 || preparando || generando}
              className="flex h-12 items-center gap-2 rounded-full bg-sea px-7 font-display text-sm font-bold text-white shadow-sea transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
            >
              {generando ? "Generazione in corso…" : "✨ Genera scheda"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- FASE REVISIONE -------------------------------------------------------
  return (
    <div className="mx-auto max-w-xl pb-28 lg:max-w-4xl">
      {/* A lg i campi si accoppiano su due colonne (ordine DOM invariato);
          descrizione e colori occupano tutta la riga. */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:gap-x-8">
        <Campo label="Nome" htmlFor="g-nome">
          <input
            id="g-nome"
            value={nome}
            onChange={(e) => {
              setNome(e.target.value);
              if (!slugDirty) setSlug(slugify(e.target.value));
            }}
            className={inputCls}
          />
        </Campo>

        <Campo label="Slug (indirizzo)" htmlFor="g-slug" hint={`/prodotti/${slug || "…"}`}>
          <input
            id="g-slug"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugDirty(true);
            }}
            spellCheck={false}
            autoCapitalize="none"
            className={`${inputCls} font-mono text-sm`}
          />
        </Campo>

        {/* Wrapper neutro sotto lg: serve solo allo span su due colonne. */}
        <div className="lg:col-span-2">
          <Campo label="Descrizione" htmlFor="g-desc">
            <textarea
              id="g-desc"
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              rows={7}
              className="min-h-40 w-full resize-y rounded-2xl bg-white px-4 py-3 text-base text-foreground ring-1 ring-line outline-none"
            />
          </Campo>
        </div>

        <Campo label="Categoria" htmlFor="g-cat">
          <select
            id="g-cat"
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
            className={`${inputCls} appearance-none`}
          >
            <option value="">Nessuna categoria</option>
            <OpzioniCategorie gruppi={categorieRaggruppate} />
          </select>
        </Campo>

        <Campo
          label="Prezzo"
          htmlFor="g-prezzo"
          hint={
            prezzoCents !== null && prezzoCents > 0
              ? `= ${formatPrezzo(prezzoCents)}`
              : "Stima AI, modificabile"
          }
        >
          <div className="relative">
            <input
              id="g-prezzo"
              value={prezzoInput}
              onChange={(e) => setPrezzoInput(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              className={`${inputCls} pr-9`}
            />
            <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-muted">
              €
            </span>
          </div>
        </Campo>

        {/* Colori (varianti) */}
        <div className="flex flex-col gap-2 lg:col-span-2">
          <span className="font-display text-sm font-bold text-foreground">
            Colori (diventano varianti, 1 pezzo ciascuno)
          </span>
          {colori.map((c, i) => (
            <div
              key={i}
              className="rounded-2xl bg-white p-3 shadow-soft ring-1 ring-line"
            >
              <div className="flex items-center gap-2">
                <input
                  value={c.nome}
                  onChange={(e) =>
                    setColori((arr) =>
                      arr.map((x, idx) =>
                        idx === i ? { ...x, nome: e.target.value } : x,
                      ),
                    )
                  }
                  placeholder="Nome colore"
                  className="h-10 flex-1 rounded-xl bg-white px-3 text-sm text-foreground ring-1 ring-line outline-none"
                />
                <button
                  type="button"
                  onClick={() =>
                    setColori((arr) => arr.filter((_, idx) => idx !== i))
                  }
                  className="rounded-full px-2.5 py-1.5 text-xs font-bold text-coral transition-colors hover:bg-coral/10"
                >
                  Rimuovi
                </button>
              </div>
              {c.foto_indici.length > 0 && (
                <div className="mt-2 flex gap-1.5">
                  {c.foto_indici.map((idx) =>
                    fotoProdotto[idx] ? (
                      // eslint-disable-next-line @next/next/no-img-element -- anteprima locale
                      <img
                        key={idx}
                        src={fotoProdotto[idx].preview}
                        alt=""
                        className="h-12 w-12 rounded-lg object-cover ring-1 ring-line"
                      />
                    ) : null,
                  )}
                </div>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setColori((arr) => [...arr, { nome: "", foto_indici: [] }])
            }
            className="self-start rounded-full px-3 py-2 text-sm font-bold text-sea transition-colors hover:bg-surface-2"
          >
            + Aggiungi colore
          </button>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur md:left-60">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 lg:max-w-4xl">
          <button
            type="button"
            onClick={() => setFase("upload")}
            disabled={creando}
            className="flex h-12 items-center rounded-full px-4 font-display text-sm font-bold text-muted transition-colors hover:text-foreground disabled:opacity-50"
          >
            Indietro
          </button>
          <button
            type="button"
            onClick={crea}
            disabled={creando || !nome.trim() || prezzoCents === null || prezzoCents <= 0}
            className="flex h-12 items-center rounded-full bg-sea px-7 font-display text-sm font-bold text-white shadow-sea transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
          >
            {creando ? "Creazione…" : "Crea bozza prodotto"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ZonaUpload({
  titolo,
  sottotitolo,
  foto,
  onAggiungi,
  onRimuovi,
  inputRef,
  preparando,
}: {
  titolo: string;
  sottotitolo: string;
  foto: FotoLocale[];
  onAggiungi: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRimuovi: (i: number) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  preparando: boolean;
}) {
  // Input dedicato alla fotocamera: `capture` la forza (un solo scatto per
  // volta, `multiple` viene ignorato). Tenuto separato dall'input galleria,
  // perche su molti device un singolo input `image/*` apre dritto alla galleria
  // senza offrire la fotocamera.
  const cameraRef = useRef<HTMLInputElement>(null);
  return (
    <section>
      <h2 className="font-display text-base font-extrabold text-foreground">
        {titolo}
      </h2>
      <p className="mb-2 text-xs text-muted">{sottotitolo}</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onAggiungi}
        className="hidden"
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onAggiungi}
        className="hidden"
      />
      <div className="flex flex-wrap gap-2">
        {foto.map((f, i) => (
          <div
            key={i}
            className="relative h-20 w-20 overflow-hidden rounded-xl ring-1 ring-line"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- anteprima locale */}
            <img src={f.preview} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              aria-label="Rimuovi foto"
              onClick={() => onRimuovi(i)}
              className="absolute right-0.5 top-0.5 grid h-6 w-6 place-items-center rounded-full bg-foreground/70 text-white"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={preparando}
          className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl bg-surface text-sea ring-1 ring-dashed ring-line transition-colors hover:bg-surface-2 disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true">
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
            <circle cx="12" cy="13" r="3.2" />
          </svg>
          <span className="text-[10px] font-bold leading-none">Scatta</span>
        </button>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={preparando}
          className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl bg-surface text-sea ring-1 ring-dashed ring-line transition-colors hover:bg-surface-2 disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2.5" />
            <circle cx="8.5" cy="8.5" r="1.6" />
            <path d="m21 15-5-5L5 21" />
          </svg>
          <span className="text-[10px] font-bold leading-none">Galleria</span>
        </button>
      </div>
    </section>
  );
}

