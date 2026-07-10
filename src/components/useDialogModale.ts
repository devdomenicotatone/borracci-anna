"use client";

// Gestione accessibile di una modale (stesso comportamento di CartDrawer/MenuMobile):
// allo stato `aperto` sposta il focus nel pannello, lo intrappola (Tab/Shift+Tab),
// chiude con Esc, blocca lo scroll del body e ripristina il focus al chiudere.
// Estratto in un hook per non ricopiarlo in ogni dialog.

import { useEffect, useRef, type RefObject } from "react";

import { bloccaScrollBody } from "@/lib/scroll-lock";

const FOCUSABILI =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialogModale(
  aperto: boolean,
  pannelloRef: RefObject<HTMLElement | null>,
  onChiudi: () => void,
): void {
  // onChiudi in una ref (aggiornata in un effetto, non durante il render): cosi
  // l'effect principale dipende solo da `aperto` e non si ri-esegue
  // (rifocalizzando) a ogni render se il chiamante passa una closure inline.
  const onChiudiRef = useRef(onChiudi);
  useEffect(() => {
    onChiudiRef.current = onChiudi;
  }, [onChiudi]);

  useEffect(() => {
    if (!aperto) return;

    const precedente = document.activeElement as HTMLElement | null;
    const sbloccaScroll = bloccaScrollBody();

    const pannello = pannelloRef.current;
    const focusabili = () =>
      Array.from(pannello?.querySelectorAll<HTMLElement>(FOCUSABILI) ?? []);
    // Sposta il focus dentro il pannello (primo controllo, o il pannello stesso).
    (focusabili()[0] ?? pannello)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onChiudiRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusabili();
      if (items.length === 0) return;
      const primo = items[0];
      const ultimo = items[items.length - 1];
      if (e.shiftKey && document.activeElement === primo) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primo.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      sbloccaScroll();
      precedente?.focus?.();
    };
  }, [aperto, pannelloRef]);
}
