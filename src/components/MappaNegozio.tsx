"use client";

// Mappa interattiva del negozio (Leaflet + tile OpenStreetMap).
// Rispetto all'embed iframe: pin BRANDIZZATO con l'insegna (corallo, icona shopping)
// posizionato esattamente sul civico 169/C, con etichetta. Niente API key, niente
// cookie di tracciamento. Leaflet usa `window`, quindi e import dinamico in effetto
// (client-only) e il marker e un divIcon HTML (nessun asset immagine da bundlare).

import { useEffect, useRef } from "react";

import "leaflet/dist/leaflet.css";

import { NEGOZIO } from "@/lib/negozio";

// Pin a goccia corallo con icona "shopping bag" bianca al centro.
const MARKER_HTML = `
<div style="filter:drop-shadow(0 5px 6px rgba(0,40,70,.4))">
  <svg width="42" height="52" viewBox="0 0 42 52" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M21 1.5C10.8 1.5 2.5 9.8 2.5 20c0 13 18.5 30 18.5 30s18.5-17 18.5-30C39.5 9.8 31.2 1.5 21 1.5Z" fill="#ff5c5c" stroke="#ffffff" stroke-width="2.5"/>
    <circle cx="21" cy="20" r="12.5" fill="#ffffff"/>
    <g stroke="#ff5c5c" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M15.6 18.6h10.8l.8 8.5a1.2 1.2 0 0 1-1.2 1.3H16a1.2 1.2 0 0 1-1.2-1.3z"/>
      <path d="M18.1 18.6v-1.1a2.9 2.9 0 0 1 5.8 0v1.1"/>
    </g>
  </svg>
</div>`;

export default function MappaNegozio() {
  const contenitore = useRef<HTMLDivElement>(null);
  const mappaRef = useRef<import("leaflet").Map | null>(null);

  useEffect(() => {
    if (!contenitore.current || mappaRef.current) return;
    let annullato = false;
    let timerResize: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      const L = await import("leaflet");
      if (annullato || !contenitore.current) return;

      const { lat, lng } = NEGOZIO.coordinate;
      const mappa = L.map(contenitore.current, {
        center: [lat, lng],
        zoom: 18,
        scrollWheelZoom: false, // niente hijack dello scroll di pagina
      });
      mappaRef.current = mappa;
      mappa.attributionControl.setPosition("bottomleft");

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(mappa);

      const icona = L.divIcon({
        className: "byf-marker",
        html: MARKER_HTML,
        iconSize: [42, 52],
        iconAnchor: [21, 50],
        popupAnchor: [0, -44],
      });

      L.marker([lat, lng], { icon: icona, title: NEGOZIO.insegna })
        .addTo(mappa)
        .bindPopup(
          `<strong>${NEGOZIO.insegna}</strong><br>${NEGOZIO.indirizzo.via}`,
        )
        .openPopup();

      // La cella mappa puo essere dimensionata dopo l'init: ricalcola.
      timerResize = setTimeout(() => mappa.invalidateSize(), 0);
    })();

    return () => {
      annullato = true;
      clearTimeout(timerResize);
      mappaRef.current?.remove();
      mappaRef.current = null;
    };
  }, []);

  return (
    <div
      ref={contenitore}
      role="img"
      aria-label={`Mappa: ${NEGOZIO.insegna}, ${NEGOZIO.indirizzoCompleto}`}
      className="absolute inset-0 h-full w-full"
    />
  );
}
