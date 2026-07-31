/**
 * Email sending infrastructure using nodemailer.
 * Lazy initialization to avoid edge runtime issues.
 */
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { smtpConfig, isEmailConfigured } from './notification-config';
import { getDb, getDueEmails, markEmailSent, markEmailFailed } from './db-users';

let _transporter: Transporter | null = null;

export function getTransporter(): Transporter | null {
  if (!isEmailConfigured()) return null;
  if (_transporter) return _transporter;

  _transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: {
      user: smtpConfig.user,
      pass: smtpConfig.pass,
    },
  });

  return _transporter;
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<{ success: boolean; error?: string }> {
  const transporter = getTransporter();
  if (!transporter) {
    return { success: false, error: 'Email not configured' };
  }

  try {
    await transporter.sendMail({
      from: smtpConfig.from,
      to,
      subject,
      html,
    });
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

export function getUserEmail(userId: string): string | null {
  const db = getDb();
  const user = db.prepare('SELECT email FROM users WHERE id = ?').get(userId) as { email: string } | undefined;
  return user?.email || null;
}

export async function processEmailQueue(): Promise<{ sent: number; failed: number }> {
  const emails = getDueEmails();
  if (emails.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;

  for (const email of emails) {
    const recipient = getUserEmail(email.user_id);
    if (!recipient) {
      // User has no email — skip silently
      continue;
    }
    const result = await sendEmail(recipient, email.subject, email.body_html);
    if (result.success) {
      markEmailSent(email.id);
      sent++;
    } else {
      markEmailFailed(email.id, result.error || 'Unknown error');
      failed++;
    }
  }

  return { sent, failed };
}
