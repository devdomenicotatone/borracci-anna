// Blocco dello scroll di pagina mentre un drawer/modale e aperto.
//
// Perche non basta `document.body.style.overflow = "hidden"`: su iOS Safari NON
// impedisce lo scroll da touch della pagina sottostante (bug WebKit noto), quindi
// il contenuto dietro il drawer scorre comunque. La tecnica affidabile e fissare
// il body con `position: fixed` all'attuale posizione di scroll (che iOS
// rispetta) e ripristinarla al rilascio.
//
// Conteggio dei lock: se piu overlay si sovrappongono (raro ma possibile), solo
// il PRIMO fissa il body e memorizza lo scroll, solo l'ULTIMO ripristina — cosi
// non si perde la posizione. Ogni chiamata ritorna una funzione di sblocco
// IDEMPOTENTE (una seconda invocazione non decrementa due volte il contatore).

let contaLock = 0;
let scrollSalvato = 0;
let stiliSalvati: {
  position: string;
  top: string;
  left: string;
  right: string;
  width: string;
  overflow: string;
} | null = null;

/** Blocca lo scroll del body (iOS-safe). Ritorna la funzione per sbloccare. */
export function bloccaScrollBody(): () => void {
  if (typeof document === "undefined") return () => {};

  if (contaLock === 0) {
    const body = document.body;
    scrollSalvato = window.scrollY;
    stiliSalvati = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollSalvato}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    // overflow:hidden resta come rinforzo per gli altri browser.
    body.style.overflow = "hidden";
  }
  contaLock++;

  let rilasciato = false;
  return () => {
    if (rilasciato) return;
    rilasciato = true;
    contaLock--;
    if (contaLock === 0 && stiliSalvati) {
      const body = document.body;
      body.style.position = stiliSalvati.position;
      body.style.top = stiliSalvati.top;
      body.style.left = stiliSalvati.left;
      body.style.right = stiliSalvati.right;
      body.style.width = stiliSalvati.width;
      body.style.overflow = stiliSalvati.overflow;
      stiliSalvati = null;
      // Ripristina la posizione di scroll che il body:fixed aveva "congelato".
      window.scrollTo(0, scrollSalvato);
    }
  };
}
