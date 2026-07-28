// The linter's own check. A validator that only ever exits 0 is decoration, so
// these assert it actually rejects the things it claims to reject — including
// the blank-line case, which an earlier version of the parser silently skipped
// (it read 33 of the tracker's 70 status entries and reported success).
import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const dir = mkdtempSync(join(tmpdir(), 'tracker-lint-'));
const file = join(dir, 't.md');
const LINTER = new URL('./validate-tracker.mjs', import.meta.url).pathname;
const HEAD = '| Feature | Status | Evidence |\n|---|---|---|\n';

let pass = 0;
let fail = 0;

function check(label, body, expected) {
  writeFileSync(file, HEAD + body);
  const { status } = spawnSync(process.execPath, [LINTER, file], { encoding: 'utf8' });
  if (status === expected) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label} (expected exit ${expected}, got ${status})`);
  }
}

check('VERIFIED with an empty evidence cell is rejected', '| Thing | VERIFIED | |\n', 1);
check('VERIFIED backed only by "tests pass" is rejected', '| Thing | VERIFIED | tests pass |\n', 1);
check('VERIFIED backed only by "build succeeded" is rejected', '| Thing | VERIFIED | build succeeded |\n', 1);
check('VERIFIED backed only by "deployed" is rejected', '| Thing | VERIFIED | deployed |\n', 1);
check('PILOT-READY with "n/a" evidence is rejected', '| Thing | PILOT-READY | n/a |\n', 1);
check('PRODUCTION-READY with "TBD" evidence is rejected', '| Thing | PRODUCTION-READY | TBD |\n', 1);
check('an invented status label is rejected', '| Thing | DONE | shipped it |\n', 1);
check('VERIFIED with real evidence passes', '| Thing | VERIFIED | live run on staging, ledger balanced |\n', 0);
check('a qualified label (VERIFIED (staging)) is accepted', '| Thing | VERIFIED (staging) | live run on staging |\n', 0);
check('IMPLEMENTED needs no evidence, since it claims no proof', '| Thing | IMPLEMENTED | |\n', 0);
check('the historical vocabulary is still accepted', '| Thing | DEPLOYED | |\n', 0);
// The regression that mattered: the tracker separates rows of one table with
// blank lines, and a parser that stops at the first blank checks almost nothing.
check('a row after a blank line is still checked', '| A | VERIFIED | real proof |\n\n| B | VERIFIED | |\n', 1);

// An element inventory also uses a "Status" column, for BUILT / NOT BUILT /
// PARTIAL. It answers a different question and has nothing to back a claim with,
// so it is out of scope — but a FEATURE table must never dodge the gate this way.
writeFileSync(file, '| Element | Status |\n|---|---|\n| Verified badge | NOT BUILT |\n');
{
  const { status } = spawnSync(process.execPath, [LINTER, file], { encoding: 'utf8' });
  if (status === 0) { pass++; console.log('  PASS  an element inventory (Status, no Evidence) is not linted'); }
  else { fail++; console.log(`  FAIL  an element inventory should be skipped (got exit ${status})`); }
}

console.log(`\n========================\n  RESULT: ${pass} passed, ${fail} failed\n========================`);
try {
  unlinkSync(file);
} catch {}
process.exit(fail ? 1 : 0);
