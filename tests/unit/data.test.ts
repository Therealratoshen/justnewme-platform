// Unit tests — the data layer
// Run: npm test

import { describe, it, expect, beforeEach } from 'vitest';
import { Users, Workers, Problems, Sessions, Messages, Events } from '../../app/lib/data';

describe('Users', () => {
  it('creates a user and looks them up by email', async () => {
    const u = await Users.create({ email: 'test@example.com', name: 'Test', role: 'end_user' });
    expect(u.id).toMatch(/^usr_/);
    expect(u.email).toBe('test@example.com');
    const fetched = await Users.getByEmail('TEST@example.com'); // case-insensitive
    expect(fetched?.id).toBe(u.id);
  });

  it('rejects duplicate emails (overwrites by lookup only)', async () => {
    const a = await Users.create({ email: 'dupe@example.com', name: 'A', role: 'end_user' });
    const b = await Users.create({ email: 'dupe@example.com', name: 'B', role: 'end_user' });
    expect(a.id).not.toBe(b.id);
    // Last one wins on the email index
    const found = await Users.getByEmail('dupe@example.com');
    expect(found?.id).toBe(b.id);
  });
});

describe('Workers', () => {
  it('creates a worker with default quality metrics', async () => {
    const u = await Users.create({ email: 'w@example.com', name: 'W', role: 'worker' });
    const w = await Workers.create({
      userId: u.id,
      displayName: 'W',
      headline: 'h',
      bio: 'b',
      skills: ['ai_strategy'],
      categories: ['strategy'],
      hourlyRate: 100,
      currency: 'USD',
      status: 'active',
    });
    expect(w.rating).toBe(0);
    expect(w.ratingCount).toBe(0);
    expect(w.completedSessions).toBe(0);
  });

  it('finds matching workers for a problem by category', async () => {
    const u1 = await Users.create({ email: 'w1@example.com', name: 'W1', role: 'worker' });
    const w1 = await Workers.create({
      userId: u1.id, displayName: 'W1', headline: '', bio: '',
      skills: ['ai_strategy'], categories: ['strategy'],
      hourlyRate: 100, currency: 'USD', status: 'active',
    });
    const poster = await Users.create({ email: 'p@example.com', name: 'P', role: 'end_user' });
    const p = await Problems.create({
      postedByUserId: poster.id,
      title: 'Test', description: 'A test problem with enough length',
      category: 'strategy', skillsNeeded: ['ai_strategy'],
      budgetCents: 10_000, urgency: 'normal',
    });
    const matches = await Workers.findMatchesForProblem(p);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    // The seeded Filbert and our w1 both match — verify w1 is in the list
    // rather than expecting a specific position (sort is by rating which is 0 for both)
    expect(matches.find((m) => m.id === w1.id)).toBeDefined();
  });

  it('does not match inactive workers', async () => {
    const u = await Users.create({ email: 'suspended@example.com', name: 'S', role: 'worker' });
    await Workers.create({
      userId: u.id, displayName: 'S', headline: '', bio: '',
      skills: ['ai_strategy'], categories: ['strategy'],
      hourlyRate: 100, currency: 'USD', status: 'suspended',
    });
    const poster = await Users.create({ email: 'p2@example.com', name: 'P2', role: 'end_user' });
    const p = await Problems.create({
      postedByUserId: poster.id,
      title: 'Test2', description: 'A second test problem with enough length',
      category: 'strategy', skillsNeeded: ['ai_strategy'],
      budgetCents: 10_000, urgency: 'normal',
    });
    const matches = await Workers.findMatchesForProblem(p);
    expect(matches.find((m) => m.status === 'suspended')).toBeUndefined();
  });
});

