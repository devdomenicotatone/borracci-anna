import { redirect } from "next/navigation";

// /gestore -> /gestore/prodotti
export default function GestoreIndex() {
  redirect("/gestore/prodotti");
}
