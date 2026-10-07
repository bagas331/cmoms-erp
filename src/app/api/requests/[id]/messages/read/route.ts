import { NextResponse } from 'next/server';
import { markCommentsAsRead, getAllTasksWithRelations } from '@/lib/supabase-store';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/requests/[id]/messages/read
 * Marks messages of a request as read for the specified user.
 */
export async function POST(req: Request, context: RouteContext) {
  try {
    const { id: taskId } = await context.params;
    const body = await req.json().catch(() => null);
    const userId = body?.user_id || req.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json(
        { success: false, message: 'User ID wajib disertakan' },
        { status: 400 }
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

    await markCommentsAsRead(task.id, userId);

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
