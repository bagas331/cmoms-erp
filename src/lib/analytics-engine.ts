// ============================================================
// CMOS - Operational Analytics & Pivot Table Engine
// Single Source of Truth Calculation Layer
// ============================================================

import {
  CreativeTask, TaskWithRelations, User, Client, ContentType, Holiday,
  OperationalExcellence, DesignDifficulty, TaskSource, DesignStatus
} from './types';
import { DIFFICULTY_WEIGHTS } from './constants';
import { calculateBusinessDays, evaluateOperationalExcellence } from './sla-engine';
import { getMonthName } from './utils';

// --- TYPES FOR OPERATIONAL ANALYTICS ---

export interface GlobalAnalyticsFilter {
  month: string; // 'all' or '01'-'12'
  year: string;  // 'all' or '2025', '2026', etc.
  clientId: string; // 'all' or number string
  picId: string; // 'all' or user uuid
  taskSource: string; // 'all' or 'ORCA' | 'ECOMMERCE'
  contentTypeId: string; // 'all' or number string
  difficulty: string; // 'all' or 'LOW' | 'MEDIUM' | 'HIGH'
  operationalExcellence: string; // 'all' or 'EXCELLENCE' | 'GOOD' | 'BAD'
  status: string; // 'all' or DesignStatus
}

export interface OccupancyItem {
  pic_id: string;
  pic_name: string;
  role_name: string;
  month_label: string;
  high_count: number;
  medium_count: number;
  low_count: number;
  unassigned_diff_count: number;
  total_tasks: number;
  total_points: number;
  daily_capacity: number;
  max_capacity: number; // monthly (daily * 20)
  occupancy_rate: number; // percentage
  occupancy_status: 'OVERLOAD' | 'FULL CAPACITY' | 'AVAILABLE CAPACITY';
  tasks: TaskWithRelations[];
}

export interface RequestVsOutputItem {
  content_type_id: number;
  content_type_name: string;
  task_source: TaskSource;
  req_qty: number;
  output_qty: number;
  achievement_rate: number; // percentage
  request_gap: number; // req_qty - output_qty
  task_count: number;
  tasks: TaskWithRelations[];
}

export interface SLAPerformanceReport {
  total_completed: number;
  excellence_count: number;
  good_count: number;
  bad_count: number;
  excellence_rate: number;
  good_rate: number;
  bad_rate: number;
  monthly_trend: {
    month_key: string;
    month_label: string;
    total: number;
    excellence: number;
    good: number;
    bad: number;
    excellence_rate: number;
    good_rate: number;
    bad_rate: number;
    tasks: TaskWithRelations[];
  }[];
  by_pic: {
    pic_id: string;
    pic_name: string;
    total: number;
    excellence: number;
    good: number;
    bad: number;
    excellence_rate: number;
    avg_working_days: number;
    tasks: TaskWithRelations[];
  }[];
  tasks: TaskWithRelations[];
}

export interface BrandDistributionPivot {
  months: string[]; // ['2026-01', '2026-02', ...]
  rows: {
    client_id: number;
    client_name: string;
    client_type: string;
    monthly_values: Record<string, number>; // month_key -> req_qty
    monthly_task_count: Record<string, number>; // month_key -> task count
    row_total_qty: number;
    row_total_tasks: number;
    content_breakdown: {
      content_type_name: string;
      req_qty: number;
      task_count: number;
    }[];
  }[];
  column_totals: Record<string, number>;
  grand_total_qty: number;
  grand_total_tasks: number;
}

export interface OperationalSummaryKPIs {
  total_request_qty: number;
  total_output_qty: number;
  output_achievement_rate: number;
  total_tasks_count: number;
  average_team_occupancy: number;
  overloaded_pics_count: number;
  sla_excellence_rate: number;
  sla_bad_rate: number;
  active_brands_count: number;
  total_points: number;
}

// --- CALCULATION HELPERS ---

/**
 * Filter task array based on interconnected global filter state
 */
