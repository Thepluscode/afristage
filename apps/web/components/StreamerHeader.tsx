'use client';

import type { RoomInfo } from '../lib/live';

// Top overlay: who's on stage + that it's live + how many are watching. The count
// prefers the live socket value, falling back to the room's REST snapshot.
export default function StreamerHeader({ room, liveCount }: { room: RoomInfo | null; liveCount: number | null }) {
  const name = room?.host?.profile?.displayName || room?.title || 'AfriStage';
  const avatar = room?.host?.profile?.avatarUrl || null;
  const count = liveCount ?? room?.viewerCount ?? 0;
  const initial = name.slice(0, 1).toUpperCase();

  return (
    <div className="sh">
      <div className="sh-id">
        <div className="sh-avatar" aria-hidden="true">
          {avatar ? <img src={avatar} alt="" /> : <span>{initial}</span>}
        </div>
        <div className="sh-meta">
          <strong>{name}</strong>
          <span className="sh-live">● LIVE</span>
        </div>
      </div>
      <div className="sh-count" aria-label={`${count} watching`}>
        👁 {count.toLocaleString()}
      </div>
    </div>
  );
}
