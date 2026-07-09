import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { CheckoutInit, ChargeVerification, PaymentProvider, WebhookCharge } from './payment-provider';

const STRIPE_BASE = 'https://api.stripe.com/v1';
const TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = Number(process.env.STRIPE_BACKOFF_BASE_MS ?? 200);
// Stripe requires post-checkout redirect targets; crediting is webhook/verify
// driven, so these are just where the browser lands afterwards.
const SUCCESS_URL = process.env.STRIPE_SUCCESS_URL || 'https://afristage.live/wallet?paid=1';
const CANCEL_URL = process.env.STRIPE_CANCEL_URL || 'https://afristage.live/wallet?canceled=1';
// Webhook replay window: reject signatures whose timestamp is older/newer than
// this many seconds (Stripe's own default is 300). Configurable for clock skew.
const WEBHOOK_TOLERANCE_SEC = Number(process.env.STRIPE_WEBHOOK_TOLERANCE_SEC ?? 300);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Global-card processor (Stripe Checkout). Selected for non-African currencies
// (USD today). Coins are credited only after the verified webhook / pull-verify
// re-checks amount + currency — this class never touches the ledger.
@Injectable()
export class StripeProvider extends PaymentProvider {
  readonly name = 'STRIPE';
  private readonly logger = new Logger(StripeProvider.name);
  private readonly secret = process.env.STRIPE_SECRET_KEY || '';
  private readonly webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

  isConfigured(): boolean {
    return !!this.secret && this.secret !== 'replace_me';
  }

  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(/* istanbul ignore next */ () => ctrl.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(url, { ...init, signal: ctrl.signal });
        const retryable = res.status === 429 || res.status >= 500;
        if (retryable && attempt < MAX_ATTEMPTS - 1) {
          const wait = this.backoffMs(attempt, res.headers.get('retry-after'));
          this.logger.warn(`Stripe ${res.status}; retry ${attempt + 1}/${MAX_ATTEMPTS - 1} in ${wait}ms`);
          await sleep(wait);
          continue;
        }
        return res;
      } catch (err) {
        lastErr = err;
        if (attempt < MAX_ATTEMPTS - 1) {
          await sleep(this.backoffMs(attempt, null));
          continue;
        }
      } finally {
        clearTimeout(timer);
      }
    }
    /* istanbul ignore next */
    throw lastErr ?? new Error('Stripe request failed');
  }

  private backoffMs(attempt: number, retryAfter: string | null): number {
    const headerSec = retryAfter ? Number(retryAfter) : NaN;
    if (Number.isFinite(headerSec) && headerSec >= 0) return Math.min(headerSec * 1000, 5_000);
    const exp = BASE_BACKOFF_MS * 2 ** attempt;
    return Math.min(Math.round(exp * (0.5 + Math.random() * 0.5)), 5_000);
  }

  // Create a hosted Checkout Session. Our reference rides as client_reference_id
  // (echoed in the webhook); the returned session id becomes the intent's
  // providerReference so pull-verify can GET the session.
  async initialize(params: { email: string; amountMinor: number; currency: string; reference: string }): Promise<CheckoutInit> {
    const form = new URLSearchParams();
    form.set('mode', 'payment');
    form.set('success_url', SUCCESS_URL);
    form.set('cancel_url', CANCEL_URL);
    form.set('client_reference_id', params.reference);
    form.set('customer_email', params.email);
    form.set('metadata[reference]', params.reference);
    form.set('line_items[0][quantity]', '1');
    form.set('line_items[0][price_data][currency]', params.currency.toLowerCase());
    form.set('line_items[0][price_data][unit_amount]', String(params.amountMinor));
    form.set('line_items[0][price_data][product_data][name]', 'AfriStage coins');
    try {
      const res = await this.fetchWithRetry(`${STRIPE_BASE}/checkout/sessions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.secret}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString()
      });
      const json: any = await res.json().catch(() => ({}));
      if (!res.ok || !json?.id || !json?.url) {
        this.logger.error(`Stripe session init failed (${res.status}): ${json?.error?.message ?? 'no body'}`);
        throw new BadGatewayException('Payment provider rejected the request');
      }
      return { checkoutUrl: json.url, providerReference: json.id };
    } catch (err) {
      if (err instanceof BadGatewayException) throw err;
      this.logger.error(`Stripe init error: ${err instanceof Error ? err.message : String(err)}`);
      throw new BadGatewayException('Payment provider unavailable');
    }
  }

  // Pull-based confirmation by session id — for dev (no public webhook) and as a
  // webhook fallback. The caller still re-checks amount/currency before crediting.
  async verify(reference: string): Promise<ChargeVerification> {
    try {
      const res = await this.fetchWithRetry(`${STRIPE_BASE}/checkout/sessions/${encodeURIComponent(reference)}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.secret}` }
      });
      const json: any = await res.json().catch(() => ({}));
      if (!res.ok || !json?.id) {
        this.logger.error(`Stripe verify failed (${res.status}): ${json?.error?.message ?? 'no body'}`);
        throw new BadGatewayException('Could not verify payment');
      }
      return {
        success: json.payment_status === 'paid',
        amountMinor: Number(json.amount_total ?? -1),
        currency: String(json.currency ?? '').toUpperCase()
      };
    } catch (err) {
      if (err instanceof BadGatewayException) throw err;
      this.logger.error(`Stripe verify error: ${err instanceof Error ? err.message : String(err)}`);
      throw new BadGatewayException('Payment provider unavailable');
    }
  }

  // Stripe signs webhooks as `t=<unix>,v1=<hmacSHA256(`${t}.${rawBody}`)>` using
  // the endpoint's signing secret. Verify against the raw bytes, constant-time,
  // AND reject a timestamp outside the tolerance window — without the freshness
  // check a captured (payload, signature) pair replays forever. The ledger
  // idempotency key already blocks double-credit; this is defence in depth, the
  // same ~5-minute default Stripe's own libraries enforce.
  verifySignature(rawBody: Buffer | undefined, signature?: string): boolean {
    if (!this.webhookSecret || !rawBody || !signature) return false;
    const parts = Object.fromEntries(signature.split(',').map((kv) => kv.split('=')));
    const t = parts.t;
    const v1 = parts.v1;
    if (!t || !v1) return false;
    const expected = crypto.createHmac('sha256', this.webhookSecret).update(`${t}.${rawBody.toString('utf8')}`).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(v1);
    const hmacOk = a.length === b.length && crypto.timingSafeEqual(a, b);
    // Reject stale or skewed timestamps (replay protection). Compute alongside the
    // HMAC so a bad timestamp doesn't short-circuit before the constant-time compare.
    const ts = Number(t);
    const fresh = Number.isFinite(ts) && Math.abs(Date.now() / 1000 - ts) <= WEBHOOK_TOLERANCE_SEC;
    return hmacOk && fresh;
  }

  parseWebhook(rawBody: Buffer): WebhookCharge | null {
    let event: any;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return null;
    }
    if (event?.type !== 'checkout.session.completed') return null;
    const s = event.data?.object ?? {};
    return {
      providerReference: String(s.id ?? ''),
      amountMinor: Number(s.amount_total ?? -1),
      currency: String(s.currency ?? '').toUpperCase(),
      success: s.payment_status === 'paid'
    };
  }
}
