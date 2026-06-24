// Generazione LQIP (Low-Quality Image Placeholder) lato client.
//
// Produce una data URL minuscola (~16px) da un'immagine, usando il canvas del
// browser — NON sharp lato server (non e una dipendenza del progetto e non e
// importabile dal codice app in modo affidabile). Il risultato e di poche
// centinaia di byte, viene salvato in `prodotto_foto.blur_data_url` e passato a
// next/image come `blurDataURL` (placeholder="blur") nella PDP: cosi, mentre la
// foto vera si carica, si vede subito una sua versione sfocata invece del vuoto.

/** Lato lungo del thumbnail di blur, in px. Tenuto piccolo: next/image lo
 *  ingrandisce e sfoca, e una data URL grande peggiora cio che dovrebbe
 *  migliorare (viaggia inline nell'HTML/RSC per ogni foto). */
const DIM = 16;

/**
 * Ritorna una data URL WebP ~16px a partire da un Blob immagine, oppure `null`
 * se la generazione non e possibile (ambiente senza DOM/canvas). Non lancia mai:
 * il blur e un miglioramento opzionale, il suo fallimento non deve rompere
 * l'upload.
 */
export async function generaBlurDataUrl(blob: Blob): Promise<string | null> {
  try {
    if (
      typeof document === "undefined" ||
      typeof createImageBitmap !== "function"
    ) {
      return null;
    }
    const bitmap = await createImageBitmap(blob);
    const scala = Math.min(DIM / bitmap.width, DIM / bitmap.height, 1);
    const w = Math.max(1, Math.round(bitmap.width * scala));
    const h = Math.max(1, Math.round(bitmap.height * scala));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return null;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    // q=0.5: la qualita non conta, l'immagine viene comunque sfocata. Safari <14
    // non supporta toDataURL("image/webp") e ripiega su PNG: va bene comunque.
    const url = canvas.toDataURL("image/webp", 0.5);
    return url.startsWith("data:image/") ? url : null;
  } catch {
    return null;
  }
}
