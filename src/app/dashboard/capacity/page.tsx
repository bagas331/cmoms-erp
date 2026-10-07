'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  getAllTasksWithRelations, getUsers, getClients, getContentTypes, getHolidays,
  updateUserCapacity 
} from '@/lib/supabase-store';
import { useAuth } from '@/lib/auth';
import {
  GlobalAnalyticsFilter,
  filterTasksByGlobalFilter,
  calculateTeamOccupancy,
  calculateRequestVsOutput,
  calculateSLAPerformance,
  calculateBrandDistribution,
  calculateOperationalSummary,
  OccupancyItem,
  RequestVsOutputItem,
  SLAPerformanceReport,
  BrandDistributionPivot,
  OperationalSummaryKPIs
} from '@/lib/analytics-engine';
import { 
  TaskWithRelations, User, Client, ContentType, Holiday, 
  DesignDifficulty, TaskSource, DesignStatus, OperationalExcellence 
} from '@/lib/types';
import { 
  DIFFICULTY_COLORS, DIFFICULTY_LABELS, DESIGN_STATUS_COLORS, DESIGN_STATUS_LABELS,
  EXCELLENCE_COLORS, EXCELLENCE_LABELS, SOURCE_LABELS, DIFFICULTY_WEIGHTS
} from '@/lib/constants';
import { formatDisplayDate, getMonthName } from '@/lib/utils';
import { downloadCSV } from '@/lib/export';
import {
  Users, BarChart3, TrendingUp, Target, Layers, Building2, FileType,
  Clock, Calendar, Filter, Download, Search, CheckCircle2, AlertTriangle,
  X, Settings, Edit3, Sparkles, PieChart, RefreshCcw, ChevronRight,
  ExternalLink, ChevronDown, Award, HelpCircle, Flame, ArrowRight,
  ShieldCheck, Sliders, Check
} from 'lucide-react';

type AnalyticsTab = 'OVERVIEW' | 'OCCUPANCY' | 'REQ_OUTPUT' | 'SLA' | 'DISTRIBUTION';

