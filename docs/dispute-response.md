# Dispute & chargeback response runbook

A customer disputed a charge, or a processor opened a chargeback. This is what
the system does automatically, how to confirm it happened, and how to respond to
the processor before the deadline. **The clock matters: unanswered disputes are
auto-lost, and a run of lost disputes is what gets a Stripe/Paystack account
frozen.** Respond to every one, even the ones you expect to lose.

## What the system does automatically

Processors send dispute webhooks to the same signed endpoints as payments
(`POST /payments/webhooks/{paystack,stripe}`). On a signature-valid dispute:

- **Stripe** — `charge.dispute.created` and `charge.dispute.funds_withdrawn`
- **Paystack** — `charge.dispute.create` and `charge.dispute.remind`

`PaymentsService.handleDispute` then:

1. Looks up the `PaymentIntent` by the dispute's provider reference.
2. **Matched** → posts a `CHARGEBACK` ledger reversal (`MoneyService.chargeback`)
   that drains the coins back from the buyer's wallet to `PAYMENT_CLEARING`
   (idempotent on the intent, so a replay or `created`+`funds_withdrawn` pair is
   safe), marks the intent `DISPUTED`, logs at **ERROR**, and increments
   `afristage_payment_disputes_total{outcome="reversed"|"replayed"}`.
3. **Unmatched** (no intent for the reference — common on Stripe, where the
   dispute carries the *payment_intent* id, not the *checkout-session* id we
   stored) → logs at **ERROR** and increments
   `afristage_payment_disputes_total{outcome="unmatched"}`. **No ledger post.**
   A human must reconcile it (below). The clawback is never silently dropped.

## Detect

- **Metric:** alert on any increase in `afristage_payment_disputes_total`. Treat
  `outcome="unmatched"` as higher urgency — it means money left with no automatic
  ledger reversal.
- **Logs:** grep the api logs for `DISPUTE` (all dispute handling logs at ERROR):

  ```
  railway logs --service api | grep DISPUTE
  ```

## Diagnose

1. **Find the dispute in the processor dashboard** (Stripe → Payments → Disputes,
   or Paystack → Disputes). Note: reference, amount, currency, reason code, and
   the **evidence-due date**.
2. **Find our intent.** For a matched dispute the log line names the intent id and
   user. For an unmatched Stripe dispute, map the dispute's `payment_intent`/
   `charge` back to the checkout session in the Stripe dashboard, then find the
   intent by that session id:

   ```sql
   -- run via: railway ssh --service api -- node -e "...", or a read replica
   SELECT id, "userId", status, "amountMinor", currency, "coinAmount", "providerReference", "createdAt"
   FROM payment_intents
   WHERE "providerReference" = '<session-or-reference>';
   ```
3. **Confirm the ledger state.** A matched dispute has a `CHARGEBACK` transaction:

   ```sql
   SELECT id, type, "idempotencyKey", "createdAt"
   FROM ledger_transactions
   WHERE "idempotencyKey" = 'chargeback:<intentId>';
   ```

## Respond to the processor (before the deadline)

Submit evidence in the processor's dispute form. Cite:

- The public **refund & purchase policy**: <https://www.afristage.live/refunds.html>
  (states coins are a digital good delivered instantly; describes the dispute flow).
- **Proof of delivery**: the coins were credited (`COIN_PURCHASE` ledger entry) and,
  where applicable, spent as gifts — pull the buyer's ledger entries for the intent.
- **Purchase record**: intent row (amount, currency, timestamp) matching the charge.
- For "unrecognised charge": the account email and, if available, that the buyer
  continued to use the account after the purchase.

## Reconcile an UNMATCHED dispute (manual chargeback)

If the automatic path could not match the dispute to an intent but the money is
genuinely gone, post the reversal by hand once you've identified the intent:

```bash
# On the api service, using the app's real DB (railway ssh, NOT railway connect).
railway ssh --service api -- node -e '
  const { PrismaClient } = require("@prisma/client");
  const p = new PrismaClient();
  (async () => {
    const intentId = "<intentId>";
    const intent = await p.paymentIntent.findUnique({ where: { id: intentId } });
    if (!intent) throw new Error("no such intent");
    // Post the CHARGEBACK reversal + mark DISPUTED via the same idempotency key
    // the app would use, so a later webhook replay is a no-op. Prefer triggering
    // the service path if a maintenance endpoint exists; only hand-post if not.
    console.log(JSON.stringify(intent, null, 2));
  })().finally(() => p.$disconnect());
'
```

Prefer replaying the dispute webhook from the processor dashboard (Stripe and
Paystack both allow resend) once the reference is understood — that runs the
audited service path instead of a hand-written ledger post.

## After

- Verify ledger integrity is still clean after any manual post: hit the integrity
  endpoint / check `afristage_ledger_integrity_ok == 1`.
- If disputes cluster on one buyer or one creator, restrict that account and
  review for fraud.
- Fold any new failure mode into the auth/payments support playbook.
