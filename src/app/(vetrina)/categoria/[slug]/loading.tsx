// Loading UI della pagina categoria (force-dynamic): skeleton istantaneo
// durante la navigazione, al posto della pagina precedente "congelata".
import SkeletonCatalogo from "@/components/catalogo/SkeletonCatalogo";

export default function Loading() {
  return <SkeletonCatalogo />;
}
