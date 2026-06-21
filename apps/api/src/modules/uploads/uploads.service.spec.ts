import { BadRequestException } from '@nestjs/common';

// Mock the presigner so no network/credentials are needed — we assert how the
// service constructs the key + URLs, not AWS's signing.
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://bucket.example/signed-put-url')
}));

import { UploadsService } from './uploads.service';

const ENV = { ...process.env };
function configure(on = true) {
  if (on) {
    process.env.S3_BUCKET = 'afristage-media';
    process.env.S3_ACCESS_KEY_ID = 'key';
    process.env.S3_SECRET_ACCESS_KEY = 'secret';
    process.env.CDN_BASE_URL = 'https://cdn.afristage.live/afristage-media';
  } else {
    delete process.env.S3_BUCKET;
    delete process.env.S3_ACCESS_KEY_ID;
    delete process.env.CDN_BASE_URL;
  }
  return new UploadsService(); // cdnBase/bucket read at construction
}

afterEach(() => {
  process.env = { ...ENV };
});

describe('UploadsService.presign', () => {
  it('rejects when storage is not configured', async () => {
    const svc = configure(false);
    await expect(svc.presign('u1', { contentType: 'image/png', kind: 'avatar' })).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('returns a presigned PUT URL + a public CDN URL, never the file itself', async () => {
    const svc = configure();
    const res = await svc.presign('user-123', { contentType: 'image/png', kind: 'avatar' });
    expect(res.uploadUrl).toBe('https://bucket.example/signed-put-url');
    expect(res.fileUrl).toBe(`https://cdn.afristage.live/afristage-media/${res.key}`);
    expect(res.expiresIn).toBe(60);
  });

  it('namespaces the key by user + kind folder, with the right extension', async () => {
    const svc = configure();
    const res = await svc.presign('user-123', { contentType: 'image/webp', kind: 'gift_animation' });
    expect(res.key).toMatch(/^gift-animations\/user-123\/[0-9a-f-]+\.webp$/);
  });

  it('avatar uploads land in the avatars/ folder', async () => {
    const svc = configure();
    const res = await svc.presign('u9', { contentType: 'image/jpeg', kind: 'avatar' });
    expect(res.key).toMatch(/^avatars\/u9\/[0-9a-f-]+\.jpg$/);
  });

  it('rejects an unsupported content type at the service layer too', async () => {
    const svc = configure();
    await expect(svc.presign('u1', { contentType: 'application/pdf', kind: 'avatar' } as any)).rejects.toBeInstanceOf(
      BadRequestException
    );
  });
});
