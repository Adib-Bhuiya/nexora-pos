'use client';

import { useState } from 'react';
import { ShieldCheck, KeyRound } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Fields';
import { useToast } from '@/components/ui/Toast';
import { setupOwnerApi } from '@/lib/auth-api';

export function InitialSetupModal({
  open,
  onComplete,
}: {
  open: boolean;
  onComplete: () => void;
}) {
  const { notify } = useToast();
  const [setupKey, setSetupKey] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);

    if (!setupKey.trim()) {
      setError('Server setup key is required.');
      return;
    }
    if (!name.trim()) {
      setError('Owner name is required.');
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('A valid email address is required.');
      return;
    }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password must be at least 8 characters and contain both letters and numbers.');
      return;
    }
    if (pin.trim() && !/^\d{6}$/.test(pin.trim())) {
      setError('If provided, PIN must be exactly 6 digits.');
      return;
    }

    setBusy(true);
    try {
      await setupOwnerApi({
        setupKey: setupKey.trim(),
        name: name.trim(),
        email: email.trim(),
        password,
        pin: pin.trim() || undefined,
      });

      notify('Primary store owner initialized successfully!', { tone: 'success' });
      onComplete();
    } catch (err: any) {
      setError(err?.message || 'Failed to complete initial setup.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => {}}
      dismissible={false}
      size="md"
      title="Initial Store Owner Setup"
      description="No user accounts currently exist in the database. Establish the primary store owner account to activate Nexora POS."
      footer={
        <Button variant="primary" onClick={() => void submit()} loading={busy}>
          <ShieldCheck size={16} /> Complete Setup &amp; Login
        </Button>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-900">
          <p className="font-bold flex items-center gap-1.5">
            <KeyRound size={14} /> Server Setup Key Required
          </p>
          <p className="mt-1 text-muted-dark">
            Enter the <code>OWNER_SETUP_KEY</code> configured on your server environment. Initial setup will be permanently locked once completed.
          </p>
        </div>

        <TextField
          label="Setup Key"
          type="password"
          value={setupKey}
          onChange={(e) => setSetupKey(e.target.value)}
          placeholder="Enter OWNER_SETUP_KEY"
          autoComplete="off"
          required
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Owner Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sarah Jenkins"
            autoComplete="name"
            required
          />

          <TextField
            label="Owner Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="owner@store.com"
            autoComplete="email"
            required
          />
        </div>

        <TextField
          label="Password (min 8 chars, letters & numbers)"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••••••"
          autoComplete="new-password"
          required
        />

        <TextField
          label="Optional 6-Digit POS PIN"
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="6 digits for quick login"
          autoComplete="off"
          hint="Allows fast cashier-mode login at the register."
        />

        <button type="submit" className="hidden" tabIndex={-1} />
      </form>
    </Dialog>
  );
}
