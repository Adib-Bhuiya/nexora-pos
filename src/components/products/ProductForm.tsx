'use client';

import { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Loader2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { SelectField, TextField } from '@/components/ui/Fields';
import { useToast } from '@/components/ui/Toast';
import { useFormat } from '@/hooks/useFormat';
import { parseNumber } from '@/lib/calc';
import { uploadProductImageApi } from '@/lib/product-api';
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

const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
];
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

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
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Image source mode: 'upload' or 'url'
  const [imageMode, setImageMode] = useState<'upload' | 'url'>('upload');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewBroken, setPreviewBroken] = useState(false);

  useEffect(() => {
    if (!open) return;

    setErrors({});
    setUploadError(null);
    setPreviewBroken(false);

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
      setImageMode(product.imageUrl?.startsWith('http') ? 'url' : 'upload');
    } else {
      setDraft(blank(settings.categories[0] ?? ''));
      setImageUrl('');
      setTone('blue');
      setImageMode('upload');
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

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setUploadError(
        'Invalid file type. Please upload a JPEG, PNG, WebP, GIF, or AVIF image.',
      );
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setUploadError('Image exceeds the maximum allowed size of 5 MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploadError(null);
    setUploading(true);
    try {
      const secureUrl = await uploadProductImageApi(file);
      setImageUrl(secureUrl);
      setPreviewBroken(false);
      notify('Image uploaded successfully.', { tone: 'success' });
    } catch (err) {
      setUploadError(userMessage(err));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleUrlChange = (val: string) => {
    setImageUrl(val);
    setPreviewBroken(false);
    setUploadError(null);
  };

  const handleRemoveImage = () => {
    setImageUrl('');
    setPreviewBroken(false);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
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

    if (uploading) return;

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
      dismissible={!busy && !uploading}
      size="md"
      title={product ? 'Edit product' : 'Add product'}
      description={
        product
          ? 'Changes apply to new sales only. Past receipts keep their original prices.'
          : 'Add an item to your catalog.'
      }
      footer={
        <>
          <Button onClick={onClose} disabled={busy || uploading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            loading={busy}
            disabled={uploading}
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

        <TextField
          label="Display tone"
          value={tone}
          onChange={(event) => setTone(event.target.value)}
          placeholder="e.g. #e0f2fe or blue"
          autoComplete="off"
        />

        {/* Product Image Section: Upload file or URL */}
        <div className="sm:col-span-2 space-y-3 rounded-xl border border-line bg-[#f8fafc] p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-ink">Product Image</span>
            <div className="inline-flex rounded-lg bg-[#edf0f4] p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setImageMode('upload')}
                className={`rounded-md px-2.5 py-1 transition-colors ${
                  imageMode === 'upload'
                    ? 'bg-white text-ink shadow-sm'
                    : 'text-muted hover:text-ink'
                }`}
              >
                Upload File
              </button>
              <button
                type="button"
                onClick={() => setImageMode('url')}
                className={`rounded-md px-2.5 py-1 transition-colors ${
                  imageMode === 'url'
                    ? 'bg-white text-ink shadow-sm'
                    : 'text-muted hover:text-ink'
                }`}
              >
                Image URL
              </button>
            </div>
          </div>

          {imageMode === 'upload' ? (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                onChange={handleFileChange}
                className="hidden"
                disabled={uploading || busy}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || busy}
                className="flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-[#c8d1de] bg-white p-4 text-center transition-colors hover:border-brand hover:bg-brand/5 active:scale-[.99] disabled:opacity-60"
              >
                {uploading ? (
                  <>
                    <Loader2 size={22} className="animate-spin text-brand" />
                    <span className="text-xs font-bold text-brand">
                      Uploading image to Cloudinary...
                    </span>
                  </>
                ) : (
                  <>
                    <Upload size={22} className="text-muted" />
                    <span className="text-xs font-semibold text-ink">
                      Choose an image file to upload
                    </span>
                    <span className="text-[11px] text-muted">
                      JPEG, PNG, WebP, GIF, or AVIF (up to 5 MB)
                    </span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div>
              <TextField
                label="Image URL"
                value={imageUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="https://example.com/product-image.jpg"
                autoComplete="url"
                disabled={uploading || busy}
              />
              <p className="mt-1 text-[11px] text-muted">
                Must be a publicly accessible HTTP or HTTPS link.
              </p>
            </div>
          )}

          {uploadError && (
            <div className="rounded-lg bg-red-50 p-2.5 text-xs font-semibold text-danger">
              {uploadError}
            </div>
          )}

          {imageUrl.trim() && (
            <div className="flex items-center gap-3.5 rounded-lg border border-line bg-white p-2.5">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-line bg-[#f1f5f9]">
                {!previewBroken ? (
                  <img
                    src={imageUrl.trim()}
                    alt="Preview"
                    className="h-full w-full object-cover"
                    onError={() => setPreviewBroken(true)}
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center text-muted">
                    <ImageIcon size={20} />
                    <span className="text-[9px]">Broken URL</span>
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-ink">
                  {imageUrl.startsWith('https://res.cloudinary.com')
                    ? 'Cloudinary Hosted Image'
                    : imageUrl}
                </div>
                <div className="mt-0.5 text-[11px] text-muted">
                  {previewBroken
                    ? 'Unable to load preview from this URL.'
                    : 'Preview loaded successfully.'}
                </div>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleRemoveImage}
                disabled={uploading || busy}
                className="text-danger hover:bg-red-50 hover:border-red-200"
              >
                <X size={13} className="mr-1" /> Remove
              </Button>
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