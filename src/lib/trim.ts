// Auto-ritaglio dei bordi UNIFORMI di una foto, lato client via canvas — come
// blur.ts, e per lo stesso motivo: niente `sharp` (non e una dipendenza del
// progetto ne importabile in modo affidabile dal runtime). Copre due sorgenti di
// "vuoto" attorno al soggetto:
//   - lo sfondo bianco degli scatti da catalogo ingrosso (un capo piccolo perso
//     in un mare di bianco -> rapporto orizzontale che rovina l'inquadratura);
//   - la trasparenza che resta dopo "Rimuovi sfondo" (@imgly) nell'editor.
//
// L'euristica e volutamente CONSERVATIVA: taglia solo bordi che sono davvero
// uniformi (tutti i pixel entro tolleranza dal colore d'angolo, oppure quasi
// trasparenti) e si tira indietro nei casi ambigui — meglio non ritagliare che
// mangiare un capo chiaro su fondo chiaro. Non lancia mai: in caso di dubbio o
// errore restituisce il blob originale, cosi l'upload non si rompe mai.

export interface EsitoTrim {
  /** Il blob ritagliato, oppure l'originale se non c'era nulla da togliere. */
  blob: Blob;
  /** true solo se abbiamo effettivamente ritagliato qualcosa. */
  ritagliata: boolean;
}

export interface OpzioniTrim {
  /** Distanza colore (0–255) entro cui un pixel conta come "sfondo". */
  tolleranza?: number;
  /** Alpha (0–255) sotto il quale un pixel conta come "vuoto" (trasparente). */
  sogliaAlpha?: number;
  /** Respiro attorno al soggetto, in frazione del suo lato (es. 0.02 = 2%). */
  margine?: number;
  /** Ritaglio complessivo minimo (frazione di area) sotto cui non vale la pena. */
  ritaglioMinimo?: number;
  /** Se il soggetto risulta piu piccolo di questa frazione dell'area totale,
   *  con ogni probabilita abbiamo "mangiato" un capo chiaro: non ritagliare. */
  areaMinima?: number;
}

const DEFAULT: Required<OpzioniTrim> = {
  tolleranza: 18,
  sogliaAlpha: 16,
  margine: 0.02,
  ritaglioMinimo: 0.02,
  areaMinima: 0.06,
};

/** Lato massimo su cui si CERCA il riquadro: lo scan gira su una copia piccola
 *  (veloce), il ritaglio finale resta a risoluzione piena. */
const LATO_SCAN = 480;

/**
 * Ritaglia i bordi uniformi di `blob`, restituendo un WebP (q0.92) del solo
 * soggetto piu un filo di margine. Se non c'e un bordo chiaro da togliere,
 * restituisce l'originale con `ritagliata:false`.
 */
export async function autoTrimmaImmagine(
  blob: Blob,
  opzioni: OpzioniTrim = {},
): Promise<EsitoTrim> {
  const o = { ...DEFAULT, ...opzioni };
  const intatta: EsitoTrim = { blob, ritagliata: false };

  try {
    if (
      typeof document === "undefined" ||
      typeof createImageBitmap !== "function"
    ) {
      return intatta;
    }

    const bitmap = await createImageBitmap(blob);
    const W = bitmap.width;
    const H = bitmap.height;
    if (W === 0 || H === 0) {
      bitmap.close();
      return intatta;
    }

    // 1) Copia ridotta per lo scan dei bordi.
    const scala = Math.min(LATO_SCAN / W, LATO_SCAN / H, 1);
    const sw = Math.max(1, Math.round(W * scala));
    const sh = Math.max(1, Math.round(H * scala));

    const scan = document.createElement("canvas");
    scan.width = sw;
    scan.height = sh;
    const sctx = scan.getContext("2d", { willReadFrequently: true });
    if (!sctx) {
      bitmap.close();
      return intatta;
    }
    sctx.drawImage(bitmap, 0, 0, sw, sh);
    const { data } = sctx.getImageData(0, 0, sw, sh);

    // 2) Colore di sfondo dai quattro angoli. Se non concordano, non c'e un
    //    bordo uniforme da togliere: lascia stare.
    const sfondo = coloreSfondo(data, sw, sh, o);
    if (!sfondo) {
      bitmap.close();
      return intatta;
    }

    // 3) Bounding box del contenuto (primo pixel "non vuoto" da ogni lato).
    const box = riquadroContenuto(data, sw, sh, sfondo, o);
    if (!box) {
      bitmap.close();
      return intatta; // tutto vuoto o tutto pieno
    }

    // 4) Margine di respiro, in coordinate dello scan.
    const latoMin = Math.min(box.x1 - box.x0, box.y1 - box.y0);
    const pad = Math.round(latoMin * o.margine);
    const x0 = Math.max(0, box.x0 - pad);
    const y0 = Math.max(0, box.y0 - pad);
    const x1 = Math.min(sw, box.x1 + pad);
    const y1 = Math.min(sh, box.y1 + pad);

    // 5) Vale la pena? (ritaglio non trascurabile e soggetto non "mangiato")
    const areaBox = (x1 - x0) * (y1 - y0);
    const areaTot = sw * sh;
    const frazione = areaBox / areaTot;
    if (frazione > 1 - o.ritaglioMinimo) {
      bitmap.close();
      return intatta; // praticamente niente da togliere
    }
    if (frazione < o.areaMinima) {
      bitmap.close();
      return intatta; // sospetto: capo chiaro su fondo chiaro, non rischiare
    }

    // 6) Riporta il riquadro a risoluzione piena e ritaglia dalla bitmap nitida.
    const fx0 = Math.round((x0 / sw) * W);
    const fy0 = Math.round((y0 / sh) * H);
    const fx1 = Math.round((x1 / sw) * W);
    const fy1 = Math.round((y1 / sh) * H);
    const fw = Math.max(1, fx1 - fx0);
    const fh = Math.max(1, fy1 - fy0);

    const out = document.createElement("canvas");
    out.width = fw;
    out.height = fh;
    const octx = out.getContext("2d");
    if (!octx) {
      bitmap.close();
      return intatta;
    }
    octx.drawImage(bitmap, fx0, fy0, fw, fh, 0, 0, fw, fh);
    bitmap.close();

    const ritagliato = await new Promise<Blob | null>((res) =>
      out.toBlob((b) => res(b), "image/webp", 0.92),
    );
    if (!ritagliato) return intatta;
    return { blob: ritagliato, ritagliata: true };
  } catch {
    return intatta;
  }
}