export function filterTasksByGlobalFilter(
  tasks: TaskWithRelations[],
  filter: GlobalAnalyticsFilter
): TaskWithRelations[] {
  return tasks.filter(t => {
    const dStr = t.req_date || t.created_at || '';
    if (!dStr) return true;
    const yearStr = dStr.substring(0, 4);
    const monthStr = dStr.substring(5, 7);

    if (filter.year !== 'all' && yearStr !== filter.year) return false;
    if (filter.month !== 'all' && monthStr !== filter.month) return false;
    if (filter.clientId !== 'all' && String(t.client_id) !== filter.clientId) return false;
    if (filter.picId !== 'all' && t.design_pic_id !== filter.picId && t.strat_pic_id !== filter.picId) return false;
    if (filter.taskSource !== 'all' && t.task_source !== filter.taskSource) return false;
    if (filter.contentTypeId !== 'all' && String(t.content_type_id) !== filter.contentTypeId) return false;
    if (filter.difficulty !== 'all' && (t.design_difficulty || 'MEDIUM') !== filter.difficulty) return false;
    if (filter.operationalExcellence !== 'all' && t.operational_excellence !== filter.operationalExcellence) return false;
    if (filter.status !== 'all' && t.status_design !== filter.status) return false;

    return true;
  });
}

/**
 * Calculate Team Occupancy & Workload Pivot
 */
export function calculateTeamOccupancy(
  tasks: TaskWithRelations[],
  users: User[],
  periodLabel: string = 'Current Period'
): OccupancyItem[] {
  const eligibleDesigners = users.filter(u => ['DESIGNER', 'TEAM_LEAD'].includes(u.role_name));

  return eligibleDesigners.map(user => {
    const userTasks = tasks.filter(t => t.design_pic_id === user.id);

    let highCount = 0;
    let mediumCount = 0;
    let lowCount = 0;
    let unassignedDiffCount = 0;
    let accumulatedPoints = 0;

    userTasks.forEach(t => {
      const diff = t.design_difficulty || 'MEDIUM';
      if (diff === 'HIGH') highCount++;
      else if (diff === 'MEDIUM') mediumCount++;
      else if (diff === 'LOW') lowCount++;
      else unassignedDiffCount++;

      const weight = DIFFICULTY_WEIGHTS[diff] || 3.5;
      const qty = t.output_qty || t.req_qty || 1;
      accumulatedPoints += qty * weight;
    });

    const dailyCap = user.daily_capacity_points || 0;
    const maxMonthlyCap = dailyCap * 20; // 20 working days / month benchmark

    const occupancyRate = maxMonthlyCap > 0
      ? (accumulatedPoints / maxMonthlyCap) * 100
      : 0;

    let occupancyStatus: 'OVERLOAD' | 'FULL CAPACITY' | 'AVAILABLE CAPACITY' = 'AVAILABLE CAPACITY';
    if (occupancyRate > 100) occupancyStatus = 'OVERLOAD';
    else if (occupancyRate === 100) occupancyStatus = 'FULL CAPACITY';

    return {
      pic_id: user.id,
      pic_name: user.full_name,
      role_name: user.role_name,
      month_label: periodLabel,
      high_count: highCount,
      medium_count: mediumCount,
      low_count: lowCount,
      unassigned_diff_count: unassignedDiffCount,
      total_tasks: userTasks.length,
      total_points: Math.round(accumulatedPoints * 100) / 100,
      daily_capacity: dailyCap,
      max_capacity: maxMonthlyCap,
      occupancy_rate: Math.round(occupancyRate * 100) / 100,
      occupancy_status: occupancyStatus,
      tasks: userTasks
    };
  });
}

/**
 * Calculate Request vs Output Analytics
 */
