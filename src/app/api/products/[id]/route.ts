
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import Product from "@/models/Product";

const serializeProduct = (product: any) => ({
  ...product,
  id: product._id.toString(),
  _id: product._id.toString(),
  barcode: product.barcode ?? "",
  imageUrl: product.imageUrl ?? "",
  tone: product.tone ?? "blue",
});

const allowedFields = [
  "name",
  "sku",
  "barcode",
  "category",
  "price",
  "cost",
  "stock",
  "imageUrl",
  "tone",
] as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
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
      product: serializeProduct(product),
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid product ID." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, message: "No valid fields provided." },
        { status: 400 }
      );
    }

    if (
      ("name" in updates &&
        (typeof updates.name !== "string" || !updates.name.trim())) ||
      ("sku" in updates &&
        (typeof updates.sku !== "string" || !updates.sku.trim())) ||
      ("barcode" in updates && typeof updates.barcode !== "string") ||
      ("category" in updates &&
        (typeof updates.category !== "string" ||
          !updates.category.trim())) ||
      ("price" in updates &&
        (typeof updates.price !== "number" ||
          !Number.isFinite(updates.price) ||
          updates.price < 0)) ||
      ("cost" in updates &&
        (typeof updates.cost !== "number" ||
          !Number.isFinite(updates.cost) ||
          updates.cost < 0)) ||
      ("stock" in updates &&
        (typeof updates.stock !== "number" ||
          !Number.isInteger(updates.stock) ||
          updates.stock < 0)) ||
      ("imageUrl" in updates && typeof updates.imageUrl !== "string") ||
      ("tone" in updates && typeof updates.tone !== "string")
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid product data." },
        { status: 400 }
      );
    }

    for (const field of ["name", "sku", "category", "barcode", "imageUrl", "tone"]) {
      if (typeof updates[field] === "string") {
        updates[field] = (updates[field] as string).trim();
      }
    }

    await connectDB();

    const product = await Product.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    }).lean();

    if (!product) {
      return NextResponse.json(
        { success: false, message: "Product not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Product updated successfully!",
      product: serializeProduct(product),
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
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid product ID." },
        { status: 400 }
      );
    }

    await connectDB();

    const product = await Product.findByIdAndDelete(id);

    if (!product) {
      return NextResponse.json(
        { success: false, message: "Product not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Product deleted successfully!",
      product: serializeProduct(product.toObject()),
    });
  } catch (error) {
    console.error("Failed to delete product:", error);

    return NextResponse.json(
      { success: false, message: "Failed to delete product." },
      { status: 500 }
    );
  }
}
