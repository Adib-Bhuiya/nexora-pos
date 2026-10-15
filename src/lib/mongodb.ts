
import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("Please define MONGODB_URI in .env.local");
}

const cached = globalThis as typeof globalThis & {
  mongoosePromise?: Promise<typeof mongoose>;
};

export async function connectDB() {
  if (!cached.mongoosePromise) {
    cached.mongoosePromise = mongoose.connect(MONGODB_URI!);
  }

  return cached.mongoosePromise;
}
