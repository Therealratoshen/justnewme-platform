// Unit tests — Stripe money math
// We don't hit Stripe here. We just verify the math.

import { describe, it, expect } from 'vitest';
import { calculateMoney, PLATFORM_FEE_BPS_CONSTANT } from '../../app/lib/stripe';

describe('calculateMoney', () => {
  it('computes 15% platform fee correctly', () => {
    const { platformFeeCents, workerEarningsCents } = calculateMoney(10_000); // $100
    expect(platformFeeCents).toBe(1_500);
    expect(workerEarningsCents).toBe(8_500);
  });

  it('rounds platform fee down (worker gets the favor on fractional cents)', () => {
    // 1001 * 1500 / 10000 = 150.15, floor = 150
    const { platformFeeCents, workerEarningsCents } = calculateMoney(1_001);
    expect(platformFeeCents).toBe(150);
    expect(workerEarningsCents).toBe(851);
  });

  it('handles zero amount', () => {
    const { platformFeeCents, workerEarningsCents } = calculateMoney(0);
    expect(platformFeeCents).toBe(0);
    expect(workerEarningsCents).toBe(0);
  });

  it('platform fee bps is the configured value', () => {
    expect(PLATFORM_FEE_BPS_CONSTANT).toBe(1500);
  });
});
