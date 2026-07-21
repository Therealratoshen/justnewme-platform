// JustNewMe — auth helpers
// Demo-grade cookie-based session auth. Production should use real auth
// (Clerk, Supabase, NextAuth, or roll-your-own with bcrypt + JWT).

import { cookies } from 'next/headers';
import { Users, Workers } from './data';
import type { User, Worker } from './types';

const COOKIE_NAME = 'jnm_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export interface Session {
  user: User;
  worker: Worker | null;
}

/**
 * Get the current session from the cookie. Returns null if not signed in.
 *
 * In demo mode, the cookie just holds a userId directly. Production should
 * sign this with AUTH_SECRET and add an expiry.
 */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const userId = store.get(COOKIE_NAME)?.value;
  if (!userId) return null;
  const user = await Users.get(userId);
  if (!user) return null;
  // Look up the worker either via the explicit workerId on the user record
  // or by the userId index on the worker table. The latter is the source of
  // truth — the seed data only creates the worker side.
  const worker = (user.workerId && (await Workers.get(user.workerId))) ||
    (await Workers.getByUserId(user.id));
  return { user, worker };
}

/** Sign in by email — creates the user if it doesn't exist (demo only). */
export async function signInDemo(email: string, name?: string): Promise<User> {
  let user = await Users.getByEmail(email);
  if (!user) {
    user = await Users.create({
      email,
      name: name || email.split('@')[0],
      role: 'end_user',
    });
  }
  const store = await cookies();
  store.set(COOKIE_NAME, user.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
  return user;
}

/** Sign out — clears the cookie. */
export async function signOut() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** For API routes — throws if not authenticated. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    const err: any = new Error('Authentication required');
    err.status = 401;
    err.code = 'unauthenticated';
    throw err;
  }
  return session;
}

/** For API routes — throws if not a worker. */
export async function requireWorker(): Promise<Session> {
  const session = await requireSession();
  if (!session.worker) {
    const err: any = new Error('Worker account required');
    err.status = 403;
    err.code = 'not_a_worker';
    throw err;
  }
  return session;
}

/** For API routes — throws if not an admin. */
export async function requireAdmin(): Promise<Session> {
  const session = await requireSession();
  if (session.user.role !== 'admin') {
    const err: any = new Error('Admin required');
    err.status = 403;
    err.code = 'not_admin';
    throw err;
  }
  return session;
}
