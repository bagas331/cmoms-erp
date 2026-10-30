'use client';

import React, { useEffect, useState, useMemo, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { usePersistedState } from '@/lib/use-persistent-state';
import {
  getAllTasksWithRelations,
  getMotionTasks,
  getClients,
  getUsers,
  restoreTask,
  restoreMotionTask,
  autoArchiveCompletedTasks
} from '@/lib/supabase-store';
import {
  TaskWithRelations,
  MotionTask,
  Client,
  User as UserType,
  PipelineType,
  WeekPartitionKey
} from '@/lib/types';
import { canUserRestoreTask, getDueWeekPartition, computeArchivePeriod, getTaskCompletionDate } from '@/lib/archive-engine';
import { isMockupTask, determineTaskPipeline } from '@/lib/pipeline-router';
import {
  PIPELINE_LABELS,
  PIPELINE_COLORS,
  MONTH_NAMES_ID,
  MONTH_NAMES_SHORT,
  EXCELLENCE_COLORS,
  EXCELLENCE_LABELS,
  DESIGN_STATUS_LABELS,
  STRAT_STATUS_LABELS,
  MOTION_STATUS_LABELS
} from '@/lib/constants';
import {
  formatDisplayDate,
  formatDisplayDateTime,
  sanitizeUrl,
  getWeekOfMonth
} from '@/lib/utils';
import {
  Archive,
  Search,
  Filter,
  Calendar,
  RotateCcw,
  Eye,
  MessageSquare,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Layers,
  ShoppingBag,
  Film,
  Compass,
  CheckCircle2,
  FolderCheck,
  CheckCheck,
  Clock,
  LayoutGrid,
  List,
  AlertTriangle,
  Download,
  Building2,
  Tag,
  User,
  ArrowRight,
  X
} from 'lucide-react';
import { RequestKanbanCard } from '@/components/request-kanban-card';
import { MotionKanbanCard, EnrichedMotionTask } from '@/components/motion-kanban-card';

type ArchivePipelineFilter = 'ALL' | 'GD_NON_MOCKUP' | 'MOTION' | 'GD_MOCKUP' | 'STRATEGIC';

interface UnifiedArchivedItem {
  id: string;
  taskCode: string;
  title: string;
  pipeline: PipelineType;
  clientName: string;
  requesterName: string;
  requesterId?: string | null;
  picName: string;
  picId?: string | null;
  dueDate: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  archivePeriod: string;
  statusBeforeArchive: string;
  outputLink: string | null;
  outputQty?: number;
  originalTask?: TaskWithRelations;
  originalMotionTask?: EnrichedMotionTask;
}

const PIPELINE_ICONS: Record<PipelineType, React.ComponentType<{ className?: string }>> = {
  STRATEGIC: Compass,
  GD_MOCKUP: Layers,
  GD_NON_MOCKUP: ShoppingBag,
  MOTION: Film,
};

export default function ArchivePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[400px]">
          <div
            className="w-8 h-8 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--border-primary)', borderTopColor: 'var(--accent-blue)' }}
          />
        </div>
      }
    >
      <ArchivePageContent />
    </Suspense>
  );
}

