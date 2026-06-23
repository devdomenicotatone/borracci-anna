// Percorso storico: il Toaster ora vive in components/Toaster.tsx ed e condiviso
// tra area gestore e vetrina. Re-export per non rompere gli import esistenti.
export { ToasterProvider, useToast } from "@/components/Toaster";
