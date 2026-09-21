#!/usr/bin/env python3
"""The continuity contract, enforced.

A session reconstructs AfriStage from this repository, not from memory. That only
holds if the authority files exist, say what they must say, and still match the
code they describe.

This repository moves real money, so the money boundaries are the assertions that
matter. Each exists because its absence is silent: a feature service posting to
the ledger directly still compiles, still passes its own unit test, and bypasses
the idempotency key and the non-negative guard in one move.

Run:  python3 scripts/check_continuity.py
Exits 0 on PASS, 1 on FAIL. Prints every failure, not just the first.
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API = ROOT / "apps" / "api" / "src"
FAILURES: list[tuple[str, str]] = []
CHECKS = 0


def _read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def check(label: str, ok: bool, detail: str = "") -> None:
    global CHECKS
    CHECKS += 1
    if not ok:
        # Label and detail stay apart: joining them with ": " and splitting again
        # collapses distinct checks into one indistinguishable failure id.
        FAILURES.append((label, detail))


def phrase(text: str, words: str) -> bool:
    """Match across a line wrap. A literal substring check on wrapped Markdown
    fails on whitespace rather than on substance."""
    return re.search(r"\s+".join(map(re.escape, words.split())), text) is not None


CHARTER = _read(ROOT / "AGENT_CONTEXT.md")
BOOTSTRAP = _read(ROOT / "CLAUDE.md")
INVARIANTS = _read(ROOT / "CLAUDE-INVARIANTS.md")
STANDARD = _read(ROOT / "docs" / "PRODUCT_BUILDING_STANDARD.md")
ACTIVE_RAW = _read(ROOT / "ACTIVE_WORK.yaml")


# ---------------------------------------------------------------- authority files

check("charter exists", bool(CHARTER))
check("charter states the mission", phrase(CHARTER, "Africa-first live creator platform"))
check("charter states the v1 loop",
      all(w in CHARTER for w in ("goes live", "buys coins", "sends gifts", "earns")))
check("charter states that real money moves",
      phrase(CHARTER, "This repository moves real money"))
check("charter states the verification bar is staging, not local",
      phrase(CHARTER, "staging live") and phrase(CHARTER, "not") and "local-only" in CHARTER)

check("bootstrap routes through the product standard",
      "PRODUCT_BUILDING_STANDARD.md" in BOOTSTRAP)
check("bootstrap routes through the charter", "AGENT_CONTEXT.md" in BOOTSTRAP)
check("bootstrap routes through the active task", "ACTIVE_WORK.yaml" in BOOTSTRAP)
check("bootstrap routes through preflight", "preflight" in BOOTSTRAP)
check("bootstrap names the state generator", "project-state" in BOOTSTRAP)
check("bootstrap points at the invariants", "CLAUDE-INVARIANTS.md" in BOOTSTRAP)
check("bootstrap carries the recent-context rule",
      phrase(BOOTSTRAP, "Discovery is not authorisation"))
check("bootstrap carries the money warning",
      phrase(BOOTSTRAP, "moves real money"))
check("bootstrap warns that a green check is not CI",
      phrase(BOOTSTRAP, "synthetic-check"))
check("invariants file survived the rename",
      phrase(INVARIANTS, "PRODUCT_BUILDING_STANDARD.md") and "API error conventions" in INVARIANTS)
check("the governing standard is present", len(STANDARD) > 2000)

for name, text in (("AGENT_CONTEXT.md", CHARTER), ("CLAUDE.md", BOOTSTRAP)):
    check(f"{name} holds no commit SHA",
          not re.search(r"\b[0-9a-f]{7,40}\b", text))


# ------------------------------------------------- the money boundaries, in the code
#
# The charter claims these. If the code stops honouring one, the charter becomes a
# description of a product that no longer exists — and nothing else would notice.

def _is_test(p: Path) -> bool:
    return bool(re.search(r"(^|[.\-])(spec|test)\.[cm]?tsx?$", p.name))


def _production_ts() -> list[Path]:
    return [p for p in API.rglob("*.ts")
            if "node_modules" not in p.parts and not _is_test(p)] if API.exists() else []


PROD = _production_ts()
check("api sources were actually read", len(PROD) >= 100,
      f"found {len(PROD)} production .ts files; an empty read and a broken read "
      f"look identical without a floor")

# THE invariant: only MoneyService posts to the ledger. Counted, not assumed.
callers = sorted(p.relative_to(ROOT).as_posix() for p in PROD
                 if re.search(r"\.postTransaction\(", _read(p)))
check("only MoneyService posts to the ledger",
      callers == ["apps/api/src/modules/money/money.service.ts"],
      f"callers: {callers}")

# Every idempotency key minted in one file.
money_keys = _read(API / "modules" / "money" / "money-keys.ts")
check("ledger idempotency keys are minted in one file", len(money_keys) > 200)
check("money-keys.ts says so in its own words",
      phrase(money_keys, "minted here"))

money_svc = _read(API / "modules" / "money" / "money.service.ts")
# The behaviour, not the comment about it: every spend path compares the balance
# against the amount and refuses. Asserting the comment alone would survive the
# guard being deleted, which is the whole failure this check exists to catch.
_guards = re.findall(
    r"if\s*\(\s*balance\s*<\s*BigInt\([^)]*\)\s*\)\s*throw\s+new\s+BadRequestException",
    money_svc)
check("every spend path refuses an insufficient balance", len(_guards) >= 2,
      f"{len(_guards)} balance guards found in money.service.ts")
check("MoneyService documents the never-negative rule at its site",
      phrase(money_svc, "must never go negative"))
check("MoneyService checks a prior transaction by idempotency key",
      re.search(r"ledgerTransaction\.findUnique\(\s*\{\s*where:\s*\{\s*idempotencyKey",
                money_svc) is not None)

# Gift quantity is bounded by validation, not by client goodwill.
gift_dto = _read(API / "modules" / "gifts" / "dto" / "send-gift.dto.ts")
check("gift quantity is bounded at 10000",
      re.search(r"@Max\(10000\)", gift_dto) is not None)
check("gift quantity has a lower bound too",
      re.search(r"@Min\(1\)", gift_dto) is not None)

# The 404 convention, as a floor rather than an exact figure: the documented
# count has already drifted, and asserting equality would fail on a correct change.
nf = sum(len(re.findall(r"NotFoundException", _read(p))) for p in PROD)
check("the 404 convention is still widely applied", nf >= 30, f"{nf} NotFoundException uses")

check("PrismaExceptionFilter still exists",
      any("PrismaExceptionFilter" in _read(p) for p in PROD))

# The validate suites are the product's own gates. Losing one is silent.
import json as _json
pkg = _json.loads(_read(ROOT / "package.json") or "{}")
suites = [k for k in pkg.get("scripts", {}) if k.startswith("validate:")]
check("the validate suites are still wired", len(suites) >= 20, f"{len(suites)} found")
for required in ("validate:money", "validate:cross-user", "validate:error-paths",
                 "validate:security", "validate:tracker"):
    check(f"{required} is still defined", required in pkg.get("scripts", {}))


# ---------------------------------------------------------------- active work

try:
    import yaml
except ImportError:
    ACTIVE = None
    print("note: PyYAML absent — ACTIVE_WORK.yaml structure unchecked", file=sys.stderr)
else:
    try:
        ACTIVE = yaml.safe_load(ACTIVE_RAW)
    except yaml.YAMLError as exc:
        ACTIVE = None
        check("ACTIVE_WORK.yaml parses", False, str(exc).replace("\n", " ")[:160])

if ACTIVE is not None:
    check("exactly one active task", isinstance(ACTIVE.get("active"), dict),
          "two concurrent active tasks is no active task")
    active = ACTIVE.get("active") or {}
    check("active task names its authoritative source", bool(active.get("source")))
    check("active task is corroborated", bool(active.get("corroborated_by")))
    check("claim level is one of the four",
          active.get("claim_level") in
          ("implemented", "tested", "production-observed", "customer-validated"))
    check("switch conditions are the portfolio four",
          set(ACTIVE.get("task_switch_requires") or []) == {
              "FOUNDER_OVERRIDE", "CURRENT_TASK_COMPLETED",
              "RELEASE_CONDITION_MET", "VERIFIED_P0_P1_INTERRUPT"})
    check("the ledger boundary is named as forbidden",
          any("postTransaction" in str(f) for f in active.get("forbidden") or []))
    check("verification debt is stated, not hidden",
          bool((ACTIVE.get("verification_debt") or {}).get("outstanding")))
    for entry in ACTIVE.get("history") or []:
        for field in ("reason", "evidence", "approved_by"):
            check(f"history entry {entry.get('date')} records {field}",
                  bool(entry.get(field)))
    for item in ACTIVE.get("parked") or []:
        check(f"parked {item.get('id')} says what would unpark it",
              bool(item.get("unparks_when")))


# ---------------------------------------------------------------- generated state

check("state file is gitignored, not committed",
      subprocess.run(["git", "-C", str(ROOT), "ls-files", "--error-unmatch",
                      "PROJECT_STATE.json"],
                     capture_output=True, text=True, timeout=30).returncode != 0,
      "a committed state file records the commit before the one that added it")

sys.path.insert(0, str(ROOT / "scripts"))
try:
    import project_state

    check("snapshot is reproducible",
          project_state.snapshot(ROOT) == project_state.snapshot(ROOT))
    check("volatile facts stay out of the deterministic snapshot",
          "runtime" not in project_state.snapshot(ROOT))
    state = project_state.snapshot(ROOT)["repository_reproducible"]
    check("spec files were found", state["api_spec_files"] >= 50)
    check("migrations were found", state["prisma_migrations"] >= 20)
    check("all five apps are present", len(state["apps"]) == 5)
    # The generator and this file compute the caller list by separate paths.
    # One path alone would be shared-source: a generator that always returned
    # MoneyService would pass its own test forever, with a second caller present.
    check("generator and contract agree on the ledger callers",
          state["ledger_post_callers"] == callers,
          f"generator {state['ledger_post_callers']} vs contract {callers}")
except Exception as exc:  # pragma: no cover - reported, not swallowed
    check("state generator imports and runs", False, repr(exc))


# ---------------------------------------------------------------- report

print(f"continuity: {CHECKS - len(FAILURES)}/{CHECKS} checks passed")
if FAILURES:
    print()
    for label, detail in FAILURES:
        ident = re.sub(r"[^A-Za-z0-9_./-]", "_", label.replace(" ", "_"))
        print(f"FAILED continuity::{ident}" + (f"  — {detail}" if detail else ""))
    sys.exit(1)
print("PASS")
