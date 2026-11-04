// ============================================================
// CMOS - Productivity & Time Tracker Engine
// Evaluates turnaround times, points accumulation, and time utilization
// Standard Capacity: 8 hours/day, 5 working days/week (40 hours/week)
// ============================================================

import {
  TaskWithRelations,
  MotionTask,
  User,
  Client,
  TaskRevision,
  ProductivityTaskRecord,
  DesignerProductivityMetrics,
  ProductivitySummaryKPIs,
  ProductivityTeamType,
  DesignDifficulty,
  MotionDifficulty,
  RoleName,
} from './types';
import {
  DIFFICULTY_WEIGHTS,
  MOTION_DIFFICULTY_WEIGHTS,
  MONTH_NAMES_SHORT,
  MONTH_NAMES_ID,
} from './constants';
import { getDueWeekPartition } from './archive-engine';
import { getInitials } from './utils';
import {
  isTaskActive,
  isTaskDone,
  isTaskPostponedOrCancelled,
  isTaskArchived,
  isMotionActive,
  isMotionDone,
  isMotionPostponedOrCancelled,
  isMotionArchived
} from './task-status';

// Standard weekly work capacity (8 hours/day * 5 days = 40 hours)
export const STANDARD_WEEKLY_HOURS = 40;
export const STANDARD_DAILY_HOURS = 8;

export interface ProductivityFilterOptions {
  year: string; // 'all' or '2026'
  month: string; // 'all' or '01'..'12'
  week: string; // 'all' or 'W1'..'W4'
  teamType: ProductivityTeamType; // 'ALL' | 'GD' | 'MOTION'
  searchQuery?: string;
}

/**
 * Calculates duration in hours between two ISO date-time strings.
 * Returns 0 if either date is invalid.
 */
export function calculateElapsedHours(startDateStr?: string | null, endDateStr?: string | null): number {
  if (!startDateStr || !endDateStr) return 0;
  const start = new Date(startDateStr).getTime();
  const end = new Date(endDateStr).getTime();
  if (isNaN(start) || isNaN(end) || end < start) return 0;
  const diffHours = (end - start) / (1000 * 60 * 60);
  return Number(diffHours.toFixed(1));
}

/**
 * Formats hours into a human-friendly duration string.
 * Example: 28 hours -> "1h 4j" or "28 jam" (1 hari = 24 jam kalender).
 */
