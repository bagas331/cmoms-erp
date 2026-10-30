// ============================================================
// CMOS - API Route: Google Sheets Real-Time Sync Outbox & Status
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthenticatedUser } from '@/lib/server-auth';
import {
  getSyncOutboxSummary,
  getSyncOutboxItems,
  retryFailedOutboxItem,
  getTargetSpreadsheetId,
} from '@/lib/google-sheets-outbox';
import {
  processSyncOutbox,
  getGoogleServiceAccountConfig,
  ensureTabHeaders,
} from '@/lib/google-sheets-server';
import { checkRateLimit } from '@/lib/rate-limiter';
import { RoleName } from '@/lib/types';

const ALLOWED_ROLES: RoleName[] = [
  'ADMIN',
  'TEAM_LEAD',
  'STRATEGIC_PIC',
  'DESIGNER',
  'MOTION_PIC',
  'REQUESTER',
  'OPERATOR',
];

export async function GET(req: NextRequest) {
  try {
    const authUser = await resolveAuthenticatedUser(req);
    if (!authUser) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized: Harap login terlebih dahulu.' },
        { status: 401 }
      );
    }

    if (!ALLOWED_ROLES.includes(authUser.role_name)) {
      return NextResponse.json(
        { success: false, message: 'Forbidden: Role Anda tidak memiliki akses ke status sinkronisasi.' },
        { status: 403 }
      );
    }

    const summary = await getSyncOutboxSummary();
    const items = await getSyncOutboxItems(30);
    const config = getGoogleServiceAccountConfig();
    const spreadsheetId = getTargetSpreadsheetId();

    return NextResponse.json({
      success: true,
      summary,
      items,
      config: {
        isConfigured: Boolean(config),
        clientEmail: config ? config.clientEmail : null,
        spreadsheetId,
        targetTabs: ['Mockup', 'By Strategic', 'Motion'],
      },
    });
  } catch (err: unknown) {
    const msg = (err as Error).message || 'Terjadi kesalahan pada server saat memuat status sinkronisasi.';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await resolveAuthenticatedUser(req);
    if (!authUser) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized: Harap login terlebih dahulu.' },
        { status: 401 }
      );
    }

    // Only Admin or Team Lead can trigger privileged actions
    if (!['ADMIN', 'TEAM_LEAD'].includes(authUser.role_name)) {
      return NextResponse.json(
        { success: false, message: 'Forbidden: Hanya Admin dan Team Lead yang dapat mengelola antrean sinkronisasi.' },
        { status: 403 }
      );
    }

    // Rate limiting to prevent abuse
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const rateLimitKey = `sync_post_${authUser.id}_${ip}`;
    if (!checkRateLimit(rateLimitKey, 10, 60)) {
      return NextResponse.json(
        { success: false, message: 'Terlalu banyak permintaan. Silakan tunggu beberapa saat.' },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'PROCESS_QUEUE';

    if (action === 'RETRY_ITEM') {
      const itemId = body.itemId;
      if (!itemId) {
        return NextResponse.json({ success: false, message: 'Parameter itemId wajib diisi.' }, { status: 400 });
      }
      await retryFailedOutboxItem(itemId);
      return NextResponse.json({ success: true, message: `Item ${itemId} dijadwalkan untuk dicoba ulang.` });
    }

    if (action === 'TEST_CONNECTION') {
      const config = getGoogleServiceAccountConfig();
      if (!config) {
        return NextResponse.json({
          success: false,
          message: 'Google Service Account belum dikonfigurasi pada environment server.',
        }, { status: 400 });
      }

      const spreadsheetId = getTargetSpreadsheetId();
      await ensureTabHeaders(spreadsheetId, 'Mockup');
      await ensureTabHeaders(spreadsheetId, 'By Strategic');
      await ensureTabHeaders(spreadsheetId, 'Motion');

      return NextResponse.json({
        success: true,
        message: 'Koneksi ke Google Sheets API berhasil diverifikasi. Header pada ketiga tab telah dipastikan.',
      });
    }

    // Default: Process Queue
    const result = await processSyncOutbox();
    const summary = await getSyncOutboxSummary();

    return NextResponse.json({
      success: true,
      message: `Pemrosesan antrean selesai. ${result.succeeded} berhasil, ${result.failed} gagal.`,
      result,
      summary,
    });
  } catch (err: unknown) {
    const msg = (err as Error).message || 'Gagal memproses sinkronisasi.';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
