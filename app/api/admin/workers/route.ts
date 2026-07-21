// GET /api/admin/workers
// PATCH /api/admin/workers/:id (suspend/ban)

import { NextRequest } from 'next/server';
import { Workers } from '@/app/lib/data';
import { detectQualityFlags } from '@/app/lib/quality';
import { requireAdmin } from '@/app/lib/auth';
import { errorResponse, jsonOk } from '@/app/lib/http';
import type { WorkerStatus } from '@/app/lib/types';

export async function GET(_req: NextRequest) {
  try {
    await requireAdmin();
    const all = await Workers.list();
    const withFlags = await Promise.all(
      all.map(async (w) => ({
        ...w,
        flags: await detectQualityFlags(w.id),
      })),
    );
    return jsonOk({ workers: withFlags });
  } catch (err) {
    return errorResponse(err);
  }
}
