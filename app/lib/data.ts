// JustNewMe — in-memory data store
// Swap for Supabase/Postgres in production. Same interface.
//
// All write operations are async to keep the interface stable
// when we move to a real database. In-memory ops are sync under
// the hood; the async signature lets us swap to fetch() without
// changing call sites.
//
// We attach the tables to `globalThis` so they survive Next.js dev-mode
// hot reloads and per-route module instances. This is the same trick
// Solvemate uses. In production (single-process serverless), this is
// still fine — each cold start gets a fresh store, which is what we
// want for demos and previews.

import type {
  User, Worker, Problem, Session, Message, QualityEvent, Notification,
  ProblemStatus, SessionStatus, WorkerStatus, ISODateString,
} from './types';

// ---------- Tables (globalThis-pinned for dev hot reload) ----------

interface Store {
  users: Map<string, User>;
  workers: Map<string, Worker>;
  problems: Map<string, Problem>;
  sessions: Map<string, Session>;
  messages: Map<string, Message>;
  qualityEvents: Map<string, QualityEvent>;
  notifications: Map<string, Notification>;
  emailToUserId: Map<string, string>;
  userIdToWorkerId: Map<string, string>;
  stripeAccountIdToWorkerId: Map<string, string>;
  sessionMessages: Map<string, Set<string>>;
  seeded: boolean;
}

const GLOBAL_KEY = '__justnewme_store__';

function getStore(): Store {
  const g = globalThis as any;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      users: new Map(),
      workers: new Map(),
      problems: new Map(),
      sessions: new Map(),
      messages: new Map(),
      qualityEvents: new Map(),
      notifications: new Map(),
      emailToUserId: new Map(),
      userIdToWorkerId: new Map(),
      stripeAccountIdToWorkerId: new Map(),
      sessionMessages: new Map(),
      seeded: false,
    };
  }
  return g[GLOBAL_KEY];
}

// ---------- ID generation ----------

