import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import Product from "@/models/Product";

interface StockChange {
  productId: string;
  quantity: number;
}

export async function PATCH(request: Request) {
  const session = await mongoose.startSession();

  try {
    const body = await request.json();
    const changes: StockChange[] = body?.changes;

    if (
      !Array.isArray(changes) ||
      changes.length === 0 ||
      changes.some(
        (change) =>
          !change ||
          typeof change.productId !== "string" ||
          !mongoose.isValidObjectId(change.productId) ||
          !Number.isInteger(change.quantity) ||
          change.quantity === 0
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Provide valid product IDs and non-zero integer stock changes.",
        },
        { status: 400 }
      );
    }

    // Combine duplicate product IDs before applying changes.
    const combined = new Map<string, number>();

    for (const change of changes) {
      const id = change.productId;
      combined.set(id, (combined.get(id) ?? 0) + change.quantity);
    }

    for (const quantity of combined.values()) {
      if (!Number.isInteger(quantity) || quantity === 0) {
        return NextResponse.json(
          {
            success: false,
            message: "Combined stock changes must be non-zero whole numbers.",
          },
          { status: 400 }
        );
      }
    }

    await connectDB();
    await session.withTransaction(async () => {
      for (const [productId, quantity] of combined) {
        const filter =
          quantity < 0
            ? { _id: productId, stock: { $gte: -quantity } }
            : { _id: productId };

        const result = await Product.updateOne(
          filter,
          { $inc: { stock: quantity } },
          { session }
        );

        if (result.matchedCount !== 1) {
          throw new Error(
            quantity < 0
              ? `Product ${productId} does not exist or has insufficient stock.`
              : `Product ${productId} does not exist.`
          );
        }
      }
    });

    const products = await Product.find({
      _id: { $in: [...combined.keys()] },
    }).lean();

    return NextResponse.json({
      success: true,
      products: products.map((product) => ({
        ...product,
        id: product._id.toString(),
        _id: product._id.toString(),
        imageUrl: product.imageUrl ?? "",
        barcode: product.barcode ?? "",
        tone: product.tone ?? "blue",
      })),
    });
  } catch (error) {
    console.error("Failed to update stock:", error);

    const message =
      error instanceof Error ? error.message : "Failed to update stock.";

    return NextResponse.json(
      {
        success: false,
        message: message.startsWith("Product ")
          ? message
          : "Failed to update stock.",
      },
      {
        status: message.startsWith("Product ") ? 409 : 500,
      }
    );
  } finally {
    await session.endSession();
  }
}