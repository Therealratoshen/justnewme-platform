// GET /api/admin/disputes
// List all open disputes for the admin queue.
//
// POST /api/admin/disputes/:id/resolve
// Resolve a dispute (refund user, release worker, or split).

import { NextRequest } from 'next/server';
import { Sessions, Events } from '@/app/lib/data';
import { requireAdmin } from '@/app/lib/auth';
import { errorResponse, jsonOk, HttpError } from '@/app/lib/http';

export async function GET(_req: NextRequest) {
  try {
    await requireAdmin();
    const all = await Sessions.list();
    const disputes = all
      .filter((s) => s.status === 'disputed')
      .sort((a, b) => (b.dispute?.openedAt ?? '').localeCompare(a.dispute?.openedAt ?? ''));
    return jsonOk({ disputes });
  } catch (err) {
    return errorResponse(err);
  }
}