function randomId(prefix: string, len = 12): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}_${out}`;
}

/**
 * Deterministic ID for a given string. Used so seeded entities (Filbert)
 * get the same ID across serverless cold starts. The cookie that the
 * demo-login sets for Filbert is therefore stable across requests that
 * hit different containers.
 */
function deterministicId(prefix: string, seed: string, len = 10): string {
  // Simple hash → lowercase hex of desired length.
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  const hex = (h >>> 0).toString(16).padStart(8, '0');
  const padded = (hex + hex + hex).slice(0, len);
  return `${prefix}_${padded}`;
}

export const ids = {
  user: () => randomId('usr', 10),
  worker: () => randomId('wrk', 10),
  problem: () => randomId('prob', 10),
  session: () => randomId('sess', 12),
  message: () => randomId('msg', 12),
  event: () => randomId('evt', 10),
  notification: () => randomId('ntf', 10),
  // Deterministic helpers — used for seed data so cross-container
  // requests resolve to the same entity.
  userFor: (seed: string) => deterministicId('usr', seed, 10),
  workerFor: (seed: string) => deterministicId('wrk', seed, 10),
};

// ---------- Generic CRUD ----------

async function get<T>(table: Map<string, T>, id: string): Promise<T | null> {
  return table.get(id) ?? null;
}

async function set<T>(table: Map<string, T>, id: string, value: T): Promise<void> {
  table.set(id, value);
}

async function del<T>(table: Map<string, T>, id: string): Promise<void> {
  table.delete(id);
}

async function list<T>(table: Map<string, T>): Promise<T[]> {
  return Array.from(table.values());
}

// ---------- Users ----------

export const Users = {
  async get(id: string) { const s = getStore(); return get(s.users, id); },
  async getByEmail(email: string) {
    const s = getStore();
    const id = s.emailToUserId.get(email.toLowerCase());
    return id ? s.users.get(id) ?? null : null;
  },
  async create(input: Omit<User, 'id' | 'createdAt'>) {
    const s = getStore();
    const id = ids.user();
    const user: User = { ...input, id, createdAt: new Date().toISOString() };
    await set(s.users, id, user);
    s.emailToUserId.set(user.email.toLowerCase(), id);
    if (user.workerId) s.userIdToWorkerId.set(user.id, user.workerId);
    return user;
  },
  async update(id: string, patch: Partial<User>) {
    const s = getStore();
    const existing = s.users.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...patch, id: existing.id };
    s.users.set(id, updated);
    if (patch.email && patch.email !== existing.email) {
      s.emailToUserId.delete(existing.email.toLowerCase());
      s.emailToUserId.set(updated.email.toLowerCase(), id);
    }
    return updated;
  },
  async list() { const s = getStore(); return list(s.users); },
};

// ---------- Workers ----------

export const Workers = {
  async get(id: string) { const s = getStore(); return get(s.workers, id); },
  async getByUserId(userId: string) {
    const s = getStore();
    const wid = s.userIdToWorkerId.get(userId);
    return wid ? s.workers.get(wid) ?? null : null;
  },
  async getByStripeAccountId(stripeAccountId: string) {
    const s = getStore();
    const wid = s.stripeAccountIdToWorkerId.get(stripeAccountId);
    return wid ? s.workers.get(wid) ?? null : null;
  },
  async create(input: Omit<Worker, 'id' | 'createdAt' | 'rating' | 'ratingCount' | 'completedSessions' | 'responseTimeMinutes' | 'completionRate' | 'disputeRate' | 'repeatClientRate' | 'totalEarningsCents' | 'stripeOnboardingComplete'> & Partial<Pick<Worker, 'stripeOnboardingComplete'>>) {
    const s = getStore();
    const id = ids.worker();
    const worker: Worker = {
      ...input,
      id,
      createdAt: new Date().toISOString(),
      rating: 0,
      ratingCount: 0,
      completedSessions: 0,
      responseTimeMinutes: 0,
      completionRate: 0,
      disputeRate: 0,
      repeatClientRate: 0,
      totalEarningsCents: 0,
      stripeOnboardingComplete: input.stripeOnboardingComplete ?? false,
    };
    await set(s.workers, id, worker);
    s.userIdToWorkerId.set(worker.userId, id);
    if (worker.stripeAccountId) s.stripeAccountIdToWorkerId.set(worker.stripeAccountId, id);
    return worker;
  },
  async update(id: string, patch: Partial<Worker>) {
    const s = getStore();
    const existing = s.workers.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...patch, id: existing.id };
    s.workers.set(id, updated);
    if (patch.stripeAccountId && patch.stripeAccountId !== existing.stripeAccountId) {
      if (existing.stripeAccountId) s.stripeAccountIdToWorkerId.delete(existing.stripeAccountId);
      s.stripeAccountIdToWorkerId.set(updated.stripeAccountId!, id);
    }
    return updated;
  },
  async list(filter?: { status?: WorkerStatus; skill?: string; category?: string }) {
    const s = getStore();
    let all = await list(s.workers);
    if (filter?.status) all = all.filter((w) => w.status === filter.status);
    if (filter?.skill) all = all.filter((w) => w.skills.includes(filter.skill!));
    if (filter?.category) all = all.filter((w) => w.categories.includes(filter.category!));
    return all;
  },
  /**
   * Find workers who match a problem (by skills and category), with active status.
   */
  async findMatchesForProblem(problem: Problem) {
    const s = getStore();
    const all = await list(s.workers);
    return all
      .filter((w) => w.status === 'active')
      .filter((w) =>
        w.categories.includes(problem.category) ||
        problem.skillsNeeded.some((sk) => w.skills.includes(sk)),
      )
      .sort((a, b) => b.rating - a.rating); // best-rated first
  },
};

// ---------- Problems ----------

export const Problems = {
  async get(id: string) { const s = getStore(); return get(s.problems, id); },
  async create(input: Omit<Problem, 'id' | 'createdAt' | 'status' | 'expiresAt'> & { expiresInDays?: number }) {
    const s = getStore();
    const id = ids.problem();
    const now = new Date();
    const expires = new Date(now.getTime() + (input.expiresInDays ?? 30) * 24 * 60 * 60 * 1000);
    const problem: Problem = {
      ...input,
      id,
      status: 'open' as ProblemStatus,
      createdAt: now.toISOString(),
      expiresAt: expires.toISOString(),
    };
    await set(s.problems, id, problem);
    return problem;
  },
  async update(id: string, patch: Partial<Problem>) {
    const s = getStore();
    const existing = s.problems.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...patch, id: existing.id };
    s.problems.set(id, updated);
    return updated;
  },
  async list(filter?: { status?: ProblemStatus; userId?: string; workerId?: string }) {
    const s = getStore();
    let all = await list(s.problems);
    if (filter?.status) all = all.filter((p) => p.status === filter.status);
    if (filter?.userId) all = all.filter((p) => p.postedByUserId === filter.userId);
    if (filter?.workerId) all = all.filter((p) => p.claimedByWorkerId === filter.workerId);
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  /**
   * List open problems that a worker can claim — matches skills + category.
   */
  async listAvailableForWorker(workerId: string) {
    const worker = await Workers.get(workerId);
    if (!worker) return [];
    const open = await this.list({ status: 'open' });
    return open.filter((p) =>
      worker.categories.includes(p.category) ||
      p.skillsNeeded.some((sk) => worker.skills.includes(sk)),
    );
  },
};

// ---------- Sessions ----------

export const Sessions = {
  async get(id: string) { const s = getStore(); return get(s.sessions, id); },
  async create(input: Omit<Session, 'id' | 'claimedAt' | 'paymentStatus'>) {
    const s = getStore();
    const id = ids.session();
    const session: Session = {
      ...input,
      id,
      claimedAt: new Date().toISOString(),
      paymentStatus: 'pending',
    };
    await set(s.sessions, id, session);
    return session;
  },
  async update(id: string, patch: Partial<Session>) {
    const s = getStore();
    const existing = s.sessions.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...patch, id: existing.id };
    s.sessions.set(id, updated);
    return updated;
  },
  async list(filter?: { userId?: string; workerId?: string; status?: SessionStatus }) {
    const s = getStore();
    let all = await list(s.sessions);
    if (filter?.userId) all = all.filter((x) => x.userId === filter.userId);
    if (filter?.workerId) all = all.filter((x) => x.workerId === filter.workerId);
    if (filter?.status) all = all.filter((x) => x.status === filter.status);
    return all.sort((a, b) => b.claimedAt.localeCompare(a.claimedAt));
  },
};

// ---------- Messages ----------

export const Messages = {
  async get(id: string) { const s = getStore(); return get(s.messages, id); },
  async create(input: Omit<Message, 'id' | 'createdAt'>) {
    const s = getStore();
    const id = ids.message();
    const msg: Message = { ...input, id, createdAt: new Date().toISOString() };
    await set(s.messages, id, msg);
    const set_ = s.sessionMessages.get(input.sessionId) ?? new Set();
    set_.add(id);
    s.sessionMessages.set(input.sessionId, set_);
    return msg;
  },
  async listForSession(sessionId: string) {
    const s = getStore();
    const ids_ = s.sessionMessages.get(sessionId);
    if (!ids_) return [];
    const msgs: Message[] = [];
    for (const mid of ids_) {
      const m = s.messages.get(mid);
      if (m) msgs.push(m);
    }
    return msgs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
};

// ---------- Quality events ----------

export const Events = {
  async create(input: Omit<QualityEvent, 'id' | 'createdAt'>) {
    const s = getStore();
    const id = ids.event();
    const evt: QualityEvent = { ...input, id, createdAt: new Date().toISOString() };
    await set(s.qualityEvents, id, evt);
    return evt;
  },
  async listFor(filter: { sessionId?: string; workerId?: string; userId?: string }) {
    const s = getStore();
    let all = await list(s.qualityEvents);
    if (filter.sessionId) all = all.filter((e) => e.sessionId === filter.sessionId);
    if (filter.workerId) all = all.filter((e) => e.workerId === filter.workerId);
    if (filter.userId) all = all.filter((e) => e.userId === filter.userId);
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
};

// ---------- Notifications ----------

export const Notifications = {
  async create(input: Omit<Notification, 'id' | 'createdAt' | 'status'>) {
    const s = getStore();
    const id = ids.notification();
    const n: Notification = { ...input, id, status: 'pending', createdAt: new Date().toISOString() };
    await set(s.notifications, id, n);
    return n;
  },
  async markSent(id: string) {
    const s = getStore();
    const n = s.notifications.get(id);
    if (!n) return null;
    n.status = 'sent';
    n.sentAt = new Date().toISOString();
    return n;
  },
  async listFor(userId: string, onlyUnread = false) {
    const s = getStore();
    let all = await list(s.notifications);
    all = all.filter((n) => n.recipientUserId === userId);
    if (onlyUnread) all = all.filter((n) => n.status !== 'read');
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
};

// ---------- Seeding (dev) ----------

/** Seed Filbert as the founding worker, if no workers exist yet. */
export async function seedDevData() {
  const s = getStore();
  if (s.seeded) return;
  s.seeded = true;

  if ((await Workers.list()).length > 0) return; // already seeded

  // Use deterministic IDs so cross-container requests on serverless
  // resolve to the same entity.
  const FILBERT_EMAIL = 'filbert@filberthenrico.my.id';
  const filbertUserId = ids.userFor(FILBERT_EMAIL);
  const filbertWorkerId = ids.workerFor(FILBERT_EMAIL);
  const DEMO_USER_EMAIL = 'demo-user@example.com';
  const demoUserId = ids.userFor(DEMO_USER_EMAIL);

  // Manually insert Filbert with deterministic IDs (bypassing create() so
  // the IDs stay fixed across serverless cold starts).
  const filbertUser: User = {
    id: filbertUserId,
    email: FILBERT_EMAIL,
    name: 'Filbert Henrico',
    role: 'worker',
    createdAt: new Date(0).toISOString(), // fixed timestamp
  };
  s.users.set(filbertUserId, filbertUser);
  s.emailToUserId.set(FILBERT_EMAIL, filbertUserId);

  const filbertWorker: Worker = {
    id: filbertWorkerId,
    userId: filbertUserId,
    displayName: 'Filbert Henrico',
    headline: 'AI strategy for fintechs in SEA · 7 yrs · 50+ integrations',
    bio: 'I help fintechs in Southeast Asia build agentic AI systems that ship to production. From strategy to API integration to compliance. Currently Technical Customer Success Lead at Finetiks.',
    skills: ['ai_strategy', 'fintech', 'agentic_ai', 'api_integration', 'payment_infrastructure', 'workflow_automation'],
    categories: ['strategy', 'dev', 'consulting'],
    hourlyRate: 150,
    currency: 'USD',
    city: 'Jakarta',
    country: 'Indonesia',
    timezone: 'Asia/Jakarta',
    portfolioUrl: 'https://www.filberthenrico.my.id',
    status: 'active',
    stripeOnboardingComplete: false,
    rating: 0,
    ratingCount: 0,
    completedSessions: 0,
    responseTimeMinutes: 0,
    completionRate: 0,
    disputeRate: 0,
    repeatClientRate: 0,
    totalEarningsCents: 0,
    createdAt: new Date(0).toISOString(),
    verifiedAt: new Date(0).toISOString(),
  };
  s.workers.set(filbertWorkerId, filbertWorker);
  s.userIdToWorkerId.set(filbertUserId, filbertWorkerId);

  // A sample end user
  const demoUser: User = {
    id: demoUserId,
    email: DEMO_USER_EMAIL,
    name: 'Demo User',
    role: 'end_user',
    createdAt: new Date(0).toISOString(),
    agentContext: { source: 'claude' },
  };
  s.users.set(demoUserId, demoUser);
  s.emailToUserId.set(DEMO_USER_EMAIL, demoUserId);

  // A sample problem so the worker dashboard has something to show.
  // We need a deterministic problem ID too so the dashboard can reference it.
  const problemId = ids.problem(); // OK to be random — it's a fresh seed
  const problem: Problem = {
    id: problemId,
    postedByUserId: demoUserId,
    title: 'AI strategy for Indonesian neobank',
    description: 'We are a Series A neobank in Jakarta. We want to add AI to our customer onboarding and fraud detection. Need a 90-day roadmap with budget estimate. Currently using GPT-4 for some support tickets but want a proper strategy.',
    category: 'strategy',
    skillsNeeded: ['ai_strategy', 'fintech', 'agentic_ai'],
    budgetCents: 30000, // $300
    urgency: 'normal',
    aiAgentContext: {
      source: 'claude',
      chatTranscript: [
        { role: 'user', content: 'I run a Series A neobank in Jakarta and we want to add AI. Can you help?', ts: new Date(0).toISOString() },
        { role: 'assistant', content: 'I can outline some ideas, but for a real strategy you should talk to a fintech AI expert. Want me to post this to JustNewMe?', ts: new Date(0).toISOString() },
        { role: 'user', content: 'Yes, post it. Budget around $300.', ts: new Date(0).toISOString() },
      ],
    },
    suggestedPriceCents: 30000,
    status: 'open',
    createdAt: new Date(0).toISOString(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
  s.problems.set(problemId, problem);
}
