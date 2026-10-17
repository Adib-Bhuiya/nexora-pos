import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/mongodb';
import User from '@/models/User';
import {
  ensureAuthIndexes,
  verifyPin,
  createSession,
  verifyCsrfAndOrigin,
} from '@/lib/auth-server';

export async function POST(request: Request) {
  try {
    const csrfCheck = verifyCsrfAndOrigin(request);
    if (!csrfCheck.valid) {
      return NextResponse.json(
        { success: false, message: csrfCheck.reason || 'CSRF validation failed.' },
        { status: 403 }
      );
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: 'Invalid JSON request body.' },
        { status: 400 }
      );
    }

    const { userId, pin } = body ?? {};

    if (
      typeof userId !== 'string' ||
      !mongoose.isValidObjectId(userId) ||
      typeof pin !== 'string' ||
      !/^\d{6}$/.test(pin.trim())
    ) {
      return NextResponse.json(
        { success: false, message: 'Provide a valid user ID and 6-digit numeric PIN.' },
        { status: 400 }
      );
    }

    await connectDB();
    await ensureAuthIndexes();

    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json(
        { success: false, message: 'User not found.' },
        { status: 404 }
      );
    }

    if (!user.active) {
      return NextResponse.json(
        { success: false, message: 'This account has been deactivated.' },
        { status: 401 }
      );
    }

    // Check account lockout
    const now = new Date();
    if (user.pinLockedUntil && new Date(user.pinLockedUntil) > now) {
      const waitMin = Math.ceil(
        (new Date(user.pinLockedUntil).getTime() - now.getTime()) / (60 * 1000)
      );
      return NextResponse.json(
        {
          success: false,
          message: `Account is temporarily locked due to repeated failed PIN attempts. Try again in ${waitMin} minute(s).`,
        },
        { status: 429 }
      );
    }

    const isPinValid = await verifyPin(pin.trim(), user.pinHash || '');

    if (!isPinValid) {
      user.failedPinAttempts = (user.failedPinAttempts || 0) + 1;
      const remaining = Math.max(0, 5 - user.failedPinAttempts);

      if (user.failedPinAttempts >= 5) {
        user.pinLockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15-minute lockout
        await user.save();
        return NextResponse.json(
          {
            success: false,
            message: 'Too many incorrect PIN attempts. Account locked for 15 minutes.',
          },
          { status: 429 }
        );
      }

      await user.save();
      return NextResponse.json(
        {
          success: false,
          message: `Invalid PIN. ${remaining} attempt(s) remaining before temporary lockout.`,
        },
        { status: 401 }
      );
    }

    // Successful login: reset failed attempts
    user.failedPinAttempts = 0;
    user.pinLockedUntil = null;
    await user.save();

    // PIN authentication always issues cashier-scoped sessions; it never grants owner privileges
    const sessionRole = 'cashier';

    const { cookieHeader } = await createSession(
      user._id.toString(),
      sessionRole,
      user.name,
      request
    );

    const res = NextResponse.json({
      success: true,
      message: 'PIN verified successfully.',
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: sessionRole,
        isOwner: false,
        initials: user.initials,
      },
    });

    res.headers.set('Set-Cookie', cookieHeader);
    return res;
  } catch (error) {
    console.error('PIN login failed:', error);
    return NextResponse.json(
      { success: false, message: 'PIN login failed.' },
      { status: 500 }
    );
  }
}
