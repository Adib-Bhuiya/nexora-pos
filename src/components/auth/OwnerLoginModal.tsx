'use client';

import { useState } from 'react';
import { LogIn } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Fields';
import { useToast } from '@/components/ui/Toast';
import { loginOwnerApi } from '@/lib/auth-api';
import type { User } from '@/types';

export function OwnerLoginModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: (user: User) => void;
}) {
  const { notify } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const user = await loginOwnerApi({
        email: email.trim(),
        password,
      });

      notify(`Welcome back, ${user.name}`, { tone: 'success' });
      onSuccess(user);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Login failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!busy}
      size="sm"
      title="Store Owner Login"
      description="Sign in with your owner credentials to manage store settings and staff."
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} loading={busy}>
            <LogIn size={15} /> Sign In
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3.5">
        {error && (
          <div className="rounded-lg bg-red-50 p-2.5 text-xs font-semibold text-danger">
            {error}
          </div>
        )}

        <TextField
          label="Owner Email"
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

        <button type="submit" className="hidden" tabIndex={-1} />
      </form>
    </Dialog>
  );
}
