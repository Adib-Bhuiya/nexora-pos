import { NextResponse } from 'next/server';
import {
  getAuthService,
  AuthConfigurationError,
  extractTokenFromRequest,
  verifyCsrfAndOrigin,
  buildClearCookieHeader,
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

    const rawToken = extractTokenFromRequest(request);
    let clearCookieHeader = buildClearCookieHeader();

    try {
      const authService = getAuthService();
      clearCookieHeader = await authService.logout(rawToken);
    } catch (err) {
      if (!(err instanceof AuthConfigurationError)) {
        throw err;
      }
      // If service is unconfigured, still clear cookie for client
    }

    const res = NextResponse.json({
      success: true,
      message: 'Logged out successfully.',
    });

    res.headers.set('Set-Cookie', clearCookieHeader);
    return res;
  } catch (error) {
    console.error('Logout failed:', error);
    return NextResponse.json(
      { success: false, message: 'Logout failed.' },
      { status: 500 }
    );
  }
}
