import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AdminError from '../app/error';
import GlobalError from '../app/global-error';
import NotFound from '../app/not-found';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('AdminError (route boundary)', () => {
  it('explains the failure and offers both recovery paths', () => {
    const reset = vi.fn();
    render(<AdminError error={Object.assign(new Error('boom'), { digest: 'abc123' })} reset={reset} />);

    // the operator is told what happened, not shown a stack trace
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Something broke on this screen')).toBeInTheDocument();
    expect(screen.queryByText(/boom/)).not.toBeInTheDocument();

    // the digest is the only handle tying this screen to the server logs
    expect(screen.getByText('abc123')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: /Back to Mission Control/ })).toHaveAttribute('href', '/');
  });

  it('logs the real error for the operator console', () => {
    const err = new Error('boom');
    render(<AdminError error={err} reset={() => {}} />);
    expect(console.error).toHaveBeenCalledWith('Admin route error', err);
  });

  it('omits the reference line when Next supplied no digest', () => {
    render(<AdminError error={new Error('boom')} reset={() => {}} />);
    expect(screen.queryByText(/Reference:/)).not.toBeInTheDocument();
  });
});

describe('GlobalError (root layout boundary)', () => {
  it('renders a self-contained shell that does not depend on app CSS', () => {
    const reset = vi.fn();
    render(<GlobalError error={Object.assign(new Error('boom'), { digest: 'zzz' })} reset={reset} />);

    expect(screen.getByText('AfriStage Admin could not start')).toBeInTheDocument();
    // reassures that this is not a data problem
    expect(screen.getByText(/not a problem with your account or your data/)).toBeInTheDocument();
    expect(screen.getByText('zzz')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('omits the reference line without a digest and logs the error', () => {
    const err = new Error('boom');
    render(<GlobalError error={err} reset={() => {}} />);
    expect(screen.queryByText(/Reference:/)).not.toBeInTheDocument();
    expect(console.error).toHaveBeenCalledWith('Admin root layout error', err);
  });
});

describe('NotFound', () => {
  it('explains the dead link and points back to the overview', () => {
    render(<NotFound />);
    expect(screen.getByText('That admin page does not exist')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to Mission Control/ })).toHaveAttribute('href', '/');
  });
});
