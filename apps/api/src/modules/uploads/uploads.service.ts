import { BadRequestException, Injectable } from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as crypto from 'crypto';
import { ALLOWED_CONTENT_TYPES, PresignUploadDto } from './dto/presign-upload.dto';

const URL_TTL_SECONDS = 60; // presigned PUT is short-lived; the client uploads immediately
const FOLDER: Record<PresignUploadDto['kind'], string> = {
  avatar: 'avatars',
  gift_animation: 'gift-animations'
};

// Direct-to-bucket uploads: the API only signs a short-lived PUT URL and returns
// the public (CDN) URL to store. The file never passes through the API or the DB —
// the DB keeps a URL string, object storage keeps the bytes, the CDN serves them.
@Injectable()
export class UploadsService {
  private readonly bucket = process.env.S3_BUCKET || '';
  private readonly cdnBase =
    process.env.CDN_BASE_URL ||
    (process.env.S3_PUBLIC_URL && this.bucket ? `${process.env.S3_PUBLIC_URL}/${this.bucket}` : '');

  private client(): S3Client {
    return new S3Client({
      region: process.env.S3_REGION || 'us-east-1',
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true', // MinIO/R2 path-style
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || ''
      }
    });
  }

  isConfigured(): boolean {
    return !!this.bucket && !!process.env.S3_ACCESS_KEY_ID && !!this.cdnBase;
  }

  async presign(userId: string, dto: PresignUploadDto) {
    if (!this.isConfigured()) throw new BadRequestException('Uploads are not configured');
    const ext = ALLOWED_CONTENT_TYPES[dto.contentType];
    if (!ext) throw new BadRequestException('Unsupported file type'); // belt-and-braces vs the DTO allowlist

    // userId-namespaced + random key: a client can't overwrite another user's object,
    // and can't pick its own path.
    const key = `${FOLDER[dto.kind]}/${userId}/${crypto.randomUUID()}.${ext}`;

    const uploadUrl = await getSignedUrl(
      this.client(),
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: dto.contentType }),
      { expiresIn: URL_TTL_SECONDS }
    );

    // fileUrl is what callers persist in avatarUrl / animationUrl — served via the CDN.
    // ponytail: max upload size is enforced at the bucket/CDN policy, not here (a
    // presigned PUT can't bound body size; switch to a presigned POST policy if needed).
    return { key, uploadUrl, fileUrl: `${this.cdnBase}/${key}`, contentType: dto.contentType, expiresIn: URL_TTL_SECONDS };
  }
}
