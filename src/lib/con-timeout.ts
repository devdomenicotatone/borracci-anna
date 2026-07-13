// Tetto di tempo per le promesse delle Server Action, condiviso dai flussi di
// pagamento (PulsantePaga, ModuloRichiesta): su rete lenta o caduta la UI si
// sblocca e mostra un errore invece di restare in attesa per sempre.

/** Errore sentinella: l'action non ha risposto entro il tetto di tempo. */
export class ErroreTimeout extends Error {}

/**
 * Esegue la promise con un tetto di `ms`: oltre, rigetta con ErroreTimeout.
 * Le server action non accettano un AbortSignal come fetch: la richiesta in
 * volo non viene annullata, ma la UI si sblocca comunque (stesso effetto
 * dell'AbortController in CheckoutButton, CartItem.tsx).
 */
export function conTimeout<T>(promessa: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ErroreTimeout()), ms);
    promessa.then(
      (valore) => {
        clearTimeout(timer);
        resolve(valore);
      },
      (motivo) => {
        clearTimeout(timer);
        reject(motivo);
      },
    );
  });
}
