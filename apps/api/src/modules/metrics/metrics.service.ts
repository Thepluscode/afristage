import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry } from 'prom-client';

// R5 §8: metrics on the money paths. The MoneyService catalog (RFC #144) is
// the single choke point every gift/mission/event/payout/purchase settlement
// flows through, so instrumenting it here covers ALL money movement; the
// ledger-integrity cron reports the money system's health as gauges.
//
// ponytail: an app-local registry (no default-metrics collector) — add
// collectDefaultMetrics() when node-level dashboards are wanted.
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  // Every settled/failed/replayed money move, labelled by catalog method.
  readonly moneyMoves = new Counter({
    name: 'afristage_money_moves_total',
    help: 'Money moves posted through the MoneyService catalog',
    labelNames: ['move', 'outcome'] as const, // outcome: settled | replayed | rejected | failed
    registers: [this.registry]
  });

  readonly moneyMoveDuration = new Histogram({
    name: 'afristage_money_move_duration_seconds',
    help: 'End-to-end duration of a money move (resolution + guarded ledger post)',
    labelNames: ['move'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
    registers: [this.registry]
  });

  readonly moneyMoveCoins = new Counter({
    name: 'afristage_money_move_coins_total',
    help: 'Coins moved per catalog method (settled moves only)',
    labelNames: ['move'] as const,
    registers: [this.registry]
  });

  // Every dispute/chargeback webhook we act on, by provider and outcome.
  // 'unmatched' is the one to alert on: the provider clawed funds for a charge
  // we can't tie to an intent (session-id vs dispute PI-id mismatch, or a stale
  // event) — a human must reconcile it (see docs/dispute-response.md).
  readonly disputes = new Counter({
    name: 'afristage_payment_disputes_total',
    help: 'Dispute/chargeback webhooks received',
    labelNames: ['provider', 'outcome'] as const, // outcome: reversed | replayed | unmatched
    registers: [this.registry]
  });

  // ---------- business metrics (the revenue conversation, distinct from infra) ----------
  // Infra says "server healthy"; these say "money is/ isn't flowing". The
  // revenue-drop cron alerts when customers are checking out but nothing settles.
  readonly signups = new Counter({
    name: 'afristage_signups_total',
    help: 'User registrations',
    registers: [this.registry]
  });
  readonly checkoutIntents = new Counter({
    name: 'afristage_checkout_intents_total',
    help: 'Card checkout sessions started (a customer began paying)',
    registers: [this.registry]
  });

  // The ledger-integrity cron's verdict, scrapeable for alerting: ok flips to
  // 0 the moment debits != credits, a transaction is imbalanced, or a
  // materialised balance drifts from its entries.
  readonly ledgerIntegrityOk = new Gauge({
    name: 'afristage_ledger_integrity_ok',
    help: '1 when the last integrity sweep was clean, 0 otherwise',
    registers: [this.registry]
  });
  readonly ledgerUnbalanced = new Gauge({
    name: 'afristage_ledger_unbalanced_transactions',
    help: 'Imbalanced transactions found by the last integrity sweep',
    registers: [this.registry]
  });
  readonly ledgerDrifted = new Gauge({
    name: 'afristage_ledger_drifted_accounts',
    help: 'Accounts whose materialised balance drifted from their entries in the last sweep',
    registers: [this.registry]
  });
  readonly ledgerLastCheck = new Gauge({
    name: 'afristage_ledger_integrity_last_check_timestamp_seconds',
    help: 'Unix time of the last integrity sweep (stale = the cron is dead)',
    registers: [this.registry]
  });

  // The revenue-drop cron's verdict, scrapeable for alerting: flips to 1 when
  // customers started checkouts in the window but ZERO payments settled — the
  // "payments silently stopped while the server looks healthy" signal. The
  // windowed counts are exposed too so a dashboard can chart them.
  readonly revenueAlert = new Gauge({
    name: 'afristage_revenue_alert',
    help: '1 when checkouts are happening but no payments are settling, 0 otherwise',
    registers: [this.registry]
  });
  readonly signupsRecent = new Gauge({
    name: 'afristage_signups_recent',
    help: 'Registrations in the last revenue-check window',
    registers: [this.registry]
  });
  readonly checkoutsRecent = new Gauge({
    name: 'afristage_checkouts_recent',
    help: 'Card checkouts started in the last revenue-check window',
    registers: [this.registry]
  });
  readonly paymentsRecent = new Gauge({
    name: 'afristage_payments_recent',
    help: 'Payments settled in the last revenue-check window',
    registers: [this.registry]
  });
  readonly revenueLastCheck = new Gauge({
    name: 'afristage_revenue_last_check_timestamp_seconds',
    help: 'Unix time of the last revenue check (stale = the cron is dead)',
    registers: [this.registry]
  });

  // Wraps one money move with timing + outcome accounting. Metrics failures
  // must never fail money — the record calls are try/caught.
  async trackMove<T extends { replayed: boolean }>(move: string, coins: () => number, run: () => Promise<T>): Promise<T> {
    const stop = this.moneyMoveDuration.startTimer({ move });
    try {
      const result = await run();
      stop();
      this.safeRecord(() => {
        this.moneyMoves.inc({ move, outcome: result.replayed ? 'replayed' : 'settled' });
        if (!result.replayed) this.moneyMoveCoins.inc({ move }, coins());
      });
      return result;
    } catch (e: any) {
      stop();
      // 4xx = business rejection (insufficient balance, bad input); else failure.
      const rejected = typeof e?.getStatus === 'function' && e.getStatus() >= 400 && e.getStatus() < 500;
      this.safeRecord(() => this.moneyMoves.inc({ move, outcome: rejected ? 'rejected' : 'failed' }));
      throw e;
    }
  }

  recordIntegrity(report: { ok: boolean; unbalancedTransactions: number; driftedAccounts: unknown[] }) {
    this.safeRecord(() => {
      this.ledgerIntegrityOk.set(report.ok ? 1 : 0);
      this.ledgerUnbalanced.set(report.unbalancedTransactions);
      this.ledgerDrifted.set(report.driftedAccounts.length);
      this.ledgerLastCheck.set(Date.now() / 1000);
    });
  }

  recordRevenue(report: { alerting: boolean; signups: number; checkouts: number; payments: number }) {
    this.safeRecord(() => {
      this.revenueAlert.set(report.alerting ? 1 : 0);
      this.signupsRecent.set(report.signups);
      this.checkoutsRecent.set(report.checkouts);
      this.paymentsRecent.set(report.payments);
      this.revenueLastCheck.set(Date.now() / 1000);
    });
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }

  private safeRecord(fn: () => void) {
    try {
      fn();
    } catch {
      /* metrics are observability, never a failure path */
    }
  }
}
