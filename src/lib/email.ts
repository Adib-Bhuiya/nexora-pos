import { Resend } from 'resend';

export class EmailConfigurationError extends Error {
  constructor(message = 'Email service is not configured. Missing RESEND_API_KEY or EMAIL_FROM.') {
    super(message);
    this.name = 'EmailConfigurationError';
  }
}

export interface SendPasswordResetEmailInput {
  to: string;
  resetUrl: string;
  ownerName: string;
}

export type EmailSender = (input: SendPasswordResetEmailInput) => Promise<{ id: string }>;

/**
 * Sends a password reset email using Resend.
 * Throws EmailConfigurationError if RESEND_API_KEY or EMAIL_FROM is not configured.
 */
export async function sendPasswordResetEmail(
  input: SendPasswordResetEmailInput
): Promise<{ id: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    throw new EmailConfigurationError();
  }

  const resend = new Resend(apiKey);

  const { data, error } = await resend.emails.send({
    from,
    to: input.to,
    subject: 'Reset your Nexora POS owner password',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #172033; background-color: #f8fafc;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="font-size: 22px; font-weight: 800; margin: 0; color: #172033;">Nexora POS</h1>
          <p style="font-size: 13px; color: #667186; margin-top: 4px;">Store Owner Password Recovery</p>
        </div>
        <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 28px; box-shadow: 0 4px 16px rgba(0,0,0,0.04);">
          <p style="font-size: 15px; margin-top: 0; font-weight: 600;">Hello ${input.ownerName},</p>
          <p style="font-size: 14px; color: #394356; line-height: 1.5;">
            We received a request to reset the password for your Nexora POS primary store owner account. Click the button below to choose a new password:
          </p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${input.resetUrl}" style="background-color: #2853c6; color: #ffffff; padding: 13px 28px; border-radius: 9px; font-size: 14px; font-weight: 700; text-decoration: none; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p style="font-size: 12px; color: #8993a4; line-height: 1.5; margin-bottom: 0;">
            This link is valid for <strong>15 minutes</strong> and can only be used once. If you did not request this password reset, your account is safe and you can ignore this email.
          </p>
          <hr style="border: 0; border-top: 1px solid #edf0f4; margin: 24px 0;" />
          <p style="font-size: 11px; color: #8993a4; word-break: break-all; margin: 0;">
            If the button doesn't work, copy and paste this link into your browser:<br />
            <a href="${input.resetUrl}" style="color: #2853c6;">${input.resetUrl}</a>
          </p>
        </div>
      </div>
    `,
  });

  if (error || !data) {
    throw new Error(error?.message || 'Failed to deliver email through Resend.');
  }

  return { id: data.id };
}
