#!/bin/bash
# Configurazione UNA TANTUM del webhook Stripe (modalita' TEST) puntato al
# dominio nuovo. Cosa fa, nell'ordine:
#   1. crea su Stripe l'endpoint https://annashoprimini.it/api/stripe/webhook
#      con i 4 eventi checkout che il sito gestisce;
#   2. mette la firma segreta (whsec_...) nella variabile STRIPE_WEBHOOK_SECRET
#      di PRODUZIONE su Vercel (tipo "sensitive": nessuno potra' rileggerla).
# Il segreto NON viene mai stampato a schermo. Da lanciare dalla cartella del
# progetto: bash scripts/configura-webhook-stripe.sh
# Al lancio del negozio coi pagamenti VERI: rifare lo stesso giro in modalita'
# live (chiavi sk_live) — vedi promemoria in docs/stato-lavori.md.
set -euo pipefail

cd "$(dirname "$0")/.."

KEY=$(grep "^STRIPE_SECRET_KEY=" .env.local | cut -d= -f2- | tr -d '"')
if [ -z "$KEY" ]; then echo "ERRORE: STRIPE_SECRET_KEY non trovata in .env.local"; exit 1; fi
case "$KEY" in
  sk_test_*) echo "Chiave Stripe: modalita' TEST (ok, pre-lancio)";;
  sk_live_*) echo "ATTENZIONE: chiave LIVE — questo script e' pensato per il test mode."; echo "Interrompo per sicurezza."; exit 1;;
  *) echo "ERRORE: chiave non riconosciuta"; exit 1;;
esac

echo "1/3 Creo l'endpoint webhook su Stripe..."
RESP=$(curl -s --max-time 30 -u "$KEY:" -X POST https://api.stripe.com/v1/webhook_endpoints \
  -d "url=https://annashoprimini.it/api/stripe/webhook" \
  -d "enabled_events[]=checkout.session.completed" \
  -d "enabled_events[]=checkout.session.async_payment_succeeded" \
  -d "enabled_events[]=checkout.session.async_payment_failed" \
  -d "enabled_events[]=checkout.session.expired" \
  -d "description=Anna Shop - webhook ordini (test mode)")
ID=$(printf '%s' "$RESP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))")
SECRET=$(printf '%s' "$RESP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('secret',''))")
if [ -z "$ID" ] || [ -z "$SECRET" ]; then
  echo "ERRORE nella creazione dell'endpoint. Risposta di Stripe:"
  printf '%s\n' "$RESP" | head -c 400; echo
  exit 1
fi
echo "   Endpoint creato: $ID"

echo "2/3 Aggiorno STRIPE_WEBHOOK_SECRET (produzione) su Vercel..."
npx vercel env rm STRIPE_WEBHOOK_SECRET production --yes --scope domenico-tatone-s-projects >/dev/null 2>&1 || true
printf "%s" "$SECRET" | npx vercel env add STRIPE_WEBHOOK_SECRET production --sensitive --scope domenico-tatone-s-projects >/dev/null
echo "   Variabile aggiornata."

echo "3/3 Verifica..."
npx vercel env ls production --scope domenico-tatone-s-projects 2>/dev/null | grep -q "STRIPE_WEBHOOK_SECRET" \
  && echo "   STRIPE_WEBHOOK_SECRET presente in produzione: OK" \
  || { echo "   ERRORE: variabile non trovata!"; exit 1; }

echo
echo "FATTO. Ora serve una ripubblicazione del sito (la fa Claude col prossimo push)."
