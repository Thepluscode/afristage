import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

const PAYSTACK_BASE = 'https://api.paystack.co';
const INIT_TIMEOUT_MS = 10_000;

export interface PaystackInit {
  authorizationUrl: string;
  reference: string;
}

export interface PaystackVerification {
  success: boolean;
  amountMinor: number;
  currency: string;
}

// Paystack signs each webhook with HMAC-SHA512 of the raw request body using the
// secret key, sent in the `x-paystack-signature` header. We MUST verify against
// the raw bytes (not re-serialized JSON) and never credit coins without a match.
@Injectable()
export class PaystackProvider {
  private readonly logger = new Logger(PaystackProvider.name);
  private readonly secret = process.env.PAYSTACK_SECRET_KEY || '';

  isConfigured(): boolean {
    return !!this.secret && this.secret !== 'replace_me';
  }

  // Server-side checkout initialization. We pass our own reference so it matches
  // the intent we record; Paystack echoes it back in the verified webhook. Money
  // is only credited by the webhook after amount/currency/signature checks — this
  // call just hands the client a hosted-checkout URL.
  async initializeTransaction(params: {
    email: string;
    amountMinor: number;
    currency: string;
    reference: string;
  }): Promise<PaystackInit> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), INIT_TIMEOUT_MS);
    try {
      const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: params.email,
          amount: params.amountMinor,
          currency: params.currency,
          reference: params.reference
        }),
        signal: ctrl.signal
      });
      const json: any = await res.json().catch(() => ({}));
      if (!res.ok || !json?.status || !json?.data?.authorization_url) {
        this.logger.error(`Paystack init failed (${res.status}): ${json?.message ?? 'no body'}`);
        throw new BadGatewayException('Payment provider rejected the request');
      }
      return { authorizationUrl: json.data.authorization_url, reference: json.data.reference ?? params.reference };
    } catch (err) {
      if (err instanceof BadGatewayException) throw err;
      this.logger.error(`Paystack init error: ${err instanceof Error ? err.message : String(err)}`);
      throw new BadGatewayException('Payment provider unavailable');
    } finally {
      clearTimeout(timer);
    }
  }

  // Pull-based confirmation — needed in dev (localhost can't receive webhooks) and
  // as a fallback if a webhook is delayed. Returns the authoritative charge state
  // straight from Paystack; the caller still re-checks amount/currency before
  // crediting, exactly like the webhook path.
  async verifyTransaction(reference: string): Promise<PaystackVerification> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), INIT_TIMEOUT_MS);
    try {
      const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.secret}` },
        signal: ctrl.signal
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
    } finally {
      clearTimeout(timer);
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
}