export function formatFriendlyDuration(hours: number): string {
  if (hours <= 0) return '0 jam';
  if (hours < 1) {
    const mins = Math.round(hours * 60);
    return `${mins} menit`;
  }
  if (hours < 24) {
    return `${hours.toFixed(1).replace('.0', '')} jam`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = Math.round(hours % 24);
  if (remainingHours === 0) {
    return `${days} hari`;
  }
  return `${days}h ${remainingHours}j`;
}

/**
 * Calculates total revision duration from an array of TaskRevisions.
 * If revision has submitted_at, uses (submitted_at - created_at).
 * Fallback: estimated 3.5 hours per revision cycle if timestamps are identical.
 */
export function calculateRevisionHours(revisions?: TaskRevision[]): number {
  if (!revisions || revisions.length === 0) return 0;
  let totalHours = 0;
  for (const rev of revisions) {
    if (rev.created_at && rev.submitted_at) {
      const h = calculateElapsedHours(rev.created_at, rev.submitted_at);
      totalHours += h > 0 ? h : 2.5;
    } else {
      totalHours += 2.5; // Baseline turnaround per revision cycle
    }
  }
  return Number(totalHours.toFixed(1));
}

/**
 * Determines whether a date falls within a specific year, month, and week.
 */
export function matchesPeriodFilter(
  dateStr: string | null | undefined,
  year: string,
  month: string,
  week: string
): boolean {
  if (!dateStr) return true;
  const clean = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const parts = clean.split('-');
  if (parts.length < 3) return true;

  const y = parts[0];
  const m = parts[1];
  if (year !== 'all' && y !== year) return false;
  if (month !== 'all' && m !== month) return false;
  if (week !== 'all') {
    const w = getDueWeekPartition(clean);
    if (w !== week) return false;
  }
  return true;
}

/**
 * Transforms a CreativeTask (GD Mockup / GD Non-Mockup) into a ProductivityTaskRecord.
 */
export function transformCreativeTaskToProductivityRecord(
  task: TaskWithRelations
): ProductivityTaskRecord {
  const isCompleted =
    task.status_design === 'DESIGN_APPROVED' ||
    task.status_design === 'TASK_CLOSED' ||
    Boolean(task.approved_at);

  const diffKey = (task.design_difficulty || 'LOW').toUpperCase() as DesignDifficulty;
  const diffPoints = DIFFICULTY_WEIGHTS[diffKey] ?? 2.5;

  const assignedAt = task.assigned_at || (task.design_pic_id ? task.created_at : task.created_at);
  const approvedAt = task.approved_at || (isCompleted ? task.submission_date || task.updated_at : null);

  const turnaroundHours = isCompleted
    ? calculateElapsedHours(assignedAt, approvedAt)
    : calculateElapsedHours(assignedAt, new Date().toISOString());

  const revisionCount = task.design_revision_count || (task.revisions ? task.revisions.length : 0);
  const revisionHours = calculateRevisionHours(task.revisions);

  return {
    id: task.id,
    task_code: task.task_code,
    title: task.campaign_name || task.content_type_name || task.task_code,
    pipeline: task.active_pipeline || task.pipeline_type || 'GD_MOCKUP',
    team_type: 'GD',
    pic_id: task.design_pic_id || 'unassigned',
    pic_name: task.design_pic_name || 'Belum Ditugaskan',
    pic_role: 'DESIGNER',
    client_name: task.client_name || 'Internal',
    campaign_name: task.campaign_name || 'BAU',
    difficulty_label: `GD ${diffKey}`,
    difficulty_points: diffPoints,
    status: task.status_design,
    assigned_at: assignedAt,
    approved_at: approvedAt,
    submission_date: task.submission_date,
    turnaround_hours: turnaroundHours,
    working_days: Number((turnaroundHours / 24).toFixed(1)),
    is_completed: isCompleted,
    revision_count: revisionCount,
    revision_hours: revisionHours,
    final_asset_link: task.final_asset_link,
  };
}

/**
 * Transforms a MotionTask into a ProductivityTaskRecord.
 */
export function transformMotionTaskToProductivityRecord(
  motion: MotionTask,
  clients: Client[],
  users: User[]
): ProductivityTaskRecord {
  const isCompleted =
    motion.status_motion === 'APPROVED' ||
    motion.status_motion === 'COMPLETED' ||
    Boolean(motion.approved_at);

  const diffKey = (motion.motion_difficulty || 'LVL_1_SIMPLE').toUpperCase() as MotionDifficulty;
  const diffPoints = MOTION_DIFFICULTY_WEIGHTS[diffKey] ?? 2.0;

  const assignedAt = motion.assigned_at || (motion.motion_pic_id ? motion.created_at : motion.created_at);
  const approvedAt = motion.approved_at || (isCompleted ? motion.due_date || motion.updated_at : null);

  const turnaroundHours = isCompleted
    ? calculateElapsedHours(assignedAt, approvedAt)
    : calculateElapsedHours(assignedAt, new Date().toISOString());

  const client = motion.client_id ? clients.find((c) => c.id === motion.client_id) : null;
  const pic = motion.motion_pic_id ? users.find((u) => u.id === motion.motion_pic_id) : null;

  const diffLabel =
    diffKey === 'LVL_1_SIMPLE'
      ? 'Motion Simple (L1)'
      : diffKey === 'LVL_2_MEDIUM'
      ? 'Motion Medium (L2)'
      : diffKey === 'LVL_3_ADVANCED'
      ? 'Motion Advanced (L3)'
      : 'Motion Period (L4)';

  return {
    id: motion.id,
    task_code: motion.motion_type || `MOT-${motion.id.substring(0, 6)}`,
    title: motion.motion_type || motion.campaign_type || 'Motion Graphic',
    pipeline: 'MOTION',
    team_type: 'MOTION',
    pic_id: motion.motion_pic_id || 'unassigned',
    pic_name: pic?.full_name || 'Belum Ditugaskan',
    pic_role: 'MOTION_PIC',
    client_name: client?.name || 'Live Operations',
    campaign_name: motion.campaign_type || 'BAU',
    difficulty_label: diffLabel,
    difficulty_points: diffPoints,
    status: motion.status_motion,
    assigned_at: assignedAt,
    approved_at: approvedAt,
    turnaround_hours: turnaroundHours,
    working_days: Number((turnaroundHours / 24).toFixed(1)),
    is_completed: isCompleted,
    revision_count: motion.motion_revision_count || 0,
    revision_hours: Number(((motion.motion_revision_count || 0) * 3.0).toFixed(1)),
    link_motion: motion.link_motion,
  };
}

/**
 * Computes all designer metrics and overall team KPIs for the Productivity Tracker.
 */
export function calculateTeamProductivity(
  tasks: TaskWithRelations[],
  motionTasks: MotionTask[],
  clients: Client[],
  users: User[],
  options: ProductivityFilterOptions
): {
  designerMetrics: DesignerProductivityMetrics[];
  summaryKPIs: ProductivitySummaryKPIs;
  allTaskRecords: ProductivityTaskRecord[];
} {
  const { year, month, week, teamType, searchQuery } = options;

  // 1. Transform Creative Tasks (GD)
  const gdRecords: ProductivityTaskRecord[] = [];
  if (teamType === 'ALL' || teamType === 'GD') {
    tasks.forEach((t) => {
      // Exclude archived, cancelled, or postponed tasks
      if (isTaskArchived(t) || isTaskPostponedOrCancelled(t)) return;

      // Exclude pure strategic brief-only tasks without GD
      if (t.pipeline_type === 'STRATEGIC' && !t.design_pic_id) return;
      if (!t.design_pic_id) return; // Only measure assigned personnel

      // Date matching against approval/completion date or request date
      const isCompleted = isTaskDone(t);
      const dateToCheck = isCompleted ? (t.approved_at || t.submission_date || t.req_date || t.created_at) : (t.req_date || t.created_at);
      if (!matchesPeriodFilter(dateToCheck, year, month, week)) return;

      gdRecords.push(transformCreativeTaskToProductivityRecord(t));
    });
  }

  // 2. Transform Motion Tasks
  const motionRecords: ProductivityTaskRecord[] = [];
  if (teamType === 'ALL' || teamType === 'MOTION') {
    motionTasks.forEach((m) => {
      // Exclude archived, cancelled, or postponed motion tasks
      if (isMotionArchived(m) || isMotionPostponedOrCancelled(m)) return;
      if (!m.motion_pic_id) return;

      const isCompleted = isMotionDone(m);
      const dateToCheck = isCompleted ? (m.approved_at || m.apply_date || m.created_at) : (m.apply_date || m.created_at);
      if (!matchesPeriodFilter(dateToCheck, year, month, week)) return;

      motionRecords.push(transformMotionTaskToProductivityRecord(m, clients, users));
    });
  }

  const combinedRecords = [...gdRecords, ...motionRecords];

  // Apply optional search filter
  const q = (searchQuery || '').trim().toLowerCase();
  const filteredRecords = q
    ? combinedRecords.filter(
        (r) =>
          r.task_code.toLowerCase().includes(q) ||
          r.title.toLowerCase().includes(q) ||
          r.pic_name.toLowerCase().includes(q) ||
          r.client_name.toLowerCase().includes(q) ||
          r.campaign_name.toLowerCase().includes(q)
      )
    : combinedRecords;

  // 3. Group by Designer / PIC
  const picMap = new Map<string, ProductivityTaskRecord[]>();
  filteredRecords.forEach((r) => {
    if (!picMap.has(r.pic_id)) {
      picMap.set(r.pic_id, []);
    }
    picMap.get(r.pic_id)!.push(r);
  });

  // Determine standard capacity hours for the selected period
  // If a single week is selected: 40 hours.
  // If whole month is selected ('all'): 40 * 4 = 160 hours.
  const baselineCapacityHours = week !== 'all' ? STANDARD_WEEKLY_HOURS : STANDARD_WEEKLY_HOURS * 4;

  const designerMetrics: DesignerProductivityMetrics[] = [];

  picMap.forEach((pRecords, picId) => {
    const userObj = users.find((u) => u.id === picId);
    const userName = userObj?.full_name || pRecords[0]?.pic_name || 'Desainer';
    const roleName = userObj?.role_name || pRecords[0]?.pic_role || 'DESIGNER';
    const initials = userObj?.avatar_initials || getInitials(userName);
    const tType = pRecords[0]?.team_type || (roleName === 'MOTION_PIC' ? 'MOTION' : 'GD');

    const completed = pRecords.filter((r) => r.is_completed);
    const inProgress = pRecords.filter((r) => !r.is_completed);

    const totalPoints = Number(
      completed.reduce((acc, r) => acc + r.difficulty_points, 0).toFixed(1)
    );

    const totalTurnaroundHours = Number(
      completed.reduce((acc, r) => acc + r.turnaround_hours, 0).toFixed(1)
    );

    const avgTurnaroundHours =
      completed.length > 0 ? Number((totalTurnaroundHours / completed.length).toFixed(1)) : 0;

    const totalRevisionCount = pRecords.reduce((acc, r) => acc + r.revision_count, 0);
    const totalRevisionHours = Number(
      pRecords.reduce((acc, r) => acc + r.revision_hours, 0).toFixed(1)
    );

    // Points per Working Hour
    const pointsPerWorkingHour =
      totalTurnaroundHours > 0
        ? Number((totalPoints / totalTurnaroundHours).toFixed(2))
        : totalPoints > 0
        ? totalPoints
        : 0;

    // Hours per point
    const hoursPerPoint =
      totalPoints > 0 ? Number((totalTurnaroundHours / totalPoints).toFixed(1)) : 0;

    // Time Utilization Rate relative to 40h standard week (or month baseline)
    const timeUtilizationRate = Number(
      Math.min(150, (totalTurnaroundHours / baselineCapacityHours) * 100).toFixed(1)
    );

    // Efficiency Rating based on points & utilization
    let efficiencyRating: DesignerProductivityMetrics['efficiency_rating'] = 'AVAILABLE';
    if (timeUtilizationRate > 105) {
      efficiencyRating = 'OVERLOAD';
    } else if (timeUtilizationRate >= 75 && totalPoints >= 10) {
      efficiencyRating = 'OPTIMAL';
    } else if (timeUtilizationRate >= 45 || totalPoints >= 5) {
      efficiencyRating = 'BALANCED';
    } else {
      efficiencyRating = 'AVAILABLE';
    }

    designerMetrics.push({
      user_id: picId,
      user_name: userName,
      user_initials: initials,
      role_name: roleName,
      team_type: tType,
      total_completed_tasks: completed.length,
      total_in_progress_tasks: inProgress.length,
      total_points: totalPoints,
      total_turnaround_hours: totalTurnaroundHours,
      avg_turnaround_hours: avgTurnaroundHours,
      total_revision_count: totalRevisionCount,
      total_revision_hours: totalRevisionHours,
      points_per_working_hour: pointsPerWorkingHour,
      hours_per_point: hoursPerPoint,
      time_utilization_rate: timeUtilizationRate,
      efficiency_rating: efficiencyRating,
      rank: 0,
      tasks: pRecords.sort((a, b) => new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime()),
    });
  });

  // Sort by total points descending, then by points per hour
  designerMetrics.sort((a, b) => {
    if (b.total_points !== a.total_points) return b.total_points - a.total_points;
    return b.points_per_working_hour - a.points_per_working_hour;
  });

  // Assign ranks
  designerMetrics.forEach((d, idx) => {
    d.rank = idx + 1;
  });

  // 4. Calculate Summary KPIs
  const totalTeamPoints = Number(
    designerMetrics.reduce((acc, d) => acc + d.total_points, 0).toFixed(1)
  );
  const totalCompletedTasks = designerMetrics.reduce((acc, d) => acc + d.total_completed_tasks, 0);
  const totalActiveTasks = designerMetrics.reduce((acc, d) => acc + d.total_in_progress_tasks, 0);
  const totalTurnaroundAll = designerMetrics.reduce((acc, d) => acc + d.total_turnaround_hours, 0);
  const totalRevisionAll = designerMetrics.reduce((acc, d) => acc + d.total_revision_hours, 0);

  const avgTurnaroundHours =
    totalCompletedTasks > 0 ? Number((totalTurnaroundAll / totalCompletedTasks).toFixed(1)) : 0;

  const avgRevisionHours =
    totalCompletedTasks > 0 ? Number((totalRevisionAll / totalCompletedTasks).toFixed(1)) : 0;

  const overallPointsPerHour =
    totalTurnaroundAll > 0 ? Number((totalTeamPoints / totalTurnaroundAll).toFixed(2)) : 0;

  const avgTimeUtilizationRate =
    designerMetrics.length > 0
      ? Number(
          (
            designerMetrics.reduce((acc, d) => acc + d.time_utilization_rate, 0) /
            designerMetrics.length
          ).toFixed(1)
        )
      : 0;

  const periodLabel =
    month !== 'all'
      ? `${MONTH_NAMES_ID[Number(month) - 1] || 'Bulan'} ${year !== 'all' ? year : ''} ${
          week !== 'all' ? `(${week})` : '(Semua Minggu)'
        }`
      : `Semua Periode ${year !== 'all' ? year : ''}`;

  const summaryKPIs: ProductivitySummaryKPIs = {
    period_label: periodLabel.trim(),
    team_type: teamType,
    total_team_points: totalTeamPoints,
    total_completed_tasks: totalCompletedTasks,
    total_active_tasks: totalActiveTasks,
    avg_turnaround_hours: avgTurnaroundHours,
    avg_revision_hours: avgRevisionHours,
    overall_points_per_hour: overallPointsPerHour,
    avg_time_utilization_rate: avgTimeUtilizationRate,
    active_designers_count: designerMetrics.length,
  };

  return {
    designerMetrics,
    summaryKPIs,
    allTaskRecords: filteredRecords,
  };
}

/**
 * Generates CSV content from productivity metrics for download.
 */
export function generateProductivityCSV(
  designers: DesignerProductivityMetrics[],
  tasks: ProductivityTaskRecord[],
  summary: ProductivitySummaryKPIs
): string {
  const lines: string[] = [];

  // Title & Header
  lines.push(`"LAPORAN PRODUCTIVITY & TIME TRACKER TIM GD & MOTION"`);
  lines.push(`"Periode","${summary.period_label}"`);
  lines.push(`"Filter Tim","${summary.team_type}"`);
  lines.push(`"Total Poin Selesai","${summary.total_team_points}"`);
  lines.push(`"Total Task Selesai","${summary.total_completed_tasks}"`);
  lines.push(`"Rata-rata Turnaround (Jam)","${summary.avg_turnaround_hours}"`);
  lines.push(`"Rata-rata Poin per Jam Kerja","${summary.overall_points_per_hour}"`);
  lines.push(`"Rata-rata Utilisasi Waktu","${summary.avg_time_utilization_rate}%"`);
  lines.push('');

  // Section 1: Leaderboard Ringkasan Desainer
  lines.push(`"RINGKASAN PERFORMA ANGGOTA TIM"`);
  lines.push(
    [
      '"Peringkat"',
      '"Nama Anggota"',
      '"Peran"',
      '"Tim"',
      '"Total Poin"',
      '"Task Selesai"',
      '"Task Berjalan"',
      '"Total Jam Pengerjaan"',
      '"Rata-rata Jam/Task"',
      '"Jumlah Revisi"',
      '"Total Jam Revisi"',
      '"Poin / Jam Kerja"',
      '"Utilisasi Waktu (Basis 40j/mgg)"',
      '"Status Efisiensi"',
    ].join(',')
  );

  designers.forEach((d) => {
    lines.push(
      [
        d.rank,
        `"${d.user_name}"`,
        `"${d.role_name}"`,
        `"${d.team_type}"`,
        d.total_points,
        d.total_completed_tasks,
        d.total_in_progress_tasks,
        d.total_turnaround_hours,
        d.avg_turnaround_hours,
        d.total_revision_count,
        d.total_revision_hours,
        d.points_per_working_hour,
        `"${d.time_utilization_rate}%"`,
        `"${d.efficiency_rating}"`,
      ].join(',')
    );
  });

  lines.push('');

  // Section 2: Log Rincian Task
  lines.push(`"RINCIAN LOG TASK"`);
  lines.push(
    [
      '"Kode Task"',
      '"Judul / Konten"',
      '"Pipeline"',
      '"Tim"',
      '"PIC"',
      '"Klien"',
      '"Kampanye"',
      '"Tingkat Kesulitan"',
      '"Poin"',
      '"Status"',
      '"Waktu Ditugaskan"',
      '"Waktu Disetujui"',
      '"Durasi Turnaround (Jam)"',
      '"Durasi (Hari Kalender)"',
      '"Jumlah Revisi"',
      '"Estimasi Jam Revisi"',
      '"Link Aset Final"',
    ].join(',')
  );

  tasks.forEach((t) => {
    lines.push(
      [
        `"${t.task_code}"`,
        `"${(t.title || '').replace(/"/g, '""')}"`,
        `"${t.pipeline}"`,
        `"${t.team_type}"`,
        `"${t.pic_name}"`,
        `"${t.client_name}"`,
        `"${t.campaign_name}"`,
        `"${t.difficulty_label}"`,
        t.difficulty_points,
        `"${t.status}"`,
        `"${t.assigned_at || '-'}"`,
        `"${t.approved_at || '-'}"`,
        t.turnaround_hours,
        t.working_days,
        t.revision_count,
        t.revision_hours,
        `"${t.final_asset_link || t.link_motion || '-'}"`,
      ].join(',')
    );
  });

  return lines.join('\n');
}

