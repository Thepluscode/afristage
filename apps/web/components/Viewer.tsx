'use client';

import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, type RemoteTrack } from 'livekit-client';
import { apiBase, resolveLiveRoomId, fetchGuestToken, fetchRoom, type RoomInfo } from '../lib/live';
import GiftDrawer from './GiftDrawer';
import StreamerHeader from './StreamerHeader';
import ChatFeed from './ChatFeed';
import GiftOverlay from './GiftOverlay';
import TopSupporters from './TopSupporters';
import HeartsOverlay from './HeartsOverlay';
import ChatBar from './ChatBar';
import { useRoomLive } from './useRoomLive';

// Thin integration shell: resolve a live room → fetch a guest token → connect and
// attach tracks. All decision logic lives in lib/live.ts (unit-tested); this wires
// it to the LiveKit SDK + DOM. Real playback is verified in a browser, not here.
export default function Viewer({ room }: { room?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<string>('Finding a live stage…');
  const [unmute, setUnmute] = useState<(() => void) | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [giftOpen, setGiftOpen] = useState(false);
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  // Live room layer — connects once roomId is known.
  const { viewerCount, messages, gifts, hearts, topGifters, canSend, sendChat, sendReaction } = useRoomLive(roomId);

  useEffect(() => {
    let lkRoom: Room | null = null;
    let cancelled = false;

    (async () => {
      try {
        // Browser calls stay same-origin so public discovery and guest-token
        // requests work even when the API's CORS allow-list is intentionally
        // limited to first-party domains.
        const base = typeof window === 'undefined' ? apiBase() : '/api/public-live';
        const resolved = await resolveLiveRoomId(base, room);
        if (cancelled) return;
        if (!resolved) return setStatus('No stages are live right now — check back soon.');
        setRoomId(resolved);
        const roomId = resolved;
        fetchRoom(base, roomId).then(setRoomInfo).catch(() => {});

        const token = await fetchGuestToken(base, roomId);
        if (cancelled) return;
        if (!token) return setStatus("That stage isn't live.");

        lkRoom = new Room();
        lkRoom.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
          if (track.kind === 'video' && videoRef.current) {
            track.attach(videoRef.current);
            setStatus('');
          }
          if (track.kind === 'audio') {
            // Browsers block autoplay-with-sound → attach muted, offer tap-to-unmute.
            const el = track.attach();
            el.muted = true;
            document.body.appendChild(el);
            setUnmute(() => () => {
              el.muted = false;
              if (videoRef.current) videoRef.current.muted = false;
              setUnmute(null);
            });
          }
        });
        lkRoom.on(RoomEvent.Disconnected, () => setStatus('The stage has ended.'));

        try {
          await lkRoom.connect(token.livekitUrl, token.viewerToken);
          setStatus((s) => s || 'Waiting for the stage…');
        } catch {
          if (!cancelled) setStatus('Could not join the stage.');
        }
      } catch {
        if (!cancelled) setStatus('Could not load the stage. Check your connection and retry.');
      }
    })();

    return () => {
      cancelled = true;
      lkRoom?.disconnect();
    };
  }, [room]);

  return (
    <div className="stage">
      <video ref={videoRef} playsInline autoPlay muted />
      {status ? <div className="status">{status}</div> : null}
      {/* "Watch live now" is the home page's only call to action, and with
          nothing live it landed the visitor on a black screen holding one
          sentence: no header, no way back, nothing to do next. Give the dead
          end a way out — but only once the outcome is known, so it does not
          flash under "Finding a live stage…". */}
      {!roomId && !status.endsWith('…') ? (
        <div className="dead-end">
          <a className="wordmark" href="/">
            AFRISTAGE
          </a>
          <p>Create an account and we can tell you when a stage opens.</p>
          <a className="cta" href="/register">
            Create an account
          </a>
          <a className="link" href="/">
            Back to home
          </a>
        </div>
      ) : null}
      {roomId ? <StreamerHeader room={roomInfo} liveCount={viewerCount} /> : null}
      {roomId ? <TopSupporters gifters={topGifters} /> : null}
      <HeartsOverlay hearts={hearts} />
      <GiftOverlay gifts={gifts} />
      <ChatFeed messages={messages} />
      {unmute ? (
        <button className="unmute" onClick={unmute} type="button">
          Tap for sound
        </button>
      ) : null}
      {roomId ? (
        <button className="gift-btn" onClick={() => setGiftOpen(true)} type="button">
          🎁
        </button>
      ) : null}
      {roomId ? <ChatBar canSend={canSend} onSend={sendChat} onHeart={sendReaction} /> : null}
      {roomId && giftOpen ? <GiftDrawer roomId={roomId} onClose={() => setGiftOpen(false)} /> : null}
    </div>
  );
}
