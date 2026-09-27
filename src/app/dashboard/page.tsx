'use client';

import { useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { getDashboardStats, getAllTasksWithRelations, getDesignerWorkloads, getTasks } from '@/lib/supabase-store';
import { DESIGN_STATUS_COLORS, DESIGN_STATUS_LABELS, EXCELLENCE_COLORS, EXCELLENCE_LABELS, DIFFICULTY_COLORS, DIFFICULTY_LABELS } from '@/lib/constants';
import { formatDisplayDate, cn } from '@/lib/utils';
import { DashboardStats, TaskWithRelations, DesignerWorkload, OperationalExcellence } from '@/lib/types';
import Link from 'next/link';
import {
  ClipboardList, AlertTriangle, CheckCircle2, Clock, Film,
  TrendingUp, Users, Zap, ArrowRight, BarChart3, Target,
  AlertCircle, Activity, ChevronRight
} from 'lucide-react';

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [workloads, setWorkloads] = useState<DesignerWorkload[]>([]);
  const [recentTasks, setRecentTasks] = useState<TaskWithRelations[]>([]);
  const [slaBreakdown, setSlaBreakdown] = useState<Record<OperationalExcellence, number>>({ EXCELLENCE: 0, GOOD: 0, BAD: 0 });

  useEffect(() => {
    async function loadData() {
      try {
        const [s, w, allTasks, tasks] = await Promise.all([
          getDashboardStats(),
          getDesignerWorkloads(),
          getAllTasksWithRelations(),
          getTasks()
        ]);
        setStats(s);
        setWorkloads(w);
        setRecentTasks(allTasks.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 8));

        const withExcellence = tasks.filter(t => t.operational_excellence);
        const breakdown: Record<OperationalExcellence, number> = { EXCELLENCE: 0, GOOD: 0, BAD: 0 };
        withExcellence.forEach(t => {
          if (t.operational_excellence) breakdown[t.operational_excellence]++;
        });
        setSlaBreakdown(breakdown);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      }
    }
    loadData();
  }, []);

  if (!user) return null;
  if (!stats) {
    return (
      <div className="flex items-center justify-center p-20 min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[var(--accent-blue)] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[var(--text-muted)]">Loading dashboard data from Supabase...</p>
        </div>
      </div>
    );
  }

  const statCards = [
    { label: 'Active Tasks', value: stats.active_tasks, icon: ClipboardList, gradient: 'var(--gradient-1)', color: 'var(--accent-blue)' },
    { label: 'Unassigned', value: stats.unassigned_tasks, icon: AlertTriangle, gradient: 'var(--gradient-3)', color: 'var(--accent-orange)' },
    { label: 'In Progress', value: stats.in_progress_tasks, icon: Activity, gradient: 'var(--gradient-2)', color: 'var(--accent-cyan)' },
    { label: 'Completed', value: stats.completed_tasks, icon: CheckCircle2, gradient: 'var(--gradient-4)', color: 'var(--accent-emerald)' },
    { label: 'Motion Queue', value: stats.motion_queue, icon: Film, gradient: 'linear-gradient(135deg, #ec4899, #8b5cf6)', color: 'var(--accent-pink)' },
    { label: 'This Month', value: stats.total_tasks_this_month, icon: Target, gradient: 'linear-gradient(135deg, #f59e0b, #f97316)', color: 'var(--accent-amber)' },
  ];

  const totalSla = slaBreakdown.EXCELLENCE + slaBreakdown.GOOD + slaBreakdown.BAD;
  const excellenceRate = totalSla > 0 ? ((slaBreakdown.EXCELLENCE / totalSla) * 100).toFixed(1) : '0';
  const complianceRate = totalSla > 0 ? (((slaBreakdown.EXCELLENCE + slaBreakdown.GOOD) / totalSla) * 100).toFixed(1) : '0';

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="card-static p-6 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5 absolute inset-0 opacity-5 bg-[var(--gradient-1)]" />
        <div className="relative z-10">
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-1">
            Selamat datang, {user.full_name}
          </h1>
          <p className="text-[var(--text-secondary)] text-sm">
            Berikut ringkasan operasional tim kreatif hari ini — {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((s, i) => (
          <div key={i} className="stat-card group">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110"
                style={{ background: `${s.color}15` }}>
                <s.icon className="w-5 h-5" style={{ color: s.color }} />
              </div>
            </div>
            <p className="text-2xl font-bold text-[var(--text-primary)]">{s.value}</p>
            <p className="text-xs mt-1 text-[var(--text-muted)]">{s.label}</p>
          </div>
            ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* SLA Compliance */}
        <div className="card-static p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <Zap className="w-4 h-4 text-[var(--accent-emerald)]" />
              SLA Compliance
            </h3>
            <span className="text-xs px-2 py-1 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
              All Time
            </span>
          </div>

          {/* Circular Progress */}
          <div className="flex justify-center mb-6">
            <div className="relative w-36 h-36">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" strokeWidth="8" stroke="var(--bg-tertiary)" />
                <circle cx="50" cy="50" r="42" fill="none" strokeWidth="8"
                  stroke="url(#sla-gradient)"
                  strokeDasharray={`${Number(complianceRate) * 2.64} 264`}
                  strokeLinecap="round" />
                <defs>
                  <linearGradient id="sla-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="var(--accent-emerald)" />
                    <stop offset="100%" stopColor="var(--accent-cyan)" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-[var(--text-primary)]">{complianceRate}%</span>
                <span className="text-[10px] text-[var(--text-muted)]">On-Time Rate</span>
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
                  <div className="flex items-center justify-between mb-1">
                    <span className={`badge ${EXCELLENCE_COLORS[status]}`}>{EXCELLENCE_LABELS[status]}</span>
                    <span className="text-xs text-[var(--text-secondary)]">{count} ({pct.toFixed(0)}%)</span>
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
        <div className="card-static p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <Users className="w-4 h-4 text-[var(--accent-purple)]" />
              Team Workload
            </h3>
            <Link href="/dashboard/capacity" className="text-xs flex items-center gap-1 text-[var(--accent-blue)]">
              Detail <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="space-y-4">
            {workloads.map(w => {
              const occupancy = w.daily_capacity > 0 ? (w.accumulated_points / (w.daily_capacity * 20)) * 100 : 0;
              const isOver = occupancy > 100;
              return (
                <div key={w.designer_id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold text-[var(--text-primary)] absolute inset-0 opacity-5 bg-[var(--gradient-1)]">
                        {w.designer_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">{w.designer_name}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">
                          {w.active_tasks_count} active • {w.accumulated_points.toFixed(1)} pts
                        </p>
                      </div>
                    </div>
                    <span className={`text-xs font-semibold ${isOver ? 'text-[var(--accent-red)]' : occupancy > 80 ? 'text-[var(--accent-amber)]' : 'text-[var(--accent-emerald)]'}`}>
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
        <div className="card-static p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[var(--accent-amber)]" />
              Alerts & Actions
            </h3>
          </div>

          {stats.approaching_deadline.length === 0 && stats.overdue_tasks.length === 0 && stats.unassigned_tasks === 0 ? (
            <div className="empty-state py-10">
              <CheckCircle2 className="w-10 h-10 mb-3 text-[var(--accent-emerald)]" />
              <p className="text-sm font-medium text-[var(--text-primary)]">All Clear!</p>
              <p className="text-xs text-[var(--text-muted)]">No urgent actions required</p>
            </div>
          ) : (
            <div className="space-y-3">
              {stats.overdue_tasks.length > 0 && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-4 h-4 text-[var(--accent-red)]" />
                    <span className="text-sm font-semibold text-[var(--accent-red)]">Overdue Tasks ({stats.overdue_tasks.length})</span>
                  </div>
                  {stats.overdue_tasks.slice(0, 3).map(t => (
                    <p key={t.id} className="text-xs ml-6 mt-1 text-[var(--text-secondary)]">
                      {t.task_code} - {t.client_name} • Due: {formatDisplayDate(t.due_date)}
                    </p>
                  ))}
                </div>
              )}

              {stats.approaching_deadline.length > 0 && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="w-4 h-4 text-[var(--accent-amber)]" />
                    <span className="text-sm font-semibold text-[var(--accent-amber)]">Approaching Deadline ({stats.approaching_deadline.length})</span>
                  </div>
                  {stats.approaching_deadline.slice(0, 3).map(t => (
                    <p key={t.id} className="text-xs ml-6 mt-1 text-[var(--text-secondary)]">
                      {t.task_code} - {t.client_name} • Due: {formatDisplayDate(t.due_date)}
                    </p>
                  ))}
                </div>
              )}

              {stats.unassigned_tasks > 0 && (
                <Link href="/dashboard/tasks" className="block p-3 rounded-lg transition-colors hover:border-blue-500 bg-blue-500/10 border border-blue-500/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ClipboardList className="w-4 h-4 text-[var(--accent-blue)]" />
                      <span className="text-sm font-semibold text-[var(--accent-blue)]">{stats.unassigned_tasks} Unassigned Tasks</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-[var(--accent-blue)]" />
                  </div>
                </Link>
              )}
            </div>
          )}
        </div>
      </div>


      {/* Recent Tasks List */}
      <div className="card-static overflow-hidden">
        <div className="p-4 flex items-center justify-between border-b border-[var(--border-primary)]">
          <h3 className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[var(--accent-cyan)]" />
            Recent Activity
          </h3>
          <Link href="/dashboard/tasks" className="text-xs flex items-center gap-1 text-[var(--accent-blue)]">
            View All <ChevronRight className="w-3 h-3" />
          </Link>
        </div>

        {/* Mobile View (Cards) */}
        <div className="md:hidden flex flex-col">
          {recentTasks.map(task => (
            <div key={task.id} className="p-4 border-b border-[var(--border-primary)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span className="font-mono text-xs font-semibold text-[var(--accent-blue)]">{task.task_code}</span>
                  <p className="font-medium text-[var(--text-primary)] text-sm mt-1">{task.client_name}</p>
                </div>
                <span className={`badge ${DESIGN_STATUS_COLORS[task.status_design]}`}>
                  {DESIGN_STATUS_LABELS[task.status_design]}
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] mb-3">{task.campaign_name} • {task.content_type_name}</p>
              
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-6 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border-primary)] flex items-center justify-center text-[9px] font-bold">
                    {task.design_pic_name ? task.design_pic_name.substring(0, 2).toUpperCase() : '?'}
                  </div>
                  <span className={task.design_pic_name ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-muted)]'}>
                    {task.design_pic_name || 'Unassigned'}
                  </span>
                </div>
                <span className="text-[var(--text-secondary)] font-medium">{formatDisplayDate(task.due_date)}</span>
              </div>
            </div>
            ))}
        </div>

        {/* Desktop View (Table) */}
        <div className="hidden md:block table-container border-none rounded-none">
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
                <tr key={task.id} className="cursor-pointer hover:bg-[var(--bg-hover)] transition-colors">
                  <td>
                    <span className="font-mono text-sm font-semibold text-[var(--accent-blue)]">
                      {task.task_code}
                    </span>
                  </td>
                  <td>
                    <p className="font-medium text-[var(--text-primary)] text-sm">{task.client_name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{task.campaign_name}</p>
                  </td>
                  <td className="text-sm text-[var(--text-secondary)]">{task.content_type_name}</td>
                  <td className={`text-sm ${task.design_pic_name ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>
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
                      <span className="text-xs text-[var(--text-muted)]">—</span>
                    )}
                  </td>
                  <td className="text-sm text-[var(--text-secondary)]">
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
/* rebuild */
