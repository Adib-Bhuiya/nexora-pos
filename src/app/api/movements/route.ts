import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB, withTransactionIfSupported } from "@/lib/mongodb";
import Product from "@/models/Product";
import StockMovement from "@/models/StockMovement";
import { getSessionUser, verifyCsrfAndOrigin } from "@/lib/auth-server";

export async function GET() {
  try {
    await connectDB();

    const movements = await StockMovement.find()
      .sort({ time: -1, createdAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      movements: movements.map((m) => ({
        ...m,
        id: m._id.toString(),
        _id: m._id.toString(),
        note: m.note ?? "",
        reference: m.reference ?? "",
      })),
    });
  } catch (error) {
    console.error("Failed to fetch stock movements:", error);

    return NextResponse.json(
      { success: false, message: "Failed to fetch stock movements." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const csrfCheck = verifyCsrfAndOrigin(request);
    if (!csrfCheck.valid) {
      return NextResponse.json(
        { success: false, message: csrfCheck.reason || "CSRF validation failed." },
        { status: 403 }
      );
    }

    const auth = await getSessionUser(request);
    if (!auth) {
      return NextResponse.json(
        { success: false, message: "Authentication required." },
        { status: 401 }
      );
    }

    if (auth.user.role !== "owner") {
      return NextResponse.json(
        { success: false, message: "Only store owners can manually adjust stock." },
        { status: 403 }
      );
    }

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
      productId,
      kind,
      quantity,
      note = "",
    } = body ?? {};

    const actorName = auth.user.name;

    if (
      typeof productId !== "string" ||
      !mongoose.isValidObjectId(productId) ||
      !["restock", "set"].includes(kind) ||
      typeof quantity !== "number" ||
      !Number.isInteger(quantity)
    ) {
      return NextResponse.json(
        { success: false, message: "Provide valid product ID, adjustment kind, and quantity." },
        { status: 400 }
      );
    }

    if (kind === "restock" && quantity < 1) {
      return NextResponse.json(
        { success: false, message: "Restock quantity must be at least 1." },
        { status: 400 }
      );
    }

    if (kind === "set" && quantity < 0) {
      return NextResponse.json(
        { success: false, message: "Counted quantity cannot be negative." },
        { status: 400 }
      );
    }

    await connectDB();

    const product = await Product.findById(productId);
    if (!product) {
      return NextResponse.json(
        { success: false, message: "This product no longer exists." },
        { status: 404 }
      );
    }

    const currentStock = product.stock;
    const nextStock = kind === "restock" ? currentStock + quantity : quantity;
    const change = nextStock - currentStock;

    if (change === 0) {
      return NextResponse.json(
        { success: false, message: "The count is unchanged." },
        { status: 400 }
      );
    }

    let createdMovement: any;
    let updatedProduct: any;

    await withTransactionIfSupported(async (session) => {
      const sessionOpt = session ? { session } : {};

      const count = await StockMovement.countDocuments({}, sessionOpt);

      product.stock = nextStock;
      await product.save(sessionOpt);
      updatedProduct = product;

      const [mv] = await StockMovement.create(
        [
          {
            seq: count + 1,
            productId: product._id.toString(),
            productName: product.name,
            sku: product.sku,
            type: kind === "restock" ? "restock" : "adjustment",
            change,
            balanceAfter: nextStock,
            note:
              typeof note === "string" && note.trim()
                ? note.trim()
                : kind === "restock"
                ? "Restock"
                : "Stock adjustment",
            actorName:
              typeof actorName === "string" && actorName.trim()
                ? actorName.trim()
                : "Administrator",
            time: new Date().toISOString(),
          },
        ],
        sessionOpt
      );

      createdMovement = mv;
    });

    return NextResponse.json(
      {
        success: true,
        message:
          kind === "restock"
            ? `Added ${quantity} units to ${product.name}.`
            : `${product.name} stock count set to ${quantity}.`,
        movement: {
          ...createdMovement.toObject(),
          id: createdMovement._id.toString(),
          _id: createdMovement._id.toString(),
        },
        product: {
          ...updatedProduct.toObject(),
          id: updatedProduct._id.toString(),
          _id: updatedProduct._id.toString(),
          imageUrl: updatedProduct.imageUrl ?? "",
          barcode: updatedProduct.barcode ?? "",
          tone: updatedProduct.tone ?? "blue",
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to adjust stock:", error);

    return NextResponse.json(
      { success: false, message: "Failed to adjust stock." },
      { status: 500 }
    );
  }
}
