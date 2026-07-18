# AfriStage Security Posture

The document a security questionnaire actually wants: every control mapped to
where it lives in the codebase, plus an honest residual-risk register. This is
the "audit scorecard" — the free 80% of the audit→pen-test pipeline. A paid
external penetration test is deferred until a real enterprise deal or money
volume justifies it (AfriStage is B2C; there is no procurement motion today).

Last audit: 2026-07-15 (`security_sweep.sh` + manual triage).

## Controls (each maps to real code)

| Area | Control | Evidence |
|------|---------|----------|
| Transport | HTTPS/TLS everywhere; WebRTC for media | Railway edge TLS; `wss://…livekit.cloud`; helmet + HSTS in `apps/api/src/main.ts` |
| At rest | Managed Postgres + Redis, encrypted at rest | Railway managed services |
| Card data | Never touched — Paystack/Stripe hold all PANs (SAQ-A scope) | `apps/api/src/modules/payments/providers/*` |
| Auth | bcrypt-12, short access + rotating refresh JWTs, TOTP MFA, per-device sessions, per-IP throttle, audited recovery | `apps/api/src/modules/auth/*` |
| Money integrity | Double-entry ledger; continuous integrity check that blocks payouts on imbalance | `apps/api/src/modules/wallet/ledger*.ts` |
| Secret hygiene | Pre-commit `gitleaks protect --staged` (committed hook); no secrets in source | `.githooks/pre-commit` |
| Dependency scanning | `npm audit` (api + admin-web) | this doc's residual register |
| DAST | OWASP ZAP baseline every release (0 FAIL) | `docs/runbook.md` §Security scanning |
| Incident response | Documented playbooks with named owners + <5min env-rollback | `docs/phase-3-6-beta-launch-operations.md` |
| Disclosure | `security@afristage.live` + `/.well-known/security.txt` + `/site/security` | this PR |

## Residual risk register (honest, triaged — not "zero vulnerabilities")

- **Next.js advisories (admin-web, moderate+high).** The flagged code paths —
  Image Optimizer `remotePatterns` and `rewrites` — are **not used** by
  admin-web (config sets only `distDir`; no remote images, no rewrites). The fix
  requires Next 16 (two major versions). **Verdict:** not live exposure; staged
  for the next major-upgrade cycle rather than taking a breaking bump on a
  pre-revenue beta.
- **lodash advisories (api).** Transitive via `@nestjs/cli`, a **devDependency**.
  The production Docker image runs compiled `dist/` with prod deps only —
  `@nestjs/cli` and lodash are **absent from the deployed runtime**. Not an
  attack surface. No action.
- **No per-account lockout counter.** Brute-force control is the per-IP throttle
  only (deliberate); slow cross-IP attacks are bounded by bcrypt cost 12.
- **No external penetration test yet.** Deferred (B2C, pre-revenue). The ZAP
  baseline + this audit cover the automated layer.

## Re-audit checklist

Before any launch or on a monthly cadence:
1. `bash ~/.claude/skills/theplus-tech-security-first/scripts/security_sweep.sh --fast .`
2. `gitleaks detect` — confirm zero *real* secrets (test flags like
   `THROTTLE_DISABLED=true` are benign false positives).
3. `npm audit --omit=dev` in `apps/api` and `apps/admin-web` — triage each
   finding for runtime reachability, not just a version number.
4. OWASP ZAP baseline against the running API (target 0 FAIL).
5. Update the residual register above with anything new.
