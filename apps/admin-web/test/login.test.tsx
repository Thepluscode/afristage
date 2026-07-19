import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from '../app/login/page';

beforeEach(() => {
  window.location.href = 'http://localhost/';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LoginPage', () => {
  it('redirects to / on a successful login', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    render(<LoginPage />);
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form')!);

    await waitFor(() => expect(window.location.href).toBe('/'));
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({ method: 'POST' }));
  });

  it('shows the server message when login fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Bad credentials' })
    }));

    render(<LoginPage />);
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form')!);

    expect(await screen.findByText('Bad credentials')).toBeInTheDocument();
    expect(window.location.href).toBe('http://localhost/');
  });

  it('falls back to "Login failed" when the error body cannot be parsed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => {
        throw new Error('not json');
      }
    }));

    render(<LoginPage />);
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form')!);

    expect(await screen.findByText('Login failed')).toBeInTheDocument();
  });

  it('shows the loading label while the request is pending', async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    const pending = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(pending));

    render(<LoginPage />);
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form')!);

    expect(await screen.findByText('Signing in…')).toBeInTheDocument();

    resolveFetch({ ok: true, json: async () => ({}) });
    await waitFor(() => expect(window.location.href).toBe('/'));
  });

  it('updates both inputs as the user types', () => {
    vi.stubGlobal('fetch', vi.fn());
    render(<LoginPage />);

    const identifier = screen.getByLabelText('Email or phone') as HTMLInputElement;
    const password = screen.getByLabelText('Password') as HTMLInputElement;

    fireEvent.change(identifier, { target: { value: 'me@example.com' } });
    fireEvent.change(password, { target: { value: 'secret' } });

    expect(identifier.value).toBe('me@example.com');
    expect(password.value).toBe('secret');
  });
});
