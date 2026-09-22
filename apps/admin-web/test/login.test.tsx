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

  it('returns to a safe ?next= path after login instead of the dashboard', async () => {
    (window.location as any).search = '?next=%2Fpayouts%3Fstatus%3DHELD';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    render(<LoginPage />);
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form')!);
    await waitFor(() => expect(window.location.href).toBe('/payouts?status=HELD'));
  });

  it('ignores an unsafe ?next= (open redirect) and falls back to /', async () => {
    (window.location as any).search = '?next=https%3A%2F%2Fevil.com';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    render(<LoginPage />);
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form')!);
    await waitFor(() => expect(window.location.href).toBe('/'));
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

describe('MFA on the admin login form', () => {
  // The founder enrolled MFA and was locked out of the console: the API throws
  // "MFA token required" when mfaEnabled, and this form had no field for it.
  // Doing the recommended security thing removed their own access.
  it('sends mfaToken when a code is entered', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, role: 'ADMIN' }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/email or phone/i), { target: { value: 'a@b.c' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pw' } });
    fireEvent.change(screen.getByLabelText(/authentication code/i), { target: { value: ' 123456 ' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ identifier: 'a@b.c', password: 'pw', mfaToken: '123456' });
  });

  it('omits mfaToken entirely when left blank — an empty string reads as a WRONG code', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, role: 'ADMIN' }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/email or phone/i), { target: { value: 'a@b.c' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ identifier: 'a@b.c', password: 'pw' });
  });

  it('shows the field without being asked, so it never confirms a correct password', () => {
    render(<LoginPage />);
    expect(screen.getByLabelText(/authentication code/i)).toBeInTheDocument();
  });
});
