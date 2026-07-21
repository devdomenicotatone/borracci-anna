// Live region sr-only per lo stato di invio dei form (WCAG 4.1.3): il cambio
// etichetta di un bottone disabled non viene mai annunciato (il focus cade sul
// body). La regione e' SEMPRE montata (vuota a riposo): l'inserimento del testo
// e' cio' che gli screen reader annunciano in modo affidabile.
export default function StatoInvio({
  attivo,
  testo = "Invio in corso",
}: {
  attivo: boolean;
  testo?: string;
}) {
  return (
    <span role="status" className="sr-only">
      {attivo ? testo : ""}
    </span>
  );
}