export function calculateRequestVsOutput(
  tasks: TaskWithRelations[],
  contentTypes: ContentType[]
): {
  items: RequestVsOutputItem[];
  ecommerceSummary: { req_qty: number; output_qty: number; achievement: number; gap: number };
  orcaSummary: { req_qty: number; output_qty: number; achievement: number; gap: number };
  grandTotal: { req_qty: number; output_qty: number; achievement: number; gap: number; task_count: number };
} {
  const items: RequestVsOutputItem[] = [];
  const sources: TaskSource[] = ['ECOMMERCE', 'ORCA'];

  sources.forEach(source => {
    contentTypes.forEach(ct => {
      const matchingTasks = tasks.filter(t => t.content_type_id === ct.id && t.task_source === source);
      if (matchingTasks.length === 0) return;

      const reqQty = matchingTasks.reduce((sum, t) => sum + (t.req_qty || 1), 0);
      const outputQty = matchingTasks.reduce((sum, t) => sum + (t.output_qty || (['DESIGN_APPROVED', 'TASK_CLOSED', 'DESIGN_SUBMITTED'].includes(t.status_design) ? t.req_qty : 0)), 0);
      const achievementRate = reqQty > 0 ? (outputQty / reqQty) * 100 : 0;
      const requestGap = reqQty - outputQty;

      items.push({
        content_type_id: ct.id,
        content_type_name: ct.name,
        task_source: source,
        req_qty: reqQty,
        output_qty: outputQty,
        achievement_rate: Math.round(achievementRate * 100) / 100,
        request_gap: requestGap,
        task_count: matchingTasks.length,
        tasks: matchingTasks
      });
    });
  });

  const ecommTasks = tasks.filter(t => t.task_source === 'ECOMMERCE');
  const ecommReq = ecommTasks.reduce((sum, t) => sum + (t.req_qty || 1), 0);
  const ecommOut = ecommTasks.reduce((sum, t) => sum + (t.output_qty || (['DESIGN_APPROVED', 'TASK_CLOSED', 'DESIGN_SUBMITTED'].includes(t.status_design) ? t.req_qty : 0)), 0);

  const orcaTasks = tasks.filter(t => t.task_source === 'ORCA');
  const orcaReq = orcaTasks.reduce((sum, t) => sum + (t.req_qty || 1), 0);
  const orcaOut = orcaTasks.reduce((sum, t) => sum + (t.output_qty || (['DESIGN_APPROVED', 'TASK_CLOSED', 'DESIGN_SUBMITTED'].includes(t.status_design) ? t.req_qty : 0)), 0);

  const grandReq = tasks.reduce((sum, t) => sum + (t.req_qty || 1), 0);
  const grandOut = tasks.reduce((sum, t) => sum + (t.output_qty || (['DESIGN_APPROVED', 'TASK_CLOSED', 'DESIGN_SUBMITTED'].includes(t.status_design) ? t.req_qty : 0)), 0);

  return {
    items,
    ecommerceSummary: {
      req_qty: ecommReq,
      output_qty: ecommOut,
      achievement: ecommReq > 0 ? Math.round((ecommOut / ecommReq) * 10000) / 100 : 0,
      gap: ecommReq - ecommOut
    },
    orcaSummary: {
      req_qty: orcaReq,
      output_qty: orcaOut,
      achievement: orcaReq > 0 ? Math.round((orcaOut / orcaReq) * 10000) / 100 : 0,
      gap: orcaReq - orcaOut
    },
    grandTotal: {
      req_qty: grandReq,
      output_qty: grandOut,
      achievement: grandReq > 0 ? Math.round((grandOut / grandReq) * 10000) / 100 : 0,
      gap: grandReq - grandOut,
      task_count: tasks.length
    }
  };
}

/**
 * Calculate SLA Performance & Operational Excellence Analytics
 */
