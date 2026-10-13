'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { SelectField, TextField } from '@/components/ui/Fields';
import { useToast } from '@/components/ui/Toast';
import { DEFAULT_EMOJI, EMOJI_PRESETS } from '@/config/constants';
import { useFormat } from '@/hooks/useFormat';
import { parseNumber } from '@/lib/calc';
import { cn } from '@/lib/cn';
import { validateProductDraft, type Errors, type ProductDraft } from '@/lib/validation';
import { useStore, userMessage } from '@/store/StoreProvider';
import type { Product } from '@/types';

const blank = (category: string): ProductDraft => ({ name: '', sku: '', barcode: '', category, price: '', cost: '', stock: '0' });

export function ProductFormDialog({ open, product, onClose }: { open: boolean; product: Product | null; onClose: () => void }) {
  const { products, settings, actions } = useStore();
  const { notify } = useToast();
  const f = useFormat();
  const categories = [...new Set([...settings.categories, ...(product ? [product.category] : [])])];
  const [draft, setDraft] = useState<ProductDraft>(blank(categories[0] ?? ''));
  const [emoji, setEmoji] = useState(DEFAULT_EMOJI);
  const [errors, setErrors] = useState<Errors<keyof ProductDraft>>({});
  const [busy, setBusy] = useState(false);

  // Reset whenever the dialog opens for a different product.
  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (product) {
      setDraft({ name: product.name, sku: product.sku, barcode: product.barcode, category: product.category, price: String(product.price), cost: String(product.cost), stock: String(product.stock) });
      setEmoji(EMOJI_PRESETS.find((e) => e.emoji === product.emoji) ?? { emoji: product.emoji, tone: product.tone });
    } else {
      setDraft(blank(settings.categories[0] ?? ''));
      setEmoji(DEFAULT_EMOJI);
    }
  }, [open, product]);

  const set = (k: keyof ProductDraft) => (e: { target: { value: string } }) => {
    setDraft((d) => ({ ...d, [k]: e.target.value }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }));
  };

  const price = parseNumber(draft.price);
  const cost = parseNumber(draft.cost);
  const margin = Number.isFinite(price) && Number.isFinite(cost) && price > 0 ? Math.round(((price - cost) / price) * 100) : null;

  const submit = async (ev?: React.FormEvent) => {
    ev?.preventDefault();
    const { errors: errs, value } = validateProductDraft(draft, products, product?.id);
    setErrors(errs);
    if (!value) return;
    setBusy(true);
    try {
      const input = { ...value, emoji: emoji.emoji, tone: emoji.tone };
      if (product) await actions.updateProduct(product.id, input);
      else await actions.createProduct(input);
      notify(product ? `${value.name} updated.` : `${value.name} added.`, { tone: 'success' });
      onClose();
    } catch (e) {
      notify(userMessage(e), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!busy}
      size="md"
      title={product ? 'Edit product' : 'Add product'}
      description={product ? 'Changes apply to new sales only. Past receipts keep their original prices.' : 'Add an item to your catalog.'}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={() => void submit()} loading={busy}>{product ? 'Save changes' : 'Add product'}</Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="grid gap-x-3.5 gap-y-4 sm:grid-cols-2">
        <TextField className="sm:col-span-2" label="Product name" value={draft.name} onChange={set('name')} error={errors.name} placeholder="e.g. Premium Rice 1kg" autoComplete="off" />
        <TextField label="SKU" value={draft.sku} onChange={set('sku')} error={errors.sku} placeholder="GR-1001" autoComplete="off" />
        <TextField label="Barcode (optional)" value={draft.barcode} onChange={set('barcode')} error={errors.barcode} inputMode="numeric" placeholder="Scan or type" autoComplete="off" />
        <SelectField label="Category" value={draft.category} onChange={set('category')} error={errors.category}>
          {categories.map((c) => <option key={c}>{c}</option>)}
        </SelectField>
        <TextField label={product ? 'Stock on hand' : 'Opening stock'} type="number" inputMode="numeric" min={0} step={1} value={draft.stock} onChange={set('stock')} error={errors.stock} hint={product ? 'Changing this records a stock adjustment.' : undefined} />
        <TextField label={`Selling price (${f.symbol})`} type="number" inputMode="decimal" min={0} step="any" value={draft.price} onChange={set('price')} error={errors.price} />
        <TextField
          label={`Unit cost (${f.symbol})`}
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={draft.cost}
          onChange={set('cost')}
          error={errors.cost}
          hint={margin === null ? undefined : margin < 0 ? `Selling below cost (${margin}% margin).` : `Margin ${margin}%`}
        />
        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-xs font-semibold text-muted">Icon</legend>
          <div className="flex flex-wrap gap-1.5">
            {EMOJI_PRESETS.map((e) => (
              <button key={e.emoji} type="button" aria-label={`Use ${e.emoji}`} aria-pressed={e.emoji === emoji.emoji} onClick={() => setEmoji(e)} className={cn('grid h-10 w-10 place-items-center rounded-[10px] border text-[20px] transition-transform duration-100 active:scale-90', e.emoji === emoji.emoji ? 'border-brand ring-2 ring-brand/25' : 'border-line')} style={{ background: e.tone }}>
                {e.emoji}
              </button>
            ))}
          </div>
        </fieldset>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}
