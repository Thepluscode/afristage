import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import WatchError from '../app/error';
import NotFound from '../app/not-found';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('WatchError (viewer-facing boundary)', () => {
  it('reassures the viewer without leaking internals', () => {
    const reset = vi.fn();
    render(<WatchError error={Object.assign(new Error('kaboom at line 42'), { digest: 'ref-9' })} reset={reset} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('This page hit a snag')).toBeInTheDocument();
    // money reassurance matters most on a paid surface
    expect(screen.getByText(/coins are safe/)).toBeInTheDocument();
    // the raw error never reaches a public page
    expect(screen.queryByText(/kaboom/)).not.toBeInTheDocument();
    expect(screen.getByText('ref-9')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Back to live' })).toHaveAttribute('href', '/');
  });

  it('omits the reference without a digest and still logs the error', () => {
    const err = new Error('kaboom');
    render(<WatchError error={err} reset={() => {}} />);
    expect(screen.queryByText(/Reference:/)).not.toBeInTheDocument();
    expect(console.error).toHaveBeenCalledWith('Web route error', err);
  });
});

describe('NotFound', () => {
  it('explains an ended stage and links back', () => {
    render(<NotFound />);
    expect(screen.getByText('That page is not here')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to live' })).toHaveAttribute('href', '/');
  });
});
