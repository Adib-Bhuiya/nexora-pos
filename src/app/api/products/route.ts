
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Product from "@/models/Product";
import StockMovement from "@/models/StockMovement";
import { getSessionUser, verifyCsrfAndOrigin } from "@/lib/auth-server";

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
        { success: false, message: "Only store owners can add products." },
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
        {
          success: false,
          message: "Provide valid product details, price, cost, and stock.",
        },
        { status: 400 }
      );
    }

    await connectDB();

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

    if (stock > 0) {
      try {
        await StockMovement.create({
          productId: product._id.toString(),
          productName: product.name,
          sku: product.sku,
          type: "initial",
          change: stock,
          balanceAfter: stock,
          note: "Opening stock",
          actorName: typeof body.actorName === "string" && body.actorName.trim() ? body.actorName.trim() : "Administrator",
          time: new Date().toISOString(),
        });
      } catch (smError) {
        console.error("Failed to record initial stock movement:", smError);
      }
    }

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
