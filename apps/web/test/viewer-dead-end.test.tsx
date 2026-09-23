import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// "Watch live now" is the home page's only call to action. With nothing live it
// dropped the visitor on a black screen holding one sentence — no header, no
// way back, nothing to do next. Found by looking at the deployed page, not by a
// failing test: every suite here drove the path where a stage IS live.
vi.mock('livekit-client', () => ({
  Room: class {
    on() {
      return this;
    }
    connect() {
      return Promise.resolve();
    }
    disconnect() {}
  },
  RoomEvent: { TrackSubscribed: 'trackSubscribed' }
}));

const resolveLiveRoomId = vi.fn();
vi.mock('../lib/live', () => ({
  apiBase: () => 'http://api.test',
  resolveLiveRoomId: (...args: unknown[]) => resolveLiveRoomId(...args),
  fetchGuestToken: () => Promise.resolve(null),
  fetchRoom: () => Promise.resolve(null)
}));

vi.mock('../components/useRoomLive', () => ({
  useRoomLive: () => ({
    viewerCount: 0,
    hearts: [],
    gifts: [],
    messages: [],
    topGifters: [],
    canSend: false,
    sendChat: () => {},
    sendReaction: () => {}
  })
}));

import Viewer from '../components/Viewer';

describe('Viewer when no stage is live', () => {
  it('offers a way out instead of a black dead end', async () => {
    resolveLiveRoomId.mockResolvedValue(null);
    render(<Viewer />);

    await waitFor(() =>
      expect(screen.getByText(/No stages are live right now/)).toBeInTheDocument()
    );

    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '/register'
    );
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'AFRISTAGE' })).toHaveAttribute('href', '/');
  });

  it('does not flash the escape hatch while still looking', () => {
    // A pending promise: the resolve step has not answered yet.
    resolveLiveRoomId.mockReturnValue(new Promise(() => {}));
    render(<Viewer />);

    expect(screen.getByText('Finding a live stage…')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Create an account' })).not.toBeInTheDocument();
  });
});
