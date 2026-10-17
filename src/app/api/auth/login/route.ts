import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import User from '@/models/User';
import {
  ensureAuthIndexes,
  verifyPassword,
  createSession,
  checkRateLimit,
  getClientIp,
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

    const ip = getClientIp(request);
    const rateCheck = await checkRateLimit(`login:${ip}`, 5, 15 * 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: `Too many login attempts. Please try again in ${rateCheck.retryAfterSec ?? 900} seconds.`,
        },
        { status: 429 }
      );
    }

    await connectDB();
    await ensureAuthIndexes();

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: 'Invalid JSON request body.' },
        { status: 400 }
      );
    }

    const { email, password } = body ?? {};

    if (
      typeof email !== 'string' ||
      !email.trim() ||
      typeof password !== 'string' ||
      !password
    ) {
      return NextResponse.json(
        { success: false, message: 'Email and password are required.' },
        { status: 400 }
      );
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    });

    if (!user) {
      return NextResponse.json(
        { success: false, message: 'Invalid email or password.' },
        { status: 401 }
      );
    }

    if (!user.active) {
      return NextResponse.json(
        { success: false, message: 'This account has been deactivated.' },
        { status: 401 }
      );
    }

    const passwordValid = await verifyPassword(password, user.passwordHash || '');
    if (!passwordValid) {
      return NextResponse.json(
        { success: false, message: 'Invalid email or password.' },
        { status: 401 }
      );
    }

    const { cookieHeader } = await createSession(
      user._id.toString(),
      user.role,
      user.name,
      request
    );

    const res = NextResponse.json({
      success: true,
      message: 'Logged in successfully.',
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        isOwner: Boolean(user.isOwner),
        initials: user.initials,
      },
    });

    res.headers.set('Set-Cookie', cookieHeader);
    return res;
  } catch (error) {
    console.error('Login failed:', error);
    return NextResponse.json(
      { success: false, message: 'Login failed.' },
      { status: 500 }
    );
  }
}
