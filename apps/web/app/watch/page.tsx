import Viewer from '../../components/Viewer';

// /watch → the first live stage; /watch?room=<id> → a specific room. The Viewer
// (client) resolves the room and fetches a public guest token — no sign-in.
export default function WatchPage({ searchParams }: { searchParams: { room?: string } }) {
  return <Viewer room={searchParams.room} />;
}
