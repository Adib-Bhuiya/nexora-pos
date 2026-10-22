'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Lock, CheckCircle2, AlertTriangle, ArrowRight, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Fields';
import { BRAND } from '@/config/brand';
import { resetPasswordApi } from '@/lib/auth-api';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tokenParam = searchParams.get('token') || '';

  const [token, setToken] = useState(tokenParam);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveToken = token.trim();

    if (!effectiveToken) {
      setError('A valid reset token is required. Please check the link from your email.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters in length.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please re-enter your password confirmation.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const res = await resetPasswordApi({
        token: effectiveToken,
        password,
        confirmPassword,
      });

      setSuccess(
        res.message ||
          'Password reset successfully. You can now sign in with your new password.'
      );
      setPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(
        err?.message ||
          'Failed to reset password. The link may have expired or already been used.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#f5f7fa] px-4 py-8">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="mb-7 text-center">
          <div className="mx-auto mb-3.5 grid h-14 w-14 place-items-center rounded-2xl bg-brand text-2xl font-black text-white shadow-[0_10px_25px_#2648ab3d]">
            N
          </div>
          <h1 className="text-2xl font-black tracking-tight text-ink">
            {BRAND.name} <span className="text-brand">{BRAND.suffix}</span>
          </h1>
          <p className="mt-1 text-xs font-semibold text-muted">
            Store Owner Security & Account Recovery
          </p>
        </div>

        {/* Card */}
        <div className="overflow-hidden rounded-2xl border border-line bg-white p-7 shadow-[0_12px_40px_#1720330f]">
          {success ? (
            <div className="space-y-5 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 size={26} />
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-ink">Password Updated</h2>
                <p className="mt-1 text-xs text-muted leading-relaxed">
                  Your store owner password has been successfully reset. All previous sessions have been securely revoked.
                </p>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-800 text-left">
                <p className="font-semibold">{success}</p>
              </div>

              <Button
                type="button"
                variant="primary"
                onClick={() => router.push('/')}
                className="w-full py-2.5 font-bold"
              >
                Sign In With New Password <ArrowRight size={15} />
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <div className="flex items-center gap-2 text-brand text-xs font-bold mb-1">
                  <ShieldCheck size={16} /> Verified Recovery
                </div>
                <h2 className="text-lg font-extrabold text-ink">Choose New Password</h2>
                <p className="text-xs text-muted">
                  Create a strong password (minimum 8 characters) for your store owner account.
                </p>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-xs font-semibold text-danger">
                  <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {!tokenParam && (
                <TextField
                  label="Reset Token"
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste token from email link"
                  required
                />
              )}

              <TextField
                label="New Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                required
              />

              <TextField
                label="Confirm New Password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                autoComplete="new-password"
                required
              />

              <Button
                type="submit"
                variant="primary"
                loading={busy}
                className="w-full py-2.5 font-bold"
              >
                <Lock size={15} /> Reset Password
              </Button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => router.push('/')}
                  className="text-xs font-semibold text-muted hover:text-ink"
                >
                  Return to Sign In
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="mt-6 text-center text-[11px] text-muted">
          <div>Built by Adib Bhuiya</div>
          <div className="mt-0.5">
            {BRAND.name} {BRAND.suffix} · Security Recovery
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-[#f5f7fa] text-xs font-semibold text-muted">
          Loading recovery interface...
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
