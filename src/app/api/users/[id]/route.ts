import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/mongodb';
import User from '@/models/User';
import {
  getSessionUser,
  hashPin,
  revokeAllUserSessions,
  verifyCsrfAndOrigin,
} from '@/lib/auth-server';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const csrfCheck = verifyCsrfAndOrigin(request);
    if (!csrfCheck.valid) {
      return NextResponse.json(
        { success: false, message: csrfCheck.reason || 'CSRF validation failed.' },
        { status: 403 }
      );
    }

    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json(
        { success: false, message: 'Invalid user ID.' },
        { status: 400 }
      );
    }

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
        { success: false, message: 'Only store owners can update staff accounts.' },
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

    const { name, active, pin } = body ?? {};
    const updates: Record<string, unknown> = {};

    if (typeof name === 'string' && name.trim()) {
      updates.name = name.trim();
    }

    if (typeof active === 'boolean') {
      updates.active = active;
      // If deactivating user, immediately revoke all of their active sessions
      if (!active) {
        await revokeAllUserSessions(id);
      }
    }

    if (typeof pin === 'string' && pin.trim()) {
      if (!/^\d{6}$/.test(pin.trim())) {
        return NextResponse.json(
          { success: false, message: 'PIN must be exactly 6 digits.' },
          { status: 400 }
        );
      }
      updates.pinHash = await hashPin(pin.trim());
      // Reset lockout status if PIN is reset
      updates.failedPinAttempts = 0;
      updates.pinLockedUntil = null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, message: 'No valid fields provided for update.' },
        { status: 400 }
      );
    }

    const targetUser = await User.findById(id);
    if (!targetUser) {
      return NextResponse.json(
        { success: false, message: 'User not found.' },
        { status: 404 }
      );
    }

    // Protect owner from being deactivated through this endpoint
    if (targetUser.isOwner && updates.active === false) {
      return NextResponse.json(
        { success: false, message: 'The primary owner account cannot be deactivated.' },
        { status: 400 }
      );
    }

    const updatedUser = await User.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    }).lean();

    return NextResponse.json({
      success: true,
      message: 'Staff user updated successfully.',
      user: {
        id: updatedUser._id.toString(),
        name: updatedUser.name,
        email: updatedUser.email || '',
        role: updatedUser.role,
        isOwner: Boolean(updatedUser.isOwner),
        initials: updatedUser.initials,
        active: Boolean(updatedUser.active),
        hasPin: Boolean(updatedUser.pinHash),
      },
    });
  } catch (error) {
    console.error('Failed to update user:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to update staff user.' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const csrfCheck = verifyCsrfAndOrigin(request);
    if (!csrfCheck.valid) {
      return NextResponse.json(
        { success: false, message: csrfCheck.reason || 'CSRF validation failed.' },
        { status: 403 }
      );
    }

    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json(
        { success: false, message: 'Invalid user ID.' },
        { status: 400 }
      );
    }

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
        { success: false, message: 'Only store owners can delete staff accounts.' },
        { status: 403 }
      );
    }

    const targetUser = await User.findById(id);
    if (!targetUser) {
      return NextResponse.json(
        { success: false, message: 'User not found.' },
        { status: 404 }
      );
    }

    if (targetUser.isOwner) {
      return NextResponse.json(
        { success: false, message: 'The store owner account cannot be deleted.' },
        { status: 403 }
      );
    }

    // Revoke all active sessions for this user
    await revokeAllUserSessions(id);
    await User.findByIdAndDelete(id);

    return NextResponse.json({
      success: true,
      message: 'Staff user deleted successfully.',
    });
  } catch (error) {
    console.error('Failed to delete user:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to delete staff user.' },
      { status: 500 }
    );
  }
}
