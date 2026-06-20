# Wallet and Ledger Design

AfriStage uses double-entry accounting.

Rules:

1. Every posted transaction has at least one debit and one credit.
2. Debits must equal credits.
3. Posted transactions are immutable.
4. Reversals create new ledger transactions.
5. Idempotency keys are mandatory for money-moving operations.

## Gift example

Viewer sends 100 COIN gift.

```text
Debit viewer COIN account: 100
Credit creator EARNING account: 60
Credit platform revenue account: 40
```

## Payout request

```text
Debit creator EARNING account
Credit creator PAYOUT_HOLD account
```

## Payout paid

```text
Debit creator PAYOUT_HOLD account
Credit PAYOUT_CLEARING account
```
