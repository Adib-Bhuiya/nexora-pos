import { Resend } from 'resend';

export interface SendPasswordResetEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Sends a transactional password reset email to the store owner via the official Resend SDK.
 *
 * Server-only environment variables:
 * - RESEND_API_KEY: Secret API key from https://resend.com/api-keys
 * - EMAIL_FROM: Verified sender email (e.g. "onboarding@resend.dev" for testing or "Nexora POS <security@yourverifieddomain.com>")
 *
 * NOTE: The sender address or domain must be verified in the Resend dashboard before production
 * emails can be delivered to external recipients.
 *
 * NEVER log raw passwords, PINs, secret tokens, or API keys.
 */
export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string
): Promise<SendPasswordResetEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'onboarding@resend.dev';

  if (!apiKey || !apiKey.trim()) {
    console.warn('[Email] RESEND_API_KEY is not configured in server environment.');
    return {
      success: false,
      error: 'Resend API key is not configured on this server.',
    };
  }

  try {
    const resend = new Resend(apiKey.trim());

    const { data, error } = await resend.emails.send({
      from,
      to,
      subject: 'Reset your Nexora POS Owner Password',
      html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Owner Password</title>
</head>
<body style="margin: 0; padding: 32px 16px; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a;">
  <div style="max-width: 520px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 32px; box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.08);">
    <div style="margin-bottom: 24px;">
      <span style="display: inline-block; background-color: #2648ab; color: #ffffff; font-weight: 900; font-size: 14px; letter-spacing: -0.02em; padding: 6px 12px; border-radius: 8px;">NEXORA POS</span>
    </div>
    <h1 style="font-size: 20px; font-weight: 800; color: #0f172a; margin: 0 0 12px; letter-spacing: -0.01em;">Store Owner Password Reset</h1>
    <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 20px;">
      A password reset request was received for the primary owner account associated with this email address. Click the button below to choose a new password:
    </p>
    <div style="text-align: center; margin: 28px 0;">
      <a href="${resetUrl}" style="display: inline-block; background-color: #2648ab; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; padding: 12px 28px; border-radius: 10px; box-shadow: 0 4px 12px rgba(38, 72, 171, 0.35);">
        Reset Password
      </a>
    </div>
    <p style="font-size: 12px; line-height: 1.5; color: #64748b; margin: 0 0 16px;">
      This link is valid for <strong>15 minutes</strong> and can only be used once. If you did not make this request, you can safely ignore this email.
    </p>
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-top: 24px;">
      <p style="font-size: 11px; color: #64748b; margin: 0 0 6px;">Button not working? Copy and paste this URL into your browser:</p>
      <p style="font-size: 11px; color: #2648ab; word-break: break-all; margin: 0;">${resetUrl}</p>
    </div>
  </div>
</body>
</html>
      `.trim(),
    });

    if (error) {
      console.error('[Email] Resend delivery returned error:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown email error';
    console.error('[Email] Unexpected error during email dispatch:', message);
    return { success: false, error: message };
  }
}
