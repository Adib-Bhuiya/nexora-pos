import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import User from '@/models/User';
import {
  ensureAuthIndexes,
  getSessionUser,
  hashPin,
  verifyCsrfAndOrigin,
} from '@/lib/auth-server';

function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'CA';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export async function GET(request: Request) {
  try {
    await connectDB();
    const auth = await getSessionUser(request);

    if (!auth) {
      return NextResponse.json(
        { success: false, message: 'Authentication required.' },
        { status: 401 }
      );
    }

    if (auth.user.role !== 'owner') {
      return NextResponse.json(
        { success: false, message: 'Only store owners can manage staff accounts.' },
        { status: 403 }
      );
    }

    const users = await User.find().sort({ isOwner: -1, createdAt: 1 }).lean();

    return NextResponse.json({
      success: true,
      users: users.map((u) => ({
        id: u._id.toString(),
        name: u.name,
        email: u.email || '',
        role: u.role,
        isOwner: Boolean(u.isOwner),
        initials: u.initials,
        active: Boolean(u.active),
        hasPin: Boolean(u.pinHash),
        createdAt: u.createdAt,
      })),
    });
  } catch (error) {
    console.error('Failed to list users:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to retrieve staff users.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const csrfCheck = verifyCsrfAndOrigin(request);
    if (!csrfCheck.valid) {
      return NextResponse.json(
        { success: false, message: csrfCheck.reason || 'CSRF validation failed.' },
        { status: 403 }
      );
    }

    await connectDB();
    await ensureAuthIndexes();

    const auth = await getSessionUser(request);
    if (!auth) {
      return NextResponse.json(
        { success: false, message: 'Authentication required.' },
        { status: 401 }
      );
    }

    if (auth.user.role !== 'owner') {
      return NextResponse.json(
        { success: false, message: 'Only store owners can create cashier accounts.' },
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

    const { name, pin } = body ?? {};

    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { success: false, message: 'Cashier name is required.' },
        { status: 400 }
      );
    }

    if (typeof pin !== 'string' || !/^\d{6}$/.test(pin.trim())) {
      return NextResponse.json(
        { success: false, message: 'A 6-digit numeric PIN is required for cashier accounts.' },
        { status: 400 }
      );
    }

    const pinHash = await hashPin(pin.trim());
    const initials = computeInitials(name);

    const user = await User.create({
      name: name.trim(),
      pinHash,
      role: 'cashier',
      isOwner: false,
      initials,
      active: true,
    });

    return NextResponse.json(
      {
        success: true,
        message: `Cashier account created for ${user.name}.`,
        user: {
          id: user._id.toString(),
          name: user.name,
          role: 'cashier',
          isOwner: false,
          initials: user.initials,
          active: true,
          hasPin: true,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to create cashier:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to create cashier account.' },
      { status: 500 }
    );
  }
}
