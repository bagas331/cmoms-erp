import { NextResponse } from 'next/server';
import { getNotifications, getUsers } from '@/lib/supabase-store';
import { Notification } from '@/lib/types';

/**
 * Helper to resolve user from request headers or query.
 */
async function resolveUser(req: Request) {
  const userIdHeader = req.headers.get('x-user-id');
  const userRoleHeader = req.headers.get('x-user-role');
  const userNameHeader = req.headers.get('x-user-name');

  if (userIdHeader) {
    return {
      id: userIdHeader,
      role_name: userRoleHeader || 'MEMBER',
      full_name: userNameHeader || 'User'
    };
  }

  const url = new URL(req.url);
  const queryUserId = url.searchParams.get('userId');
  if (queryUserId) {
    const allUsers = await getUsers();
    const matched = allUsers.find(u => u.id === queryUserId);
    if (matched) return matched;
  }

  return null;
}

/**
 * GET /api/notifications
 * Fetches notifications for authenticated user.
 * Protected against IDOR: User can only read their own notifications unless ADMIN.
 */
export async function GET(req: Request) {
  try {
    const user = await resolveUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, message: 'Autentikasi diperlukan untuk mengakses notifikasi' },
        { status: 401 }
      );
    }

    const url = new URL(req.url);
    const targetUserId = url.searchParams.get('userId') || user.id;

    // IDOR Protection: User cannot fetch another user's notifications unless ADMIN
    if (targetUserId !== user.id && user.role_name !== 'ADMIN') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: Anda hanya dapat melihat notifikasi milik sendiri' },
        { status: 403 }
      );
    }

    const limitParam = parseInt(url.searchParams.get('limit') || '50', 10);
    const limit = Math.min(Math.max(1, limitParam), 100);
    const typeFilter = url.searchParams.get('type');
    const categoryFilter = url.searchParams.get('category'); // 'all' | 'messages' | 'status' | 'revisions'
    const unreadOnly = url.searchParams.get('unread_only') === 'true';

    let allNotifs = await getNotifications(targetUserId);

    // Apply category / type filters
    if (categoryFilter && categoryFilter !== 'all') {
      if (categoryFilter === 'messages') {
        allNotifs = allNotifs.filter(n => n.notification_type === 'NEW_MESSAGE' || n.link?.includes('tab=chat'));
      } else if (categoryFilter === 'status') {
        allNotifs = allNotifs.filter(n => 
          n.notification_type === 'REQUEST_STATUS_UPDATED' || 
          n.notification_type === 'MOTION_STATUS_UPDATED' ||
          n.notification_type === 'REQUEST_APPROVED' ||
          n.notification_type === 'MOTION_APPROVED' ||
          n.notification_type === 'REQUEST_ASSIGNED'
        );
      } else if (categoryFilter === 'revisions') {
        allNotifs = allNotifs.filter(n => 
          n.notification_type === 'REQUEST_REVISION' || 
          n.notification_type === 'MOTION_REVISION' ||
          n.type === 'warning'
        );
      }
    }

    if (typeFilter) {
      allNotifs = allNotifs.filter(n => n.notification_type === typeFilter);
    }

    if (unreadOnly) {
      allNotifs = allNotifs.filter(n => !n.read && !n.is_read);
    }

    const unreadCount = allNotifs.filter(n => !n.read && !n.is_read).length;
    const paginated = allNotifs.slice(0, limit);

    return NextResponse.json({
      success: true,
      data: paginated,
      total: allNotifs.length,
      unread_count: unreadCount,
      user_id: targetUserId
    });
  } catch (err: any) {
    console.error('API GET notifications error:', err);
    return NextResponse.json(
      { success: false, message: err?.message || 'Gagal memuat notifikasi' },
      { status: 500 }
    );
  }
}
