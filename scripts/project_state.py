#!/usr/bin/env python3
"""Generate PROJECT_STATE.json — the countable state, never hand-written.

Four blocks, because they rot at different rates and a session must not confuse
them:

  repository_reproducible  identical in any clone at this commit
  local_only_operational   true of THIS machine — a bare clone would differ
  distribution             is what is here also on the remote
  runtime                  when this ran, and against what

PROJECT_STATE.json is gitignored. A committed state file records the commit
before the one that added it and is stale on arrival.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP = {"node_modules", ".next", ".git", "dist", "build", ".dart_tool", "coverage"}

API = "apps/api/src"


def _read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def _git(root: Path, *args: str) -> str:
    out = subprocess.run(["git", "-C", str(root), *args],
                         capture_output=True, text=True, timeout=60)
    return out.stdout.strip() if out.returncode == 0 else ""


def _walk(root: Path, pattern: str) -> list[str]:
    return sorted(p.relative_to(root).as_posix() for p in root.rglob(pattern)
                  if not SKIP & set(p.parts))


def _is_test(p: Path) -> bool:
    """`money.int-spec.ts` is a test. Matching only ".spec." missed it, and the
    ledger-caller list then reported three callers where production code has one."""
    return bool(re.search(r"(^|[.\-])(spec|test)\.[cm]?tsx?$", p.name))


def _grep_count(root: Path, rel: str, pattern: str, exclude_spec: bool = True) -> int:
    """Count regex matches across a tree, reading files rather than shelling out."""
    n = 0
    base = root / rel
    if not base.exists():
        return 0
    for p in base.rglob("*.ts"):
        if SKIP & set(p.parts):
            continue
        if exclude_spec and _is_test(p):
            continue
        n += len(re.findall(pattern, _read(p)))
    return n


def _ledger_callers(root: Path) -> list[str]:
    """Files calling postTransaction, excluding the definition itself.

    The invariant AfriStage states is that only MoneyService posts to the
    ledger. Counting call sites is the checkable half of it.
    """
    out = []
    base = root / API
    for p in base.rglob("*.ts") if base.exists() else []:
        if SKIP & set(p.parts) or _is_test(p):
            continue
        text = _read(p)
        if re.search(r"\.postTransaction\(", text):
            out.append(p.relative_to(root).as_posix())
    return sorted(out)


def repository_reproducible(root: Path) -> dict:
    pkg = json.loads(_read(root / "package.json") or "{}")
    tracker = _read(root / "FEATURE_TRACKER.md")
    statuses = re.findall(
        r"\b(PLANNED|SCAFFOLDED|IMPLEMENTED|VERIFIED|PILOT-READY|PRODUCTION-READY)\b",
        tracker)

    return {
        "validate_suites": sorted(k for k in pkg.get("scripts", {}) if k.startswith("validate:")),
        "validate_scripts_on_disk": len(list((root / "scripts").glob("validate-*.mjs"))),
        "api_spec_files": len(_walk(root, "*.spec.ts")),
        "prisma_migrations": len([p for p in (root / "apps/api/prisma/migrations").glob("*")
                                  if p.is_dir()]) if (root / "apps/api/prisma/migrations").exists() else 0,
        "ledger_post_callers": _ledger_callers(root),
        "not_found_throws": _grep_count(root, API, r"NotFoundException"),
        "tracker_status_counts": {s: statuses.count(s) for s in sorted(set(statuses))},
        "apps": sorted(p.name for p in (root / "apps").iterdir() if p.is_dir())
        if (root / "apps").exists() else [],
    }


def local_only_operational(root: Path) -> dict:
    return {
        "node_modules_installed": (root / "node_modules").is_dir(),
        "api_node_modules": (root / "apps/api/node_modules").is_dir(),
        "env_files": sorted(p.relative_to(root).as_posix() for p in root.rglob(".env*")
                            if not SKIP & set(p.parts)),
        "worktrees": [l.split()[0] for l in _git(root, "worktree", "list").splitlines()],
    }


def distribution(root: Path) -> dict:
    branch = _git(root, "rev-parse", "--abbrev-ref", "HEAD")
    unpushed = _git(root, "rev-list", "--count", "HEAD", "--not", "--remotes")
    return {
        "branch": branch or "UNKNOWN",
        "unpushed_commits": int(unpushed) if unpushed.isdigit() else None,
        "remote": _git(root, "remote", "get-url", "origin") or "UNKNOWN",
    }


def runtime_state(root: Path) -> dict:
    from datetime import datetime, timezone
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "git_head": _git(root, "rev-parse", "HEAD") or "UNKNOWN",
        "git_dirty": len([l for l in _git(root, "status", "--porcelain").splitlines() if l]),
    }


def snapshot(root: Path = ROOT) -> dict:
    return {
        "repository_reproducible": repository_reproducible(root),
        "local_only_operational": local_only_operational(root),
    }


def write(root: Path = ROOT) -> dict:
    state = snapshot(root)
    state["distribution"] = distribution(root)
    state["runtime"] = runtime_state(root)
    (root / "PROJECT_STATE.json").write_text(
        json.dumps(state, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return state


if __name__ == "__main__":
    json.dump(write(), sys.stdout, indent=2, sort_keys=True)
    print()
