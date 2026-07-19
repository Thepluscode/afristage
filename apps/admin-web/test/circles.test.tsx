import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api', () => ({ adminGet: vi.fn(), adminPost: vi.fn(), adminPatch: vi.fn(), adminLogout: vi.fn() }));

const nav = vi.hoisted(() => ({ search: '' }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(nav.search) }));

import { adminGet, adminPost } from '../lib/api';
import CirclesPage from '../app/circles/page';

afterEach(() => {
  vi.restoreAllMocks();
  nav.search = '';
});

const circle = (over: Partial<any> = {}) => ({
  id: 'c1',
  name: 'Lagos Comedy Circle',
  city: 'Lagos',
  createdAt: new Date('2026-07-01T00:00:00Z').toISOString(),
  _count: { members: 2 },
  ...over
});

describe('CirclesPage', () => {
  it('renders error state', async () => {
    vi.mocked(adminGet).mockRejectedValue(new Error('circles-boom'));
    render(<CirclesPage />);
    expect(await screen.findByText('circles-boom')).toBeInTheDocument();
  });

  it('empty -> empty state', async () => {
    vi.mocked(adminGet).mockResolvedValue([]);
    render(<CirclesPage />);
    expect(await screen.findByText(/No circles yet/)).toBeInTheDocument();
  });

  it('renders circles with city and member-count fallbacks', async () => {
    vi.mocked(adminGet).mockResolvedValue([circle(), circle({ id: 'c2', name: 'Bare Circle', city: null, _count: undefined })]);
    render(<CirclesPage />);
    expect(await screen.findByText('Lagos Comedy Circle')).toBeInTheDocument();
    expect(screen.getByText('Lagos')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Bare Circle')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument(); // null city
    expect(screen.getByText('0')).toBeInTheDocument(); // missing _count
  });

  it('highlights the row targeted by ?id=', async () => {
    nav.search = 'id=c2';
    vi.mocked(adminGet).mockResolvedValue([circle(), circle({ id: 'c2', name: 'Second' })]);
    const { container } = render(<CirclesPage />);
    await waitFor(() => expect(container.querySelector('#row-c2')).not.toBeNull());
    expect(container.querySelector('#row-c2')?.className).toContain('row-highlight');
  });

  it('assess runs the group scorer and renders the signal table (warn banner)', async () => {
    vi.mocked(adminGet).mockResolvedValue([circle()]);
    vi.mocked(adminPost).mockResolvedValue({
      userIds: ['u1', 'u2'],
      riskScore: 0.35,
      recommendedAction: 'MANUAL_REVIEW',
      signals: [
        { key: 'internalGifting', triggered: false, weight: 0.4, detail: '100% internal' },
        { key: 'groupSpike', triggered: true, weight: 0.35, detail: '7.0x baseline' }
      ]
    });
    render(<CirclesPage />);
    await screen.findByText('Lagos Comedy Circle');
    fireEvent.click(screen.getByRole('button', { name: 'Assess Fraud' }));
    await waitFor(() => expect(adminPost).toHaveBeenCalledWith('/admin/circles/c1/assess'));
    expect(await screen.findByText('MANUAL_REVIEW')).toBeInTheDocument();
    expect(screen.getAllByText('0.35').length).toBeGreaterThan(0); // risk score + groupSpike weight
    expect(screen.getByText('7.0x baseline')).toBeInTheDocument();
    expect(screen.getAllByText('Triggered').length).toBeGreaterThan(0); // triggered
    expect(screen.getByText('—')).toBeInTheDocument(); // untriggered marker (city is 'Lagos' here)
  });

  it('assess with NONE action uses the ok banner', async () => {
    vi.mocked(adminGet).mockResolvedValue([circle()]);
    vi.mocked(adminPost).mockResolvedValue({ userIds: ['u1'], riskScore: 0, recommendedAction: 'NONE', signals: [] });
    const { container } = render(<CirclesPage />);
    await screen.findByText('Lagos Comedy Circle');
    fireEvent.click(screen.getByRole('button', { name: 'Assess Fraud' }));
    await screen.findByText('NONE');
    expect(container.querySelector('.banner-ok')).not.toBeNull();
  });

  it('assess failure surfaces the API error', async () => {
    vi.mocked(adminGet).mockResolvedValue([circle()]);
    vi.mocked(adminPost).mockRejectedValue(new Error('Group must contain 2..200 users'));
    render(<CirclesPage />);
    await screen.findByText('Lagos Comedy Circle');
    fireEvent.click(screen.getByRole('button', { name: 'Assess Fraud' }));
    expect(await screen.findByText('Group must contain 2..200 users')).toBeInTheDocument();
  });
});