export function calculateSLAPerformance(
  tasks: TaskWithRelations[],
  users: User[],
  holidays: Holiday[]
): SLAPerformanceReport {
  // Only evaluate completed/submitted tasks or tasks with submission date
  const completedTasks = tasks.filter(t => 
    t.operational_excellence || 
    t.submission_date || 
    ['DESIGN_SUBMITTED', 'DESIGN_APPROVED', 'TASK_CLOSED'].includes(t.status_design)
  );

  let excellenceCount = 0;
  let goodCount = 0;
  let badCount = 0;

  // Monthly map
  const monthMap: Record<string, {
    month_key: string;
    month_label: string;
    total: number;
    excellence: number;
    good: number;
    bad: number;
    tasks: TaskWithRelations[];
  }> = {};

  completedTasks.forEach(t => {
    let oe = t.operational_excellence;
    if (!oe && t.req_date && t.submission_date) {
      const days = calculateBusinessDays(t.req_date, t.submission_date, holidays);
      if (days !== null) {
        oe = evaluateOperationalExcellence(days);
      }
    }
    if (!oe) oe = 'EXCELLENCE'; // fallback default if no delay recorded

    if (oe === 'EXCELLENCE') excellenceCount++;
    else if (oe === 'GOOD') goodCount++;
    else if (oe === 'BAD') badCount++;

    const dStr = t.req_date || t.created_at || '';
    if (dStr) {
      const monthKey = dStr.substring(0, 7);
      if (!monthMap[monthKey]) {
        const [y, m] = monthKey.split('-');
        monthMap[monthKey] = {
          month_key: monthKey,
          month_label: `${getMonthName(Number(m))} ${y}`,
          total: 0,
          excellence: 0,
          good: 0,
          bad: 0,
          tasks: []
        };
      }
      monthMap[monthKey].total++;
      if (oe === 'EXCELLENCE') monthMap[monthKey].excellence++;
      else if (oe === 'GOOD') monthMap[monthKey].good++;
      else if (oe === 'BAD') monthMap[monthKey].bad++;
      monthMap[monthKey].tasks.push(t);
    }
  });

  const totalCompleted = completedTasks.length;
  const excellenceRate = totalCompleted > 0 ? Math.round((excellenceCount / totalCompleted) * 10000) / 100 : 100;
  const goodRate = totalCompleted > 0 ? Math.round((goodCount / totalCompleted) * 10000) / 100 : 0;
  const badRate = totalCompleted > 0 ? Math.round((badCount / totalCompleted) * 10000) / 100 : 0;

  const monthlyTrend = Object.values(monthMap)
    .sort((a, b) => a.month_key.localeCompare(b.month_key))
    .map(m => ({
      ...m,
      excellence_rate: m.total > 0 ? Math.round((m.excellence / m.total) * 10000) / 100 : 100,
      good_rate: m.total > 0 ? Math.round((m.good / m.total) * 10000) / 100 : 0,
      bad_rate: m.total > 0 ? Math.round((m.bad / m.total) * 10000) / 100 : 0,
    }));

  // By PIC breakdown
  const designers = users.filter(u => ['DESIGNER', 'TEAM_LEAD'].includes(u.role_name));
  const byPic = designers.map(d => {
    const dTasks = completedTasks.filter(t => t.design_pic_id === d.id);
    const dExcellence = dTasks.filter(t => (t.operational_excellence || 'EXCELLENCE') === 'EXCELLENCE').length;
    const dGood = dTasks.filter(t => t.operational_excellence === 'GOOD').length;
    const dBad = dTasks.filter(t => t.operational_excellence === 'BAD').length;
    const avgDays = dTasks.length > 0 
      ? dTasks.reduce((sum, t) => sum + (t.sla_working_days || 2), 0) / dTasks.length 
      : 0;

    return {
      pic_id: d.id,
      pic_name: d.full_name,
      total: dTasks.length,
      excellence: dExcellence,
      good: dGood,
      bad: dBad,
      excellence_rate: dTasks.length > 0 ? Math.round((dExcellence / dTasks.length) * 10000) / 100 : 100,
      avg_working_days: Math.round(avgDays * 10) / 10,
      tasks: dTasks
    };
  }).filter(p => p.total > 0).sort((a, b) => b.total - a.total);

  return {
    total_completed: totalCompleted,
    excellence_count: excellenceCount,
    good_count: goodCount,
    bad_count: badCount,
    excellence_rate: excellenceRate,
    good_rate: goodRate,
    bad_rate: badRate,
    monthly_trend: monthlyTrend,
    by_pic: byPic,
    tasks: completedTasks
  };
}

/**
 * Calculate Request Distribution Matrix (Brand x Month & Brand x Content Type)
 */
