import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Settings from "@/models/Settings";
import { DEFAULT_SETTINGS } from "@/config/constants";

export async function GET() {
  try {
    await connectDB();

    let settings = await Settings.findOne({ key: "app" }).lean();

    if (!settings) {
      const created = await Settings.create({
        key: "app",
        ...DEFAULT_SETTINGS,
      });
      settings = created.toObject();
    }

    return NextResponse.json({
      success: true,
      settings: {
        storeName: settings.storeName ?? DEFAULT_SETTINGS.storeName,
        address: settings.address ?? "",
        phone: settings.phone ?? "",
        email: settings.email ?? "",
        taxId: settings.taxId ?? "",
        currencyCode: settings.currencyCode ?? "USD",
        taxEnabled: Boolean(settings.taxEnabled),
        taxLabel: settings.taxLabel ?? "Tax",
        taxRate: typeof settings.taxRate === "number" ? settings.taxRate : 0,
        taxInclusive: Boolean(settings.taxInclusive),
        receiptPrefix: settings.receiptPrefix ?? "NX",
        receiptHeader: settings.receiptHeader ?? "",
        receiptFooter: settings.receiptFooter ?? "Thank you for your business!",
        receiptShowCashier: settings.receiptShowCashier ?? true,
        receiptShowTaxId: settings.receiptShowTaxId ?? false,
        receiptPaper: settings.receiptPaper === "58mm" ? "58mm" : "80mm",
        autoPrint: Boolean(settings.autoPrint),
        lowStockThreshold:
          typeof settings.lowStockThreshold === "number"
            ? settings.lowStockThreshold
            : 5,
        categories: Array.isArray(settings.categories) && settings.categories.length > 0
          ? settings.categories
          : DEFAULT_SETTINGS.categories,
        autoSync: settings.autoSync ?? true,
      },
    });
  } catch (error) {
    console.error("Failed to fetch settings:", error);

    return NextResponse.json(
      { success: false, message: "Failed to fetch settings." },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
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
      storeName,
      address = "",
      phone = "",
      email = "",
      taxId = "",
      currencyCode = "USD",
      taxEnabled = false,
      taxLabel = "Tax",
      taxRate = 0,
      taxInclusive = false,
      receiptPrefix = "NX",
      receiptHeader = "",
      receiptFooter = "Thank you for your business!",
      receiptShowCashier = true,
      receiptShowTaxId = false,
      receiptPaper = "80mm",
      autoPrint = false,
      lowStockThreshold = 5,
      categories,
      autoSync = true,
    } = body ?? {};

    if (typeof storeName !== "string" || !storeName.trim()) {
      return NextResponse.json(
        { success: false, message: "Store name is required." },
        { status: 400 }
      );
    }

    if (
      email &&
      (typeof email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    ) {
      return NextResponse.json(
        { success: false, message: "Enter a valid email address." },
        { status: 400 }
      );
    }

    if (
      typeof taxRate !== "number" ||
      !Number.isFinite(taxRate) ||
      taxRate < 0 ||
      taxRate > 100
    ) {
      return NextResponse.json(
        { success: false, message: "Tax rate must be between 0 and 100." },
        { status: 400 }
      );
    }

    if (
      typeof lowStockThreshold !== "number" ||
      !Number.isInteger(lowStockThreshold) ||
      lowStockThreshold < 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Low stock threshold must be a whole number, 0 or more.",
        },
        { status: 400 }
      );
    }

    if (
      typeof receiptPrefix !== "string" ||
      !receiptPrefix.trim() ||
      !/^[A-Za-z0-9]{1,6}$/.test(receiptPrefix.trim())
    ) {
      return NextResponse.json(
        { success: false, message: "Receipt prefix must be 1–6 letters or numbers." },
        { status: 400 }
      );
    }

    if (typeof taxLabel !== "string" || !taxLabel.trim()) {
      return NextResponse.json(
        { success: false, message: "Tax label is required." },
        { status: 400 }
      );
    }

    if (
      !Array.isArray(categories) ||
      categories.length === 0 ||
      categories.some((c) => typeof c !== "string" || !c.trim())
    ) {
      return NextResponse.json(
        { success: false, message: "At least one category is required." },
        { status: 400 }
      );
    }

    await connectDB();

    const updated = await Settings.findOneAndUpdate(
      { key: "app" },
      {
        storeName: storeName.trim(),
        address: typeof address === "string" ? address.trim() : "",
        phone: typeof phone === "string" ? phone.trim() : "",
        email: typeof email === "string" ? email.trim() : "",
        taxId: typeof taxId === "string" ? taxId.trim() : "",
        currencyCode: typeof currencyCode === "string" ? currencyCode.trim() : "USD",
        taxEnabled: Boolean(taxEnabled),
        taxLabel: taxLabel.trim(),
        taxRate,
        taxInclusive: Boolean(taxInclusive),
        receiptPrefix: receiptPrefix.trim().toUpperCase(),
        receiptHeader: typeof receiptHeader === "string" ? receiptHeader.trim() : "",
        receiptFooter: typeof receiptFooter === "string" ? receiptFooter.trim() : "",
        receiptShowCashier: Boolean(receiptShowCashier),
        receiptShowTaxId: Boolean(receiptShowTaxId),
        receiptPaper: receiptPaper === "58mm" ? "58mm" : "80mm",
        autoPrint: Boolean(autoPrint),
        lowStockThreshold,
        categories: categories.map((c: string) => c.trim()),
        autoSync: Boolean(autoSync),
      },
      { new: true, upsert: true, runValidators: true }
    ).lean();

    return NextResponse.json({
      success: true,
      message: "Settings saved successfully.",
      settings: {
        storeName: updated.storeName,
        address: updated.address,
        phone: updated.phone,
        email: updated.email,
        taxId: updated.taxId,
        currencyCode: updated.currencyCode,
        taxEnabled: updated.taxEnabled,
        taxLabel: updated.taxLabel,
        taxRate: updated.taxRate,
        taxInclusive: updated.taxInclusive,
        receiptPrefix: updated.receiptPrefix,
        receiptHeader: updated.receiptHeader,
        receiptFooter: updated.receiptFooter,
        receiptShowCashier: updated.receiptShowCashier,
        receiptShowTaxId: updated.receiptShowTaxId,
        receiptPaper: updated.receiptPaper,
        autoPrint: updated.autoPrint,
        lowStockThreshold: updated.lowStockThreshold,
        categories: updated.categories,
        autoSync: updated.autoSync,
      },
    });
  } catch (error) {
    console.error("Failed to save settings:", error);

    return NextResponse.json(
      { success: false, message: "Failed to save settings." },
      { status: 500 }
    );
  }
}
