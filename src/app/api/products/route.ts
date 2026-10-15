
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Product from "@/models/Product";

export async function GET() {
  try {
    await connectDB();

    const products = await Product.find().sort({
      createdAt: -1,
    });

    return NextResponse.json({
      success: true,
      products,
    });
  } catch (error) {
    console.error("Failed to fetch products:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch products.",
      },
      { status: 500 }
    );
  }
}



export async function POST(request: Request) {
  try {
    await connectDB();

    const body = await request.json();

    const { name, price, stock, category } = body;

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof category !== "string" ||
      !category.trim() ||
      typeof price !== "number" ||
      !Number.isFinite(price) ||
      price < 0 ||
      typeof stock !== "number" ||
      !Number.isInteger(stock) ||
      stock < 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Provide a valid name, category, non-negative price, and non-negative whole-number stock.",
        },
        { status: 400 }
      );
    }

    const product = await Product.create({
      name: name.trim(),
      price,
      stock,
      category: category.trim(),
    });

    return NextResponse.json(
      {
        success: true,
        message: "Product created successfully!",
        product,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create product:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to create product.",
      },
      { status: 500 }
    );
  }
}
