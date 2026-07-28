// Gives docs/PRODUCT_BUILDING_STANDARD.md its one mechanical tooth:
// "Never label something VERIFIED without evidence."
//
// This project's own history is the reason it exists — 2+ months of features
// were marked done while none of them worked in production. A status column is
// worthless if anyone can type VERIFIED next to an empty evidence cell, so this
// fails the build when they do.
//
// It deliberately checks only what a machine can actually know: that a label is
// a real label, and that a claim of proof is accompanied by something. Whether
// the evidence is *good* is a human judgement and is not simulated here.
import { readFileSync } from 'node:fs';

const FILE = process.argv[2] || 'FEATURE_TRACKER.md';

// The current vocabulary, per the standard.
const CURRENT = ['PLANNED', 'SCAFFOLDED', 'IMPLEMENTED', 'VERIFIED', 'PILOT-READY', 'PRODUCTION-READY'];
// Deliberately still accepted: historical entries were assessed against the
// definitions in force when their evidence was gathered and are not relabelled.
// See the mapping table in the tracker header.
const HISTORICAL = ['IN PROGRESS', 'DEPLOYED'];
// Labels that assert the workflow is proven, so they must carry evidence.
const CLAIMS_PROOF = ['VERIFIED', 'PILOT-READY', 'PRODUCTION-READY'];

// Evidence that says nothing. "Tests pass" is the exact claim the standard
// rejects as sufficient for VERIFIED.
const EMPTY_EVIDENCE = /^(|-|—|n\/a|na|none|tbd|pending|build (succeeded|passed)|tests? (pass|passed|passing|green)|deployed|done|yes)\.?$/i;

// Markdown cells may contain escaped pipes (e.g. `charge\|dispute`).
const splitRow = (line) =>
  line
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim());

const isSeparator = (line) => /^\|[\s|:-]+\|$/.test(line.trim());
const isRow = (line) => line.trim().startsWith('|') && line.trim().endsWith('|');

// A label may carry a qualifier, e.g. "VERIFIED (staging)". The base label is
// what gets validated; the qualifier is free text.
const baseLabel = (cell) =>
  cell
    .replace(/\*\*/g, '')
    .replace(/\([^)]*\)/g, '')
    .trim()
    .toUpperCase();

// The tracker separates rows of the same logical table with blank lines, so a
// parser that stops at the first blank silently skips most of the file — which
// is the false assurance this script exists to prevent. Columns therefore stay
// in force across blank lines and are only reset by real prose, or replaced when
// a new header row appears.
function lint(text) {
  const lines = text.split('\n');
  const problems = [];
  const counts = {};
  let statusAt = -1;
  let evidenceAt = -1;
  let width = 0;
  let unattributed = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim() === '') continue; // a blank line does not end the table
    if (isSeparator(line)) continue;

    if (!isRow(line)) {
      statusAt = -1; // prose ends the table
      evidenceAt = -1;
      continue;
    }

    if (isSeparator(lines[i + 1] ?? '')) {
      const header = splitRow(line).map((h) => h.toLowerCase());
      statusAt = header.findIndex((h) => h === 'status');
      evidenceAt = header.findIndex((h) => h.includes('evidence'));
      width = header.length;
      continue;
    }

    if (statusAt === -1) continue; // not inside a status-bearing table

    const cells = splitRow(line);
    // The tracker contains rows whose column count does not match the header
    // above them (they render as standalone one-row tables). Reading a status
    // out of those by position would report the wrong column — count them and
    // say so instead of guessing or silently dropping them.
    if (cells.length !== width) {
      if (/\b(PLANNED|SCAFFOLDED|IMPLEMENTED|VERIFIED|PILOT-READY|PRODUCTION-READY|DEPLOYED|IN PROGRESS)\b/.test(line)) unattributed++;
      continue;
    }
    const raw = cells[statusAt];
    if (raw === undefined) continue;
    const label = baseLabel(raw);
    if (!label) continue;

    counts[label] = (counts[label] || 0) + 1;

    if (!CURRENT.includes(label) && !HISTORICAL.includes(label)) {
      problems.push(`line ${i + 1}: unknown status "${raw}" (expected one of ${CURRENT.join(', ')})`);
      continue;
    }

    if (CLAIMS_PROOF.includes(label)) {
      const evidence = evidenceAt === -1 ? '' : (cells[evidenceAt] ?? '').replace(/\*\*/g, '').trim();
      if (EMPTY_EVIDENCE.test(evidence)) {
        problems.push(
          `line ${i + 1}: "${label}" claims the workflow is proven but its evidence is ${
            evidence ? `"${evidence}"` : 'empty'
          } — state what was run and observed`,
        );
      }
    }
  }
  return { problems, counts, unattributed };
}

const { problems, counts, unattributed } = lint(readFileSync(FILE, 'utf8'));

const legacy = HISTORICAL.reduce((n, l) => n + (counts[l] || 0), 0);
const total = Object.values(counts).reduce((a, b) => a + b, 0);
console.log(`  ${total} status entries in ${FILE}`);
if (legacy) console.log(`  ${legacy} still use the historical vocabulary (documented in the tracker header, not an error)`);
if (unattributed) console.log(`  ${unattributed} status-bearing rows do not match the column count of any header above them and were NOT checked`);

for (const p of problems) console.log(`  FAIL  ${p}`);
console.log(`\n========================\n  RESULT: ${total - problems.length} ok, ${problems.length} failed\n========================`);
process.exit(problems.length ? 1 : 0);
