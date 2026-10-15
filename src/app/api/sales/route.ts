import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB, withTransactionIfSupported } from "@/lib/mongodb";
import Sale from "@/models/Sale";
import Product from "@/models/Product";
import StockMovement from "@/models/StockMovement";

export async function GET() {
  try {
    await connectDB();

    const sales = await Sale.find().sort({ time: -1, createdAt: -1 }).lean();

    return NextResponse.json({
      success: true,
      sales: sales.map((sale) => ({
        ...sale,
        id: sale._id.toString(),
        _id: sale._id.toString(),
        tendered: sale.tendered,
        change: sale.change,
        syncStatus: "synced" as const,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch sales:", error);

    return NextResponse.json(
      { success: false, message: "Failed to fetch sales." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: "Invalid JSON request body." },
        { status: 400 }
      );
    }

    const {
      receipt: providedReceipt,
      items,
      subtotal,
      discountType = "fixed",
      discountValue = 0,
      discount = 0,
      taxLabel = "",
      taxRate = 0,
      taxInclusive = false,
      tax = 0,
      total,
      tendered,
      change,
      method,
      cashierId,
      cashierName,
      time = new Date().toISOString(),
    } = body ?? {};

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, message: "A sale must include at least one item." },
        { status: 400 }
      );
    }

    for (const item of items) {
      if (
        !item ||
        typeof item.productId !== "string" ||
        !mongoose.isValidObjectId(item.productId) ||
        typeof item.name !== "string" ||
        !item.name.trim() ||
        typeof item.sku !== "string" ||
        !item.sku.trim() ||
        typeof item.qty !== "number" ||
        !Number.isInteger(item.qty) ||
        item.qty < 1 ||
        typeof item.price !== "number" ||
        item.price < 0 ||
        typeof item.cost !== "number" ||
        item.cost < 0
      ) {
        return NextResponse.json(
          { success: false, message: "Invalid sale item details." },
          { status: 400 }
        );
      }
    }

    if (
      typeof subtotal !== "number" ||
      subtotal < 0 ||
      typeof total !== "number" ||
      total <= 0 ||
      typeof discount !== "number" ||
      discount < 0 ||
      typeof tax !== "number" ||
      tax < 0 ||
      !["fixed", "percent"].includes(discountType) ||
      !["Cash", "Mobile financial service", "Card"].includes(method) ||
      typeof cashierId !== "string" ||
      !cashierId.trim() ||
      typeof cashierName !== "string" ||
      !cashierName.trim()
    ) {
      return NextResponse.json(
        { success: false, message: "Provide valid sale details, payment, and totals." },
        { status: 400 }
      );
    }

    if (method === "Cash") {
      if (typeof tendered !== "number" || tendered < total) {
        return NextResponse.json(
          { success: false, message: "Amount received is less than the total." },
          { status: 400 }
        );
      }
    }

    // Merge quantities by productId to check inventory
    const needed = new Map<string, number>();
    for (const item of items) {
      needed.set(item.productId, (needed.get(item.productId) ?? 0) + item.qty);
    }

    await connectDB();

    // Verify all products exist and have sufficient stock in MongoDB
    const productIds = [...needed.keys()];
    const existingProducts = await Product.find({ _id: { $in: productIds } }).lean();
    const productMap = new Map(existingProducts.map((p) => [p._id.toString(), p]));

    for (const [productId, qty] of needed) {
      const p = productMap.get(productId);
      if (!p) {
        return NextResponse.json(
          { success: false, message: "A product in the cart no longer exists." },
          { status: 404 }
        );
      }
      if (p.stock < qty) {
        return NextResponse.json(
          {
            success: false,
            message:
              p.stock < 1
                ? `${p.name} is out of stock.`
                : `${p.name}: only ${p.stock} in stock.`,
          },
          { status: 409 }
        );
      }
    }

    // Generate receipt if not provided
    let receipt = providedReceipt;
    if (!receipt || typeof receipt !== "string" || !receipt.trim()) {
      const count = await Sale.countDocuments();
      receipt = `NX-${String(count + 1).padStart(5, "0")}`;
    } else {
      receipt = receipt.trim();
    }

    let createdSale: any;

    await withTransactionIfSupported(async (session) => {
      const sessionOpt = session ? { session } : {};

      // 1. Decrement stock for each product
      for (const [productId, qty] of needed) {
        const res = await Product.updateOne(
          { _id: productId, stock: { $gte: qty } },
          { $inc: { stock: -qty } },
          sessionOpt
        );

        if (res.matchedCount !== 1) {
          const p = productMap.get(productId);
          throw new Error(
            p
              ? `${p.name}: insufficient stock.`
              : `Product ${productId} does not exist.`
          );
        }
      }

      // 2. Fetch updated balances for stock movements
      const updatedProducts = await Product.find(
        { _id: { $in: productIds } },
        null,
        sessionOpt
      ).lean();
      const updatedMap = new Map(
        updatedProducts.map((p) => [p._id.toString(), p])
      );

      // 3. Create stock movements
      const movements = items.map((item) => {
        const prod = updatedMap.get(item.productId);
        const balAfter = prod ? prod.stock : 0;
        return {
          productId: item.productId,
          productName: item.name,
          sku: item.sku,
          type: "sale" as const,
          change: -item.qty,
          balanceAfter: balAfter,
          note: `Sale ${receipt}`,
          reference: receipt,
          actorName: cashierName.trim(),
          time,
        };
      });

      await StockMovement.insertMany(movements, sessionOpt);

      // 4. Create Sale document
      const [saleDoc] = await Sale.create(
        [
          {
            receipt,
            time,
            cashierId: cashierId.trim(),
            cashierName: cashierName.trim(),
            method,
            items: items.map((i) => ({
              productId: i.productId,
              name: i.name.trim(),
              sku: i.sku.trim(),
              qty: i.qty,
              price: i.price,
              cost: i.cost,
            })),
            subtotal,
            discountType,
            discountValue,
            discount,
            taxLabel: taxLabel.trim(),
            taxRate,
            taxInclusive: Boolean(taxInclusive),
            tax,
            total,
            tendered: typeof tendered === "number" ? tendered : undefined,
            change: typeof change === "number" ? change : undefined,
            syncStatus: "synced",
          },
        ],
        sessionOpt
      );

      createdSale = saleDoc;
    });

    return NextResponse.json(
      {
        success: true,
        message: "Sale completed successfully!",
        sale: {
          ...createdSale.toObject(),
          id: createdSale._id.toString(),
          _id: createdSale._id.toString(),
          syncStatus: "synced",
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to record sale:", error);

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "A sale with this receipt number already exists.",
        },
        { status: 409 }
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to record sale.";

    return NextResponse.json(
      {
        success: false,
        message:
          message.includes("stock") || message.includes("exist")
            ? message
            : "Failed to record sale.",
      },
      {
        status: message.includes("stock") ? 409 : 500,
      }
    );
  }
}
