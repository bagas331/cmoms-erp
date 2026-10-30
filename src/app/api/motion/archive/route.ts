import { NextResponse } from 'next/server';
import { autoArchiveCompletedTasks } from '@/lib/supabase-store';
import { resolveAuthenticatedUser } from '@/lib/server-auth';
import { computeArchivePeriod } from '@/lib/archive-engine';

/**
 * POST /api/motion/archive
 * Executes automated monthly archive for completed past-month motion & creative tasks.
 * Can be triggered via Cron scheduler or manually by Admin / Team Lead.
 */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const cronSecret = process.env.CRON_SECRET || 'cmoms_monthly_archive_secret';
    const isCronAuthorized = authHeader === `Bearer ${cronSecret}`;

    if (!isCronAuthorized) {
      const user = await resolveAuthenticatedUser(req);
      if (!user) {
        return NextResponse.json(
          { success: false, message: 'Autentikasi diperlukan untuk memicu auto-archive.' },
          { status: 401 }
        );
      }
      if (!['ADMIN', 'TEAM_LEAD'].includes(user.role_name)) {
        return NextResponse.json(
          { success: false, message: 'Hanya Admin atau Team Lead yang dapat menjalankan prosedur auto-archive.' },
          { status: 403 }
        );
      }
    }

    const result = await autoArchiveCompletedTasks();
    const currentPeriod = computeArchivePeriod(new Date().toISOString());

    return NextResponse.json({
      success: true,
      message: 'Proses auto-archive pergantian bulan berhasil dijalankan.',
      data: {
        archivedCount: (result.archivedTasks?.length || 0) + (result.archivedMotionTasks?.length || 0),
        archivedTasks: result.archivedTasks,
        archivedMotionTasks: result.archivedMotionTasks,
        period: currentPeriod,
        timestamp: new Date().toISOString()
      }
    });
  } catch (err: any) {
    console.error('Error in /api/motion/archive:', err);
    return NextResponse.json(
      { success: false, message: 'Gagal menjalankan auto-archive', error: err?.message || String(err) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/motion/archive
 * Health check or query current period status
 */
export async function GET(req: Request) {
  const currentPeriod = computeArchivePeriod(new Date().toISOString());
  return NextResponse.json({
    success: true,
    message: 'Motion Archive Automation Service is ready',
    currentPeriod,
    timestamp: new Date().toISOString()
  });
}
