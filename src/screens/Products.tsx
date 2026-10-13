'use client';

import { useMemo, useState } from 'react';
import { Package, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { ProductFormDialog } from '@/components/products/ProductForm';
import { Button } from '@/components/ui/Button';
import { Card, EmptyState, PageHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Input, Select } from '@/components/ui/Fields';
import { ProductThumb, StockPill, TableWrap, Td, Th } from '@/components/ui/Bits';
import { useToast } from '@/components/ui/Toast';
import { useFormat } from '@/hooks/useFormat';
import { stockStatus } from '@/lib/calc';
import { useStore, userMessage } from '@/store/StoreProvider';
import type { Product, StockStatus } from '@/types';

export default function Products() {
  const { products, settings, can, actions } = useStore();
  const f = useFormat();
  const { notify } = useToast();
  const canWrite = can('products:write');
  const showCost = can('costs:view');

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState<'all' | StockStatus>('all');
  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);

  const categories = useMemo(() => [...new Set([...settings.categories, ...products.map((p) => p.category)])], [settings.categories, products]);
  const q = query.trim().toLowerCase();
  const rows = products.filter(
    (p) =>
      (category === 'all' || p.category === category) &&
      (status === 'all' || stockStatus(p.stock, settings.lowStockThreshold) === status) &&
      (!q || [p.name, p.sku, p.barcode, p.category].some((v) => v.toLowerCase().includes(q))),
  );
  const filtered = q !== '' || category !== 'all' || status !== 'all';

  const openForm = (p: Product | null) => {
    setEditing(p);
    setFormOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await actions.deleteProduct(deleting.id);
      notify(`${deleting.name} deleted. Past sales keep their history.`, { tone: 'success' });
      setDeleting(null);
    } catch (e) {
      notify(userMessage(e), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="CATALOG"
        title="Products"
        sub={`${products.length} product${products.length === 1 ? '' : 's'}${canWrite ? '' : ' · view only for your role'}`}
        actions={canWrite && <Button variant="primary" onClick={() => openForm(null)}><Plus size={14} aria-hidden /> Add product</Button>}
      />

      <Card className="overflow-hidden">
        <div className="flex gap-2.5 p-3.5 max-md:flex-col md:p-[19px]">
          <div className="relative flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9aa3b2]" aria-hidden />
            <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, SKU, barcode…" aria-label="Search products" className="pl-9" />
          </div>
          <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category" className="md:max-w-[190px]">
            <option value="all">All categories</option>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value as 'all' | StockStatus)} aria-label="Filter by stock status" className="md:max-w-[170px]">
            <option value="all">Any stock level</option>
            <option value="good">In stock</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </Select>
        </div>

        {rows.length === 0 ? (
          products.length === 0 ? (
            <EmptyState icon={<Package size={20} />} title="No products yet" text={canWrite ? 'Add your first product to start selling.' : 'An administrator needs to add products.'} action={canWrite && <Button variant="primary" onClick={() => openForm(null)}><Plus size={14} /> Add product</Button>} />
          ) : (
            <EmptyState icon={<Search size={20} />} title="No products match" text="Try a different search or filter." action={filtered && <Button onClick={() => { setQuery(''); setCategory('all'); setStatus('all'); }}>Clear filters</Button>} />
          )
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th>SKU</Th>
                <Th>Category</Th>
                <Th align="right">Price</Th>
                {showCost && <Th align="right">Cost</Th>}
                <Th align="right">Stock</Th>
                <Th>Status</Th>
                {canWrite && <Th align="right"><span className="sr-only">Actions</span></Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="transition-colors duration-100 hover:bg-[#fafbfd]">
                  <Td>
                    <div className="flex items-center gap-3">
                      <ProductThumb emoji={p.emoji} tone={p.tone} />
                      <div>
                        <div className="font-bold text-ink">{p.name}</div>
                        {p.barcode && <div className="font-mono text-[10px] text-muted">{p.barcode}</div>}
                      </div>
                    </div>
                  </Td>
                  <Td>{p.sku}</Td>
                  <Td>{p.category}</Td>
                  <Td align="right" className="font-bold text-ink">{f.money(p.price)}</Td>
                  {showCost && <Td align="right">{f.money(p.cost)}</Td>}
                  <Td align="right" className="font-bold text-ink">{p.stock}</Td>
                  <Td><StockPill status={stockStatus(p.stock, settings.lowStockThreshold)} /></Td>
                  {canWrite && (
                    <Td align="right">
                      <div className="inline-flex gap-1.5">
                        <Button size="icon" variant="ghost" aria-label={`Edit ${p.name}`} onClick={() => openForm(p)}><Pencil size={15} /></Button>
                        <Button size="icon" variant="ghost" aria-label={`Delete ${p.name}`} onClick={() => setDeleting(p)} className="hover:!text-danger"><Trash2 size={15} /></Button>
                      </div>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <ProductFormDialog open={formOpen} product={editing} onClose={() => setFormOpen(false)} />
      <ConfirmDialog
        open={!!deleting}
        title="Delete product?"
        tone="danger"
        confirmLabel="Delete product"
        busy={busy}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        message={<>“{deleting?.name}” will be removed from the catalog. Past sales and stock history keep their record of it. This can’t be undone.</>}
      />
    </>
  );
}
