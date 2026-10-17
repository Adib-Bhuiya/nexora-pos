import { NextResponse } from 'next/server';
import { revokeSession, verifyCsrfAndOrigin } from '@/lib/auth-server';

export async function POST(request: Request) {
  try {
    const csrfCheck = verifyCsrfAndOrigin(request);
    if (!csrfCheck.valid) {
      return NextResponse.json(
        { success: false, message: csrfCheck.reason || 'CSRF validation failed.' },
        { status: 403 }
      );
    }

    const clearCookieHeader = await revokeSession(request);

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
