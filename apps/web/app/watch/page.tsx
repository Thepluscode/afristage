import Viewer from '../../components/Viewer';

// /watch → the first live stage; /watch?room=<id> → a specific room. The Viewer
// (client) resolves the room and fetches a public guest token — no sign-in.
export default async function WatchPage({ searchParams }: { searchParams: Promise<{ room?: string }> }) {
  return <Viewer room={(await searchParams).room} />;
}
