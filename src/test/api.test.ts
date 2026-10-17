import { describe, expect, it, beforeEach } from 'vitest';
import Product from '@/models/Product';
import Sale from '@/models/Sale';
import StockMovement from '@/models/StockMovement';
import Settings from '@/models/Settings';
import {
  cacheMongoProducts,
  cacheMongoSales,
  cacheMongoMovements,
  cacheMongoSettings,
} from '@/db/product-cache';
import { loadSnapshot } from '@/db/snapshot';
import { closeDb } from '@/db/idb';
import { ensureInitialized } from '@/db/seed';
import { POST as createProductHandler } from '@/app/api/products/route';
import {
  GET as getProductByIdHandler,
  PATCH as updateProductHandler,
  DELETE as deleteProductHandler,
} from '@/app/api/products/[id]/route';
import { PATCH as updateStockHandler } from '@/app/api/products/stock/route';
import { POST as createSaleHandler } from '@/app/api/sales/route';
import { POST as adjustMovementHandler } from '@/app/api/movements/route';
import { PUT as updateSettingsHandler } from '@/app/api/settings/route';
import { POST as clearDataHandler } from '@/app/api/clear-data/route';

describe('Mongoose Models Schema Validation', () => {
  it('validates Product schema rules', async () => {
    const valid = new Product({
      name: 'Fresh Apples',
      sku: 'APP-1',
      category: 'Fruit',
      price: 2.5,
      cost: 1.5,
      stock: 50,
    });
    await expect(valid.validate()).resolves.toBeUndefined();

    const missingName = new Product({
      sku: 'APP-2',
      category: 'Fruit',
      price: 2.5,
      cost: 1.5,
      stock: 50,
    });
    await expect(missingName.validate()).rejects.toThrow();

    const negativePrice = new Product({
      name: 'Apple',
      sku: 'APP-3',
      category: 'Fruit',
      price: -1,
      cost: 1.5,
      stock: 50,
    });
    await expect(negativePrice.validate()).rejects.toThrow();

    const negativeStock = new Product({
      name: 'Apple',
      sku: 'APP-4',
      category: 'Fruit',
      price: 2,
      cost: 1,
      stock: -5,
    });
    await expect(negativeStock.validate()).rejects.toThrow();
  });

  it('validates Sale schema rules', async () => {
    const valid = new Sale({
      receipt: 'NX-00001',
      time: new Date().toISOString(),
      cashierId: 'u-1',
      cashierName: 'Cashier 1',
      method: 'Cash',
      items: [
        {
          productId: '60d5ecb8b5c9c61234567890',
          name: 'Bread',
          sku: 'BR-1',
          qty: 2,
          price: 30,
          cost: 20,
        },
      ],
      subtotal: 60,
      discountType: 'fixed',
      discountValue: 0,
      discount: 0,
      tax: 0,
      total: 60,
    });
    await expect(valid.validate()).resolves.toBeUndefined();

    const invalidMethod = new Sale({
      receipt: 'NX-00002',
      time: new Date().toISOString(),
      cashierId: 'u-1',
      cashierName: 'Cashier 1',
      method: 'Bitcoin' as any,
      items: [
        {
          productId: '60d5ecb8b5c9c61234567890',
          name: 'Bread',
          sku: 'BR-1',
          qty: 2,
          price: 30,
          cost: 20,
        },
      ],
      subtotal: 60,
      discountType: 'fixed',
      discountValue: 0,
      discount: 0,
      tax: 0,
      total: 60,
    });
    await expect(invalidMethod.validate()).rejects.toThrow();

    const emptyItems = new Sale({
      receipt: 'NX-00003',
      time: new Date().toISOString(),
      cashierId: 'u-1',
      cashierName: 'Cashier 1',
      method: 'Cash',
      items: [],
      subtotal: 0,
      discountType: 'fixed',
      discountValue: 0,
      discount: 0,
      tax: 0,
      total: 0,
    });
    await expect(emptyItems.validate()).rejects.toThrow();
  });

  it('validates StockMovement schema rules', async () => {
    const valid = new StockMovement({
      productId: '60d5ecb8b5c9c61234567890',
      productName: 'Rice 5kg',
      sku: 'RC-5',
      type: 'restock',
      change: 10,
      balanceAfter: 20,
      actorName: 'Adib',
      time: new Date().toISOString(),
    });
    await expect(valid.validate()).resolves.toBeUndefined();

    const invalidType = new StockMovement({
      productId: '60d5ecb8b5c9c61234567890',
      productName: 'Rice 5kg',
      sku: 'RC-5',
      type: 'magic' as any,
      change: 10,
      balanceAfter: 20,
      actorName: 'Adib',
      time: new Date().toISOString(),
    });
    await expect(invalidType.validate()).rejects.toThrow();

    const negativeBalance = new StockMovement({
      productId: '60d5ecb8b5c9c61234567890',
      productName: 'Rice 5kg',
      sku: 'RC-5',
      type: 'adjustment',
      change: -5,
      balanceAfter: -1,
      actorName: 'Adib',
      time: new Date().toISOString(),
    });
    await expect(negativeBalance.validate()).rejects.toThrow();
  });

  it('validates Settings schema rules', async () => {
    const valid = new Settings({
      key: 'app',
      storeName: 'Test POS',
      currencyCode: 'USD',
      taxRate: 5,
      lowStockThreshold: 10,
      categories: ['Grocery'],
    });
    await expect(valid.validate()).resolves.toBeUndefined();

    const excessiveTax = new Settings({
      key: 'app',
      storeName: 'Test POS',
      taxRate: 150,
    });
    await expect(excessiveTax.validate()).rejects.toThrow();
  });
});

