// Skeleton dello storico ordini.

export default function LoadingOrdini() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <div className="h-7 w-40 animate-pulse rounded-full bg-surface-2" />
      {Array.from({ length: 3 }, (_, i) => (
        <div
          key={i}
          className="h-28 animate-pulse rounded-3xl bg-surface-2"
        />
      ))}
    </div>
  );
}
