# AfriStage — Security & Compliance Audit Readiness

The single artifact to hand a prospect's security reviewer (SIG-Lite / vendor
questionnaire / SOC-lite pre-read). It answers each standard questionnaire
category with **Yes / Partial / N-A**, then links to the doc or code that
*proves* it — so a reviewer verifies, not takes our word. Detail lives in the
linked sources; this file is the index, not a copy.

- **Scope:** AfriStage — B2C live-streaming + creator-gifting platform (NestJS API,
  Next.js admin, Flutter mobile). Money is coins backed by a double-entry ledger.
- **Data residency / hosting:** Railway (managed Postgres + Redis).
- **Card data:** never touched — PCI **SAQ-A** scope (processors hold all PANs).
- **Last internal audit:** see [security-posture.md](security-posture.md) (`security_sweep.sh` + manual triage).
- **Independent pen test:** not yet — deferred (B2C, pre-revenue); see Residual Risk.

Legend: **✅ Yes** implemented + evidence · **🟡 Partial** implemented with a named
limit · **N-A** out of scope with reason.

## 1. Access control & authentication
| Q | A | Evidence |
|---|---|---|
| Strong auth (hashing, MFA)? | ✅ | bcrypt cost-12, TOTP MFA, short access + rotating refresh JWTs, per-device sessions — `apps/api/src/modules/auth/*`; production forces `REQUIRE_ADMIN_MFA=true` ([phase-3-7](phase-3-7-production-launch-hardening.md) Hard Gates) |
| Brute-force protection? | 🟡 | Per-IP throttle + bcrypt-12 cost ceiling. **No per-account lockout counter** (deliberate) — see Residual Risk |
| Role-based admin access? | ✅ | `ADMIN+` guards on every admin/account endpoint — [account-deletion.md](account-deletion.md) Endpoints; `apps/api/src/modules/auth/*` guards |
| Re-auth on sensitive actions? | ✅ | Self-service delete requires current password even with a valid session — `DELETE /account` ([account-deletion.md](account-deletion.md)); admin re-auth returns operator to prior path (#182) |
| Session revocation? | ✅ | `tokenVersion` bump kills all issued tokens; every `DeviceSession` revoked on deactivate — [account-deletion.md](account-deletion.md) |

## 2. Encryption
| Q | A | Evidence |
|---|---|---|
| In transit? | ✅ | Railway edge TLS; media over `wss://…livekit.cloud`; `helmet` sets HSTS/nosniff/frame-deny + `no-store` default — `apps/api/src/main.ts` (`helmet ^7.2.0`) |
| At rest? | ✅ | Railway managed Postgres + Redis, encrypted at rest — [security-posture.md](security-posture.md) |
| Secrets management? | ✅ | Env-injected (Railway vars); pre-commit `gitleaks protect --staged` committed hook, no secrets in source — `.githooks/pre-commit`; boot-time `validate-env.ts` rejects placeholder secrets |

## 3. Payment / cardholder data
| Q | A | Evidence |
|---|---|---|
| PCI scope? | ✅ N-A (SAQ-A) | No PANs touched — Paystack + Stripe hold all card data; we hold provider references only — `apps/api/src/modules/payments/providers/{paystack,stripe}.provider.ts` |
| Webhook authenticity? | ✅ | Signature-verified, **fail-closed** (missing signing secret → refuse, not accept-unverified); rotation-safe Stripe sig (aeec7f6) |
| Idempotent money ops? | ✅ | MoneyKey idempotency; idempotency-key race → graceful replay not raw 500 (ff60594); disputes/chargebacks captured not dropped (#183) |
| Reconciliation? | ✅ | Continuous ledger-integrity cron + reconciliation sweep (#177) — `apps/api/src/modules/wallet/ledger-integrity.service.ts` |

## 4. Data privacy & subject rights (GDPR)
| Q | A | Evidence |
|---|---|---|
| Right to erasure? | ✅ | Soft-delete → 30-day window → hard erasure (PII scrubbed, financials retained anonymised); 72h GDPR SLA path — [account-deletion.md](account-deletion.md) cascade map |
| Right to access (Art. 15)? | ✅ | `GET /account/export` (self) + `GET /admin/users/:id/export` — JSON report, credentials never included |
| Retention policy? | ✅ | `RETENTION_DAYS=30` soft window; financial records retained 5–7y anonymised under Art. 17(3)(b) — [account-deletion.md](account-deletion.md) |
| Deletion doesn't break integrity? | ✅ | No blind `onDelete: Cascade`; explicit ordered single-transaction deletion preserves ledger — [account-deletion.md](account-deletion.md) |

## 5. Sub-processors
| Processor | Purpose | Data |
|---|---|---|
| Railway | Hosting, managed Postgres + Redis | All application data (encrypted at rest) |
| Paystack | Payments (NGN/GHS/KES/ZAR) | Card data (their scope), payer refs |
| Stripe | Payments (USD) | Card data (their scope), payer refs |
| LiveKit Cloud | Live media / WebRTC (`livekit-server-sdk`) | Stream media, room tokens |

No third-party email/marketing processor is wired (notifications are in-app). Update this table before adding one.

## 6. Application security (SDLC)
| Q | A | Evidence |
|---|---|---|
| Dependency scanning? | ✅ | `npm audit --omit=dev` (api + admin-web) each release, triaged for runtime reachability — [security-posture.md](security-posture.md) residual register |
| DAST? | ✅ | OWASP ZAP baseline every release, current **0 FAIL** — [runbook.md](runbook.md) §Security scanning |
| Secret scanning? | 🟡 | Committed pre-commit `gitleaks` gate. **CI-side scanning is off** (Actions billing) — the local hook is the control; see Residual Risk |
| Test coverage? | ✅ | 100% coverage bar on changed files + full suites gate every change; concurrency/ledger integration specs — `apps/api/src/modules/wallet/ledger.concurrency.int-spec.ts` |
| Env-config safety? | ✅ | `validate-env.ts` is boot-fatal on missing/unsafe prod config; `ENABLE_MOCK_PAYMENTS=true` / `ALLOW_SEEDED_PROD_LOGIN=true` refuse to start — [phase-3-7](phase-3-7-production-launch-hardening.md) |

## 7. Logging, audit trail & observability
| Q | A | Evidence |
|---|---|---|
| Admin action audit trail? | ✅ | Every admin/account action writes `AdminAuditLog` (`schema.prisma:547`); admin UI surface at `apps/admin-web/app/audit-logs` |
| Metrics / monitoring? | ✅ | Prometheus `GET /api/metrics` (`prom-client`), token-guardable via `METRICS_TOKEN`; ledger-integrity + money-move-failure alert rules — [phase-3-7](phase-3-7-production-launch-hardening.md) §Monitoring |
| Uptime monitoring? | ✅ | Outside-in synthetic health check every 5 min (#157) — `tools/monitoring/synthetic_check.py` |
| Business-metric alerting? | ✅ | Revenue-drop detector: alerts when checkouts continue but payments → 0 (#185) — `apps/api/src/modules/payments/revenue-monitor.service.ts` |

## 8. Vulnerability & patch management
| Q | A | Evidence |
|---|---|---|
| Cadence? | ✅ | Monthly + pre-launch re-audit checklist — [security-posture.md](security-posture.md) §Re-audit |
| Triage discipline? | ✅ | Each advisory judged on runtime reachability, not version number (Next.js image-optimizer paths unused; lodash devDep absent from prod image) — [security-posture.md](security-posture.md) residual register |
| Pen test? | 🟡 | Automated (ZAP) covered; authenticated Burp Suite pass budgeted **pre-enterprise-deal** — [runbook.md](runbook.md) §Security scanning |

## 9. Business continuity & disaster recovery
| Q | A | Evidence |
|---|---|---|
| Backups? | 🟡 | Railway managed automated backups — **verify enabled + retention in dashboard, do not assume** — [disaster-recovery.md](disaster-recovery.md) |
| RPO / RTO? | ✅ | RPO ≤24h (daily backups), RTO <1h to a *verified* restore — [disaster-recovery.md](disaster-recovery.md) |
| Restore tested? | ✅ | `scripts/verify-restore.sh` gates a restore on health + readiness + **ledger integrity intact** (money survived) + login smoke — [disaster-recovery.md](disaster-recovery.md) |

## 10. Incident response & change management
| Q | A | Evidence |
|---|---|---|
| IR playbooks + owners? | ✅ | Named owners, <5min env-rollback — [phase-3-6-beta-launch-operations.md](phase-3-6-beta-launch-operations.md); failure playbooks — [runbook.md](runbook.md) §Common failures |
| Rollback readiness? | ✅ | <5min: restart prior image; migrations are additive (expand-contract) so no DB rollback; ledger-integrity is the "rollback done" invariant — [phase-3-7](phase-3-7-production-launch-hardening.md) §Deploy & Rollback |
| Vulnerability disclosure? | ✅ | `security@afristage.live` + `/.well-known/security.txt` + `/site/security` — [security-posture.md](security-posture.md) |

## Residual risk register (honest — not "zero vulnerabilities")
Full detail: [security-posture.md](security-posture.md) §Residual. The load-bearing ones a reviewer will ask about:

1. **CI-side automated scanning is off** (GitHub Actions billing disabled pre-revenue). Compensating controls: committed `gitleaks` pre-commit hook, literal-100%-coverage bar, and live post-deploy verification on every change. *Upgrade path: enable Actions at first revenue.*
2. **No independent penetration test yet.** ZAP baseline covers the automated layer; authenticated Burp pass budgeted for the first enterprise deal.
3. **No per-account lockout counter.** Brute force is bounded by per-IP throttle + bcrypt cost-12 only. *Upgrade path: add a lockout counter if abuse appears.*
4. **Backups require dashboard confirmation** — the CLI doesn't expose Postgres backup config; a launch step must eyeball it, not assume it.
5. **Next.js / lodash advisories** — triaged as not-reachable (unused code paths / devDep absent from prod runtime); staged, not ignored.

## Accountability
Creation is delegated (AI-assisted); accountability is not. Every release above is
demonstrated with evidence — security, compliance controls, traceability, testing,
observability, rollback readiness — and its **residual risk stated explicitly**, not
hidden. A control with no linked evidence is not a control.

_Regenerate cadence: refresh this index whenever a linked doc changes or a new
sub-processor/control is added; re-run the [security-posture.md](security-posture.md) §Re-audit checklist monthly / pre-launch._
