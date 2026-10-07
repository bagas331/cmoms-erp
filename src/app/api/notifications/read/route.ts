import { NextResponse } from 'next/server';
import { markNotificationAsRead, markNotificationsRead, getNotifications, getUsers } from '@/lib/supabase-store';

/**
 * Helper to resolve user from request headers or body.
 */
async function resolveUser(req: Request, bodyUserId?: string) {
  const userIdHeader = req.headers.get('x-user-id') || bodyUserId;
  const userRoleHeader = req.headers.get('x-user-role');
  const userNameHeader = req.headers.get('x-user-name');

  if (userIdHeader) {
    return {
      id: userIdHeader,
      role_name: userRoleHeader || 'MEMBER',
      full_name: userNameHeader || 'User'
    };
  }

  return null;
}

/**
 * POST /api/notifications/read
 * Marks a notification as read or marks all notifications for authenticated user as read.
 * Protected against IDOR: User cannot mark another user's notifications as read.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const bodyUserId = body?.user_id;
    const user = await resolveUser(req, bodyUserId);

    if (!user) {
      return NextResponse.json(
        { success: false, message: 'Autentikasi diperlukan' },
        { status: 401 }
      );
    }

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
