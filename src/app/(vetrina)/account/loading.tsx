// Skeleton della dashboard account (la shell la rende il layout).

export default function LoadingAccount() {
  return (
    <div className="grid gap-4 sm:grid-cols-2" aria-hidden="true">
      {Array.from({ length: 4 }, (_, i) => (
        <div
          key={i}
          className="h-44 animate-pulse rounded-3xl bg-surface-2"
        />
      ))}
    </div>
  );
}
