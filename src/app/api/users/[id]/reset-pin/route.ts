import { NextResponse } from 'next/server';
import {
  getAuthService,
  AuthConfigurationError,
  AuthError,
  verifyCsrfAndOrigin,
} from '@/lib/auth';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const csrfCheck = verifyCsrfAndOrigin(request);
    if (!csrfCheck.valid) {
      return NextResponse.json(
        { success: false, message: csrfCheck.reason || 'CSRF validation failed.' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const authService = getAuthService();
    const auth = await authService.authenticateRequest(request);

    if (!auth) {
      return NextResponse.json(
        { success: false, message: 'Authentication required.' },
        { status: 401 }
      );
    }

    if (auth.user.role !== 'owner') {
      return NextResponse.json(
        { success: false, message: 'Only store owners can reset cashier PINs.' },
        { status: 403 }
      );
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: 'Invalid JSON request payload.' },
        { status: 400 }
      );
    }

    const { pin, confirmPin } = body ?? {};
    const updatedCashier = await authService.resetCashierPin(auth.user, id, {
      pin: typeof pin === 'string' ? pin : '',
      confirmPin: typeof confirmPin === 'string' ? confirmPin : undefined,
    });

    return NextResponse.json({
      success: true,
      message: 'Cashier PIN reset successfully.',
      user: updatedCashier,
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
    console.error('Failed to reset cashier PIN:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json(
      { success: false, message: 'Failed to reset cashier PIN.' },
      { status: 500 }
    );
  }
}
