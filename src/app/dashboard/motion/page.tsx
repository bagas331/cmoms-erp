'use client';

import { useEffect, useState, useRef, useCallback, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { 
  getMotionTasks, 
  getAllTasksWithRelations, 
  getUsers, 
  getClients, 
  assignMotionPic, 
  updateMotionStatus, 
  submitMotionTask, 
  createStandaloneMotionTask, 
  assignOperatorToMotionTask, 
  editStandaloneMotionTask, 
  requestMotionRevision, 
  deleteMotionTask, 
  getComments, 
  addComment, 
  deleteComment,
  restoreMotionTask,
  autoArchiveCompletedTasks,
  updateMotionDueDate,
  addTaskAttachment,
  removeTaskAttachment
} from '@/lib/supabase-store';
import { TaskChatSection } from '@/components/task-chat-section';
import { MotionKanbanCard } from '@/components/motion-kanban-card';
import { supabase } from '@/lib/supabase';
import { usePersistedState } from '@/lib/use-persistent-state';
import { useClickOutside } from '@/lib/use-click-outside';
import { useModalManager } from '@/lib/use-modal-manager';
import { 
  MOTION_KANBAN_COLUMNS, 
  MOTION_STATUS_COLORS, 
  MOTION_STATUS_LABELS, 
  MOTION_DIFFICULTY_LABELS, 
  REASON_LABELS,
  CAMPAIGN_NAMES,
  isValidCampaignName,
  normalizeCampaignName
} from '@/lib/constants';
import { 
  formatDisplayDate, 
  formatDisplayDateTime, 
  sanitizeUrl,
  getWeekOfMonth,
  getISOWeekNumber,
  getWeekRangeLabel,
  canUserDeleteMotionTask
} from '@/lib/utils';
import { downloadCSV } from '@/lib/export';
import { 
  MotionStatus, 
  MotionTask, 
  TaskWithRelations, 
  User as UserType, 
  Client, 
  MotionDifficulty, 
  TaskComment, 
  ReasonCategory,
  WeekPartitionKey,
  WeekPartitionInfo,
  TaskAttachment,
  AttachmentSection
} from '@/lib/types';
import { getDueWeekPartition, getWeeklyPartitionsForMonth, isTaskOverdue, canUserRestoreTask } from '@/lib/archive-engine';
import { validateStageTransition } from '@/lib/pipeline-router';
import { useAuth } from '@/lib/auth';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Film, 
  User, 
  Clock, 
  Play, 
  CheckCircle2, 
  Eye, 
  X, 
  Undo2, 
  ExternalLink, 
  Search, 
  ChevronDown, 
  ChevronLeft,
  ChevronRight,
  Filter, 
  Edit2, 
  GripVertical, 
  Plus, 
  RotateCcw, 
  Send, 
  Paperclip, 
  ImageIcon, 
  VideoIcon, 
  Maximize2, 
  Download, 
  FileVideo, 
  MessageSquare, 
  AlertTriangle, 
  Loader2, 
  LayoutGrid, 
  List, 
  ArrowUpDown, 
  Trash2, 
  Calendar, 
  Building2, 
  Layers, 
  CheckSquare, 
  RefreshCw,
  FileText,
  FolderCheck,
  ArrowRight,
  Check,
  Share2,
  Copy
} from 'lucide-react';
import { RequestImageUpload } from '@/components/request-image-upload';
import { useKanbanScroll } from '@/lib/use-kanban-scroll';
import { KanbanScrollToolbar, KanbanFloatingArrows } from '@/components/kanban-scroll-toolbar';

type EnrichedMotionTask = MotionTask & { parentTask?: TaskWithRelations };

export default function MotionPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border-primary)', borderTopColor: 'var(--accent-pink)' }} />
      </div>
    }>
      <MotionPageContent />
    </Suspense>
  );
}

function MotionPageContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const taskIdParam = searchParams?.get('taskId') || searchParams?.get('requestId');
  const tabParam = searchParams?.get('tab') as 'details' | 'chat' | null;

  const [motionTasks, setMotionTasks] = useState<EnrichedMotionTask[]>([]);
  const [allUsers, setAllUsers] = useState<UserType[]>([]);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [allTasks, setAllTasks] = useState<TaskWithRelations[]>([]);
  const [loading, setLoading] = useState(true);

  // View Mode: 'kanban' | 'weekly' | 'table'
  const [viewMode, setViewMode] = usePersistedState<'kanban' | 'weekly' | 'table'>('cmos_motion_view_mode', 'kanban');

  // Data Refresh function
  const refresh = useCallback(async () => {
    try {
      try {
        await autoArchiveCompletedTasks();
      } catch (e) {
        console.warn('Auto archive motion run error:', e);
      }

      const [mts, tasks, users, clients] = await Promise.all([
        getMotionTasks(),
        getAllTasksWithRelations(),
        getUsers(),
        getClients(),
      ]);
      setAllUsers(users);
      setAllClients(clients);
      setAllTasks(tasks);
      const enriched: EnrichedMotionTask[] = mts.map(mt => {
        const parent = tasks.find(t => t.id === mt.task_id);
        const resolvedAttachments = (mt.attachments && mt.attachments.length > 0)
          ? mt.attachments
          : (parent?.attachments || []);
        return {
          ...mt,
          attachments: resolvedAttachments,
          parentTask: parent,
        };
      });
      setMotionTasks(enriched);
    } catch (err) {
      console.error('Failed to load motion data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // ===================== UNIFIED MODAL LIFECYCLE MANAGER =====================
  type MotionModalType = 'DETAIL' | 'ASSIGN' | 'CREATE' | 'EDIT' | 'SUBMIT' | 'REVISION' | 'HANDOVER';

  const {
    activeModal,
    isOpen,
    getPayload,
    openModal,
    closeModal,
    switchModal,
  } = useModalManager<MotionModalType>({ lockScroll: true, closeOnEscape: true });

  const clearTaskIdParam = useCallback(() => {
    if (typeof window !== 'undefined' && (window.location.search.includes('taskId=') || window.location.search.includes('requestId='))) {
      const url = new URL(window.location.href);
      url.searchParams.delete('taskId');
      url.searchParams.delete('requestId');
      url.searchParams.delete('tab');
      window.history.replaceState(null, '', url.pathname + (url.search ? url.search : ''));
    }
  }, []);

  const handleCloseAnyModal = useCallback(() => {
    closeModal();
    clearTaskIdParam();
    refresh();
  }, [closeModal, clearTaskIdParam, refresh]);

  // Backward-compatible adapters
  const showDetailId = isOpen('DETAIL') ? getPayload<{ motionTaskId: string }>('DETAIL')?.motionTaskId || null : null;
  const showDetail = showDetailId ? motionTasks.find(t => t.id === showDetailId) || null : null;
  const detailInitialTab = isOpen('DETAIL') ? getPayload<{ initialTab?: 'details' | 'chat' }>('DETAIL')?.initialTab || 'details' : 'details';
  const assignPayload = isOpen('ASSIGN') ? getPayload<{ taskId: string; targetStatus?: MotionStatus | null }>('ASSIGN') : null;
  const showAssign = assignPayload?.taskId || null;
  const assignTargetStatus = assignPayload?.targetStatus || null;
  const showCreateModal = isOpen('CREATE');
  const showEditModal = isOpen('EDIT') ? getPayload<{ taskId: string }>('EDIT')?.taskId || null : null;
  const showSubmitModal = isOpen('SUBMIT') ? getPayload<{ taskId: string; targetAfterSubmit?: MotionStatus | null }>('SUBMIT') || null : null;
  const showRevisionModal = isOpen('REVISION') ? getPayload<{ taskId: string }>('REVISION')?.taskId || null : null;
  const showHandoverModal = isOpen('HANDOVER') ? getPayload<{ taskId: string }>('HANDOVER')?.taskId || null : null;

  const setShowDetail = useCallback((task: EnrichedMotionTask | null, tab: 'details' | 'chat' = 'details') => {
    if (task) openModal('DETAIL', { motionTaskId: task.id, initialTab: tab });
    else handleCloseAnyModal();
  }, [openModal, handleCloseAnyModal]);

  const setDetailInitialTab = useCallback((tab: 'details' | 'chat') => {
    if (activeModal?.type === 'DETAIL') {
      const current = getPayload<{ motionTaskId: string }>('DETAIL');
      if (current?.motionTaskId) {
        openModal('DETAIL', { motionTaskId: current.motionTaskId, initialTab: tab });
      }
    }
  }, [activeModal, getPayload, openModal]);

  const setShowAssign = useCallback((taskId: string | null, targetStatus?: MotionStatus | null) => {
    if (taskId) openModal('ASSIGN', { taskId, targetStatus: targetStatus || null });
    else handleCloseAnyModal();
  }, [openModal, handleCloseAnyModal]);

  const setShowCreateModal = useCallback((show: boolean) => {
    if (show) openModal('CREATE');
    else handleCloseAnyModal();
  }, [openModal, handleCloseAnyModal]);

  const setShowEditModal = useCallback((taskId: string | null) => {
    if (taskId) openModal('EDIT', { taskId });
    else handleCloseAnyModal();
  }, [openModal, handleCloseAnyModal]);

  const setShowSubmitModal = useCallback((payload: { taskId: string; targetAfterSubmit?: MotionStatus | null } | string | null) => {
    if (!payload) {
      handleCloseAnyModal();
      return;
    }
    const taskId = typeof payload === 'string' ? payload : payload.taskId;
    const targetAfterSubmit = typeof payload === 'object' ? payload.targetAfterSubmit : null;
    openModal('SUBMIT', { taskId, targetAfterSubmit });
  }, [openModal, handleCloseAnyModal]);

  const setShowRevisionModal = useCallback((taskId: string | null) => {
    if (taskId) openModal('REVISION', { taskId });
    else handleCloseAnyModal();
  }, [openModal, handleCloseAnyModal]);

  const setShowHandoverModal = useCallback((taskId: string | null) => {
    if (taskId) openModal('HANDOVER', { taskId });
    else handleCloseAnyModal();
  }, [openModal, handleCloseAnyModal]);

  // Auto open modal from searchParams (guarded by openedTaskIdParamRef to prevent phantom loops on background refreshes)
  const openedTaskIdParamRef = useRef<string | null>(null);
  useEffect(() => {
    if (taskIdParam && motionTasks.length > 0 && openedTaskIdParamRef.current !== taskIdParam) {
      const matched = motionTasks.find(t => 
        t.id === taskIdParam || 
        t.task_id === taskIdParam || 
        t.parentTask?.id === taskIdParam || 
        t.parentTask?.task_code === taskIdParam
      );
      if (matched) {
        openedTaskIdParamRef.current = taskIdParam;
        openModal('DETAIL', { motionTaskId: matched.id, initialTab: tabParam === 'chat' ? 'chat' : 'details' });
      }
    }
  }, [taskIdParam, tabParam, motionTasks, openModal]);

  // Drag & Drop State
  const [draggedMotionId, setDraggedMotionId] = useState<string | null>(null);
  const [dragOverMotionCol, setDragOverMotionCol] = useState<string | null>(null);

  // Active Pipeline Filters & Quick Filter Chips (Stitch Design Specification)
  type QuickFilter = 'all' | 'my_tasks' | 'overdue' | 'needs_review';

  const [searchQuery, setSearchQuery] = useState<string>(() => searchParams?.get('q') || '');
  const [selectedBrand, setSelectedBrand] = useState<string>(() => searchParams?.get('brand') || 'all');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>(() => {
    const s = searchParams?.get('status');
    if (s === 'my_tasks' || s === 'overdue' || s === 'needs_review') return s;
    return 'all';
  });

  // URL query parameters synchronization helper
  const updateUrlParams = useCallback((newParams: { q?: string; brand?: string; status?: QuickFilter }) => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (newParams.q !== undefined) {
      if (newParams.q.trim()) url.searchParams.set('q', newParams.q.trim());
      else url.searchParams.delete('q');
    }
    if (newParams.brand !== undefined) {
      if (newParams.brand && newParams.brand !== 'all') url.searchParams.set('brand', newParams.brand);
      else url.searchParams.delete('brand');
    }
    if (newParams.status !== undefined) {
      if (newParams.status && newParams.status !== 'all') url.searchParams.set('status', newParams.status);
      else url.searchParams.delete('status');
    }
    window.history.replaceState(null, '', url.pathname + (url.search ? url.search : ''));
  }, []);

  // Sync state if searchParams change externally (e.g. browser navigation)
  useEffect(() => {
    const q = searchParams?.get('q') || '';
    const b = searchParams?.get('brand') || 'all';
    const s = searchParams?.get('status') as QuickFilter || 'all';
    if (q !== searchQuery) setSearchQuery(q);
    if (b !== selectedBrand) setSelectedBrand(b);
    if (['all', 'my_tasks', 'overdue', 'needs_review'].includes(s) && s !== quickFilter) {
      setQuickFilter(s);
    }
  }, [searchParams]);

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    updateUrlParams({ q: val });
  };

  const handleBrandChange = (val: string) => {
    setSelectedBrand(val);
    updateUrlParams({ brand: val });
  };

  const handleQuickFilterToggle = (filter: 'my_tasks' | 'overdue' | 'needs_review') => {
    const nextFilter: QuickFilter = quickFilter === filter ? 'all' : filter;
    setQuickFilter(nextFilter);
    updateUrlParams({ status: nextFilter });
  };

  const handleDeleteMotionTask = useCallback(async (motionTaskId: string, taskCode?: string, clientName?: string) => {
    if (!user) return;
    const label = taskCode ? `${taskCode}${clientName ? ` (${clientName})` : ''}` : 'tiket motion ini';
    const confirmed = window.confirm(`Apakah Anda yakin ingin menghapus tiket motion ${label}? Tindakan ini tidak dapat dibatalkan.`);
    if (!confirmed) return;

    try {
      await deleteMotionTask(motionTaskId, user.id);
      refresh();
      handleCloseAnyModal();
    } catch (err: any) {
      console.error('Gagal menghapus tiket motion:', err);
      alert(`Gagal menghapus tiket motion: ${err?.message || err}`);
    }
  }, [user, refresh, handleCloseAnyModal]);

  // Section Navigation: 'active' | 'archive'
  const [mainTab, setMainTab] = usePersistedState<'active' | 'archive'>('cmos_motion_main_tab', 'active');

  useEffect(() => {
    const tab = searchParams?.get('tab');
    const section = searchParams?.get('section');
    if (tab === 'archive' || section === 'archive') {
      setMainTab('archive');
    } else if (tab === 'active' || section === 'active') {
      setMainTab('active');
    }
  }, [searchParams, setMainTab]);

  // Approved Archive Filters, Period Navigation & View Mode
  const [archiveViewMode, setArchiveViewMode] = usePersistedState<'kanban' | 'table'>('cmos_motion_archive_view_mode', 'kanban');
  const [archiveYear, setArchiveYear] = usePersistedState<string>('cmos_motion_archive_year', String(new Date().getFullYear()));
  const [archiveMonth, setArchiveMonth] = usePersistedState<string>('cmos_motion_archive_month', String(new Date().getMonth() + 1));
  const [archiveWeek, setArchiveWeek] = usePersistedState<string>('cmos_motion_archive_week', 'all');
  const [archiveSearch, setArchiveSearch] = usePersistedState<string>('cmos_motion_archive_search', '');
  const [archivePic, setArchivePic] = usePersistedState<string>('cmos_motion_archive_pic', 'all');
  const [archiveClient, setArchiveClient] = usePersistedState<string>('cmos_motion_archive_client', 'all');
  const [archiveStudio, setArchiveStudio] = usePersistedState<string>('cmos_motion_archive_studio', 'all');
  const [archivePlatform, setArchivePlatform] = usePersistedState<string>('cmos_motion_archive_platform', 'all');
  const [archiveSort, setArchiveSort] = usePersistedState<string>('cmos_motion_archive_sort', 'approved_desc');
  const [archivePage, setArchivePage] = usePersistedState<number>('cmos_motion_archive_page', 1);
  const [archiveLimit, setArchiveLimit] = usePersistedState<number>('cmos_motion_archive_limit', 15);

  // Table Sort State
  const [sortField, setSortField] = useState<'id' | 'client' | 'campaign' | 'status' | 'date'>('date');
  const [sortAsc, setSortAsc] = useState(false);

  const allMonths = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const availableYears = Array.from(new Set([
    ...motionTasks.map(t => (t.created_at || '').substring(0, 4)).filter(Boolean),
    ...motionTasks.map(t => t.parentTask?.req_date || '').filter(Boolean).map(d => d.substring(0, 4)),
    String(new Date().getFullYear())
  ])).sort().reverse();

  const motionUsers = allUsers.filter(u => ['MOTION_PIC', 'TEAM_LEAD'].includes(u.role_name));

  const uniquePics = Array.from(new Set(motionTasks.map(t => 
    t.motion_pic_id ? motionUsers.find(u => u.id === t.motion_pic_id)?.full_name || 'Unassigned' : 'Unassigned'
  ))).sort();

  const getMonthName = (m: string) => {
    const date = new Date(2000, parseInt(m) - 1);
    return date.toLocaleDateString('en-US', { month: 'short' });
  };

  const handleRestoreMotionTask = async (motionTaskId: string) => {
    if (!user) return;
    try {
      const res = await restoreMotionTask(motionTaskId, user.id, user);
      if (res.success) {
        await refresh();
        alert('Card Motion berhasil dipulihkan (restored) ke board aktif.');
      } else {
        alert(`Gagal memulihkan card: ${res.message}`);
      }
    } catch (err: any) {
      alert(`Error restore motion task: ${err.message || err}`);
    }
  };

  useEffect(() => { 
    refresh(); 
  }, [refresh]);



  // 1. All Accessible Approved Motion Tasks (Archive Base with RBAC)
  const accessibleApprovedMotionTasks = useMemo(() => {
    if (!user) return [];
    let list = motionTasks.filter(mt => (mt.is_archived === true || mt.status_motion === 'APPROVED' || mt.status_motion === 'COMPLETED') && !mt.restored_at);
    
    // Role-Based Access Control
    if (!['ADMIN', 'TEAM_LEAD'].includes(user.role_name)) {
      list = list.filter(mt => {
        if (user.role_name === 'MOTION_PIC') return mt.motion_pic_id === user.id;
        if (user.role_name === 'REQUESTER') return mt.parentTask?.created_by === user.id;
        if (user.role_name === 'STRATEGIC_PIC') return mt.parentTask?.strat_pic_id === user.id || (mt.parentTask?.strat_pic_ids && mt.parentTask.strat_pic_ids.includes(user.id));
        if (user.role_name === 'OPERATOR') return mt.operator_id === user.id;
        return mt.motion_pic_id === user.id || mt.parentTask?.created_by === user.id;
      });
    }
    return list;
  }, [motionTasks, user]);

  const activeMotionTasksCount = useMemo(() => {
    return motionTasks.filter(mt => !mt.is_archived).length;
  }, [motionTasks]);

  const approvedMotionTasksCount = accessibleApprovedMotionTasks.length;

  const thisMonthApprovedCount = useMemo(() => {
    const currentY = parseInt(archiveYear, 10) || new Date().getFullYear();
    const currentM = parseInt(archiveMonth, 10) || (new Date().getMonth() + 1);
    return accessibleApprovedMotionTasks.filter(mt => {
      const dt = mt.approved_at || mt.apply_date || mt.updated_at || mt.created_at;
      const d = new Date(dt);
      return d.getFullYear() === currentY && (d.getMonth() + 1) === currentM;
    }).length;
  }, [accessibleApprovedMotionTasks, archiveYear, archiveMonth]);

  const thisWeekApprovedCount = useMemo(() => {
    const now = new Date();
    const currentWeek = getWeekOfMonth(now);
    const currentY = now.getFullYear();
    const currentM = now.getMonth() + 1;
    return accessibleApprovedMotionTasks.filter(mt => {
      const dt = mt.approved_at || mt.apply_date || mt.updated_at || mt.created_at;
      const d = new Date(dt);
      return d.getFullYear() === currentY && (d.getMonth() + 1) === currentM && getWeekOfMonth(dt) === currentWeek;
    }).length;
  }, [accessibleApprovedMotionTasks]);

  const latestApprovalDateFormatted = useMemo(() => {
    if (accessibleApprovedMotionTasks.length === 0) return '-';
    const sorted = [...accessibleApprovedMotionTasks].sort((a, b) => {
      const dateA = new Date(a.approved_at || a.apply_date || a.updated_at || a.created_at).getTime();
      const dateB = new Date(b.approved_at || b.apply_date || b.updated_at || b.created_at).getTime();
      return dateB - dateA;
    });
    const latestDate = sorted[0].approved_at || sorted[0].apply_date || sorted[0].updated_at || sorted[0].created_at;
    return formatDisplayDate(latestDate);
  }, [accessibleApprovedMotionTasks]);

  const availableArchiveYears = useMemo(() => {
    const years = new Set<string>();
    accessibleApprovedMotionTasks.forEach(mt => {
      const dt = mt.approved_at || mt.apply_date || mt.updated_at || mt.created_at;
      if (dt) years.add(new Date(dt).getFullYear().toString());
    });
    years.add(new Date().getFullYear().toString());
    return Array.from(years).sort().reverse();
  }, [accessibleApprovedMotionTasks]);

  const archiveUniquePics = useMemo(() => {
    return Array.from(new Set(accessibleApprovedMotionTasks.map(mt => {
      const pic = motionUsers.find(u => u.id === mt.motion_pic_id);
      return pic?.full_name || 'Unassigned';
    }))).sort();
  }, [accessibleApprovedMotionTasks, motionUsers]);

  const archiveUniqueClients = useMemo(() => {
    return Array.from(new Set(accessibleApprovedMotionTasks.map(mt => {
      return mt.parentTask?.client_name || allClients.find(c => c.id === mt.client_id)?.name || 'Unknown Client';
    }))).sort();
  }, [accessibleApprovedMotionTasks, allClients]);

  const archiveUniqueStudios = useMemo(() => {
    return Array.from(new Set(accessibleApprovedMotionTasks.map(mt => mt.studio).filter(Boolean))) as string[];
  }, [accessibleApprovedMotionTasks]);

  const archiveUniquePlatforms = useMemo(() => {
    return Array.from(new Set(accessibleApprovedMotionTasks.map(mt => mt.platform).filter(Boolean))) as string[];
  }, [accessibleApprovedMotionTasks]);

  const MONTH_NAMES_ID = useMemo(() => [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ], []);

  const MONTH_NAMES_SHORT = useMemo(() => [
    'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
    'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
  ], []);

  const currentArchiveMonthNum = parseInt(archiveMonth, 10) || (new Date().getMonth() + 1);
  const currentArchiveYearNum = parseInt(archiveYear, 10) || new Date().getFullYear();
  const daysInArchiveMonth = new Date(currentArchiveYearNum, currentArchiveMonthNum, 0).getDate();
  const currentMonthShort = MONTH_NAMES_SHORT[currentArchiveMonthNum - 1] || '';
  const currentMonthFullName = MONTH_NAMES_ID[currentArchiveMonthNum - 1] || '';

  // Dynamic 5 Week Columns for Selected Month & Year
  const archiveKanbanColumns = useMemo(() => [
    { week: 1, label: 'Week 1', dateRange: `1 - 7 ${currentMonthShort}` },
    { week: 2, label: 'Week 2', dateRange: `8 - 14 ${currentMonthShort}` },
    { week: 3, label: 'Week 3', dateRange: `15 - 21 ${currentMonthShort}` },
    { week: 4, label: 'Week 4', dateRange: `22 - 28 ${currentMonthShort}` },
    { week: 5, label: 'Week 5', dateRange: `29 - ${daysInArchiveMonth} ${currentMonthShort}` },
  ], [currentMonthShort, daysInArchiveMonth]);

  const archiveWeekOptions = useMemo(() => [
    { value: 'all', label: 'All Weeks' },
    { value: '1', label: `Week 1 (1 - 7 ${currentMonthShort})` },
    { value: '2', label: `Week 2 (8 - 14 ${currentMonthShort})` },
    { value: '3', label: `Week 3 (15 - 21 ${currentMonthShort})` },
    { value: '4', label: `Week 4 (22 - 28 ${currentMonthShort})` },
    { value: '5', label: `Week 5 (29 - ${daysInArchiveMonth} ${currentMonthShort})` },
  ], [currentMonthShort, daysInArchiveMonth]);

  const handlePrevMonth = () => {
    const currentM = parseInt(archiveMonth, 10);
    const currentY = parseInt(archiveYear, 10);
    if (isNaN(currentM) || isNaN(currentY)) {
      const now = new Date();
      setArchiveMonth(String(now.getMonth() + 1));
      setArchiveYear(String(now.getFullYear()));
      return;
    }
    if (currentM === 1) {
      setArchiveMonth('12');
      setArchiveYear(String(currentY - 1));
    } else {
      setArchiveMonth(String(currentM - 1));
    }
    setArchivePage(1);
  };

  const handleNextMonth = () => {
    const currentM = parseInt(archiveMonth, 10);
    const currentY = parseInt(archiveYear, 10);
    if (isNaN(currentM) || isNaN(currentY)) {
      const now = new Date();
      setArchiveMonth(String(now.getMonth() + 1));
      setArchiveYear(String(now.getFullYear()));
      return;
    }
    if (currentM === 12) {
      setArchiveMonth('1');
      setArchiveYear(String(currentY + 1));
    } else {
      setArchiveMonth(String(currentM + 1));
    }
    setArchivePage(1);
  };

  const handleCurrentMonth = () => {
    const now = new Date();
    setArchiveMonth(String(now.getMonth() + 1));
    setArchiveYear(String(now.getFullYear()));
    setArchiveWeek('all');
    setArchivePage(1);
  };

  const filteredArchiveMotionTasks = useMemo(() => {
    return accessibleApprovedMotionTasks.filter(mt => {
      const approvalDate = mt.approved_at || mt.apply_date || mt.updated_at || mt.created_at;
      const dateObj = new Date(approvalDate);
      const taskYear = dateObj.getFullYear().toString();
      const taskMonth = (dateObj.getMonth() + 1).toString();
      const taskWeek = getWeekOfMonth(approvalDate).toString();
      const clientName = mt.parentTask?.client_name || allClients.find(c => c.id === mt.client_id)?.name || 'Unknown Client';
      const picUser = motionUsers.find(u => u.id === mt.motion_pic_id);
      const motionPicName = picUser?.full_name || 'Unassigned';

      if (archiveYear !== 'all' && taskYear !== archiveYear) return false;
      if (archiveMonth !== 'all' && taskMonth !== archiveMonth) return false;
      if (archiveWeek !== 'all' && taskWeek !== archiveWeek) return false;
      if (archivePic !== 'all' && motionPicName !== archivePic) return false;
      if (archiveClient !== 'all' && clientName !== archiveClient) return false;
      if (archiveStudio !== 'all' && mt.studio !== archiveStudio) return false;
      if (archivePlatform !== 'all' && mt.platform !== archivePlatform) return false;

      if (archiveSearch.trim() !== '') {
        const q = archiveSearch.toLowerCase().trim();
        const codeMatch = (mt.parentTask?.task_code || (mt.id || '')).toLowerCase().includes(q);
        const nameMatch = (mt.parentTask?.campaign_name || mt.campaign_type || mt.motion_type || '').toLowerCase().includes(q);
        const clientMatch = clientName.toLowerCase().includes(q);
        const picMatch = motionPicName.toLowerCase().includes(q);
        const requesterMatch = (mt.parentTask?.created_by_name || '').toLowerCase().includes(q);
        const studioMatch = (mt.studio || '').toLowerCase().includes(q);
        const platformMatch = (mt.platform || '').toLowerCase().includes(q);
        if (!codeMatch && !nameMatch && !clientMatch && !picMatch && !requesterMatch && !studioMatch && !platformMatch) {
          return false;
        }
      }

      return true;
    });
  }, [accessibleApprovedMotionTasks, archiveYear, archiveMonth, archiveWeek, archivePic, archiveClient, archiveStudio, archivePlatform, archiveSearch, allClients, motionUsers]);

  const sortedArchiveMotionTasks = useMemo(() => {
    const list = [...filteredArchiveMotionTasks];
    list.sort((a, b) => {
      const dateA = new Date(a.approved_at || a.apply_date || a.updated_at || a.created_at).getTime();
      const dateB = new Date(b.approved_at || b.apply_date || b.updated_at || b.created_at).getTime();
      const reqDateA = new Date(a.parentTask?.req_date || a.created_at).getTime();
      const reqDateB = new Date(b.parentTask?.req_date || b.created_at).getTime();

      switch (archiveSort) {
        case 'approved_asc':
          return dateA - dateB;
        case 'req_date_desc':
          return reqDateB - reqDateA;
        case 'req_date_asc':
          return reqDateA - reqDateB;
        case 'code_asc': {
          const codeA = a.parentTask?.task_code || a.id || '';
          const codeB = b.parentTask?.task_code || b.id || '';
          return codeA.localeCompare(codeB);
        }
        case 'code_desc': {
          const codeA = a.parentTask?.task_code || a.id || '';
          const codeB = b.parentTask?.task_code || b.id || '';
          return codeB.localeCompare(codeA);
        }
        case 'approved_desc':
        default:
          return dateB - dateA;
      }
    });
    return list;
  }, [filteredArchiveMotionTasks, archiveSort]);

  const paginatedArchiveMotionTasks = useMemo(() => {
    const startIndex = (archivePage - 1) * archiveLimit;
    return sortedArchiveMotionTasks.slice(startIndex, startIndex + archiveLimit);
  }, [sortedArchiveMotionTasks, archivePage, archiveLimit]);

  const totalArchivePages = Math.ceil(sortedArchiveMotionTasks.length / archiveLimit) || 1;

  const isReadOnly = useMemo(() => {
    if (!user) return true;
    if (['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name)) return false;
    return user.role_name !== 'MOTION_PIC';
  }, [user]);


  if (!user) return null;

  const canMoveMotionTask = (mt: EnrichedMotionTask) => {
    if (!user || isReadOnly) return false;
    if (['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name)) return true;
    if (user.role_name === 'MOTION_PIC' && (!mt.motion_pic_id || mt.motion_pic_id === user.id)) return true;
    if (user.role_name === 'REQUESTER' && mt.parentTask?.created_by === user.id) return true;
    return false;
  };

  const handleDragStart = (e: React.DragEvent, mt: EnrichedMotionTask) => {
    if (!canMoveMotionTask(mt)) {
      e.preventDefault();
      return;
    }
    setDraggedMotionId(mt.id);
    e.dataTransfer.setData('text/plain', mt.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, targetStatus: MotionStatus | string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverMotionCol !== targetStatus) {
      setDragOverMotionCol(targetStatus);
    }
  };

  const handleDragLeave = (e: React.DragEvent, targetStatus: MotionStatus | string) => {
    if (dragOverMotionCol === targetStatus) {
      setDragOverMotionCol(null);
    }
  };

  const handleStatusChange = async (id: string, status: MotionStatus) => {
    if (!user) return;
    try {
      await updateMotionStatus(id, status, user.id);
      if (status === 'APPROVED' && quickFilter !== 'all') {
        setQuickFilter('all');
        updateUrlParams({ status: 'all' });
      }
      await refresh();
    } catch (err: any) {
      console.error('Error changing motion status:', err);
      alert(`Gagal mengubah status motion: ${err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err))}`);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetCol: MotionStatus | string) => {
    e.preventDefault();
    setDragOverMotionCol(null);
    const mId = e.dataTransfer.getData('text/plain') || draggedMotionId;
    setDraggedMotionId(null);

    if (!mId || !user) return;
    if (isReadOnly) {
      alert(`Mode Read-Only: Role ${user.role_name} tidak memiliki izin untuk memindahkan card pada Motion Pipeline.`);
      return;
    }
    const mt = motionTasks.find(t => t.id === mId);
    if (!mt) return;

    // Weekly Column Drop: Reschedule due date to target week
    if (['W1', 'W2', 'W3', 'W4'].includes(targetCol)) {
      if (!['ADMIN', 'TEAM_LEAD', 'MOTION_PIC', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name)) {
        alert('Hanya Admin, Team Lead, Requester, Strategic PIC, atau Motion Designer yang dapat mengubah jadwal mingguan.');
        return;
      }
      if (mt.status_motion !== 'APPROVED' && mt.status_motion !== 'COMPLETED') {
        alert('Hanya motion request yang telah di-approve yang dapat dijadwalkan ke kolom Weekly (W1 - W4). Pastikan request berstatus Approved terlebih dahulu.');
        return;
      }
      const now = new Date();
      const baseYear = now.getFullYear();
      const baseMonth = now.getMonth();
      let targetDay = 7;
      if (targetCol === 'W1') targetDay = 7;
      else if (targetCol === 'W2') targetDay = 14;
      else if (targetCol === 'W3') targetDay = 21;
      else if (targetCol === 'W4') {
        const lastDay = new Date(baseYear, baseMonth + 1, 0).getDate();
        targetDay = Math.min(28, lastDay);
      }

      const newDate = new Date(Date.UTC(baseYear, baseMonth, targetDay, 17, 0, 0));
      await updateMotionDueDate(mt.id, newDate.toISOString(), user.id);
      await refresh();
      return;
    }

    const targetStatus = targetCol as MotionStatus;
    if (mt.status_motion === targetStatus) return;

    const stageCheck = validateStageTransition('MOTION', mt.status_motion, targetStatus, {
      hasPic: Boolean(mt.motion_pic_id),
      userRole: user.role_name
    });

    if (!stageCheck.allowed) {
      alert(stageCheck.reason || 'Perpindahan tahapan tidak diizinkan.');
      return;
    }

    try {
      if (targetStatus === 'QUEUED') {
        if (!['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name)) {
          alert('Hanya Admin, Team Lead, Requester, atau Strategic PIC yang dapat mengembalikan status ke Queued.');
          return;
        }
        await handleStatusChange(mt.id, 'QUEUED');
      } else if (targetStatus === 'IN_PROGRESS') {
        if (!mt.motion_pic_id) {
          setShowAssign(mt.id, 'IN_PROGRESS');
          return;
        }
        if (!['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name) && mt.motion_pic_id !== user.id) {
          alert('Hanya Motion Designer yang ditugaskan, Requester, Strategic PIC, atau Lead yang dapat memulai pengerjaan motion.');
          return;
        }
        await handleStatusChange(mt.id, 'IN_PROGRESS');
      } else if (targetStatus === 'SUBMITTED') {
        if (!['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name) && mt.motion_pic_id !== user.id) {
          alert('Hanya Motion Designer yang ditugaskan, Requester, Strategic PIC, atau Lead yang dapat men-submit hasil motion.');
          return;
        }
        setShowSubmitModal({ taskId: mt.id, targetAfterSubmit: null });
      } else if (targetStatus === 'REVISION') {
        if (!['ADMIN', 'TEAM_LEAD', 'STRATEGIC_PIC', 'REQUESTER'].includes(user.role_name)) {
          alert('Hanya Requester, Strategic PIC, Team Lead, atau Admin yang dapat meminta revisi motion.');
          return;
        }
        setShowRevisionModal(mt.id);
      } else if (targetStatus === 'APPROVED') {
        if (!['ADMIN', 'TEAM_LEAD', 'STRATEGIC_PIC', 'REQUESTER'].includes(user.role_name)) {
          alert('Hanya Requester, Strategic PIC, Team Lead, atau Admin yang dapat menyetujui motion.');
          return;
        }
        await handleStatusChange(mt.id, 'APPROVED');
      } else if (targetStatus === 'COMPLETED') {
        if (!['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name)) {
          alert('Hanya Admin, Team Lead, Requester, atau Strategic PIC yang dapat melakukan handover/complete.');
          return;
        }
        setShowHandoverModal(mt.id);
      }
    } catch (err: any) {
      console.error('Error on motion drop transition:', err);
      const errMsg = err?.message || err?.details || (typeof err === 'object' ? JSON.stringify(err) : String(err));
      alert(`Gagal mengubah status: ${errMsg}`);
    }
  };

  // Unique available brands across clients and motion tasks
  const availableBrands = useMemo(() => {
    const brands = new Set<string>();
    allClients.forEach(c => {
      if (c.name) brands.add(c.name);
    });
    motionTasks.forEach(mt => {
      if (mt.parentTask?.client_name) brands.add(mt.parentTask.client_name);
    });
    return Array.from(brands).sort();
  }, [allClients, motionTasks]);

  const isMyAssignedMotion = useCallback((mt: EnrichedMotionTask) => {
    if (!user) return false;
    return mt.motion_pic_id === user.id || mt.operator_id === user.id;
  }, [user]);

  const getMotionDueDate = useCallback((mt: EnrichedMotionTask) => {
    return mt.parentTask?.due_date || mt.period_end || mt.production_date || mt.apply_date || null;
  }, []);

  const isMotionOverdueItem = useCallback((mt: EnrichedMotionTask) => {
    if (['COMPLETED', 'APPROVED'].includes(mt.status_motion)) return false;
    const dDate = getMotionDueDate(mt);
    return isTaskOverdue(dDate, mt.status_motion);
  }, [getMotionDueDate]);

  const isMotionNeedsReview = useCallback((mt: EnrichedMotionTask) => {
    return ['SUBMITTED', 'REVIEW', 'PENDING'].includes(mt.status_motion);
  }, []);

  const matchMotionSearch = useCallback((mt: EnrichedMotionTask) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const taskCode = (mt.parentTask?.task_code || mt.id || '').toLowerCase();
    const brand = (mt.parentTask?.client_name || allClients.find(c => c.id === mt.client_id)?.name || '').toLowerCase();
    const picUser = motionUsers.find(u => u.id === mt.motion_pic_id);
    const motionPic = (picUser?.full_name || '').toLowerCase();
    const creatorUser = mt.parentTask?.created_by ? allUsers.find(u => u.id === mt.parentTask?.created_by) : null;
    const creatorName = (creatorUser?.full_name || '').toLowerCase();
    const campaign = (mt.parentTask?.campaign_name || mt.campaign_type || '').toLowerCase();
    const studio = (mt.studio || '').toLowerCase();
    const platform = (mt.platform || '').toLowerCase();
    return taskCode.includes(q) || brand.includes(q) || motionPic.includes(q) || creatorName.includes(q) || campaign.includes(q) || studio.includes(q) || platform.includes(q);
  }, [searchQuery, allClients, motionUsers, allUsers]);

  // Scoped active motion tasks filtered by brand and text search
  const baseScopedMotionTasks = useMemo(() => {
    return motionTasks.filter(mt => {
      if (mt.is_archived === true) return false;
      const clientName = mt.parentTask?.client_name || allClients.find(c => c.id === mt.client_id)?.name || 'Unknown Client';
      const matchesBrand = selectedBrand === 'all' || clientName === selectedBrand;
      return matchMotionSearch(mt) && matchesBrand;
    });
  }, [motionTasks, matchMotionSearch, selectedBrand, allClients]);

  // Dynamic real-time counts for the 3 Quick Filter Chips
  const myAssignedCount = useMemo(() => {
    return baseScopedMotionTasks.filter(isMyAssignedMotion).length;
  }, [baseScopedMotionTasks, isMyAssignedMotion]);

  const overdueCount = useMemo(() => {
    return baseScopedMotionTasks.filter(isMotionOverdueItem).length;
  }, [baseScopedMotionTasks, isMotionOverdueItem]);

  const needsReviewCount = useMemo(() => {
    return baseScopedMotionTasks.filter(isMotionNeedsReview).length;
  }, [baseScopedMotionTasks, isMotionNeedsReview]);

  // Final filtered motion tasks combining text search, brand dropdown, and quick filter chips
  const filteredMotionTasks = useMemo(() => {
    if (quickFilter === 'my_tasks') {
      return baseScopedMotionTasks.filter(isMyAssignedMotion);
    }
    if (quickFilter === 'overdue') {
      return baseScopedMotionTasks.filter(isMotionOverdueItem);
    }
    if (quickFilter === 'needs_review') {
      return baseScopedMotionTasks.filter(isMotionNeedsReview);
    }
    return baseScopedMotionTasks;
  }, [baseScopedMotionTasks, quickFilter, isMyAssignedMotion, isMotionOverdueItem, isMotionNeedsReview]);

  // Weekly Partition helpers for Active Motion Tasks
  const activeWeeklyYear = useMemo(() => new Date().getFullYear(), []);
  const activeWeeklyMonth = useMemo(() => new Date().getMonth() + 1, []);

  const weeklyPartitions = useMemo(() => {
    return getWeeklyPartitionsForMonth(activeWeeklyYear, activeWeeklyMonth);
  }, [activeWeeklyYear, activeWeeklyMonth]);

  const pastOverdueMotionTasks = useMemo(() => {
    return filteredMotionTasks.filter(mt => {
      const dDate = getMotionDueDate(mt);
      if (!dDate) return false;
      if (['COMPLETED', 'APPROVED'].includes(mt.status_motion)) return false;
      const parts = dDate.split('T')[0].split('-');
      if (parts.length < 3) return false;
      const tYear = parseInt(parts[0], 10);
      const tMonth = parseInt(parts[1], 10);
      if (tYear < activeWeeklyYear || (tYear === activeWeeklyYear && tMonth < activeWeeklyMonth)) {
        return true;
      }
      return false;
    });
  }, [filteredMotionTasks, getMotionDueDate, activeWeeklyYear, activeWeeklyMonth]);

  const getWeeklyMotionTasksForPartition = useCallback((partitionKey: WeekPartitionKey) => {
    return filteredMotionTasks.filter(mt => {
      // Hanya untuk request yang telah di-approve
      if (mt.status_motion !== 'APPROVED' && mt.status_motion !== 'COMPLETED') {
        return false;
      }
      const dDate = getMotionDueDate(mt);
      const part = getDueWeekPartition(dDate);
      if (partitionKey === 'NO_DUE_DATE') {
        return part === 'NO_DUE_DATE';
      }
      if (part !== partitionKey) return false;

      if (dDate) {
        const parts = dDate.split('T')[0].split('-');
        if (parts.length >= 2) {
          const tYear = parseInt(parts[0], 10);
          const tMonth = parseInt(parts[1], 10);
          return tYear === activeWeeklyYear && tMonth === activeWeeklyMonth;
        }
      }
      return true;
    });
  }, [filteredMotionTasks, getMotionDueDate, activeWeeklyYear, activeWeeklyMonth]);

  // Horizontal Scroll & Column Navigation for Motion Kanban
  const kanbanScroll = useKanbanScroll({
    storageKey: 'cmos_motion_kanban_width_mode',
    defaultWidthMode: 'normal',
  });

  const kanbanColumnInfos = useMemo(() => {
    return MOTION_KANBAN_COLUMNS.map(col => {
      const isWeekly = Boolean(col.isWeekly);
      const colTasks = filteredMotionTasks.filter(mt => {
        if (isWeekly) {
          // Hanya untuk request yang telah di-approve
          if (mt.status_motion !== 'APPROVED' && mt.status_motion !== 'COMPLETED') {
            return false;
          }
          const dateStr = mt.due_date || mt.parentTask?.due_date || mt.created_at;
          if (!dateStr) return false;
          const d = new Date(dateStr);
          if (isNaN(d.getTime())) return false;
          if (d.getFullYear() !== activeWeeklyYear || (d.getMonth() + 1) !== activeWeeklyMonth) {
            return false;
          }
          const day = d.getDate();
          if (col.status === 'W1') return day >= 1 && day <= 7;
          if (col.status === 'W2') return day >= 8 && day <= 14;
          if (col.status === 'W3') return day >= 15 && day <= 21;
          if (col.status === 'W4') return day >= 22;
          return false;
        }
        return mt.status_motion === col.status;
      });
      return {
        status: col.status,
        label: col.label,
        color: col.color,
        count: colTasks.length,
      };
    });
  }, [filteredMotionTasks, activeWeeklyYear, activeWeeklyMonth]);

  // Sorted list for active table view
  const sortedMotionTasks = [...filteredMotionTasks].sort((a, b) => {
    let comparison = 0;
    if (sortField === 'id') {
      const idA = a.parentTask?.task_code || a.id;
      const idB = b.parentTask?.task_code || b.id;
      comparison = idA.localeCompare(idB);
    } else if (sortField === 'client') {
      const clientA = a.parentTask?.client_name || allClients.find(c => c.id === a.client_id)?.name || '';
      const clientB = b.parentTask?.client_name || allClients.find(c => c.id === b.client_id)?.name || '';
      comparison = clientA.localeCompare(clientB);
    } else if (sortField === 'campaign') {
      const cA = a.parentTask?.campaign_name || a.campaign_type || '';
      const cB = b.parentTask?.campaign_name || b.campaign_type || '';
      comparison = cA.localeCompare(cB);
    } else if (sortField === 'status') {
      comparison = a.status_motion.localeCompare(b.status_motion);
    } else if (sortField === 'date') {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      comparison = dateA - dateB;
    }
    return sortAsc ? comparison : -comparison;
  });

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedBrand('all');
    setQuickFilter('all');
    updateUrlParams({ q: '', brand: 'all', status: 'all' });
  };

  return (
    <div className="space-y-5">
      {/* Top Header & Section Navigation */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[var(--border-secondary)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--bg-card)] border border-[var(--border-primary)] shadow-xs shrink-0">
            <Film className="w-5 h-5 text-pink-500" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-[var(--text-primary)]">
                Motion Graphics Pipeline
              </h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-secondary)] shadow-xs">
                {mainTab === 'active' 
                  ? `${activeMotionTasksCount} Active` 
                  : `${approvedMotionTasksCount} Approved`}
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Alur produksi animasi, video promosi & visual bergerak terintegrasi dengan handover desain.
            </p>
          </div>
        </div>

        {/* Section Switcher Navigation & Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* Section Switcher: Active Pipeline vs Approved Archive */}
          <div className="flex items-center p-1 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl shadow-xs">
            <button
              onClick={() => setMainTab('active')}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                mainTab === 'active'
                  ? 'bg-pink-600 text-white shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Active Pipeline</span>
            </button>

            <button
              onClick={() => setMainTab('archive')}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                mainTab === 'archive'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
              }`}
            >
              <FolderCheck className="w-3.5 h-3.5" />
              <span>Approved Archive</span>
            </button>
          </div>

          {mainTab === 'active' && (
            <>
              {/* View Mode Toggle: Kanban | Weekly | Table */}
              <div className="flex items-center bg-[var(--bg-secondary)] p-0.5 rounded-lg border border-[var(--border-primary)] shadow-xs">
                <button
                  type="button"
                  onClick={() => setViewMode('kanban')}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md transition-all ${
                    viewMode === 'kanban'
                      ? 'bg-pink-600 text-white shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                  title="Kanban Board View"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Kanban</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('weekly')}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md transition-all ${
                    viewMode === 'weekly'
                      ? 'bg-pink-600 text-white shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                  title="Weekly Partition View (W1-W4)"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Weekly</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md transition-all ${
                    viewMode === 'table'
                      ? 'bg-pink-600 text-white shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                  title="Table View"
                >
                  <List className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Table</span>
                </button>
              </div>

              {/* Refresh Button */}
              <button
                type="button"
                onClick={refresh}
                className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-primary)] transition-colors shadow-xs"
                title="Refresh Data"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>

              {/* Create Request Button */}
              {['ADMIN', 'TEAM_LEAD', 'MOTION_PIC', 'REQUESTER'].includes(user.role_name) && (
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 h-[34px] rounded-lg text-xs font-semibold bg-pink-600 text-white hover:bg-pink-700 transition-colors shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Request</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ================= 1. ACTIVE PIPELINE VIEW ================= */}
      {mainTab === 'active' && (
        <div className="space-y-4">

          {/* Read-Only Mode Banner */}
          {isReadOnly && (
            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400 text-xs font-semibold shadow-sm animate-fade-in">
              <Eye className="w-4 h-4 shrink-0 text-amber-400" />
              <span>
                Mode Read-Only: Anda sedang memantau Motion Graphics Pipeline dalam mode pantau (view-only). Pengelolaan pengerjaan dan perubahan status hanya dapat dilakukan oleh Tim Motion.
              </span>
            </div>
          )}

          {/* Filter Bar (Stitch Design Specification) */}
          <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-3 p-3 bg-[var(--bg-card)] rounded-xl border border-[var(--border-primary)] shadow-sm mb-6">
            {/* Sisi Kiri: Search Input & Brand Dropdown */}
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 flex-1 min-w-[280px]">
              {/* Text Search Bar */}
              <div className="relative flex items-center flex-1 max-w-md min-w-[220px]">
                {!searchQuery && (
                  <Search className="absolute left-3.5 w-4 h-4 text-[var(--text-muted)] pointer-events-none transition-opacity duration-150" />
                )}
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Filter task code (REQ-...), brand, PIC..."
                  style={{
                    paddingLeft: searchQuery ? '14px' : '38px',
                    paddingRight: searchQuery ? '32px' : '12px',
                  }}
                  className="h-[34px] w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-pink)] transition-all"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => handleSearchChange('')}
                    className="absolute right-2.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                    title="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Brand Dropdown */}
              <div className="relative flex items-center h-[34px] px-3 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg hover:border-[var(--border-secondary)] transition-colors">
                <span className="text-[var(--text-muted)] uppercase font-semibold text-[11px] mr-2 shrink-0">BRAND:</span>
                <select
                  value={selectedBrand}
                  onChange={(e) => handleBrandChange(e.target.value)}
                  className="bg-transparent text-[var(--text-primary)] font-medium text-xs focus:outline-none cursor-pointer pr-5 appearance-none"
                >
                  <option value="all" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">All Brands</option>
                  {availableBrands.map((b) => (
                    <option key={b} value={b} className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">
                      {b}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)] pointer-events-none absolute right-2.5" />
              </div>
            </div>

            {/* Sisi Kanan: Quick Filter Chips */}
            <div className="flex items-center gap-2 shrink-0">
              {/* My Assigned Tasks */}
              <button
                type="button"
                onClick={() => handleQuickFilterToggle('my_tasks')}
                className={`h-[30px] px-3 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                  quickFilter === 'my_tasks'
                    ? 'bg-pink-500/20 border border-pink-500 text-pink-400 font-semibold shadow-sm'
                    : 'bg-[var(--bg-secondary)] border border-[var(--border-primary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span>My Assigned Tasks ({myAssignedCount})</span>
              </button>

              {/* Overdue Tasks */}
              <button
                type="button"
                onClick={() => handleQuickFilterToggle('overdue')}
                className={`h-[30px] px-3 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                  quickFilter === 'overdue'
                    ? 'bg-red-950/80 border border-red-500 text-red-400 font-semibold shadow-sm'
                    : 'bg-[var(--bg-secondary)] border border-[var(--border-primary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                <span>• Overdue ({overdueCount})</span>
              </button>

              {/* Needs Review */}
              <button
                type="button"
                onClick={() => handleQuickFilterToggle('needs_review')}
                className={`h-[30px] px-3 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                  quickFilter === 'needs_review'
                    ? 'bg-amber-500/20 border border-amber-500 text-amber-400 font-semibold shadow-sm'
                    : 'bg-[var(--bg-secondary)] border border-[var(--border-primary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span>Needs Review ({needsReviewCount})</span>
              </button>
            </div>
          </div>

          {/* VIEW MODE 1: KANBAN BOARD VIEW */}
          {viewMode === 'kanban' && (
            <div className="space-y-2">
              <KanbanScrollToolbar
                columns={kanbanColumnInfos}
                canScrollLeft={kanbanScroll.canScrollLeft}
                canScrollRight={kanbanScroll.canScrollRight}
                onScrollLeft={kanbanScroll.scrollLeft}
                onScrollRight={kanbanScroll.scrollRight}
                onScrollToColumn={kanbanScroll.scrollToColumn}
                columnWidthMode={kanbanScroll.columnWidthMode}
                onToggleWidthMode={kanbanScroll.toggleWidthMode}
              />

              <div className="relative group">
                <KanbanFloatingArrows
                  canScrollLeft={kanbanScroll.canScrollLeft}
                  canScrollRight={kanbanScroll.canScrollRight}
                  onScrollLeft={kanbanScroll.scrollLeft}
                  onScrollRight={kanbanScroll.scrollRight}
                />

                <div 
                  ref={kanbanScroll.containerRef}
                  onWheel={kanbanScroll.handleWheel}
                  className="kanban-scroll-container pb-6 cursor-default" 
                  style={{ minHeight: 520 }}
                >
                  {MOTION_KANBAN_COLUMNS.map((col, colIdx) => {
                    const isWeekly = Boolean(col.isWeekly);
                    const colTasks = filteredMotionTasks.filter(mt => {
                      if (isWeekly) {
                        // Hanya untuk request yang telah di-approve
                        if (mt.status_motion !== 'APPROVED' && mt.status_motion !== 'COMPLETED') {
                          return false;
                        }
                        const dateStr = mt.due_date || mt.parentTask?.due_date || mt.created_at;
                        if (!dateStr) return false;
                        const d = new Date(dateStr);
                        if (isNaN(d.getTime())) return false;
                        if (d.getFullYear() !== activeWeeklyYear || (d.getMonth() + 1) !== activeWeeklyMonth) {
                          return false;
                        }
                        const day = d.getDate();
                        if (col.status === 'W1') return day >= 1 && day <= 7;
                        if (col.status === 'W2') return day >= 8 && day <= 14;
                        if (col.status === 'W3') return day >= 15 && day <= 21;
                        if (col.status === 'W4') return day >= 22;
                        return false;
                      }
                      return mt.status_motion === col.status;
                    });
                    const isTargetOver = dragOverMotionCol === col.status;
                    return (
                      <div 
                        key={col.status || colIdx} 
                        data-column-status={col.status}
                        onDragOver={(e) => handleDragOver(e, col.status)}
                        onDragLeave={(e) => handleDragLeave(e, col.status)}
                        onDrop={(e) => handleDrop(e, col.status)}
                        className={`kanban-column flex-shrink-0 ${
                          kanbanScroll.columnWidthMode === 'compact' ? 'w-[260px]' : 'w-[320px]'
                        } scroll-snap-align-start transition-all duration-200 flex flex-col ${
                          isTargetOver ? 'ring-2 ring-[var(--accent-pink)] bg-[var(--bg-tertiary)]/60 shadow-lg scale-[1.01]' : ''
                        } ${isWeekly ? 'border-l-2 border-l-purple-500/30' : ''}`}
                      >
                        <div className="p-4 flex items-center justify-between border-b border-[var(--border-secondary)]">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ background: col.color, boxShadow: `0 0 8px ${col.color}` }} />
                            <span className="text-sm font-bold text-[var(--text-primary)]">{col.label}</span>
                            {isWeekly && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-purple-500/10 text-purple-300 border border-purple-500/20">
                                Weekly (Approved)
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {(col.status === 'APPROVED' || col.status === 'COMPLETED') && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMainTab('archive');
                                }}
                                className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 hover:underline transition-all cursor-pointer"
                                title="Buka Halaman Arsip Terpusat"
                              >
                                <span>Arsip</span>
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            )}
                            <span className="text-xs px-2.5 py-0.5 rounded-md font-semibold bg-[var(--bg-card)] border border-[var(--border-primary)] text-[var(--text-secondary)]">
                              {colTasks.length}
                            </span>
                          </div>
                        </div>
                        <div className={`p-3 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3 transition-colors ${isTargetOver ? 'bg-[var(--accent-pink)]/5' : ''}`}>
                          {colTasks.length === 0 && (
                            <div className={`empty-state mt-4 p-6 rounded-xl transition-all ${
                              isTargetOver ? 'border-2 border-dashed border-[var(--accent-pink)] bg-[var(--accent-pink)]/10' : ''
                            }`}>
                              <Film className="w-8 h-8" style={{ color: isTargetOver ? 'var(--accent-pink)' : 'var(--border-primary)' }} />
                              <p className="text-xs font-medium mt-2" style={{ color: isTargetOver ? 'var(--accent-pink)' : 'var(--text-muted)' }}>
                                {isTargetOver 
                                  ? (isWeekly ? 'Lepas di sini untuk menjadwalkan ke minggu ini' : 'Lepas di sini untuk pindah status')
                                  : (isWeekly ? 'Tidak ada task approved pada minggu ini' : 'Antrean Kosong')}
                              </p>
                            </div>
                          )}
                          {colTasks.map((mt) => {
                            const isMovable = !isReadOnly && canMoveMotionTask(mt);
                            const isBeingDragged = draggedMotionId === mt.id;
                            const clientName = mt.parentTask?.client_name || allClients.find(c => c.id === mt.client_id)?.name || 'Unknown Client';
                            const picUser = motionUsers.find(u => u.id === mt.motion_pic_id);

                            return (
                              <MotionKanbanCard
                                key={mt.id}
                                mt={mt}
                                isMovable={isMovable}
                                isBeingDragged={isBeingDragged}
                                isReadOnly={isReadOnly}
                                clientName={clientName}
                                picUser={picUser}
                                user={user}
                                onDragStart={(e) => handleDragStart(e, mt)}
                                onDragEnd={() => { setDraggedMotionId(null); setDragOverMotionCol(null); }}
                                onClick={() => setShowDetail(mt)}
                                onEdit={(id) => setShowEditModal(id)}
                                onAssign={(id) => setShowAssign(id)}
                                onStatusChange={(id, newStatus) => handleStatusChange(id, newStatus)}
                                onSubmit={(id) => setShowSubmitModal(id)}
                                onRevision={(id) => setShowRevisionModal(id)}
                                onHandover={(id) => setShowHandoverModal(id)}
                                onUndo={(id, prevStatus) => handleStatusChange(id, prevStatus)}
                                onDelete={handleDeleteMotionTask}
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* VIEW MODE: WEEKLY PARTITION VIEW (W1 - W4 & NO DUE DATE) */}
          {viewMode === 'weekly' && (
            <div className="space-y-4">
              {/* Overdue Past Notice if motion tasks from prior months are overdue */}
              {pastOverdueMotionTasks.length > 0 && (
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs shadow-sm">
                  <div className="flex items-center gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>
                      <strong>Perhatian:</strong> Terdapat <strong>{pastOverdueMotionTasks.length} motion task aktif terlambat</strong> dengan tenggat waktu bulan sebelumnya yang belum selesai.
                    </span>
                  </div>
                  <span className="text-[11px] font-mono bg-rose-500/20 text-rose-200 px-2 py-0.5 rounded-md">
                    Overdue Lampau
                  </span>
                </div>
              )}

              <div className="kanban-board-wrapper" style={{ minHeight: 520 }}>
                {/* Past Overdue Column if any */}
                {pastOverdueMotionTasks.length > 0 && (
                  <div className="kanban-column flex-shrink-0 w-[320px] scroll-snap-align-start flex flex-col rounded-2xl border border-rose-500/30 bg-[var(--bg-card)] shadow-sm overflow-hidden">
                    <div className="p-4 flex items-center justify-between border-b border-rose-500/20 bg-rose-950/20">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-400" />
                        <div>
                          <h4 className="text-sm font-bold text-rose-300">Overdue Lampau</h4>
                          <p className="text-[11px] text-rose-400/80">Deadline Sebelum Bulan Ini</p>
                        </div>
                      </div>
                      <span className="text-xs px-2.5 py-0.5 rounded-md font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        {pastOverdueMotionTasks.length}
                      </span>
                    </div>
                    <div className="p-3 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3">
                      {pastOverdueMotionTasks.map(mt => {
                        const clientName = mt.parentTask?.client_name || allClients.find(c => c.id === mt.client_id)?.name || 'Unknown Client';
                        const picUser = motionUsers.find(u => u.id === mt.motion_pic_id);
                        return (
                          <MotionKanbanCard
                            key={mt.id}
                            mt={mt}
                            isMovable={false}
                            isBeingDragged={false}
                            isArchive={false}
                            isReadOnly={isReadOnly}
                            clientName={clientName}
                            picUser={picUser}
                            user={user}
                            onClick={() => { setShowDetail(mt); setDetailInitialTab('details'); }}
                            onEdit={(id) => setShowEditModal(id)}
                            onAssign={(id) => setShowAssign(id)}
                            onStatusChange={(id, status) => handleStatusChange(id, status)}
                            onSubmit={(id) => setShowSubmitModal(id)}
                            onRevision={(id) => setShowRevisionModal(id)}
                            onHandover={(id) => setShowHandoverModal(id)}
                            onUndo={(id, prevStatus) => handleStatusChange(id, prevStatus)}
                            onRestore={handleRestoreMotionTask}
                            onDelete={handleDeleteMotionTask}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Standard Weekly Partitions: W1, W2, W3, W4, NO_DUE_DATE */}
                {weeklyPartitions.map(col => {
                  const colTasks = getWeeklyMotionTasksForPartition(col.key);
                  const overdueCount = colTasks.filter(mt => {
                    const dDate = getMotionDueDate(mt);
                    return isTaskOverdue(dDate, mt.status_motion);
                  }).length;

                  return (
                    <div
                      key={col.key}
                      className="kanban-column flex-shrink-0 w-[320px] scroll-snap-align-start flex flex-col rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-card)] shadow-sm overflow-hidden"
                    >
                      <div className="p-4 flex items-center justify-between border-b border-[var(--border-secondary)] bg-[var(--bg-secondary)]">
                        <div>
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-pink-400" />
                            <span className="text-sm font-bold text-[var(--text-primary)]">{col.title}</span>
                          </div>
                          <p className="text-[11px] font-medium text-[var(--text-muted)] mt-0.5">
                            {col.dateRange}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {overdueCount > 0 && (
                            <span className="text-[10px] font-semibold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20" title={`${overdueCount} motion task terlambat`}>
                              {overdueCount} Overdue
                            </span>
                          )}
                          <span className="text-xs px-2.5 py-0.5 rounded-md font-semibold bg-[var(--bg-card)] border border-[var(--border-primary)] text-[var(--text-secondary)]">
                            {colTasks.length}
                          </span>
                        </div>
                      </div>

                      <div className="p-3 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3">
                        {colTasks.length === 0 ? (
                          <div className="empty-state mt-4 p-6 rounded-xl border border-dashed border-[var(--border-secondary)] bg-[var(--bg-secondary)]/30 text-[var(--text-muted)]">
                            <Calendar className="w-8 h-8 opacity-30 mx-auto mb-2" />
                            <p className="text-xs font-semibold text-[var(--text-secondary)]">Antrean Kosong</p>
                            <p className="text-[11px] opacity-70 mt-0.5">Tidak ada motion card pada {col.label}</p>
                          </div>
                        ) : (
                          colTasks.map(mt => {
                            const clientName = mt.parentTask?.client_name || allClients.find(c => c.id === mt.client_id)?.name || 'Unknown Client';
                            const picUser = motionUsers.find(u => u.id === mt.motion_pic_id);
                            return (
                              <MotionKanbanCard
                                key={mt.id}
                                mt={mt}
                                isMovable={false}
                                isBeingDragged={false}
                                isArchive={false}
                                isReadOnly={isReadOnly}
                                clientName={clientName}
                                picUser={picUser}
                                user={user}
                                onClick={() => { setShowDetail(mt); setDetailInitialTab('details'); }}
                                onEdit={(id) => setShowEditModal(id)}
                                onAssign={(id) => setShowAssign(id)}
                                onStatusChange={(id, status) => handleStatusChange(id, status)}
                                onSubmit={(id) => setShowSubmitModal(id)}
                                onRevision={(id) => setShowRevisionModal(id)}
                                onHandover={(id) => setShowHandoverModal(id)}
                                onUndo={(id, prevStatus) => handleStatusChange(id, prevStatus)}
                                onRestore={handleRestoreMotionTask}
                                onDelete={handleDeleteMotionTask}
                              />
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* VIEW MODE 2: TABLE / LIST VIEW */}
          {viewMode === 'table' && (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th onClick={() => { setSortField('id'); setSortAsc(!sortAsc); }} className="cursor-pointer">
                      <div className="flex items-center gap-1.5">
                        Kode Tiket <ArrowUpDown className="w-3 h-3 opacity-50" />
                      </div>
                    </th>
                    <th onClick={() => { setSortField('client'); setSortAsc(!sortAsc); }} className="cursor-pointer">
                      <div className="flex items-center gap-1.5">
                        Client / Brand <ArrowUpDown className="w-3 h-3 opacity-50" />
                      </div>
                    </th>
                    <th onClick={() => { setSortField('campaign'); setSortAsc(!sortAsc); }} className="cursor-pointer">
                      <div className="flex items-center gap-1.5">
                        Campaign / Type <ArrowUpDown className="w-3 h-3 opacity-50" />
                      </div>
                    </th>
                    <th>Platform &amp; Studio</th>
                    <th>Motion PIC</th>
                    <th>Level</th>
                    <th onClick={() => { setSortField('status'); setSortAsc(!sortAsc); }} className="cursor-pointer">
                      <div className="flex items-center gap-1.5">
                        Status <ArrowUpDown className="w-3 h-3 opacity-50" />
                      </div>
                    </th>
                    <th>Revisi</th>
                    <th onClick={() => { setSortField('date'); setSortAsc(!sortAsc); }} className="cursor-pointer">
                      <div className="flex items-center gap-1.5">
                        Jadwal / Tanggal <ArrowUpDown className="w-3 h-3 opacity-50" />
                      </div>
                    </th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={10} className="text-center py-10 text-xs text-[var(--text-muted)]">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-pink-500" />
                        Memuat data motion pipeline...
                      </td>
                    </tr>
                  ) : sortedMotionTasks.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="text-center py-10 text-xs text-[var(--text-muted)]">
                        Tidak ada tiket motion yang sesuai dengan filter.
                      </td>
                    </tr>
                  ) : (
                    sortedMotionTasks.map((mt) => {
                      const clientName = mt.parentTask?.client_name || allClients.find(c => c.id === mt.client_id)?.name || 'Unknown Client';
                      const picUser = motionUsers.find(u => u.id === mt.motion_pic_id);

                      return (
                        <tr 
                          key={mt.id} 
                          onClick={() => setShowDetail(mt)} 
                          className="cursor-pointer hover:bg-[var(--bg-tertiary)]/50 transition-colors"
                        >
                          <td className="font-mono text-xs font-bold text-[var(--accent-pink)]">
                            {mt.parentTask?.task_code || (mt.id || '').substring(0, 10).toUpperCase()}
                          </td>
                          <td className="font-semibold text-xs text-[var(--text-primary)]">
                            {clientName}
                          </td>
                          <td className="text-xs text-[var(--text-secondary)]">
                            <div className="font-medium text-[var(--text-primary)]">
                              {mt.parentTask?.campaign_name || mt.campaign_type || 'Standalone Motion'}
                            </div>
                            {mt.motion_type && (
                              <div className="text-[11px] text-[var(--text-muted)] truncate max-w-[150px]">
                                {mt.motion_type}
                              </div>
                            )}
                          </td>
                          <td>
                            <div className="flex items-center gap-1 flex-wrap">
                              {mt.platform && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] text-[var(--text-secondary)]">
                                  {mt.platform}
                                </span>
                              )}
                              {mt.studio && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-pink-500/10 text-pink-400 border border-pink-500/20">
                                  {mt.studio}
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            <span className="text-xs font-medium text-[var(--text-primary)]">
                              {picUser?.full_name || '—'}
                            </span>
                          </td>
                          <td>
                            <span className="badge text-[10px] py-0 px-1.5 bg-purple-500/20 text-purple-300 border-purple-500/30">
                              {MOTION_DIFFICULTY_LABELS[mt.motion_difficulty]}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${MOTION_STATUS_COLORS[mt.status_motion]}`}>
                              {MOTION_STATUS_LABELS[mt.status_motion]}
                            </span>
                          </td>
                          <td>
                            {mt.motion_revision_count > 0 ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                Rev #{mt.motion_revision_count}
                              </span>
                            ) : (
                              <span className="text-[11px] text-[var(--text-muted)]">0</span>
                            )}
                          </td>
                          <td className="text-xs text-[var(--text-muted)]">
                            {mt.production_date ? formatDisplayDate(mt.production_date) : formatDisplayDate(mt.created_at)}
                          </td>
                          <td className="text-right" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => setShowDetail(mt)}
                              className="btn-ghost p-1.5 rounded-lg text-blue-500 hover:bg-blue-500/10"
                              title="Lihat Detail & Chat"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ================= 2. APPROVED ARCHIVE VIEW ================= */}
      {mainTab === 'archive' && (
        <div className="space-y-5">
          {/* 1. Summary KPI Cards (4 Cards Grid) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Approved */}
            <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] p-4 rounded-xl shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Total Approved</p>
                  <h3 className="text-2xl font-black text-emerald-400 mt-1">{accessibleApprovedMotionTasks.length}</h3>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] mt-2 flex items-center gap-1">
                <FolderCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Seluruh arsip motion disetujui</span>
              </p>
            </div>

            {/* This Month */}
            <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] p-4 rounded-xl shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">This Month</p>
                  <h3 className="text-2xl font-black text-pink-400 mt-1">{thisMonthApprovedCount}</h3>
                </div>
                <div className="w-10 h-10 rounded-xl bg-pink-500/10 text-pink-400 border border-pink-500/20 flex items-center justify-center">
                  <Calendar className="w-5 h-5" />
                </div>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] mt-2 truncate">
                {currentMonthFullName} {archiveYear}
              </p>
            </div>

            {/* This Week */}
            <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] p-4 rounded-xl shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">This Week</p>
                  <h3 className="text-2xl font-black text-purple-400 mt-1">{thisWeekApprovedCount}</h3>
                </div>
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center">
                  <Layers className="w-5 h-5" />
                </div>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] mt-2">Minggu aktif berjalan</p>
            </div>

            {/* Latest Approval */}
            <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] p-4 rounded-xl shadow-sm">
              <div className="flex items-center justify-between">
                <div className="truncate pr-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Latest Approval</p>
                  <h3 className="text-base font-bold text-amber-400 mt-1 truncate">{latestApprovalDateFormatted}</h3>
                </div>
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] mt-2">Persetujuan terbaru</p>
            </div>
          </div>

          {/* 2. Period Navigation & View Mode Switcher */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-3.5 bg-[var(--bg-card)] rounded-xl border border-[var(--border-primary)] shadow-sm">
            {/* Period Navigation Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrevMonth}
                className="btn-outline h-9 px-3 rounded-lg flex items-center gap-1.5 text-xs font-semibold hover:border-emerald-500/50"
                title="Bulan Sebelumnya"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Previous Month</span>
              </button>

              <div className="flex items-center px-4 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg min-w-[160px] justify-center text-center">
                <span className="text-sm font-bold text-[var(--text-primary)]">
                  {currentMonthFullName} {archiveYear}
                </span>
              </div>

              <button
                onClick={handleNextMonth}
                className="btn-outline h-9 px-3 rounded-lg flex items-center gap-1.5 text-xs font-semibold hover:border-emerald-500/50"
                title="Bulan Berikutnya"
              >
                <span className="hidden sm:inline">Next Month</span>
                <ChevronRight className="w-4 h-4" />
              </button>

              {(archiveYear !== String(new Date().getFullYear()) || archiveMonth !== String(new Date().getMonth() + 1)) && (
                <button
                  onClick={handleCurrentMonth}
                  className="btn-ghost text-xs px-2.5 h-9 text-emerald-400 hover:bg-emerald-500/10 rounded-lg font-medium"
                  title="Kembali ke Bulan Sekarang"
                >
                  Bulan Ini
                </button>
              )}
            </div>

            {/* View Toggle (Kanban vs Table) */}
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
              <div className="flex items-center p-1 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg shadow-sm">
                <button
                  onClick={() => setArchiveViewMode('kanban')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                    archiveViewMode === 'kanban'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Kanban</span>
                </button>
                <button
                  onClick={() => setArchiveViewMode('table')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                    archiveViewMode === 'table'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                  <span>Table</span>
                </button>
              </div>
            </div>
          </div>

          {/* 3. Combined Filter Toolbar */}
          <div className="bg-[var(--bg-card)] p-4 rounded-xl border border-[var(--border-primary)] shadow-sm flex flex-col gap-4">
            {/* Top Row: Search & Export */}
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
              <div className="relative flex-1">
                {!archiveSearch && (
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none transition-opacity duration-150" />
                )}
                <input
                  type="text"
                  className="input w-full transition-all"
                  placeholder="Search Motion (Kode, Brand, Campaign, PIC, Studio, Platform)..."
                  value={archiveSearch}
                  onChange={(e) => {
                    setArchiveSearch(e.target.value);
                    setArchivePage(1);
                  }}
                  style={{
                    paddingLeft: archiveSearch ? '14px' : '38px',
                    paddingRight: archiveSearch ? '32px' : '12px',
                  }}
                />
                {archiveSearch && (
                  <button
                    onClick={() => { setArchiveSearch(''); setArchivePage(1); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                    title="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Export & Reset Actions */}
              <div className="flex items-center gap-2 shrink-0">
                {(archiveWeek !== 'all' || archivePic !== 'all' || archiveClient !== 'all' || archiveStudio !== 'all' || archivePlatform !== 'all' || archiveSearch !== '' || archiveSort !== 'approved_desc') && (
                  <button
                    onClick={() => {
                      setArchiveWeek('all');
                      setArchivePic('all');
                      setArchiveClient('all');
                      setArchiveStudio('all');
                      setArchivePlatform('all');
                      setArchiveSearch('');
                      setArchiveSort('approved_desc');
                      setArchivePage(1);
                    }}
                    className="btn-ghost text-xs px-3 h-10 rounded-lg flex items-center gap-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-secondary)]"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Filter</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    downloadCSV(sortedArchiveMotionTasks.map(mt => ({
                      'Kode Tiket': mt.parentTask?.task_code || (mt.id || '').substring(0, 10).toUpperCase(),
                      'Brand / Klien': mt.parentTask?.client_name || allClients.find(c => c.id === mt.client_id)?.name || 'Unknown Client',
                      'Nama Campaign': mt.parentTask?.campaign_name || mt.campaign_type || 'Standalone Motion',
                      'Motion Type': mt.motion_type || '-',
                      'Platform': mt.platform || '-',
                      'Studio': mt.studio || '-',
                      'Motion PIC': motionUsers.find(u => u.id === mt.motion_pic_id)?.full_name || 'Unassigned',
                      'Level': MOTION_DIFFICULTY_LABELS[mt.motion_difficulty] || mt.motion_difficulty,
                      'Status': mt.status_motion,
                      'Revisi': mt.motion_revision_count || 0,
                      'Tgl Produksi': formatDisplayDate(mt.production_date || mt.created_at),
                      'Tgl Disetujui (Approved At)': formatDisplayDateTime(mt.approved_at || mt.apply_date || mt.updated_at || mt.created_at),
                      'Link Render Output': mt.link_motion || '-'
                    })), `Approved_Motion_Archive_${currentMonthShort}_${archiveYear}.csv`);
                  }}
                  className="btn-outline text-xs px-3.5 h-10 rounded-lg flex items-center gap-1.5 font-medium"
                >
                  <Download className="w-4 h-4" />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            {/* Bottom Filter Controls Pill Group */}
            <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-[var(--border-secondary)]">
              {/* Year Dropdown */}
              <div className="flex items-center gap-2 bg-[var(--bg-secondary)] px-3 py-1.5 rounded-lg border border-[var(--border-primary)]">
                <Calendar className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-xs font-semibold text-[var(--text-muted)]">Year:</span>
                <select
                  value={archiveYear}
                  onChange={(e) => {
                    setArchiveYear(e.target.value);
                    setArchivePage(1);
                  }}
                  className="bg-transparent text-xs font-medium text-[var(--text-primary)] focus:outline-none cursor-pointer pr-2"
                >
                  {availableArchiveYears.map(y => (
                    <option key={y} value={y} className="bg-[var(--bg-secondary)]">{y}</option>
                  ))}
                </select>
              </div>

              {/* Month Dropdown */}
              <div className="flex items-center gap-2 bg-[var(--bg-secondary)] px-3 py-1.5 rounded-lg border border-[var(--border-primary)]">
                <Clock className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-xs font-semibold text-[var(--text-muted)]">Month:</span>
                <select
                  value={archiveMonth}
                  onChange={(e) => {
                    setArchiveMonth(e.target.value);
                    setArchivePage(1);
                  }}
                  className="bg-transparent text-xs font-medium text-[var(--text-primary)] focus:outline-none cursor-pointer pr-2"
                >
                  {MONTH_NAMES_ID.map((mName, idx) => (
                    <option key={idx + 1} value={String(idx + 1)} className="bg-[var(--bg-secondary)]">{mName}</option>
                  ))}
                </select>
              </div>

              {/* Week Dropdown */}
              <div className="flex items-center gap-2 bg-[var(--bg-secondary)] px-3 py-1.5 rounded-lg border border-[var(--border-primary)]">
                <Layers className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs font-semibold text-[var(--text-muted)]">Week:</span>
                <select
                  value={archiveWeek}
                  onChange={(e) => {
                    setArchiveWeek(e.target.value);
                    setArchivePage(1);
                  }}
                  className="bg-transparent text-xs font-medium text-[var(--text-primary)] focus:outline-none cursor-pointer pr-2"
                >
                  {archiveWeekOptions.map(opt => (
                    <option key={opt.value} value={opt.value} className="bg-[var(--bg-secondary)]">{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* PIC Dropdown */}
              {archiveUniquePics.length > 0 && (
                <div className="flex items-center gap-2 bg-[var(--bg-secondary)] px-3 py-1.5 rounded-lg border border-[var(--border-primary)]">
                  <User className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-xs font-semibold text-[var(--text-muted)]">PIC:</span>
                  <select
                    value={archivePic}
                    onChange={(e) => {
                      setArchivePic(e.target.value);
                      setArchivePage(1);
                    }}
                    className="bg-transparent text-xs font-medium text-[var(--text-primary)] focus:outline-none cursor-pointer pr-2"
                  >
                    <option value="all">All PICs</option>
                    {archiveUniquePics.map(pic => (
                      <option key={pic} value={pic}>{pic}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Brand Dropdown */}
              {archiveUniqueClients.length > 0 && (
                <div className="flex items-center gap-2 bg-[var(--bg-secondary)] px-3 py-1.5 rounded-lg border border-[var(--border-primary)]">
                  <Building2 className="w-3.5 h-3.5 text-pink-400" />
                  <span className="text-xs font-semibold text-[var(--text-muted)]">Brand:</span>
                  <select
                    value={archiveClient}
                    onChange={(e) => {
                      setArchiveClient(e.target.value);
                      setArchivePage(1);
                    }}
                    className="bg-transparent text-xs font-medium text-[var(--text-primary)] focus:outline-none cursor-pointer pr-2"
                  >
                    <option value="all">All Brands</option>
                    {archiveUniqueClients.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Studio Dropdown */}
              {archiveUniqueStudios.length > 0 && (
                <div className="flex items-center gap-2 bg-[var(--bg-secondary)] px-3 py-1.5 rounded-lg border border-[var(--border-primary)]">
                  <Film className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs font-semibold text-[var(--text-muted)]">Studio:</span>
                  <select
                    value={archiveStudio}
                    onChange={(e) => {
                      setArchiveStudio(e.target.value);
                      setArchivePage(1);
                    }}
                    className="bg-transparent text-xs font-medium text-[var(--text-primary)] focus:outline-none cursor-pointer pr-2"
                  >
                    <option value="all">All Studios</option>
                    {archiveUniqueStudios.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Platform Dropdown */}
              {archiveUniquePlatforms.length > 0 && (
                <div className="flex items-center gap-2 bg-[var(--bg-secondary)] px-3 py-1.5 rounded-lg border border-[var(--border-primary)]">
                  <LayoutGrid className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-xs font-semibold text-[var(--text-muted)]">Platform:</span>
                  <select
                    value={archivePlatform}
                    onChange={(e) => {
                      setArchivePlatform(e.target.value);
                      setArchivePage(1);
                    }}
                    className="bg-transparent text-xs font-medium text-[var(--text-primary)] focus:outline-none cursor-pointer pr-2"
                  >
                    <option value="all">All Platforms</option>
                    {archiveUniquePlatforms.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Sort Dropdown */}
              <div className="flex items-center gap-2 bg-[var(--bg-secondary)] px-3 py-1.5 rounded-lg border border-[var(--border-primary)]">
                <ArrowUpDown className="w-3.5 h-3.5 text-orange-400" />
                <span className="text-xs font-semibold text-[var(--text-muted)]">Sort:</span>
                <select
                  value={archiveSort}
                  onChange={(e) => {
                    setArchiveSort(e.target.value);
                    setArchivePage(1);
                  }}
                  className="bg-transparent text-xs font-medium text-[var(--text-primary)] focus:outline-none cursor-pointer pr-2"
                >
                  <option value="approved_desc" className="bg-[var(--bg-secondary)]">Approval: Terbaru</option>
                  <option value="approved_asc" className="bg-[var(--bg-secondary)]">Approval: Terlama</option>
                  <option value="req_date_desc" className="bg-[var(--bg-secondary)]">Jadwal: Terbaru</option>
                  <option value="req_date_asc" className="bg-[var(--bg-secondary)]">Jadwal: Terlama</option>
                  <option value="code_asc" className="bg-[var(--bg-secondary)]">Kode: A-Z</option>
                  <option value="code_desc" className="bg-[var(--bg-secondary)]">Kode: Z-A</option>
                </select>
              </div>
            </div>
          </div>

          {/* 4. APPROVED ARCHIVE KANBAN VIEW (Default) */}
          {archiveViewMode === 'kanban' && (
            <div className="flex gap-4 overflow-x-auto pb-6 scroll-smooth snap-x" style={{ minHeight: 'calc(100vh - 360px)' }}>
              {archiveKanbanColumns
                .filter(col => archiveWeek === 'all' || archiveWeek === String(col.week))
                .map(col => {
                  const colTasks = filteredArchiveMotionTasks
                    .filter(mt => {
                      const dt = mt.approved_at || mt.apply_date || mt.updated_at || mt.created_at;
                      return getWeekOfMonth(dt) === col.week;
                    })
                    .sort((a, b) => {
                      const dateA = new Date(a.approved_at || a.apply_date || a.updated_at || a.created_at).getTime();
                      const dateB = new Date(b.approved_at || b.apply_date || b.updated_at || b.created_at).getTime();
                      return dateB - dateA; // Latest approved first
                    });

                  return (
                    <div
                      key={col.week}
                      className="kanban-column flex-shrink-0 w-[310px] snap-center flex flex-col bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl shadow-sm overflow-hidden"
                    >
                      {/* Column Header */}
                      <div className="p-3.5 bg-[var(--bg-secondary)] border-b border-[var(--border-secondary)] sticky top-0 z-10">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                              <span>{col.label}</span>
                            </h4>
                            <p className="text-[11px] font-medium text-[var(--text-muted)] mt-0.5">
                              {col.dateRange}
                            </p>
                          </div>
                          <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            {colTasks.length} {colTasks.length === 1 ? 'Task' : 'Tasks'}
                          </span>
                        </div>
                      </div>

                      {/* Cards List */}
                      <div className="p-3 space-y-3 overflow-y-auto flex-1">
                        {colTasks.length === 0 ? (
                          <div className="p-6 text-center flex flex-col items-center justify-center h-48 rounded-xl border border-dashed border-[var(--border-secondary)] bg-[var(--bg-secondary)]/30 text-[var(--text-muted)]">
                            <Calendar className="w-6 h-6 mb-2 opacity-30" />
                            <p className="text-xs font-medium">No approved motion tasks</p>
                            <span className="text-[10px] opacity-70">pada {col.label.toLowerCase()}</span>
                          </div>
                        ) : (
                          colTasks.map(mt => {
                            const clientName = mt.parentTask?.client_name || allClients.find(c => c.id === mt.client_id)?.name || 'Unknown Client';
                            const picUser = motionUsers.find(u => u.id === mt.motion_pic_id);

                            return (
                              <MotionKanbanCard
                                key={mt.id}
                                mt={mt}
                                isMovable={false}
                                isBeingDragged={false}
                                isArchive={true}
                                clientName={clientName}
                                picUser={picUser}
                                user={user}
                                onRestore={handleRestoreMotionTask}
                                onDelete={handleDeleteMotionTask}
                                onClick={() => {
                                  setShowDetail(mt);
                                  setDetailInitialTab('details');
                                }}
                              />
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {/* 5. APPROVED ARCHIVE TABLE VIEW */}
          {archiveViewMode === 'table' && (
            <div className="space-y-4">
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Kode Tiket</th>
                      <th>Client / Brand</th>
                      <th>Campaign / Type</th>
                      <th>Platform &amp; Studio</th>
                      <th>Motion PIC</th>
                      <th>Level</th>
                      <th>Tgl Produksi / Jadwal</th>
                      <th>Tgl Disetujui (Approved At)</th>
                      <th>Output Render</th>
                      <th className="text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedArchiveMotionTasks.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-16 text-center">
                          <div className="flex flex-col items-center justify-center max-w-md mx-auto text-center">
                            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-3 shadow-inner">
                              <FolderCheck className="w-7 h-7" />
                            </div>
                            <h4 className="text-base font-bold text-[var(--text-primary)] mb-1">
                              Tidak Ada Motion Disetujui Ditemukan
                            </h4>
                            <p className="text-xs text-[var(--text-muted)] leading-relaxed mb-4">
                              Tidak ada arsip motion yang sesuai dengan filter tahun, bulan, minggu, studio, atau kata kunci pencarian yang sedang aktif.
                            </p>
                            {(archiveWeek !== 'all' || archivePic !== 'all' || archiveClient !== 'all' || archiveStudio !== 'all' || archivePlatform !== 'all' || archiveSearch !== '') && (
                              <button
                                onClick={() => {
                                  setArchiveWeek('all');
                                  setArchivePic('all');
                                  setArchiveClient('all');
                                  setArchiveStudio('all');
                                  setArchivePlatform('all');
                                  setArchiveSearch('');
                                  setArchivePage(1);
                                }}
                                className="btn-secondary text-xs px-4 py-2 rounded-lg font-medium"
                              >
                                Reset Filter Arsip
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      paginatedArchiveMotionTasks.map((mt) => {
                        const clientName = mt.parentTask?.client_name || allClients.find(c => c.id === mt.client_id)?.name || 'Unknown Client';
                        const picUser = motionUsers.find(u => u.id === mt.motion_pic_id);
                        const approvalDate = mt.approved_at || mt.apply_date || mt.updated_at || mt.created_at;

                        return (
                          <tr
                            key={mt.id}
                            onClick={() => {
                              setShowDetail(mt);
                              setDetailInitialTab('details');
                            }}
                            className="cursor-pointer hover:bg-[var(--bg-tertiary)]/50 transition-colors"
                          >
                            <td className="font-mono text-xs font-bold text-[var(--accent-pink)]">
                              {mt.parentTask?.task_code || (mt.id || '').substring(0, 10).toUpperCase()}
                            </td>
                            <td className="font-semibold text-xs text-[var(--text-primary)]">
                              {clientName}
                            </td>
                            <td className="text-xs text-[var(--text-secondary)]">
                              <div className="font-medium text-[var(--text-primary)]">
                                {mt.parentTask?.campaign_name || mt.campaign_type || 'Standalone Motion'}
                              </div>
                              {mt.motion_type && (
                                <div className="text-[11px] text-[var(--text-muted)] truncate max-w-[150px]">
                                  {mt.motion_type}
                                </div>
                              )}
                            </td>
                            <td>
                              <div className="flex items-center gap-1 flex-wrap">
                                {mt.platform && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] text-[var(--text-secondary)]">
                                    {mt.platform}
                                  </span>
                                )}
                                {mt.studio && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-pink-500/10 text-pink-400 border border-pink-500/20">
                                    {mt.studio}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td>
                              <span className="text-xs font-medium text-[var(--text-primary)]">
                                {picUser?.full_name || '—'}
                              </span>
                            </td>
                            <td>
                              <span className="badge text-[10px] py-0 px-1.5 bg-purple-500/20 text-purple-300 border-purple-500/30">
                                {MOTION_DIFFICULTY_LABELS[mt.motion_difficulty]}
                              </span>
                            </td>
                            <td className="text-xs text-[var(--text-muted)]">
                              {mt.production_date ? formatDisplayDate(mt.production_date) : formatDisplayDate(mt.created_at)}
                            </td>
                            <td className="text-xs text-emerald-400 font-medium">
                              <div>{formatDisplayDate(approvalDate)}</div>
                              <div className="text-[10px] text-[var(--text-muted)] font-mono">
                                {approvalDate ? new Date(approvalDate).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':') + ' WIB' : ''}
                              </div>
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              {mt.link_motion ? (
                                <a
                                  href={sanitizeUrl(mt.link_motion)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold hover:bg-emerald-500/20 transition-colors"
                                >
                                  <Film className="w-3 h-3" />
                                  <span>Lihat Output</span>
                                  <ExternalLink className="w-3 h-3 ml-0.5" />
                                </a>
                              ) : (
                                <span className="text-xs text-[var(--text-muted)] italic">Tidak ada link</span>
                              )}
                            </td>
                            <td className="text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => {
                                    setShowDetail(mt);
                                    setDetailInitialTab('details');
                                  }}
                                  className="btn-ghost p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/10"
                                  title="Lihat Detail Arsip Motion"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                {user && canUserRestoreTask(user.role_name, user.id, mt) && (
                                  <button
                                    onClick={() => handleRestoreMotionTask(mt.id)}
                                    className="btn-ghost p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/10"
                                    title="Pulihkan Card Motion ke Board Aktif (Restore)"
                                  >
                                    <RotateCcw className="w-4 h-4" />
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

              {/* Table Pagination Controls */}
              {sortedArchiveMotionTasks.length > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-[var(--bg-card)] rounded-xl border border-[var(--border-primary)] shadow-sm text-xs">
                  <div className="flex items-center gap-3 text-[var(--text-muted)]">
                    <span>
                      Menampilkan <strong className="text-[var(--text-primary)]">{Math.min(sortedArchiveMotionTasks.length, (archivePage - 1) * archiveLimit + 1)}</strong> - <strong className="text-[var(--text-primary)]">{Math.min(sortedArchiveMotionTasks.length, archivePage * archiveLimit)}</strong> dari <strong className="text-[var(--text-primary)]">{sortedArchiveMotionTasks.length}</strong> tiket arsip
                    </span>
                    <div className="hidden sm:flex items-center gap-1.5 ml-2">
                      <span>Per Halaman:</span>
                      <select
                        value={archiveLimit}
                        onChange={(e) => {
                          setArchiveLimit(Number(e.target.value));
                          setArchivePage(1);
                        }}
                        className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded px-2 py-0.5 text-xs text-[var(--text-primary)] focus:outline-none cursor-pointer"
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
                      onClick={() => setArchivePage(p => Math.max(1, p - 1))}
                      disabled={archivePage <= 1}
                      className="btn-outline h-8 px-2.5 rounded-lg flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed text-xs"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Prev</span>
                    </button>
                    <span className="px-2 font-medium text-[var(--text-primary)]">
                      {archivePage} / {totalArchivePages}
                    </span>
                    <button
                      onClick={() => setArchivePage(p => Math.min(totalArchivePages, p + 1))}
                      disabled={archivePage >= totalArchivePages}
                      className="btn-outline h-8 px-2.5 rounded-lg flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed text-xs"
                    >
                      <span>Next</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ================= MODAL 1: COMPREHENSIVE MOTION DETAIL MODAL ================= */}
      {showDetail && (
        <MotionDetailModal
          motionTask={showDetail}
          user={user}
          allUsers={allUsers}
          allClients={allClients}
          allTasks={allTasks}
          initialTab={detailInitialTab}
          onClose={handleCloseAnyModal}
          onRefresh={refresh}
          onAssign={() => switchModal('ASSIGN', { taskId: showDetail.id })}
          onSubmit={() => switchModal('SUBMIT', { taskId: showDetail.id })}
          onRevise={() => switchModal('REVISION', { taskId: showDetail.id })}
          onHandover={() => switchModal('HANDOVER', { taskId: showDetail.id })}
          onEdit={() => switchModal('EDIT', { taskId: showDetail.id })}
          onApprove={async () => {
            await handleStatusChange(showDetail.id, 'APPROVED');
            handleCloseAnyModal();
          }}
        />
      )}

      {/* ================= MODAL 2: ASSIGN MOTION PIC MODAL ================= */}
      {showAssign && (
        <AssignMotionPicModal
          motionTaskId={showAssign}
          currentTask={motionTasks.find(t => t.id === showAssign)}
          motionUsers={motionUsers}
          userId={user.id}
          userRole={user.role_name}
          targetStatus={assignTargetStatus}
          onClose={handleCloseAnyModal}
        />
      )}

      {/* ================= MODAL 3: CREATE / EDIT MOTION REQUEST MODAL ================= */}
      {showCreateModal && (
        <MotionFormModal 
          onClose={handleCloseAnyModal} 
          userId={user.id} 
          clients={allClients} 
          motionUsers={motionUsers} 
        />
      )}
      {showEditModal && (
        <MotionFormModal 
          onClose={handleCloseAnyModal} 
          userId={user.id} 
          editTaskId={showEditModal} 
          clients={allClients} 
          motionUsers={motionUsers} 
          motionTasks={motionTasks} 
        />
      )}
      
      {/* ================= MODAL 4: SUBMIT OUTPUT RENDER MODAL ================= */}
      {showSubmitModal && (
        <SubmitMotionModal 
          taskId={typeof showSubmitModal === 'string' ? showSubmitModal : showSubmitModal.taskId} 
          motionTask={motionTasks.find(m => m.id === (typeof showSubmitModal === 'string' ? showSubmitModal : showSubmitModal.taskId))}
          targetAfterSubmit={typeof showSubmitModal === 'object' ? showSubmitModal?.targetAfterSubmit : null}
          onRequestRevision={(mId) => {
            switchModal('REVISION', { taskId: mId });
          }}
          onClose={handleCloseAnyModal} 
          userId={user.id} 
        />
      )}

      {/* ================= MODAL 5: REQUEST MOTION REVISION MODAL ================= */}
      {showRevisionModal && (
        <MotionRevisionModal
          taskId={showRevisionModal}
          onClose={handleCloseAnyModal}
          userId={user.id}
        />
      )}

      {/* ================= MODAL 6: HANDOVER TO OPERATOR MODAL ================= */}
      {showHandoverModal && (
        <HandoverModal 
          taskId={showHandoverModal} 
          onClose={handleCloseAnyModal} 
          userId={user.id} 
          operators={allUsers.filter(u => u.role_name === 'OPERATOR')} 
        />
      )}
    </div>
  );
}

// ===================== FULL MULTI-TAB MOTION DETAIL MODAL (WITH DETAIL, CHAT & AUDIT) =====================
function MotionDetailModal({
  motionTask,
  user,
  allUsers,
  allClients,
  allTasks = [],
  initialTab = 'details',
  onClose,
  onRefresh,
  onAssign,
  onSubmit,
  onRevise,
  onHandover,
  onEdit,
  onApprove
}: {
  motionTask: EnrichedMotionTask;
  user: UserType;
  allUsers: UserType[];
  allClients: Client[];
  allTasks?: TaskWithRelations[];
  initialTab?: 'details' | 'chat';
  onClose: () => void;
  onRefresh: () => void;
  onAssign: () => void;
  onSubmit: () => void;
  onRevise: () => void;
  onHandover: () => void;
  onEdit: () => void;
  onApprove?: () => Promise<void> | void;
}) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [commentCount, setCommentCount] = useState<number>(0);
  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);
  const initialAtts = (motionTask.attachments && motionTask.attachments.length > 0)
    ? motionTask.attachments
    : (motionTask.parentTask?.attachments || []);
  const [taskAttachments, setTaskAttachments] = useState<TaskAttachment[]>(initialAtts);

  useEffect(() => {
    const atts = (motionTask.attachments && motionTask.attachments.length > 0)
      ? motionTask.attachments
      : (motionTask.parentTask?.attachments || []);
    setTaskAttachments(atts);
  }, [motionTask.attachments, motionTask.parentTask?.attachments]);

  const handleDirectUpload = async (newAttachment: TaskAttachment): Promise<void> => {
    await addTaskAttachment(motionTask.id, newAttachment);
    setTaskAttachments(prev => [...prev, newAttachment]);
    onRefresh();
  };

  const handleDirectDelete = async (attachmentId: string): Promise<void> => {
    await removeTaskAttachment(motionTask.id, attachmentId);
    setTaskAttachments(prev => prev.filter(a => a.id !== attachmentId));
    onRefresh();
  };

  const canEdit = ['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name) || !motionTask.parentTask;
  const canDeleteMotion = canUserDeleteMotionTask(user, motionTask);
  const [isDeleting, setIsDeleting] = useState(false);
  const clientName = motionTask.parentTask?.client_name || allClients.find(c => c.id === motionTask.client_id)?.name || 'Unknown Client';
  const picUser = allUsers.find(u => u.id === motionTask.motion_pic_id);

  // Robust inheritance: resolve Strategic Concept Deck and GD Asset links even across handovers/spawns
  const parentTask = motionTask.parentTask;
  const sourceStratTask = parentTask?.source_strategic_task_id
    ? (allTasks || []).find(t => t.id === parentTask.source_strategic_task_id)
    : null;

  const effectiveStratLink = parentTask?.strat_concept_link || sourceStratTask?.strat_concept_link || null;
  const effectiveStratName = parentTask?.strat_concept_name || sourceStratTask?.strat_concept_name || 'Strategic Concept Deck';
  const effectiveStratSubmittedAt = parentTask?.strat_submitted_at || sourceStratTask?.strat_submitted_at || null;

  const effectiveGdAssetLink = parentTask?.final_asset_link || null;
  const effectiveGdAssetName = parentTask?.final_asset_name || 'Design Approved Asset';

  const effectiveMotionLink = motionTask.link_motion || null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="modal-overlay" onClick={onClose} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px' }}>
      <div className="modal-workspace-dialog" onClick={e => e.stopPropagation()}>
        
        {/* Header Bar (52px Fixed) */}
        <div className="modal-workspace-header">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] text-[10px] font-bold tracking-wider text-[var(--text-secondary)]">
              <Film className="w-3.5 h-3.5 text-pink-500" />
              <span>MOTION PIPELINE</span>
            </div>
            <span className="text-xs text-[var(--text-muted)]">•</span>
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-pink-500/10 text-pink-400 border border-pink-500/20">
              {motionTask.parentTask?.task_code || (motionTask.id || '').substring(0, 10).toUpperCase()}
            </span>
            <span className="text-xs text-[var(--text-muted)]">•</span>
            <span className={`badge ${MOTION_STATUS_COLORS[motionTask.status_motion]}`} style={{ fontSize: '11px', padding: '1px 6px' }}>
              • {MOTION_STATUS_LABELS[motionTask.status_motion]}
            </span>
            <span className="badge text-[10px] py-0 px-2 bg-purple-500/20 text-purple-300 border-purple-500/30">
              {MOTION_DIFFICULTY_LABELS[motionTask.motion_difficulty]}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Production Date Badge */}
            <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-pink-500/10 text-pink-400 border border-pink-500/20">
              <Clock className="w-3 h-3" />
              <span>Produksi: {motionTask.production_date ? formatDisplayDate(motionTask.production_date) : formatDisplayDate(motionTask.created_at)}</span>
            </div>

            {/* Copy / Share Link */}
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  navigator.clipboard.writeText(`${window.location.origin}/dashboard/motion?id=${motionTask.id}`);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }
              }}
              className="p-1 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1.5 text-xs font-medium cursor-pointer"
              title="Salin Link Tiket Motion"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Share2 className="w-3.5 h-3.5" />}
              {copiedLink && <span className="text-[11px] text-emerald-500 hidden md:inline">Tersalin!</span>}
            </button>

            {/* Close button */}
            <button 
              onClick={onClose} 
              className="p-1 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              title="Tutup Modal"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Modal Body: Two-Column Side-by-Side (workspace) */}
        <div className="modal-workspace-body">
          
          {/* LEFT COLUMN: Motion Request Details */}
          <div className="modal-workspace-left custom-scrollbar space-y-2.5">
            
            {/* Title & Platform/Studio Badges */}
            <div className="space-y-1.5 pb-2 border-b border-[var(--border-secondary)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-pink-500 shrink-0" />
                  <span className="text-xs font-bold text-pink-400 uppercase tracking-wider shrink-0">{clientName}</span>
                  <span className="text-xs text-[var(--text-muted)]">•</span>
                  <h2 className="text-base font-bold text-[var(--text-primary)] leading-tight truncate m-0">
                    {motionTask.parentTask?.campaign_name || motionTask.campaign_type || 'Motion Graphic Task'}
                  </h2>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {motionTask.platform && (
                    <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', borderColor: 'rgba(59, 130, 246, 0.2)', fontSize: '10px', padding: '1px 5px' }}>
                      {motionTask.platform}
                    </span>
                  )}
                  {motionTask.studio && (
                    <span className="badge" style={{ background: 'rgba(236, 72, 153, 0.1)', color: '#ec4899', borderColor: 'rgba(236, 72, 153, 0.2)', fontSize: '10px', padding: '1px 5px' }}>
                      Studio {motionTask.studio}
                    </span>
                  )}
                </div>
              </div>

              {/* Quick Actions Row under title */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {canEdit && !motionTask.parentTask && (
                  <button 
                    onClick={onEdit}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] border border-[var(--border-primary)] text-[var(--text-primary)] transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-3 h-3 text-pink-500" /> Edit Request
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      navigator.clipboard.writeText(`${window.location.origin}/dashboard/motion?id=${motionTask.id}`);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2000);
                    }
                  }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] border border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  <Copy className="w-3 h-3 text-[var(--text-muted)]" /> 
                  {copiedLink ? 'Tersalin!' : 'Copy Link'}
                </button>
                {effectiveStratLink && (
                  <a
                    href={sanitizeUrl(effectiveStratLink)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-400 transition-colors"
                    title={effectiveStratName}
                  >
                    <FileText className="w-3 h-3" /> Concept Deck
                  </a>
                )}
                {effectiveGdAssetLink && (
                  <a
                    href={sanitizeUrl(effectiveGdAssetLink)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 transition-colors"
                    title={effectiveGdAssetName}
                  >
                    <ExternalLink className="w-3 h-3" /> Asset GD
                  </a>
                )}
                {effectiveMotionLink && (
                  <a
                    href={sanitizeUrl(effectiveMotionLink)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-pink-500/10 hover:bg-pink-500/20 border border-pink-500/30 text-pink-400 transition-colors"
                  >
                    <Film className="w-3 h-3" /> Output Render
                  </a>
                )}
              </div>
            </div>

            {/* Key Information Card (Specs Grid) */}
            <div className="p-2.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)]">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2 text-xs">
                
                {/* Brand & Client */}
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">
                    Brand / Client
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-pink-500 shrink-0" />
                    <span className="font-semibold text-xs text-[var(--text-primary)] truncate">
                      {clientName}
                    </span>
                  </div>
                </div>

                {/* Campaign Ref */}
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">
                    Campaign Ref
                  </span>
                  <p className="font-semibold text-xs text-[var(--text-primary)] truncate m-0">
                    {motionTask.parentTask?.campaign_name || motionTask.campaign_type || '—'}
                  </p>
                </div>

                {/* Assigned Motion PIC */}
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">
                    Motion PIC
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3.5 h-3.5 rounded-full bg-pink-500/20 text-pink-400 font-bold text-[8px] flex items-center justify-center shrink-0">
                      {(picUser?.full_name || 'U').substring(0, 2).toUpperCase()}
                    </span>
                    <span className="font-semibold text-xs text-[var(--text-primary)] truncate">
                      {picUser?.full_name || 'Belum di-assign'}
                    </span>
                  </div>
                </div>

                {/* Requester / AE */}
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">
                    AE (Requester)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3.5 h-3.5 rounded-full bg-purple-500/20 text-purple-400 font-bold text-[8px] flex items-center justify-center shrink-0">
                      {(motionTask.parentTask?.created_by_name || 'AE').substring(0, 2).toUpperCase()}
                    </span>
                    <span className="font-semibold text-xs text-[var(--text-primary)] truncate">
                      {motionTask.parentTask?.created_by_name || 'Requester'}
                    </span>
                  </div>
                </div>

                {/* GD PIC */}
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">
                    GD PIC
                  </span>
                  <p className="font-semibold text-xs text-[var(--text-primary)] truncate m-0">
                    {motionTask.parentTask?.design_pic_name || '—'}
                  </p>
                </div>

                {/* Motion Type */}
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">
                    Motion Type
                  </span>
                  <p className="font-semibold text-xs text-[var(--text-primary)] truncate m-0">
                    {motionTask.motion_type || motionTask.parentTask?.content_type_name || 'Motion Video'}
                  </p>
                </div>

                {/* Platform & Studio */}
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">
                    Platform &amp; Studio
                  </span>
                  <p className="font-semibold text-xs text-[var(--text-secondary)] m-0">
                    {motionTask.platform || 'General'} • Studio {motionTask.studio || 'Jakarta'}
                  </p>
                </div>

                {/* Tanggal Produksi */}
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">
                    Target Produksi
                  </span>
                  <div className="flex items-center gap-1 text-xs font-semibold text-[var(--text-primary)]">
                    <Calendar className="w-3 h-3 text-amber-500 shrink-0" />
                    <span>{motionTask.production_date ? formatDisplayDate(motionTask.production_date) : formatDisplayDate(motionTask.created_at)}</span>
                  </div>
                </div>

                {/* Total Revisions */}
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">
                    Revisions
                  </span>
                  <p className="font-semibold text-xs m-0" style={{ color: motionTask.motion_revision_count > 0 ? 'var(--accent-amber)' : 'var(--text-secondary)' }}>
                    Rev: {motionTask.motion_revision_count}
                  </p>
                </div>

              </div>
            </div>

            {/* Motion Brief & Catatan Khusus with Integrated Photo Attachment */}
            <div className="p-2.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] space-y-1.5">
              <RequestImageUpload
                section="brief"
                title="Motion Brief & Notes"
                attachments={taskAttachments}
                onChange={setTaskAttachments}
                onDirectUpload={canEdit ? handleDirectUpload : undefined}
                onDirectDelete={canEdit ? handleDirectDelete : undefined}
                readOnly={!canEdit}
                maxFiles={10}
                headerExtra={
                  <span className="text-[10px] text-[var(--text-muted)] font-medium">
                    {motionTask.production_date ? `Target: ${formatDisplayDate(motionTask.production_date)}` : ''}
                  </span>
                }
              >
                <p className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed m-0 font-normal max-h-24 overflow-y-auto custom-scrollbar pr-1 mt-1">
                  {motionTask.notes || 'Tidak ada catatan brief khusus yang disertakan.'}
                </p>
              </RequestImageUpload>
              <div className="flex flex-wrap gap-1 pt-1 border-t border-[var(--border-secondary)]">
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] text-[var(--text-secondary)]">
                  Pipeline: MOTION GRAPHIC
                </span>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] text-[var(--text-secondary)]">
                  Platform: {motionTask.platform || 'General'}
                </span>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] text-[var(--text-secondary)]">
                  Studio: {motionTask.studio || 'Jakarta'}
                </span>
              </div>
            </div>

            {/* Strategic Concept Deck Result (Persistent across pipelines & handovers) */}
            {effectiveStratLink && (
              <div className="p-2.5 rounded-lg bg-purple-500/5 border border-purple-500/20 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-purple-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    Strategic Concept Deck
                  </span>
                  {effectiveStratSubmittedAt && (
                    <span className="text-[10px] text-[var(--text-muted)]">
                      Submitted: {formatDisplayDate(effectiveStratSubmittedAt)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--text-primary)] font-semibold m-0 truncate">
                  {effectiveStratName}
                </p>
                <a
                  href={sanitizeUrl(effectiveStratLink)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-purple-400 flex items-center gap-1.5 no-underline font-medium hover:underline truncate"
                >
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" /> {effectiveStratLink}
                </a>
              </div>
            )}

            {/* Design GD Final Asset Handoff Section */}
            <div className="p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/20 flex flex-col gap-1">
              <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">
                Asset Handoff (Design GD Induk)
              </span>
              {effectiveGdAssetLink ? (
                <>
                  <p className="text-xs text-[var(--text-primary)] font-semibold m-0 truncate">
                    {effectiveGdAssetName}
                  </p>
                  <a href={sanitizeUrl(effectiveGdAssetLink)} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-blue-400 flex items-center gap-1.5 no-underline font-medium hover:underline truncate">
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" /> {effectiveGdAssetLink}
                  </a>
                </>
              ) : (
                <p className="text-xs text-[var(--text-muted)] italic m-0">
                  {motionTask.parentTask ? 'Asset GD belum dilampirkan pada tiket induk.' : 'Tiket standalone (tanpa tiket desain induk).'}
                </p>
              )}
            </div>

            {/* Motion Render Output Link Section */}
            {effectiveMotionLink && (
              <div className="p-3 rounded-lg bg-pink-500/5 border border-pink-500/20 flex flex-col gap-1.5">
                <span className="text-[10px] text-pink-400 font-bold uppercase tracking-wider">
                  Output Render Animasi (Motion)
                </span>
                <a href={sanitizeUrl(effectiveMotionLink)} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-pink-400 flex items-center gap-1.5 no-underline font-semibold hover:underline truncate">
                  <Film className="w-3.5 h-3.5 shrink-0" /> {effectiveMotionLink}
                </a>
              </div>
            )}

            {/* Riwayat Revisi Motion */}
            {motionTask.parentTask?.revisions && motionTask.parentTask.revisions.filter(r => r.stage === 'MOTION').length > 0 && (
              <div className="flex flex-col gap-2">
                <h4 className="text-xs font-bold text-[var(--text-primary)] m-0 flex items-center gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
                  Riwayat Revisi Motion ({motionTask.parentTask.revisions.filter(r => r.stage === 'MOTION').length})
                </h4>
                <div className="flex flex-col gap-1.5">
                  {motionTask.parentTask.revisions.filter(r => r.stage === 'MOTION').sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(rev => (
                    <div key={rev.id} className="p-2.5 bg-[var(--bg-tertiary)] rounded-lg flex flex-col gap-1 border border-[var(--border-secondary)]">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[var(--text-primary)] text-xs">Motion Rev #{rev.revision_number}</span>
                        <span className="text-[10px] text-[var(--text-muted)]">{formatDisplayDate(rev.created_at)}</span>
                      </div>
                      <div>
                        <span className="badge text-[10px] py-0 px-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          {REASON_LABELS[rev.reason_category] || rev.reason_category}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] m-0 leading-relaxed">
                        {rev.notes || (rev as any).revision_notes}
                      </p>
                      {rev.asset_link && (
                        <div className="mt-1 p-1.5 bg-[var(--bg-primary)] rounded border border-[var(--border-secondary)] flex items-center gap-1.5 text-xs">
                          <ExternalLink className="w-3 h-3 text-pink-400 shrink-0" />
                          <span className="text-[var(--text-muted)] text-[11px]">Render:</span>
                          <a 
                            href={sanitizeUrl(rev.asset_link)} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-pink-400 underline font-medium truncate"
                          >
                            {rev.asset_name || rev.asset_link}
                          </a>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: Dedicated Chat & Activity Stream (~40%) */}
          <div className="modal-workspace-right">
            <TaskChatSection
              task={
                motionTask.parentTask || {
                  id: motionTask.id,
                  task_code: (motionTask.id || '').substring(0, 8).toUpperCase(),
                  campaign_name: motionTask.campaign_type || 'Motion Request',
                  client_name: clientName,
                  created_by: (motionTask as any).created_by || '',
                  motion_pic_id: motionTask.motion_pic_id,
                  comments: []
                }
              }
              user={user}
              embedded={true}
              onCommentsUpdated={(count, unread) => {
                setCommentCount(count);
                setUnreadChatCount(unread);
              }}
            />
          </div>

        </div>

        {/* Action Buttons Footer (54px Sticky) */}
        <div className="modal-workspace-footer">
          
          {/* LEFT SIDE: Management Actions */}
          <div className="flex flex-wrap items-center gap-1.5">
            {canEdit && !motionTask.parentTask && (
              <button 
                onClick={onEdit} 
                className="h-8 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 text-[var(--text-primary)] bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] border border-[var(--border-secondary)] transition-colors cursor-pointer"
              >
                <Edit2 className="w-3 h-3 text-pink-500" /> Edit Request
              </button>
            )}
            {canDeleteMotion && (
              <button 
                disabled={isDeleting}
                onClick={async () => { 
                  const label = motionTask.parentTask?.task_code || (motionTask.id || '').substring(0, 10).toUpperCase();
                  if (window.confirm(`Apakah Anda yakin ingin menghapus tiket motion ${label}? Tindakan ini tidak dapat dibatalkan.`)) {
                    try {
                      setIsDeleting(true);
                      await deleteMotionTask(motionTask.id, user.id);
                      onRefresh();
                      onClose();
                    } catch (err: any) {
                      console.error('Gagal menghapus tiket motion:', err);
                      alert(`Gagal menghapus tiket motion: ${err?.message || err}`);
                    } finally {
                      setIsDeleting(false);
                    }
                  }
                }} 
                className="h-8 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3 h-3" /> {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            )}
            {/* ROLLBACK BUTTON */}
            {['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name) && motionTask.status_motion !== 'QUEUED' && (
              <button 
                onClick={async () => { 
                  let prevStatus: MotionStatus | null = null;
                  switch (motionTask.status_motion) {
                    case 'IN_PROGRESS': prevStatus = 'QUEUED'; break;
                    case 'SUBMITTED': prevStatus = 'IN_PROGRESS'; break;
                    case 'REVISION': prevStatus = 'SUBMITTED'; break;
                    case 'APPROVED': prevStatus = 'SUBMITTED'; break;
                    case 'COMPLETED': prevStatus = 'APPROVED'; break;
                  }
                  if (prevStatus) {
                    try {
                      await updateMotionStatus(motionTask.id, prevStatus, user.id);
                      onRefresh();
                    } catch (err: any) {
                      console.error('Error rolling back motion status:', err);
                      alert(`Gagal mengembalikan status motion: ${err?.message || String(err)}`);
                    }
                  }
                }} 
                className="h-8 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-primary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-primary)] transition-colors cursor-pointer"
              >
                <Undo2 className="w-3 h-3" /> Undo Status
              </button>
            )}
          </div>

          {/* RIGHT SIDE: Primary Flow Actions */}
          <div className="flex flex-wrap items-center gap-1.5 justify-end">
            {/* Assign PIC */}
            {motionTask.status_motion === 'QUEUED' && ['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name) && (
              <button 
                onClick={onAssign} 
                className="h-8 px-3 rounded-lg text-xs font-semibold btn-primary inline-flex items-center gap-1"
              >
                <User className="w-3.5 h-3.5" /> {motionTask.motion_pic_id ? 'Edit PIC' : 'Assign Motion PIC'}
              </button>
            )}

            {/* Start Work */}
            {motionTask.status_motion === 'QUEUED' && motionTask.motion_pic_id && (motionTask.motion_pic_id === user.id || ['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name)) && (
              <button 
                onClick={async () => { 
                  try {
                    await updateMotionStatus(motionTask.id, 'IN_PROGRESS', user.id);
                    onRefresh();
                    onClose();
                  } catch (err: any) {
                    console.error('Error starting motion work:', err);
                    alert(`Gagal memulai pengerjaan: ${err?.message || String(err)}`);
                  }
                }} 
                className="h-8 px-3 rounded-lg text-xs font-semibold btn-primary inline-flex items-center gap-1" 
                style={{ background: 'var(--accent-cyan)' }}
              >
                <Play className="w-3.5 h-3.5" /> Start Work
              </button>
            )}

            {/* Submit Render */}
            {(motionTask.status_motion === 'IN_PROGRESS' || motionTask.status_motion === 'REVISION') && (motionTask.motion_pic_id === user.id || ['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name)) && (
              <button 
                onClick={onSubmit} 
                className="h-8 px-3 rounded-lg text-xs font-semibold btn-primary inline-flex items-center gap-1" 
                style={{ background: 'var(--accent-emerald)' }}
              >
                <Send className="w-3.5 h-3.5" /> Submit Render
              </button>
            )}

            {/* Revision & Approval */}
            {motionTask.status_motion === 'SUBMITTED' && ['ADMIN', 'TEAM_LEAD', 'STRATEGIC_PIC', 'REQUESTER'].includes(user.role_name) && (
              <>
                <button 
                  onClick={onRevise} 
                  className="h-8 px-3 rounded-lg text-xs font-semibold btn-secondary text-amber-500 border-amber-500/30 hover:bg-amber-500/10 inline-flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Request Revision
                </button>
                
                <button 
                  onClick={async () => { 
                    try {
                      if (onApprove) {
                        await onApprove();
                      } else {
                        await updateMotionStatus(motionTask.id, 'APPROVED', user.id);
                        onRefresh();
                        onClose();
                      }
                    } catch (err: any) {
                      console.error('Error approving motion task:', err);
                      alert(`Gagal menyetujui motion task: ${err?.message || String(err)}`);
                    }
                  }} 
                  className="h-8 px-3 rounded-lg text-xs font-semibold btn-primary inline-flex items-center gap-1" 
                  style={{ background: 'var(--accent-emerald)' }}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Approve Motion
                </button>
              </>
            )}

            {/* Handover to Operator */}
            {motionTask.status_motion === 'APPROVED' && ['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name) && (
              <button 
                onClick={onHandover} 
                className="h-8 px-3 rounded-lg text-xs font-semibold btn-primary inline-flex items-center gap-1" 
                style={{ background: 'var(--accent-cyan)' }}
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Handover to Operator
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ===================== MOTION CHAT SECTION (WITH IMAGES & VIDEOS & LIGHTBOX) =====================
function MotionChatSection({
  motionTask,
  user,
  comments,
  loadingComments,
  chatError,
  setChatError,
  commentText,
  setCommentText,
  isSubmittingComment,
  handlePostComment,
  handleDeleteComment,
  canPostChat,
  getRoleStyle,
  chatBottomRef,
}: {
  motionTask: EnrichedMotionTask;
  user: UserType;
  comments: TaskComment[];
  loadingComments: boolean;
  chatError: string | null;
  setChatError: (err: string | null) => void;
  commentText: string;
  setCommentText: (text: string) => void;
  isSubmittingComment: boolean;
  handlePostComment: (attachment?: { url: string; type: 'image' | 'video'; name: string; size: number }) => void;
  handleDeleteComment: (commentId: string) => void;
  canPostChat: boolean;
  getRoleStyle: (role?: string) => any;
  chatBottomRef: React.RefObject<HTMLDivElement | null>;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedAttachment, setSelectedAttachment] = useState<{
    url: string;
    type: 'image' | 'video';
    name: string;
    size: number;
  } | null>(null);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [lightboxMedia, setLightboxMedia] = useState<{
    url: string;
    type: 'image' | 'video';
    name?: string;
  } | null>(null);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const processFile = (file: File) => {
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');

    if (!isImage && !isVideo) {
      setChatError('Format file tidak didukung. Harap pilih gambar (PNG, JPG, GIF, WebP) atau video (MP4, WebM).');
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      setChatError('Ukuran file terlalu besar. Maksimal ukuran lampiran adalah 25MB.');
      return;
    }

    setIsReadingFile(true);
    setChatError(null);

    const reader = new FileReader();
    reader.onload = () => {
      setSelectedAttachment({
        url: reader.result as string,
        type: isImage ? 'image' : 'video',
        name: file.name,
        size: file.size
      });
      setIsReadingFile(false);
    };
    reader.onerror = () => {
      setChatError('Gagal membaca file. Silakan coba file lain.');
      setIsReadingFile(false);
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1 || items[i].type.indexOf('video') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            processFile(file);
            break;
          }
        }
      }
    }
  };

  const onSubmitForm = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!commentText.trim() && !selectedAttachment) return;
    handlePostComment(selectedAttachment || undefined);
    setSelectedAttachment(null);
  };

  return (
    <div className="flex flex-col space-y-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4 h-full min-h-[420px]">
      
      {/* Header Info */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[var(--border-secondary)]">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-7 h-7 rounded-lg bg-pink-500/10 text-pink-500 flex items-center justify-center font-bold">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] m-0">
                Kolom Chat &amp; Diskusi Motion
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-300">
                {comments.length} Pesan
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] m-0 flex items-center gap-1.5 flex-wrap">
              <span>Tiket: {motionTask.parentTask?.task_code || motionTask.id}</span>
              {motionTask.parentTask?.created_by_name && <span>• Requester ({motionTask.parentTask.created_by_name})</span>}
            </p>
          </div>
        </div>
      </div>

      {/* Chat Error Notification Banner */}
      {chatError && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{chatError}</span>
          </div>
          <button type="button" onClick={() => setChatError(null)} className="text-red-500 hover:text-red-700">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Message List */}
      <div 
        className="flex-1 overflow-y-auto pr-1 space-y-3.5 custom-scrollbar" 
        style={{ minHeight: '280px', maxHeight: '440px' }}
      >
        {loadingComments ? (
          <div className="flex flex-col items-center justify-center py-10 text-[var(--text-muted)]">
            <Loader2 className="w-6 h-6 animate-spin mb-2 text-pink-500" />
            <span className="text-xs">Memuat pesan diskusi...</span>
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center p-6 rounded-xl border border-dashed border-[var(--border-secondary)] bg-[var(--bg-card)]">
            <div className="w-10 h-10 rounded-full bg-pink-500/10 text-pink-500 flex items-center justify-center mb-2.5">
              <MessageSquare className="w-5 h-5" />
            </div>
            <h4 className="text-xs font-bold text-[var(--text-primary)] mb-1">Belum Ada Diskusi</h4>
            <p className="text-[11px] text-[var(--text-muted)] max-w-sm m-0">
              Gunakan kolom chat ini untuk koordinasi render, preview video/cutscene, atau feedback animasi pada status apa pun.
            </p>
          </div>
        ) : (
          comments.map((cmt) => {
            const isCurrentUser = cmt.user_id === user.id;
            const roleStyle = getRoleStyle(cmt.user_role);
            const senderDisplayName = cmt.user_name || (isCurrentUser ? user.full_name : 'Pengguna');
            return (
              <div 
                key={cmt.id} 
                className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all ${
                  isCurrentUser 
                    ? 'bg-pink-500/5 border-pink-500/25 ml-4 shadow-sm' 
                    : 'bg-[var(--bg-card)] border-[var(--border-secondary)] mr-4 shadow-sm'
                }`}
              >
                {/* Avatar */}
                <div 
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-sm"
                  style={{ background: roleStyle.bg, color: roleStyle.text, border: `1.5px solid ${roleStyle.border}` }}
                >
                  {cmt.user_avatar || senderDisplayName.substring(0, 2).toUpperCase()}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-[var(--text-primary)]">
                        {senderDisplayName}
                      </span>
                      {isCurrentUser && (
                        <span className="text-[10px] font-semibold text-pink-600 dark:text-pink-400 bg-pink-100 dark:bg-pink-900/40 px-1.5 py-0.2 rounded">
                          (Anda)
                        </span>
                      )}
                      <span 
                        className="text-[10px] px-2 py-0.5 rounded font-medium border"
                        style={{ background: roleStyle.bg, color: roleStyle.text, borderColor: roleStyle.border }}
                      >
                        {roleStyle.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-[var(--text-muted)] font-medium">
                        {formatDisplayDateTime(cmt.created_at)}
                      </span>
                      {(isCurrentUser || ['ADMIN', 'TEAM_LEAD'].includes(user.role_name)) && (
                        <button
                          type="button"
                          onClick={() => handleDeleteComment(cmt.id)}
                          className="text-[var(--text-muted)] hover:text-red-500 transition-colors p-1"
                          title="Hapus pesan"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Text Message */}
                  {cmt.content && (
                    <p className="text-xs text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap break-words m-0 mb-1.5">
                      {cmt.content}
                    </p>
                  )}

                  {/* Attachment Display */}
                  {cmt.attachment_url && (
                    <div className="mt-2">
                      {cmt.attachment_type === 'video' ? (
                        <div className="rounded-xl overflow-hidden bg-black/90 border border-[var(--border-secondary)] shadow-sm max-w-md">
                          <video 
                            src={cmt.attachment_url} 
                            controls 
                            playsInline 
                            preload="metadata"
                            className="w-full max-h-72 object-contain bg-black"
                          />
                          {cmt.attachment_name && (
                            <div className="p-2 bg-[var(--bg-tertiary)] flex items-center justify-between text-[11px] text-[var(--text-muted)] border-t border-[var(--border-secondary)]">
                              <span className="truncate flex items-center gap-1.5">
                                <FileVideo className="w-3.5 h-3.5 text-pink-500 shrink-0" />
                                {cmt.attachment_name}
                              </span>
                              <a 
                                href={cmt.attachment_url} 
                                download={cmt.attachment_name || 'video.mp4'} 
                                className="text-blue-500 hover:underline flex items-center gap-1 shrink-0 ml-2 font-medium"
                              >
                                <Download className="w-3 h-3" /> Unduh
                              </a>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div 
                          className="relative group inline-block max-w-sm rounded-xl overflow-hidden border border-[var(--border-secondary)] shadow-sm bg-[var(--bg-tertiary)] cursor-pointer" 
                          onClick={() => setLightboxMedia({ url: cmt.attachment_url!, type: 'image', name: cmt.attachment_name || 'gambar.jpg' })}
                        >
                          <img 
                            src={cmt.attachment_url} 
                            alt={cmt.attachment_name || 'Lampiran Gambar'} 
                            className="max-h-64 w-auto object-cover rounded-xl transition-transform duration-200 group-hover:scale-[1.02]"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 text-white">
                            <span className="p-2 rounded-full bg-black/60 hover:bg-black/80 flex items-center gap-1 text-xs font-semibold backdrop-blur-sm">
                              <Maximize2 className="w-4 h-4" /> Perbesar
                            </span>
                          </div>
                          {cmt.attachment_name && (
                            <div className="p-1.5 bg-[var(--bg-tertiary)]/90 text-[10px] text-[var(--text-muted)] truncate border-t border-[var(--border-secondary)]">
                              {cmt.attachment_name}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                </div>
              </div>
            );
          })
        )}
        <div ref={chatBottomRef} />
      </div>

      {/* Composer Input */}
      {canPostChat ? (
        <form onSubmit={onSubmitForm} className="pt-2.5 border-t border-[var(--border-secondary)] space-y-2">
          <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] px-1 font-medium">
            <span className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-pink-500" />
              Kirim pesan sebagai: <strong className="text-[var(--text-primary)]">{user.full_name}</strong>
              <span className="text-[9px] px-1.5 py-0.2 rounded font-medium border ml-1" style={{ background: getRoleStyle(user.role_name).bg, color: getRoleStyle(user.role_name).text, borderColor: getRoleStyle(user.role_name).border }}>
                {getRoleStyle(user.role_name).label}
              </span>
            </span>
          </div>

          {/* Selected Attachment Preview Box */}
          {selectedAttachment && (
            <div className="p-2.5 rounded-xl bg-[var(--bg-tertiary)] border border-pink-500/30 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {selectedAttachment.type === 'image' ? (
                  <div className="w-12 h-12 rounded-lg overflow-hidden border border-[var(--border-secondary)] shrink-0 bg-black/10">
                    <img src={selectedAttachment.url} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-pink-500/10 text-pink-500 flex items-center justify-center shrink-0 border border-pink-500/20">
                    <Film className="w-6 h-6" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[var(--text-primary)] truncate m-0">
                    {selectedAttachment.name}
                  </p>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    {selectedAttachment.type === 'image' ? 'Gambar' : 'Video'} • {formatFileSize(selectedAttachment.size)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAttachment(null)}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
                title="Hapus lampiran"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {isReadingFile && (
            <div className="p-2.5 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center gap-2 text-xs text-pink-500">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>Memproses media...</span>
            </div>
          )}

          <div className="relative">
            <textarea
              rows={2}
              value={commentText}
              disabled={isSubmittingComment || isReadingFile}
              onChange={e => setCommentText(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSubmitForm();
                }
              }}
              placeholder="Tulis pesan atau tempel (paste) gambar/video animasi... (Enter untuk kirim)"
              className="w-full text-xs p-3 pr-28 rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-pink-500/30 resize-none transition-all disabled:opacity-60"
            />

            {/* Hidden file input */}
            <input 
              type="file" 
              ref={fileInputRef} 
              accept="image/*,video/*" 
              onChange={handleFileChange} 
              className="hidden" 
            />

            <div className="absolute right-2.5 bottom-3 flex items-center gap-1.5">
              {/* Attachment Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSubmittingComment || isReadingFile}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-pink-500 hover:bg-pink-500/10 transition-colors"
                title="Lampirkan Gambar atau Video Render (Maks 25MB)"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              {/* Send Button */}
              <button
                type="submit"
                disabled={(!commentText.trim() && !selectedAttachment) || isSubmittingComment || isReadingFile}
                className="btn-primary py-1.5 px-3.5 text-xs rounded-lg flex items-center gap-1.5 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'var(--accent-pink)', borderColor: 'var(--accent-pink)' }}
              >
                {isSubmittingComment ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                Kirim
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] px-1">
            <span>Tekan <kbd className="px-1 py-0.5 rounded bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] font-mono text-[10px]">Enter</kbd> untuk kirim</span>
            <span>Bisa paste gambar/video langsung (Ctrl+V)</span>
          </div>
        </form>
      ) : (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Kolom chat dalam mode hanya-baca (Read-Only).</span>
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxMedia && (
        <div 
          className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setLightboxMedia(null)}
        >
          <div 
            className="relative max-w-4xl max-h-[90vh] flex flex-col items-center justify-center"
            onClick={e => e.stopPropagation()}
          >
            <div className="absolute -top-10 right-0 flex items-center gap-2">
              <a 
                href={lightboxMedia.url} 
                download={lightboxMedia.name || (lightboxMedia.type === 'video' ? 'video.mp4' : 'image.jpg')}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors flex items-center gap-1 text-xs font-semibold"
                title="Unduh File"
              >
                <Download className="w-4 h-4" /> Unduh
              </a>
              <button 
                type="button" 
                onClick={() => setLightboxMedia(null)} 
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                title="Tutup"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {lightboxMedia.type === 'video' ? (
              <video 
                src={lightboxMedia.url} 
                controls 
                autoPlay 
                className="max-h-[85vh] max-w-full rounded-2xl shadow-2xl bg-black"
              />
            ) : (
              <img 
                src={lightboxMedia.url} 
                alt={lightboxMedia.name || 'Preview'} 
                className="max-h-[85vh] max-w-full object-contain rounded-2xl shadow-2xl"
              />
            )}
          </div>
        </div>
      )}

    </div>
  );
}

// ===================== MODAL: ASSIGN MOTION PIC MODAL =====================
function AssignMotionPicModal({ 
  motionTaskId, 
  currentTask, 
  motionUsers, 
  userId, 
  userRole,
  targetStatus,
  onClose 
}: { 
  motionTaskId: string; 
  currentTask?: MotionTask; 
  motionUsers: UserType[]; 
  userId: string; 
  userRole?: string;
  targetStatus?: MotionStatus | null;
  onClose: () => void; 
}) {
  const initialPicId = currentTask?.motion_pic_id 
    || (userRole === 'MOTION_PIC' && motionUsers.some(u => u.id === userId) ? userId : motionUsers[0]?.id || '');

  const [picId, setPicId] = useState(initialPicId);
  const [difficulty, setDifficulty] = useState<MotionDifficulty>(currentTask?.motion_difficulty || 'LVL_1_SIMPLE');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!picId) {
      alert('Silakan pilih Motion PIC terlebih dahulu.');
      return;
    }
    setSubmitting(true);
    try {
      await assignMotionPic(motionTaskId, picId, userId, difficulty);
      if (targetStatus) {
        await updateMotionStatus(motionTaskId, targetStatus, userId);
      }
      onClose();
    } catch (err: any) {
      alert(err.message || 'Error assigning Motion PIC');
    } finally {
      setSubmitting(false);
    }
  };

  const isStartingInProgress = targetStatus === 'IN_PROGRESS';
  const modalTitle = isStartingInProgress
    ? 'Assign Motion PIC & Mulai Pengerjaan'
    : currentTask?.motion_pic_id 
      ? 'Edit / Reassign Motion PIC' 
      : 'Assign Motion PIC';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-md w-full" onClick={e => e.stopPropagation()}>
        <div className="p-6 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-primary)', background: 'var(--bg-card)' }}>
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">{modalTitle}</h2>
            {isStartingInProgress && (
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Tentukan Motion PIC dan tingkat kesulitan untuk memindahkan request ke In Progress.
              </p>
            )}
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-full hover:bg-[var(--bg-tertiary)]"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="label">Motion PIC *</label>
            <select required className="select" value={picId} onChange={e => setPicId(e.target.value)}>
              {motionUsers.map(mu => (
                <option key={mu.id} value={mu.id}>{mu.full_name} ({mu.daily_capacity_points} pts/day)</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Motion Level / Complexity *</label>
            <select required className="select" value={difficulty} onChange={e => setDifficulty(e.target.value as MotionDifficulty)}>
              <option value="LVL_1_SIMPLE">LVL 1 - Simple (2.0 pts)</option>
              <option value="LVL_2_MEDIUM">LVL 2 - Medium (3.0 pts)</option>
              <option value="LVL_3_ADVANCED">LVL 3 - Advanced (4.0 pts)</option>
              <option value="LVL_4_PERIOD">LVL 4 - Period (5.0 pts)</option>
            </select>
            <p className="text-xs text-[var(--text-muted)] mt-1">Level menentukan bobot beban kerja (workload points) tim motion designer.</p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary" disabled={submitting}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Menyimpan...' : isStartingInProgress ? 'Tugaskan & Mulai In Progress' : 'Confirm Assignment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ===================== MODAL: SUBMIT MOTION RENDER =====================
function SubmitMotionModal({ 
  taskId, 
  motionTask,
  onClose, 
  userId
}: { 
  taskId: string; 
  motionTask?: EnrichedMotionTask;
  onClose: () => void; 
  userId: string;
  targetAfterSubmit?: MotionStatus | null;
  onRequestRevision?: (taskId: string) => void;
}) {
  const [linkMotion, setLinkMotion] = useState(motionTask?.link_motion || '');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isRevision = motionTask?.status_motion === 'REVISION';

  useEffect(() => {
    if (motionTask?.link_motion) {
      setLinkMotion(motionTask.link_motion);
    }
  }, [motionTask?.link_motion]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkMotion.trim()) {
      alert('Silakan masukkan link output/render motion terlebih dahulu.');
      return;
    }
    setSubmitting(true);
    try {
      await submitMotionTask(taskId, linkMotion.trim(), notes, userId);
      onClose();
    } catch (err: any) {
      alert(`Gagal submit: ${err?.message || err}`);
    } finally {
      setSubmitting(false);
    }
  };

  const titleText = isRevision ? 'Re-submit Render Motion (Revisi)' : 'Submit Render Motion';
  const buttonText = isRevision ? 'Re-submit Output' : 'Submit Output';

  const refStratLink = motionTask?.parentTask?.strat_concept_link;
  const refStratName = motionTask?.parentTask?.strat_concept_name || 'Strategic Concept Deck';
  const refGdLink = motionTask?.parentTask?.final_asset_link;
  const refGdName = motionTask?.parentTask?.final_asset_name || 'Final Design Asset';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-md w-full" onClick={e => e.stopPropagation()}>
        <div className="p-6 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">{titleText}</h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-full"><X className="w-5 h-5" /></button>
        </div>

        {/* Reference Links if available */}
        {(refStratLink || refGdLink) && (
          <div className="p-3 mx-6 mt-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-secondary)] space-y-2 text-xs">
            <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider block">
              Referensi Desain & Konsep:
            </span>
            {refStratLink && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[var(--text-secondary)] truncate">
                  Konsep: {refStratName}
                </span>
                <a
                  href={sanitizeUrl(refStratLink)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-400 hover:underline shrink-0 flex items-center gap-1 font-semibold"
                >
                  Buka Deck <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
            {refGdLink && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[var(--text-secondary)] truncate">
                  Asset GD: {refGdName}
                </span>
                <a
                  href={sanitizeUrl(refGdLink)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline shrink-0 flex items-center gap-1 font-semibold"
                >
                  Buka Asset <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="label">Link Output / Final Asset Animasi <span className="text-red-500">*</span></label>
            <input required type="url" className="input w-full" placeholder="https://drive.google.com/..." value={linkMotion} onChange={e => setLinkMotion(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="label">Catatan (Opsional)</label>
            <textarea className="input w-full min-h-[80px] custom-scrollbar" placeholder="Tambahkan pesan untuk reviewer..." value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div className="flex justify-end gap-3 pt-4" style={{ borderTop: '1px solid var(--border-primary)' }}>
            <button type="button" onClick={onClose} className="btn-secondary">Batal</button>
            <button type="submit" disabled={submitting} className="btn-primary" style={{ background: 'var(--accent-emerald)', borderColor: 'var(--accent-emerald)' }}>
              {submitting ? 'Submitting...' : buttonText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ===================== MODAL: MOTION REVISION MODAL =====================
const MOTION_REASON_CATEGORIES: ReasonCategory[] = [
  'CLIENT_CHANGE',
  'BRIEF_MISMATCH',
  'TYPO',
  'QUALITY_ISSUE',
  'SCOPE_CHANGE',
  'OTHER'
];

function MotionRevisionModal({ taskId, onClose, userId }: { taskId: string, onClose: () => void, userId: string }) {
  const [reasonCategory, setReasonCategory] = useState<ReasonCategory>('CLIENT_CHANGE');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notes.trim()) return;
    setSubmitting(true);
    try {
      await requestMotionRevision(taskId, { reason_category: reasonCategory, notes: notes.trim() }, userId);
      onClose();
    } catch (err: any) {
      alert(`Gagal request revisi: ${err?.message || err}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-md w-full" onClick={e => e.stopPropagation()}>
        <div className="p-6 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-amber-500" />
            Request Revisi Motion
          </h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-full"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="label">Kategori Alasan Revisi <span className="text-red-500">*</span></label>
            <select className="select w-full" value={reasonCategory} onChange={e => setReasonCategory(e.target.value as ReasonCategory)}>
              {MOTION_REASON_CATEGORIES.map((cat: ReasonCategory) => (
                <option key={cat} value={cat} className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">
                  {REASON_LABELS[cat] || cat}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="label">Detail Catatan Revisi <span className="text-red-500">*</span></label>
            <textarea 
              required 
              rows={4} 
              className="input w-full custom-scrollbar text-xs" 
              placeholder="Tuliskan feedback dan detail perubahan animasi yang dibutuhkan..." 
              value={notes} 
              onChange={e => setNotes(e.target.value)} 
            />
          </div>
          <div className="flex justify-end gap-3 pt-4" style={{ borderTop: '1px solid var(--border-primary)' }}>
            <button type="button" onClick={onClose} className="btn-secondary">Batal</button>
            <button type="submit" disabled={submitting} className="btn-primary" style={{ background: 'var(--accent-amber)', borderColor: 'var(--accent-amber)' }}>
              {submitting ? 'Mengirim...' : 'Kirim Request Revisi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ===================== MODAL: HANDOVER TO OPERATOR =====================
function HandoverModal({ taskId, onClose, userId, operators }: { taskId: string; onClose: () => void; userId: string; operators: UserType[] }) {
  const [operatorId, setOperatorId] = useState(operators[0]?.id || '');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!operatorId) return;
    setSubmitting(true);
    try {
      await assignOperatorToMotionTask(taskId, operatorId, userId);
      onClose();
    } catch (err: any) {
      alert(`Gagal handover: ${err?.message || err}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-sm w-full" onClick={e => e.stopPropagation()}>
        <div className="p-6 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Handover to Operator</h2>
          <button onClick={onClose} className="btn-ghost p-1"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="label">Pilih Operator</label>
            <select required className="select w-full" value={operatorId} onChange={e => setOperatorId(e.target.value)}>
              {operators.map(op => <option key={op.id} value={op.id} className="bg-[var(--bg-secondary)]">{op.full_name}</option>)}
              {operators.length === 0 && <option value="" disabled>No Operator Available</option>}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? 'Processing...' : 'Handover (Complete)'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ===================== MODAL: CREATE / EDIT MOTION REQUEST =====================
function MotionFormModal({ 
  onClose, 
  userId, 
  editTaskId, 
  clients, 
  motionUsers, 
  motionTasks 
}: { 
  onClose: () => void, 
  userId: string, 
  editTaskId?: string, 
  clients: Client[], 
  motionUsers: UserType[], 
  motionTasks?: MotionTask[] 
}) {
  const taskToEdit = editTaskId ? motionTasks?.find(t => t.id === editTaskId) : null;

  const normalizedCampaign = taskToEdit?.campaign_type 
    ? normalizeCampaignName(taskToEdit.campaign_type) 
    : 'BAU';

  const [formData, setFormData] = useState({
    client_id: taskToEdit?.client_id || clients[0]?.id || 0,
    platform: (taskToEdit?.platform as any) || 'TIKTOK',
    motion_type: taskToEdit?.motion_type || '',
    campaign_type: normalizedCampaign,
    motion_difficulty: (taskToEdit?.motion_difficulty as MotionDifficulty) || 'LVL_1_SIMPLE',
    motion_pic_id: taskToEdit?.motion_pic_id || '',
    production_date: taskToEdit?.production_date || new Date().toISOString().substring(0, 10),
    period_start: taskToEdit?.period_start || new Date().toISOString().substring(0, 10),
    period_end: taskToEdit?.period_end || new Date(Date.now() + 7 * 86400000).toISOString().substring(0, 10),
    studio: (taskToEdit?.studio as any) || 'Jakarta',
    notes: taskToEdit?.notes || '',
    attachments: taskToEdit?.attachments || [],
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editTaskId) {
        await editStandaloneMotionTask(editTaskId, {
          ...formData,
          motion_pic_id: formData.motion_pic_id || null,
        }, userId);
      } else {
        await createStandaloneMotionTask({
          ...formData,
          motion_pic_id: formData.motion_pic_id || null,
        }, userId);
      }
      onClose();
    } catch (err: any) {
      const msg = err?.message || err?.details || JSON.stringify(err);
      alert(`Gagal menyimpan: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-2xl w-full" onClick={e => e.stopPropagation()}>
        <div className="p-6 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Film className="w-5 h-5 text-[var(--accent-pink)]" /> {editTaskId ? 'Edit Motion Request' : 'Create Motion Request'}
          </h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-full"><X className="w-5 h-5" /></button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
            <div className="space-y-1.5">
              <label className="label">Brand <span className="text-red-500">*</span></label>
              <select required className="select w-full" value={formData.client_id} onChange={e => setFormData({...formData, client_id: Number(e.target.value)})}>
                {clients.map(c => (
                  <option key={c.id} value={c.id} className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">{c.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="label">Platform <span className="text-red-500">*</span></label>
              <select required className="select w-full" value={formData.platform} onChange={e => setFormData({...formData, platform: e.target.value as any})}>
                <option value="TIKTOK" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">TikTok</option>
                <option value="SHOPEE" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">Shopee</option>
                <option value="TOKOPEDIA" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">Tokopedia</option>
                <option value="LAZADA" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">Lazada</option>
                <option value="OTHER" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">Other</option>
              </select>
            </div>
            
            <div className="space-y-1.5">
              <label className="label">Tipe Motion <span className="text-red-500">*</span></label>
              <input required type="text" className="input w-full" placeholder="e.g. 2D Animation, Lower Thirds" value={formData.motion_type} onChange={e => setFormData({...formData, motion_type: e.target.value})} />
            </div>
            <div className="space-y-1.5">
              <label className="label">Jenis Kampanye <span className="text-red-500">*</span></label>
              <select required className="select w-full" value={formData.campaign_type} onChange={e => setFormData({...formData, campaign_type: e.target.value})}>
                {taskToEdit?.campaign_type && !isValidCampaignName(taskToEdit.campaign_type) && (
                  <option value={taskToEdit.campaign_type} className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">
                    {taskToEdit.campaign_type} (Legacy)
                  </option>
                )}
                {CAMPAIGN_NAMES.map(c => (
                  <option key={c} value={c} className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">{c}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="label">Motion Level / Complexity <span className="text-red-500">*</span></label>
              <select required className="select w-full" value={formData.motion_difficulty} onChange={e => setFormData({...formData, motion_difficulty: e.target.value as MotionDifficulty})}>
                <option value="LVL_1_SIMPLE" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">LVL 1 - Simple (2.0 pts)</option>
                <option value="LVL_2_MEDIUM" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">LVL 2 - Medium (3.0 pts)</option>
                <option value="LVL_3_ADVANCED" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">LVL 3 - Advanced (4.0 pts)</option>
                <option value="LVL_4_PERIOD" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">LVL 4 - Period (5.0 pts)</option>
              </select>
            </div>
            
            <div className="space-y-1.5">
              <label className="label">Motion PIC</label>
              <select className="select w-full" value={formData.motion_pic_id} onChange={e => setFormData({...formData, motion_pic_id: e.target.value})}>
                <option value="" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">Unassigned</option>
                {motionUsers.map(u => (
                  <option key={u.id} value={u.id} className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">{u.full_name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="label">Studio <span className="text-red-500">*</span></label>
              <select required className="select w-full" value={formData.studio} onChange={e => setFormData({...formData, studio: e.target.value as 'Jakarta' | 'Bandung'})}>
                <option value="Jakarta" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">Jakarta</option>
                <option value="Bandung" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">Bandung</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="label">Tanggal Produksi <span className="text-red-500">*</span></label>
              <input required type="date" className="input w-full" value={formData.production_date} onChange={e => setFormData({...formData, production_date: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="label">Periode Mulai <span className="text-red-500">*</span></label>
                <input required type="date" className="input w-full" value={formData.period_start} onChange={e => setFormData({...formData, period_start: e.target.value})} />
              </div>
              <div className="space-y-1.5">
                <label className="label">Periode Selesai <span className="text-red-500">*</span></label>
                <input required type="date" className="input w-full" value={formData.period_end} onChange={e => setFormData({...formData, period_end: e.target.value})} />
              </div>
            </div>
          </div>

          {/* MOTION BRIEF & NOTES (WITH INTEGRATED PHOTO ATTACHMENT ICON) */}
          <div className="p-3 rounded-lg space-y-2 bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] mb-5">
            <RequestImageUpload
              section="brief"
              title="Motion Brief & Notes"
              attachments={formData.attachments || []}
              onChange={atts => setFormData(prev => ({ ...prev, attachments: atts }))}
              maxFiles={10}
            >
              <textarea
                className="input w-full py-2 text-xs mt-1.5"
                rows={3}
                placeholder="Catatan brief motion, instruksi animasi, audio guidelines, atau link referensi..."
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
              />
            </RequestImageUpload>
          </div>
          
          <div className="flex justify-end gap-3 pt-4" style={{ borderTop: '1px solid var(--border-primary)' }}>
            <button type="button" onClick={onClose} className="btn-secondary">Batal</button>
            <button type="submit" disabled={submitting} className="btn-primary" style={{ background: 'var(--accent-pink)', borderColor: 'var(--accent-pink)' }}>
              {submitting ? 'Menyimpan...' : (editTaskId ? 'Simpan Perubahan' : 'Buat Request')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