/**
 * Colore di sfondo stimato dai 4 angoli. Ritorna null se gli angoli NON sono
 * coerenti tra loro (nessun bordo uniforme = niente da ritagliare) — cosi le
 * foto gia inquadrate o con sfondo scenografico restano intatte.
 */
function coloreSfondo(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  o: Required<OpzioniTrim>,
): { r: number; g: number; b: number; a: number } | null {
  const idx = (x: number, y: number) => (y * w + x) * 4;
  const angoli = [
    idx(0, 0),
    idx(w - 1, 0),
    idx(0, h - 1),
    idx(w - 1, h - 1),
  ].map((i) => ({ r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] }));

  // Se tutti gli angoli sono quasi trasparenti, lo sfondo e la trasparenza.
  if (angoli.every((c) => c.a <= o.sogliaAlpha)) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  const rif = angoli[0];
  const coerenti = angoli.every(
    (c) =>
      Math.abs(c.r - rif.r) <= o.tolleranza &&
      Math.abs(c.g - rif.g) <= o.tolleranza &&
      Math.abs(c.b - rif.b) <= o.tolleranza &&
      c.a > o.sogliaAlpha,
  );
  return coerenti ? rif : null;
}

/** Trova il bounding box del contenuto scandendo i quattro lati verso l'interno. */
function riquadroContenuto(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  sfondo: { r: number; g: number; b: number; a: number },
  o: Required<OpzioniTrim>,
): { x0: number; y0: number; x1: number; y1: number } | null {
  const trasparente = sfondo.a === 0;
  const vuoto = (i: number) => {
    const a = data[i + 3];
    if (trasparente) return a <= o.sogliaAlpha;
    if (a <= o.sogliaAlpha) return true; // trasparente = vuoto anche su fondo pieno
    return (
      Math.abs(data[i] - sfondo.r) <= o.tolleranza &&
      Math.abs(data[i + 1] - sfondo.g) <= o.tolleranza &&
      Math.abs(data[i + 2] - sfondo.b) <= o.tolleranza
    );
  };

  const rigaPiena = (y: number) => {
    const base = y * w * 4;
    for (let x = 0; x < w; x++) if (!vuoto(base + x * 4)) return true;
    return false;
  };
  const colonnaPiena = (x: number) => {
    for (let y = 0; y < h; y++) if (!vuoto((y * w + x) * 4)) return true;
    return false;
  };

  let y0 = 0;
  while (y0 < h && !rigaPiena(y0)) y0++;
  if (y0 === h) return null; // immagine interamente vuota
  let y1 = h - 1;
  while (y1 > y0 && !rigaPiena(y1)) y1--;
  let x0 = 0;
  while (x0 < w && !colonnaPiena(x0)) x0++;
  let x1 = w - 1;
  while (x1 > x0 && !colonnaPiena(x1)) x1--;

  return { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}
