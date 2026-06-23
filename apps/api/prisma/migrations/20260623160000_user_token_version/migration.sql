-- Stateless refresh-token revocation: tokens carry this version; bumping it
-- ("sign out everywhere") invalidates all previously issued refresh tokens.
ALTER TABLE "users" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;
