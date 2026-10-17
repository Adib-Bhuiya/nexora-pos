import { NextResponse } from 'next/server';
import {
  getAuthService,
  AuthConfigurationError,
  AuthError,
  getClientIp,
} from '@/lib/auth';

export async function POST(request: Request) {
  try {
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

    const { setupKey, name, email, password, pin } = body ?? {};
    const ipAddress = getClientIp(request);
    const userAgent = request.headers.get('user-agent') || undefined;

    const result = await authService.setupOwner({
      setupKey,
      name,
      email,
      password,
      pin,
      ipAddress,
      userAgent,
    });

    const response = NextResponse.json(
      {
        success: true,
        message: 'Store owner account initialized successfully.',
        user: result.user,
      },
      { status: 201 }
    );

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

    console.error('Owner setup error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal error during owner setup.' },
      { status: 500 }
    );
  }
}
