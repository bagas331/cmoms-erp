import { NextResponse } from 'next/server';
import { markCommentsAsRead, getAllTasksWithRelations } from '@/lib/supabase-store';
import { resolveAuthenticatedUser } from '@/lib/server-auth';
import { canUserAccessTaskChat } from '@/lib/chat-auth';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/requests/[id]/messages/read
 * Marks messages of a request as read for the authenticated user.
 */
export async function POST(req: Request, context: RouteContext) {
  try {
    const { id: taskId } = await context.params;
    const body = await req.json().catch(() => null);

    const user = await resolveAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, message: 'Autentikasi diperlukan' },
        { status: 401 }
      );
    }

    const tasks = await getAllTasksWithRelations();
    const task = tasks.find(t => t.id === taskId || t.task_code === taskId);
    if (!task) {
      return NextResponse.json(
        { success: false, message: 'Request tidak ditemukan' },
        { status: 404 }
      );
    }

    if (!canUserAccessTaskChat(task, user)) {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: Anda bukan partisipan pada request ini' },
        { status: 403 }
      );
    }

    await markCommentsAsRead(task.id, user.id);

    return NextResponse.json({
      success: true,
      message: 'Pesan telah ditandai sebagai dibaca'
    });
  } catch (err: any) {
    console.error('API POST messages/read error:', err);
    return NextResponse.json(
      { success: false, message: err?.message || 'Gagal menandai pesan' },
      { status: 500 }
    );
  }
}
