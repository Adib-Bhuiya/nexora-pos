import { NextResponse } from "next/server";
import { connectDB, withTransactionIfSupported } from "@/lib/mongodb";
import Product from "@/models/Product";
import StockMovement from "@/models/StockMovement";
import mongoose from "mongoose";
import { getSessionUser, verifyCsrfAndOrigin } from "@/lib/auth-server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  _request: Request,
  { params }: RouteContext
) {
  try {
    const { id } = await params;

    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid product ID." },
        { status: 400 }
      );
    }

    await connectDB();

    const product = await Product.findById(id).lean();

    if (!product) {
      return NextResponse.json(
        { success: false, message: "Product not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      product: {
        ...product,
        id: product._id.toString(),
        _id: product._id.toString(),
        barcode: product.barcode ?? "",
        imageUrl: product.imageUrl ?? "",
        tone: product.tone ?? "blue",
      },
    });
  } catch (error) {
    console.error("Failed to fetch product:", error);

    return NextResponse.json(
      { success: false, message: "Failed to fetch product." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: RouteContext
) {
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
        { success: false, message: "Only store owners can modify products." },
        { status: 403 }
      );
    }

    const { id } = await params;

    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid product ID." },
        { status: 400 }
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
      name,
      sku,
      barcode = "",
      category,
      price,
      cost,
      stock,
      imageUrl = "",
      tone = "blue",
    } = body ?? {};

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof sku !== "string" ||
      !sku.trim() ||
      typeof barcode !== "string" ||
      typeof category !== "string" ||
      !category.trim() ||
      typeof price !== "number" ||
      !Number.isFinite(price) ||
      price < 0 ||
      typeof cost !== "number" ||
      !Number.isFinite(cost) ||
      cost < 0 ||
      typeof stock !== "number" ||
      !Number.isInteger(stock) ||
      stock < 0 ||
      typeof imageUrl !== "string" ||
      typeof tone !== "string"
    ) {
      return NextResponse.json(
        { success: false, message: "Provide valid product details." },
        { status: 400 }
      );
    }

    await connectDB();

    const product = await Product.findByIdAndUpdate(
      id,
      {
        name: name.trim(),
        sku: sku.trim(),
        barcode: barcode.trim(),
        category: category.trim(),
        price,
        cost,
        stock,
        imageUrl: imageUrl.trim(),
        tone: tone.trim(),
      },
      { new: true, runValidators: true }
    ).lean();

    if (!product) {
      return NextResponse.json(
        { success: false, message: "Product not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Product updated successfully.",
      product: {
        ...product,
        id: product._id.toString(),
        _id: product._id.toString(),
        barcode: product.barcode ?? "",
        imageUrl: product.imageUrl ?? "",
        tone: product.tone ?? "blue",
      },
    });
  } catch (error) {
    console.error("Failed to update product:", error);

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      return NextResponse.json(
        { success: false, message: "A product with this SKU or barcode already exists." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { success: false, message: "Failed to update product." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: RouteContext
) {
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
        { success: false, message: "Only store owners can delete products." },
        { status: 403 }
      );
    }

    const { id } = await params;

    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid product ID." },
        { status: 400 }
      );
    }

    await connectDB();

    let movementDoc: any;

    const deletedProduct = await withTransactionIfSupported(async (session) => {
      const sessionOpt = session ? { session } : {};
      const existingProduct = await Product.findById(id, null, sessionOpt);
      if (!existingProduct) {
        return null;
      }

      await Product.findByIdAndDelete(id, sessionOpt);

      try {
        const count = await StockMovement.countDocuments({}, sessionOpt);

        const [createdMovement] = await StockMovement.create(
          [
            {
              seq: count + 1,
              productId: existingProduct._id.toString(),
              productName: existingProduct.name,
              sku: existingProduct.sku,
              type: "removal",
              change: 0,
              balanceAfter: 0,
              note: "Product removed from catalog",
              reference: auth.user.id,
              actorName:
                typeof auth.user.name === "string" && auth.user.name.trim()
                  ? auth.user.name.trim()
                  : "Administrator",
              time: new Date().toISOString(),
            },
          ],
          sessionOpt
        );

        movementDoc = createdMovement;
      } catch (movementError) {
        if (!session) {
          try {
            const rawProduct =
              typeof existingProduct.toObject === "function"
                ? existingProduct.toObject()
                : existingProduct;
            await Product.create(rawProduct);
          } catch (restoreError) {
            console.error(
              "Failed to rollback product deletion in non-transactional fallback:",
              restoreError
            );
          }
        }
        throw movementError;
      }

      return existingProduct;
    });

    if (!deletedProduct) {
      return NextResponse.json(
        { success: false, message: "Product not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Product deleted successfully.",
      movement: movementDoc
        ? {
            ...movementDoc.toObject(),
            id: movementDoc._id.toString(),
            _id: movementDoc._id.toString(),
          }
        : undefined,
    });
  } catch (error) {
    console.error("Failed to delete product:", error);

    return NextResponse.json(
      { success: false, message: "Failed to delete product." },
      { status: 500 }
    );
  }
}