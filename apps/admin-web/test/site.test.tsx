import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AfriStageSitePage from '../app/site/page';

// next/image needs the app router context in unit tests — plain img is enough here.
vi.mock('next/image', () => ({
  default: (props: any) => {
    const { src, alt, fill, priority, ...rest } = props;
    return <img src={typeof src === 'string' ? src : src?.src} alt={alt} {...rest} />;
  }
}));

describe('public marketing page (/site)', () => {
  it('renders hero, features, proof, and login CTAs', () => {
    render(<AfriStageSitePage />);
    expect(screen.getAllByText(/AfriStage/i).length).toBeGreaterThan(0);
    // one card per feature entry
    // 'Creator economy' also appears in the nav — assert presence, not uniqueness
    for (const kicker of ['Live rooms', 'Creator economy', 'Trust operations', 'Creator control']) {
      expect(screen.getAllByText(kicker).length).toBeGreaterThan(0);
    }
    for (const alt of [
      /singer performing for a live camera/i,
      /music creator reviewing earnings/i,
      /live-event operator monitoring a broadcast/i,
      /musician preparing a camera/i,
      /three creators preparing a closed beta stream/i,
      /creator reviewing her phone backstage/i,
      /two live-platform operators coordinating a broadcast/i
    ]) {
      expect(screen.getByRole('img', { name: alt })).toBeInTheDocument();
    }
    // proof strip
    expect(screen.getByText('60/40')).toBeInTheDocument();
    // marketing CTAs reach the consumer web app, never the staff admin login
    expect(document.querySelectorAll('a[href="/login"]').length).toBe(0);
    expect(document.querySelectorAll('a[href$="/watch"]').length).toBeGreaterThan(0);
    const rail = document.querySelector('[class*="productFlipRail"]');
    expect(rail).toBeTruthy();
    expect(within(rail as HTMLElement).getAllByRole('button', { name: /^(0[1-5]) / })).toHaveLength(10);
    expect(within(rail as HTMLElement).getByRole('group', { name: 'Product screens' })).toBeInTheDocument();
  });

  it('step selector switches the active step on click', () => {
    render(<AfriStageSitePage />);
    const goLive = screen.getByRole('button', { name: /go live/i });
    fireEvent.click(goLive);
    expect(goLive.className).toContain('active');
  });

  it('product rail flips to the selected phone screen', () => {
    render(<AfriStageSitePage />);
    const rail = document.querySelector('[class*="productFlipRail"]') as HTMLElement;
    const wallet = within(within(rail).getByRole('group', { name: 'Product screens' })).getByRole('button', { name: /^05 Move the money$/i });
    fireEvent.click(wallet);
    expect(wallet).toHaveAttribute('aria-pressed', 'true');
    expect(within(rail).getAllByRole('button', { name: /^05 Move the money$/i }).every(button => button.getAttribute('aria-pressed') === 'true')).toBe(true);
  });
});