function ArchivePageContent() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    router.replace('/dashboard/motion?tab=archive');
  }, [router]);

  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [motionTasks, setMotionTasks] = useState<MotionTask[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [allUsers, setAllUsers] = useState<UserType[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = usePersistedState<string>('cmos_archive_search', '');
  const [selectedPipeline, setSelectedPipeline] = usePersistedState<ArchivePipelineFilter>('cmos_archive_pipeline', 'ALL');
  const [selectedYear, setSelectedYear] = usePersistedState<string>('cmos_archive_year', String(new Date().getFullYear()));
  const [selectedMonth, setSelectedMonth] = usePersistedState<string>('cmos_archive_month', 'all');
  const [selectedClient, setSelectedClient] = usePersistedState<string>('cmos_archive_client', 'all');
  const [selectedPic, setSelectedPic] = usePersistedState<string>('cmos_archive_pic', 'all');
  const [viewMode, setViewMode] = usePersistedState<'table' | 'kanban'>('cmos_archive_view_mode', 'table');
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(15);

  const fetchData = useCallback(async () => {
    try {
      // Run auto-archive scan idempotently
      try {
        await autoArchiveCompletedTasks();
      } catch (e) {
        console.warn('Auto archive background run error:', e);
      }

      const [tData, mData, cData, uData] = await Promise.all([
        getAllTasksWithRelations(),
        getMotionTasks(),
        getClients(),
        getUsers()
      ]);
      setTasks(tData);
      setMotionTasks(mData);
      setClients(cData);
      setAllUsers(uData);
    } catch (err) {
      console.error('Error fetching archive data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Combine and normalize archived items from Creative & Motion tasks
  const unifiedArchivedList = useMemo<UnifiedArchivedItem[]>(() => {
    const list: UnifiedArchivedItem[] = [];

    // 1. Creative Tasks that are archived or closed/approved
    tasks.forEach(t => {
      // If task belongs to motion or is linked to a motion task, let the motion loop handle it
      if (t.pipeline_type === 'MOTION' || (t.task_code && t.task_code.startsWith('MOT-')) || motionTasks.some(m => m.task_id === t.id)) {
        return;
      }
      const isStratTask = t.pipeline_type === 'STRATEGIC' || Boolean(t.requires_strategic_concept);
      const isArchived = (t.is_archived === true || t.status_design === 'TASK_CLOSED' || t.status_design === 'DESIGN_APPROVED' || (isStratTask && t.status_strat === 'APPROVED')) && !t.restored_at;
      if (!isArchived) return;

      const pipeline: PipelineType = determineTaskPipeline(t);

      const compDate = getTaskCompletionDate(t);
      const period = t.archive_period || computeArchivePeriod(compDate);

      const picName = isStratTask
        ? (t.strat_pic_names && t.strat_pic_names.length > 0 ? t.strat_pic_names.join(', ') : (t.strat_pic_name || t.design_pic_name || 'Unassigned'))
        : (t.design_pic_name || t.strat_pic_name || 'Unassigned');

      const picId = isStratTask ? (t.strat_pic_id || t.design_pic_id) : (t.design_pic_id || t.strat_pic_id);

      const statusBeforeArchive = isStratTask
        ? (STRAT_STATUS_LABELS[t.status_strat] || t.status_strat)
        : (DESIGN_STATUS_LABELS[t.status_design] || t.status_design);

      const outputLink = isStratTask
        ? (t.strat_concept_link || t.final_asset_link || null)
        : (t.final_asset_link || null);

      list.push({
        id: t.id,
        taskCode: t.task_code,
        title: t.campaign_name || t.client_name || 'Creative Task',
        pipeline,
        clientName: t.client_name || 'Unknown Client',
        requesterName: t.created_by_name || 'Requester',
        requesterId: t.created_by,
        picName,
        picId,
        dueDate: t.due_date,
        completedAt: compDate,
        archivedAt: t.archived_at || t.updated_at || null,
        archivePeriod: period,
        statusBeforeArchive,
        outputLink,
        outputQty: t.output_qty || t.req_qty || 1,
        originalTask: t
      });
    });

    // 2. Motion Tasks that are archived or completed/approved
    motionTasks.forEach(mt => {
      const isArchived = (mt.is_archived === true || mt.status_motion === 'COMPLETED' || mt.status_motion === 'APPROVED') && !mt.restored_at;
      if (!isArchived) return;

      const parent = tasks.find(t => t.id === mt.task_id);
      const client = clients.find(c => c.id === mt.client_id);
      const clientName = parent?.client_name || client?.name || 'Unknown Client';
      const picUser = allUsers.find(u => u.id === mt.motion_pic_id);
      const compDate = getTaskCompletionDate(mt);
      const period = mt.archive_period || computeArchivePeriod(compDate);

      list.push({
        id: mt.id,
        taskCode: parent?.task_code || mt.id.substring(0, 8).toUpperCase(),
        title: parent?.campaign_name || mt.campaign_type || mt.motion_type || 'Motion Task',
        pipeline: 'MOTION',
        clientName,
        requesterName: parent?.created_by_name || 'Motion Requester',
        requesterId: parent?.created_by,
        picName: picUser?.full_name || 'Unassigned',
        picId: mt.motion_pic_id,
        dueDate: parent?.due_date || mt.period_end || mt.production_date || null,
        completedAt: compDate,
        archivedAt: mt.archived_at || mt.updated_at || null,
        archivePeriod: period,
        statusBeforeArchive: MOTION_STATUS_LABELS[mt.status_motion] || mt.status_motion,
        outputLink: mt.link_motion || null,
        outputQty: 1,
        originalMotionTask: {
          ...mt,
          parentTask: parent,
        },
        originalTask: parent
      });
    });

    return list;
  }, [tasks, motionTasks, clients, allUsers]);

  // Available Years
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    unifiedArchivedList.forEach(item => {
      if (item.completedAt) {
        years.add(new Date(item.completedAt).getFullYear().toString());
      }
      if (item.archivePeriod) {
        years.add(item.archivePeriod.split('-')[0]);
      }
    });
    years.add(new Date().getFullYear().toString());
    return Array.from(years).sort().reverse();
  }, [unifiedArchivedList]);

  // Unique Clients & PICs
  const uniqueClients = useMemo(() => {
    return Array.from(new Set(unifiedArchivedList.map(i => i.clientName).filter(Boolean))).sort();
  }, [unifiedArchivedList]);

  const uniquePics = useMemo(() => {
    return Array.from(new Set(unifiedArchivedList.map(i => i.picName).filter(Boolean))).sort();
  }, [unifiedArchivedList]);

  // Filtered List
  const filteredList = useMemo(() => {
    return unifiedArchivedList.filter(item => {
      // Pipeline filter
      if (selectedPipeline !== 'ALL') {
        if (selectedPipeline === 'MOTION' && item.pipeline !== 'MOTION') return false;
        if (selectedPipeline === 'GD_NON_MOCKUP' && item.pipeline !== 'GD_NON_MOCKUP') return false;
        if (selectedPipeline === 'GD_MOCKUP' && item.pipeline !== 'GD_MOCKUP') return false;
        if (selectedPipeline === 'STRATEGIC' && item.pipeline !== 'STRATEGIC') return false;
      }

      // Year filter
      if (selectedYear !== 'all') {
        const itemYear = (item.completedAt || item.archivedAt || '').substring(0, 4);
        const periodYear = item.archivePeriod.split('-')[0];
        if (itemYear !== selectedYear && periodYear !== selectedYear) return false;
      }

      // Month filter
      if (selectedMonth !== 'all') {
        const monthPad = selectedMonth.padStart(2, '0');
        const itemMonth = (item.completedAt || item.archivedAt || '').substring(5, 7);
        const periodMonth = item.archivePeriod.split('-')[1];
        if (itemMonth !== monthPad && periodMonth !== monthPad) return false;
      }

      // Client filter
      if (selectedClient !== 'all' && item.clientName !== selectedClient) return false;

      // PIC filter
      if (selectedPic !== 'all' && item.picName !== selectedPic) return false;

      // Search query
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase().trim();
        const codeMatch = item.taskCode.toLowerCase().includes(q);
        const titleMatch = item.title.toLowerCase().includes(q);
        const clientMatch = item.clientName.toLowerCase().includes(q);
        const picMatch = item.picName.toLowerCase().includes(q);
        const reqMatch = item.requesterName.toLowerCase().includes(q);
        if (!codeMatch && !titleMatch && !clientMatch && !picMatch && !reqMatch) return false;
      }

      return true;
    });
  }, [unifiedArchivedList, selectedPipeline, selectedYear, selectedMonth, selectedClient, selectedPic, searchQuery]);

  // Paginated List
  const totalPages = Math.ceil(filteredList.length / limit) || 1;
  const paginatedList = useMemo(() => {
    const start = (page - 1) * limit;
    return filteredList.slice(start, start + limit);
  }, [filteredList, page, limit]);

  // Stats
  const stats = useMemo(() => {
    const total = unifiedArchivedList.length;
    const motion = unifiedArchivedList.filter(i => i.pipeline === 'MOTION').length;
    const gdNonMockup = unifiedArchivedList.filter(i => i.pipeline === 'GD_NON_MOCKUP').length;
    const gdMockup = unifiedArchivedList.filter(i => i.pipeline === 'GD_MOCKUP').length;
    const outputs = unifiedArchivedList.reduce((acc, i) => acc + (i.outputQty || 1), 0);
    return { total, motion, gdNonMockup, gdMockup, outputs };
  }, [unifiedArchivedList]);

  // Restore Handler
  const handleRestore = async (item: UnifiedArchivedItem) => {
    if (!user) return;
    const confirmMsg = `Pulihkan task [${item.taskCode}] ke board aktif ${PIPELINE_LABELS[item.pipeline]}?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      if (item.pipeline === 'MOTION' && item.originalMotionTask) {
        const res = await restoreMotionTask(item.originalMotionTask.id, user.id, user);
        if (res.success) {
          alert(`Berhasil! Task [${item.taskCode}] dipulihkan ke Motion Pipeline aktif.`);
          await fetchData();
        } else {
          alert(`Gagal memulihkan task: ${res.message}`);
        }
      } else if (item.originalTask) {
        const res = await restoreTask(item.originalTask.id, user.id, user);
        if (res.success) {
          alert(`Berhasil! Task [${item.taskCode}] dipulihkan ke board ${PIPELINE_LABELS[item.pipeline]} aktif.`);
          await fetchData();
        } else {
          alert(`Gagal memulihkan task: ${res.message}`);
        }
      }
    } catch (err: any) {
      alert(`Error saat memulihkan task: ${err.message || err}`);
    }
  };

  const canRestoreItem = (item: UnifiedArchivedItem): boolean => {
    if (!user) return false;
    if (item.originalMotionTask) {
      return canUserRestoreTask(user.role_name, user.id, item.originalMotionTask);
    }
    if (item.originalTask) {
      return canUserRestoreTask(user.role_name, user.id, item.originalTask);
    }
    return false;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner">
            <Archive className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
                Manajemen Arsip Pekerjaan
              </h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Archived Tasks
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Pusat penyimpanan histori pekerjaan selesai, auto-archive bulanan, dan pemulihan card (Restore) ke Kanban Board aktif.
            </p>
          </div>
        </div>

        {/* Quick Links & Refresh */}
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="btn-outline text-xs px-3 py-2 rounded-lg flex items-center gap-1.5"
            title="Muat ulang data arsip"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
          <Link
            href="/dashboard/tasks?pipeline=GD_NON_MOCKUP"
            className="btn-ghost text-xs px-3 py-2 rounded-lg flex items-center gap-1.5 text-blue-400 hover:bg-blue-500/10"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>E-Commerce Mockup</span>
          </Link>
          <Link
            href="/dashboard/motion"
            className="btn-ghost text-xs px-3 py-2 rounded-lg flex items-center gap-1.5 text-pink-400 hover:bg-pink-500/10"
          >
            <Film className="w-3.5 h-3.5" />
            <span>Motion Board</span>
          </Link>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)] shadow-sm">
          <p className="text-[11px] font-medium text-[var(--text-muted)]">Total Archived Tasks</p>
          <p className="text-2xl font-extrabold text-[var(--text-primary)] mt-1">{stats.total}</p>
          <p className="text-[10px] text-emerald-400 font-medium mt-1">Semua histori task</p>
        </div>
        <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)] shadow-sm">
          <p className="text-[11px] font-medium text-[var(--text-muted)]">Motion Pipeline</p>
          <p className="text-2xl font-extrabold text-pink-400 mt-1">{stats.motion}</p>
          <p className="text-[10px] text-[var(--text-muted)] mt-1">Video & reels selesai</p>
        </div>
        <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)] shadow-sm">
          <p className="text-[11px] font-medium text-[var(--text-muted)]">E-Commerce Mockup</p>
          <p className="text-2xl font-extrabold text-emerald-400 mt-1">{stats.gdNonMockup}</p>
          <p className="text-[10px] text-[var(--text-muted)] mt-1">Feed & e-commerce</p>
        </div>
        <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)] shadow-sm">
          <p className="text-[11px] font-medium text-[var(--text-muted)]">ORCA Mockup & Strat</p>
          <p className="text-2xl font-extrabold text-blue-400 mt-1">{stats.gdMockup}</p>
          <p className="text-[10px] text-[var(--text-muted)] mt-1">Mockup & konsep</p>
        </div>
        <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)] shadow-sm">
          <p className="text-[11px] font-medium text-[var(--text-muted)]">Output Assets Tersimpan</p>
          <p className="text-2xl font-extrabold text-purple-400 mt-1">{stats.outputs}</p>
          <p className="text-[10px] text-[var(--text-muted)] mt-1">Link drive & final files</p>
        </div>
      </div>

      {/* Main Filter & Action Toolbar */}
      <div className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] shadow-sm space-y-4">
        {/* Top Row: Search, Pipeline Buttons & View Mode */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1">
            {!searchQuery && (
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none transition-opacity duration-150" />
            )}
            <input
              type="text"
              placeholder="Cari Task ID, nama task, brand, PIC, requester..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              style={{
                paddingLeft: searchQuery ? '14px' : '38px',
                paddingRight: searchQuery ? '32px' : '12px',
              }}
              className="input w-full text-xs transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setPage(1);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                title="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Pipeline Switcher Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 lg:pb-0">
            {(
              [
                { key: 'ALL', label: 'Semua Pipeline', icon: Layers },
                { key: 'MOTION', label: 'Motion', icon: Film, color: 'text-pink-400' },
                { key: 'GD_NON_MOCKUP', label: 'E-Commerce Mockup', icon: ShoppingBag, color: 'text-emerald-400' },
                { key: 'GD_MOCKUP', label: 'ORCA Mockup', icon: Layers, color: 'text-blue-400' },
                { key: 'STRATEGIC', label: 'Strategic', icon: Compass, color: 'text-purple-400' }
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const isActive = selectedPipeline === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => {
                    setSelectedPipeline(item.key);
                    setPage(1);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-[var(--accent-blue)] text-white shadow-sm'
                      : 'bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* View Mode */}
          <div className="flex items-center gap-1 p-1 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg shrink-0">
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                viewMode === 'table'
                  ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Table</span>
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                viewMode === 'kanban'
                  ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Cards</span>
            </button>
          </div>
        </div>

        {/* Bottom Row: Detailed Dropdowns (Year, Month, Brand, PIC) */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-[var(--border-secondary)] text-xs">
          {/* Year */}
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span className="font-semibold text-[var(--text-secondary)]">Tahun:</span>
            <select
              value={selectedYear}
              onChange={(e) => {
                setSelectedYear(e.target.value);
                setPage(1);
              }}
              className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-md px-2.5 py-1 text-xs text-[var(--text-primary)] focus:outline-none"
            >
              <option value="all">Semua Tahun</option>
              {availableYears.map(yr => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>
          </div>

          {/* Month */}
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-[var(--text-secondary)]">Bulan:</span>
            <select
              value={selectedMonth}
              onChange={(e) => {
                setSelectedMonth(e.target.value);
                setPage(1);
              }}
              className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-md px-2.5 py-1 text-xs text-[var(--text-primary)] focus:outline-none"
            >
              <option value="all">Semua Bulan</option>
              {MONTH_NAMES_ID.map((name, idx) => (
                <option key={idx + 1} value={String(idx + 1)}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* Brand / Client */}
          <div className="flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span className="font-semibold text-[var(--text-secondary)]">Brand:</span>
            <select
              value={selectedClient}
              onChange={(e) => {
                setSelectedClient(e.target.value);
                setPage(1);
              }}
              className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-md px-2.5 py-1 text-xs text-[var(--text-primary)] focus:outline-none max-w-[160px]"
            >
              <option value="all">Semua Brand</option>
              {uniqueClients.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* PIC */}
          <div className="flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span className="font-semibold text-[var(--text-secondary)]">PIC:</span>
            <select
              value={selectedPic}
              onChange={(e) => {
                setSelectedPic(e.target.value);
                setPage(1);
              }}
              className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-md px-2.5 py-1 text-xs text-[var(--text-primary)] focus:outline-none max-w-[160px]"
            >
              <option value="all">Semua PIC</option>
              {uniquePics.map(pic => (
                <option key={pic} value={pic}>{pic}</option>
              ))}
            </select>
          </div>

          {/* Reset Filters */}
          {(selectedPipeline !== 'ALL' || selectedYear !== 'all' || selectedMonth !== 'all' || selectedClient !== 'all' || selectedPic !== 'all' || searchQuery !== '') && (
            <button
              onClick={() => {
                setSelectedPipeline('ALL');
                setSelectedYear('all');
                setSelectedMonth('all');
                setSelectedClient('all');
                setSelectedPic('all');
                setSearchQuery('');
                setPage(1);
              }}
              className="btn-ghost text-[11px] px-2.5 py-1 rounded-md text-rose-400 hover:bg-rose-500/10 flex items-center gap-1 ml-auto"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Filter</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content: Table or Cards View */}
      {viewMode === 'table' ? (
        <div className="space-y-4">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th className="whitespace-nowrap">Task ID</th>
                  <th className="whitespace-nowrap">Nama Task & Campaign</th>
                  <th className="whitespace-nowrap">Pipeline</th>
                  <th className="whitespace-nowrap">Brand / Client</th>
                  <th className="whitespace-nowrap">Requester</th>
                  <th className="whitespace-nowrap">PIC Terkait</th>
                  <th className="whitespace-nowrap">Due Date</th>
                  <th className="whitespace-nowrap">Selesai (Completed)</th>
                  <th className="whitespace-nowrap">Periode Arsip</th>
                  <th className="whitespace-nowrap">Output / Aset Final</th>
                  <th className="whitespace-nowrap">Status Asal</th>
                  <th className="text-right whitespace-nowrap">Aksi & Restore</th>
                </tr>
              </thead>
              <tbody>
                {paginatedList.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-16 text-center">
                      <div className="flex flex-col items-center justify-center max-w-md mx-auto">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-3 shadow-inner">
                          <FolderCheck className="w-6 h-6" />
                        </div>
                        <h4 className="text-base font-bold text-[var(--text-primary)] mb-1">
                          Tidak Ada Task Diarsipkan
                        </h4>
                        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                          Tidak ditemukan arsip task yang sesuai dengan filter pencarian, tahun, bulan, atau pipeline yang dipilih.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedList.map((item) => {
                    const isRestorable = canRestoreItem(item);
                    return (
                      <tr key={item.id} className="hover:bg-[var(--bg-secondary)]/50 transition-colors">
                        {/* Task Code */}
                        <td className="font-mono text-xs font-semibold text-[var(--text-primary)] whitespace-nowrap">
                          {item.taskCode}
                        </td>

                        {/* Title */}
                        <td>
                          <div className="font-semibold text-xs text-[var(--text-primary)] max-w-[200px] truncate" title={item.title}>
                            {item.title}
                          </div>
                        </td>

                        {/* Pipeline Badge */}
                        <td className="whitespace-nowrap">
                          {(() => {
                            const PipeIcon = PIPELINE_ICONS[item.pipeline] || Layers;
                            return (
                              <span
                                className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap shadow-xs ${
                                  PIPELINE_COLORS[item.pipeline] || 'bg-slate-500/10 text-slate-300'
                                }`}
                              >
                                <PipeIcon className="w-3.5 h-3.5 shrink-0" />
                                <span>{PIPELINE_LABELS[item.pipeline]}</span>
                              </span>
                            );
                          })()}
                        </td>

                        {/* Brand */}
                        <td className="text-xs font-medium text-[var(--text-secondary)] whitespace-nowrap">
                          {item.clientName}
                        </td>

                        {/* Requester */}
                        <td className="text-xs text-[var(--text-secondary)] whitespace-nowrap">
                          {item.requesterName}
                        </td>

                        {/* PIC */}
                        <td className="text-xs font-medium text-[var(--text-primary)] whitespace-nowrap">
                          {item.picName}
                        </td>

                        {/* Due Date */}
                        <td className="text-xs text-[var(--text-secondary)] whitespace-nowrap font-mono">
                          {item.dueDate ? formatDisplayDate(item.dueDate) : '-'}
                        </td>

                        {/* Completed At */}
                        <td className="text-xs text-emerald-400 whitespace-nowrap font-medium">
                          <div className="flex items-center gap-1">
                            <CheckCheck className="w-3.5 h-3.5 shrink-0" />
                            <span>{item.completedAt ? formatDisplayDate(item.completedAt) : '-'}</span>
                          </div>
                        </td>

                        {/* Archive Period */}
                        <td className="text-xs font-mono text-[var(--text-muted)] whitespace-nowrap">
                          <span className="bg-[var(--bg-tertiary)] px-2 py-0.5 rounded-md border border-[var(--border-secondary)]">
                            {item.archivePeriod}
                          </span>
                        </td>

                        {/* Output Link */}
                        <td className="whitespace-nowrap">
                          {item.outputLink ? (
                            <a
                              href={sanitizeUrl(item.outputLink)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-500/10 text-[var(--accent-blue)] hover:bg-blue-500/20 border border-blue-500/20 transition-all shadow-sm"
                              title={item.outputLink}
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>Lihat Output</span>
                            </a>
                          ) : (
                            <span className="text-xs text-[var(--text-muted)] italic">-</span>
                          )}
                        </td>

                        {/* Status Before Archive */}
                        <td>
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold whitespace-nowrap">
                            {item.statusBeforeArchive}
                          </span>
                        </td>

                        {/* Actions & Restore */}
                        <td className="text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* View Task in Main Board */}
                            <Link
                              href={
                                item.pipeline === 'MOTION'
                                  ? `/dashboard/motion?taskId=${item.id}&tab=details`
                                  : `/dashboard/tasks?pipeline=${item.pipeline}&taskId=${item.id}&tab=details`
                              }
                              className="btn-ghost text-xs p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-md"
                              title="Buka Detail Card di Board Asal"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Link>

                            {/* Restore Button */}
                            {isRestorable && (
                              <button
                                onClick={() => handleRestore(item)}
                                className="flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-md bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30 transition-all shadow-sm"
                                title="Pulihkan task ke papan kerja aktif"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Restore</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {filteredList.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border-primary)] text-xs text-[var(--text-secondary)] shadow-sm">
              <div className="flex items-center gap-2">
                <span>
                  Menampilkan <strong className="text-[var(--text-primary)]">{(page - 1) * limit + 1}</strong> - <strong className="text-[var(--text-primary)]">{Math.min(page * limit, filteredList.length)}</strong> dari <strong className="text-[var(--text-primary)]">{filteredList.length}</strong> task diarsipkan
                </span>
                <span className="hidden sm:inline text-[var(--text-muted)]">|</span>
                <div className="flex items-center gap-1.5">
                  <span>Per Halaman:</span>
                  <select
                    value={limit}
                    onChange={(e) => {
                      setLimit(Number(e.target.value));
                      setPage(1);
                    }}
                    className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded px-2 py-0.5 text-xs text-[var(--text-primary)] focus:outline-none"
                  >
                    <option value={10}>10</option>
                    <option value={15}>15</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="btn-outline h-8 px-2.5 rounded-lg flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed text-xs"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Prev</span>
                </button>
                <span className="px-2 font-medium text-[var(--text-primary)]">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="btn-outline h-8 px-2.5 rounded-lg flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed text-xs"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Cards View */
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedList.map(item => {
              if (item.originalMotionTask) {
                const clientName = item.clientName;
                const picUser = allUsers.find(u => u.id === item.originalMotionTask?.motion_pic_id);
                return (
                  <MotionKanbanCard
                    key={item.id}
                    mt={item.originalMotionTask}
                    isMovable={false}
                    isBeingDragged={false}
                    isArchive={true}
                    clientName={clientName}
                    picUser={picUser}
                    user={user}
                    onRestore={() => handleRestore(item)}
                    onClick={() => {
                      router.push(`/dashboard/motion?taskId=${item.id}&tab=details`);
                    }}
                  />
                );
              }
              if (item.originalTask) {
                return (
                  <RequestKanbanCard
                    key={item.id}
                    task={item.originalTask}
                    currentPipeline={item.pipeline}
                    isMovable={false}
                    isBeingDragged={false}
                    isArchive={true}
                    user={user}
                    onRestore={() => handleRestore(item)}
                    onClick={() => {
                      router.push(`/dashboard/tasks?pipeline=${item.pipeline}&taskId=${item.id}&tab=details`);
                    }}
                  />
                );
              }
              return null;
            })}
          </div>

          {filteredList.length === 0 && (
            <div className="p-16 text-center rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] text-[var(--text-muted)]">
              <FolderCheck className="w-8 h-8 mx-auto mb-2 opacity-30 text-emerald-400" />
              <p className="text-sm font-semibold text-[var(--text-primary)]">Tidak Ada Card Arsip</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Ubah filter pencarian untuk menemukan card lainnya.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
