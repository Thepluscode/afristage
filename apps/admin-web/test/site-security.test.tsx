import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SecurityPage from '../app/site/security/page';

describe('public security page (/site/security)', () => {
  it('states every claimed control', () => {
    render(<SecurityPage />);
    for (const t of [
      /Encryption in transit and at rest/i,
      /never touch your card number/i,
      /Account protection/i,
      /Money you can audit/i,
      /Continuous scanning/i,
      /Incident response/i
    ]) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
  });

  it('exposes a working vulnerability-disclosure channel', () => {
    render(<SecurityPage />);
    const mail = document.querySelector('a[href="mailto:security@afristage.live"]');
    expect(mail).not.toBeNull();
    const txt = document.querySelector('a[href="/.well-known/security.txt"]');
    expect(txt).not.toBeNull();
  });

  it('links back to the marketing site', () => {
    render(<SecurityPage />);
    expect(document.querySelectorAll('a[href="/site"]').length).toBeGreaterThan(0);
  });
});
