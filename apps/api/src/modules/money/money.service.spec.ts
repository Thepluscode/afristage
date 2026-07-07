import { BadRequestException } from '@nestjs/common';
import { bpsShare, MoneyService } from './money.service';
import { MoneyKey } from './money-keys';

// The catalog is exercised end-to-end (against stubbed ledger/wallet) by every
// consumer spec — those are the capture-and-diff equivalence gates. This spec
// covers only what consumers can't reach: the primitive's own guards and the
// key/share helpers.

function build() {
  const prisma: any = { ledgerTransaction: { findUnique: jest.fn().mockResolvedValue(null) } };
  const ledger: any = { postTransaction: jest.fn().mockResolvedValue({ id: 'tx1' }) };
  const wallet: any = {
    balance: jest.fn().mockResolvedValue('1000'),
    account: jest.fn().mockResolvedValue({ id: 'acc' }),
    ensureAccount: jest.fn().mockResolvedValue({ id: 'agacc' }),
    ensureSystemAccount: jest.fn().mockResolvedValue({ id: 'sys' }),
    ensureUserWallets: jest.fn().mockResolvedValue(undefined)
  };
  return { money: new MoneyService(prisma, ledger, wallet), prisma, ledger, wallet };
}

describe('MoneyKey factories (the on-disk migration contract)', () => {
  it('reproduce every legacy key string byte-identically', () => {
    expect(MoneyKey.gift('v1', 'k1')).toBe('gift:v1:k1');
    expect(MoneyKey.missionReward('u1', 'GIFT_1', '2026-07-06')).toBe('mission:u1:GIFT_1:2026-07-06');
    expect(MoneyKey.promoFund('a1', 123)).toBe('promo-fund:a1:123');
    expect(MoneyKey.prizeSettle('e1')).toBe('event-prize:e1');
    expect(MoneyKey.payoutHold('rk')).toBe('payout_request:rk');
    expect(MoneyKey.payoutReject('p1')).toBe('payout_reject:p1');
    expect(MoneyKey.payoutPaid('p1')).toBe('payout_paid:p1');
    expect(MoneyKey.coinPurchase('i1')).toBe('coin_purchase:i1');
  });
});

describe('bpsShare (the one home for split math)', () => {
  it('floors, and remainders stay with the residual party', () => {
    expect(bpsShare(100, 6000)).toBe(60);
    expect(bpsShare(60, 1000)).toBe(6);
    expect(bpsShare(3, 5000)).toBe(1); // floor(1.5)
    expect(bpsShare(10, 6000)).toBe(6);
    expect(bpsShare(0, 6000)).toBe(0);
  });
});

describe('MoneyService primitive guards', () => {
  it('a move with zero sinks is rejected before touching the ledger', async () => {
    const { money, ledger } = build();
    await expect(money.prizeSettle({ eventId: 'e1', awards: [] })).rejects.toBeInstanceOf(BadRequestException);
    expect(ledger.postTransaction).not.toHaveBeenCalled();
  });

  it('bigint sink amounts keep a bigint debit total (payout rows unchanged)', async () => {
    const { money, ledger } = build();
    await money.payoutReject({ payoutId: 'p1', creatorUserId: 'c1', coinAmount: 500n, reason: 'r' });
    const post = ledger.postTransaction.mock.calls[0][0];
    expect(post.entries[0].amountMinor).toBe(500n); // derived debit preserves the type
    expect(post.guardNonNegative).toBeUndefined(); // drain: guard OMITTED, not empty
  });

  it('spend sources always carry the guard; number sinks keep a number debit', async () => {
    const { money, ledger } = build();
    await money.missionReward({ userId: 'u1', missionKey: 'GIFT_1', day: 'd', rewardCoins: 10 });
    const post = ledger.postTransaction.mock.calls[0][0];
    expect(post.entries[0].amountMinor).toBe(10);
    expect(post.guardNonNegative).toEqual(['sys']);
  });
});
