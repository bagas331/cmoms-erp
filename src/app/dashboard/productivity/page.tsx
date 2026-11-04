'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { usePersistedState } from '@/lib/use-persistent-state';
import {
  getAllTasksWithRelations,
  getMotionTasks,
  getClients,
  getUsers,
} from '@/lib/supabase-store';
import {
  TaskWithRelations,
  MotionTask,
  Client,
  User,
  ProductivityTeamType,
  DesignerProductivityMetrics,
  ProductivityTaskRecord,
} from '@/lib/types';
import {
  calculateTeamProductivity,
  formatFriendlyDuration,
  generateProductivityCSV,
  STANDARD_WEEKLY_HOURS,
} from '@/lib/productivity-engine';
import {
  formatDisplayDateTime,
  formatDisplayDate,
  sanitizeUrl,
} from '@/lib/utils';
import { downloadRawCSV } from '@/lib/export';
import {
  MONTH_NAMES_ID,
  ROLE_LABELS,
} from '@/lib/constants';
import {
  Timer,
  TrendingUp,
  Award,
  Users,
  CheckCircle2,
  Clock,
  RotateCcw,
  Download,
  Search,
  Filter,
  Layers,
  Film,
  Zap,
  ExternalLink,
  AlertTriangle,
  Calendar,
  Info,
  Check,
  Briefcase,
  X,
  FileText,
  Target,
  ArrowUpRight,
  Eye,
} from 'lucide-react';

