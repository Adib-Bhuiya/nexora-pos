import { NextResponse } from 'next/server';
import {
  getAuthService,
  AuthConfigurationError,
  AuthError,
  verifyCsrfAndOrigin,
} from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const authService = getAuthService();
    const auth = await authService.authenticateRequest(request);

    if (!auth) {
      return NextResponse.json(
        { success: false, message: 'Authentication required.' },
        { status: 401 }
      );
    }

    const staffUsers = await authService.listStaff(auth.user);

    return NextResponse.json({
      success: true,
      users: staffUsers,
    });
  } catch (error) {
    if (error instanceof AuthConfigurationError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 503 }
      );
    }
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      );
    }
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

    const authService = getAuthService();
    const auth = await authService.authenticateRequest(request);

    if (!auth) {
      return NextResponse.json(
        { success: false, message: 'Authentication required.' },
        { status: 401 }
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
    const createdUser = await authService.createCashier(auth.user, { name, pin });

    return NextResponse.json(
      {
        success: true,
        message: `Cashier account created for ${createdUser.name}.`,
        user: createdUser,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof AuthConfigurationError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 503 }
      );
    }
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      );
    }
    console.error('Failed to create cashier:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to create cashier account.' },
      { status: 500 }
    );
  }
}
