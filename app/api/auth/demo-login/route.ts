// POST /api/auth/demo-login
// Demo-only auth. In production: real auth with bcrypt, sessions, etc.
//
// Body: { email, name?, role?: 'end_user' | 'worker' | 'admin' }

import { NextRequest } from 'next/server';
import { Users, Workers } from '@/app/lib/data';
import { signInDemo } from '@/app/lib/auth';
import { errorResponse, jsonOk } from '@/app/lib/http';
import { seedDevData } from '@/app/lib/data';

export async function POST(req: NextRequest) {
  try {
    await seedDevData();
    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? '').trim();
    const name = body.name ? String(body.name) : undefined;
    const role = body.role ?? 'end_user';

    if (!email) {
      // Default: log in as Filbert (the founding worker) for the demo.
      // Use the deterministic ID so cross-container requests on serverless
      // resolve to the same worker.
      const filbertEmail = 'filbert@filberthenrico.my.id';
      const filbert = (await Users.list()).find((u) => u.email === filbertEmail);
      if (!filbert) {
        return errorResponse(new Error('Seed data missing — POST a problem first.'));
      }
      const user = await signInDemo(filbert.email, filbert.name);
      return jsonOk({ user, worker: await Workers.getByUserId(user.id) });
    }

    let user = await Users.getByEmail(email);
    if (!user) {
      user = await Users.create({ email, name: name ?? email.split('@')[0], role });
    }
    if (user.role !== role && role !== 'end_user') {
      // Promote to requested role for the demo
      user = await Users.update(user.id, { role });
    }
    if (!user) throw new Error('Failed to create user');
    // For the admin, the seed user has a fixed id; we sign in by email and
    // the cookie holds that fixed id. Container-to-container requests resolve
    // because the seed recreates the same id.
    const signed = await signInDemo(user.email, user.name);
    return jsonOk({ user: signed, worker: await Workers.getByUserId(signed.id) });
  } catch (err) {
    return errorResponse(err);
  }
}
