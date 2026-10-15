import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Product from "@/models/Product";
import mongoose from "mongoose";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  _request: Request,
  { params }: RouteContext
) {
  try {
    await connectDB();

    const { id } = await params;

    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid product ID." },
        { status: 400 }
      );
    }

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
    await connectDB();

    const { id } = await params;

    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid product ID." },
        { status: 400 }
      );
    }

    const body = await request.json();

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
    } = body;

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
  _request: Request,
  { params }: RouteContext
) {
  try {
    await connectDB();

    const { id } = await params;

    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid product ID." },
        { status: 400 }
      );
    }

    const product = await Product.findByIdAndDelete(id);

    if (!product) {
      return NextResponse.json(
        { success: false, message: "Product not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Product deleted successfully.",
    });
  } catch (error) {
    console.error("Failed to delete product:", error);

    return NextResponse.json(
      { success: false, message: "Failed to delete product." },
      { status: 500 }
    );
  }
}