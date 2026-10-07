import { NextResponse } from 'next/server';
import { 
  getComments, 
  addComment, 
  editComment, 
  deleteComment, 
  getAllTasksWithRelations, 
  getUsers 
} from '@/lib/supabase-store';
import { checkRateLimit } from '@/lib/rate-limiter';
import { canUserAccessTaskChat, canUserEditComment, canUserDeleteComment } from '@/lib/chat-auth';
import { sanitizeChatMessage, validateChatAttachment } from '@/lib/utils';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Helper to resolve user from request headers or body.
 * In production ERP with JWT/cookie/header auth.
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

  // Fallback to checking all registered users if matched in header or query
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
 * GET /api/requests/[id]/messages
 * Fetches messages for a request. Protected against IDOR:
 * User must be an authorized participant or Admin/Team Lead.
 */
export async function GET(req: Request, context: RouteContext) {
  try {
    const { id: taskId } = await context.params;
    const url = new URL(req.url);
    const limitParam = parseInt(url.searchParams.get('limit') || '50', 10);
    const limit = Math.min(Math.max(1, limitParam), 100);

    const tasks = await getAllTasksWithRelations();
    const task = tasks.find(t => t.id === taskId || t.task_code === taskId);

    if (!task) {
      return NextResponse.json(
        { success: false, message: 'Request tidak ditemukan' },
        { status: 404 }
      );
    }

    const user = await resolveUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, message: 'Autentikasi diperlukan untuk mengakses pesan' },
        { status: 401 }
      );
    }

    // Authorization & IDOR protection
    const hasAccess = canUserAccessTaskChat(task, user);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: Anda bukan partisipan pada request ini' },
        { status: 403 }
      );
    }

    const allComments = await getComments(task.id);
    const paginated = allComments.slice(-limit);

    const unreadCount = allComments.filter(c => 
      c.user_id !== user.id && 
      !c.is_deleted && 
      !(c.read_by || []).includes(user.id)
    ).length;

    return NextResponse.json({
      success: true,
      data: paginated,
      total: allComments.length,
      unread_count: unreadCount,
      task_id: task.id,
      task_code: task.task_code
    });
  } catch (err: any) {
    console.error('API GET messages error:', err);
    return NextResponse.json(
      { success: false, message: err?.message || 'Gagal memuat pesan diskusi' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/requests/[id]/messages
 * Posts a new message. Rate-limited, validated, and authorization protected.
 */
export async function POST(req: Request, context: RouteContext) {
  try {
    const { id: taskId } = await context.params;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, message: 'Payload tidak valid' },
        { status: 400 }
      );
    }

    const userId = body.user_id || req.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json(
        { success: false, message: 'User ID wajib disertakan' },
        { status: 401 }
      );
    }

    // 1. Rate limiting check
    const rateLimit = checkRateLimit(`api_chat_${userId}`, 10, 10000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'Terlalu banyak permintaan dalam waktu singkat. Harap tunggu beberapa detik.',
          retry_after_ms: rateLimit.resetMs 
        },
        { status: 429 }
      );
    }

    // 2. Find Task
    const tasks = await getAllTasksWithRelations();
    const task = tasks.find(t => t.id === taskId || t.task_code === taskId);
    if (!task) {
      return NextResponse.json(
        { success: false, message: 'Request tidak ditemukan' },
        { status: 404 }
      );
    }

    // 3. User & Authorization check
    const allUsers = await getUsers();
    const user = allUsers.find(u => u.id === userId) || {
      id: userId,
      full_name: body.user_name || 'User',
      role_name: body.user_role || 'REQUESTER',
      avatar_initials: (body.user_name || 'U').slice(0, 2).toUpperCase()
    };

    const hasAccess = canUserAccessTaskChat(task, user);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: Anda bukan partisipan pada request ini' },
        { status: 403 }
      );
    }

    // 4. Validate Content & Attachment
    const rawContent = (body.content || '').trim();
    let validatedAttachment: { url: string; type: 'image' | 'video'; name: string } | undefined = undefined;

    if (body.attachment) {
      const valAtt = validateChatAttachment(body.attachment);
      if (!valAtt.valid) {
        return NextResponse.json(
          { success: false, message: valAtt.error || 'Lampiran tidak valid' },
          { status: 400 }
        );
      }
      validatedAttachment = {
        url: valAtt.cleanUrl,
        type: valAtt.mediaType,
        name: valAtt.cleanName
      };
    }

    if (!rawContent && !validatedAttachment) {
      return NextResponse.json(
        { success: false, message: 'Pesan atau lampiran tidak boleh kosong' },
        { status: 400 }
      );
    }

    if (rawContent) {
      const valMsg = sanitizeChatMessage(rawContent);
      if (!valMsg.valid) {
        return NextResponse.json(
          { success: false, message: valMsg.error || 'Pesan tidak valid' },
          { status: 400 }
        );
      }
    }

    // 5. Save message
    const created = await addComment(
      task.id,
      user.id,
      rawContent,
      {
        full_name: user.full_name,
        avatar_initials: user.avatar_initials,
        role_name: user.role_name
      },
      validatedAttachment
    );

    return NextResponse.json({
      success: true,
      message: 'Pesan berhasil dikirim',
      data: created
    }, { status: 201 });
  } catch (err: any) {
    console.error('API POST message error:', err);
    return NextResponse.json(
      { success: false, message: err?.message || 'Gagal mengirim pesan' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/requests/[id]/messages
 * Edit an existing message. Only message author can edit.
 */
export async function PATCH(req: Request, context: RouteContext) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || !body.comment_id || !body.user_id || typeof body.content !== 'string') {
      return NextResponse.json(
        { success: false, message: 'Format permintaan tidak valid' },
        { status: 400 }
      );
    }

    const updated = await editComment(body.comment_id, body.user_id, body.content);
    return NextResponse.json({
      success: true,
      message: 'Pesan berhasil diperbarui',
      data: updated
    });
  } catch (err: any) {
    console.error('API PATCH message error:', err);
    return NextResponse.json(
      { success: false, message: err?.message || 'Gagal mengedit pesan' },
      { status: err?.message?.includes('Hanya penulis') ? 403 : 500 }
    );
  }
}

/**
 * DELETE /api/requests/[id]/messages
 * Soft delete an existing message.
 */
export async function DELETE(req: Request, context: RouteContext) {
  try {
    const url = new URL(req.url);
    const commentId = url.searchParams.get('commentId');
    const userId = url.searchParams.get('userId') || req.headers.get('x-user-id');
    const roleName = url.searchParams.get('roleName') || req.headers.get('x-user-role');

    if (!commentId) {
      return NextResponse.json(
        { success: false, message: 'commentId wajib disertakan' },
        { status: 400 }
      );
    }

    await deleteComment(commentId, userId || undefined, roleName || undefined);
    return NextResponse.json({
      success: true,
      message: 'Pesan berhasil dihapus'
    });
  } catch (err: any) {
    console.error('API DELETE message error:', err);
    return NextResponse.json(
      { success: false, message: err?.message || 'Gagal menghapus pesan' },
      { status: err?.message?.includes('izin') ? 403 : 500 }
    );
  }
}
