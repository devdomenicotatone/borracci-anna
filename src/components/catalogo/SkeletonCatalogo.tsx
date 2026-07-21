// Skeleton della griglia catalogo, mostrato dai loading.tsx di /prodotti e
// /categoria/[slug] durante la navigazione (le pagine sono force-dynamic:
// senza un fallback istantaneo il click su una voce di menu non dava alcun
// feedback finche il server non rispondeva). Proporzioni identiche alle
// ProductCard (riquadro 3:4, griglia 2/3/4 colonne) per minimizzare il salto
// al termine del caricamento.

/** Blocchi grigi pulsanti con le proporzioni di una ProductCard. */
function SkeletonCard() {
  return (
    <div className="rounded-3xl bg-white p-2.5 shadow-soft">
      <div className="aspect-[3/4] w-full animate-pulse rounded-2xl bg-surface" />
      <div className="space-y-2 px-1.5 pb-2 pt-3">
        <div className="h-4 w-3/4 animate-pulse rounded-full bg-surface" />
        <div className="h-4 w-1/3 animate-pulse rounded-full bg-surface-2" />
      </div>
    </div>
  );
}

export default function SkeletonCatalogo({ card = 8 }: { card?: number }) {
  return (
    <div data-skel aria-hidden="true" className="mx-auto max-w-6xl px-5 py-10">
      {/* Titolo + toolbar */}
      <div className="h-9 w-52 animate-pulse rounded-full bg-surface" />
      <div className="mt-6 flex gap-2.5">
        <div className="h-10 w-28 animate-pulse rounded-full bg-surface" />
        <div className="h-10 w-24 animate-pulse rounded-full bg-surface" />
        <div className="h-10 w-32 animate-pulse rounded-full bg-surface" />
      </div>
      <div className="mt-5 h-12 w-full animate-pulse rounded-full bg-surface" />

      {/* Griglia card */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: card }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
