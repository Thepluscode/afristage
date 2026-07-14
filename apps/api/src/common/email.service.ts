import { Injectable, Logger } from '@nestjs/common';

const RESEND_BASE = 'https://api.resend.com';
const SEND_TIMEOUT_MS = 10_000;

// Transactional email through Resend's REST API (raw fetch — no SDK dep).
// OPTIONAL dependency: ships dark until RESEND_API_KEY is set (same pattern as
// the payment providers' isConfigured). Every failure degrades to `false`,
// never an exception — email must never break the flow that wanted to send it.
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly apiKey = process.env.RESEND_API_KEY || '';
  private readonly from = process.env.EMAIL_FROM || 'AfriStage <no-reply@afristage.live>';

  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey !== 'replace_me';
  }

  // Best-effort send; returns whether the provider accepted it.
  async send(to: string, subject: string, text: string): Promise<boolean> {
    if (!this.isConfigured()) {
      this.logger.log(`email skipped (no provider configured): "${subject}" -> ${to}`);
      return false;
    }
    const ctrl = new AbortController();
    // Defensive per-send timeout guard; only fires on a real ~10s stall.
    const timer = setTimeout(/* istanbul ignore next */ () => ctrl.abort(), SEND_TIMEOUT_MS);
    try {
      const res = await fetch(`${RESEND_BASE}/emails`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: this.from, to, subject, text }),
        signal: ctrl.signal
      });
      if (!res.ok) {
        this.logger.warn(`email send failed (${res.status}): "${subject}" -> ${to}`);
        return false;
      }
      this.logger.log(`email sent: "${subject}" -> ${to}`);
      return true;
    } catch (err) {
      this.logger.warn(`email send errored: "${subject}" -> ${to}: ${(err as Error).message}`);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
