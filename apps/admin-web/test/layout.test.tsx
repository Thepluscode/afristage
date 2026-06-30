import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../app/chrome', () => ({
  AdminChrome: ({ children }: { children: React.ReactNode }) => <div data-testid="chrome">{children}</div>
}));

import RootLayout, { metadata } from '../app/layout';

describe('RootLayout', () => {
  it('exposes admin metadata', () => {
    expect(metadata.title).toBe('AfriStage Admin');
  });

  it('wraps children in AdminChrome', () => {
    // jsdom already has html/body; render the tree and assert chrome wraps children
    const { getByTestId, getByText } = render(<RootLayout>{<span>hello</span>}</RootLayout>);
    expect(getByTestId('chrome')).toBeInTheDocument();
    expect(getByText('hello')).toBeInTheDocument();
  });
});