export function calculateBrandDistribution(
  tasks: TaskWithRelations[],
  clients: Client[],
  contentTypes: ContentType[]
): BrandDistributionPivot {
  // Extract all distinct months from task dates
  const monthSet = new Set<string>();
  tasks.forEach(t => {
    const dStr = t.req_date || t.created_at || '';
    if (dStr) {
      monthSet.add(dStr.substring(0, 7));
    }
  });

  const sortedMonths = Array.from(monthSet).sort((a, b) => a.localeCompare(b));
  if (sortedMonths.length === 0) {
    sortedMonths.push(new Date().toISOString().substring(0, 7));
  }

  const columnTotals: Record<string, number> = {};
  sortedMonths.forEach(m => { columnTotals[m] = 0; });

  let grandTotalQty = 0;
  let grandTotalTasks = 0;

  const rows = clients.map(c => {
    const cTasks = tasks.filter(t => t.client_id === c.id);
    const monthlyValues: Record<string, number> = {};
    const monthlyTaskCount: Record<string, number> = {};

    sortedMonths.forEach(m => {
      monthlyValues[m] = 0;
      monthlyTaskCount[m] = 0;
    });

    cTasks.forEach(t => {
      const dStr = t.req_date || t.created_at || '';
      const mKey = dStr ? dStr.substring(0, 7) : sortedMonths[0];
      const qty = t.req_qty || 1;

      if (monthlyValues[mKey] !== undefined) {
        monthlyValues[mKey] += qty;
        monthlyTaskCount[mKey] += 1;
        columnTotals[mKey] += qty;
      }
    });

    const rowTotalQty = cTasks.reduce((sum, t) => sum + (t.req_qty || 1), 0);
    grandTotalQty += rowTotalQty;
    grandTotalTasks += cTasks.length;

    // Content Type breakdown for this brand
    const contentBreakdown = contentTypes.map(ct => {
      const matching = cTasks.filter(t => t.content_type_id === ct.id);
      return {
        content_type_name: ct.name,
        req_qty: matching.reduce((sum, t) => sum + (t.req_qty || 1), 0),
        task_count: matching.length
      };
    }).filter(cb => cb.task_count > 0).sort((a, b) => b.req_qty - a.req_qty);

    return {
      client_id: c.id,
      client_name: c.name,
      client_type: c.client_type,
      monthly_values: monthlyValues,
      monthly_task_count: monthlyTaskCount,
      row_total_qty: rowTotalQty,
      row_total_tasks: cTasks.length,
      content_breakdown: contentBreakdown
    };
  }).filter(r => r.row_total_tasks > 0).sort((a, b) => b.row_total_qty - a.row_total_qty);

  return {
    months: sortedMonths,
    rows,
    column_totals: columnTotals,
    grand_total_qty: grandTotalQty,
    grand_total_tasks: grandTotalTasks
  };
}

/**
 * Calculate Summary Executive KPIs
 */
export function calculateOperationalSummary(
  tasks: TaskWithRelations[],
  users: User[],
  holidays: Holiday[]
): OperationalSummaryKPIs {
  const occupancy = calculateTeamOccupancy(tasks, users);
  const sla = calculateSLAPerformance(tasks, users, holidays);
  const reqOut = calculateRequestVsOutput(tasks, []);

  const totalPoints = occupancy.reduce((sum, o) => sum + o.total_points, 0);
  const activePicsWithCap = occupancy.filter(o => o.max_capacity > 0);
  const avgOccupancy = activePicsWithCap.length > 0
    ? activePicsWithCap.reduce((sum, o) => sum + o.occupancy_rate, 0) / activePicsWithCap.length
    : 0;

  const overloadedCount = occupancy.filter(o => o.occupancy_status === 'OVERLOAD').length;
  const activeBrands = new Set(tasks.map(t => t.client_id)).size;

  return {
    total_request_qty: reqOut.grandTotal.req_qty,
    total_output_qty: reqOut.grandTotal.output_qty,
    output_achievement_rate: reqOut.grandTotal.achievement,
    total_tasks_count: tasks.length,
    average_team_occupancy: Math.round(avgOccupancy * 100) / 100,
    overloaded_pics_count: overloadedCount,
    sla_excellence_rate: sla.excellence_rate,
    sla_bad_rate: sla.bad_rate,
    active_brands_count: activeBrands,
    total_points: Math.round(totalPoints * 100) / 100
  };
}
