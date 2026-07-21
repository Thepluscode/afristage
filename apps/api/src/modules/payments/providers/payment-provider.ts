// The port every card processor implements. payments.service talks only to this
// interface; concrete providers (Paystack for African corridors, Stripe for
// global cards) are selected by the coin package's currency. Adding a processor
// means implementing this port and registering it — the money-crediting path
// (verified amount/currency → coin catalog) never changes.

export interface CheckoutInit {
  checkoutUrl: string; // hosted checkout URL the client opens
  // The reference to persist on the PaymentIntent so the webhook + pull-verify
  // can find it. Paystack echoes our own reference; Stripe returns its session id.
  providerReference: string;
}

export interface ChargeVerification {
  success: boolean;
  amountMinor: number;
  currency: string; // normalized UPPERCASE (Stripe reports lowercase natively)
}

// What a provider extracts from its own webhook event shape, normalized so the
// service can validate + credit uniformly regardless of processor.
export interface WebhookCharge {
  kind: 'charge';
  providerReference: string; // matches PaymentIntent.providerReference
  amountMinor: number;
  currency: string; // UPPERCASE
  success: boolean;
}

// A dispute/chargeback opened against a prior charge. The provider is clawing the
// funds back; we mark the intent DISPUTED and post a CHARGEBACK ledger reversal.
export interface WebhookDispute {
  kind: 'dispute';
  providerReference: string; // matches PaymentIntent.providerReference
}

export type WebhookEvent = WebhookCharge | WebhookDispute;

export abstract class PaymentProvider {
  abstract readonly name: string; // 'PAYSTACK' | 'STRIPE'
  abstract isConfigured(): boolean;
  abstract initialize(params: { email: string; amountMinor: number; currency: string; reference: string }): Promise<CheckoutInit>;
  abstract verify(reference: string): Promise<ChargeVerification>;
  abstract verifySignature(rawBody: Buffer | undefined, signature?: string): boolean;
  // Parse a signature-verified raw webhook body into a normalized event — a
  // completed charge or a dispute — or null if it isn't one we act on.
  abstract parseWebhook(rawBody: Buffer): WebhookEvent | null;
}
