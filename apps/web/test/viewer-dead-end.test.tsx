import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// "Watch live now" is the home page's only call to action. With nothing live it
// dropped the visitor on a black screen holding one sentence — no header, no
// way back, nothing to do next. Found by looking at the deployed page, not by a
// failing test: every suite here drove the path where a stage IS live.
const livekit = vi.hoisted(() => ({
  handlers: new Map<string, (track: { kind: string; attach: () => void }) => void>(),
  emitVideoDuringConnect: false,
  connectCalls: 0
}));

vi.mock('livekit-client', () => ({
  Room: class {
    on(event: string, handler: (track: { kind: string; attach: () => void }) => void) {
      livekit.handlers.set(event, handler);
      return this;
    }
    connect() {
      livekit.connectCalls += 1;
      if (livekit.emitVideoDuringConnect) {
        livekit.handlers.get('trackSubscribed')?.({ kind: 'video', attach: () => {} });
      }
      return Promise.resolve();
    }
    disconnect() {}
  },
  RoomEvent: { TrackSubscribed: 'trackSubscribed', Disconnected: 'disconnected' }
}));

const resolveLiveRoomId = vi.fn();
const fetchGuestToken = vi.fn();
vi.mock('../lib/live', () => ({
  apiBase: () => 'http://api.test',
  resolveLiveRoomId: (...args: unknown[]) => resolveLiveRoomId(...args),
  fetchGuestToken: (...args: unknown[]) => fetchGuestToken(...args),
  fetchRoom: () => Promise.resolve(null)
}));

const fetchSocketToken = vi.fn(() => Promise.resolve<string | null>(null));
vi.mock('../lib/socket', () => ({ fetchSocketToken: () => fetchSocketToken() }));

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
  beforeEach(() => {
    livekit.handlers.clear();
    livekit.emitVideoDuringConnect = false;
    livekit.connectCalls = 0;
    resolveLiveRoomId.mockReset();
    fetchGuestToken.mockReset();
    fetchGuestToken.mockResolvedValue(null);
    fetchSocketToken.mockReset();
    fetchSocketToken.mockResolvedValue(null);
  });

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

  it('does not tell a signed-in viewer to create an account', async () => {
    resolveLiveRoomId.mockResolvedValue(null);
    fetchSocketToken.mockResolvedValueOnce('token');
    render(<Viewer />);

    await waitFor(() => expect(screen.getByRole('link', { name: 'Buy coins' })).toHaveAttribute('href', '/buy'));
    expect(screen.queryByRole('link', { name: 'Create an account' })).not.toBeInTheDocument();
  });

  it('does not restore the waiting overlay when video arrives during connect', async () => {
    resolveLiveRoomId.mockResolvedValue('room-1');
    fetchGuestToken.mockResolvedValue({
      livekitUrl: 'wss://livekit.test',
      viewerToken: 'viewer-token'
    });
    livekit.emitVideoDuringConnect = true;

    render(<Viewer room="room-1" />);

    await waitFor(() => expect(livekit.connectCalls).toBe(1));
    expect(screen.queryByText('Waiting for the stage…')).not.toBeInTheDocument();
    expect(screen.queryByText('Finding a live stage…')).not.toBeInTheDocument();
  });
});