export default function ProductivityTrackerPage() {
  const { user } = useAuth();

  // Data states
  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [motionTasks, setMotionTasks] = useState<MotionTask[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter states
  const currentDate = new Date();
  const currentYearStr = String(currentDate.getFullYear());
  const currentMonthStr = String(currentDate.getMonth() + 1).padStart(2, '0');

  const [filterYear, setFilterYear] = usePersistedState<string>('cmos_prod_filter_year', currentYearStr);
  const [filterMonth, setFilterMonth] = usePersistedState<string>('cmos_prod_filter_month', currentMonthStr);
  const [filterWeek, setFilterWeek] = usePersistedState<string>('cmos_prod_filter_week', 'all');
  const [teamType, setTeamType] = usePersistedState<ProductivityTeamType>('cmos_prod_team_type', 'ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // View state: 'LEADERBOARD' (Tabel Ringkasan Tim) vs 'TASK_LOG' (Log Seluruh Task)
  const [activeViewTab, setActiveViewTab] = usePersistedState<'LEADERBOARD' | 'TASK_LOG'>('cmos_prod_view_tab', 'LEADERBOARD');

  // Task log status filter
  const [taskLogStatus, setTaskLogStatus] = useState<'ALL' | 'COMPLETED' | 'IN_PROGRESS'>('ALL');

  // Selected designer for task drill-down modal
  const [selectedDesigner, setSelectedDesigner] = useState<DesignerProductivityMetrics | null>(null);

  // Load raw data from Supabase / localStore
  const loadData = useCallback(async () => {
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
      console.error('Failed to load productivity data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Close modal on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedDesigner(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Compute available years
  const availableYears = useMemo(() => {
    const rawYears = [
      ...tasks.map((t) => (t.req_date || t.created_at || '').substring(0, 4)).filter(Boolean),
      ...motionTasks.map((m) => (m.created_at || '').substring(0, 4)).filter(Boolean),
      currentYearStr,
    ];
    return Array.from(new Set(rawYears)).sort().reverse();
  }, [tasks, motionTasks, currentYearStr]);

  // Compute productivity calculations via engine
  const { designerMetrics, summaryKPIs, allTaskRecords } = useMemo(() => {
    return calculateTeamProductivity(tasks, motionTasks, clients, users, {
      year: filterYear,
      month: filterMonth,
      week: filterWeek,
      teamType,
      searchQuery,
    });
  }, [tasks, motionTasks, clients, users, filterYear, filterMonth, filterWeek, teamType, searchQuery]);

  // Filtered task log records
  const filteredTaskRecords = useMemo(() => {
    if (taskLogStatus === 'COMPLETED') {
      return allTaskRecords.filter((t) => t.is_completed);
    }
    if (taskLogStatus === 'IN_PROGRESS') {
      return allTaskRecords.filter((t) => !t.is_completed);
    }
    return allTaskRecords;
  }, [allTaskRecords, taskLogStatus]);

  // Export CSV handler
  const handleExportCSV = () => {
    if (!designerMetrics.length) return;
    const csvContent = generateProductivityCSV(designerMetrics, allTaskRecords, summaryKPIs);
    const cleanPeriod = summaryKPIs.period_label.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Productivity_Tracker_${teamType}_${cleanPeriod}.csv`;
    downloadRawCSV(filename, csvContent);
  };

  // Reset filters
  const handleResetFilters = () => {
    setFilterYear(currentYearStr);
    setFilterMonth(currentMonthStr);
    setFilterWeek('all');
    setTeamType('ALL');
    setSearchQuery('');
  };

  const capacityDenominator = filterWeek !== 'all' ? STANDARD_WEEKLY_HOURS : STANDARD_WEEKLY_HOURS * 4;

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      {/* 1. PAGE HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[var(--border-primary)]">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border border-[var(--accent-blue)]/20 shadow-sm">
              <Timer className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] tracking-tight">
                Productivity Tracker
              </h1>
              <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
                Monitoring durasi penyelesaian tugas (Turnaround Time), perolehan poin kesulitan, dan pemanfaatan jam kerja tim GD & Motion.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-primary)] transition-colors shadow-sm disabled:opacity-50"
            title="Refresh Data"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            disabled={loading || designerMetrics.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/90 text-white transition-all shadow-sm disabled:opacity-50"
            title="Ekspor CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Ekspor CSV</span>
          </button>
        </div>
      </div>

      {/* 2. TOP FOCUSED 3-KPI SECTION */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* KPI 1: Hasil Kerja (Poin & Output Selesai) */}
        <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] shadow-sm hover:border-[var(--accent-blue)]/40 transition-all">
          <div className="flex items-center justify-between text-[var(--text-tertiary)] mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Hasil Kerja (Output Poin)
            </span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">
              {summaryKPIs.total_team_points}
            </span>
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">
              Poin Disetujui
            </span>
          </div>
          <div className="mt-2 pt-2 border-t border-[var(--border-secondary)] text-xs text-[var(--text-secondary)] flex items-center justify-between">
            <span>Task Selesai: <strong className="text-[var(--text-primary)]">{summaryKPIs.total_completed_tasks}</strong></span>
            <span className="text-[var(--text-tertiary)]">&bull;</span>
            <span>Sedang Berjalan: <strong className="text-amber-400">{summaryKPIs.total_active_tasks}</strong></span>
          </div>
        </div>

        {/* KPI 2: Kecepatan Kerja (Turnaround Time) */}
        <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] shadow-sm hover:border-[var(--accent-blue)]/40 transition-all">
          <div className="flex items-center justify-between text-[var(--text-tertiary)] mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Kecepatan Selesai (Turnaround)
            </span>
            <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">
              {formatFriendlyDuration(summaryKPIs.avg_turnaround_hours)}
            </span>
            <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wide">
              Rata-rata / Task
            </span>
          </div>
          <div className="mt-2 pt-2 border-t border-[var(--border-secondary)] text-xs text-[var(--text-secondary)] flex items-center justify-between">
            <span>Dihitung: <strong>Ditugaskan s/d Approved</strong></span>
            <span className="text-[var(--text-tertiary)]">&bull;</span>
            <span>Rata Revisi: <strong className="text-amber-400">{formatFriendlyDuration(summaryKPIs.avg_revision_hours)}</strong></span>
          </div>
        </div>

        {/* KPI 3: Pemanfaatan Jam Kerja (40 Jam/Minggu) */}
        <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] shadow-sm hover:border-[var(--accent-blue)]/40 transition-all">
          <div className="flex items-center justify-between text-[var(--text-tertiary)] mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Utilisasi Jam Kerja Tim
            </span>
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Target className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">
              {summaryKPIs.avg_time_utilization_rate}%
            </span>
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
              dari {capacityDenominator} Jam Basis
            </span>
          </div>
          <div className="mt-2 pt-2 border-t border-[var(--border-secondary)] text-xs text-[var(--text-secondary)] flex items-center justify-between">
            <span>Rasio Efisiensi: <strong className="text-[var(--text-primary)]">{summaryKPIs.overall_points_per_hour} pts/jam</strong></span>
            <span className="text-[var(--text-tertiary)]">&bull;</span>
            <span>Total PIC: <strong className="text-[var(--text-primary)]">{designerMetrics.length} orang</strong></span>
          </div>
        </div>
      </div>

      {/* 3. FILTER STRIP */}
      <div className="p-3.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] space-y-3 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-2.5 items-end">
          {/* Team Tabs */}
          <div className="lg:col-span-4">
            <label className="block text-[10px] font-bold text-[var(--text-tertiary)] uppercase mb-1">
              Filter Tim
            </label>
            <div className="flex items-center p-0.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-primary)]">
              <button
                type="button"
                onClick={() => setTeamType('ALL')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  teamType === 'ALL'
                    ? 'bg-[var(--accent-blue)] text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Semua
              </button>
              <button
                type="button"
                onClick={() => setTeamType('GD')}
                className={`flex-1 inline-flex items-center justify-center gap-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  teamType === 'GD'
                    ? 'bg-[var(--accent-blue)] text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Layers className="w-3 h-3" />
                <span>GD</span>
              </button>
              <button
                type="button"
                onClick={() => setTeamType('MOTION')}
                className={`flex-1 inline-flex items-center justify-center gap-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  teamType === 'MOTION'
                    ? 'bg-[var(--accent-blue)] text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Film className="w-3 h-3" />
                <span>Motion</span>
              </button>
            </div>
          </div>

          {/* Month */}
          <div className="lg:col-span-2">
            <label className="block text-[10px] font-bold text-[var(--text-tertiary)] uppercase mb-1">
              Bulan
            </label>
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="w-full h-8 px-2 py-1 text-xs rounded-lg bg-[var(--bg-primary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
            >
              <option value="all">Semua Bulan</option>
              {MONTH_NAMES_ID.map((name, idx) => {
                const val = String(idx + 1).padStart(2, '0');
                return (
                  <option key={val} value={val}>
                    {name}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Year */}
          <div className="lg:col-span-2">
            <label className="block text-[10px] font-bold text-[var(--text-tertiary)] uppercase mb-1">
              Tahun
            </label>
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="w-full h-8 px-2 py-1 text-xs rounded-lg bg-[var(--bg-primary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
            >
              <option value="all">Semua Tahun</option>
              {availableYears.map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>
          </div>

          {/* Week */}
          <div className="lg:col-span-2">
            <label className="block text-[10px] font-bold text-[var(--text-tertiary)] uppercase mb-1">
              Minggu
            </label>
            <select
              value={filterWeek}
              onChange={(e) => setFilterWeek(e.target.value)}
              className="w-full h-8 px-2 py-1 text-xs rounded-lg bg-[var(--bg-primary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
            >
              <option value="all">Semua Minggu</option>
              <option value="W1">Minggu 1 (Tgl 1 - 7)</option>
              <option value="W2">Minggu 2 (Tgl 8 - 14)</option>
              <option value="W3">Minggu 3 (Tgl 15 - 21)</option>
              <option value="W4">Minggu 4 (Tgl 22 - Akhir)</option>
            </select>
          </div>

          {/* Search */}
          <div className="lg:col-span-2">
            <label className="block text-[10px] font-bold text-[var(--text-tertiary)] uppercase mb-1">
              Cari Anggota / Task
            </label>
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
              <input
                type="text"
                placeholder="Cari nama desainer, kode task, klien..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  paddingLeft: '38px',
                  paddingRight: searchQuery ? '30px' : '10px',
                }}
                className="w-full h-8 pl-10 pr-8 text-xs rounded-lg bg-[var(--bg-primary)] border border-[var(--border-primary)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-blue)]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] p-0.5 rounded transition-colors"
                  title="Hapus pencarian"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Filter Info Footer */}
        <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] pt-1 border-t border-[var(--border-secondary)] flex-wrap gap-2">
          <span>
            Periode: <strong className="text-[var(--text-primary)]">{summaryKPIs.period_label}</strong> &bull; Total{' '}
            <strong className="text-[var(--text-primary)]">{designerMetrics.length}</strong> anggota tim aktif
          </span>
          <button
            type="button"
            onClick={handleResetFilters}
            className="text-[11px] text-[var(--accent-blue)] hover:underline font-semibold"
          >
            Reset Filter ke Bulan Berjalan
          </button>
        </div>
      </div>

      {/* 4. VIEW TABS (SPLIT VIEW SELECTOR) */}
      <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-2 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveViewTab('LEADERBOARD')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-all ${
              activeViewTab === 'LEADERBOARD'
                ? 'bg-[var(--accent-blue)] text-white border-[var(--accent-blue)] shadow-sm'
                : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-primary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Peringkat & Utilisasi Tim</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                activeViewTab === 'LEADERBOARD' ? 'bg-white/20 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
              }`}
            >
              {designerMetrics.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveViewTab('TASK_LOG')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-all ${
              activeViewTab === 'TASK_LOG'
                ? 'bg-[var(--accent-blue)] text-white border-[var(--accent-blue)] shadow-sm'
                : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-primary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Log Waktu Seluruh Task</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                activeViewTab === 'TASK_LOG' ? 'bg-white/20 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
              }`}
            >
              {allTaskRecords.length}
            </span>
          </button>
        </div>

        {/* Sub-filter for Task Log tab */}
        {activeViewTab === 'TASK_LOG' && (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[11px] text-[var(--text-muted)] font-medium">Status Task:</span>
            <select
              value={taskLogStatus}
              onChange={(e) => setTaskLogStatus(e.target.value as any)}
              className="h-7 px-2 text-xs rounded-md bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-none"
            >
              <option value="ALL">Semua ({allTaskRecords.length})</option>
              <option value="COMPLETED">Selesai / Approved ({allTaskRecords.filter((t) => t.is_completed).length})</option>
              <option value="IN_PROGRESS">Sedang Berjalan ({allTaskRecords.filter((t) => !t.is_completed).length})</option>
            </select>
          </div>
        )}
      </div>

      {/* 5. VIEW CONTENT */}
      {loading ? (
        <div className="flex items-center justify-center p-16 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)]">
          <div className="flex flex-col items-center gap-2">
            <div className="w-7 h-7 border-2 border-[var(--accent-blue)] border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-[var(--text-secondary)]">Memuat data produktivitas...</span>
          </div>
        </div>
      ) : activeViewTab === 'LEADERBOARD' ? (
        /* TAB 1: CLEAN LEADERBOARD TABLE */
        designerMetrics.length === 0 ? (
          <div className="p-8 text-center bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)] space-y-2">
            <Briefcase className="w-8 h-8 text-[var(--text-tertiary)] mx-auto" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Tidak ada data performa untuk filter ini
            </p>
            <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
              Coba sesuaikan pilihan minggu, bulan, atau ubah filter tim.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[var(--text-secondary)]">
                <thead className="bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-[11px] uppercase font-bold border-b border-[var(--border-primary)]">
                  <tr>
                    <th className="py-3 px-3 text-center w-12">Rank</th>
                    <th className="py-3 px-4">Anggota Tim</th>
                    <th className="py-3 px-3 text-center">Poin Selesai</th>
                    <th className="py-3 px-3 text-center">Output Task</th>
                    <th className="py-3 px-3 text-center">Total Durasi</th>
                    <th className="py-3 px-3 text-center">Poin / Jam</th>
                    <th className="py-3 px-4 min-w-[160px]">Utilisasi Jam ({capacityDenominator}j)</th>
                    <th className="py-3 px-3 text-center">Status</th>
                    <th className="py-3 px-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-primary)]">
                  {designerMetrics.map((designer) => {
                    const progressPct = Math.min(100, designer.time_utilization_rate);

                    const ratingConfig = {
                      OPTIMAL: { label: 'Optimal', bg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
                      BALANCED: { label: 'Sesuai', bg: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
                      AVAILABLE: { label: 'Tersedia', bg: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
                      OVERLOAD: { label: 'Overload', bg: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
                    }[designer.efficiency_rating];

                    return (
                      <tr
                        key={designer.user_id}
                        onClick={() => setSelectedDesigner(designer)}
                        className="hover:bg-[var(--bg-tertiary)]/40 transition-colors cursor-pointer group"
                      >
                        {/* Rank */}
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`inline-flex items-center justify-center w-6 h-6 rounded-md font-bold text-xs ${
                              designer.rank === 1
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                                : designer.rank === 2
                                ? 'bg-slate-400/20 text-slate-300 border border-slate-400/40'
                                : designer.rank === 3
                                ? 'bg-amber-700/20 text-amber-600 border border-amber-700/40'
                                : 'text-[var(--text-tertiary)]'
                            }`}
                          >
                            #{designer.rank}
                          </span>
                        </td>

                        {/* Anggota Tim */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] font-bold flex items-center justify-center border border-[var(--accent-blue)]/30 text-xs shrink-0">
                              {designer.user_initials}
                            </div>
                            <div>
                              <div className="font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-blue)] transition-colors">
                                {designer.user_name}
                              </div>
                              <span
                                className={`inline-block text-[9px] px-1.5 py-0.2 rounded font-semibold border ${
                                  designer.team_type === 'MOTION'
                                    ? 'bg-purple-500/10 text-purple-300 border-purple-500/20'
                                    : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20'
                                }`}
                              >
                                {designer.team_type === 'MOTION' ? 'Motion PIC' : 'Graphic Designer'}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Poin Selesai */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <span className="text-sm font-extrabold text-emerald-400">
                            {designer.total_points}
                          </span>
                          <span className="text-[10px] text-[var(--text-tertiary)] ml-0.5">pts</span>
                        </td>

                        {/* Output Task */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <span className="font-bold text-[var(--text-primary)]">
                            {designer.total_completed_tasks} selesai
                          </span>
                          {designer.total_in_progress_tasks > 0 && (
                            <span className="block text-[10px] text-amber-400 font-semibold mt-0.5">
                              +{designer.total_in_progress_tasks} berjalan
                            </span>
                          )}
                        </td>

                        {/* Total Durasi */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <span className="font-semibold text-[var(--text-primary)]">
                            {formatFriendlyDuration(designer.total_turnaround_hours)}
                          </span>
                          {designer.total_revision_count > 0 && (
                            <span className="block text-[10px] text-[var(--text-tertiary)] mt-0.5">
                              {designer.total_revision_count}x rev ({formatFriendlyDuration(designer.total_revision_hours)})
                            </span>
                          )}
                        </td>

                        {/* Poin / Jam */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <span className="font-bold text-yellow-400">
                            {designer.points_per_working_hour}
                          </span>
                          <span className="text-[10px] text-[var(--text-tertiary)] ml-0.5">pts/j</span>
                        </td>

                        {/* Utilisasi Jam */}
                        <td className="py-3 px-4">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-semibold text-[var(--text-primary)]">
                                {designer.total_turnaround_hours}j
                              </span>
                              <span className="font-bold text-[var(--text-secondary)]">
                                {designer.time_utilization_rate}%
                              </span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-[var(--bg-primary)] overflow-hidden border border-[var(--border-primary)]">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  designer.time_utilization_rate > 100
                                    ? 'bg-rose-500'
                                    : designer.time_utilization_rate >= 75
                                    ? 'bg-emerald-500'
                                    : 'bg-[var(--accent-blue)]'
                                }`}
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Status Kapasitas */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-semibold border ${ratingConfig.bg}`}>
                            {ratingConfig.label}
                          </span>
                        </td>

                        {/* Aksi Button */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDesigner(designer);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md bg-[var(--bg-tertiary)] hover:bg-[var(--accent-blue)] hover:text-white text-[var(--text-primary)] border border-[var(--border-primary)] transition-all shadow-xs"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Rincian</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        /* TAB 2: TRANSPARENT ALL TASK LOG TABLE */
        filteredTaskRecords.length === 0 ? (
          <div className="p-8 text-center bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)] space-y-2">
            <FileText className="w-8 h-8 text-[var(--text-tertiary)] mx-auto" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Tidak ada task yang cocok dengan filter log ini
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[var(--text-secondary)]">
                <thead className="bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-[11px] uppercase font-bold border-b border-[var(--border-primary)]">
                  <tr>
                    <th className="py-3 px-3">Kode Task</th>
                    <th className="py-3 px-4">Konten & Kampanye</th>
                    <th className="py-3 px-3">Desainer PIC</th>
                    <th className="py-3 px-3 text-center">Poin & Level</th>
                    <th className="py-3 px-3 text-center">Mulai Ditugaskan</th>
                    <th className="py-3 px-3 text-center">Selesai (Approved)</th>
                    <th className="py-3 px-3 text-center">Durasi Total</th>
                    <th className="py-3 px-3 text-center">Revisi</th>
                    <th className="py-3 px-3 text-center">Status</th>
                    <th className="py-3 px-3 text-center">Aset</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-primary)]">
                  {filteredTaskRecords.map((t) => (
                    <tr key={t.id} className="hover:bg-[var(--bg-tertiary)]/30 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-[var(--text-primary)] whitespace-nowrap">
                        {t.task_code}
                      </td>
                      <td className="py-2.5 px-4 max-w-[200px]">
                        <div className="font-semibold text-[var(--text-primary)] truncate" title={t.title}>
                          {t.title}
                        </div>
                        <div className="text-[10px] text-[var(--text-tertiary)] truncate">
                          {t.client_name} &bull; {t.campaign_name}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="font-medium text-[var(--text-primary)]">{t.pic_name}</span>
                        <span className="block text-[10px] text-[var(--text-tertiary)]">{t.team_type}</span>
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <span className="inline-block px-1.5 py-0.5 rounded font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 text-[11px]">
                          {t.difficulty_points} pts
                        </span>
                        <span className="block text-[9px] text-[var(--text-tertiary)] mt-0.5">
                          {t.difficulty_label}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap text-[11px]">
                        {formatDisplayDateTime(t.assigned_at)}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap text-[11px]">
                        {t.approved_at ? (
                          <span className="text-emerald-400 font-medium">
                            {formatDisplayDateTime(t.approved_at)}
                          </span>
                        ) : (
                          <span className="text-amber-400 italic font-semibold">Sedang Berjalan</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap font-semibold text-[var(--text-primary)]">
                        {formatFriendlyDuration(t.turnaround_hours)}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {t.revision_count > 0 ? (
                          <span className="text-amber-400 font-semibold text-[11px]">
                            {t.revision_count}x ({formatFriendlyDuration(t.revision_hours)})
                          </span>
                        ) : (
                          <span className="text-emerald-400 text-[11px]">0 Revisi</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                            t.is_completed
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          }`}
                        >
                          {t.is_completed ? 'Selesai' : t.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {t.final_asset_link || t.link_motion ? (
                          <a
                            href={sanitizeUrl(t.final_asset_link || t.link_motion || '')}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[var(--accent-blue)] hover:underline text-[11px]"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Link</span>
                          </a>
                        ) : (
                          <span className="text-[10px] text-[var(--text-tertiary)]">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* 6. MODAL RINCIAN TASK DESAINER */}
      {selectedDesigner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-[var(--border-primary)] bg-[var(--bg-tertiary)]/40 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] font-bold flex items-center justify-center border border-[var(--accent-blue)]/30 text-sm">
                  {selectedDesigner.user_initials}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-[var(--text-primary)]">
                      {selectedDesigner.user_name}
                    </h2>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold border bg-cyan-500/10 text-cyan-300 border-cyan-500/20">
                      {selectedDesigner.team_type === 'MOTION' ? 'Motion Designer' : 'Graphic Designer'}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Peringkat #{selectedDesigner.rank} &bull; {selectedDesigner.total_completed_tasks} task selesai &bull; {selectedDesigner.total_in_progress_tasks} task aktif berjalan
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedDesigner(null)}
                className="p-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                title="Tutup (ESC)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Quick Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-4 border-b border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-xs">
              <div className="p-2.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-primary)]">
                <span className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] block">Total Poin</span>
                <span className="text-base font-bold text-emerald-400">{selectedDesigner.total_points} pts</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-primary)]">
                <span className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] block">Total Durasi</span>
                <span className="text-base font-bold text-[var(--text-primary)]">{formatFriendlyDuration(selectedDesigner.total_turnaround_hours)}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-primary)]">
                <span className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] block">Poin / Jam</span>
                <span className="text-base font-bold text-yellow-400">{selectedDesigner.points_per_working_hour} pts/j</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-primary)]">
                <span className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] block">Utilisasi Jam</span>
                <span className="text-base font-bold text-cyan-400">{selectedDesigner.time_utilization_rate}%</span>
              </div>
            </div>

            {/* Modal Table Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider mb-2">
                Daftar Tugas PIC ({selectedDesigner.tasks.length} Task)
              </h3>
              <div className="overflow-x-auto rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)]">
                <table className="w-full text-left text-xs text-[var(--text-secondary)]">
                  <thead className="bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-[11px] uppercase font-bold border-b border-[var(--border-primary)]">
                    <tr>
                      <th className="py-2.5 px-3">Kode</th>
                      <th className="py-2.5 px-3">Konten & Klien</th>
                      <th className="py-2.5 px-3 text-center">Poin</th>
                      <th className="py-2.5 px-3 text-center">Ditugaskan</th>
                      <th className="py-2.5 px-3 text-center">Disetujui</th>
                      <th className="py-2.5 px-3 text-center">Turnaround</th>
                      <th className="py-2.5 px-3 text-center">Revisi</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3 text-center">Aset</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-primary)]">
                    {selectedDesigner.tasks.map((t) => (
                      <tr key={t.id} className="hover:bg-[var(--bg-tertiary)]/30 transition-colors">
                        <td className="py-2 px-3 font-mono font-bold text-[var(--text-primary)] whitespace-nowrap">
                          {t.task_code}
                        </td>
                        <td className="py-2 px-3 max-w-[200px]">
                          <div className="font-semibold text-[var(--text-primary)] truncate">{t.title}</div>
                          <div className="text-[10px] text-[var(--text-tertiary)]">{t.client_name}</div>
                        </td>
                        <td className="py-2 px-3 text-center whitespace-nowrap">
                          <span className="font-bold text-emerald-400">{t.difficulty_points} pts</span>
                        </td>
                        <td className="py-2 px-3 text-center whitespace-nowrap text-[11px]">
                          {formatDisplayDateTime(t.assigned_at)}
                        </td>
                        <td className="py-2 px-3 text-center whitespace-nowrap text-[11px]">
                          {t.approved_at ? (
                            <span className="text-emerald-400 font-medium">
                              {formatDisplayDateTime(t.approved_at)}
                            </span>
                          ) : (
                            <span className="text-amber-400 italic">Sedang Berjalan</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center whitespace-nowrap font-semibold text-[var(--text-primary)]">
                          {formatFriendlyDuration(t.turnaround_hours)}
                        </td>
                        <td className="py-2 px-3 text-center whitespace-nowrap">
                          {t.revision_count > 0 ? (
                            <span className="text-amber-400 font-semibold">
                              {t.revision_count}x ({formatFriendlyDuration(t.revision_hours)})
                            </span>
                          ) : (
                            <span className="text-emerald-400 text-[11px]">0</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center whitespace-nowrap">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                              t.is_completed
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            }`}
                          >
                            {t.is_completed ? 'Selesai' : t.status}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center whitespace-nowrap">
                          {t.final_asset_link || t.link_motion ? (
                            <a
                              href={sanitizeUrl(t.final_asset_link || t.link_motion || '')}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[var(--accent-blue)] hover:underline text-[11px]"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>Link</span>
                            </a>
                          ) : (
                            <span className="text-[10px] text-[var(--text-tertiary)]">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-[var(--border-primary)] bg-[var(--bg-tertiary)]/20 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setSelectedDesigner(null)}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-primary)] transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
