import { NextResponse } from 'next/server';
import {
  getAuthService,
  AuthConfigurationError,
  AuthError,
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

    const authService = getAuthService();

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
    const ipAddress = getClientIp(request);
    const userAgent = request.headers.get('user-agent') || undefined;

    const result = await authService.loginOwner({
      email,
      password,
      ipAddress,
      userAgent,
    });

    const response = NextResponse.json({
      success: true,
      message: 'Logged in successfully.',
      user: result.user,
    });

    response.headers.set('Set-Cookie', result.cookieHeader);
    return response;
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

    console.error('Login error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal error during login.' },
      { status: 500 }
    );
  }
}
