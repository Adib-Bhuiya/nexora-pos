'use client';

import { useState, useEffect } from 'react';
import { Delete, AlertTriangle } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { loginPinApi } from '@/lib/auth-api';
import type { User } from '@/types';
import { cn } from '@/lib/cn';

export function PinKeypadModal({
  open,
  cashier,
  onClose,
  onSuccess,
}: {
  open: boolean;
  cashier: User | null;
  onClose: () => void;
  onSuccess: (user: User) => void;
}) {
  const { notify } = useToast();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPin('');
      setError(null);
    }
  }, [open, cashier]);

  const handleDigit = (digit: string) => {
    if (busy || pin.length >= 6) return;
    setError(null);
    const nextPin = pin + digit;
    setPin(nextPin);

    if (nextPin.length === 6) {
      void submitPin(nextPin);
    }
  };

  const handleBackspace = () => {
    if (busy) return;
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  };

  const handleClear = () => {
    if (busy) return;
    setPin('');
    setError(null);
  };

  const submitPin = async (codeToSubmit: string) => {
    if (!cashier) return;
    setBusy(true);
    setError(null);

    try {
      const authenticatedUser = await loginPinApi({
        userId: cashier.id,
        pin: codeToSubmit,
      });

      notify(`Signed in as ${authenticatedUser.name}`, { tone: 'success' });
      onSuccess(authenticatedUser);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Invalid PIN.');
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  // Keyboard support for desktop registers
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, pin, busy]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!busy}
      size="sm"
      title={`Cashier Sign-In: ${cashier?.name ?? ''}`}
      description="Enter your 6-digit numeric PIN to unlock this register."
      footer={
        <Button onClick={onClose} disabled={busy} className="w-full">
          Cancel
        </Button>
      }
    >
      <div className="flex flex-col items-center py-2">
        {/* 6 Digit Indicators */}
        <div className="mb-4 flex items-center justify-center gap-3">
          {[0, 1, 2, 3, 4, 5].map((index) => {
            const isFilled = pin.length > index;
            return (
              <div
                key={index}
                className={cn(
                  'h-4 w-4 rounded-full border-2 transition-all duration-150',
                  isFilled
                    ? 'border-brand bg-brand scale-110'
                    : 'border-line bg-surface'
                )}
              />
            );
          })}
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-danger">
            <AlertTriangle size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 10-Key Keypad */}
        <div className="grid w-full max-w-[260px] grid-cols-3 gap-2.5">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              disabled={busy}
              onClick={() => handleDigit(digit)}
              className="h-14 rounded-2xl border border-line bg-surface text-xl font-extrabold text-ink shadow-sm transition-all duration-100 hover:bg-[#f6f8fb] active:scale-95 disabled:opacity-50"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            disabled={busy || pin.length === 0}
            onClick={handleClear}
            className="h-14 rounded-2xl border border-line bg-surface text-xs font-bold text-muted transition-all duration-100 hover:bg-[#f6f8fb] active:scale-95 disabled:opacity-30"
          >
            Clear
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => handleDigit('0')}
            className="h-14 rounded-2xl border border-line bg-surface text-xl font-extrabold text-ink shadow-sm transition-all duration-100 hover:bg-[#f6f8fb] active:scale-95 disabled:opacity-50"
          >
            0
          </button>
          <button
            type="button"
            disabled={busy || pin.length === 0}
            onClick={handleBackspace}
            aria-label="Backspace"
            className="flex h-14 items-center justify-center rounded-2xl border border-line bg-surface text-muted transition-all duration-100 hover:bg-[#f6f8fb] active:scale-95 disabled:opacity-30"
          >
            <Delete size={20} />
          </button>
        </div>
      </div>
    </Dialog>
  );
}