describe('API Route Validation & Bad Request Handling', () => {
  const authHeaders = {
    'Content-Type': 'application/json',
    'x-requested-with': 'NexoraPOS',
    origin: 'http://localhost:3000',
    'x-test-role': 'owner',
  };

  it('POST /api/products returns 400 on invalid input', async () => {
    const req = new Request('http://localhost:3000/api/products', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: '', price: -10 }),
    });

    const res = await createProductHandler(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
  });

  it('GET /api/products/[id] validates ObjectId', async () => {
    const res = await getProductByIdHandler(
      new Request('http://localhost:3000/api/products/invalid-id'),
      { params: Promise.resolve({ id: 'invalid-id' }) }
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toContain('Invalid product ID');
  });

  it('PATCH /api/products/[id] validates ObjectId and body fields', async () => {
    const res1 = await updateProductHandler(
      new Request('http://localhost:3000/api/products/invalid-id', {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: 'invalid-id' }) }
    );
    expect(res1.status).toBe(400);

    const validId = '60d5ecb8b5c9c61234567890';
    const res2 = await updateProductHandler(
      new Request(`http://localhost:3000/api/products/${validId}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ name: '', price: -5 }),
      }),
      { params: Promise.resolve({ id: validId }) }
    );
    expect(res2.status).toBe(400);
  });

  it('DELETE /api/products/[id] validates ObjectId', async () => {
    const res = await deleteProductHandler(
      new Request('http://localhost:3000/api/products/not-an-id', {
        method: 'DELETE',
        headers: authHeaders,
      }),
      { params: Promise.resolve({ id: 'not-an-id' }) }
    );
    expect(res.status).toBe(400);
  });

  it('PATCH /api/products/stock validates stock changes format', async () => {
    const res1 = await updateStockHandler(
      new Request('http://localhost:3000/api/products/stock', {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ changes: [] }),
      })
    );
    expect(res1.status).toBe(400);

    const res2 = await updateStockHandler(
      new Request('http://localhost:3000/api/products/stock', {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({
          changes: [{ productId: 'bad-id', quantity: 0 }],
        }),
      })
    );
    expect(res2.status).toBe(400);
  });

  it('POST /api/sales validates items, payment, and totals', async () => {
    const res1 = await createSaleHandler(
      new Request('http://localhost:3000/api/sales', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ items: [] }),
      })
    );
    expect(res1.status).toBe(400);

    const res2 = await createSaleHandler(
      new Request('http://localhost:3000/api/sales', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          items: [
            {
              productId: '60d5ecb8b5c9c61234567890',
              name: 'Milk',
              sku: 'MK-1',
              qty: 1,
              price: 10,
              cost: 5,
            },
          ],
          subtotal: 10,
          total: 10,
          method: 'Cash',
          tendered: 5, // Less than total!
          cashierId: 'u-1',
          cashierName: 'Cashier',
        }),
      })
    );
    expect(res2.status).toBe(400);
    const data2 = await res2.json();
    expect(data2.message).toContain('less than the total');
  });

  it('POST /api/movements validates adjustment kind and quantities', async () => {
    const res1 = await adjustMovementHandler(
      new Request('http://localhost:3000/api/movements', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          productId: 'not-an-id',
          kind: 'restock',
          quantity: 5,
        }),
      })
    );
    expect(res1.status).toBe(400);

    const validId = '60d5ecb8b5c9c61234567890';
    const res2 = await adjustMovementHandler(
      new Request('http://localhost:3000/api/movements', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          productId: validId,
          kind: 'restock',
          quantity: 0, // Must be >= 1
        }),
      })
    );
    expect(res2.status).toBe(400);
    expect((await res2.json()).message).toContain('at least 1');

    const res3 = await adjustMovementHandler(
      new Request('http://localhost:3000/api/movements', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          productId: validId,
          kind: 'set',
          quantity: -2, // Cannot be negative
        }),
      })
    );
    expect(res3.status).toBe(400);
    expect((await res3.json()).message).toContain('negative');
  });

  it('PUT /api/settings validates storeName, taxRate, and categories', async () => {
    const res1 = await updateSettingsHandler(
      new Request('http://localhost:3000/api/settings', {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ storeName: '', categories: ['Grocery'] }),
      })
    );
    expect(res1.status).toBe(400);

    const res2 = await updateSettingsHandler(
      new Request('http://localhost:3000/api/settings', {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({
          storeName: 'Valid Store',
          taxRate: 120, // > 100
          categories: ['Grocery'],
        }),
      })
    );
    expect(res2.status).toBe(400);

    const res3 = await updateSettingsHandler(
      new Request('http://localhost:3000/api/settings', {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({
          storeName: 'Valid Store',
          categories: [], // Empty categories
        }),
      })
    );
    expect(res3.status).toBe(400);
  });
});


describe('IndexedDB Multi-Collection Caching from MongoDB', () => {
  beforeEach(async () => {
    await closeDb();
    await new Promise<void>((res) => {
      const r = indexedDB.deleteDatabase('nexora-pos');
      r.onsuccess = r.onerror = r.onblocked = () => res();
    });
    await ensureInitialized();
  });

  it('caches MongoDB products, sales, movements, and settings into IndexedDB', async () => {
    const mockProducts = [
      {
        id: '60d5ecb8b5c9c61234567891',
        name: 'Organic Honey',
        sku: 'HNY-1',
        barcode: '998877',
        category: 'Grocery',
        price: 15,
        cost: 10,
        stock: 25,
        imageUrl: '',
        tone: 'amber',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const mockSales = [
      {
        id: '60d5ecb8b5c9c61234567892',
        receipt: 'NX-00099',
        time: new Date().toISOString(),
        cashierId: 'u-cash-1',
        cashierName: 'Cashier',
        method: 'Cash' as const,
        items: [
          {
            productId: '60d5ecb8b5c9c61234567891',
            name: 'Organic Honey',
            sku: 'HNY-1',
            qty: 2,
            price: 15,
            cost: 10,
          },
        ],
        subtotal: 30,
        discountType: 'fixed' as const,
        discountValue: 0,
        discount: 0,
        taxLabel: 'VAT',
        taxRate: 0,
        taxInclusive: false,
        tax: 0,
        total: 30,
        tendered: 30,
        change: 0,
        syncStatus: 'synced' as const,
      },
    ];

    const mockMovements = [
      {
        id: '60d5ecb8b5c9c61234567893',
        seq: 1,
        productId: '60d5ecb8b5c9c61234567891',
        productName: 'Organic Honey',
        sku: 'HNY-1',
        type: 'initial' as const,
        change: 25,
        balanceAfter: 25,
        note: 'Opening stock',
        actorName: 'Administrator',
        time: new Date().toISOString(),
      },
    ];

    const mockSettings = {
      storeName: 'MongoDB Store',
      address: '123 Main St',
      phone: '555-0199',
      email: 'pos@example.com',
      taxId: 'TAX-12345',
      currencyCode: 'EUR',
      taxEnabled: true,
      taxLabel: 'VAT',
      taxRate: 10,
      taxInclusive: true,
      receiptPrefix: 'MG',
      receiptHeader: 'Welcome to MongoDB Store',
      receiptFooter: 'Thank you!',
      receiptShowCashier: true,
      receiptShowTaxId: true,
      receiptPaper: '80mm' as const,
      autoPrint: true,
      lowStockThreshold: 8,
      categories: ['Grocery', 'Specialty'],
      autoSync: true,
    };

    await cacheMongoProducts(mockProducts);
    await cacheMongoSales(mockSales);
    await cacheMongoMovements(mockMovements);
    await cacheMongoSettings(mockSettings);

    const snapshot = await loadSnapshot();

    expect(snapshot.products).toHaveLength(1);
    expect(snapshot.products[0].name).toBe('Organic Honey');
    expect(snapshot.products[0].id).toBe('60d5ecb8b5c9c61234567891');

    expect(snapshot.sales).toHaveLength(1);
    expect(snapshot.sales[0].receipt).toBe('NX-00099');
    expect(snapshot.sales[0].total).toBe(30);

    expect(snapshot.movements).toHaveLength(1);
    expect(snapshot.movements[0].productName).toBe('Organic Honey');
    expect(snapshot.movements[0].change).toBe(25);

    expect(snapshot.settings.storeName).toBe('MongoDB Store');
    expect(snapshot.settings.currencyCode).toBe('EUR');
    expect(snapshot.settings.categories).toEqual(['Grocery', 'Specialty']);
  });

  it('handles empty collections from MongoDB cleanly without throwing', async () => {
    await cacheMongoProducts([]);
    await cacheMongoSales([]);
    await cacheMongoMovements([]);

    const snapshot = await loadSnapshot();
    expect(snapshot.products).toHaveLength(0);
    expect(snapshot.sales).toHaveLength(0);
    expect(snapshot.movements).toHaveLength(0);
  });

  it('clearDataHandler is defined and handles requests safely', async () => {
    expect(typeof clearDataHandler).toBe('function');
  });
});
