import { NextResponse } from 'next/server';
import { getMotionTasks, getAllTasksWithRelations, getUsers, getClients } from '@/lib/supabase-store';
import { getWeekOfMonth, getISOWeekNumber } from '@/lib/utils';
import { MotionTask, TaskWithRelations } from '@/lib/types';

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
 * GET /api/motion/approved
 * Retrieves approved motion tasks archive with multi-dimensional time filtering (Year, Month, Week),
 * search, sorting, and server-side pagination with role-based authorization.
 */
export async function GET(req: Request) {
  try {
    const user = await resolveUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, message: 'Autentikasi diperlukan untuk mengakses arsip motion' },
        { status: 401 }
      );
    }

    const url = new URL(req.url);
    const yearParam = url.searchParams.get('year');
    const monthParam = url.searchParams.get('month');
    const weekParam = url.searchParams.get('week');
    const isoWeekParam = url.searchParams.get('iso_week');
    const search = (url.searchParams.get('search') || '').toLowerCase().trim();
    const sort = url.searchParams.get('sort') || 'approved_desc';
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
    const clientIdParam = url.searchParams.get('client_id');
    const picIdParam = url.searchParams.get('pic_id');
    const studioParam = url.searchParams.get('studio');
    const platformParam = url.searchParams.get('platform');

    // 1. Fetch motion tasks, parent creative tasks, and users
    const [rawMotionTasks, allTasks, allUsers, allClients] = await Promise.all([
      getMotionTasks(),
      getAllTasksWithRelations(),
      getUsers(),
      getClients()
    ]);

    // Enrich motion tasks with parent creative tasks
    const enrichedMotionTasks = rawMotionTasks.map(mt => {
      const parentTask = mt.task_id ? allTasks.find(t => t.id === mt.task_id) : undefined;
      return {
        ...mt,
        parentTask
      };
    });

    // 2. Filter only APPROVED or COMPLETED motion tasks
    let approvedMotionTasks = enrichedMotionTasks.filter(mt =>
      mt.status_motion === 'APPROVED' || mt.status_motion === 'COMPLETED'
    );

    // 3. Apply Role-Based Access Control (RBAC)
    if (!['ADMIN', 'TEAM_LEAD'].includes(user.role_name)) {
      approvedMotionTasks = approvedMotionTasks.filter(mt => {
        if (user.role_name === 'MOTION_PIC') {
          return mt.motion_pic_id === user.id;
        }
        if (user.role_name === 'REQUESTER') {
          return mt.parentTask?.created_by === user.id;
        }
        if (user.role_name === 'STRATEGIC_PIC') {
          return mt.parentTask?.strat_pic_id === user.id || (mt.parentTask?.strat_pic_ids && mt.parentTask.strat_pic_ids.includes(user.id));
        }
        if (user.role_name === 'OPERATOR') {
          return mt.operator_id === user.id;
        }
        return mt.motion_pic_id === user.id || mt.parentTask?.created_by === user.id;
      });
    }

    // 4. Apply Time-Based Filtering (Year, Month, Week)
    if (yearParam && yearParam !== 'all') {
      const targetYear = parseInt(yearParam, 10);
      approvedMotionTasks = approvedMotionTasks.filter(t => {
        const approvedDate = t.approved_at || t.apply_date || t.updated_at || t.created_at;
        return new Date(approvedDate).getFullYear() === targetYear;
      });
    }

    if (monthParam && monthParam !== 'all') {
      const targetMonth = parseInt(monthParam, 10); // 1-12
      approvedMotionTasks = approvedMotionTasks.filter(t => {
        const approvedDate = t.approved_at || t.apply_date || t.updated_at || t.created_at;
        return (new Date(approvedDate).getMonth() + 1) === targetMonth;
      });
    }

    if (weekParam && weekParam !== 'all') {
      const targetWeek = parseInt(weekParam, 10); // 1-5 (Week of Month)
      approvedMotionTasks = approvedMotionTasks.filter(t => {
        const approvedDate = t.approved_at || t.apply_date || t.updated_at || t.created_at;
        return getWeekOfMonth(approvedDate) === targetWeek;
      });
    }

    if (isoWeekParam && isoWeekParam !== 'all') {
      const targetIsoWeek = parseInt(isoWeekParam, 10); // 1-53
      approvedMotionTasks = approvedMotionTasks.filter(t => {
        const approvedDate = t.approved_at || t.apply_date || t.updated_at || t.created_at;
        return getISOWeekNumber(approvedDate) === targetIsoWeek;
      });
    }

    // 5. Additional Filters: Client, PIC, Studio, Platform
    if (clientIdParam && clientIdParam !== 'all') {
      const targetClientId = parseInt(clientIdParam, 10);
      approvedMotionTasks = approvedMotionTasks.filter(t => 
        (t.parentTask ? t.parentTask.client_id === targetClientId : t.client_id === targetClientId)
      );
    }

    if (picIdParam && picIdParam !== 'all') {
      approvedMotionTasks = approvedMotionTasks.filter(t => t.motion_pic_id === picIdParam);
    }

    if (studioParam && studioParam !== 'all') {
      approvedMotionTasks = approvedMotionTasks.filter(t => t.studio === studioParam);
    }

    if (platformParam && platformParam !== 'all') {
      approvedMotionTasks = approvedMotionTasks.filter(t => t.platform === platformParam);
    }

    // 6. Apply Search
    if (search) {
      approvedMotionTasks = approvedMotionTasks.filter(t => {
        const codeMatch = (t.parentTask?.task_code || (t.id || '')).toLowerCase().includes(search);
        const nameMatch = (t.parentTask?.campaign_name || t.campaign_type || t.motion_type || '').toLowerCase().includes(search);
        const clientMatch = (t.parentTask?.client_name || allClients.find(c => c.id === t.client_id)?.name || '').toLowerCase().includes(search);
        const picUser = allUsers.find(u => u.id === t.motion_pic_id);
        const picMatch = (picUser?.full_name || '').toLowerCase().includes(search);
        const requesterMatch = (t.parentTask?.created_by_name || '').toLowerCase().includes(search);
        const studioMatch = (t.studio || '').toLowerCase().includes(search);
        return codeMatch || nameMatch || clientMatch || picMatch || requesterMatch || studioMatch;
      });
    }

    // 7. Calculate Aggregated Summary Statistics
    const totalApproved = approvedMotionTasks.length;
    const completedCount = approvedMotionTasks.filter(t => t.status_motion === 'COMPLETED').length;
    const withRenderCount = approvedMotionTasks.filter(t => Boolean(t.link_motion)).length;

    // 8. Apply Sorting
    approvedMotionTasks.sort((a, b) => {
      const dateA = new Date(a.approved_at || a.apply_date || a.updated_at || a.created_at).getTime();
      const dateB = new Date(b.approved_at || b.apply_date || b.updated_at || b.created_at).getTime();
      const codeA = a.parentTask?.task_code || a.id || '';
      const codeB = b.parentTask?.task_code || b.id || '';

      switch (sort) {
        case 'approved_asc':
          return dateA - dateB;
        case 'code_asc':
          return codeA.localeCompare(codeB);
        case 'code_desc':
          return codeB.localeCompare(codeA);
        case 'approved_desc':
        default:
          return dateB - dateA;
      }
    });

    // 9. Pagination Slicing
    const totalPages = Math.ceil(totalApproved / limit) || 1;
    const offset = (page - 1) * limit;
    const paginatedData = approvedMotionTasks.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      data: paginatedData,
      pagination: {
        total: totalApproved,
        page,
        limit,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1
      },
      stats: {
        total_approved: totalApproved,
        completed_count: completedCount,
        with_render_count: withRenderCount,
        render_rate_pct: totalApproved > 0 ? Math.round((withRenderCount / totalApproved) * 100) : 0
      },
      filters_applied: {
        year: yearParam || null,
        month: monthParam || null,
        week: weekParam || null,
        iso_week: isoWeekParam || null,
        search: search || null,
        sort
      }
    });
  } catch (err: any) {
    console.error('API GET approved motion tasks error:', err);
    return NextResponse.json(
      { success: false, message: err?.message || 'Gagal memuat arsip motion disetujui' },
      { status: 500 }
    );
  }
}
