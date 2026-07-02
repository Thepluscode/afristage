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

## Materialised balances (2026-07-02)

`wallet_accounts.balance_minor` is a materialised running balance, updated by an
atomic `increment` inside the SAME transaction as every entry write. The atomic
update takes the account's row lock, so concurrent posts serialize exactly as
the previous `FOR UPDATE` + full entry re-sum did — but posting is now O(1)
instead of O(entries-per-account) on the hot gifting path (R5 §9 item 1).

- Entries remain the source of truth; the ledger-integrity check cross-checks
  `balance_minor` against the entry sums per account and fails loudly
  (`driftedAccounts`) on any divergence.
- Guarded (non-negative) accounts are checked from the post-increment value; a
  violation aborts the whole transaction, rolling every increment back.
- Overdraw protection under real concurrency is proven by
  `ledger.concurrency.int-spec.ts` (`npm run test:concurrency`).
- Measured (Postgres, 50k-entry account): old per-post balance check ≈ 17 ms
  warm / 149 ms cold and grows with history; new increment ≈ 2–4 ms and
  balance read ≈ 0.4 ms — O(1) regardless of history.
