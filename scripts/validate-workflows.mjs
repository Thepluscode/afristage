#!/usr/bin/env node
// Every `run:` block in every workflow must be valid shell.
//
// Why this exists: on 2026-09-22 a stray `"` was left after a `fi` in the
// deploy job. YAML parsed fine, the step looked right in review, and it failed
// only in CI — AFTER deploying flutter-web — with `unexpected EOF while looking
// for matching '"'`. The deploy had actually succeeded; the step that was
// supposed to PROVE it is what broke. A verification that cannot run is worse
// than none, because the failure implicates the deploy rather than itself.
//
// `bash -n` parses without executing, so this is safe to run anywhere.
import { readFileSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const DIR = '.github/workflows';
const files = readdirSync(DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));

// Deliberately not a YAML library: this script must run with zero dependencies
// so it cannot itself be the reason CI cannot check CI. The block extractor is
// indentation-based, which is enough for `run: |` blocks and is asserted below.
function runBlocks(text) {
  const lines = text.split('\n');
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)-?\s*run:\s*\|?\s*$/);
    if (!m) {
      const inline = lines[i].match(/^\s*-?\s*run:\s+(\S.*)$/);
      if (inline) blocks.push({ line: i + 1, body: inline[1] });
      continue;
    }
    const indent = m[1].length;
    const body = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      if (lines[j].trim() === '') { body.push(''); continue; }
      const lead = lines[j].match(/^\s*/)[0].length;
      if (lead <= indent) break;
      body.push(lines[j]);
    }
    blocks.push({ line: i + 1, body: body.join('\n') });
    i = j - 1;
  }
  return blocks;
}

let checked = 0;
let failed = 0;
for (const file of files) {
  const text = readFileSync(join(DIR, file), 'utf8');
  for (const { line, body } of runBlocks(text)) {
    // GitHub expressions are not shell; substitute a placeholder so `bash -n`
    // does not trip on `${{ ... }}` and report a problem that is not one.
    const shell = body.replace(/\$\{\{[^}]*\}\}/g, 'GH_EXPR');
    const tmp = join(tmpdir(), `wf-${Date.now()}-${checked}.sh`);
    writeFileSync(tmp, shell);
    checked += 1;
    try {
      execFileSync('bash', ['-n', tmp], { stdio: 'pipe' });
    } catch (e) {
      failed += 1;
      console.error(`FAIL ${file}:${line}\n  ${String(e.stderr || e).trim().split('\n').slice(0, 3).join('\n  ')}`);
    } finally {
      unlinkSync(tmp);
    }
  }
}

// A scanner that finds nothing must fail loudly rather than pass vacuously:
// if the extractor breaks, "0 ok, 0 failed" would otherwise read as success.
const MINIMUM_EXPECTED = 5;
if (checked < MINIMUM_EXPECTED) {
  console.error(`\nREFUSED: only ${checked} run blocks found across ${files.length} workflow files.`);
  console.error('Expected at least ' + MINIMUM_EXPECTED + ' — the extractor is probably broken, not the workflows.');
  process.exit(2);
}

console.log('========================');
console.log(`  RESULT: ${checked - failed} ok, ${failed} failed (${checked} run blocks, ${files.length} workflows)`);
console.log('========================');
process.exit(failed ? 1 : 0);
