
import { NextResponse } from "next/server";
import { connectDB, withTransactionIfSupported } from "@/lib/mongodb";
import Product from "@/models/Product";
import Sale from "@/models/Sale";
import StockMovement from "@/models/StockMovement";
import Settings from "@/models/Settings";
import { DEFAULT_SETTINGS } from "@/config/constants";

export async function POST(request: Request) {
  try {
    await connectDB();

    let body: { resetSettings?: boolean } = {};

    try {
      body = await request.json();
    } catch {
      // Empty request body is acceptable.
    }

    const resetSettings = body.resetSettings === true;

    await withTransactionIfSupported(async (session) => {
      const opt = session ? { session } : {};

      // Delete records sequentially within the transaction.
      await Product.deleteMany({}, opt);
      await Sale.deleteMany({}, opt);
      await StockMovement.deleteMany({}, opt);

      // Preserve settings unless explicitly asked to reset them.
      if (resetSettings) {
        await Settings.findOneAndUpdate(
          { key: "app" },
          { key: "app", ...DEFAULT_SETTINGS },
          { upsert: true, ...opt }
        );
      }
    });

    return NextResponse.json({
      success: true,
      message: "Database cleared successfully.",
    });
  } catch (error) {
    console.error("Failed to clear database:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to clear database.",
      },
      { status: 500 }
    );
  }
}
