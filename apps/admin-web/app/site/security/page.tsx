import Link from 'next/link';
import { ShieldCheck, Lock, Radar, KeyRound, AlertTriangle, FileCheck2, ArrowLeft } from 'lucide-react';
import styles from './security.module.css';

// Public security posture page (/site/security). Middleware-exempt via the
// /site/ prefix. Every claim here maps to a control that actually exists in the
// codebase — nothing aspirational. See docs/security-posture.md for the audit
// trail behind each statement.

export const metadata = {
  title: 'Security — AfriStage',
  description: 'How AfriStage protects your data, your money, and your account.'
};

type Control = { icon: typeof Lock; title: string; body: string };

const controls: Control[] = [
  {
    icon: Lock,
    title: 'Encryption in transit and at rest',
    body: 'All traffic is HTTPS/TLS end to end; live video runs over encrypted WebRTC. Databases and caches are managed services encrypted at rest by default.'
  },
  {
    icon: KeyRound,
    title: 'We never touch your card number',
    body: 'Card payments are handled entirely by Paystack and Stripe. AfriStage never sees, stores, or transmits a card number — keeping card data out of our systems by design.'
  },
  {
    icon: ShieldCheck,
    title: 'Account protection',
    body: 'Passwords are hashed with bcrypt (cost 12). Sessions use short-lived access tokens with rotating refresh tokens, optional two-factor authentication, per-device session control, and brute-force rate limiting.'
  },
  {
    icon: FileCheck2,
    title: 'Money you can audit',
    body: 'Every coin movement is a balanced double-entry ledger transaction. An automated integrity check reconciles the ledger continuously and blocks payouts if anything is ever out of balance.'
  },
  {
    icon: Radar,
    title: 'Continuous scanning',
    body: 'Secrets are blocked at commit time, dependencies are audited for known advisories, and every release is scanned at the HTTP layer (OWASP ZAP). Findings are triaged for real exploitability, not just version numbers.'
  },
  {
    icon: AlertTriangle,
    title: 'Incident response',
    body: 'We maintain documented incident playbooks for authentication, payments, payouts, ledger integrity, and abuse — with named owners and a rollback path that restores a known-good state in minutes.'
  }
];

export default function SecurityPage() {
  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <Link className={styles.back} href="/site">
          <ArrowLeft size={16} /> AfriStage
        </Link>

        <header className={styles.head}>
          <p className={styles.eyebrow}>Trust &amp; security</p>
          <h1>Security is why creators hand us their payouts.</h1>
          <p className={styles.lede}>
            AfriStage moves real money for African creators. Here is exactly how we protect your
            data, your account, and your earnings — with controls that live in the product, not on
            a slide.
          </p>
        </header>

        <section className={styles.grid} aria-label="Security controls">
          {controls.map(({ icon: Icon, title, body }) => (
            <article key={title} className={styles.card}>
              <span className={styles.badge}>
                <Icon size={20} />
              </span>
              <h2>{title}</h2>
              <p>{body}</p>
            </article>
          ))}
        </section>

        <section className={styles.disclose} aria-label="Report a vulnerability">
          <h2>Found a vulnerability?</h2>
          <p>
            We welcome responsible disclosure. Email{' '}
            <a href="mailto:security@afristage.live">security@afristage.live</a> with steps to
            reproduce. We acknowledge reports within three business days and will not pursue
            good-faith researchers who follow this policy. Machine-readable details live at{' '}
            <a href="/.well-known/security.txt">/.well-known/security.txt</a>.
          </p>
        </section>

        <footer className={styles.foot}>
          <span>© 2026 AfriStage — every coin on the ledger.</span>
          <Link href="/site">Back to AfriStage</Link>
        </footer>
      </div>
    </main>
  );
}
