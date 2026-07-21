// Loading UI della scheda prodotto (force-dynamic): skeleton istantaneo con le
// proporzioni della PDP (galleria 3:4 + colonna acquisto), cosi il click su una
// card non lascia la pagina precedente "congelata" senza feedback.

export default function Loading() {
  return (
    // <div> (landmark nel layout) e STESSO contenitore della pagina vera
    // (max-w-5xl → lg:max-w-6xl, stessi padding): prima lo skeleton era 6xl
    // fisso su una pagina 5xl — micro layout-shift al termine del load.
    <div
      data-skel
      aria-hidden="true"
      className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:max-w-6xl lg:px-8"
    >
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2">
        <div className="h-4 w-12 animate-pulse rounded-full bg-surface" />
        <div className="h-4 w-16 animate-pulse rounded-full bg-surface" />
        <div className="h-4 w-24 animate-pulse rounded-full bg-surface" />
      </div>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        {/* Galleria */}
        <div className="aspect-[3/4] w-full animate-pulse rounded-3xl bg-surface" />

        {/* Colonna acquisto */}
        <div className="space-y-5">
          <div className="h-9 w-4/5 animate-pulse rounded-full bg-surface" />
          <div className="h-8 w-28 animate-pulse rounded-full bg-surface-2" />
          <div className="space-y-2 pt-2">
            <div className="h-4 w-full animate-pulse rounded-full bg-surface" />
            <div className="h-4 w-11/12 animate-pulse rounded-full bg-surface" />
            <div className="h-4 w-2/3 animate-pulse rounded-full bg-surface" />
          </div>
          <div className="flex gap-2.5 pt-3">
            <div className="h-11 w-11 animate-pulse rounded-full bg-surface" />
            <div className="h-11 w-11 animate-pulse rounded-full bg-surface" />
          </div>
          <div className="flex gap-2.5">
            <div className="h-12 w-14 animate-pulse rounded-2xl bg-surface" />
            <div className="h-12 w-14 animate-pulse rounded-2xl bg-surface" />
            <div className="h-12 w-14 animate-pulse rounded-2xl bg-surface" />
            <div className="h-12 w-14 animate-pulse rounded-2xl bg-surface" />
          </div>
          <div className="h-12 w-full animate-pulse rounded-full bg-surface sm:w-72" />
        </div>
      </div>
    </div>
  );
}
