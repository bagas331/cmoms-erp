'use client';

import { useEffect, useState } from 'react';
import { getDesignerWorkloads } from '@/lib/supabase-store';
import { DIFFICULTY_COLORS, DIFFICULTY_LABELS, DESIGN_STATUS_COLORS, DESIGN_STATUS_LABELS } from '@/lib/constants';
import { DesignerWorkload } from '@/lib/types';
import { formatDisplayDate } from '@/lib/utils';
import { Users, AlertTriangle, TrendingUp, CheckCircle2, Clock } from 'lucide-react';

export default function CapacityPage() {
  const [workloads, setWorkloads] = useState<DesignerWorkload[]>([]);

  useEffect(() => {
    getDesignerWorkloads().then(setWorkloads).catch(console.error);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Users className="w-5 h-5" style={{ color: 'var(--accent-purple)' }} />
          Workload & Capacity
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Real-time capacity points per designer. Points = Output Qty × Difficulty Weight
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="stat-card">
          <p className="text-2xl font-bold text-[var(--text-primary)]">{workloads.length}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Active Designers</p>
        </div>
        <div className="stat-card">
          <p className="text-2xl font-bold text-[var(--text-primary)]">
            {workloads.reduce((sum, w) => sum + w.active_tasks_count, 0)}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Total Active Tasks</p>
        </div>
        <div className="stat-card">
          <p className="text-2xl font-bold text-[var(--text-primary)]">
            {workloads.reduce((sum, w) => sum + w.accumulated_points, 0).toFixed(1)}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Total Points</p>
        </div>
        <div className="stat-card">
          <p className="text-2xl font-bold" style={{ color: workloads.some(w => w.occupancy_rate > 100) ? 'var(--accent-red)' : 'var(--accent-emerald)' }}>
            {workloads.filter(w => w.occupancy_rate > 100).length}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Overcapacity</p>
        </div>
      </div>

      {/* Designer Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {workloads.map(w => {
          const occupancy = w.daily_capacity > 0 ? (w.accumulated_points / (w.daily_capacity * 20)) * 100 : 0;
          const isOver = occupancy > 100;
          const isWarning = occupancy > 80 && !isOver;

          return (
            <div key={w.designer_id} className="card-static overflow-hidden">
              {/* Header */}
              <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-primary)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold text-[var(--text-primary)]"
                    style={{ background: 'var(--gradient-1)' }}>
                    {w.designer_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-[var(--text-primary)]">{w.designer_name}</h3>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {w.daily_capacity} pts/day • {w.active_tasks_count} active tasks
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-xl font-bold ${isOver ? 'text-[var(--accent-red)]' : isWarning ? 'text-[var(--accent-amber)]' : 'text-[var(--accent-emerald)]'}`}>
                    {occupancy.toFixed(0)}%
                  </p>
                  <div className="flex items-center gap-1">
                    {isOver ? <AlertTriangle className="w-3 h-3 text-[var(--accent-red)]" /> :
                     isWarning ? <Clock className="w-3 h-3 text-[var(--accent-amber)]" /> :
                     <CheckCircle2 className="w-3 h-3 text-[var(--accent-emerald)]" />}
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {isOver ? 'Overcapacity' : isWarning ? 'Near Limit' : 'Available'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Progress */}
              <div className="px-5 pt-4 pb-2">
                <div className="flex items-center justify-between mb-2 text-xs font-medium">
                  <span style={{ color: 'var(--text-secondary)' }}>Accumulated: <strong className="text-[var(--text-primary)]">{w.accumulated_points.toFixed(1)} pts</strong></span>
                  <span style={{ color: 'var(--text-secondary)' }}>Monthly Cap: <strong className="text-[var(--text-primary)]">{(w.daily_capacity * 20).toFixed(0)} pts</strong></span>
                </div>
                <div className="progress-bar h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-tertiary)' }}>
                  <div className="progress-fill h-full rounded-full transition-all duration-500" style={{
                    width: `${Math.min(occupancy, 100)}%`,
                    background: isOver ? 'linear-gradient(90deg, var(--accent-red), #ff6b6b)' :
                               isWarning ? 'linear-gradient(90deg, var(--accent-amber), #fbbf24)' :
                               'linear-gradient(90deg, var(--accent-emerald), var(--accent-cyan))',
                  }} />
                </div>
              </div>

              {/* Task List */}
              <div className="px-5 pb-5 pt-2">
                {w.tasks.length === 0 ? (
                  <div className="py-5 text-center rounded-xl border border-dashed" style={{ borderColor: 'var(--border-secondary)', background: 'var(--bg-tertiary)' }}>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>No active tasks</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {w.tasks.map(t => (
                      <div key={t.task_code} className="flex items-center justify-between p-3 rounded-xl border transition-colors hover:border-[var(--border-primary)]" style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border-secondary)' }}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-xs font-mono font-bold" style={{ color: 'var(--accent-blue)' }}>{t.task_code}</span>
                            {t.difficulty && (
                              <span className={`badge text-[10px] py-0.5 px-2 ${DIFFICULTY_COLORS[t.difficulty]}`}>{DIFFICULTY_LABELS[t.difficulty]}</span>
                            )}
                          </div>
                          <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{t.campaign_name}</p>
                        </div>
                        <div className="text-right ml-3 flex flex-col items-end gap-1.5">
                          <span className={`badge text-[10px] py-0.5 px-2 ${DESIGN_STATUS_COLORS[t.status]}`}>{DESIGN_STATUS_LABELS[t.status]}</span>
                          <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{t.points.toFixed(1)} pts</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