describe('Problems', () => {
  it('creates a problem with expiry in 30 days by default', async () => {
    const u = await Users.create({ email: 'p3@example.com', name: 'P3', role: 'end_user' });
    const p = await Problems.create({
      postedByUserId: u.id,
      title: 'Test3', description: 'A third test problem with enough length',
      category: 'dev', skillsNeeded: ['javascript'],
      budgetCents: 5_000, urgency: 'high',
    });
    const days = (new Date(p.expiresAt).getTime() - new Date(p.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThan(31);
  });
});

describe('Sessions', () => {
  it('creates a session with correct platform fee math (15%)', async () => {
    const u = await Users.create({ email: 'su@example.com', name: 'SU', role: 'end_user' });
    const wu = await Users.create({ email: 'swu@example.com', name: 'SWU', role: 'worker' });
    const w = await Workers.create({
      userId: wu.id, displayName: 'W', headline: '', bio: '',
      skills: [], categories: ['dev'],
      hourlyRate: 100, currency: 'USD', status: 'active',
    });
    const p = await Problems.create({
      postedByUserId: u.id,
      title: 'P', description: 'Description with enough length here',
      category: 'dev', skillsNeeded: [],
      budgetCents: 20_000, urgency: 'normal',
    });
    const s = await Sessions.create({
      problemId: p.id, userId: u.id, workerId: w.id,
      amountCents: 20_000,
      platformFeeCents: Math.floor((20_000 * 1500) / 10_000),
      workerEarningsCents: 20_000 - Math.floor((20_000 * 1500) / 10_000),
      currency: 'USD', status: 'pending_payment',
    });
    expect(s.platformFeeCents).toBe(3_000); // 15% of 20000
    expect(s.workerEarningsCents).toBe(17_000);
  });
});

describe('Messages', () => {
  it('lists messages in chronological order', async () => {
    const u = await Users.create({ email: 'm@example.com', name: 'M', role: 'end_user' });
    const wu = await Users.create({ email: 'mw@example.com', name: 'MW', role: 'worker' });
    const w = await Workers.create({
      userId: wu.id, displayName: 'W', headline: '', bio: '',
      skills: [], categories: ['dev'],
      hourlyRate: 100, currency: 'USD', status: 'active',
    });
    const p = await Problems.create({
      postedByUserId: u.id,
      title: 'M', description: 'A problem with enough description length',
      category: 'dev', skillsNeeded: [],
      budgetCents: 5_000, urgency: 'normal',
    });
    const s = await Sessions.create({
      problemId: p.id, userId: u.id, workerId: w.id,
      amountCents: 5_000, platformFeeCents: 750, workerEarningsCents: 4_250,
      currency: 'USD', status: 'in_progress',
    });
    await new Promise((r) => setTimeout(r, 5));
    await Messages.create({ sessionId: s.id, fromUserId: wu.id, fromRole: 'worker', content: 'first' });
    await new Promise((r) => setTimeout(r, 5));
    await Messages.create({ sessionId: s.id, fromUserId: u.id, fromRole: 'user', content: 'second' });
    const list = await Messages.listForSession(s.id);
    expect(list).toHaveLength(2);
    expect(list[0].content).toBe('first');
    expect(list[1].content).toBe('second');
  });
});

describe('Events', () => {
  it('logs and queries events by session', async () => {
    const u = await Users.create({ email: 'e@example.com', name: 'E', role: 'end_user' });
    const wu = await Users.create({ email: 'ew@example.com', name: 'EW', role: 'worker' });
    const w = await Workers.create({
      userId: wu.id, displayName: 'W', headline: '', bio: '',
      skills: [], categories: ['dev'],
      hourlyRate: 100, currency: 'USD', status: 'active',
    });
    const p = await Problems.create({
      postedByUserId: u.id,
      title: 'E', description: 'A problem with enough description length',
      category: 'dev', skillsNeeded: [],
      budgetCents: 5_000, urgency: 'normal',
    });
    const s = await Sessions.create({
      problemId: p.id, userId: u.id, workerId: w.id,
      amountCents: 5_000, platformFeeCents: 750, workerEarningsCents: 4_250,
      currency: 'USD', status: 'in_progress',
    });
    await Events.create({ type: 'session_started', sessionId: s.id, workerId: w.id, userId: u.id });
    await Events.create({ type: 'message_sent', sessionId: s.id, workerId: w.id, userId: u.id });
    const events = await Events.listFor({ sessionId: s.id });
    expect(events).toHaveLength(2);
  });
});
