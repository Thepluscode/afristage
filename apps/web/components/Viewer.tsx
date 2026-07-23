'use client';

import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, type RemoteTrack } from 'livekit-client';
import { apiBase, resolveLiveRoomId, fetchGuestToken } from '../lib/live';

// Thin integration shell: resolve a live room → fetch a guest token → connect and
// attach tracks. All decision logic lives in lib/live.ts (unit-tested); this wires
// it to the LiveKit SDK + DOM. Real playback is verified in a browser, not here.
export default function Viewer({ room }: { room?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<string>('Finding a live stage…');
  const [unmute, setUnmute] = useState<(() => void) | null>(null);

  useEffect(() => {
    let lkRoom: Room | null = null;
    let cancelled = false;

    (async () => {
      const base = apiBase();
      const roomId = await resolveLiveRoomId(base, room);
      if (cancelled) return;
      if (!roomId) return setStatus('No stages are live right now — check back soon.');

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
        setStatus('Could not join the stage.');
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
      {unmute ? (
        <button className="unmute" onClick={unmute} type="button">
          Tap for sound
        </button>
      ) : null}
    </div>
  );
}
