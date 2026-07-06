// Opzioni di un <select> categorie a 3 livelli, condivise da CategoriaSelect,
// FormProdotto e GeneraDaFoto. L'HTML non permette optgroup annidati: le macro
// diventano optgroup, le figlie opzioni, le nipoti opzioni indentate (nbsp).
// La voce "(tutto)" assegna la categoria di raggruppamento stessa.

import { Fragment } from "react";

import type { GruppoCategorie } from "@/lib/categorie-albero";

// Indentazione delle nipoti dentro l'optgroup (gli spazi normali collassano).
const RIENTRO = "   ";

export default function OpzioniCategorie({
  gruppi,
}: {
  gruppi: GruppoCategorie[];
}) {
  return (
    <>
      {gruppi.map(({ radice, figlie }) =>
        figlie.length === 0 ? (
          <option key={radice.id} value={radice.id}>
            {radice.nome}
          </option>
        ) : (
          <optgroup key={radice.id} label={radice.nome}>
            <option value={radice.id}>{radice.nome} (tutto)</option>
            {figlie.map(({ figlia, nipoti }) =>
              nipoti.length === 0 ? (
                <option key={figlia.id} value={figlia.id}>
                  {figlia.nome}
                </option>
              ) : (
                <Fragment key={figlia.id}>
                  <option value={figlia.id}>{figlia.nome} (tutto)</option>
                  {nipoti.map((n) => (
                    <option key={n.id} value={n.id}>
                      {RIENTRO}
                      {n.nome}
                    </option>
                  ))}
                </Fragment>
              ),
            )}
          </optgroup>
        ),
      )}
    </>
  );
}
