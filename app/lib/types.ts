// JustNewMe — core domain types
// All entities the marketplace operates on.

export type ISODateString = string;

// ---------- Users ----------

export type UserRole = 'end_user' | 'worker' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: ISODateString;
  // For end users: their AI agent context (which model, what they were doing)
  agentContext?: { source: 'claude' | 'cursor' | 'chatgpt' | 'other'; sessionId?: string };
  // For workers: their worker profile reference
  workerId?: string;
}

// ---------- Workers ----------

export type WorkerStatus = 'pending_verification' | 'active' | 'suspended' | 'banned';

export interface Worker {
  id: string;
  userId: string; // links to User
  displayName: string;
  headline: string;
  bio: string;
  skills: string[]; // ['ai_strategy', 'fintech', 'agentic_ai', ...]
  categories: string[]; // ['strategy', 'dev', 'design', ...]
  hourlyRate: number; // USD/hr
  currency: 'USD';
  city?: string;
  country?: string;
  timezone?: string;
  portfolioUrl?: string; // e.g., filberthenrico.my.id
  status: WorkerStatus;
  // Stripe Connect
  stripeAccountId?: string;
  stripeOnboardingComplete: boolean;
  // Quality metrics (computed)
  rating: number; // 0-5, avg of last 20
  ratingCount: number;
  completedSessions: number;
  responseTimeMinutes: number; // median
  completionRate: number; // 0-1
  disputeRate: number; // 0-1
  repeatClientRate: number; // 0-1
  totalEarningsCents: number;
  createdAt: ISODateString;
  verifiedAt?: ISODateString;
}

// ---------- Problems ----------

export type ProblemStatus = 'open' | 'claimed' | 'in_progress' | 'delivered' | 'completed' | 'cancelled' | 'disputed';

export interface Problem {
  id: string;
  postedByUserId: string;
  title: string;
  description: string;
  category: string; // 'strategy', 'dev', 'design', 'legal', 'marketing', 'other'
  skillsNeeded: string[];
  budgetCents: number; // min in cents
  budgetMaxCents?: number; // optional range max
  urgency: 'low' | 'normal' | 'high' | 'urgent';
  // Context from the AI agent (the chat transcript)
  aiAgentContext?: {
    source: 'claude' | 'cursor' | 'chatgpt' | 'other';
    sessionId?: string;
    chatTranscript?: Array<{ role: 'user' | 'assistant'; content: string; ts: ISODateString }>;
    suggestedCategory?: string;
  };
  // Suggested price from the platform
  suggestedPriceCents?: number;
  // Lifecycle
  status: ProblemStatus;
  claimedByWorkerId?: string;
  sessionId?: string;
  createdAt: ISODateString;
  expiresAt: ISODateString; // problems auto-expire after 30 days
}

// ---------- Sessions ----------

export type SessionStatus = 'pending_payment' | 'in_progress' | 'delivered' | 'approved' | 'disputed' | 'refunded' | 'cancelled';

export interface Session {
  id: string;
  problemId: string;
  userId: string; // end user
  workerId: string;
  // Payment
  amountCents: number;
  platformFeeCents: number;
  workerEarningsCents: number;
  currency: 'USD';
  // Stripe
  stripePaymentIntentId?: string;
  paymentStatus: 'pending' | 'authorized' | 'captured' | 'refunded' | 'failed';
  // Lifecycle
  status: SessionStatus;
  claimedAt: ISODateString;
  deliveredAt?: ISODateString;
  approvedAt?: ISODateString;
  // Auto-release
  autoReleaseAt?: ISODateString; // 7 days after delivery if no action
  // Deliverable
  deliverable?: {
    type: 'document' | 'link' | 'message' | 'call_summary';
    content: string;
    files?: Array<{ name: string; url: string; sizeBytes: number }>;
    submittedAt: ISODateString;
  };
  // Outcome
  outcome?: {
    rating: 1 | 2 | 3 | 4 | 5;
    comment?: string;
    ratedAt: ISODateString;
  };
  // Dispute
  dispute?: {
    reason: string;
    openedBy: 'user' | 'worker';
    openedAt: ISODateString;
    status: 'open' | 'mediating' | 'resolved';
    resolution?: 'refund_user' | 'release_worker' | 'split' | 'in_progress';
  };
}

// ---------- Messages ----------

export interface Message {
  id: string;
  sessionId: string;
  fromUserId: string;
  fromRole: 'user' | 'worker' | 'system';
  content: string;
  attachments?: Array<{ name: string; url: string; sizeBytes: number }>;
  createdAt: ISODateString;
  readAt?: ISODateString;
}

// ---------- Quality events (audit log) ----------

export type QualityEventType =
  | 'worker_claimed'
  | 'session_started'
  | 'message_sent'
  | 'deliverable_submitted'
  | 'session_approved'
  | 'session_disputed'
  | 'dispute_resolved'
  | 'auto_released'
  | 'refund_issued'
  | 'worker_suspended'
  | 'worker_banned'
  | 'user_banned';

export interface QualityEvent {
  id: string;
  type: QualityEventType;
  sessionId?: string;
  problemId?: string;
  workerId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  createdAt: ISODateString;
}

// ---------- Notifications ----------

export type NotificationChannel = 'in_app' | 'email' | 'webhook';
export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'read';

export interface Notification {
  id: string;
  recipientUserId: string;
  recipientWorkerId?: string;
  channel: NotificationChannel;
  type: 'problem_match' | 'session_claimed' | 'message_received' | 'deliverable_ready' | 'auto_release_warning' | 'dispute_opened' | 'payout_sent';
  title: string;
  body: string;
  link?: string;
  status: NotificationStatus;
  createdAt: ISODateString;
  sentAt?: ISODateString;
  readAt?: ISODateString;
}

// ---------- API helpers ----------

export interface ApiError {
  error: { type: string; code: string; message: string; param?: string };
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}
