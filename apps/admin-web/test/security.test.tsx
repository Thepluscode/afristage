import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api', () => ({ adminGet: vi.fn(), adminPost: vi.fn(), adminPatch: vi.fn(), adminLogout: vi.fn() }));
import { adminPost } from '../lib/api';
import SecurityPage from '../app/security/page';

afterEach(() => vi.clearAllMocks());

describe('SecurityPage', () => {
  it('renders initial state with setup CTA', () => {
    render(<SecurityPage />);
    expect(screen.getByRole('button', { name: 'Set up two-factor auth' })).toBeInTheDocument();
  });

  it('startSetup success shows the secret and hides the CTA', async () => {
    vi.mocked(adminPost).mockResolvedValue({ secret: 'SECRET123', otpauthUrl: 'otpauth://x' });
    render(<SecurityPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Set up two-factor auth' }));
    expect(await screen.findByText('SECRET123')).toBeInTheDocument();
    // The raw otpauth URL is no longer printed: it was shown as text under the
    // instruction "scan the otpauth URL", which is not something a camera can do.
    // The QR below carries it; the secret above covers apps that cannot scan.
    expect(screen.queryByText('otpauth://x')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Set up two-factor auth' })).not.toBeInTheDocument();
  });

  it('startSetup shows busy label then error on rejection', async () => {
    let reject: (e: unknown) => void = () => {};
    vi.mocked(adminPost).mockReturnValue(new Promise((_r, rej) => { reject = rej; }));
    render(<SecurityPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Set up two-factor auth' }));
    expect(await screen.findByRole('button', { name: 'Starting…' })).toBeInTheDocument();
    reject(new Error('setup-failed'));
    expect(await screen.findByText('setup-failed')).toBeInTheDocument();
  });

  it('enable button disabled until code length >= 6, then enables MFA and shows recovery codes', async () => {
    vi.mocked(adminPost)
      .mockResolvedValueOnce({ secret: 'S', otpauthUrl: 'o' })
      .mockResolvedValueOnce({ mfaEnabled: true, recoveryCodes: ['code-a', 'code-b'] });
    render(<SecurityPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Set up two-factor auth' }));
    await screen.findByText('S');
    const enableBtn = screen.getByRole('button', { name: 'Enable MFA' });
    expect(enableBtn).toBeDisabled(); // empty code
    fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: ' 123456 ' } });
    expect(screen.getByRole('button', { name: 'Enable MFA' })).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Enable MFA' }));
    expect(await screen.findByText(/MFA enabled/)).toBeInTheDocument();
    expect(screen.getByText(/code-a\s+code-b/)).toBeInTheDocument();
    expect(adminPost).toHaveBeenNthCalledWith(2, '/auth/mfa/enable', { token: '123456' });
  });

  it('enable rejection shows error', async () => {
    vi.mocked(adminPost)
      .mockResolvedValueOnce({ secret: 'S', otpauthUrl: 'o' })
      .mockRejectedValueOnce(new Error('enable-failed'));
    render(<SecurityPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Set up two-factor auth' }));
    await screen.findByText('S');
    fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enable MFA' }));
    expect(await screen.findByText('enable-failed')).toBeInTheDocument();
  });

  it('enable shows busy "Enabling…" label while in flight', async () => {
    let resolveEnable: (v: unknown) => void = () => {};
    vi.mocked(adminPost)
      .mockResolvedValueOnce({ secret: 'S', otpauthUrl: 'o' })
      .mockReturnValueOnce(new Promise((r) => { resolveEnable = r; }));
    render(<SecurityPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Set up two-factor auth' }));
    await screen.findByText('S');
    fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enable MFA' }));
    expect(await screen.findByRole('button', { name: 'Enabling…' })).toBeInTheDocument();
    resolveEnable({ mfaEnabled: true, recoveryCodes: [] });
    await waitFor(() => expect(screen.getByText(/MFA enabled/)).toBeInTheDocument());
  });
});

describe('MFA setup shows a scannable QR', () => {
  const setup = { secret: 'JBSWY3DPEHPK3PXP', otpauthUrl: 'otpauth://totp/AfriStage:a@b.c?secret=JBSWY3DPEHPK3PXP&issuer=AfriStage' };

  // The page said "Scan the otpauth URL" and printed it as TEXT. You cannot
  // scan text, so every operator typed a 32-character secret by hand — and a
  // typo surfaces at step 2 as "invalid code", blaming the authenticator.
  it('renders a QR image generated from the otpauth URL', async () => {
    vi.mocked(adminPost).mockResolvedValue(setup as any);
    render(<SecurityPage />);
    fireEvent.click(screen.getByRole('button', { name: /set up two-factor/i }));
    const img = await screen.findByAltText(/QR code/i);
    expect(img.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
  });

  it('still shows the secret, so an app that cannot scan is not stuck', async () => {
    vi.mocked(adminPost).mockResolvedValue(setup as any);
    render(<SecurityPage />);
    fireEvent.click(screen.getByRole('button', { name: /set up two-factor/i }));
    expect(await screen.findByText(setup.secret)).toBeInTheDocument();
  });

  it('generates the QR locally — the URL contains the secret and must not leave the browser', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(adminPost).mockResolvedValue(setup as any);
    render(<SecurityPage />);
    fireEvent.click(screen.getByRole('button', { name: /set up two-factor/i }));
    await screen.findByAltText(/QR code/i);
    // No request anywhere: a third-party QR service would be handed a working second factor.
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
