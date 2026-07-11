// Skeleton della rubrica indirizzi.

export default function LoadingIndirizzi() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <div className="h-7 w-48 animate-pulse rounded-full bg-surface-2" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="h-44 animate-pulse rounded-3xl bg-surface-2"
          />
        ))}
      </div>
    </div>
  );
}
