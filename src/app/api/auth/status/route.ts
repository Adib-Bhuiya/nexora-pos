import { NextResponse } from 'next/server';
import {
  getAuthService,
  AuthConfigurationError,
  extractTokenFromRequest,
} from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const authService = getAuthService();
    const token = extractTokenFromRequest(request);
    const status = await authService.getAuthStatus(token);

    return NextResponse.json({
      success: true,
      initialized: status.initialized,
      authenticated: status.authenticated,
      user: status.user,
    });
  } catch (error) {
    if (error instanceof AuthConfigurationError) {
      return NextResponse.json(
        {
          success: false,
          initialized: false,
          authenticated: false,
          message: error.message,
        },
        { status: 503 }
      );
    }

    console.error('Failed to get auth status:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to retrieve auth status.' },
      { status: 500 }
    );
  }
}
