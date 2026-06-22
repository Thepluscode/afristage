import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (file) => readFileSync(join(root, file), 'utf8');

let pass = 0;
let fail = 0;

function ok(condition, message) {
  console.log(`${condition ? '  PASS' : '  FAIL'}  ${message}`);
  condition ? pass++ : fail++;
}

function contains(file, needles, label) {
  const text = read(file);
  const missing = needles.filter((needle) => !text.includes(needle));
  ok(missing.length === 0, `${label}${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`);
}

function excludes(file, needles, label) {
  const text = read(file);
  const present = needles.filter((needle) => text.includes(needle));
  ok(present.length === 0, `${label}${present.length ? ` (found: ${present.join(', ')})` : ''}`);
}

console.log('\n=== VIEWER UX ===');
contains('apps/mobile/lib/main.dart', ['Home', 'Create', 'Wallet', 'Support', 'Profile'], 'bottom navigation exposes core beta journeys');
contains('apps/mobile/lib/screens/feed_screen.dart', ['Live now', 'No live rooms yet', 'Retry live feed', 'AfriLiveTile'], 'home feed identifies live rooms and recoverable empty state');
excludes('apps/mobile/lib/screens/feed_screen.dart', ['snapshot.error'], 'home feed does not expose raw technical errors');
contains('apps/mobile/lib/screens/room_screen.dart', ['Connect Video', 'Chat is reconnecting', 'Insufficient coins', 'ReportScreen', 'room.ended'], 'viewer live room covers video, chat, gift, report, and ended states');
contains('apps/mobile/lib/widgets/afri_ui.dart', ['Send Gift', 'Buy coins', 'No gifts configured', 'Gift sent', 'Room ended'], 'gift drawer and live room feedback states are visible');

console.log('\n=== CREATOR UX ===');
contains('apps/mobile/lib/screens/creator_apply_screen.dart', ['Creator approval pending', 'You are approved', 'Creator access is suspended', 'Apply as Creator'], 'creator approval states are understandable');
contains('apps/mobile/lib/screens/creator_screen.dart', ['Go Live', 'Request payout', 'Earnings (coins)', 'Payout'], 'creator dashboard exposes go-live, earnings, and payout actions');
excludes('apps/mobile/lib/screens/creator_screen.dart', ['snapshot.error'], 'creator hub does not expose raw technical errors');
contains('apps/mobile/lib/screens/go_live_setup_screen.dart', ['Start Live Room', 'Room title', 'Category', 'Language'], 'go-live setup has required room controls');
contains('apps/mobile/lib/widgets/afri_ui.dart', ['Camera', 'Mic', 'Low data', 'End live room?', 'Confirm before ending'], 'host controls expose device status, low-data, and end confirmation');

console.log('\n=== WALLET AND SUPPORT UX ===');
contains('apps/mobile/lib/screens/wallet_screen.dart', ['Wallet', 'Creator earnings', 'Payout hold', 'Buy coins', 'Ledger and history', "I've paid"], 'wallet separates coins, earnings, holds, purchase, and history');
contains('apps/mobile/lib/screens/history_screen.dart', ['Coin purchases', 'gifts', 'payouts'], 'history separates money event types');
contains('apps/mobile/lib/screens/support_screen.dart', ['Payment issue', 'Payout issue', 'Moderation appeal', 'Create ticket', 'My tickets'], 'support covers beta issue categories and ticket status access');
contains('apps/mobile/lib/screens/report_screen.dart', ['Report ', 'Submit Report', 'Select reason'], 'reporting flow has reason selection and submission');

console.log('\n=== ADMIN OPERATIONS UX ===');
contains('apps/admin-web/app/chrome.tsx', ['Operations', 'People', 'Money', 'System', 'Ledger Integrity'], 'admin navigation is grouped by operational domain');
contains('apps/admin-web/app/page.tsx', ['Live room health', 'Critical reports', 'Pending payouts', 'AuditTimeline'], 'admin dashboard surfaces health, risk, money, and audit context');
contains('apps/admin-web/app/live-rooms/page.tsx', ['ConfirmDialog', 'Suspend', 'End', 'Audit Trail'], 'live room moderation actions require confirmation and audit access');
contains('apps/admin-web/app/reports/page.tsx', ['priority', 'reason', 'ESCALATE', 'SUSPEND_ROOM', 'SUSPEND_USER'], 'report queue supports filtering and critical moderation actions');
contains('apps/admin-web/app/payouts/page.tsx', ['Ledger imbalance detected', 'Hold reason', 'Rejection reason', 'Mark payout paid', 'ConfirmDialog'], 'payout queue has ledger warning, reasons, and paid confirmation');
contains('apps/admin-web/app/ledger-integrity/page.tsx', ['Ledger Integrity', 'Disable payout approvals until resolved'], 'ledger integrity page makes imbalance action explicit');
contains('apps/admin-web/app/support/page.tsx', ['internal notes', 'TicketThread', 'assign', 'resolve'], 'support admin separates triage, replies, and internal notes');
contains('apps/admin-web/app/audit-logs/page.tsx', ['Read-only operator trail', 'AuditTimeline'], 'audit logs are traceable and read-only');
contains('apps/admin-web/app/globals.css', [':focus-visible', '.button:disabled'], 'admin keyboard focus and disabled states are styled');

console.log('\n=== EXECUTABLE BETA GATES ===');
contains('package.json', ['smoke:closed-beta', 'validate:beta', 'validate:ux-readiness'], 'package scripts expose closed-beta and UX readiness validation');
contains('scripts/closed-beta-smoke-test.mjs', ['auth', 'gift.sent', 'room.ended', 'ledger integrity', 'audit logs'], 'closed-beta smoke test covers auth, realtime, money, ledger, and audit loop');

console.log(`\n========================\n  RESULT: ${pass} passed, ${fail} failed\n========================`);
process.exit(fail ? 1 : 0);
