import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api', () => ({ adminGet: vi.fn(), adminPost: vi.fn(), adminPatch: vi.fn(), adminLogout: vi.fn() }));
import { adminGet } from '../lib/api';
import FraudPage from '../app/fraud/page';

afterEach(() => vi.clearAllMocks());

describe('FraudPage', () => {
  it('renders error when creators fetch rejects', async () => {
    vi.mocked(adminGet).mockRejectedValue(new Error('creators-boom'));
    render(<FraudPage />);
    expect(await screen.findByText('creators-boom')).toBeInTheDocument();
  });

  it('lists creators and assesses risk (NONE branch -> banner-ok)', async () => {
    vi.mocked(adminGet).mockImplementation((path: string) => {
      if (path === '/admin/creators') return Promise.resolve([{ userId: 'creator-12345678abc', stageName: 'Nova' }]) as any;
      return Promise.resolve({
        userId: 'creator-12345678abc',
        riskScore: 0.12,
        recommendedAction: 'NONE',
        signals: [{ key: 'sig1', triggered: true, weight: 0.5, detail: 'flagged' }, { key: 'sig2', triggered: false, weight: 0.1, detail: 'fine' }]
      }) as any;
    });
    render(<FraudPage />);
    await screen.findByText(/Nova/);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'creator-12345678abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Assess risk' }));
    expect(await screen.findByText('0.12')).toBeInTheDocument();
    const banner = document.querySelector('.banner-ok');
    expect(banner).toBeInTheDocument();
    expect(screen.getAllByText('Triggered').length).toBeGreaterThan(0);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0); // not triggered
  });

  it('non-NONE action -> banner-warn', async () => {
    vi.mocked(adminGet).mockImplementation((path: string) => {
      if (path === '/admin/creators') return Promise.resolve([{ userId: 'c2', stageName: 'Risky' }]) as any;
      return Promise.resolve({ userId: 'c2', riskScore: 0.9, recommendedAction: 'PAYOUT_HOLD', signals: [] }) as any;
    });
    render(<FraudPage />);
    await screen.findByText(/Risky/);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'c2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Assess risk' }));
    await screen.findByText('0.90');
    expect(document.querySelector('.banner-warn')).toBeInTheDocument();
  });

  it('assess() early-returns when nothing selected (submit with empty value)', async () => {
    vi.mocked(adminGet).mockResolvedValue([{ userId: 'c3', stageName: 'X' }]);
    const { container } = render(<FraudPage />);
    await screen.findByText(/X /);
    const form = container.querySelector('form.toolbar') as HTMLFormElement;
    fireEvent.submit(form); // selected === '' -> assess returns early
    // assessment stays null
    expect(screen.queryByText(/Risk score/)).not.toBeInTheDocument();
    // adminGet only called once (creators)
    expect(vi.mocked(adminGet)).toHaveBeenCalledTimes(1);
  });

  it('shows error and resets loading when assess rejects', async () => {
    vi.mocked(adminGet).mockImplementation((path: string) => {
      if (path === '/admin/creators') return Promise.resolve([{ userId: 'c4', stageName: 'Y' }]) as any;
      return Promise.reject(new Error('assess-boom'));
    });
    render(<FraudPage />);
    await screen.findByText(/Y /);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'c4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Assess risk' }));
    expect(await screen.findByText('assess-boom')).toBeInTheDocument();
  });

  it('shows "Assessing…" loading label while in flight', async () => {
    let resolveAssess: (v: unknown) => void = () => {};
    vi.mocked(adminGet).mockImplementation((path: string) => {
      if (path === '/admin/creators') return Promise.resolve([{ userId: 'c5', stageName: 'Z' }]) as any;
      return new Promise((r) => { resolveAssess = r; });
    });
    render(<FraudPage />);
    await screen.findByText(/Z /);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'c5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Assess risk' }));
    expect(await screen.findByRole('button', { name: 'Assessing…' })).toBeInTheDocument();
    resolveAssess({ userId: 'c5', riskScore: 0.1, recommendedAction: 'NONE', signals: [] });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Assess risk' })).toBeInTheDocument());
  });
});
