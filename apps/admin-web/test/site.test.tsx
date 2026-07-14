import { fireEvent, render, screen } from '@testing-library/react';
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
    // proof strip
    expect(screen.getByText('60/40')).toBeInTheDocument();
    // operator login CTAs point at the real login route
    const loginLinks = document.querySelectorAll('a[href="/login"]');
    expect(loginLinks.length).toBeGreaterThan(0);
  });

  it('step selector switches the active step on click', () => {
    render(<AfriStageSitePage />);
    const goLive = screen.getByRole('button', { name: /go live/i });
    fireEvent.click(goLive);
    expect(goLive.className).toContain('active');
  });
});
