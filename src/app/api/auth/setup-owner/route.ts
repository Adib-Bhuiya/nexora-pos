import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import User from '@/models/User';
import {
  ensureAuthIndexes,
  verifySetupKey,
  hashPassword,
  hashPin,
  createSession,
  checkRateLimit,
  getClientIp,
} from '@/lib/auth-server';

function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'OW';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const rateCheck = await checkRateLimit(`setup:${ip}`, 5, 60 * 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: `Too many setup attempts. Please try again in ${rateCheck.retryAfterSec ?? 3600} seconds.`,
        },
        { status: 429 }
      );
    }

    await connectDB();
    await ensureAuthIndexes();

    // 1. Strict zero-user check: rejects if ANY user exists
    const totalUsers = await User.countDocuments();
    if (totalUsers > 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'Initial owner setup is permanently disabled once an account exists.',
        },
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

    const { setupKey, name, email, password, pin } = body ?? {};

    // 2. Constant-length timing-safe setup key verification
    if (!verifySetupKey(setupKey)) {
      return NextResponse.json(
        { success: false, message: 'Invalid setup key.' },
        { status: 401 }
      );
    }

    // 3. Server-side validation
    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { success: false, message: 'Owner name is required.' },
        { status: 400 }
      );
    }

    if (
      typeof email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      return NextResponse.json(
        { success: false, message: 'A valid email address is required.' },
        { status: 400 }
      );
    }

    if (
      typeof password !== 'string' ||
      password.length < 8 ||
      !/[A-Za-z]/.test(password) ||
      !/[0-9]/.test(password)
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Password must be at least 8 characters long and contain both letters and numbers.',
        },
        { status: 400 }
      );
    }

    if (pin && (typeof pin !== 'string' || !/^\d{6}$/.test(pin.trim()))) {
      return NextResponse.json(
        { success: false, message: 'PIN must be exactly 6 digits.' },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(password);
    const pinHash = pin ? await hashPin(pin.trim()) : '';
    const initials = computeInitials(name);

    // 4. Create owner with database unique partial index safeguard
    let user: any;
    try {
      user = await User.create({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        passwordHash,
        pinHash,
        role: 'owner',
        isOwner: true,
        initials,
        active: true,
      });
    } catch (createError: any) {
      if (createError && createError.code === 11000) {
        return NextResponse.json(
          {
            success: false,
            message: 'An owner account has already been registered.',
          },
          { status: 409 }
        );
      }
      throw createError;
    }

    // 5. Issue session
    const { cookieHeader } = await createSession(
      user._id.toString(),
      'owner',
      user.name,
      request
    );

    const res = NextResponse.json(
      {
        success: true,
        message: 'Owner account initialized successfully.',
        user: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: 'owner',
          isOwner: true,
          initials: user.initials,
        },
      },
      { status: 201 }
    );

    res.headers.set('Set-Cookie', cookieHeader);
    return res;
  } catch (error) {
    console.error('Owner setup failed:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to complete owner setup.' },
      { status: 500 }
    );
  }
}
