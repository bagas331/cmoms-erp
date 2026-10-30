// ============================================================
// CMOS - Campaign Usage Management API Route
// Strictly READ-ONLY. Secured via server-auth HMAC & RBAC.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthenticatedUser } from '@/lib/server-auth';
import { fetchGoogleSheetsCampaignData } from '@/lib/google-sheets-adapter';
import { RoleName } from '@/lib/types';

// Allowed roles to view Campaign Usage Management
const ALLOWED_ROLES: RoleName[] = [
  'ADMIN',
  'TEAM_LEAD',
  'STRATEGIC_PIC',
  'DESIGNER',
  'MOTION_PIC',
  'REQUESTER',
  'OPERATOR',
];

// In-memory rate limiting map for forced refresh requests: userId -> timestamp
const refreshRateLimitMap = new Map<string, number>();
const REFRESH_COOLDOWN_MS = 6000; // 6 seconds per user

export async function GET(req: NextRequest) {
  try {
    // 1. Authoritative Server-side Authentication & RBAC
    const user = await resolveAuthenticatedUser(req);

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: 'Unauthorized: Sesi autentikasi tidak valid atau telah kedaluwarsa.',
        },
        { status: 401 }
      );
    }

    if (!user.is_active) {
      return NextResponse.json(
        {
          success: false,
          message: 'Forbidden: Akun pengguna dinonaktifkan.',
        },
        { status: 403 }
      );
    }

    if (!ALLOWED_ROLES.includes(user.role_name)) {
      return NextResponse.json(
        {
          success: false,
          message: 'Forbidden: Role Anda tidak memiliki izin mengakses Campaign Usage Management.',
        },
        { status: 403 }
      );
    }

    // 2. Query parameters
    const { searchParams } = new URL(req.url);
    const forceRefresh = searchParams.get('refresh') === 'true';

    // 3. Rate limiting for forced refresh
    if (forceRefresh) {
      const now = Date.now();
      const lastRefresh = refreshRateLimitMap.get(user.id) || 0;
      if (now - lastRefresh < REFRESH_COOLDOWN_MS) {
        const waitSec = Math.ceil((REFRESH_COOLDOWN_MS - (now - lastRefresh)) / 1000);
        return NextResponse.json(
          {
            success: false,
            message: `Terlalu banyak permintaan refresh. Harap tunggu ${waitSec} detik sebelum mencoba lagi.`,
          },
          { status: 429 }
        );
      }
      refreshRateLimitMap.set(user.id, now);
    }

    // 4. Fetch Read-Only Data via Adapter
    const campaignData = await fetchGoogleSheetsCampaignData({ forceRefresh });

    return NextResponse.json(campaignData, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    });
  } catch (err) {
    const errorMsg = (err as Error).message || 'Internal Server Error';
    console.error('[CAMPAIGN_API_ERROR]', errorMsg);

    return NextResponse.json(
      {
        success: false,
        message: 'Gagal memproses data Campaign Usage.',
        error: process.env.NODE_ENV === 'development' ? errorMsg : undefined,
      },
      { status: 500 }
    );
  }
}
