'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { SelectField, TextField } from '@/components/ui/Fields';
import { useToast } from '@/components/ui/Toast';
import { useFormat } from '@/hooks/useFormat';
import { parseNumber } from '@/lib/calc';
import { validateProductDraft, type Errors, type ProductDraft } from '@/lib/validation';
import { useStore, userMessage } from '@/store/StoreProvider';
import type { Product } from '@/types';

const blank = (category: string): ProductDraft => ({
  name: '',
  sku: '',
  barcode: '',
  category,
  price: '',
  cost: '',
  stock: '0',
});

export function ProductFormDialog({
  open,
  product,
  onClose,
}: {
  open: boolean;
  product: Product | null;
  onClose: () => void;
}) {
  const { products, settings, actions } = useStore();
  const { notify } = useToast();
  const f = useFormat();

  const categories = [
    ...new Set([
      ...settings.categories,
      ...(product ? [product.category] : []),
    ]),
  ];

  const [draft, setDraft] = useState<ProductDraft>(
    blank(categories[0] ?? ''),
  );
  const [imageUrl, setImageUrl] = useState('');
  const [tone, setTone] = useState('blue');
  const [errors, setErrors] = useState<Errors<keyof ProductDraft>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;

    setErrors({});

    if (product) {
      setDraft({
        name: product.name,
        sku: product.sku,
        barcode: product.barcode,
        category: product.category,
        price: String(product.price),
        cost: String(product.cost),
        stock: String(product.stock),
      });

      setImageUrl(product.imageUrl ?? '');
      setTone(product.tone || 'blue');
    } else {
      setDraft(blank(settings.categories[0] ?? ''));
      setImageUrl('');
      setTone('blue');
    }
  }, [open, product, settings.categories]);

  const set = (key: keyof ProductDraft) =>
    (event: { target: { value: string } }) => {
      setDraft((current) => ({
        ...current,
        [key]: event.target.value,
      }));

      if (errors[key]) {
        setErrors((current) => ({
          ...current,
          [key]: undefined,
        }));
      }
    };

  const price = parseNumber(draft.price);
  const cost = parseNumber(draft.cost);

  const margin =
    Number.isFinite(price) &&
    Number.isFinite(cost) &&
    price > 0
      ? Math.round(((price - cost) / price) * 100)
      : null;

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();

    const { errors: validationErrors, value } =
      validateProductDraft(draft, products, product?.id);

    setErrors(validationErrors);

    if (!value) return;

    setBusy(true);

    try {
      const input = {
        ...value,
        imageUrl: imageUrl.trim(),
        tone,
      };

      if (product) {
        await actions.updateProduct(product.id, input);
      } else {
        await actions.createProduct(input);
      }

      notify(
        product
          ? `${value.name} updated.`
          : `${value.name} added.`,
        { tone: 'success' },
      );

      onClose();
    } catch (error) {
      notify(userMessage(error), { tone: 'error' });
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
      description={
        product
          ? 'Changes apply to new sales only. Past receipts keep their original prices.'
          : 'Add an item to your catalog.'
      }
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            loading={busy}
          >
            {product ? 'Save changes' : 'Add product'}
          </Button>
        </>
      }
    >
      <form
        onSubmit={submit}
        noValidate
        className="grid gap-x-3.5 gap-y-4 sm:grid-cols-2"
      >
        <TextField
          className="sm:col-span-2"
          label="Product name"
          value={draft.name}
          onChange={set('name')}
          error={errors.name}
          placeholder="e.g. Premium Rice 1kg"
          autoComplete="off"
        />

        <TextField
          label="SKU"
          value={draft.sku}
          onChange={set('sku')}
          error={errors.sku}
          placeholder="GR-1001"
          autoComplete="off"
        />

        <TextField
          label="Barcode (optional)"
          value={draft.barcode}
          onChange={set('barcode')}
          error={errors.barcode}
          inputMode="numeric"
          placeholder="Scan or type"
          autoComplete="off"
        />

        <SelectField
          label="Category"
          value={draft.category}
          onChange={set('category')}
          error={errors.category}
        >
          {categories.map((category) => (
            <option key={category}>{category}</option>
          ))}
        </SelectField>

        <TextField
          label={product ? 'Stock on hand' : 'Opening stock'}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={draft.stock}
          onChange={set('stock')}
          error={errors.stock}
          hint={
            product
              ? 'Changing this records a stock adjustment.'
              : undefined
          }
        />

        <TextField
          label={`Selling price (${f.symbol})`}
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={draft.price}
          onChange={set('price')}
          error={errors.price}
        />

        <TextField
          label={`Unit cost (${f.symbol})`}
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={draft.cost}
          onChange={set('cost')}
          error={errors.cost}
          hint={
            margin === null
              ? undefined
              : margin < 0
                ? `Selling below cost (${margin}% margin).`
                : `Margin ${margin}%`
          }
        />

        <div className="sm:col-span-2">
          <TextField
            label="Product image URL (optional)"
            value={imageUrl}
            onChange={(event) => setImageUrl(event.target.value)}
            placeholder="https://example.com/product-image.jpg"
            autoComplete="url"
          />

          <TextField
            label="Display tone"
            value={tone}
            onChange={(event) => setTone(event.target.value)}
            placeholder="blue"
            autoComplete="off"
          />

          {imageUrl.trim() && (
            <div className="mt-3">
              <p className="mb-2 text-xs text-muted">Image preview</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl.trim()}
                alt="Product preview"
                className="h-24 w-24 rounded-lg border border-line object-cover"
              />
            </div>
          )}
        </div>

        <button
          type="submit"
          className="hidden"
          aria-hidden
          tabIndex={-1}
        />
      </form>
    </Dialog>
  );
}