import { NextResponse } from 'next/server';
import {
  getAuthService,
  AuthConfigurationError,
  AuthError,
  AuthRateLimitError,
  getClientIp,
  verifyCsrfAndOrigin,
} from '@/lib/auth';

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
        { success: false, message: 'Invalid JSON request payload.' },
        { status: 400 }
      );
    }

    const { email } = body ?? {};
    const ipAddress = getClientIp(request);

    const authService = getAuthService();
    const result = await authService.forgotPassword({
      email: typeof email === 'string' ? email : '',
      ipAddress,
    });

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    if (error instanceof AuthRateLimitError) {
      return NextResponse.json(
        { success: false, message: error.message },
        {
          status: 429,
          headers: { 'Retry-After': String(error.retryAfterSec) },
        }
      );
    }
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
    console.error('Unexpected error in forgot-password:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json(
      { success: false, message: 'An unexpected error occurred while processing password reset.' },
      { status: 500 }
    );
  }
}
