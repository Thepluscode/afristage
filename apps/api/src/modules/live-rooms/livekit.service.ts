import { Injectable } from '@nestjs/common';
import { AccessToken } from 'livekit-server-sdk';

@Injectable()
export class LiveKitService {
  async createToken(input: { roomName: string; identity: string; canPublish: boolean }) {
    const apiKey = process.env.LIVEKIT_API_KEY || 'devkey';
    const apiSecret = process.env.LIVEKIT_API_SECRET || 'secret';

    const token = new AccessToken(apiKey, apiSecret, { identity: input.identity });
    token.addGrant({ roomJoin: true, room: input.roomName, canPublish: input.canPublish, canSubscribe: true });
    return token.toJwt();
  }

  // The ws(s):// URL the Flutter client dials. Returned in token responses so the
  // app never hardcodes it. Default is the local docker LiveKit; override per env.
  url(): string {
    return process.env.LIVEKIT_URL || 'ws://localhost:7880';
  }
}
