import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import SiteLayout, { metadata } from '../app/site/layout';

describe('SiteLayout', () => {
  it('exposes creator-facing metadata, not the admin console title', () => {
    expect(String(metadata.title)).toContain('AfriStage');
    expect(String(metadata.title)).not.toBe('AfriStage Admin');
    expect(metadata.openGraph?.title).toBeTruthy();
    expect((metadata.twitter as { card?: string })?.card).toBe('summary_large_image');
  });

  it('renders its children unwrapped', () => {
    const { getByText } = render(<SiteLayout>{<span>marketing</span>}</SiteLayout>);
    expect(getByText('marketing')).toBeInTheDocument();
  });
});
