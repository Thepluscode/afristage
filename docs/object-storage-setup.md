# Object storage (avatar & gift-animation uploads)

**Status on 2026-09-21: NOT configured in production.** No `S3_*` variable exists on
the Railway `api` service, so `POST /api/uploads/presign` returns
`400 Uploads are not configured` for every user. Avatar upload is dark. This document
is what it takes to turn it on and prove it works.

Local `docker compose` HAS working values (MinIO) — see `docker-compose.yml`. The
feature is not broken; it is unconfigured in one environment.

## How the upload path works

The file never passes through the API or the database. `UploadsService.presign`
signs a short-lived PUT straight to the bucket and returns the public URL to store:

```
client → POST /api/uploads/presign {contentType, kind}   (JWT required)
       ← {key, uploadUrl, fileUrl, contentType, expiresIn: 60}
client → PUT uploadUrl  (raw bytes, Content-Type must match)   [browser: CORS applies]
client → PATCH /users/me {avatarUrl: fileUrl}
```

Constraints the code already enforces, worth knowing before debugging:

- **Presigned PUT lives 60 seconds** (`URL_TTL_SECONDS`). A slow picker, a paused
  debugger or a retried upload can outlive it; the symptom is a 403 from the bucket.
- **Key is `<folder>/<userId>/<uuid>.<ext>`**, so one user cannot overwrite another's
  object and cannot choose its own path. Folders: `avatars`, `gift-animations`.
- **Content types are allowlisted** in `dto/presign-upload.dto.ts`: `image/jpeg`,
  `image/png`, `image/webp`, `image/gif`. **HEIC is not on the list** — an iPhone photo
  picked in its native format is rejected with `400 Unsupported file type`, which looks
  identical in a browser console to the not-configured 400. The client must convert or
  request JPEG.
- **No upload size limit is enforced by the API** — a presigned PUT cannot bound the
  body size. The bucket or CDN policy is the only place to cap it. Set one; otherwise a
  signed URL is an unbounded write for 60 seconds.
- Endpoint is throttled to 20 presigns/min/IP and requires a valid JWT.

## The variables

`isConfigured()` requires exactly three things to be truthy: `bucket`,
`S3_ACCESS_KEY_ID`, and `cdnBase`. Everything else has a default.

| Variable | Required | Notes |
|---|---|---|
| `S3_BUCKET` | **yes** | Bucket name. Part of `isConfigured()`. |
| `S3_ACCESS_KEY_ID` | **yes** | Part of `isConfigured()`. |
| `S3_SECRET_ACCESS_KEY` | **yes in practice** | Not checked by `isConfigured()`, but signing fails without it — the endpoint would answer 200 with a URL the bucket rejects. Set it. |
| `CDN_BASE_URL` | **yes**¹ | Public base for `fileUrl`. No trailing slash. |
| `S3_PUBLIC_URL` | alternative to ¹ | If `CDN_BASE_URL` is unset, `cdnBase` becomes `${S3_PUBLIC_URL}/${S3_BUCKET}`. Set one or the other. |
| `S3_ENDPOINT` | for non-AWS | R2/MinIO/B2 endpoint. Omit for real AWS S3. |
| `S3_REGION` | no | Defaults `us-east-1`. R2 uses `auto`. |
| `S3_FORCE_PATH_STYLE` | for R2/MinIO | String `"true"`, not a boolean. |

**`CDN_BASE_URL` must point at a PUBLICLY READABLE origin.** The presign call only
grants write. If the bucket is private and no public base is wired, every upload will
succeed and every avatar will 403 on display — a failure that appears long after the
upload "worked".

## Cloudflare R2 (recommended)

Zero egress fees, S3-compatible, and the path-style support this code already has.

1. Create a bucket, e.g. `afristage-media`.
2. **Settings → Public access → enable r2.dev**, or attach a custom domain. Copy that
   public URL — it becomes `CDN_BASE_URL`.
3. **R2 → Manage API Tokens → Create token**, Object Read & Write, scoped to that
   bucket. Copy the Access Key ID and Secret.
4. Set the variables on the Railway `api` service:

```bash
railway variables --service api \
  --set "S3_BUCKET=afristage-media" \
  --set "S3_ACCESS_KEY_ID=<key id>" \
  --set "S3_SECRET_ACCESS_KEY=<secret>" \
  --set "S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com" \
  --set "S3_REGION=auto" \
  --set "S3_FORCE_PATH_STYLE=true" \
  --set "CDN_BASE_URL=https://pub-<hash>.r2.dev"
```

Setting variables redeploys the service. Wait for it before verifying.

5. **Bucket CORS** — required for the browser PUT (the Flutter web client), not for
   native. Without it the PUT fails in the browser with no allow-origin header while
   `curl` succeeds, which reads as "works on my machine":

```json
[{ "AllowedOrigins": ["https://flutter-web-production-b292.up.railway.app"],
   "AllowedMethods": ["PUT", "GET"],
   "AllowedHeaders": ["content-type"],
   "MaxAgeSeconds": 3600 }]
```

## Verification — prove a real file round-trips

Config existing is not the same as uploads working. Run all four steps; step 4 is the
one that catches a private bucket.

```bash
API=https://api-production-e12f.up.railway.app

# 1. a real token (replace the values; the placeholder must NOT be sent literally —
#    a literal <token> returns 401 from the guard and proves nothing)
TOKEN=$(curl -s -X POST "$API/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"identifier":"you@example.com","password":"..."}' \
  | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')
[ -n "$TOKEN" ] || echo "LOGIN FAILED — stop here"

# 2. presign (expect 201 + uploadUrl/fileUrl, NOT "Uploads are not configured")
P=$(curl -s -X POST "$API/api/uploads/presign" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"contentType":"image/png","kind":"avatar"}')
echo "$P"
UP=$(echo "$P" | sed -n 's/.*"uploadUrl":"\([^"]*\)".*/\1/p')
FILE=$(echo "$P" | sed -n 's/.*"fileUrl":"\([^"]*\)".*/\1/p')

# 3. PUT real bytes (expect 200/204 within 60s of step 2)
printf '\x89PNG\r\n\x1a\n' > /tmp/probe.png
curl -s -o /dev/null -w 'PUT %{http_code}\n' -X PUT "$UP" \
  -H 'Content-Type: image/png' --data-binary @/tmp/probe.png

# 4. FETCH IT BACK PUBLICLY — the step that proves the CDN base is right
curl -s -o /dev/null -w 'GET %{http_code}  <- 200 means the avatar will render\n' "$FILE"
```

A 403 at step 3 with a valid config usually means the 60s window expired. A 403 at
step 4 means the bucket is private or `CDN_BASE_URL` points somewhere that cannot
serve it — fix that before believing uploads work.

## Related dark features

Same class: configured in code, unset in production, failing only when a human tries.

- **Email** — see [[afristage-email-delivery-is-not-working]]: `RESEND_API_KEY` is set
  but Resend returns 403 on every send, and the reset endpoint still answers `ok`.
- **`CORS_ORIGINS`** unset on the `api` service; only a hardcoded fallback origin works.
