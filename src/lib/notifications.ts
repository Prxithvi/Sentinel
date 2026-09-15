import { db } from './db';

export interface NotificationInput {
  caseId: string;
  channel: 'email' | 'webhook';
  recipient: string;
  subject: string;
  body: string;
}

export async function sendNotification(input: NotificationInput): Promise<{ sent: boolean; error?: string }> {
  try {
    // Email — in demo we log to DB only; in production this would call SMTP/Resend
    if (input.channel === 'email') {
      console.log(`[email → ${input.recipient}] ${input.subject}`);
    } else {
      // Webhook — POST to Slack/Discord incoming webhook URL
      // In demo, just log
      console.log(`[webhook → ${input.recipient}] ${input.subject}`);
    }
    await db.notificationLog.create({
      data: {
        caseId: input.caseId,
        channel: input.channel,
        recipient: input.recipient,
        subject: input.subject,
        body: input.body,
        status: 'sent',
      },
    });
    return { sent: true };
  } catch (e) {
    console.error('[notification] error:', e);
    await db.notificationLog.create({
      data: {
        caseId: input.caseId,
        channel: input.channel,
        recipient: input.recipient,
        subject: input.subject,
        body: input.body,
        status: 'failed',
      },
    });
    return { sent: false, error: String(e) };
  }
}
