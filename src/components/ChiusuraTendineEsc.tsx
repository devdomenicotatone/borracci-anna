"use client";

// Chiusura con Esc delle tendine dell'header (WCAG 1.4.13 "dismissible").
// I dropdown categorie e account sono CSS-only (group-hover +
// group-has-[:focus-visible]) su un Server Component: senza JS l'unico modo
// di chiuderli e spostare il puntatore o il focus, e Esc non fa nulla.
// Questo piccolo client component, montato dentro <Header>, ascolta Escape
// su document e:
//  (a) fa blur() dell'elemento attivo se sta dentro l'header → chiude il
//      ramo :has(:focus-visible);
//  (b) imposta data-tendine-chiuse su <html> → la regola in globals.css
//      nasconde i pannelli .tendina-header anche col puntatore ancora sopra.
// Al primo mousemove/pointerdown/focusin successivo l'attributo viene
// rimosso, cosi l'apertura via hover/focus torna a funzionare normalmente.

import { useEffect } from "react";

export default function ChiusuraTendineEsc() {
  useEffect(() => {
    const html = document.documentElement;

    function suEscape(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const attivo = document.activeElement;
      if (attivo instanceof HTMLElement && attivo.closest("header")) {
        attivo.blur();
      }
      html.setAttribute("data-tendine-chiuse", "");
    }

    // Qualunque interazione successiva riabilita le tendine.
    function riattiva() {
      if (html.hasAttribute("data-tendine-chiuse")) {
        html.removeAttribute("data-tendine-chiuse");
      }
    }

    document.addEventListener("keydown", suEscape);
    document.addEventListener("mousemove", riattiva);
    document.addEventListener("pointerdown", riattiva);
    document.addEventListener("focusin", riattiva);
    return () => {
      document.removeEventListener("keydown", suEscape);
      document.removeEventListener("mousemove", riattiva);
      document.removeEventListener("pointerdown", riattiva);
      document.removeEventListener("focusin", riattiva);
      html.removeAttribute("data-tendine-chiuse");
    };
  }, []);

  return null;
}
