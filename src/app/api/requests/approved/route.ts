import { NextResponse } from 'next/server';
import { getAllTasksWithRelations, getUsers } from '@/lib/supabase-store';
import { getWeekOfMonth, getISOWeekNumber } from '@/lib/utils';
import { TaskWithRelations } from '@/lib/types';

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
 * GET /api/requests/approved
 * Retrieves approved requests archive with multi-dimensional time filtering (Year, Month, Week),
 * search, sorting, and server-side pagination with role-based authorization.
 */
export async function GET(req: Request) {
  try {
    const user = await resolveUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, message: 'Autentikasi diperlukan untuk mengakses arsip request' },
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

    // 1. Fetch all tasks with relations
    const allTasks = await getAllTasksWithRelations();

    // 2. Filter only APPROVED (or TASK_CLOSED with approval) tasks
    let approvedTasks = allTasks.filter(t => 
      t.status_design === 'DESIGN_APPROVED' || t.status_design === 'TASK_CLOSED'
    );

    // 3. Apply Role-Based Access Control (RBAC)
    if (!['ADMIN', 'TEAM_LEAD'].includes(user.role_name)) {
      approvedTasks = approvedTasks.filter(t => {
        if (user.role_name === 'REQUESTER') {
          return t.created_by === user.id;
        }
        if (user.role_name === 'DESIGNER') {
          return t.design_pic_id === user.id;
        }
        if (user.role_name === 'STRATEGIC_PIC') {
          return t.strat_pic_id === user.id || (t.strat_pic_ids && t.strat_pic_ids.includes(user.id));
        }
        if (user.role_name === 'MOTION_PIC') {
          return t.motion_task?.motion_pic_id === user.id;
        }
        if (user.role_name === 'OPERATOR') {
          return t.operator_id === user.id;
        }
        return t.created_by === user.id || t.design_pic_id === user.id;
      });
    }

    // 4. Apply Time-Based Filtering (Year, Month, Week)
    if (yearParam && yearParam !== 'all') {
      const targetYear = parseInt(yearParam, 10);
      approvedTasks = approvedTasks.filter(t => {
        const approvedDate = t.approved_at || t.submission_date || t.updated_at || t.created_at;
        return new Date(approvedDate).getFullYear() === targetYear;
      });
    }

    if (monthParam && monthParam !== 'all') {
      const targetMonth = parseInt(monthParam, 10); // 1-12
      approvedTasks = approvedTasks.filter(t => {
        const approvedDate = t.approved_at || t.submission_date || t.updated_at || t.created_at;
        return (new Date(approvedDate).getMonth() + 1) === targetMonth;
      });
    }

    if (weekParam && weekParam !== 'all') {
      const targetWeek = parseInt(weekParam, 10); // 1-5 (Week of Month)
      approvedTasks = approvedTasks.filter(t => {
        const approvedDate = t.approved_at || t.submission_date || t.updated_at || t.created_at;
        return getWeekOfMonth(approvedDate) === targetWeek;
      });
    }

    if (isoWeekParam && isoWeekParam !== 'all') {
      const targetIsoWeek = parseInt(isoWeekParam, 10); // 1-53
      approvedTasks = approvedTasks.filter(t => {
        const approvedDate = t.approved_at || t.submission_date || t.updated_at || t.created_at;
        return getISOWeekNumber(approvedDate) === targetIsoWeek;
      });
    }

    // 5. Additional Filters: Client & PIC
    if (clientIdParam && clientIdParam !== 'all') {
      const targetClientId = parseInt(clientIdParam, 10);
      approvedTasks = approvedTasks.filter(t => t.client_id === targetClientId);
    }

    if (picIdParam && picIdParam !== 'all') {
      approvedTasks = approvedTasks.filter(t => t.design_pic_id === picIdParam);
    }

    // 6. Apply Search
    if (search) {
      approvedTasks = approvedTasks.filter(t => {
        const codeMatch = (t.task_code || '').toLowerCase().includes(search);
        const nameMatch = (t.campaign_name || '').toLowerCase().includes(search);
        const clientMatch = (t.client_name || '').toLowerCase().includes(search);
        const picMatch = (t.design_pic_name || '').toLowerCase().includes(search);
        const requesterMatch = (t.created_by_name || '').toLowerCase().includes(search);
        return codeMatch || nameMatch || clientMatch || picMatch || requesterMatch;
      });
    }

    // 7. Calculate Aggregated Summary Statistics
    const totalApproved = approvedTasks.length;
    const totalOutputQty = approvedTasks.reduce((sum, t) => sum + (t.output_qty || t.req_qty || 1), 0);
    const excellenceCount = approvedTasks.filter(t => t.operational_excellence === 'EXCELLENCE').length;
    const goodCount = approvedTasks.filter(t => t.operational_excellence === 'GOOD').length;

    // 8. Apply Sorting
    approvedTasks.sort((a, b) => {
      const dateA = new Date(a.approved_at || a.submission_date || a.updated_at || a.created_at).getTime();
      const dateB = new Date(b.approved_at || b.submission_date || b.updated_at || b.created_at).getTime();
      const reqDateA = new Date(a.req_date || a.created_at).getTime();
      const reqDateB = new Date(b.req_date || b.created_at).getTime();

      switch (sort) {
        case 'approved_asc':
          return dateA - dateB;
        case 'req_date_desc':
          return reqDateB - reqDateA;
        case 'req_date_asc':
          return reqDateA - reqDateB;
        case 'code_asc':
          return (a.task_code || '').localeCompare(b.task_code || '');
        case 'code_desc':
          return (b.task_code || '').localeCompare(a.task_code || '');
        case 'approved_desc':
        default:
          return dateB - dateA;
      }
    });

    // 9. Pagination Slicing
    const totalPages = Math.ceil(totalApproved / limit) || 1;
    const offset = (page - 1) * limit;
    const paginatedData = approvedTasks.slice(offset, offset + limit);

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
        total_output_qty: totalOutputQty,
        excellence_count: excellenceCount,
        good_count: goodCount,
        excellence_rate_pct: totalApproved > 0 ? Math.round((excellenceCount / totalApproved) * 100) : 0
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
    console.error('API GET approved requests error:', err);
    return NextResponse.json(
      { success: false, message: err?.message || 'Gagal memuat arsip request disetujui' },
      { status: 500 }
    );
  }
}
