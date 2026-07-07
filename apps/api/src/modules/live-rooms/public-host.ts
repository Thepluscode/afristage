// ponytail: never expose passwordHash/email/phone on a public host object.
// Safe fields only. Shared by the feed engine and room lifecycle reads.
export const PUBLIC_HOST_INCLUDE = {
  host: { select: { id: true, role: true, profile: true, creatorProfile: true } }
} as const;
