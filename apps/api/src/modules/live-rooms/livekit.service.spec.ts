import { LiveKitService } from './livekit.service';

describe('LiveKitService.url', () => {
  const original = process.env.LIVEKIT_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.LIVEKIT_URL;
    else process.env.LIVEKIT_URL = original;
  });

  it('falls back to the local docker LiveKit ws URL', () => {
    delete process.env.LIVEKIT_URL;
    expect(new LiveKitService().url()).toBe('ws://localhost:7880');
  });

  it('honours the LIVEKIT_URL override', () => {
    process.env.LIVEKIT_URL = 'wss://live.afristage.live';
    expect(new LiveKitService().url()).toBe('wss://live.afristage.live');
  });

  it('issues a JWT string for a participant', async () => {
    const token = await new LiveKitService().createToken({ roomName: 'r1', identity: 'u1', canPublish: true });
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3); // header.payload.signature
  });
});
