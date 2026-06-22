import FormProdotto from "@/components/gestore/FormProdotto";

export default function NuovoProdottoPage() {
  return (
    <div>
      <h1 className="mx-auto mb-5 max-w-xl text-xl font-semibold text-foreground">
        Nuovo prodotto
      </h1>
      <FormProdotto />
    </div>
  );
}
