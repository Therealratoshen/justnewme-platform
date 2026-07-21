// JustNewMe — quality / QA metrics
// Recomputed whenever a session completes. Drives the worker reputation
// score, which drives matching order, which drives the marketplace flywheel.

import { Workers, Sessions } from './data';
import type { Worker, Session } from './types';

export interface WorkerQualityMetrics {
  rating: number; // 0-5, avg of last 20 rated sessions
  ratingCount: number;
  completedSessions: number;
  responseTimeMinutes: number; // median
  completionRate: number; // 0-1
  disputeRate: number; // 0-1
  repeatClientRate: number; // 0-1
  totalEarningsCents: number;
}

const QUALITY_WINDOW = 20; // last N sessions
const FRESHNESS_DAYS = 90; // only sessions within this window

/**
 * Compute quality metrics for a worker from their session history.
 * Called after every state change (claim, deliver, approve, dispute).
 */
export async function computeWorkerMetrics(workerId: string): Promise<WorkerQualityMetrics> {
  const allSessions = await Sessions.list({ workerId });
  const now = Date.now();
  const cutoff = now - FRESHNESS_DAYS * 24 * 60 * 60 * 1000;

  // Use last N sessions, only those within freshness window
  const recent = allSessions
    .filter((s) => new Date(s.claimedAt).getTime() > cutoff)
    .sort((a, b) => b.claimedAt.localeCompare(a.claimedAt))
    .slice(0, QUALITY_WINDOW);

  if (recent.length === 0) {
    return {
      rating: 0,
      ratingCount: 0,
      completedSessions: 0,
      responseTimeMinutes: 0,
      completionRate: 0,
      disputeRate: 0,
      repeatClientRate: 0,
      totalEarningsCents: 0,
    };
  }

  const rated = recent.filter((s) => s.outcome?.rating);
  const rating = rated.length > 0
    ? rated.reduce((sum, s) => sum + s.outcome!.rating, 0) / rated.length
    : 0;
  const ratingCount = rated.length;

  const completedSessions = recent.filter((s) => s.status === 'approved').length;
  const disputed = recent.filter((s) => s.status === 'disputed').length;
  const total = recent.length;
  const completionRate = completedSessions / total;
  const disputeRate = disputed / total;

  // Repeat client rate: % of users who came back for another session
  const userCounts = new Map<string, number>();
  for (const s of recent) userCounts.set(s.userId, (userCounts.get(s.userId) ?? 0) + 1);
  const repeats = Array.from(userCounts.values()).filter((c) => c > 1).length;
  const repeatClientRate = recent.length > 0 ? repeats / recent.length : 0;

  // Response time: median of first-message lag (created → first worker message)
  // For demo we just use claimedAt → deliveredAt when delivered.
  // Production: read message timestamps.
  const responseTimes = recent
    .filter((s) => s.deliveredAt)
    .map((s) => (new Date(s.deliveredAt!).getTime() - new Date(s.claimedAt).getTime()) / 60_000);
  responseTimes.sort((a, b) => a - b);
  const responseTimeMinutes = responseTimes.length > 0
    ? responseTimes[Math.floor(responseTimes.length / 2)]
    : 0;

  // Total earnings from approved sessions
  const totalEarningsCents = recent
    .filter((s) => s.status === 'approved')
    .reduce((sum, s) => sum + s.workerEarningsCents, 0);

  return {
    rating: round2(rating),
    ratingCount,
    completedSessions,
    responseTimeMinutes: round2(responseTimeMinutes),
    completionRate: round2(completionRate),
    disputeRate: round2(disputeRate),
    repeatClientRate: round2(repeatClientRate),
    totalEarningsCents,
  };
}

/** Round a number to 2 decimal places. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Recompute and persist a worker's metrics. Call after any session event. */
export async function refreshWorkerMetrics(workerId: string): Promise<Worker | null> {
  const metrics = await computeWorkerMetrics(workerId);
  return Workers.update(workerId, metrics);
}

// ---------- Auto-flag rules ----------
// Used by the admin queue to surface workers/sessions that need attention.

export interface QualityFlag {
  workerId: string;
  reason: string;
  severity: 'low' | 'medium' | 'high';
  sessionId?: string;
}

export async function detectQualityFlags(workerId: string): Promise<QualityFlag[]> {
  const worker = await Workers.get(workerId);
  if (!worker) return [];
  const flags: QualityFlag[] = [];

  // 1. Dispute rate over 20%
  if (worker.disputeRate > 0.2 && worker.completedSessions >= 3) {
    flags.push({ workerId, reason: `Dispute rate ${(worker.disputeRate * 100).toFixed(0)}% (over 20%)`, severity: 'high' });
  }

  // 2. Rating below 3.5 with at least 3 ratings
  if (worker.rating < 3.5 && worker.ratingCount >= 3) {
    flags.push({ workerId, reason: `Rating ${worker.rating}/5 (below 3.5)`, severity: 'medium' });
  }

  // 3. Response time over 24 hours
  if (worker.responseTimeMinutes > 60 * 24 && worker.completedSessions >= 3) {
    flags.push({ workerId, reason: `Median response time ${(worker.responseTimeMinutes / 60).toFixed(1)}h`, severity: 'low' });
  }

  // 4. Completion rate under 70% with at least 3 sessions
  if (worker.completionRate < 0.7 && worker.completedSessions >= 3) {
    flags.push({ workerId, reason: `Completion rate ${(worker.completionRate * 100).toFixed(0)}% (under 70%)`, severity: 'high' });
  }

  return flags;
}
