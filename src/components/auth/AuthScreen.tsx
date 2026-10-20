'use client';

import { useState } from 'react';
import { LogIn, KeyRound, Shield, AlertTriangle, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Fields';
import { useToast } from '@/components/ui/Toast';
import { BRAND } from '@/config/brand';
import { loginOwnerApi, loginPinApi } from '@/lib/auth-api';
import type { User } from '@/types';
import { cn } from '@/lib/cn';

interface AuthScreenProps {
  onLoginSuccess: (user: User) => void;
}

export function AuthScreen({ onLoginSuccess }: AuthScreenProps) {
  const { notify } = useToast();
  const [tab, setTab] = useState<'owner' | 'cashier'>('owner');

  // Owner form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ownerBusy, setOwnerBusy] = useState(false);
  const [ownerError, setOwnerError] = useState<string | null>(null);

  // Cashier form state
  const [cashierId, setCashierId] = useState('');
  const [pin, setPin] = useState('');
  const [cashierBusy, setCashierBusy] = useState(false);
  const [cashierError, setCashierError] = useState<string | null>(null);

  const handleOwnerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setOwnerError('Email and password are required.');
      return;
    }

    setOwnerBusy(true);
    setOwnerError(null);
    try {
      const user = await loginOwnerApi({
        email: email.trim(),
        password,
      });

      notify(`Welcome back, ${user.name}`, { tone: 'success' });
      onLoginSuccess(user);
    } catch (err: any) {
      setOwnerError(err?.message || 'Login failed. Please verify your credentials.');
    } finally {
      setOwnerBusy(false);
    }
  };

  const handleCashierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cashierId.trim()) {
      setCashierError('Cashier / Staff User ID is required.');
      return;
    }
    if (!pin.trim() || !/^\d{4,6}$/.test(pin.trim())) {
      setCashierError('Enter a valid 4 to 6 digit numeric PIN.');
      return;
    }

    setCashierBusy(true);
    setCashierError(null);
    try {
      const user = await loginPinApi({
        userId: cashierId.trim(),
        pin: pin.trim(),
      });

      notify(`Signed in as ${user.name}`, { tone: 'success' });
      onLoginSuccess(user);
    } catch (err: any) {
      setCashierError(err?.message || 'PIN login failed.');
      setPin('');
    } finally {
      setCashierBusy(false);
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
            Authenticate to access the retail register and management tools
          </p>
        </div>

        {/* Card */}
        <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_12px_40px_#1720330f]">
          {/* Segmented Mode Switcher */}
          <div className="grid grid-cols-2 border-b border-line bg-[#f8fafc] p-1.5 text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setTab('owner');
                setOwnerError(null);
              }}
              className={cn(
                'flex items-center justify-center gap-2 rounded-xl py-2.5 transition-all duration-150',
                tab === 'owner'
                  ? 'bg-white text-brand shadow-sm font-extrabold'
                  : 'text-muted hover:text-ink'
              )}
            >
              <Shield size={15} /> Store Owner
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('cashier');
                setCashierError(null);
              }}
              className={cn(
                'flex items-center justify-center gap-2 rounded-xl py-2.5 transition-all duration-150',
                tab === 'cashier'
                  ? 'bg-white text-brand shadow-sm font-extrabold'
                  : 'text-muted hover:text-ink'
              )}
            >
              <KeyRound size={15} /> Cashier PIN
            </button>
          </div>

          <div className="p-6">
            {tab === 'owner' ? (
              <form onSubmit={handleOwnerSubmit} className="space-y-4">
                <div>
                  <h2 className="text-base font-extrabold text-ink">Owner Sign In</h2>
                  <p className="text-xs text-muted">
                    Sign in with your registered store administrator credentials
                  </p>
                </div>

                {ownerError && (
                  <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs font-semibold text-danger">
                    <AlertTriangle size={15} className="shrink-0" />
                    <span>{ownerError}</span>
                  </div>
                )}

                <TextField
                  label="Email address"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="owner@store.com"
                  autoComplete="email"
                  required
                />

                <TextField
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  required
                />

                <Button
                  type="submit"
                  variant="primary"
                  loading={ownerBusy}
                  className="w-full py-2.5 font-bold"
                >
                  <LogIn size={15} /> Sign In as Owner
                </Button>
              </form>
            ) : (
              <form onSubmit={handleCashierSubmit} className="space-y-4">
                <div>
                  <h2 className="text-base font-extrabold text-ink">Cashier Sign In</h2>
                  <p className="text-xs text-muted">
                    Enter your staff user ID and 4 to 6 digit register PIN
                  </p>
                </div>

                {cashierError && (
                  <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs font-semibold text-danger">
                    <AlertTriangle size={15} className="shrink-0" />
                    <span>{cashierError}</span>
                  </div>
                )}

                <TextField
                  label="Staff / Cashier ID"
                  type="text"
                  value={cashierId}
                  onChange={(e) => setCashierId(e.target.value)}
                  placeholder="e.g. u-cashier-1 or user ID"
                  required
                />

                <TextField
                  label="Register PIN"
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="••••••"
                  maxLength={6}
                  required
                />

                <Button
                  type="submit"
                  variant="primary"
                  loading={cashierBusy}
                  className="w-full py-2.5 font-bold"
                >
                  <UserCheck size={15} /> Unlock Register
                </Button>
              </form>
            )}
          </div>
        </div>

        <div className="mt-6 text-center text-[11px] text-muted">
          <div>Built by Adib Bhuiya</div>
          <div className="mt-0.5">
            {BRAND.name} {BRAND.suffix} · v{BRAND.version}
          </div>
        </div>
      </div>
    </div>
  );
}
