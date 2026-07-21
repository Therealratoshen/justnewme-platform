// JustNewMe — notifications dispatcher
// Stub for in-app + email delivery. Production: wire to Resend / Postmark
// for email, push notifications via your mobile stack if applicable.

import { Notifications } from './data';
import type { NotificationChannel } from './types';

export async function notify(input: {
  recipientUserId: string;
  recipientWorkerId?: string;
  type: Parameters<typeof Notifications.create>[0]['type'];
  title: string;
  body: string;
  link?: string;
  channels?: NotificationChannel[];
}): Promise<void> {
  const channels: NotificationChannel[] = input.channels ?? ['in_app', 'email'];
  for (const channel of channels) {
    const n = await Notifications.create({
      recipientUserId: input.recipientUserId,
      recipientWorkerId: input.recipientWorkerId,
      channel,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link,
    });
    // TODO: wire to actual delivery (Resend, etc.)
    // For now, mark as sent immediately.
    await Notifications.markSent(n.id);
  }
}
