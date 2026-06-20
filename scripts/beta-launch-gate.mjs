import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const args = new Set(process.argv.slice(2));
const live = args.has('--live');
const full = args.has('--full');
const skipMobile = args.has('--skip-mobile');

let failed = 0;

function mark(ok, label) {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}`);
  if (!ok) failed += 1;
}

function read(file) {
  return readFileSync(join(root, file), 'utf8');
}

function docGate() {
  console.log('\n=== OPERATIONS DOCS ===');
  const docs = [
    'docs/phase-3-6-beta-launch-operations.md',
    'docs/phase-3-5-ux-validation.md',
    'docs/beta-readiness-checklist.md',
    'docs/runbook.md'
  ];
  for (const file of docs) mark(existsSync(join(root, file)), `${file} exists`);

  if (!failed) {
    const ops = read('docs/phase-3-6-beta-launch-operations.md');
    for (const term of [
      'Invite rollout',
      'Daily operating rhythm',
      'Incident playbooks',
      'Support handling',
      'Launch freeze gates',
      'Beta success metrics'
    ]) {
      mark(ops.includes(term), `operations doc covers ${term}`);
    }
  }
}

function run(label, cmd, cmdArgs, options = {}) {
  console.log(`\n=== ${label.toUpperCase()} ===`);
  const result = spawnSync(cmd, cmdArgs, {
    cwd: options.cwd ? join(root, options.cwd) : root,
    stdio: 'inherit',
    shell: false
  });
  mark(result.status === 0, label);
}

async function apiHealthGate() {
  console.log('\n=== LIVE STACK HEALTH ===');
  try {
    const res = await fetch(process.env.API_BASE?.replace(/\/api\/?$/, '/api/health') || 'http://localhost:3000/api/health');
    mark(res.ok, `API health returned ${res.status}`);
  } catch (error) {
    mark(false, `API health unreachable: ${error.message}`);
  }
}

docGate();
run('Production readiness static gate', 'npm', ['run', 'validate:production-readiness']);
run('UX readiness gate', 'npm', ['run', 'validate:ux-readiness']);
run('Admin web production build', 'npm', ['run', 'build', '-w', 'apps/admin-web']);

if (!skipMobile) {
  run('Mobile static analysis', 'flutter', ['analyze'], { cwd: 'apps/mobile' });
  run('Mobile widget tests', 'flutter', ['test'], { cwd: 'apps/mobile' });
}

if (full) {
  run('API unit tests', 'npm', ['run', 'test', '-w', 'apps/api']);
}

if (live) {
  await apiHealthGate();
  run('Closed beta backend validator', 'npm', ['run', 'validate:beta']);
  run('Closed beta smoke test', 'npm', ['run', 'smoke:closed-beta']);
}

console.log(`\n========================\n  RESULT: ${failed === 0 ? 'launch gate passed' : `${failed} gate(s) failed`}\n========================`);
process.exit(failed ? 1 : 0);
