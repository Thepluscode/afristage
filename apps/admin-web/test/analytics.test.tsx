import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api', () => ({ adminGet: vi.fn(), adminPost: vi.fn(), adminPatch: vi.fn(), adminLogout: vi.fn() }));
import { adminGet } from '../lib/api';
import AnalyticsPage from '../app/analytics/page';

afterEach(() => vi.clearAllMocks());

describe('AnalyticsPage', () => {
  it('renders placeholder dashes while data is null (and no series section)', () => {
    vi.mocked(adminGet).mockReturnValue(new Promise(() => {}));
    render(<AnalyticsPage />);
    // five metric cards all show '—'
    expect(screen.getAllByText('—').length).toBe(5);
    expect(screen.queryByText('Trends (30 days)')).not.toBeInTheDocument();
  });

  it('renders error state when overview rejects', async () => {
    vi.mocked(adminGet).mockImplementation((path: string) =>
      path.includes('overview') ? Promise.reject(new Error('overview-boom')) : Promise.resolve([]) as any
    );
    render(<AnalyticsPage />);
    expect(await screen.findByText('overview-boom')).toBeInTheDocument();
  });

  it('series failure is logged (warn) and does not error the page', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(adminGet).mockImplementation((path: string) =>
      path.includes('overview')
        ? Promise.resolve({ users: 1, creators: 2, rooms: 3, giftTransactions: 4, giftVolumeCoins: 500 }) as any
        : Promise.reject(new Error('series-boom'))
    );
    render(<AnalyticsPage />);
    expect(await screen.findByText('1')).toBeInTheDocument(); // users metric
    expect(screen.getByText('500')).toBeInTheDocument(); // giftVolumeCoins toLocaleString
    expect(screen.queryByText('Trends (30 days)')).not.toBeInTheDocument();
    expect(warn).toHaveBeenCalledWith('Analytics series widget failed to load', expect.any(Error));
    warn.mockRestore();
  });

  it('empty series array -> no Trends section', async () => {
    vi.mocked(adminGet).mockImplementation((path: string) =>
      path.includes('overview')
        ? Promise.resolve({ users: 0, creators: 0, rooms: 0, giftTransactions: 0, giftVolumeCoins: 0 }) as any
        : Promise.resolve([]) as any
    );
    render(<AnalyticsPage />);
    await screen.findByText('Gifts sent');
    expect(screen.queryByText('Trends (30 days)')).not.toBeInTheDocument();
  });

  it('populated series -> renders Trends and sparklines', async () => {
    vi.mocked(adminGet).mockImplementation((path: string) =>
      path.includes('overview')
        ? Promise.resolve({ users: 10, creators: 5, rooms: 2, giftTransactions: 99, giftVolumeCoins: '12345' }) as any
        : Promise.resolve([
            { day: '2024-01-01', newUsers: 3, giftCount: 1, giftVolumeCoins: 100 },
            { day: '2024-01-02', newUsers: 7, giftCount: 4, giftVolumeCoins: 250 }
          ]) as any
    );
    const { container } = render(<AnalyticsPage />);
    expect(await screen.findByText('Trends (30 days)')).toBeInTheDocument();
    expect(screen.getByText('New users / day')).toBeInTheDocument();
    expect(screen.getByText('Gifts sent / day')).toBeInTheDocument();
    expect(screen.getByText('Gift volume (coins) / day')).toBeInTheDocument();
    expect(container.querySelectorAll('polyline').length).toBe(3);
    expect(screen.getByText('12,345')).toBeInTheDocument(); // string giftVolumeCoins -> Number -> toLocaleString
  });
});
