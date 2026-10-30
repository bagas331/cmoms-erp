import { NextResponse } from 'next/server';
import { markNotificationAsRead, markNotificationsRead, getNotifications } from '@/lib/supabase-store';
import { resolveAuthenticatedUser } from '@/lib/server-auth';

/**
 * POST /api/notifications/read
 * Marks a notification as read or marks all notifications for authenticated user as read.
 * Protected against IDOR: User cannot mark another user's notifications as read.
 */
export async function POST(req: Request) {
  try {
    const user = await resolveAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, message: 'Autentikasi diperlukan' },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => null);

    const { notification_id, mark_all } = body || {};

    if (mark_all) {
      await markNotificationsRead(user.id);
      return NextResponse.json({
        success: true,
        message: 'Semua notifikasi telah ditandai sebagai dibaca'
      });
    }

    if (!notification_id) {
      return NextResponse.json(
        { success: false, message: 'notification_id atau mark_all wajib disertakan' },
        { status: 400 }
      );
    }

    // IDOR Check: Ensure notification belongs to user
    const userNotifs = await getNotifications(user.id);
    const targetNotif = userNotifs.find(n => n.id === notification_id);
    if (!targetNotif && user.role_name !== 'ADMIN') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: Notifikasi tidak ditemukan atau bukan milik Anda' },
        { status: 403 }
      );
    }

    await markNotificationAsRead(notification_id);

    return NextResponse.json({
      success: true,
      message: 'Notifikasi berhasil ditandai sebagai dibaca',
      notification_id
    });
  } catch (err: any) {
    console.error('API POST notifications read error:', err);
    return NextResponse.json(
      { success: false, message: err?.message || 'Gagal menandai notifikasi dibaca' },
      { status: 500 }
    );
  }
}