export default function CapacityPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Active Tab
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('OVERVIEW');

  // Global Filter State
  const [filter, setFilter] = useState<GlobalAnalyticsFilter>({
    month: 'all',
    year: 'all',
    clientId: 'all',
    picId: 'all',
    taskSource: 'all',
    contentTypeId: 'all',
    difficulty: 'all',
    operationalExcellence: 'all',
    status: 'all'
  });

  // Filter applied state (for Apply / Reset)
  const [appliedFilter, setAppliedFilter] = useState<GlobalAnalyticsFilter>({ ...filter });

  // Modals
  const [drillDownData, setDrillDownData] = useState<{
    title: string;
    subtitle?: string;
    tasks: TaskWithRelations[];
  } | null>(null);

  const [showCapacityModal, setShowCapacityModal] = useState(false);
  const [selectedUserForCap, setSelectedUserForCap] = useState<User | null>(null);
  const [inputDailyCap, setInputDailyCap] = useState<number>(7);
  const [isSavingCap, setIsSavingCap] = useState(false);

  // Load raw data
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [tData, uData, cData, ctData, hData] = await Promise.all([
        getAllTasksWithRelations(),
        getUsers(),
        getClients(),
        getContentTypes(),
        getHolidays()
      ]);
      setTasks(tData);
      setUsers(uData);
      setClients(cData);
      setContentTypes(ctData);
      setHolidays(hData);
    } catch (err) {
      console.error('Failed to load operational analytics data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Extract available years from task data
  const availableYears = useMemo(() => {
    const years = new Set(tasks.map(t => (t.req_date || t.created_at || '').substring(0, 4)).filter(Boolean));
    years.add(String(new Date().getFullYear()));
    return Array.from(years).sort().reverse();
  }, [tasks]);

  // Handle Filter Application
  const handleApplyFilter = () => {
    setAppliedFilter({ ...filter });
  };

  const handleResetFilter = () => {
    const reset = {
      month: 'all',
      year: 'all',
      clientId: 'all',
      picId: 'all',
      taskSource: 'all',
      contentTypeId: 'all',
      difficulty: 'all',
      operationalExcellence: 'all',
      status: 'all'
    };
    setFilter(reset);
    setAppliedFilter(reset);
  };

  // Filtered dataset
  const filteredTasks = useMemo(() => {
    return filterTasksByGlobalFilter(tasks, appliedFilter);
  }, [tasks, appliedFilter]);

  // Calculation Results
  const periodLabel = useMemo(() => {
    if (appliedFilter.month === 'all' && appliedFilter.year === 'all') return 'All Time';
    if (appliedFilter.month === 'all') return `Year ${appliedFilter.year}`;
    if (appliedFilter.year === 'all') return `${getMonthName(Number(appliedFilter.month))} (All Years)`;
    return `${getMonthName(Number(appliedFilter.month))} ${appliedFilter.year}`;
  }, [appliedFilter]);

  const occupancyResults = useMemo(() => {
    return calculateTeamOccupancy(filteredTasks, users, periodLabel);
  }, [filteredTasks, users, periodLabel]);

  const reqVsOutputResults = useMemo(() => {
    return calculateRequestVsOutput(filteredTasks, contentTypes);
  }, [filteredTasks, contentTypes]);

  const slaResults = useMemo(() => {
    return calculateSLAPerformance(filteredTasks, users, holidays);
  }, [filteredTasks, users, holidays]);

  const brandDistributionResults = useMemo(() => {
    return calculateBrandDistribution(filteredTasks, clients, contentTypes);
  }, [filteredTasks, clients, contentTypes]);

  const summaryKPIs = useMemo(() => {
    return calculateOperationalSummary(filteredTasks, users, holidays);
  }, [filteredTasks, users, holidays]);

  // Capacity Edit Handler
  const handleSaveCapacity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForCap) return;
    setIsSavingCap(true);
    try {
      await updateUserCapacity(selectedUserForCap.id, inputDailyCap);
      await loadData();
      setShowCapacityModal(false);
      setSelectedUserForCap(null);
    } catch (err: any) {
      alert(`Gagal mengupdate kapasitas: ${err.message || err}`);
    } finally {
      setIsSavingCap(false);
    }
  };

  // Export Active Tab Data
  const handleExportTab = () => {
    if (activeTab === 'OCCUPANCY') {
      const exportData = occupancyResults.map(o => ({
        'PIC': o.pic_name,
        'Role': o.role_name,
        'Period': o.month_label,
        'High Task (4.5 pts)': o.high_count,
        'Medium Task (3.5 pts)': o.medium_count,
        'Low Task (2.5 pts)': o.low_count,
        'Total Tasks': o.total_tasks,
        'Total Points': o.total_points,
        'Daily Capacity': o.daily_capacity,
        'Monthly Capacity (20 Days)': o.max_capacity,
        'Occupancy (%)': `${o.occupancy_rate}%`,
        'Occupancy Status': o.occupancy_status
      }));
      downloadCSV(exportData, `Team_Occupancy_Report_${appliedFilter.year}_${appliedFilter.month}.csv`);
    } else if (activeTab === 'REQ_OUTPUT') {
      const exportData = reqVsOutputResults.items.map(i => ({
        'Content Type': i.content_type_name,
        'Task Source': i.task_source,
        'Request Qty': i.req_qty,
        'Output Qty': i.output_qty,
        'Achievement (%)': `${i.achievement_rate}%`,
        'Request Gap': i.request_gap,
        'Task Count': i.task_count
      }));
      downloadCSV(exportData, `Request_vs_Output_Report_${appliedFilter.year}_${appliedFilter.month}.csv`);
    } else if (activeTab === 'SLA') {
      const exportData = slaResults.by_pic.map(p => ({
        'PIC Name': p.pic_name,
        'Completed Tasks': p.total,
        'Excellence Count (<=3 Days)': p.excellence,
        'Good Count (4-5 Days)': p.good,
        'Bad Count (>5 Days)': p.bad,
        'Excellence Rate (%)': `${p.excellence_rate}%`,
        'Avg Working Days': p.avg_working_days
      }));
      downloadCSV(exportData, `SLA_Performance_Report_${appliedFilter.year}_${appliedFilter.month}.csv`);
    } else if (activeTab === 'DISTRIBUTION') {
      const exportData = brandDistributionResults.rows.map(r => {
        const row: Record<string, any> = {
          'Brand / Client': r.client_name,
          'Client Type': r.client_type,
          ...r.monthly_values,
          'Total Request Qty': r.row_total_qty,
          'Total Tasks': r.row_total_tasks
        };
        return row;
      });
      downloadCSV(exportData, `Brand_Request_Distribution_${appliedFilter.year}_${appliedFilter.month}.csv`);
    } else {
      const exportData = filteredTasks.map(t => ({
        'Task Code': t.task_code,
        'Brand': t.client_name,
        'Campaign Name': t.campaign_name,
        'Content Type': t.content_type_name,
        'Source': t.task_source,
        'Req Date': t.req_date,
        'Submission Date': t.submission_date || '-',
        'Difficulty': t.design_difficulty || 'MEDIUM',
        'Req Qty': t.req_qty,
        'Output Qty': t.output_qty,
        'Total Points': (t.output_qty * (DIFFICULTY_WEIGHTS[t.design_difficulty || 'MEDIUM'] || 3.5)).toFixed(2),
        'Working Days': t.sla_working_days ?? '-',
        'SLA Excellence': t.operational_excellence || '-',
        'PIC': t.design_pic_name || 'Unassigned',
        'Status': t.status_design
      }));
      downloadCSV(exportData, `All_Recap_Export_${appliedFilter.year}_${appliedFilter.month}.csv`);
    }
  };

  const isLeaderOrAdmin = ['ADMIN', 'TEAM_LEAD'].includes(user?.role_name || '');

  return (
    <div className="space-y-6 pb-12">
      {/* PAGE HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2.5">
            <BarChart3 className="w-6 h-6 text-[var(--accent-blue)]" />
            Operational Analytics & Workload
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Monitoring Team Occupancy, Request vs Output, SLA Excellence, dan Distribusi Request • Periode: <strong className="text-[var(--text-primary)]">{periodLabel}</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button 
            onClick={handleExportTab} 
            className="btn-outline shrink-0 h-10 px-4 rounded-xl flex items-center gap-2 text-sm font-semibold"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
          {isLeaderOrAdmin && (
            <button
              onClick={() => setShowCapacityModal(true)}
              className="btn-secondary shrink-0 h-10 px-4 rounded-xl flex items-center gap-2 text-sm font-semibold"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)' }}
            >
              <Settings className="w-4 h-4 text-[var(--accent-purple)]" />
              Configure Capacity
            </button>
          )}
        </div>
      </div>

      {/* GLOBAL INTERCONNECTED FILTER BAR */}
      <div className="card-static p-4 rounded-2xl border border-[var(--border-primary)] space-y-3" style={{ background: 'var(--bg-secondary)' }}>
        <div className="flex items-center justify-between pb-2 border-b border-[var(--border-secondary)]">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-[var(--accent-blue)]" />
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">Global Multi-Dimensional Filter</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleResetFilter}
              className="btn-ghost text-xs py-1 px-2.5 flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <RefreshCcw className="w-3.5 h-3.5" /> Reset
            </button>
            <button
              onClick={handleApplyFilter}
              className="btn-primary text-xs py-1.5 px-3.5 rounded-lg flex items-center gap-1.5 font-semibold"
            >
              <Check className="w-3.5 h-3.5" /> Apply Filter
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-9 gap-2.5 text-xs">
          {/* Month */}
          <div>
            <label className="text-[11px] text-[var(--text-muted)] font-medium mb-1 block">Month</label>
            <select
              className="select w-full text-xs py-1.5 px-2 rounded-lg"
              value={filter.month}
              onChange={e => setFilter({ ...filter, month: e.target.value })}
            >
              <option value="all">All Months</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={String(m).padStart(2, '0')}>{getMonthName(m)}</option>
              ))}
            </select>
          </div>

          {/* Year */}
          <div>
            <label className="text-[11px] text-[var(--text-muted)] font-medium mb-1 block">Year</label>
            <select
              className="select w-full text-xs py-1.5 px-2 rounded-lg"
              value={filter.year}
              onChange={e => setFilter({ ...filter, year: e.target.value })}
            >
              <option value="all">All Years</option>
              {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {/* Brand */}
          <div>
            <label className="text-[11px] text-[var(--text-muted)] font-medium mb-1 block">Brand / Client</label>
            <select
              className="select w-full text-xs py-1.5 px-2 rounded-lg"
              value={filter.clientId}
              onChange={e => setFilter({ ...filter, clientId: e.target.value })}
            >
              <option value="all">All Brands</option>
              {clients.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
            </select>
          </div>

          {/* PIC */}
          <div>
            <label className="text-[11px] text-[var(--text-muted)] font-medium mb-1 block">PIC / Designer</label>
            <select
              className="select w-full text-xs py-1.5 px-2 rounded-lg"
              value={filter.picId}
              onChange={e => setFilter({ ...filter, picId: e.target.value })}
            >
              <option value="all">All PICs</option>
              {users.filter(u => ['DESIGNER', 'TEAM_LEAD', 'STRATEGIC_PIC'].includes(u.role_name)).map(u => (
                <option key={u.id} value={u.id}>{u.full_name} ({u.role_name === 'TEAM_LEAD' ? 'Lead' : 'GD'})</option>
              ))}
            </select>
          </div>

          {/* Task Source */}
          <div>
            <label className="text-[11px] text-[var(--text-muted)] font-medium mb-1 block">Task Source</label>
            <select
              className="select w-full text-xs py-1.5 px-2 rounded-lg"
              value={filter.taskSource}
              onChange={e => setFilter({ ...filter, taskSource: e.target.value })}
            >
              <option value="all">All Sources</option>
              <option value="ORCA">Orca</option>
              <option value="ECOMMERCE">E-Commerce</option>
            </select>
          </div>

          {/* Content Type */}
          <div>
            <label className="text-[11px] text-[var(--text-muted)] font-medium mb-1 block">Content Type</label>
            <select
              className="select w-full text-xs py-1.5 px-2 rounded-lg"
              value={filter.contentTypeId}
              onChange={e => setFilter({ ...filter, contentTypeId: e.target.value })}
            >
              <option value="all">All Content Types</option>
              {contentTypes.map(ct => <option key={ct.id} value={String(ct.id)}>{ct.name}</option>)}
            </select>
          </div>

          {/* Difficulty */}
          <div>
            <label className="text-[11px] text-[var(--text-muted)] font-medium mb-1 block">Difficulty</label>
            <select
              className="select w-full text-xs py-1.5 px-2 rounded-lg"
              value={filter.difficulty}
              onChange={e => setFilter({ ...filter, difficulty: e.target.value })}
            >
              <option value="all">All Difficulties</option>
              <option value="HIGH">High (4.5 pts)</option>
              <option value="MEDIUM">Medium (3.5 pts)</option>
              <option value="LOW">Low (2.5 pts)</option>
            </select>
          </div>

          {/* Operational Excellence */}
          <div>
            <label className="text-[11px] text-[var(--text-muted)] font-medium mb-1 block">SLA Excellence</label>
            <select
              className="select w-full text-xs py-1.5 px-2 rounded-lg"
              value={filter.operationalExcellence}
              onChange={e => setFilter({ ...filter, operationalExcellence: e.target.value })}
            >
              <option value="all">All SLA Ratings</option>
              <option value="EXCELLENCE">Excellence (&le;3d)</option>
              <option value="GOOD">Good (4-5d)</option>
              <option value="BAD">Bad (&gt;5d)</option>
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="text-[11px] text-[var(--text-muted)] font-medium mb-1 block">Task Status</label>
            <select
              className="select w-full text-xs py-1.5 px-2 rounded-lg"
              value={filter.status}
              onChange={e => setFilter({ ...filter, status: e.target.value })}
            >
              <option value="all">All Statuses</option>
              {Object.entries(DESIGN_STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* TAB NAVIGATION */}
      <div className="flex items-center gap-2 border-b border-[var(--border-primary)] overflow-x-auto no-scrollbar pb-px">
        {[
          { id: 'OVERVIEW', label: 'Executive Summary', icon: LayoutDashboardIcon },
          { id: 'OCCUPANCY', label: '1. Team Occupancy', icon: Users },
          { id: 'REQ_OUTPUT', label: '2. Request vs Output', icon: Layers },
          { id: 'SLA', label: '3. SLA Performance', icon: Award },
          { id: 'DISTRIBUTION', label: '4. Request Distribution', icon: Building2 },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as AnalyticsTab)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all shrink-0 cursor-pointer ${
                isActive
                  ? 'border-[var(--accent-blue)] text-[var(--accent-blue)] bg-blue-500/5'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
              }`}
              style={{ borderTopLeftRadius: '10px', borderTopRightRadius: '10px' }}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 0: EXECUTIVE SUMMARY / OVERVIEW */}
      {activeTab === 'OVERVIEW' && (
        <div className="space-y-6">
          {/* KPI Cards Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div 
              onClick={() => setDrillDownData({ title: 'Audit: All Active & Completed Requests', tasks: filteredTasks })}
              className="stat-card cursor-pointer hover:border-[var(--accent-blue)] transition-all"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-[var(--text-muted)] font-medium">Total Request Qty</span>
                <Layers className="w-4 h-4 text-[var(--accent-blue)]" />
              </div>
              <p className="text-2xl font-bold text-[var(--text-primary)]">{summaryKPIs.total_request_qty}</p>
              <p className="text-[11px] text-[var(--text-secondary)] mt-1">{summaryKPIs.total_tasks_count} Total Tasks</p>
            </div>

            <div 
              onClick={() => setDrillDownData({ title: 'Audit: Output Delivered', tasks: filteredTasks.filter(t => (t.output_qty || 0) > 0) })}
              className="stat-card cursor-pointer hover:border-[var(--accent-emerald)] transition-all"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-[var(--text-muted)] font-medium">Total Output Qty</span>
                <CheckCircle2 className="w-4 h-4 text-[var(--accent-emerald)]" />
              </div>
              <p className="text-2xl font-bold text-[var(--text-primary)]">{summaryKPIs.total_output_qty}</p>
              <p className="text-[11px] text-emerald-400 font-semibold mt-1">{summaryKPIs.output_achievement_rate}% Achievement</p>
            </div>

            <div 
              onClick={() => setActiveTab('OCCUPANCY')}
              className="stat-card cursor-pointer hover:border-[var(--accent-purple)] transition-all"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-[var(--text-muted)] font-medium">Avg Team Occupancy</span>
                <Users className="w-4 h-4 text-[var(--accent-purple)]" />
              </div>
              <p className={`text-2xl font-bold ${summaryKPIs.average_team_occupancy > 100 ? 'text-[var(--accent-red)]' : 'text-[var(--text-primary)]'}`}>
                {summaryKPIs.average_team_occupancy}%
              </p>
              <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                {summaryKPIs.overloaded_pics_count > 0 ? (
                  <span className="text-rose-400 font-semibold">{summaryKPIs.overloaded_pics_count} PIC Overload</span>
                ) : (
                  <span className="text-emerald-400">All Capacity Safe</span>
                )}
              </p>
            </div>

            <div 
              onClick={() => setActiveTab('SLA')}
              className="stat-card cursor-pointer hover:border-emerald-500 transition-all"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-[var(--text-muted)] font-medium">SLA Excellence Rate</span>
                <Award className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-2xl font-bold text-emerald-400">{summaryKPIs.sla_excellence_rate}%</p>
              <p className="text-[11px] text-[var(--text-secondary)] mt-1">SLA &le; 3 Working Days</p>
            </div>

            <div 
              onClick={() => setActiveTab('DISTRIBUTION')}
              className="stat-card cursor-pointer hover:border-[var(--accent-cyan)] transition-all"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-[var(--text-muted)] font-medium">Active Brands</span>
                <Building2 className="w-4 h-4 text-[var(--accent-cyan)]" />
              </div>
              <p className="text-2xl font-bold text-[var(--text-primary)]">{summaryKPIs.active_brands_count}</p>
              <p className="text-[11px] text-[var(--text-secondary)] mt-1">{summaryKPIs.total_points} Total Points</p>
            </div>
          </div>

          {/* Quick Snapshot Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Occupancy Snapshot */}
            <div className="card-static p-5 rounded-2xl border border-[var(--border-primary)] space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <Users className="w-4 h-4 text-[var(--accent-purple)]" />
                    Team Workload & Occupancy Overview
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">Perbandingan poin beban kerja terhadap kapasitas bulanan</p>
                </div>
                <button onClick={() => setActiveTab('OCCUPANCY')} className="btn-ghost text-xs text-[var(--accent-blue)] flex items-center gap-1">
                  Detail <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-3">
                {occupancyResults.map(o => (
                  <div key={o.pic_id} className="p-3 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[var(--text-primary)]">{o.pic_name} ({o.role_name})</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[var(--text-secondary)]">{o.total_points} / {o.max_capacity} pts</span>
                        <span className={`badge text-[10px] font-bold ${
                          o.occupancy_status === 'OVERLOAD' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                          o.occupancy_status === 'FULL CAPACITY' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                          'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        }`}>
                          {o.occupancy_rate}% • {o.occupancy_status}
                        </span>
                      </div>
                    </div>
                    <div className="h-2 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(o.occupancy_rate, 100)}%`,
                          background: o.occupancy_rate > 100 ? 'linear-gradient(90deg, #ef4444, #f43f5e)' :
                                     o.occupancy_rate >= 80 ? 'linear-gradient(90deg, #f59e0b, #eab308)' :
                                     'linear-gradient(90deg, #10b981, #06b6d4)'
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* SLA Performance Snapshot */}
            <div className="card-static p-5 rounded-2xl border border-[var(--border-primary)] space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <Award className="w-4 h-4 text-emerald-400" />
                    SLA Excellence Distribution
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">Ketepatan waktu pengerjaan (Working Days SLA 3 Hari)</p>
                </div>
                <button onClick={() => setActiveTab('SLA')} className="btn-ghost text-xs text-[var(--accent-blue)] flex items-center gap-1">
                  Detail <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <p className="text-xs font-semibold text-emerald-400">Excellence (&le;3d)</p>
                  <p className="text-2xl font-bold text-emerald-300 mt-1">{slaResults.excellence_rate}%</p>
                  <p className="text-[11px] text-[var(--text-muted)]">{slaResults.excellence_count} Tasks</p>
                </div>
                <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
                  <p className="text-xs font-semibold text-blue-400">Good (4-5d)</p>
                  <p className="text-2xl font-bold text-blue-300 mt-1">{slaResults.good_rate}%</p>
                  <p className="text-[11px] text-[var(--text-muted)]">{slaResults.good_count} Tasks</p>
                </div>
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20">
                  <p className="text-xs font-semibold text-rose-400">Bad (&gt;5d)</p>
                  <p className="text-2xl font-bold text-rose-300 mt-1">{slaResults.bad_rate}%</p>
                  <p className="text-[11px] text-[var(--text-muted)]">{slaResults.bad_count} Tasks</p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] flex items-center justify-between text-xs">
                <span className="text-[var(--text-secondary)]">Total Evaluated Tasks:</span>
                <span className="font-bold text-[var(--text-primary)]">{slaResults.total_completed} Tasks</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 1: TEAM OCCUPANCY */}
      {activeTab === 'OCCUPANCY' && (
        <div className="space-y-6">
          {/* Header & Capacity Benchmarks Info */}
          <div className="p-4 rounded-2xl border border-[var(--border-primary)] flex flex-col md:flex-row md:items-center justify-between gap-4" style={{ background: 'var(--bg-secondary)' }}>
            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Users className="w-5 h-5 text-[var(--accent-purple)]" />
                Team Occupancy & Difficulty Task Breakdown
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Formula: Occupancy (%) = (Total Point / Max Capacity) × 100 • Benchmark: 20 Hari Kerja/Bulan
              </p>
            </div>
            {isLeaderOrAdmin && (
              <button
                onClick={() => setShowCapacityModal(true)}
                className="btn-primary text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 font-semibold"
              >
                <Sliders className="w-3.5 h-3.5" /> Ubah Kapasitas PIC
              </button>
            )}
          </div>

          {/* Occupancy Pivot Table */}
          <div className="card-static overflow-hidden rounded-2xl border border-[var(--border-primary)]">
            <div className="p-4 border-b border-[var(--border-secondary)] flex items-center justify-between">
              <h3 className="font-bold text-sm text-[var(--text-primary)]">Pivot: Difficulty Task Count & Occupancy Status per PIC</h3>
              <span className="text-xs text-[var(--text-muted)]">Klik baris PIC untuk melihat detail audit task</span>
            </div>
            <div className="overflow-x-auto">
              <table className="table w-full text-xs">
                <thead>
                  <tr className="bg-[var(--bg-tertiary)] text-[var(--text-muted)] uppercase text-[11px] tracking-wider">
                    <th className="p-3 text-left">PIC</th>
                    <th className="p-3 text-left">Period</th>
                    <th className="p-3 text-center">High (4.5 pts)</th>
                    <th className="p-3 text-center">Medium (3.5 pts)</th>
                    <th className="p-3 text-center">Low (2.5 pts)</th>
                    <th className="p-3 text-center font-bold">Total Task</th>
                    <th className="p-3 text-right font-bold">Total Point</th>
                    <th className="p-3 text-right">Max Capacity</th>
                    <th className="p-3 text-center font-bold">Occupancy %</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-secondary)]">
                  {occupancyResults.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-8 text-center text-[var(--text-muted)]">No data available for the selected filters</td>
                    </tr>
                  ) : (
                    occupancyResults.map(item => (
                      <tr 
                        key={item.pic_id} 
                        onClick={() => setDrillDownData({
                          title: `Audit Workload: ${item.pic_name}`,
                          subtitle: `${item.month_label} • ${item.total_tasks} Tasks • ${item.total_points} Total Points (${item.occupancy_rate}% Occupancy)`,
                          tasks: item.tasks
                        })}
                        className="hover:bg-[var(--bg-tertiary)] cursor-pointer transition-colors"
                      >
                        <td className="p-3 font-semibold text-[var(--text-primary)] flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold text-[var(--text-primary)]" style={{ background: 'var(--gradient-1)' }}>
                            {item.pic_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </div>
                          <div>
                            <div>{item.pic_name}</div>
                            <div className="text-[10px] text-[var(--text-muted)] font-normal">{item.role_name}</div>
                          </div>
                        </td>
                        <td className="p-3 text-[var(--text-secondary)]">{item.month_label}</td>
                        <td className="p-3 text-center font-semibold text-rose-400">{item.high_count}</td>
                        <td className="p-3 text-center font-semibold text-amber-400">{item.medium_count}</td>
                        <td className="p-3 text-center font-semibold text-emerald-400">{item.low_count}</td>
                        <td className="p-3 text-center font-bold text-[var(--text-primary)] bg-[var(--bg-tertiary)]/50">{item.total_tasks}</td>
                        <td className="p-3 text-right font-bold text-[var(--accent-blue)]">{item.total_points.toFixed(2)}</td>
                        <td className="p-3 text-right text-[var(--text-secondary)]">{item.max_capacity}</td>
                        <td className="p-3 text-center font-bold">
                          <span className={`text-sm ${
                            item.occupancy_rate > 100 ? 'text-rose-400' :
                            item.occupancy_rate === 100 ? 'text-amber-400' :
                            'text-emerald-400'
                          }`}>
                            {item.occupancy_rate.toFixed(2)}%
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span className={`badge text-[10px] font-bold ${
                            item.occupancy_status === 'OVERLOAD' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                            item.occupancy_status === 'FULL CAPACITY' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                            'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                          }`}>
                            {item.occupancy_status}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <button className="btn-ghost text-[11px] text-[var(--accent-blue)] py-1 px-2">Audit</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="bg-[var(--bg-tertiary)] font-bold text-[var(--text-primary)] border-t-2 border-[var(--border-primary)]">
                  <tr>
                    <td colSpan={2} className="p-3 text-left">GRAND TOTAL / TEAM AVERAGE</td>
                    <td className="p-3 text-center text-rose-400">{occupancyResults.reduce((sum, o) => sum + o.high_count, 0)}</td>
                    <td className="p-3 text-center text-amber-400">{occupancyResults.reduce((sum, o) => sum + o.medium_count, 0)}</td>
                    <td className="p-3 text-center text-emerald-400">{occupancyResults.reduce((sum, o) => sum + o.low_count, 0)}</td>
                    <td className="p-3 text-center bg-[var(--bg-tertiary)]">{occupancyResults.reduce((sum, o) => sum + o.total_tasks, 0)}</td>
                    <td className="p-3 text-right text-[var(--accent-blue)]">
                      {occupancyResults.reduce((sum, o) => sum + o.total_points, 0).toFixed(2)}
                    </td>
                    <td className="p-3 text-right">
                      {occupancyResults.reduce((sum, o) => sum + o.max_capacity, 0)}
                    </td>
                    <td className="p-3 text-center text-[var(--accent-purple)]">
                      {summaryKPIs.average_team_occupancy.toFixed(2)}%
                    </td>
                    <td colSpan={2} className="p-3 text-center">
                      {summaryKPIs.overloaded_pics_count > 0 ? (
                        <span className="text-xs text-rose-400">{summaryKPIs.overloaded_pics_count} OVERLOAD</span>
                      ) : (
                        <span className="text-xs text-emerald-400">CAPACITY SAFE</span>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Visual Occupancy Bar Chart & Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {occupancyResults.map(o => (
              <div 
                key={o.pic_id} 
                onClick={() => setDrillDownData({
                  title: `Audit Workload: ${o.pic_name}`,
                  subtitle: `${o.month_label} • ${o.total_tasks} Tasks • ${o.total_points} Total Points`,
                  tasks: o.tasks
                })}
                className="card-static p-6 rounded-2xl border border-[var(--border-primary)] cursor-pointer hover:border-[var(--accent-blue)] transition-all space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-[var(--text-primary)] text-base">{o.pic_name}</h4>
                  <span className={`text-lg font-bold ${
                    o.occupancy_rate > 100 ? 'text-rose-400' :
                    o.occupancy_rate === 100 ? 'text-amber-400' :
                    'text-emerald-400'
                  }`}>
                    {o.occupancy_rate}%
                  </span>
                </div>
                <div className="text-xs text-[var(--text-muted)] flex items-center justify-between">
                  <span>Points: <strong className="text-[var(--text-primary)]">{o.total_points}</strong> / {o.max_capacity}</span>
                  <span>Tasks: <strong className="text-[var(--text-primary)]">{o.total_tasks}</strong></span>
                </div>
                {/* 100% Threshold Visual Progress */}
                <div className="pt-2 pb-1">
                  <div className="h-3 rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(o.occupancy_rate, 100)}%`,
                        background: o.occupancy_rate > 100 ? '#ef4444' : o.occupancy_rate >= 80 ? '#f59e0b' : '#10b981'
                      }}
                    />
                  </div>
                  {/* Reference line 100% */}
                  <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] mt-2 leading-normal">
                    <span>0%</span>
                    <span className="font-semibold text-purple-400">100% Limit</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: REQUEST VS OUTPUT */}
      {activeTab === 'REQ_OUTPUT' && (
        <div className="space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="stat-card">
              <span className="text-xs text-[var(--text-muted)] font-medium">Total Request Qty</span>
              <p className="text-2xl font-bold text-[var(--text-primary)] mt-1">{reqVsOutputResults.grandTotal.req_qty}</p>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Semua brief terdaftar</p>
            </div>
            <div className="stat-card">
              <span className="text-xs text-[var(--text-muted)] font-medium">Total Output Qty</span>
              <p className="text-2xl font-bold text-emerald-400 mt-1">{reqVsOutputResults.grandTotal.output_qty}</p>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Asset selesai dikerjakan</p>
            </div>
            <div className="stat-card">
              <span className="text-xs text-[var(--text-muted)] font-medium">Output Achievement %</span>
              <p className="text-2xl font-bold text-[var(--accent-blue)] mt-1">{reqVsOutputResults.grandTotal.achievement}%</p>
              <p className="text-xs text-[var(--text-secondary)] mt-1">(Output / Request) × 100</p>
            </div>
            <div className="stat-card">
              <span className="text-xs text-[var(--text-muted)] font-medium">Request Gap (Outstanding)</span>
              <p className={`text-2xl font-bold mt-1 ${reqVsOutputResults.grandTotal.gap > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {reqVsOutputResults.grandTotal.gap}
              </p>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Req Qty &minus; Output Qty</p>
            </div>
          </div>

          {/* E-Commerce vs Orca Snapshot Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="card-static p-5 rounded-2xl border border-[var(--border-primary)] space-y-3">
              <div className="flex items-center justify-between">
                <span className="badge text-xs px-2.5 py-1 bg-cyan-500/10 text-cyan-400 border-cyan-500/20 font-bold">
                  E-COMMERCE
                </span>
                <span className="text-xs font-semibold text-[var(--accent-blue)]">{reqVsOutputResults.ecommerceSummary.achievement}% Achievement</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2.5 bg-[var(--bg-tertiary)] rounded-xl">
                  <p className="text-[var(--text-muted)]">Request</p>
                  <p className="text-lg font-bold text-[var(--text-primary)]">{reqVsOutputResults.ecommerceSummary.req_qty}</p>
                </div>
                <div className="p-2.5 bg-[var(--bg-tertiary)] rounded-xl">
                  <p className="text-[var(--text-muted)]">Output</p>
                  <p className="text-lg font-bold text-emerald-400">{reqVsOutputResults.ecommerceSummary.output_qty}</p>
                </div>
                <div className="p-2.5 bg-[var(--bg-tertiary)] rounded-xl">
                  <p className="text-[var(--text-muted)]">Gap</p>
                  <p className="text-lg font-bold text-amber-400">{reqVsOutputResults.ecommerceSummary.gap}</p>
                </div>
              </div>
            </div>

            <div className="card-static p-5 rounded-2xl border border-[var(--border-primary)] space-y-3">
              <div className="flex items-center justify-between">
                <span className="badge text-xs px-2.5 py-1 bg-purple-500/10 text-purple-400 border-purple-500/20 font-bold">
                  ORCA
                </span>
                <span className="text-xs font-semibold text-[var(--accent-purple)]">{reqVsOutputResults.orcaSummary.achievement}% Achievement</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2.5 bg-[var(--bg-tertiary)] rounded-xl">
                  <p className="text-[var(--text-muted)]">Request</p>
                  <p className="text-lg font-bold text-[var(--text-primary)]">{reqVsOutputResults.orcaSummary.req_qty}</p>
                </div>
                <div className="p-2.5 bg-[var(--bg-tertiary)] rounded-xl">
                  <p className="text-[var(--text-muted)]">Output</p>
                  <p className="text-lg font-bold text-emerald-400">{reqVsOutputResults.orcaSummary.output_qty}</p>
                </div>
                <div className="p-2.5 bg-[var(--bg-tertiary)] rounded-xl">
                  <p className="text-[var(--text-muted)]">Gap</p>
                  <p className="text-lg font-bold text-amber-400">{reqVsOutputResults.orcaSummary.gap}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Table Breakdown by Content Type & Source */}
          <div className="card-static overflow-hidden rounded-2xl border border-[var(--border-primary)]">
            <div className="p-4 border-b border-[var(--border-secondary)] flex items-center justify-between">
              <h3 className="font-bold text-sm text-[var(--text-primary)]">Breakdown Request vs Output by Type of Content & Task Source</h3>
              <span className="text-xs text-[var(--text-muted)]">Group By: Content Type • Task Source</span>
            </div>
            <div className="overflow-x-auto">
              <table className="table w-full text-xs">
                <thead>
                  <tr className="bg-[var(--bg-tertiary)] text-[var(--text-muted)] uppercase text-[11px] tracking-wider">
                    <th className="p-3 text-left">Type of Content</th>
                    <th className="p-3 text-center">Task Source</th>
                    <th className="p-3 text-center">Task Count</th>
                    <th className="p-3 text-center font-semibold">Request Qty</th>
                    <th className="p-3 text-center font-semibold">Output Qty</th>
                    <th className="p-3 text-center font-bold">Achievement (%)</th>
                    <th className="p-3 text-center">Request Gap</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-secondary)]">
                  {reqVsOutputResults.items.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-[var(--text-muted)]">No request data found</td>
                    </tr>
                  ) : (
                    reqVsOutputResults.items.map((item, idx) => (
                      <tr 
                        key={`${item.content_type_id}-${item.task_source}-${idx}`}
                        onClick={() => setDrillDownData({
                          title: `Audit: ${item.content_type_name} (${item.task_source})`,
                          subtitle: `Req Qty: ${item.req_qty} • Output Qty: ${item.output_qty} (${item.achievement_rate}% Achievement)`,
                          tasks: item.tasks
                        })}
                        className="hover:bg-[var(--bg-tertiary)] cursor-pointer transition-colors"
                      >
                        <td className="p-3 font-semibold text-[var(--text-primary)]">{item.content_type_name}</td>
                        <td className="p-3 text-center">
                          <span className={`badge text-[10px] font-bold ${item.task_source === 'ECOMMERCE' ? 'bg-cyan-500/15 text-cyan-400' : 'bg-purple-500/15 text-purple-400'}`}>
                            {item.task_source}
                          </span>
                        </td>
                        <td className="p-3 text-center text-[var(--text-secondary)]">{item.task_count}</td>
                        <td className="p-3 text-center font-bold text-[var(--text-primary)]">{item.req_qty}</td>
                        <td className="p-3 text-center font-bold text-emerald-400">{item.output_qty}</td>
                        <td className="p-3 text-center font-bold">
                          <span className={`badge text-xs px-2.5 py-0.5 ${
                            item.achievement_rate >= 100 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                            item.achievement_rate > 0 ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                            'bg-slate-500/20 text-slate-400 border-slate-500/30'
                          }`}>
                            {item.achievement_rate}%
                          </span>
                        </td>
                        <td className="p-3 text-center font-bold">
                          <span className={item.request_gap > 0 ? 'text-amber-400' : 'text-emerald-400'}>
                            {item.request_gap}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <button className="btn-ghost text-[11px] text-[var(--accent-blue)] py-1 px-2">Detail</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="bg-[var(--bg-tertiary)] font-bold text-[var(--text-primary)] border-t-2 border-[var(--border-primary)]">
                  <tr>
                    <td colSpan={2} className="p-3 text-left">GRAND TOTAL</td>
                    <td className="p-3 text-center">{reqVsOutputResults.grandTotal.task_count}</td>
                    <td className="p-3 text-center text-[var(--text-primary)]">{reqVsOutputResults.grandTotal.req_qty}</td>
                    <td className="p-3 text-center text-emerald-400">{reqVsOutputResults.grandTotal.output_qty}</td>
                    <td className="p-3 text-center text-[var(--accent-blue)]">{reqVsOutputResults.grandTotal.achievement}%</td>
                    <td className="p-3 text-center text-amber-400">{reqVsOutputResults.grandTotal.gap}</td>
                    <td className="p-3 text-center"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SLA PERFORMANCE */}
      {activeTab === 'SLA' && (
        <div className="space-y-6">
          {/* SLA Overview KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="stat-card">
              <span className="text-xs text-[var(--text-muted)] font-medium">Excellence Rate</span>
              <p className="text-2xl font-bold text-emerald-400 mt-1">{slaResults.excellence_rate}%</p>
              <p className="text-xs text-[var(--text-secondary)] mt-1">{slaResults.excellence_count} Tasks (&le; 3 Working Days)</p>
            </div>
            <div className="stat-card">
              <span className="text-xs text-[var(--text-muted)] font-medium">Good Rate</span>
              <p className="text-2xl font-bold text-blue-400 mt-1">{slaResults.good_rate}%</p>
              <p className="text-xs text-[var(--text-secondary)] mt-1">{slaResults.good_count} Tasks (4-5 Working Days)</p>
            </div>
            <div className="stat-card">
              <span className="text-xs text-[var(--text-muted)] font-medium">Bad Rate</span>
              <p className="text-2xl font-bold text-rose-400 mt-1">{slaResults.bad_rate}%</p>
              <p className="text-xs text-[var(--text-secondary)] mt-1">{slaResults.bad_count} Tasks (&gt; 5 Working Days)</p>
            </div>
            <div className="stat-card">
              <span className="text-xs text-[var(--text-muted)] font-medium">Total Evaluated</span>
              <p className="text-2xl font-bold text-[var(--text-primary)] mt-1">{slaResults.total_completed}</p>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Tasks dengan submission date</p>
            </div>
          </div>

          {/* Monthly SLA Trend Breakdown */}
          <div className="card-static overflow-hidden rounded-2xl border border-[var(--border-primary)]">
            <div className="p-4 border-b border-[var(--border-secondary)] flex items-center justify-between">
              <h3 className="font-bold text-sm text-[var(--text-primary)]">Monthly SLA Performance Trend</h3>
              <span className="text-xs text-[var(--text-muted)]">Perhitungan Hari Kerja Exclude Weekend & Libur Nasional</span>
            </div>
            <div className="overflow-x-auto">
              <table className="table w-full text-xs">
                <thead>
                  <tr className="bg-[var(--bg-tertiary)] text-[var(--text-muted)] uppercase text-[11px] tracking-wider">
                    <th className="p-3 text-left">Month</th>
                    <th className="p-3 text-center font-bold">Total Tasks</th>
                    <th className="p-3 text-center text-emerald-400">Excellence (&le;3d)</th>
                    <th className="p-3 text-center text-blue-400">Good (4-5d)</th>
                    <th className="p-3 text-center text-rose-400">Bad (&gt;5d)</th>
                    <th className="p-3 text-center font-bold">Excellence %</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-secondary)]">
                  {slaResults.monthly_trend.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-[var(--text-muted)]">No completed task SLA records found</td>
                    </tr>
                  ) : (
                    slaResults.monthly_trend.map(m => (
                      <tr 
                        key={m.month_key}
                        onClick={() => setDrillDownData({
                          title: `Audit SLA: ${m.month_label}`,
                          subtitle: `${m.total} Tasks • Excellence: ${m.excellence_rate}% • Good: ${m.good_rate}% • Bad: ${m.bad_rate}%`,
                          tasks: m.tasks
                        })}
                        className="hover:bg-[var(--bg-tertiary)] cursor-pointer transition-colors"
                      >
                        <td className="p-3 font-semibold text-[var(--text-primary)]">{m.month_label}</td>
                        <td className="p-3 text-center font-bold text-[var(--text-primary)]">{m.total}</td>
                        <td className="p-3 text-center font-semibold text-emerald-400">{m.excellence} ({m.excellence_rate}%)</td>
                        <td className="p-3 text-center font-semibold text-blue-400">{m.good} ({m.good_rate}%)</td>
                        <td className="p-3 text-center font-semibold text-rose-400">{m.bad} ({m.bad_rate}%)</td>
                        <td className="p-3 text-center font-bold">
                          <span className={`badge text-xs px-2.5 py-0.5 ${
                            m.excellence_rate >= 90 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                            m.excellence_rate >= 70 ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                            'bg-rose-500/20 text-rose-400 border-rose-500/30'
                          }`}>
                            {m.excellence_rate}%
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <button className="btn-ghost text-[11px] text-[var(--accent-blue)] py-1 px-2">Audit</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* PIC SLA Performance Breakdown */}
          <div className="card-static overflow-hidden rounded-2xl border border-[var(--border-primary)]">
            <div className="p-4 border-b border-[var(--border-secondary)] flex items-center justify-between">
              <h3 className="font-bold text-sm text-[var(--text-primary)]">SLA Performance per Graphic Designer / PIC</h3>
              <span className="text-xs text-[var(--text-muted)]">Rata-rata working days dan ketepatan waktu per PIC</span>
            </div>
            <div className="overflow-x-auto">
              <table className="table w-full text-xs">
                <thead>
                  <tr className="bg-[var(--bg-tertiary)] text-[var(--text-muted)] uppercase text-[11px] tracking-wider">
                    <th className="p-3 text-left">PIC Name</th>
                    <th className="p-3 text-center font-bold">Total Done</th>
                    <th className="p-3 text-center text-emerald-400">Excellence (&le;3d)</th>
                    <th className="p-3 text-center text-blue-400">Good (4-5d)</th>
                    <th className="p-3 text-center text-rose-400">Bad (&gt;5d)</th>
                    <th className="p-3 text-center">Avg Working Days</th>
                    <th className="p-3 text-center font-bold">Excellence Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-secondary)]">
                  {slaResults.by_pic.map(p => (
                    <tr 
                      key={p.pic_id}
                      onClick={() => setDrillDownData({
                        title: `Audit SLA: ${p.pic_name}`,
                        subtitle: `${p.total} Completed Tasks • Avg ${p.avg_working_days} Working Days`,
                        tasks: p.tasks
                      })}
                      className="hover:bg-[var(--bg-tertiary)] cursor-pointer transition-colors"
                    >
                      <td className="p-3 font-semibold text-[var(--text-primary)]">{p.pic_name}</td>
                      <td className="p-3 text-center font-bold text-[var(--text-primary)]">{p.total}</td>
                      <td className="p-3 text-center font-semibold text-emerald-400">{p.excellence}</td>
                      <td className="p-3 text-center font-semibold text-blue-400">{p.good}</td>
                      <td className="p-3 text-center font-semibold text-rose-400">{p.bad}</td>
                      <td className="p-3 text-center font-mono font-bold text-[var(--accent-blue)]">{p.avg_working_days} days</td>
                      <td className="p-3 text-center font-bold">
                        <span className={`badge text-xs px-2.5 py-0.5 ${
                          p.excellence_rate >= 90 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                          p.excellence_rate >= 70 ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                          'bg-rose-500/20 text-rose-400 border-rose-500/30'
                        }`}>
                          {p.excellence_rate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: REQUEST DISTRIBUTION BY BRAND & CONTENT TYPE */}
      {activeTab === 'DISTRIBUTION' && (
        <div className="space-y-6">
          {/* Header Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="stat-card">
              <span className="text-xs text-[var(--text-muted)] font-medium">Total Request Qty</span>
              <p className="text-2xl font-bold text-[var(--text-primary)] mt-1">{brandDistributionResults.grand_total_qty}</p>
            </div>
            <div className="stat-card">
              <span className="text-xs text-[var(--text-muted)] font-medium">Active Brands</span>
              <p className="text-2xl font-bold text-[var(--accent-blue)] mt-1">{brandDistributionResults.rows.length}</p>
            </div>
            <div className="stat-card">
              <span className="text-xs text-[var(--text-muted)] font-medium">Total Tasks Count</span>
              <p className="text-2xl font-bold text-emerald-400 mt-1">{brandDistributionResults.grand_total_tasks}</p>
            </div>
            <div className="stat-card">
              <span className="text-xs text-[var(--text-muted)] font-medium">Period Range</span>
              <p className="text-sm font-bold text-[var(--accent-purple)] mt-2 truncate">{periodLabel}</p>
            </div>
          </div>

          {/* Matrix Pivot Table: Brand x Month */}
          <div className="card-static overflow-hidden rounded-2xl border border-[var(--border-primary)]">
            <div className="p-4 border-b border-[var(--border-secondary)] flex items-center justify-between">
              <h3 className="font-bold text-sm text-[var(--text-primary)]">Pivot Table: Request Qty by Brand & Month</h3>
              <span className="text-xs text-[var(--text-muted)]">SUM(Req Qty) per Brand • Row & Column Grand Total</span>
            </div>
            <div className="overflow-x-auto">
              <table className="table w-full text-xs">
                <thead>
                  <tr className="bg-[var(--bg-tertiary)] text-[var(--text-muted)] uppercase text-[11px] tracking-wider">
                    <th className="p-3 text-left sticky left-0 bg-[var(--bg-tertiary)] z-10">Brand / Client</th>
                    <th className="p-3 text-left">Type</th>
                    {brandDistributionResults.months.map(mKey => {
                      const [y, m] = mKey.split('-');
                      return (
                        <th key={mKey} className="p-3 text-center whitespace-nowrap">
                          {getMonthName(Number(m))} {y}
                        </th>
                      );
                    })}
                    <th className="p-3 text-right font-bold bg-[var(--bg-tertiary)] sticky right-0">Grand Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-secondary)]">
                  {brandDistributionResults.rows.map(row => (
                    <tr 
                      key={row.client_id}
                      onClick={() => setDrillDownData({
                        title: `Audit Brand: ${row.client_name}`,
                        subtitle: `${row.row_total_qty} Total Request Qty • ${row.row_total_tasks} Tasks`,
                        tasks: filteredTasks.filter(t => t.client_id === row.client_id)
                      })}
                      className="hover:bg-[var(--bg-tertiary)] cursor-pointer transition-colors"
                    >
                      <td className="p-3 font-semibold text-[var(--text-primary)] sticky left-0 bg-[var(--bg-secondary)] z-10 whitespace-nowrap">
                        {row.client_name}
                      </td>
                      <td className="p-3 text-[var(--text-muted)] text-[10px]">
                        <span className="badge text-[9px] py-0.5 px-1.5">{row.client_type}</span>
                      </td>
                      {brandDistributionResults.months.map(mKey => (
                        <td key={mKey} className="p-3 text-center font-mono">
                          {row.monthly_values[mKey] > 0 ? (
                            <span className="font-semibold text-[var(--accent-blue)]">{row.monthly_values[mKey]}</span>
                          ) : (
                            <span className="text-[var(--text-muted)]">0</span>
                          )}
                        </td>
                      ))}
                      <td className="p-3 text-right font-bold text-[var(--text-primary)] bg-[var(--bg-tertiary)]/50 sticky right-0 font-mono">
                        {row.row_total_qty}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-[var(--bg-tertiary)] font-bold text-[var(--text-primary)] border-t-2 border-[var(--border-primary)]">
                  <tr>
                    <td colSpan={2} className="p-3 text-left sticky left-0 bg-[var(--bg-tertiary)] z-10">GRAND TOTAL</td>
                    {brandDistributionResults.months.map(mKey => (
                      <td key={mKey} className="p-3 text-center text-[var(--accent-blue)] font-mono">
                        {brandDistributionResults.column_totals[mKey] || 0}
                      </td>
                    ))}
                    <td className="p-3 text-right text-emerald-400 font-mono sticky right-0 bg-[var(--bg-tertiary)] text-sm">
                      {brandDistributionResults.grand_total_qty}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Hierarchical Breakdown: Brand -> Content Type */}
          <div className="card-static p-5 rounded-2xl border border-[var(--border-primary)] space-y-4">
            <h3 className="font-bold text-sm text-[var(--text-primary)]">Breakdown by Brand & Content Type</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {brandDistributionResults.rows.map(row => (
                <div key={row.client_id} className="p-4 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] space-y-3">
                  <div className="flex items-center justify-between border-b border-[var(--border-secondary)] pb-2">
                    <h4 className="font-bold text-sm text-[var(--text-primary)] truncate">{row.client_name}</h4>
                    <span className="text-xs font-bold text-[var(--accent-blue)]">{row.row_total_qty} req</span>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    {row.content_breakdown.map((cb, idx) => (
                      <div key={idx} className="flex items-center justify-between text-[var(--text-secondary)] py-0.5">
                        <span className="truncate pr-2">{cb.content_type_name}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-[var(--text-muted)]">{cb.task_count} tasks</span>
                          <span className="font-semibold text-[var(--text-primary)]">{cb.req_qty} qty</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* AUDIT DRILL-DOWN MODAL */}
      <AnimatePresence>
        {drillDownData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-overlay z-50 p-4"
            onClick={() => setDrillDownData(null)}
          >
            <div 
              className="modal-content max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden rounded-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-5 border-b border-[var(--border-primary)] flex items-center justify-between shrink-0 bg-[var(--bg-secondary)]">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="badge text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/30">Audit Trail</span>
                    <h2 className="text-lg font-bold text-[var(--text-primary)]">{drillDownData.title}</h2>
                  </div>
                  {drillDownData.subtitle && (
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">{drillDownData.subtitle}</p>
                  )}
                </div>
                <button onClick={() => setDrillDownData(null)} className="btn-ghost p-1.5 rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Task list table */}
              <div className="p-5 overflow-y-auto flex-1 space-y-3">
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)] pb-2 border-b border-[var(--border-secondary)]">
                  <span>Showing {drillDownData.tasks.length} Underlying Task Transactions</span>
                  <button
                    onClick={() => {
                      const exportData = drillDownData.tasks.map(t => ({
                        'Task Code': t.task_code,
                        'Brand': t.client_name,
                        'Campaign': t.campaign_name,
                        'Content Type': t.content_type_name,
                        'Req Date': t.req_date,
                        'Due Date': t.due_date,
                        'Submission Date': t.submission_date || '-',
                        'Difficulty': t.design_difficulty || 'MEDIUM',
                        'Req Qty': t.req_qty,
                        'Output Qty': t.output_qty,
                        'Total Points': (t.output_qty * (DIFFICULTY_WEIGHTS[t.design_difficulty || 'MEDIUM'] || 3.5)).toFixed(2),
                        'Working Days': t.sla_working_days ?? '-',
                        'Operational Excellence': t.operational_excellence || '-',
                        'PIC': t.design_pic_name || 'Unassigned',
                        'Status': t.status_design
                      }));
                      downloadCSV(exportData, `Drill_Down_${Date.now()}.csv`);
                    }}
                    className="btn-ghost text-xs text-[var(--accent-blue)] flex items-center gap-1 font-semibold"
                  >
                    <Download className="w-3.5 h-3.5" /> Export Drill-down
                  </button>
                </div>

                <div className="overflow-x-auto rounded-xl border border-[var(--border-secondary)]">
                  <table className="table w-full text-xs">
                    <thead>
                      <tr className="bg-[var(--bg-tertiary)] text-[var(--text-muted)] uppercase text-[10px] tracking-wider">
                        <th className="p-2.5 text-left">Code</th>
                        <th className="p-2.5 text-left">Brand</th>
                        <th className="p-2.5 text-left">Campaign Name</th>
                        <th className="p-2.5 text-left">Content Type</th>
                        <th className="p-2.5 text-center">Req Date</th>
                        <th className="p-2.5 text-center">Submit Date</th>
                        <th className="p-2.5 text-center">Difficulty</th>
                        <th className="p-2.5 text-center">Qty</th>
                        <th className="p-2.5 text-right font-bold">Points</th>
                        <th className="p-2.5 text-center">SLA Days</th>
                        <th className="p-2.5 text-center">Excellence</th>
                        <th className="p-2.5 text-left">PIC</th>
                        <th className="p-2.5 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-secondary)]">
                      {drillDownData.tasks.length === 0 ? (
                        <tr>
                          <td colSpan={13} className="p-8 text-center text-[var(--text-muted)]">No task transactions found</td>
                        </tr>
                      ) : (
                        drillDownData.tasks.map(t => {
                          const diff = t.design_difficulty || 'MEDIUM';
                          const weight = DIFFICULTY_WEIGHTS[diff] || 3.5;
                          const points = (t.output_qty || t.req_qty || 1) * weight;

                          return (
                            <tr key={t.id} className="hover:bg-[var(--bg-tertiary)]">
                              <td className="p-2.5 font-mono font-bold text-[var(--accent-blue)]">{t.task_code}</td>
                              <td className="p-2.5 font-medium text-[var(--text-primary)]">{t.client_name}</td>
                              <td className="p-2.5 text-[var(--text-primary)] truncate max-w-[180px]">{t.campaign_name}</td>
                              <td className="p-2.5 text-[var(--text-secondary)]">{t.content_type_name}</td>
                              <td className="p-2.5 text-center text-[var(--text-secondary)]">{formatDisplayDate(t.req_date)}</td>
                              <td className="p-2.5 text-center text-[var(--text-secondary)]">{t.submission_date ? formatDisplayDate(t.submission_date) : '—'}</td>
                              <td className="p-2.5 text-center">
                                <span className={`badge text-[9px] py-0.5 px-1.5 ${DIFFICULTY_COLORS[diff]}`}>{diff}</span>
                              </td>
                              <td className="p-2.5 text-center font-bold text-[var(--text-primary)]">{t.req_qty} / {t.output_qty}</td>
                              <td className="p-2.5 text-right font-mono font-bold text-[var(--accent-blue)]">{points.toFixed(1)}</td>
                              <td className="p-2.5 text-center font-mono">{t.sla_working_days ?? '—'}</td>
                              <td className="p-2.5 text-center">
                                {t.operational_excellence ? (
                                  <span className={`badge text-[9px] py-0.5 px-1.5 ${EXCELLENCE_COLORS[t.operational_excellence]}`}>
                                    {t.operational_excellence}
                                  </span>
                                ) : '—'}
                              </td>
                              <td className="p-2.5 text-[var(--text-secondary)]">{t.design_pic_name || 'Unassigned'}</td>
                              <td className="p-2.5 text-center">
                                <span className={`badge text-[9px] py-0.5 px-1.5 ${DESIGN_STATUS_COLORS[t.status_design]}`}>
                                  {DESIGN_STATUS_LABELS[t.status_design]}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CAPACITY CONFIGURATION MODAL */}
      <AnimatePresence>
        {showCapacityModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-overlay z-50 p-4"
            onClick={() => setShowCapacityModal(false)}
          >
            <div 
              className="modal-content max-w-lg w-full rounded-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-5 border-b border-[var(--border-primary)] flex items-center justify-between bg-[var(--bg-secondary)]">
                <div>
                  <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <Settings className="w-5 h-5 text-[var(--accent-purple)]" />
                    Configure PIC Daily Capacity
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)]">Atur kapasitas poin per hari (Max Monthly = Daily × 20 hari kerja)</p>
                </div>
                <button onClick={() => setShowCapacityModal(false)} className="btn-ghost p-1.5 rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {selectedUserForCap ? (
                  <form onSubmit={handleSaveCapacity} className="space-y-4">
                    <div className="p-4 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-secondary)]">
                      <p className="text-sm font-bold text-[var(--text-primary)]">{selectedUserForCap.full_name}</p>
                      <p className="text-xs text-[var(--text-muted)]">{selectedUserForCap.role_name} • {selectedUserForCap.email}</p>
                    </div>

                    <div>
                      <label className="label">Daily Capacity Points (pts/day) *</label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="30"
                        className="input"
                        required
                        value={inputDailyCap}
                        onChange={e => setInputDailyCap(Number(e.target.value))}
                      />
                      <p className="text-xs text-[var(--accent-blue)] mt-1.5">
                        Kapasitas Bulanan: <strong>{(inputDailyCap * 20).toFixed(0)} poin / bulan</strong> (20 hari kerja)
                      </p>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <button type="button" onClick={() => setSelectedUserForCap(null)} className="btn-secondary">
                        Kembali
                      </button>
                      <button type="submit" disabled={isSavingCap} className="btn-primary">
                        {isSavingCap ? 'Menyimpan...' : 'Simpan Kapasitas'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-[var(--text-muted)] mb-2">Pilih PIC yang ingin disesuaikan kapasitasnya:</p>
                    {users.filter(u => ['DESIGNER', 'TEAM_LEAD'].includes(u.role_name)).map(u => (
                      <div 
                        key={u.id}
                        onClick={() => {
                          setSelectedUserForCap(u);
                          setInputDailyCap(u.daily_capacity_points || 7);
                        }}
                        className="p-3 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] hover:border-[var(--accent-blue)] cursor-pointer flex items-center justify-between transition-all"
                      >
                        <div>
                          <p className="text-sm font-semibold text-[var(--text-primary)]">{u.full_name}</p>
                          <p className="text-xs text-[var(--text-muted)]">{u.role_name}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-[var(--accent-blue)]">{u.daily_capacity_points || 0} pts/day</p>
                          <p className="text-[11px] text-[var(--text-secondary)]">({(u.daily_capacity_points * 20) || 0} pts/mo)</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Icon helper
function LayoutDashboardIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="7" height="9" x="3" y="3" rx="1" />
      <rect width="7" height="5" x="14" y="3" rx="1" />
      <rect width="7" height="9" x="14" y="12" rx="1" />
      <rect width="7" height="5" x="3" y="16" rx="1" />
    </svg>
  );
}
