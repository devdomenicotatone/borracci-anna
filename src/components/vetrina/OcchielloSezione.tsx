// Etichetta piccola sopra il titolo di una fascia ("occhiello"): maiuscoletto
// mare con un puntino, coerente con lo stile della vetrina.

export default function OcchielloSezione({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-sea">
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full bg-coral"
      />
      {children}
    </span>
  );
}
