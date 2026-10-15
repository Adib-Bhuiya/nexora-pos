
import mongoose from "mongoose";

const cached = globalThis as typeof globalThis & {
  mongoosePromise?: Promise<typeof mongoose>;
};

export async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("Please define MONGODB_URI in .env.local");
  }

  if (!cached.mongoosePromise) {
    cached.mongoosePromise = mongoose.connect(uri).catch((err) => {
      cached.mongoosePromise = undefined;
      throw err;
    });
  }

  return cached.mongoosePromise;
}

export async function withTransactionIfSupported<T>(
  fn: (session?: mongoose.ClientSession) => Promise<T>
): Promise<T> {
  await connectDB();
  const session = await mongoose.startSession();
  try {
    let result: T;
    try {
      result = await session.withTransaction(async () => {
        return await fn(session);
      });
      return result;
    } catch (txError: unknown) {
      const msg = txError instanceof Error ? txError.message : String(txError);
      const code =
        typeof txError === "object" && txError !== null && "code" in txError
          ? (txError as { code: unknown }).code
          : undefined;

      // Standalone MongoDB instances do not support multi-document transactions.
      if (
        msg.includes("replica set") ||
        msg.includes("Transaction numbers are only allowed") ||
        code === 20
      ) {
        return await fn(undefined);
      }
      throw txError;
    }
  } finally {
    await session.endSession();
  }
}
