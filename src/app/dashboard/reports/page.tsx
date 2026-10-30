'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { usePersistedState } from '@/lib/use-persistent-state';
import { getAllTasksWithRelations, getClients, getUsers, getMotionTasks } from '@/lib/supabase-store';
import { EXCELLENCE_COLORS, EXCELLENCE_LABELS, SOURCE_LABELS, PIPELINE_LABELS } from '@/lib/constants';
import { TaskWithRelations, MotionTask, OperationalExcellence, Client, User, PipelineType } from '@/lib/types';
import { getMonthName } from '@/lib/utils';
import { downloadCSV } from '@/lib/export';
import { determineTaskPipeline } from '@/lib/pipeline-router';
import {
  BarChart3, TrendingUp, Target, FileText, PieChart, Users, Calendar,
  Film, Download, CheckCircle2, AlertTriangle, Star, Check, X,
  Search, Layers, Compass, ShoppingBag, Eye, ExternalLink, ArrowRight,
  ShieldCheck, Zap, Info, Clock, RefreshCw, AlertCircle
} from 'lucide-react';

export type ReportPipelineTab = 'ALL' | 'GD_MOCKUP' | 'STRATEGIC' | 'GD_NON_MOCKUP' | 'MOTION';

export default function ReportsPage() {
  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [motionTasks, setMotionTasks] = useState<MotionTask[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterMonth, setFilterMonth] = usePersistedState<string>('cmos_reports_filter_month', 'all');
  const [filterYear, setFilterYear] = usePersistedState<string>('cmos_reports_filter_year', 'all');
  const [activeTab, setActiveTab] = usePersistedState<ReportPipelineTab>('cmos_reports_pipeline_tab', 'ALL');

  // Excellence, Good, Bad Inspector Filters
  const [inspectorFilter, setInspectorFilter] = useState<'ALL' | 'EXCELLENCE' | 'GOOD' | 'BAD'>('ALL');
  const [inspectorSearch, setInspectorSearch] = useState<string>('');

  const loadData = async () => {
    try {
      setLoading(true);
      const [t, m, c, u] = await Promise.all([
        getAllTasksWithRelations(),
        getMotionTasks(),
        getClients(),
        getUsers(),
      ]);
      setTasks(t);
      setMotionTasks(m);
      setClients(c);
      setUsers(u);
    } catch (err) {
      console.error('Failed to load reports data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const availableYears = Array.from(new Set([
    ...tasks.map(t => (t.req_date || t.created_at || '').substring(0, 4)).filter(Boolean),
    ...motionTasks.map(m => (m.created_at || '').substring(0, 4)).filter(Boolean),
    String(new Date().getFullYear())
  ])).sort().reverse();

  // Helper: check if a task is postponed or cancelled
  const isTaskPostponedOrCancelled = (t: TaskWithRelations): boolean => {
    const status = String(t.status_design || '').toUpperCase();
    const stratStatus = String(t.status_strat || '').toUpperCase();
    return (
      status === 'DESIGN_POSTPONE' ||
      status === 'DESIGN_CANCEL' ||
      status === 'POSTPONE' ||
      status === 'CANCEL' ||
      stratStatus === 'POSTPONE' ||
      stratStatus === 'CANCEL' ||
      Boolean((t as any).is_postponed) ||
      Boolean((t as any).is_cancelled)
    );
  };

  // Helper: check if task is completed / done
  const isTaskDone = (t: TaskWithRelations): boolean => {
    if (isTaskPostponedOrCancelled(t)) return false;
    const status = String(t.status_design || '').toUpperCase();
    const stratStatus = String(t.status_strat || '').toUpperCase();
    return (
      status === 'DESIGN_APPROVED' ||
      status === 'TASK_CLOSED' ||
      status === 'APPROVED' ||
      status === 'COMPLETED' ||
      stratStatus === 'APPROVED' ||
      Boolean(t.operational_excellence)
    );
  };

  // Helper: check if task is in progress
  const isTaskInProgress = (t: TaskWithRelations): boolean => {
    if (isTaskPostponedOrCancelled(t) || isTaskDone(t)) return false;
    return true;
  };

  // Helper: Motion task status categories
  const isMotionPostponedOrCancelled = (m: MotionTask): boolean => {
    const status = String(m.status_motion || '').toUpperCase();
    return status === 'CANCEL' || status === 'POSTPONE' || Boolean((m as any).is_postponed) || Boolean((m as any).is_cancelled);
  };

  const isMotionDone = (m: MotionTask): boolean => {
    if (isMotionPostponedOrCancelled(m)) return false;
    return ['APPROVED', 'COMPLETED'].includes(m.status_motion);
  };

  const isMotionInProgress = (m: MotionTask): boolean => {
    if (isMotionPostponedOrCancelled(m) || isMotionDone(m)) return false;
    return ['QUEUED', 'IN_PROGRESS', 'SUBMITTED', 'REVISION'].includes(m.status_motion);
  };

  // Helper: output quantity for a task (defaults to req_qty or 1)
  const getTaskOutputQty = (t: TaskWithRelations): number => {
    return Number(t.output_qty) || Number(t.req_qty) || 1;
  };

  // Filter tasks based on global Month and Year filter
  const dateFilteredTasks = useMemo(() => {
    return tasks.filter(t => {
      const dStr = t.req_date || t.created_at || '';
      if (!dStr) return true;
      const yearStr = dStr.substring(0, 4);
      const monthStr = dStr.substring(5, 7);
      if (filterYear !== 'all' && yearStr !== filterYear) return false;
      if (filterMonth !== 'all' && monthStr !== filterMonth) return false;
      return true;
    });
  }, [tasks, filterYear, filterMonth]);

  const dateFilteredMotionTasks = useMemo(() => {
    return motionTasks.filter(mt => {
      const dStr = mt.created_at || '';
      if (!dStr) return true;
      const yearStr = dStr.substring(0, 4);
      const monthStr = dStr.substring(5, 7);
      if (filterYear !== 'all' && yearStr !== filterYear) return false;
      if (filterMonth !== 'all' && monthStr !== filterMonth) return false;
      return true;
    });
  }, [motionTasks, filterYear, filterMonth]);

  // Filter tasks based on active pipeline tab
  const pipelineFilteredTasks = useMemo(() => {
    if (activeTab === 'ALL') return dateFilteredTasks;
    if (activeTab === 'MOTION') return [];
    return dateFilteredTasks.filter(t => determineTaskPipeline(t) === activeTab);
  }, [dateFilteredTasks, activeTab]);

  // Output stats
  const totalTasksCount = pipelineFilteredTasks.length;
  const totalOutputAssetsCount = pipelineFilteredTasks.reduce((sum, t) => sum + getTaskOutputQty(t), 0);
  const avgOutputRatio = totalTasksCount > 0 ? (totalOutputAssetsCount / totalTasksCount).toFixed(1) : '1.0';

  // Completed Tasks for SLA & Quality
  const completedTasks = useMemo(() => {
    return pipelineFilteredTasks.filter(isTaskDone);
  }, [pipelineFilteredTasks]);

  const completedOutputAssetsCount = completedTasks.reduce((sum, t) => sum + getTaskOutputQty(t), 0);

  // Motion stats
  const completedMotionTasks = useMemo(() => {
    return dateFilteredMotionTasks.filter(isMotionDone);
  }, [dateFilteredMotionTasks]);

  // Operational Excellence Resolution
  const resolveExcellence = (t: TaskWithRelations): OperationalExcellence => {
    if (t.operational_excellence) return t.operational_excellence;
    const revisions = t.design_revision_count || t.strat_revision_count || 0;
    const sla = t.sla_working_days ?? 3;
    if (revisions === 0 && sla <= 2) return 'EXCELLENCE';
    if (revisions <= 2 && sla <= 4) return 'GOOD';
    return 'BAD';
  };

  const tasksWithExcellence = useMemo(() => {
    return completedTasks.map(t => ({
      ...t,
      resolved_excellence: resolveExcellence(t)
    }));
  }, [completedTasks]);

  const totalExcellence = tasksWithExcellence.filter(t => t.resolved_excellence === 'EXCELLENCE').length;
  const totalGood = tasksWithExcellence.filter(t => t.resolved_excellence === 'GOOD').length;
  const totalBad = tasksWithExcellence.filter(t => t.resolved_excellence === 'BAD').length;

  // Workload Tracking by PIC: Graphic Design (Done, In Progress, Postpone/Cancel)
  const allPics = useMemo(() => {
    return users.filter(u => ['DESIGNER', 'TEAM_LEAD', 'STRATEGIC_PIC', 'MOTION_PIC'].includes(u.role_name));
  }, [users]);

  const workloadByPic = useMemo(() => {
    return allPics.map(pic => {
      // Filter tasks assigned to this PIC within the current pipeline view and date filter
      const userTasks = (activeTab === 'ALL' ? dateFilteredTasks : pipelineFilteredTasks).filter(t => {
        if (pic.role_name === 'STRATEGIC_PIC') {
          return t.strat_pic_id === pic.id || (t.strat_pic_ids && t.strat_pic_ids.includes(pic.id));
        }
        return t.design_pic_id === pic.id;
      });

      const userMotionTasks = dateFilteredMotionTasks.filter(m => m.motion_pic_id === pic.id);

      // Group into Done, In Progress, Postpone / Cancel
      const gdDoneTasks = userTasks.filter(isTaskDone);
      const gdInProgressTasks = userTasks.filter(isTaskInProgress);
      const gdPostponeCancelTasks = userTasks.filter(isTaskPostponedOrCancelled);

      const moDoneTasks = userMotionTasks.filter(isMotionDone);
      const moInProgressTasks = userMotionTasks.filter(isMotionInProgress);
      const moPostponeCancelTasks = userMotionTasks.filter(isMotionPostponedOrCancelled);

      return {
        id: pic.id,
        name: pic.full_name,
        role: pic.role_name,
        totalTasks: userTasks.length + (activeTab === 'ALL' || activeTab === 'MOTION' ? userMotionTasks.length : 0),
        totalOutputs: userTasks.reduce((s, t) => s + getTaskOutputQty(t), 0) + (activeTab === 'ALL' || activeTab === 'MOTION' ? userMotionTasks.length : 0),
        graphic: {
          totalTasks: userTasks.length,
          totalOutputs: userTasks.reduce((s, t) => s + getTaskOutputQty(t), 0),
          doneTasks: gdDoneTasks.length,
          doneOutputs: gdDoneTasks.reduce((s, t) => s + getTaskOutputQty(t), 0),
          inProgressTasks: gdInProgressTasks.length,
          inProgressOutputs: gdInProgressTasks.reduce((s, t) => s + getTaskOutputQty(t), 0),
          postponeCancelTasks: gdPostponeCancelTasks.length,
          postponeCancelOutputs: gdPostponeCancelTasks.reduce((s, t) => s + getTaskOutputQty(t), 0),
        },
        motion: {
          totalTasks: userMotionTasks.length,
          doneTasks: moDoneTasks.length,
          inProgressTasks: moInProgressTasks.length,
          postponeCancelTasks: moPostponeCancelTasks.length,
        }
      };
    }).filter(p => {
      if (activeTab === 'MOTION') return p.motion.totalTasks > 0 || p.role.includes('MOTION');
      return p.graphic.totalTasks > 0 || p.role.includes('DESIGNER') || p.role.includes('STRATEGIC');
    }).sort((a, b) => b.totalTasks - a.totalTasks);
  }, [allPics, activeTab, dateFilteredTasks, pipelineFilteredTasks, dateFilteredMotionTasks]);

  // Excellence, Good, Bad Inspector Filtered List
  const inspectorTasks = useMemo(() => {
    let list = tasksWithExcellence;

    if (inspectorFilter !== 'ALL') {
      list = list.filter(t => t.resolved_excellence === inspectorFilter);
    }

    if (inspectorSearch.trim()) {
      const q = inspectorSearch.toLowerCase().trim();
      list = list.filter(t =>
        (t.task_code || '').toLowerCase().includes(q) ||
        (t.campaign_name || '').toLowerCase().includes(q) ||
        (t.client_name || '').toLowerCase().includes(q) ||
        (t.design_pic_name || '').toLowerCase().includes(q) ||
        (t.strat_pic_name || '').toLowerCase().includes(q) ||
        (t.notes || '').toLowerCase().includes(q)
      );
    }

    return list.sort((a, b) => new Date(b.approved_at || b.updated_at || b.created_at).getTime() - new Date(a.approved_at || a.updated_at || a.created_at).getTime());
  }, [tasksWithExcellence, inspectorFilter, inspectorSearch]);

  // SLA by Brand
  const byBrand = useMemo(() => {
    return clients.map(c => {
      const brandTasks = completedTasks.filter(t => t.client_id === c.id);
      const totalOutputs = brandTasks.reduce((s, t) => s + getTaskOutputQty(t), 0);
      const bExcellence = brandTasks.filter(t => resolveExcellence(t) === 'EXCELLENCE').length;
      const bGood = brandTasks.filter(t => resolveExcellence(t) === 'GOOD').length;
      const bBad = brandTasks.filter(t => resolveExcellence(t) === 'BAD').length;
      return {
        brand: c.name,
        totalTasks: brandTasks.length,
        totalOutputs,
        excellence: bExcellence,
        good: bGood,
        bad: bBad,
        rate: brandTasks.length > 0 ? ((bExcellence / brandTasks.length) * 100).toFixed(0) : '0'
      };
    }).filter(b => b.totalTasks > 0).sort((a, b) => b.totalTasks - a.totalTasks);
  }, [clients, completedTasks]);

  // SLA by Month
  const byMonth = useMemo(() => {
    const acc: Record<string, { totalTasks: number; totalOutputs: number; excellence: number; good: number; bad: number }> = {};
    completedTasks.forEach(t => {
      const dStr = t.req_date || t.created_at || '';
      if (!dStr) return;
      const key = dStr.substring(0, 7);
      if (!acc[key]) acc[key] = { totalTasks: 0, totalOutputs: 0, excellence: 0, good: 0, bad: 0 };
      acc[key].totalTasks++;
      acc[key].totalOutputs += getTaskOutputQty(t);
      const ex = resolveExcellence(t);
      if (ex === 'EXCELLENCE') acc[key].excellence++;
      if (ex === 'GOOD') acc[key].good++;
      if (ex === 'BAD') acc[key].bad++;
    });
    return Object.entries(acc).sort((a, b) => a[0].localeCompare(b[0]));
  }, [completedTasks]);

  // Designer Performance
  const designers = useMemo(() => {
    return users.filter(u => ['DESIGNER', 'TEAM_LEAD'].includes(u.role_name));
  }, [users]);

  const byDesigner = useMemo(() => {
    return designers.map(d => {
      const dTasks = completedTasks.filter(t => t.design_pic_id === d.id);
      const dOutputs = dTasks.reduce((s, t) => s + getTaskOutputQty(t), 0);
      const dExcellence = dTasks.filter(t => resolveExcellence(t) === 'EXCELLENCE').length;
      return {
        name: d.full_name,
        totalTasks: dTasks.length,
        totalOutputs: dOutputs,
        excellence: dExcellence,
        avg_sla: dTasks.length > 0 ? dTasks.reduce((sum, t) => sum + (t.sla_working_days || 0), 0) / dTasks.length : 0,
        revisions: dTasks.reduce((sum, t) => sum + (t.design_revision_count || 0), 0),
        rate: dTasks.length > 0 ? ((dExcellence / dTasks.length) * 100).toFixed(0) : '0'
      };
    }).filter(d => d.totalTasks > 0).sort((a, b) => b.totalTasks - a.totalTasks);
  }, [designers, completedTasks]);

  // Source Distribution
  const bySource = useMemo(() => {
    return {
      ORCA: completedTasks.filter(t => t.task_source === 'ORCA').length,
      ECOMMERCE: completedTasks.filter(t => t.task_source === 'ECOMMERCE').length,
    };
  }, [completedTasks]);

  const getPeriodLabel = () => {
    if (filterMonth === 'all' && filterYear === 'all') return 'All Time';
    if (filterMonth === 'all') return `Year ${filterYear}`;
    if (filterYear === 'all') return `${getMonthName(Number(filterMonth))} (All Years)`;
    return `${getMonthName(Number(filterMonth))} ${filterYear}`;
  };

  const exportWorkloadCSV = () => {
    if (activeTab === 'MOTION') {
      const data = workloadByPic.map(p => ({
        'PIC Name': p.name,
        'Role': p.role,
        'Period': getPeriodLabel(),
        'Total Motion Tasks': p.motion.totalTasks,
        'Done': p.motion.doneTasks,
        'In Progress': p.motion.inProgressTasks,
        'Postpone / Cancel': p.motion.postponeCancelTasks,
      }));
      downloadCSV(data, `Workload_Motion_${filterYear}_${filterMonth}.csv`);
    } else {
      const data = workloadByPic.map(p => ({
        'PIC Name': p.name,
        'Role': p.role,
        'Pipeline': activeTab === 'ALL' ? 'All Pipelines' : PIPELINE_LABELS[activeTab as PipelineType],
        'Period': getPeriodLabel(),
        'Total Tasks': p.graphic.totalTasks,
        'Total Output Assets': p.graphic.totalOutputs,
        'Done (Tasks)': p.graphic.doneTasks,
        'Done (Outputs)': p.graphic.doneOutputs,
        'In Progress (Tasks)': p.graphic.inProgressTasks,
        'In Progress (Outputs)': p.graphic.inProgressOutputs,
        'Postpone / Cancel (Tasks)': p.graphic.postponeCancelTasks,
        'Postpone / Cancel (Outputs)': p.graphic.postponeCancelOutputs,
      }));
      downloadCSV(data, `Workload_${activeTab}_${filterYear}_${filterMonth}.csv`);
    }
  };

  const exportInspectorCSV = () => {
    const data = inspectorTasks.map(t => ({
      'Task Code': t.task_code,
      'Brand': t.client_name || '-',
      'Campaign': t.campaign_name || '-',
      'Pipeline': determineTaskPipeline(t),
      'Task Count': 1,
      'Output Assets': getTaskOutputQty(t),
      'Designer': t.design_pic_name || t.strat_pic_name || '-',
      'Evaluation': t.resolved_excellence,
      'SLA Working Days': t.sla_working_days ?? '-',
      'Revisions': t.design_revision_count || t.strat_revision_count || 0,
      'Approved Date': t.approved_at ? new Date(t.approved_at).toLocaleDateString() : '-',
      'Notes': t.notes || '-'
    }));
    downloadCSV(data, `Request_Quality_Inspector_${activeTab}_${filterYear}_${filterMonth}.csv`);
  };

  return (
    <div className="space-y-5">
      {/* Page Header with Global Filter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[var(--border-secondary)]">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2.5">
            <BarChart3 className="w-5 h-5 text-cyan-400" />
            <span>Reports & Analytics Dashboard</span>
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Performance analytics, task vs output visibility, workload tracking, dan audit kualitas SLA • Periode: <strong className="text-[var(--text-primary)]">{getPeriodLabel()}</strong>
          </p>
        </div>

        {/* Global Month & Year Filter Bar & Quick Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/dashboard/reports/issues"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 transition-all shadow-xs"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Reporting Kendala</span>
          </Link>

          <div className="flex items-center gap-2 bg-[var(--bg-card)] p-1.5 rounded-lg border border-[var(--border-primary)] shadow-sm">
            <Calendar className="w-3.5 h-3.5 text-[var(--accent-blue)] shrink-0 ml-1" />
            
            <select 
              className="select border-none bg-transparent py-1 text-xs focus:ring-0 min-w-[110px] cursor-pointer" 
              value={filterMonth} 
              onChange={(e) => setFilterMonth(e.target.value)}
            >
              <option value="all">All Months</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={String(m).padStart(2, '0')}>{getMonthName(m)}</option>
              ))}
            </select>

            <div className="w-px h-3.5 bg-[var(--border-primary)]"></div>

            <select 
              className="select border-none bg-transparent py-1 text-xs focus:ring-0 min-w-[90px] cursor-pointer" 
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
      </div>

      {/* 1. SEPARATED DASHBOARDS: Pipeline Navigation Selector */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-[var(--border-primary)]">
        <button
          onClick={() => setActiveTab('ALL')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-all ${
            activeTab === 'ALL'
              ? 'bg-[var(--accent-blue)] text-white border-transparent shadow-xs'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>All Pipelines Overview</span>
        </button>

        <button
          onClick={() => setActiveTab('GD_MOCKUP')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-all ${
            activeTab === 'GD_MOCKUP'
              ? 'bg-blue-600 text-white border-transparent shadow-xs'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-blue-400" />
          <span>Mockup Pipeline</span>
        </button>

        <button
          onClick={() => setActiveTab('STRATEGIC')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-all ${
            activeTab === 'STRATEGIC'
              ? 'bg-purple-600 text-white border-transparent shadow-xs'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
          }`}
        >
          <Compass className="w-3.5 h-3.5 text-purple-400" />
          <span>Strategic Pipeline</span>
        </button>

        <button
          onClick={() => setActiveTab('GD_NON_MOCKUP')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-all ${
            activeTab === 'GD_NON_MOCKUP'
              ? 'bg-emerald-600 text-white border-transparent shadow-xs'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5 text-emerald-400" />
          <span>E-Commerce Pipeline</span>
        </button>

        <button
          onClick={() => setActiveTab('MOTION')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-all ${
            activeTab === 'MOTION'
              ? 'bg-pink-600 text-white border-transparent shadow-xs'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
          }`}
        >
          <Film className="w-3.5 h-3.5 text-pink-400" />
          <span>Motion Graphics Pipeline</span>
        </button>
      </div>

      {/* Special Banner for E-Commerce Pipeline Multi-Output characteristic (Item 5) */}
      {activeTab === 'GD_NON_MOCKUP' && (
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs">
          <Info className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
          <div>
            <strong className="font-semibold block text-emerald-200">Karakteristik E-Commerce Pipeline (Multi-Output Ratio):</strong>
            <span>
              Pada pipeline E-Commerce, <strong>1 Task request umumnya menghasilkan banyak varian output aset visual</strong> (seperti Banner Toko, Feed PDP 1:1, Story Promo 9:16, Banner Marketplace, & Flash Sale Card). Rata-rata rasio saat ini adalah <strong>{avgOutputRatio} output per request</strong>.
            </span>
          </div>
        </div>
      )}

      {/* 4 & 5. SUMMARY METRIC CARDS (Visibility Task vs Output) */}
      {activeTab !== 'MOTION' && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {/* Total Tasks */}
          <div className="stat-card p-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-medium text-[var(--text-secondary)]">Total Tasks</span>
              <FileText className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            </div>
            <p className="text-2xl font-bold text-[var(--text-primary)]">{totalTasksCount}</p>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Tasks ({getPeriodLabel()})</p>
          </div>

          {/* Total Outputs */}
          <div className="stat-card p-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-medium text-[var(--text-secondary)]">Total Outputs</span>
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <p className="text-2xl font-bold text-cyan-400">{totalOutputAssetsCount}</p>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Assets Diproduksi</p>
          </div>

          {/* E-Commerce Output Multiplier Ratio */}
          <div className="stat-card p-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-medium text-[var(--text-secondary)]">Output / Task</span>
              <Zap className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <p className="text-2xl font-bold text-amber-400">{avgOutputRatio}x</p>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Rasio Multi-Output</p>
          </div>

          {/* Excellence */}
          <div className="stat-card p-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-medium text-[var(--text-secondary)]">Excellence</span>
              <Star className="w-3.5 h-3.5 text-[var(--accent-emerald)]" />
            </div>
            <p className="text-2xl font-bold text-[var(--accent-emerald)]">{totalExcellence}</p>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">SLA Cepat & Akurat</p>
          </div>

          {/* Good */}
          <div className="stat-card p-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-medium text-[var(--text-secondary)]">Good</span>
              <Check className="w-3.5 h-3.5 text-[var(--accent-blue)]" />
            </div>
            <p className="text-2xl font-bold text-[var(--accent-blue)]">{totalGood}</p>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Sesuai SLA Target</p>
          </div>

          {/* Bad */}
          <div className="stat-card p-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-medium text-[var(--text-secondary)]">Bad</span>
              <AlertCircle className="w-3.5 h-3.5 text-[var(--accent-red)]" />
            </div>
            <p className="text-2xl font-bold text-[var(--accent-red)]">{totalBad}</p>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Overdue / Revisi &gt;2</p>
          </div>
        </div>
      )}

      {/* Summary Cards for Motion */}
      {activeTab === 'MOTION' && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="stat-card p-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)]">
            <p className="text-xl font-bold text-[var(--text-primary)]">{dateFilteredMotionTasks.length}</p>
            <p className="text-[11px] text-[var(--text-muted)]">Total Tasks ({getPeriodLabel()})</p>
          </div>
          <div className="stat-card p-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)]">
            <p className="text-xl font-bold text-[var(--accent-emerald)]">{completedMotionTasks.length}</p>
            <p className="text-[11px] text-[var(--text-muted)]">Completed</p>
          </div>
          <div className="stat-card p-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)]">
            <p className="text-xl font-bold text-amber-400">{dateFilteredMotionTasks.filter(m => m.status_motion === 'QUEUED').length}</p>
            <p className="text-[11px] text-[var(--text-muted)]">Queued</p>
          </div>
          <div className="stat-card p-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)]">
            <p className="text-xl font-bold text-[var(--accent-blue)]">{dateFilteredMotionTasks.filter(m => m.status_motion === 'IN_PROGRESS').length}</p>
            <p className="text-[11px] text-[var(--text-muted)]">In Progress</p>
          </div>
          <div className="stat-card p-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)]">
            <p className="text-xl font-bold text-[var(--accent-red)]">{dateFilteredMotionTasks.filter(m => m.status_motion === 'REVISION').length}</p>
            <p className="text-[11px] text-[var(--text-muted)]">Revision</p>
          </div>
        </div>
      )}

      {/* 2. PIC WORKLOAD TRACKING TABLE (Done, In Progress, Postpone atau Cancel) */}
      <div className="card-static p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3.5">
          <div>
            <h3 className="font-semibold text-sm text-[var(--text-primary)] flex items-center gap-2">
              <Users className="w-4 h-4 text-[var(--accent-blue)]" />
              <span>Designer &amp; Motion PIC Workload Tracking ({getPeriodLabel()})</span>
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Status pengelompokan pengerjaan terbagi menjadi: <strong>Done</strong>, <strong>In Progress</strong>, serta <strong>Postpone atau Cancel</strong>.
            </p>
          </div>

          <button
            onClick={exportWorkloadCSV}
            className="h-8 px-3 rounded-lg text-xs font-semibold btn-outline border-[var(--border-primary)] inline-flex items-center gap-1.5 hover:bg-[var(--bg-tertiary)] shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download CSV</span>
          </button>
        </div>

        <div className="table-container" style={{ border: 'none' }}>
          <table>
            <thead>
              <tr>
                <th className="min-w-[170px]">PIC Name</th>
                <th className="text-center w-28">Role</th>
                <th className="text-center w-28">Total Workload</th>
                <th className="text-center w-40">Done</th>
                <th className="text-center w-40">In Progress</th>
                <th className="text-center w-40">Postpone / Cancel</th>
              </tr>
            </thead>
            <tbody>
              {workloadByPic.map(p => {
                const isMotionOnly = activeTab === 'MOTION';
                const doneCount = isMotionOnly ? p.motion.doneTasks : p.graphic.doneTasks;
                const doneOutput = isMotionOnly ? p.motion.doneTasks : p.graphic.doneOutputs;
                const inProgressCount = isMotionOnly ? p.motion.inProgressTasks : p.graphic.inProgressTasks;
                const inProgressOutput = isMotionOnly ? p.motion.inProgressTasks : p.graphic.inProgressOutputs;
                const postponeCount = isMotionOnly ? p.motion.postponeCancelTasks : p.graphic.postponeCancelTasks;
                const postponeOutput = isMotionOnly ? p.motion.postponeCancelTasks : p.graphic.postponeCancelOutputs;

                return (
                  <tr key={p.id}>
                    <td className="font-medium text-[var(--text-primary)] text-xs">
                      {p.name}
                    </td>
                    <td className="text-center">
                      <span className="badge text-[10px] px-2 py-0.5" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                        {p.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="text-center">
                      <div className="font-bold text-xs text-[var(--text-primary)]">
                        {isMotionOnly ? p.motion.totalTasks : p.graphic.totalTasks} Tasks
                      </div>
                      {!isMotionOnly && (
                        <div className="text-[10px] text-[var(--text-muted)]">
                          {p.graphic.totalOutputs} Output Assets
                        </div>
                      )}
                    </td>

                    {/* Column 1: Done */}
                    <td className="text-center">
                      {doneCount > 0 ? (
                        <span className="inline-flex flex-col items-center justify-center px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          <span>{doneCount} Tasks Done</span>
                          {!isMotionOnly && <span className="text-[10px] font-normal opacity-85">({doneOutput} Output Assets)</span>}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">-</span>
                      )}
                    </td>

                    {/* Column 2: In Progress */}
                    <td className="text-center">
                      {inProgressCount > 0 ? (
                        <span className="inline-flex flex-col items-center justify-center px-2.5 py-1 rounded-md text-[11px] font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                          <span>{inProgressCount} In Progress</span>
                          {!isMotionOnly && <span className="text-[10px] font-normal opacity-85">({inProgressOutput} Output Assets)</span>}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">-</span>
                      )}
                    </td>

                    {/* Column 3: Postpone atau Cancel */}
                    <td className="text-center">
                      {postponeCount > 0 ? (
                        <span className="inline-flex flex-col items-center justify-center px-2.5 py-1 rounded-md text-[11px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                          <span>{postponeCount} Postpone / Cancel</span>
                          {!isMotionOnly && <span className="text-[10px] font-normal opacity-85">({postponeOutput} Output Assets)</span>}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {workloadByPic.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-xs text-[var(--text-muted)]">
                    Tidak ada task pengerjaan yang tercatat pada periode {getPeriodLabel()}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. EXCELLENCE, GOOD, BAD REQUEST INSPECTOR (Item 3) */}
      {activeTab !== 'MOTION' && (
        <div className="card-static p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-sm text-[var(--text-primary)] flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-400" />
                <span>Daftar Evaluasi Kualitas Request (Excellence, Good, Bad)</span>
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Audit riwayat seluruh request yang telah selesai untuk mengetahui request mana saja yang tergolong Excellence, Good, atau Bad.
              </p>
            </div>

            <button
              onClick={exportInspectorCSV}
              className="h-8 px-3 rounded-lg text-xs font-semibold btn-outline border-[var(--border-primary)] inline-flex items-center gap-1.5 hover:bg-[var(--bg-tertiary)] shrink-0 self-start sm:self-auto"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Daftar Evaluasi</span>
            </button>
          </div>

          {/* Filter Bar: Tabs & Search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2.5 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)]">
            {/* Filter Toggle Buttons */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setInspectorFilter('ALL')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  inspectorFilter === 'ALL'
                    ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-xs border border-[var(--border-primary)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Semua Selesai ({completedTasks.length})
              </button>

              <button
                type="button"
                onClick={() => setInspectorFilter('EXCELLENCE')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  inspectorFilter === 'EXCELLENCE'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-emerald-400'
                }`}
              >
                <Star className="w-3.5 h-3.5 text-emerald-400" />
                <span>Excellence ({totalExcellence})</span>
              </button>

              <button
                type="button"
                onClick={() => setInspectorFilter('GOOD')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  inspectorFilter === 'GOOD'
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40 shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-blue-400'
                }`}
              >
                <Check className="w-3.5 h-3.5 text-blue-400" />
                <span>Good ({totalGood})</span>
              </button>

              <button
                type="button"
                onClick={() => setInspectorFilter('BAD')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  inspectorFilter === 'BAD'
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-rose-400'
                }`}
              >
                <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                <span>Bad ({totalBad})</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative min-w-[220px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[var(--text-muted)] pointer-events-none" />
              <input
                type="text"
                value={inspectorSearch}
                onChange={(e) => setInspectorSearch(e.target.value)}
                placeholder="Cari task code, brand, PIC..."
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-[var(--bg-card)] border border-[var(--border-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-blue)]"
              />
            </div>
          </div>

          {/* Inspector Table */}
          <div className="table-container" style={{ border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th className="min-w-[130px]">Task Code</th>
                  <th className="min-w-[150px]">Brand &amp; Campaign</th>
                  <th className="text-center w-32">Pipeline</th>
                  <th className="text-center w-28">Task : Output</th>
                  <th className="min-w-[130px]">PIC Penanggung Jawab</th>
                  <th className="text-center w-32">SLA &amp; Revisions</th>
                  <th className="text-center w-36">Evaluasi Kualitas</th>
                  <th className="text-right w-24">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {inspectorTasks.slice(0, 25).map(t => {
                  const pipe = determineTaskPipeline(t);
                  const outQty = getTaskOutputQty(t);
                  const revisions = t.design_revision_count || t.strat_revision_count || 0;
                  const rating = t.resolved_excellence;

                  return (
                    <tr key={t.id} className="hover:bg-[var(--bg-secondary)]/50 transition-colors">
                      <td className="font-mono text-xs font-bold text-[var(--accent-blue)]">
                        <Link
                          href={`/dashboard/tasks?pipeline=${pipe}&taskId=${t.id}`}
                          className="hover:underline flex items-center gap-1"
                        >
                          {t.task_code}
                          <ExternalLink className="w-3 h-3 opacity-60" />
                        </Link>
                      </td>
                      <td>
                        <div className="font-semibold text-xs text-[var(--text-primary)]">
                          {t.client_name || 'Brand / Client'}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)] truncate max-w-[220px]">
                          {t.campaign_name || '-'}
                        </div>
                      </td>
                      <td className="text-center">
                        <span className={`badge text-[10px] px-2 py-0.5 ${
                          pipe === 'STRATEGIC' ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30' :
                          pipe === 'GD_NON_MOCKUP' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' :
                          'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                        }`}>
                          {PIPELINE_LABELS[pipe] || pipe}
                        </span>
                      </td>
                      <td className="text-center">
                        <div className="text-xs font-semibold text-[var(--text-primary)]">
                          1 Task
                        </div>
                        <div className="text-[11px] font-medium text-cyan-400">
                          {outQty} {outQty > 1 ? 'Outputs' : 'Output'}
                        </div>
                      </td>
                      <td>
                        <div className="text-xs font-medium text-[var(--text-primary)]">
                          {t.design_pic_name || t.strat_pic_name || 'Unassigned'}
                        </div>
                        <div className="text-[10px] text-[var(--text-muted)]">
                          Req: {t.created_by_name || 'Requester'}
                        </div>
                      </td>
                      <td className="text-center">
                        <div className="text-xs text-[var(--text-primary)]">
                          {t.sla_working_days != null ? `${t.sla_working_days} hari` : '-'}
                        </div>
                        <div className={`text-[10px] font-medium ${revisions > 2 ? 'text-rose-400' : 'text-[var(--text-muted)]'}`}>
                          {revisions} Revisi
                        </div>
                      </td>
                      <td className="text-center">
                        {rating === 'EXCELLENCE' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            <Star className="w-3 h-3 fill-emerald-400" />
                            <span>EXCELLENCE</span>
                          </span>
                        )}
                        {rating === 'GOOD' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                            <Check className="w-3 h-3" />
                            <span>GOOD</span>
                          </span>
                        )}
                        {rating === 'BAD' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                            <AlertCircle className="w-3 h-3" />
                            <span>BAD</span>
                          </span>
                        )}
                      </td>
                      <td className="text-right">
                        <Link
                          href={`/dashboard/tasks?pipeline=${pipe}&taskId=${t.id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-[var(--border-primary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] transition-colors"
                        >
                          <span>Lihat</span>
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}

                {inspectorTasks.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-6 text-xs text-[var(--text-muted)]">
                      Tidak ada request yang sesuai dengan filter evaluasi {inspectorFilter}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {inspectorTasks.length > 25 && (
            <p className="text-[11px] text-[var(--text-muted)] text-right">
              Menampilkan 25 dari total {inspectorTasks.length} request selesai. Gunakan tombol Export untuk melihat seluruh data.
            </p>
          )}
        </div>
      )}

      {/* SLA PERFORMANCE BREAKDOWNS (Month & Brand) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* SLA by Month */}
        {activeTab !== 'MOTION' && (
          <div className="card-static p-4">
            <h3 className="font-semibold text-sm text-[var(--text-primary)] mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-cyan-400" />
              <span>SLA Performance by Month</span>
            </h3>
            <div className="space-y-3">
              {byMonth.map(([month, data]) => {
                const [y, m] = month.split('-');
                return (
                  <div key={month}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-[var(--text-primary)]">{getMonthName(Number(m))} {y}</span>
                      <span className="text-xs text-[var(--text-muted)]">{data.totalTasks} tasks ({data.totalOutputs} outputs)</span>
                    </div>
                    <div className="flex h-6 rounded-md overflow-hidden bg-[var(--bg-tertiary)]">
                      {data.excellence > 0 && (
                        <div
                          className="h-full flex items-center justify-center text-[9px] font-bold text-[var(--text-primary)] bg-[var(--accent-emerald)]"
                          style={{ width: `${(data.excellence / data.totalTasks) * 100}%`, minWidth: 20 }}
                          title={`Excellence: ${data.excellence}`}
                        >
                          {data.excellence}
                        </div>
                      )}
                      {data.good > 0 && (
                        <div
                          className="h-full flex items-center justify-center text-[9px] font-bold text-[var(--text-primary)] bg-[var(--accent-blue)]"
                          style={{ width: `${(data.good / data.totalTasks) * 100}%`, minWidth: 20 }}
                          title={`Good: ${data.good}`}
                        >
                          {data.good}
                        </div>
                      )}
                      {data.bad > 0 && (
                        <div
                          className="h-full flex items-center justify-center text-[9px] font-bold text-[var(--text-primary)] bg-[var(--accent-red)]"
                          style={{ width: `${(data.bad / data.totalTasks) * 100}%`, minWidth: 20 }}
                          title={`Bad: ${data.bad}`}
                        >
                          {data.bad}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {byMonth.length === 0 && (
                <p className="text-sm text-[var(--text-muted)] text-center py-4">No completed tasks in this period</p>
              )}
            </div>
            <div className="flex gap-4 mt-4 pt-3 border-t border-[var(--border-primary)]">
              {(['EXCELLENCE', 'GOOD', 'BAD'] as OperationalExcellence[]).map(s => (
                <div key={s} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ background: s === 'EXCELLENCE' ? 'var(--accent-emerald)' : s === 'GOOD' ? 'var(--accent-blue)' : 'var(--accent-red)' }} />
                  <span className="text-xs text-[var(--text-secondary)]">{EXCELLENCE_LABELS[s]}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SLA by Brand */}
        {activeTab !== 'MOTION' && (
          <div className="card-static p-4">
            <h3 className="font-semibold text-sm text-[var(--text-primary)] mb-3 flex items-center gap-2">
              <Target className="w-4 h-4 text-purple-400" />
              <span>SLA Performance by Brand</span>
            </h3>
            <div className="table-container" style={{ border: 'none' }}>
              <table>
                <thead>
                  <tr>
                    <th>Brand</th>
                    <th className="text-center">Tasks</th>
                    <th className="text-center">Outputs</th>
                    <th className="text-center">Excellence</th>
                    <th className="text-center">Good</th>
                    <th className="text-center">Bad</th>
                    <th className="text-center">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {byBrand.map(b => (
                    <tr key={b.brand}>
                      <td className="font-medium text-[var(--text-primary)] text-xs">{b.brand}</td>
                      <td className="text-center text-xs text-[var(--text-secondary)]">{b.totalTasks}</td>
                      <td className="text-center text-xs text-cyan-400 font-medium">{b.totalOutputs}</td>
                      <td className="text-center text-xs text-[var(--accent-emerald)] font-semibold">{b.excellence}</td>
                      <td className="text-center text-xs text-[var(--accent-blue)]">{b.good}</td>
                      <td className="text-center text-xs text-[var(--accent-red)]">{b.bad}</td>
                      <td className="text-center">
                        <span className={`badge text-[10px] ${Number(b.rate) >= 80 ? 'badge-success' : Number(b.rate) >= 50 ? 'badge-info' : 'badge-error'}`}>
                          {b.rate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                  {byBrand.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-4 text-xs text-[var(--text-muted)]">No data for this period</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Designer Performance */}
        {activeTab !== 'MOTION' && (
          <div className="card-static p-4">
            <h3 className="font-semibold text-sm text-[var(--text-primary)] mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-400" />
              <span>Designer Performance &amp; Output Capacity</span>
            </h3>
            <div className="table-container" style={{ border: 'none' }}>
              <table>
                <thead>
                  <tr>
                    <th>Designer</th>
                    <th className="text-center">Tasks</th>
                    <th className="text-center">Outputs</th>
                    <th className="text-center">Avg SLA</th>
                    <th className="text-center">Revisions</th>
                    <th className="text-center">Excellence</th>
                  </tr>
                </thead>
                <tbody>
                  {byDesigner.map(d => (
                    <tr key={d.name}>
                      <td className="font-medium text-[var(--text-primary)] text-xs">{d.name}</td>
                      <td className="text-center text-xs text-[var(--text-secondary)]">{d.totalTasks}</td>
                      <td className="text-center text-xs text-cyan-400 font-semibold">{d.totalOutputs}</td>
                      <td className="text-center text-xs" style={{ color: d.avg_sla <= 3 ? 'var(--accent-emerald)' : d.avg_sla <= 4 ? 'var(--accent-blue)' : 'var(--accent-red)' }}>
                        {d.avg_sla.toFixed(1)}d
                      </td>
                      <td className="text-center text-xs" style={{ color: d.revisions > 5 ? 'var(--accent-amber)' : 'var(--text-secondary)' }}>
                        {d.revisions}
                      </td>
                      <td className="text-center">
                        <span className={`badge text-[10px] ${Number(d.rate) >= 70 ? 'badge-success' : 'badge-warning'}`}>
                          {d.rate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                  {byDesigner.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-4 text-xs text-[var(--text-muted)]">No designer data for this period</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Source Distribution */}
        {activeTab !== 'MOTION' && (
          <div className="card-static p-4">
            <h3 className="font-semibold text-sm text-[var(--text-primary)] mb-3 flex items-center gap-2">
              <PieChart className="w-4 h-4 text-pink-400" />
              <span>Task Source Distribution (ORCA vs E-COMMERCE)</span>
            </h3>
            <div className="flex items-center justify-center gap-10 py-6">
              {Object.entries(bySource).map(([source, count]) => {
                const pct = completedTasks.length > 0 ? ((count / completedTasks.length) * 100).toFixed(0) : '0';
                return (
                  <div key={source} className="text-center">
                    <div className="relative w-24 h-24 mb-2 mx-auto">
                      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="40" fill="none" strokeWidth="10" stroke="var(--bg-tertiary)" />
                        <circle cx="50" cy="50" r="40" fill="none" strokeWidth="10"
                          stroke={source === 'ORCA' ? 'var(--accent-blue)' : 'var(--accent-pink)'}
                          strokeDasharray={`${Number(pct) * 2.51} 251`}
                          strokeLinecap="round" />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-lg font-bold text-[var(--text-primary)]">{pct}%</span>
                      </div>
                    </div>
                    <p className="font-semibold text-[var(--text-primary)] text-xs">{SOURCE_LABELS[source as 'ORCA' | 'ECOMMERCE']}</p>
                    <p className="text-[11px] text-[var(--text-muted)]">{count} tasks</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
