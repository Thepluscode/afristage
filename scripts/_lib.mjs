import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Load apps/api/.env for local runs (dotenv never overrides an env var already set,
// so CI's DATABASE_URL/API_BASE take precedence).
config({ path: new URL('../apps/api/.env', import.meta.url).pathname });

// Shared helpers for the validation scripts. SQL goes through Prisma (DATABASE_URL),
// so the same scripts run locally and in CI with no docker/psql dependency.
const prisma = new PrismaClient();

export const B = process.env.API_BASE || 'http://localhost:3000/api';
export const WS = process.env.WS_BASE || 'http://localhost:3000/chat';

// Seeded-account passwords. Local stacks use the well-known seeds; staging
// rotates them (runbook: STAGING_*_PASSWORD in Railway vars) — override via env.
export const SEED = {
  admin: process.env.SEED_ADMIN_PASSWORD || 'Admin123!',
  creator: process.env.SEED_CREATOR_PASSWORD || 'Creator123!',
  viewer: process.env.SEED_VIEWER_PASSWORD || 'Viewer123!'
};

let pass = 0, fail = 0;
export const ok = (c, m) => { console.log(`${c ? '  PASS' : '  FAIL'}  ${m}`); c ? pass++ : fail++; };

// Returns the first column of the first row as a string (scalar queries), or '' for
// empty results / non-SELECT statements (INSERT/UPDATE are executed for side effects).
export async function sql(query) {
  if (!/^\s*(select|with)/i.test(query)) {
    await prisma.$executeRawUnsafe(query);
    return '';
  }
  const rows = await prisma.$queryRawUnsafe(query);
  if (!rows.length) return '';
  const v = Object.values(rows[0])[0];
  return v === null || v === undefined ? '' : String(v);
}

export async function api(method, path, { token, body, raw, headers } = {}) {
  const res = await fetch(B + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(headers || {}) },
    body: raw !== undefined ? raw : body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data, headers: res.headers };
}

export const login = async (id, pw, mfaToken) =>
  (await api('POST', '/auth/login', { body: { identifier: id, password: pw, mfaToken } })).data?.accessToken;

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function finish() {
  console.log(`\n========================\n  RESULT: ${pass} passed, ${fail} failed\n========================`);
  await prisma.$disconnect().catch(() => {});
  process.exit(fail ? 1 : 0);
}
