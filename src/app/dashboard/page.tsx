'use client';

import { useEffect, useState, useCallback } from 'react';

import { useAuth } from '@/lib/auth';
import { getDashboardStats, getAllTasksWithRelations, getDesignerWorkloads, getTasks } from '@/lib/supabase-store';
import { DESIGN_STATUS_COLORS, DESIGN_STATUS_LABELS, EXCELLENCE_COLORS, EXCELLENCE_LABELS, DIFFICULTY_COLORS, DIFFICULTY_LABELS } from '@/lib/constants';
import { formatDisplayDate, getMonthName, cn, getInitials } from '@/lib/utils';
import { DashboardStats, TaskWithRelations, DesignerWorkload, OperationalExcellence } from '@/lib/types';
import Link from 'next/link';
import {
  ClipboardList, AlertTriangle, CheckCircle2, Clock, Film,
  TrendingUp, Users, Zap, ArrowRight, BarChart3, Target,
  AlertCircle, Activity, ChevronRight, Calendar, Filter
} from 'lucide-react';

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [workloads, setWorkloads] = useState<DesignerWorkload[]>([]);
  const [recentTasks, setRecentTasks] = useState<TaskWithRelations[]>([]);
  const [slaBreakdown, setSlaBreakdown] = useState<Record<OperationalExcellence, number>>({ EXCELLENCE: 0, GOOD: 0, BAD: 0 });
  const [allTasksRaw, setAllTasksRaw] = useState<TaskWithRelations[]>([]);

  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [filterYear, setFilterYear] = useState<string>('all');

  const loadData = useCallback(async () => {
    try {
      const [s, w, allTasks] = await Promise.all([
        getDashboardStats({ filterMonth, filterYear }),
        getDesignerWorkloads(filterMonth, filterYear),
        getAllTasksWithRelations()
      ]);
      setStats(s);
      setWorkloads(w);
      setAllTasksRaw(allTasks);

      // Filter tasks by period for recent tasks and SLA breakdown
      const periodTasks = allTasks.filter(t => {
        const dStr = t.req_date || t.created_at || '';
        if (!dStr) return true;
        const y = dStr.substring(0, 4);
        const m = dStr.substring(5, 7);
        if (filterYear !== 'all' && y !== filterYear) return false;
        if (filterMonth !== 'all' && m !== filterMonth) return false;
        return true;
      });

      setRecentTasks(periodTasks.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 8));

      const withExcellence = periodTasks.filter(t => t.operational_excellence);
      const breakdown: Record<OperationalExcellence, number> = { EXCELLENCE: 0, GOOD: 0, BAD: 0 };
      withExcellence.forEach(t => {
        if (t.operational_excellence) breakdown[t.operational_excellence]++;
      });
      setSlaBreakdown(breakdown);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    }
  }, [filterMonth, filterYear]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const availableYears = Array.from(new Set([
    ...allTasksRaw.map(t => (t.req_date || t.created_at || '').substring(0, 4)).filter(Boolean),
    String(new Date().getFullYear())
  ])).sort().reverse();

  const getPeriodLabel = () => {
    if (filterMonth === 'all' && filterYear === 'all') return 'All Time';
    if (filterMonth === 'all') return `Year ${filterYear}`;
    if (filterYear === 'all') return `${getMonthName(Number(filterMonth))} (All Years)`;
    return `${getMonthName(Number(filterMonth))} ${filterYear}`;
  };

  if (!user) return null;
  if (!stats) {
    return (
      <div className="flex items-center justify-center p-20 min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-7 h-7 border-2 border-[var(--accent-blue)] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-[var(--text-muted)]">Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  const statCards = [
    { label: 'Active Tasks', value: stats.active_tasks, icon: ClipboardList, color: 'var(--accent-blue)' },
    { label: 'Unassigned', value: stats.unassigned_tasks, icon: AlertTriangle, color: 'var(--accent-orange)' },
    { label: 'In Progress', value: stats.in_progress_tasks, icon: Activity, color: 'var(--accent-cyan)' },
    { label: 'Completed', value: stats.completed_tasks, icon: CheckCircle2, color: 'var(--accent-emerald)' },
    { label: 'Motion Queue', value: stats.motion_queue, icon: Film, color: 'var(--accent-purple)' },
    { label: 'This Period', value: stats.total_tasks_this_month, icon: Target, color: 'var(--accent-amber)' },
  ];

  const totalSla = slaBreakdown.EXCELLENCE + slaBreakdown.GOOD + slaBreakdown.BAD;
  const excellenceRate = totalSla > 0 ? ((slaBreakdown.EXCELLENCE / totalSla) * 100).toFixed(1) : '0';
  const complianceRate = totalSla > 0 ? (((slaBreakdown.EXCELLENCE + slaBreakdown.GOOD) / totalSla) * 100).toFixed(1) : '0';

  return (
    <div className="space-y-5">
      {/* Header & Filter Bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', margin: 0, lineHeight: 1.3 }}>
            Selamat datang, {user.full_name}
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '2px 0 0' }}>
            Ringkasan operasional tim kreatif — <strong style={{ color: 'var(--text-primary)' }}>{getPeriodLabel()}</strong>
          </p>
        </div>

        {/* Period Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Calendar className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          <select 
            className="select" 
            style={{ width: 'auto', padding: '5px 28px 5px 8px', fontSize: '12px' }}
            value={filterMonth} 
            onChange={(e) => setFilterMonth(e.target.value)}
          >
            <option value="all">All Months</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={String(m).padStart(2, '0')}>{getMonthName(m)}</option>
            ))}
          </select>
          <select 
            className="select" 
            style={{ width: 'auto', padding: '5px 28px 5px 8px', fontSize: '12px' }}
            value={filterYear} 
            onChange={(e) => setFilterYear(e.target.value)}
          >
            <option value="all">All Years</option>
            {availableYears.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map((s, i) => (
          <div key={i} className="stat-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <s.icon style={{ width: '16px', height: '16px', color: s.color }} />
            </div>
            <p style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)', lineHeight: 1, margin: 0 }}>{s.value}</p>
            <p style={{ fontSize: '11px', marginTop: '4px', color: 'var(--text-muted)' }}>{s.label}</p>
          </div>
            ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* SLA Compliance */}
        <div className="card-static p-5">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
              <Zap style={{ width: '14px', height: '14px', color: 'var(--accent-emerald)' }} />
              SLA Compliance
            </h3>
            <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
              All Time
            </span>
          </div>

          {/* Circular Progress */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
            <div style={{ position: 'relative', width: '120px', height: '120px' }}>
              <svg style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }} viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" strokeWidth="6" stroke="var(--bg-tertiary)" />
                <circle cx="50" cy="50" r="42" fill="none" strokeWidth="6"
                  stroke="var(--accent-emerald)"
                  strokeDasharray={`${Number(complianceRate) * 2.64} 264`}
                  strokeLinecap="round" />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)', lineHeight: 1 }}>{complianceRate}%</span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>On-Time Rate</span>
              </div>
            </div>
          </div>

          {/* Breakdown */}
          <div className="space-y-3">
            {(['EXCELLENCE', 'GOOD', 'BAD'] as OperationalExcellence[]).map(status => {
              const count = slaBreakdown[status];
              const pct = totalSla > 0 ? ((count / totalSla) * 100) : 0;
              return (
                <div key={status}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span className={`badge ${EXCELLENCE_COLORS[status]}`}>{EXCELLENCE_LABELS[status]}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{count} ({pct.toFixed(0)}%)</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{
                      width: `${pct}%`,
                      background: status === 'EXCELLENCE' ? 'var(--accent-emerald)' : status === 'GOOD' ? 'var(--accent-blue)' : 'var(--accent-red)'
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Team Workload */}
        <div className="card-static p-5">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
              <Users style={{ width: '14px', height: '14px', color: 'var(--accent-purple)' }} />
              Team Workload
            </h3>
            <Link href="/dashboard/capacity" style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '2px', color: 'var(--accent-blue)', textDecoration: 'none' }}>
              Detail <ChevronRight style={{ width: '12px', height: '12px' }} />
            </Link>
          </div>

          <div className="space-y-3">
            {workloads.map(w => {
              const occupancy = w.daily_capacity > 0 ? (w.accumulated_points / (w.daily_capacity * 20)) * 100 : 0;
              const isOver = occupancy > 100;
              return (
                <div key={w.designer_id}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '24px', height: '24px', borderRadius: '4px', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', fontSize: '9px',
                        fontWeight: '700', color: '#fff', background: 'var(--accent-blue)', flexShrink: 0
                      }}>
                        {w.designer_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <p style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-primary)', margin: 0, lineHeight: 1.2 }}>{w.designer_name}</p>
                        <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: 0 }}>
                          {w.active_tasks_count} active • {w.accumulated_points.toFixed(1)} pts
                        </p>
                      </div>
                    </div>
                    <span style={{
                      fontSize: '11px', fontWeight: '600',
                      color: isOver ? 'var(--accent-red)' : occupancy > 80 ? 'var(--accent-amber)' : 'var(--accent-emerald)'
                    }}>
                      {occupancy.toFixed(0)}%
                    </span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{
                      width: `${Math.min(occupancy, 100)}%`,
                      background: isOver ? 'var(--accent-red)' : occupancy > 80 ? 'var(--accent-amber)' : 'var(--accent-emerald)'
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Alerts & Actions */}
        <div className="card-static p-5">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
              <AlertCircle style={{ width: '14px', height: '14px', color: 'var(--accent-amber)' }} />
              Alerts & Actions
            </h3>
          </div>

          {stats.approaching_deadline.length === 0 && stats.overdue_tasks.length === 0 && stats.unassigned_tasks === 0 ? (
            <div className="empty-state py-8">
              <CheckCircle2 style={{ width: '28px', height: '28px', color: 'var(--accent-emerald)' }} />
              <p style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)' }}>All Clear!</p>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>No urgent actions required</p>
            </div>
          ) : (
            <div className="space-y-3">
              {stats.overdue_tasks.length > 0 && (
                <div style={{ padding: '10px 12px', borderRadius: '6px', background: 'color-mix(in srgb, var(--accent-red) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-red) 20%, transparent)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <AlertTriangle style={{ width: '14px', height: '14px', color: 'var(--accent-red)' }} />
                    <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--accent-red)' }}>Overdue Tasks ({stats.overdue_tasks.length})</span>
                  </div>
                  {stats.overdue_tasks.slice(0, 3).map(t => (
                    <p key={t.id} style={{ fontSize: '11px', marginLeft: '20px', marginTop: '2px', color: 'var(--text-secondary)' }}>
                      {t.task_code} - {t.client_name} • Due: {formatDisplayDate(t.due_date)}
                    </p>
                  ))}
                </div>
              )}

              {stats.approaching_deadline.length > 0 && (
                <div style={{ padding: '10px 12px', borderRadius: '6px', background: 'color-mix(in srgb, var(--accent-amber) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-amber) 20%, transparent)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <Clock style={{ width: '14px', height: '14px', color: 'var(--accent-amber)' }} />
                    <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--accent-amber)' }}>Approaching Deadline ({stats.approaching_deadline.length})</span>
                  </div>
                  {stats.approaching_deadline.slice(0, 3).map(t => (
                    <p key={t.id} style={{ fontSize: '11px', marginLeft: '20px', marginTop: '2px', color: 'var(--text-secondary)' }}>
                      {t.task_code} - {t.client_name} • Due: {formatDisplayDate(t.due_date)}
                    </p>
                  ))}
                </div>
              )}

              {stats.unassigned_tasks > 0 && (
                <Link href="/dashboard/tasks" style={{ 
                  display: 'block', padding: '10px 12px', borderRadius: '6px', textDecoration: 'none',
                  background: 'color-mix(in srgb, var(--accent-blue) 8%, transparent)', 
                  border: '1px solid color-mix(in srgb, var(--accent-blue) 20%, transparent)',
                  transition: 'border-color 0.12s ease'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ClipboardList style={{ width: '14px', height: '14px', color: 'var(--accent-blue)' }} />
                      <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--accent-blue)' }}>{stats.unassigned_tasks} Unassigned Tasks</span>
                    </div>
                    <ArrowRight style={{ width: '14px', height: '14px', color: 'var(--accent-blue)' }} />
                  </div>
                </Link>
              )}
            </div>
          )}
        </div>
      </div>


      {/* Recent Tasks List */}
      <div className="card-static" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-primary)' }}>
          <h3 style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
            <TrendingUp style={{ width: '14px', height: '14px', color: 'var(--accent-cyan)' }} />
            Recent Activity
          </h3>
          <Link href="/dashboard/tasks" style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '2px', color: 'var(--accent-blue)', textDecoration: 'none' }}>
            View All <ChevronRight style={{ width: '12px', height: '12px' }} />
          </Link>
        </div>

        {/* Mobile View (Cards) */}
        <div className="md:hidden flex flex-col">
          {recentTasks.map(task => (
            <div key={task.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-secondary)', cursor: 'pointer', transition: 'background 0.1s ease' }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                <div>
                  <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: '600', color: 'var(--accent-blue)' }}>{task.task_code}</span>
                  <p style={{ fontWeight: '500', color: 'var(--text-primary)', fontSize: '13px', marginTop: '2px' }}>{task.client_name}</p>
                </div>
                <span className={`badge ${DESIGN_STATUS_COLORS[task.status_design]}`}>
                  {DESIGN_STATUS_LABELS[task.status_design]}
                </span>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>{task.campaign_name} • {task.content_type_name}</p>
              
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{
                    width: '20px', height: '20px', borderRadius: '4px', background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-primary)', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '8px', fontWeight: '700'
                  }}>
                    {getInitials(task.design_pic_name || '?')}
                  </div>
                  <span style={{ color: task.design_pic_name ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: '500' }}>
                    {task.design_pic_name || 'Unassigned'}
                  </span>
                </div>
                <span style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>{formatDisplayDate(task.due_date)}</span>
              </div>
            </div>
            ))}
        </div>

        {/* Desktop View (Table) */}
        <div className="hidden md:block table-container" style={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>Task Code</th>
                <th>Brand / Campaign</th>
                <th>Content Type</th>
                <th>Designer</th>
                <th>Status</th>
                <th>SLA</th>
                <th>Due Date</th>
              </tr>
            </thead>
            <tbody>
              {recentTasks.map(task => (
                <tr key={task.id} className="cursor-pointer">
                  <td>
                    <span style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: '600', color: 'var(--accent-blue)' }}>
                      {task.task_code}
                    </span>
                  </td>
                  <td>
                    <p style={{ fontWeight: '500', color: 'var(--text-primary)', fontSize: '13px', margin: 0 }}>{task.client_name}</p>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>{task.campaign_name}</p>
                  </td>
                  <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{task.content_type_name}</td>
                  <td style={{ fontSize: '12px', color: task.design_pic_name ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                    {task.design_pic_name || 'Unassigned'}
                  </td>
                  <td>
                    <span className={`badge ${DESIGN_STATUS_COLORS[task.status_design]}`}>
                      {DESIGN_STATUS_LABELS[task.status_design]}
                    </span>
                  </td>
                  <td>
                    {task.operational_excellence ? (
                      <span className={`badge ${EXCELLENCE_COLORS[task.operational_excellence]}`}>
                        {EXCELLENCE_LABELS[task.operational_excellence]}
                      </span>
                    ) : (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>—</span>
                    )}
                  </td>
                  <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {formatDisplayDate(task.due_date)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
