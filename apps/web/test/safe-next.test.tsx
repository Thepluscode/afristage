import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import LoginPage from '../app/login/page';
import RegisterPage from '../app/register/page';
import { safeNext } from '../lib/safe-next';

describe('safeNext', () => {
  it('falls back to the wallet when absent', () => {
    expect(safeNext(null)).toBe('/wallet');
    expect(safeNext(undefined)).toBe('/wallet');
    expect(safeNext('')).toBe('/wallet');
  });

  it('keeps a same-origin path and its query', () => {
    expect(safeNext('/buy')).toBe('/buy');
    expect(safeNext('/watch?room=abc')).toBe('/watch?room=abc');
  });

  it('rejects script, absolute and protocol-relative targets', () => {
    for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' /x', 'https://evil.com', '//evil.com', '/\\evil.com', 'evil', 'data:text/html,x']) {
      expect(safeNext(bad)).toBe('/wallet');
    }
  });

  it('does not loop back into the auth pages', () => {
    for (const loop of ['/login', '/login?next=/x', '/register', '/register#x']) expect(safeNext(loop)).toBe('/wallet');
    expect(safeNext('/login-help')).toBe('/login-help');
  });
});

// The live defect: /register?next=javascript:… ran attacker script on our
// origin the moment the account was created, with the new session attached.
describe('post-auth redirect', () => {
  const assign = vi.fn();
  afterEach(() => {
    vi.unstubAllGlobals();
    assign.mockReset();
  });

  function stub() {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    vi.stubGlobal('location', { ...window.location, assign });
  }

  it('login never navigates to a javascript: next', async () => {
    stub();
    render(<LoginPage searchParams={{ next: 'javascript:alert(document.domain)' }} />);
    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: 'a' } });
    fireEvent.change(screen.getByPlaceholderText(/password/i), { target: { value: 'b' } });
    fireEvent.submit(screen.getByRole('button', { name: /sign in/i }).closest('form')!);
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/wallet'));
  });

  it('register never navigates to a javascript: next', async () => {
    stub();
    render(<RegisterPage searchParams={{ next: 'javascript:alert(document.domain)' }} />);
    fireEvent.submit(screen.getByRole('button', { name: /create account/i }).closest('form')!);
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/wallet'));
  });
});
