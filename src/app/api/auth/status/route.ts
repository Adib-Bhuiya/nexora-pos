import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import User from '@/models/User';
import { ensureAuthIndexes, getSessionUser } from '@/lib/auth-server';

export async function GET(request: Request) {
  try {
    await connectDB();
    await ensureAuthIndexes();

    const userCount = await User.countDocuments();
    const initialized = userCount > 0;

    const authContext = await getSessionUser(request);

    return NextResponse.json({
      success: true,
      initialized,
      authenticated: Boolean(authContext),
      user: authContext ? authContext.user : null,
    });
  } catch (error) {
    console.error('Failed to get auth status:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to retrieve auth status.' },
      { status: 500 }
    );
  }
}
