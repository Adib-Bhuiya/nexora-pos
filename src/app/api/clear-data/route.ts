
import { NextResponse } from "next/server";
import { connectDB, withTransactionIfSupported } from "@/lib/mongodb";
import Product from "@/models/Product";
import Sale from "@/models/Sale";
import StockMovement from "@/models/StockMovement";
import Settings from "@/models/Settings";
import { DEFAULT_SETTINGS } from "@/config/constants";
import { getSessionUser, verifyCsrfAndOrigin } from "@/lib/auth-server";

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
        { success: false, message: "Only store owners can reset the database." },
        { status: 403 }
      );
    }

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
