import { NextResponse } from 'next/server';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { connectDB, withTransactionIfSupported } from '@/lib/mongodb';
import Sale from '@/models/Sale';
import Product from '@/models/Product';
import StockMovement from '@/models/StockMovement';
import { getSessionUser, verifyCsrfAndOrigin } from '@/lib/auth-server';

type RouteContext = {
  params: Promise<{ id: string }>;
};


export async function POST(request: Request, { params }: RouteContext) {
  try {
    const csrfCheck = verifyCsrfAndOrigin(request);
    if (!csrfCheck.valid) {
      return NextResponse.json(
        { success: false, message: csrfCheck.reason || 'CSRF validation failed.' },
        { status: 403 }
      );
    }

    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json(
        { success: false, message: 'Invalid sale ID.' },
        { status: 400 }
      );
    }

    await connectDB();
    const auth = await getSessionUser(request);

    if (!auth) {
      return NextResponse.json(
        { success: false, message: 'Authentication required.' },
        { status: 401 }
      );
    }

    // Explicit refund authorization: store owners only
    if (auth.user.role !== 'owner') {
      return NextResponse.json(
        { success: false, message: 'Only store owners are authorized to issue refunds.' },
        { status: 403 }
      );
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: 'Invalid JSON request body.' },
        { status: 400 }
      );
    }

    const { reason, items: requestedItems } = body ?? {};

    if (typeof reason !== 'string' || !reason.trim()) {
      return NextResponse.json(
        { success: false, message: 'A reason for the refund is required.' },
        { status: 400 }
      );
    }

    const sale = await Sale.findById(id);
    if (!sale) {
      return NextResponse.json(
        { success: false, message: 'Sale not found.' },
        { status: 404 }
      );
    }

    // Map existing sale items
    const saleItemMap = new Map<string, any>();
    let totalUnrefundedUnits = 0;

    for (const item of sale.items) {
      const alreadyRefunded = item.refundedQty || 0;
      const available = Math.max(0, item.qty - alreadyRefunded);
      saleItemMap.set(item.productId, { item, available, alreadyRefunded });
      totalUnrefundedUnits += available;
    }

    if (totalUnrefundedUnits === 0) {
      return NextResponse.json(
        { success: false, message: 'This sale has already been completely refunded.' },
        { status: 400 }
      );
    }

    // Determine refund line items and quantities
    const itemsToRefund: {
      productId: string;
      name: string;
      sku: string;
      qty: number;
      price: number;
      cost: number;
    }[] = [];

    if (Array.isArray(requestedItems) && requestedItems.length > 0) {
      for (const reqItem of requestedItems) {
        if (
          !reqItem ||
          typeof reqItem.productId !== 'string' ||
          typeof reqItem.qty !== 'number' ||
          !Number.isInteger(reqItem.qty) ||
          reqItem.qty < 1
        ) {
          return NextResponse.json(
            { success: false, message: 'Invalid refund items requested.' },
            { status: 400 }
          );
        }

        const info = saleItemMap.get(reqItem.productId);
        if (!info) {
          return NextResponse.json(
            { success: false, message: `Product ${reqItem.productId} was not part of this sale.` },
            { status: 400 }
          );
        }

        if (reqItem.qty > info.available) {
          return NextResponse.json(
            {
              success: false,
              message: `Cannot refund ${reqItem.qty} of ${info.item.name}; only ${info.available} remaining eligible for refund.`,
            },
            { status: 400 }
          );
        }

        itemsToRefund.push({
          productId: info.item.productId,
          name: info.item.name,
          sku: info.item.sku,
          qty: reqItem.qty,
          price: info.item.price,
          cost: info.item.cost,
        });
      }
    } else {
      // Full refund of all remaining items
      for (const [, info] of saleItemMap) {
        if (info.available > 0) {
          itemsToRefund.push({
            productId: info.item.productId,
            name: info.item.name,
            sku: info.item.sku,
            qty: info.available,
            price: info.item.price,
            cost: info.item.cost,
          });
        }
      }
    }

    if (itemsToRefund.length === 0) {
      return NextResponse.json(
        { success: false, message: 'No eligible items found to refund.' },
        { status: 400 }
      );
    }

    const refundAmount = itemsToRefund.reduce(
      (sum, item) => sum + item.price * item.qty,
      0
    );

    const refundCount = (sale.refunds?.length || 0) + 1;
    const refundReceipt = `RF-${sale.receipt}-${refundCount}`;
    const refundId = `ref_${crypto.randomUUID().slice(0, 12)}`;
    const refundedAt = new Date(); // Strictly typed as Date

    let updatedSaleResult: any;

    await withTransactionIfSupported(async (session) => {
      const sessionOpt = session ? { session } : {};

      // 1. Atomically restore inventory stock
      for (const item of itemsToRefund) {
        await Product.updateOne(
          { _id: item.productId },
          { $inc: { stock: item.qty } },
          sessionOpt
        );
      }

      // 2. Fetch updated stock balances and create audit movements
      const productIds = itemsToRefund.map((i) => i.productId);
      const updatedProducts = await Product.find(
        { _id: { $in: productIds } },
        null,
        sessionOpt
      ).lean();
      const productMap = new Map(updatedProducts.map((p) => [p._id.toString(), p]));

      const movementCount = await StockMovement.countDocuments({}, sessionOpt);
      const movements = itemsToRefund.map((item, idx) => {
        const prod = productMap.get(item.productId);
        const balAfter = prod ? prod.stock : 0;
        return {
          seq: movementCount + idx + 1,
          productId: item.productId,
          productName: item.name,
          sku: item.sku,
          type: 'adjustment' as const,
          change: item.qty,
          balanceAfter: balAfter,
          note: `Refund ${refundReceipt}: ${reason.trim()}`,
          reference: refundReceipt,
          actorName: auth.user.name,
          time: new Date().toISOString(),
        };
      });

      await StockMovement.insertMany(movements, sessionOpt);

      // 3. Atomically update the Sale document
      // Increment refundedQty on each line item
      for (const item of itemsToRefund) {
        await Sale.updateOne(
          { _id: sale._id, 'items.productId': item.productId },
          { $inc: { 'items.$.refundedQty': item.qty } },
          sessionOpt
        );
      }

      // Fetch fresh sale to check overall completion
      const currentSale = await Sale.findById(sale._id, null, sessionOpt);
      const allFullyRefunded = currentSale.items.every(
        (i: any) => (i.refundedQty || 0) >= i.qty
      );

      const refundRecord = {
        refundId,
        refundReceipt,
        refundedAt,
        refundedBy: auth.user.id,
        refundedByName: auth.user.name,
        reason: reason.trim(),
        items: itemsToRefund,
        amount: refundAmount,
      };

      currentSale.refunds = currentSale.refunds || [];
      currentSale.refunds.push(refundRecord);
      currentSale.status = allFullyRefunded ? 'refunded' : 'partially_refunded';

      await currentSale.save(sessionOpt);
      updatedSaleResult = currentSale;
    });

    return NextResponse.json({
      success: true,
      message: `Refund ${refundReceipt} processed successfully.`,
      refund: {
        refundId,
        refundReceipt,
        refundedAt,
        refundedBy: auth.user.id,
        refundedByName: auth.user.name,
        reason: reason.trim(),
        items: itemsToRefund,
        amount: refundAmount,
      },
      sale: {
        ...updatedSaleResult.toObject(),
        id: updatedSaleResult._id.toString(),
        _id: updatedSaleResult._id.toString(),
      },
    });
  } catch (error) {
    console.error('Failed to process refund:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to process refund.' },
      { status: 500 }
    );
  }
}
