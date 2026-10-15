
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Product from "@/models/Product";

export async function GET() {
  try {
    await connectDB();

    const products = await Product.find()
      .sort({ createdAt: -1 })
      .lean();

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
    console.error("Failed to fetch products:", error);

    return NextResponse.json(
      { success: false, message: "Failed to fetch products." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await connectDB();

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
        {
          success: false,
          message: "Provide valid product details, price, cost, and stock.",
        },
        { status: 400 }
      );
    }

    const product = await Product.create({
      name: name.trim(),
      sku: sku.trim(),
      barcode: barcode.trim(),
      category: category.trim(),
      price,
      cost,
      stock,
      imageUrl: imageUrl.trim(),
      tone: tone.trim(),
    });

    return NextResponse.json(
      {
        success: true,
        message: "Product created successfully!",
        product: {
          ...product.toObject(),
          id: product._id.toString(),
          _id: product._id.toString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create product:", error);

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "A product with this SKU or barcode already exists.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { success: false, message: "Failed to create product." },
      { status: 500 }
    );
  }
}
