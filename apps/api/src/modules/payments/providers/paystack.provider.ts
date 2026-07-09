import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { CheckoutInit, ChargeVerification, PaymentProvider, WebhookCharge } from './payment-provider';

const PAYSTACK_BASE = 'https://api.paystack.co';
const INIT_TIMEOUT_MS = 10_000;
// Outbound resilience: Paystack can return 429 (rate limit) or transient 5xx.
// Retry those (and network errors) with bounded exponential backoff + jitter so
// a brief blip doesn't fail a checkout. 4xx (other than 429) is a real rejection
// and is NOT retried. Money is still only credited by the verified webhook.
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = Number(process.env.PAYSTACK_BACKOFF_BASE_MS ?? 200);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Paystack signs each webhook with HMAC-SHA512 of the raw request body using the
// secret key, sent in the `x-paystack-signature` header. We MUST verify against
// the raw bytes (not re-serialized JSON) and never credit coins without a match.
@Injectable()
export class PaystackProvider extends PaymentProvider {
  readonly name = 'PAYSTACK';
  private readonly logger = new Logger(PaystackProvider.name);
  private readonly secret = process.env.PAYSTACK_SECRET_KEY || '';

  isConfigured(): boolean {
    return !!this.secret && this.secret !== 'replace_me';
  }

  // Single outbound HTTP path with per-attempt timeout + bounded backoff. Retries
  // 429/5xx and network/abort errors; returns the Response otherwise (callers do
  // their own body validation). Honours Retry-After when Paystack sends it.
  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const ctrl = new AbortController();
      // Defensive per-attempt timeout guard; only fires on a real ~10s stall.
      const timer = setTimeout(/* istanbul ignore next */ () => ctrl.abort(), INIT_TIMEOUT_MS);
      try {
        const res = await fetch(url, { ...init, signal: ctrl.signal });
        const retryable = res.status === 429 || res.status >= 500;
        if (retryable && attempt < MAX_ATTEMPTS - 1) {
          const wait = this.backoffMs(attempt, res.headers.get('retry-after'));
          this.logger.warn(`Paystack ${res.status}; retry ${attempt + 1}/${MAX_ATTEMPTS - 1} in ${wait}ms`);
          await sleep(wait);
          continue;
        }
        return res;
      } catch (err) {
        lastErr = err;
        if (attempt < MAX_ATTEMPTS - 1) {
          const wait = this.backoffMs(attempt, null);
          this.logger.warn(`Paystack network error; retry ${attempt + 1}/${MAX_ATTEMPTS - 1} in ${wait}ms`);
          await sleep(wait);
          continue;
        }
      } finally {
        clearTimeout(timer);
      }
    }
    // lastErr is always set when the loop exits (only the network-error path ends
    // it); the literal fallback is defensive and unreachable.
    /* istanbul ignore next */
    throw lastErr ?? new Error('Paystack request failed');
  }

  // Exponential (base * 2^attempt) + full jitter, capped at 5s. A numeric
  // Retry-After (seconds) from Paystack overrides the computed delay.
  private backoffMs(attempt: number, retryAfter: string | null): number {
    const headerSec = retryAfter ? Number(retryAfter) : NaN;
    if (Number.isFinite(headerSec) && headerSec >= 0) return Math.min(headerSec * 1000, 5_000);
    const exp = BASE_BACKOFF_MS * 2 ** attempt;
    return Math.min(Math.round(exp * (0.5 + Math.random() * 0.5)), 5_000);
  }

  // Server-side checkout initialization. We pass our own reference so it matches
  // the intent we record; Paystack echoes it back in the verified webhook. Money
  // is only credited by the webhook after amount/currency/signature checks — this
  // call just hands the client a hosted-checkout URL.
  async initialize(params: {
    email: string;
    amountMinor: number;
    currency: string;
    reference: string;
  }): Promise<CheckoutInit> {
    try {
      const res = await this.fetchWithRetry(`${PAYSTACK_BASE}/transaction/initialize`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: params.email,
          amount: params.amountMinor,
          currency: params.currency,
          reference: params.reference
        })
      });
      const json: any = await res.json().catch(() => ({}));
      if (!res.ok || !json?.status || !json?.data?.authorization_url) {
        this.logger.error(`Paystack init failed (${res.status}): ${json?.message ?? 'no body'}`);
        throw new BadGatewayException('Payment provider rejected the request');
      }
      return { checkoutUrl: json.data.authorization_url, providerReference: json.data.reference ?? params.reference };
    } catch (err) {
      if (err instanceof BadGatewayException) throw err;
      this.logger.error(`Paystack init error: ${err instanceof Error ? err.message : String(err)}`);
      throw new BadGatewayException('Payment provider unavailable');
    }
  }

  // Pull-based confirmation — needed in dev (localhost can't receive webhooks) and
  // as a fallback if a webhook is delayed. Returns the authoritative charge state
  // straight from Paystack; the caller still re-checks amount/currency before
  // crediting, exactly like the webhook path.
  async verify(reference: string): Promise<ChargeVerification> {
    try {
      const res = await this.fetchWithRetry(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.secret}` }
      });
      const json: any = await res.json().catch(() => ({}));
      if (!res.ok || !json?.status || !json?.data) {
        this.logger.error(`Paystack verify failed (${res.status}): ${json?.message ?? 'no body'}`);
        throw new BadGatewayException('Could not verify payment');
      }
      return {
        success: json.data.status === 'success',
        amountMinor: Number(json.data.amount ?? -1),
        currency: json.data.currency
      };
    } catch (err) {
      if (err instanceof BadGatewayException) throw err;
      this.logger.error(`Paystack verify error: ${err instanceof Error ? err.message : String(err)}`);
      throw new BadGatewayException('Payment provider unavailable');
    }
  }

  verifySignature(rawBody: Buffer | undefined, signature?: string): boolean {
    if (!this.secret || !rawBody || !signature) return false;
    const expected = crypto.createHmac('sha512', this.secret).update(rawBody).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    // length check first; timingSafeEqual throws on length mismatch.
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  parseWebhook(rawBody: Buffer): WebhookCharge | null {
    let event: any;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return null;
    }
    if (event?.event !== 'charge.success') return null;
    const reference = event.data?.reference;
    return {
      // Keep an absent reference falsy so handleWebhook's Missing-reference 400 fires.
      providerReference: reference ? String(reference) : '',
      amountMinor: Number(event.data?.amount ?? -1),
      currency: String(event.data?.currency ?? '').toUpperCase(),
      success: true
    };
  }
}
