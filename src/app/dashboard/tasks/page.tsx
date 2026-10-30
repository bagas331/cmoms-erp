'use client';
import { motion } from 'framer-motion';

import { useEffect, useState, useCallback, useMemo, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import { useAuth } from '@/lib/auth';
import { usePersistedState } from '@/lib/use-persistent-state';
import { useClickOutside } from '@/lib/use-click-outside';
import { useModalManager } from '@/lib/use-modal-manager';
import { supabase } from '@/lib/supabase';
import {
  getAllTasksWithRelations, getClients, getContentTypes, getUsers,
  createTask, editTask, assignTask, updateTaskStatus, submitTask, requestRevision, forwardTaskToMotion,
  deleteTask, updateStratStatus, submitStrategicConcept, handoverStrategicTaskToGD,
  getComments, addComment, deleteComment, getInvolvedUserIds,
  restoreTask, autoArchiveCompletedTasks, addTaskAttachment, removeTaskAttachment
} from '@/lib/supabase-store';
import {
  DESIGN_STATUS_COLORS, DESIGN_STATUS_LABELS, DESIGN_KANBAN_COLUMNS,
  EXCELLENCE_COLORS, EXCELLENCE_LABELS, DIFFICULTY_LABELS, DIFFICULTY_COLORS,
  SOURCE_LABELS, REASON_LABELS, STRAT_STATUS_LABELS,
  MOTION_STATUS_COLORS, MOTION_STATUS_LABELS,
  STRATEGIC_KANBAN_COLUMNS, GD_MOCKUP_KANBAN_COLUMNS, GD_NON_MOCKUP_KANBAN_COLUMNS,
  StrategicKanbanStatus,
  PIPELINE_LABELS, PIPELINE_COLORS,
  CAMPAIGN_NAMES, isValidCampaignName, normalizeCampaignName
} from '@/lib/constants';
import { formatDisplayDate, formatDisplayDateTime, cn, sanitizeUrl, getWeekOfMonth, getISOWeekNumber, getWeekRangeLabel, extractErrorMessage, canUserDeleteTask } from '@/lib/utils';
import { TaskWithRelations, CreateTaskInput, AssignTaskInput, DesignStatus, TaskSource, ReasonCategory, Client, ContentType, User as UserType, StratStatus, TaskComment, PipelineType, WeekPartitionKey, WeekPartitionInfo, TaskAttachment, AttachmentSection } from '@/lib/types';
import { filterTasksByPipeline, isMockupTask, canForwardToMotion, canUserManagePipeline, validateStageTransition } from '@/lib/pipeline-router';
import { getDueWeekPartition, getWeeklyPartitionsForMonth, isTaskOverdue, canUserRestoreTask } from '@/lib/archive-engine';
import {
  Plus, Search, Filter, LayoutGrid, List, X, ChevronRight, ChevronDown, Trash2,
  User, Clock, Tag, Send, RotateCcw, CheckCircle2, Undo2, Play, Edit3,
  AlertTriangle, AlertCircle, FileText, ExternalLink, ArrowRight, Download,
  MessageSquare, Loader2, Sparkles, Presentation, Film, GripVertical,
  MessageCircle, CornerDownRight, Check, Paperclip, Image as ImageIcon,
  Video as VideoIcon, Maximize2, Eye, FileVideo, XCircle,
  FolderCheck, Calendar, ChevronLeft, TrendingUp, Layers, CheckCheck, RefreshCw, Archive,
  Compass, ShoppingBag, Share2, Copy
} from 'lucide-react';
import { downloadCSV } from '@/lib/export';
import { TaskChatSection } from '@/components/task-chat-section';
import { RequestKanbanCard } from '@/components/request-kanban-card';
import { RequestImageUpload } from '@/components/request-image-upload';
import { useKanbanScroll } from '@/lib/use-kanban-scroll';
import { KanbanScrollToolbar, KanbanFloatingArrows } from '@/components/kanban-scroll-toolbar';

type ViewMode = 'kanban' | 'weekly' | 'table';

export default function TasksPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border-primary)', borderTopColor: 'var(--accent-blue)' }} />
      </div>
    }>
      <TasksPageContent />
    </Suspense>
  );
}

function TasksPageContent() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const taskIdParam = searchParams?.get('taskId');
  const tabParam = searchParams?.get('tab') as 'details' | 'chat' | null;
  const sectionParam = searchParams?.get('section') as 'active' | 'archive' | null;
  const pipelineParam = searchParams?.get('pipeline') as PipelineType | null;

  const [activePipeline, setActivePipeline] = usePersistedState<PipelineType>(
    'cmos_tasks_active_pipeline',
    (pipelineParam && ['STRATEGIC', 'GD_MOCKUP', 'GD_NON_MOCKUP'].includes(pipelineParam))
      ? pipelineParam
      : 'GD_MOCKUP'
  );

  useEffect(() => {
    if (pipelineParam && ['STRATEGIC', 'GD_MOCKUP', 'GD_NON_MOCKUP'].includes(pipelineParam)) {
      setActivePipeline(pipelineParam);
    }
  }, [pipelineParam, setActivePipeline]);

  const [mainTab, setMainTab] = useState<'active' | 'archive'>('active');

  useEffect(() => {
    if (sectionParam === 'archive') {
      router.replace('/dashboard/motion?tab=archive');
    }
  }, [sectionParam, router]);

  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [forwardingMotionTaskId, setForwardingMotionTaskId] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [allUsers, setAllUsers] = useState<UserType[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Active Pipeline Filters & Quick Filter Chips (Stitch Design Specification)
  type QuickFilter = 'all' | 'my_tasks' | 'overdue' | 'needs_review';

  const [viewMode, setViewMode] = usePersistedState<ViewMode>('cmos_tasks_view_mode', 'kanban');
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

  // Approved Archive Filters, Period Navigation & View Mode
  const [archiveViewMode, setArchiveViewMode] = usePersistedState<'kanban' | 'table'>('cmos_tasks_archive_view_mode', 'kanban');
  const [archiveYear, setArchiveYear] = usePersistedState<string>('cmos_tasks_archive_year', String(new Date().getFullYear()));
  const [archiveMonth, setArchiveMonth] = usePersistedState<string>('cmos_tasks_archive_month', String(new Date().getMonth() + 1));
  const [archiveWeek, setArchiveWeek] = usePersistedState<string>('cmos_tasks_archive_week', 'all');
  const [archiveSearch, setArchiveSearch] = usePersistedState<string>('cmos_tasks_archive_search', '');
  const [archiveRequester, setArchiveRequester] = usePersistedState<string>('cmos_tasks_archive_requester', 'all');
  const [archivePic, setArchivePic] = usePersistedState<string>('cmos_tasks_archive_pic', 'all');
  const [archiveSort, setArchiveSort] = usePersistedState<string>('cmos_tasks_archive_sort', 'approved_desc');
  const [archivePage, setArchivePage] = usePersistedState<number>('cmos_tasks_archive_page', 1);
  const [archiveLimit, setArchiveLimit] = usePersistedState<number>('cmos_tasks_archive_limit', 15);

  const refreshTasks = useCallback(async () => {
    try {
      // Trigger monthly auto-archive idempotently on refresh
      try {
        await autoArchiveCompletedTasks();
      } catch (e) {
        console.warn('Auto archive background run error:', e);
      }

      const [tData, cData, ctData, uData] = await Promise.all([
        getAllTasksWithRelations(),
        getClients(),
        getContentTypes(),
        getUsers()
      ]);
      setTasks(tData);
      setClients(cData);
      setContentTypes(ctData);
      setAllUsers(uData);
    } catch (err) {
      console.error('Error fetching Supabase tasks:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleForwardTaskToMotion = useCallback(async (
    taskId: string,
    requireConfirmation = true
  ): Promise<boolean> => {
    if (!user) throw new Error('Sesi pengguna tidak tersedia.');
    const targetTask = tasks.find(t => t.id === taskId);
    const taskCode = targetTask?.task_code || taskId;
    if (requireConfirmation && !window.confirm(`Teruskan request ${taskCode} ke Motion Pipeline?`)) return false;
    if (forwardingMotionTaskId === taskId) return false;

    setForwardingMotionTaskId(taskId);
    try {
      await forwardTaskToMotion(taskId, user.id);
      window.alert(`Request ${taskCode} berhasil diteruskan ke Motion Pipeline.`);
      await refreshTasks();
      return true;
    } finally {
      setForwardingMotionTaskId(null);
    }
  }, [user, tasks, forwardingMotionTaskId, refreshTasks]);

  // ===================== UNIFIED MODAL LIFECYCLE MANAGER =====================
  type TaskModalType = 'CREATE' | 'EDIT' | 'DETAIL' | 'ASSIGN' | 'REVISION' | 'SUBMIT' | 'STRAT_SUBMIT';

  const {
    activeModal,
    isOpen,
    getPayload,
    openModal,
    closeModal,
    switchModal,
  } = useModalManager<TaskModalType>({ lockScroll: true, closeOnEscape: true });

  const clearTaskIdParam = useCallback(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('taskId=')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('taskId');
      url.searchParams.delete('tab');
      window.history.replaceState(null, '', url.pathname + (url.search ? url.search : ''));
    }
  }, []);

  const handleCloseAnyModal = useCallback(() => {
    closeModal();
    clearTaskIdParam();
    refreshTasks();
  }, [closeModal, clearTaskIdParam, refreshTasks]);

  // Backward-compatible adapters to seamlessly interface with existing card and table buttons
  const showCreateModal = isOpen('CREATE');
  const showEditModal = isOpen('EDIT') ? getPayload<{ taskId: string }>('EDIT')?.taskId || null : null;
  const showDetailModal = isOpen('DETAIL') ? getPayload<{ taskId: string }>('DETAIL')?.taskId || null : null;
  const modalInitialTab = isOpen('DETAIL') ? getPayload<{ initialTab?: 'details' | 'chat' }>('DETAIL')?.initialTab || 'details' : 'details';
  const showAssignModal = isOpen('ASSIGN') ? getPayload<{ taskId: string }>('ASSIGN')?.taskId || null : null;
  const showRevisionModal = isOpen('REVISION') ? getPayload<{ taskId: string; stage: 'STRATEGIC' | 'DESIGN' }>('REVISION') || null : null;
  const showSubmitModal = isOpen('SUBMIT') ? getPayload<{ taskId: string; targetAfterSubmit?: DesignStatus | null }>('SUBMIT') || null : null;
  const showStratSubmitModal = isOpen('STRAT_SUBMIT') ? getPayload<{ taskId: string; targetAfterSubmit?: StratStatus | null }>('STRAT_SUBMIT') || null : null;
  const [handoverGDModalTaskId, setHandoverGDModalTaskId] = useState<string | null>(null);
  const handleOpenHandoverGDModal = useCallback((taskId: string) => {
    setHandoverGDModalTaskId(taskId);
  }, []);

  const setShowCreateModal = useCallback((show: boolean) => {
    if (show) openModal('CREATE');
    else handleCloseAnyModal();
  }, [openModal, handleCloseAnyModal]);

  const setShowEditModal = useCallback((taskId: string | null) => {
    if (taskId) openModal('EDIT', { taskId });
    else handleCloseAnyModal();
  }, [openModal, handleCloseAnyModal]);

  const setShowDetailModal = useCallback((taskId: string | null, tab: 'details' | 'chat' = 'details') => {
    if (taskId) openModal('DETAIL', { taskId, initialTab: tab });
    else handleCloseAnyModal();
  }, [openModal, handleCloseAnyModal]);

  const setModalInitialTab = useCallback((tab: 'details' | 'chat') => {
    if (activeModal?.type === 'DETAIL') {
      const current = getPayload<{ taskId: string }>('DETAIL');
      if (current?.taskId) {
        openModal('DETAIL', { taskId: current.taskId, initialTab: tab });
      }
    }
  }, [activeModal, getPayload, openModal]);

  const setShowAssignModal = useCallback((taskId: string | null) => {
    if (taskId) openModal('ASSIGN', { taskId });
    else handleCloseAnyModal();
  }, [openModal, handleCloseAnyModal]);

  const setShowRevisionModal = useCallback((payload: { taskId: string; stage: 'STRATEGIC' | 'DESIGN' } | null) => {
    if (payload) openModal('REVISION', payload);
    else handleCloseAnyModal();
  }, [openModal, handleCloseAnyModal]);

  const setShowSubmitModal = useCallback((payload: { taskId: string; targetAfterSubmit?: DesignStatus | null } | string | null) => {
    if (!payload) {
      handleCloseAnyModal();
      return;
    }
    const taskId = typeof payload === 'string' ? payload : payload.taskId;
    const targetAfterSubmit = typeof payload === 'object' ? payload.targetAfterSubmit : null;
    openModal('SUBMIT', { taskId, targetAfterSubmit });
  }, [openModal, handleCloseAnyModal]);

  const setShowStratSubmitModal = useCallback((payload: { taskId: string; targetAfterSubmit?: StratStatus | null } | string | null) => {
    if (!payload) {
      handleCloseAnyModal();
      return;
    }
    const taskId = typeof payload === 'string' ? payload : payload.taskId;
    const targetAfterSubmit = typeof payload === 'object' ? payload.targetAfterSubmit : null;
    openModal('STRAT_SUBMIT', { taskId, targetAfterSubmit });
  }, [openModal, handleCloseAnyModal]);

  // Auto-open task modal from query params (runs exactly once per taskIdParam to prevent phantom re-opening on background refreshes)
  const openedTaskIdParamRef = useRef<string | null>(null);
  useEffect(() => {
    if (taskIdParam && tasks.length > 0 && openedTaskIdParamRef.current !== taskIdParam) {
      const matched = tasks.find(t => t.id === taskIdParam || t.task_code === taskIdParam);
      if (matched) {
        openedTaskIdParamRef.current = taskIdParam;
        openModal('DETAIL', { taskId: matched.id, initialTab: tabParam === 'chat' ? 'chat' : 'details' });
      }
    }
  }, [taskIdParam, tabParam, tasks, openModal]);



  // Drag & Drop State
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const canMoveTask = useCallback((t: TaskWithRelations) => {
    if (!user) return false;
    if (['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name)) return true;
    if (activePipeline === 'STRATEGIC') {
      if (t.status_strat === 'APPROVED') return false;
      if (user.role_name === 'STRATEGIC_PIC' && (t.strat_pic_id === user.id || t.strat_pic_ids?.includes(user.id))) return true;
      if (user.role_name === 'REQUESTER' && t.created_by === user.id) return true;
      return false;
    }
    if (user.role_name === 'DESIGNER' && t.design_pic_id === user.id) return true;
    if (user.role_name === 'REQUESTER' && t.created_by === user.id) return true;
    return false;
  }, [user, activePipeline]);

  const handleDragStart = (e: React.DragEvent, task: TaskWithRelations) => {
    if (!canMoveTask(task)) {
      e.preventDefault();
      return;
    }
    setDraggedTaskId(task.id);
    e.dataTransfer.setData('text/plain', task.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, targetStatus: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColumn !== targetStatus) {
      setDragOverColumn(targetStatus);
    }
  };

  const handleDragLeave = (e: React.DragEvent, targetStatus: string) => {
    if (dragOverColumn === targetStatus) {
      setDragOverColumn(null);
    }
  };

  interface StrategicForwardModalData {
    isOpen: boolean;
    requestName: string;
    taskCode: string;
    targetPipeline: PipelineType;
    targetPipelineLabel: string;
    newStatus: string;
    brandName: string;
    category: string;
  }

  const [strategicForwardModal, setStrategicForwardModal] = useState<StrategicForwardModalData | null>(null);
  const [isApprovingStrategic, setIsApprovingStrategic] = useState(false);

  const handleStrategicApprove = useCallback(async (task: TaskWithRelations) => {
    if (!user) return;
    if (isApprovingStrategic) return;
    const isAssigned = task.strat_pic_id === user.id || (task.strat_pic_ids && task.strat_pic_ids.includes(user.id));
    if (!['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name) && !isAssigned) {
      alert('Hanya Requester, Strategic PIC yang ditugaskan, Team Lead, atau Admin yang dapat menyetujui Strategic Concept.');
      return;
    }
    try {
      setIsApprovingStrategic(true);
      await updateStratStatus(task.id, 'APPROVED', user.id);
      await refreshTasks();
    } catch (err: any) {
      console.error('Error approving strategic task:', err);
      alert(`Gagal menyetujui request: ${err?.message || err}`);
    } finally {
      setIsApprovingStrategic(false);
    }
  }, [user, isApprovingStrategic, refreshTasks]);

  const handleDrop = async (e: React.DragEvent, targetStatus: string) => {
    e.preventDefault();
    setDragOverColumn(null);
    const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId;
    setDraggedTaskId(null);

    if (!taskId || !user) return;
    if (isReadOnly) {
      alert(`Mode Read-Only: Role ${user.role_name} tidak memiliki izin untuk memindahkan card pada ${PIPELINE_LABELS[activePipeline]}.`);
      return;
    }
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    try {
      if (activePipeline === 'STRATEGIC') {
        const target = targetStatus as StrategicKanbanStatus | StratStatus;
        const normalizedTarget = (
          target === 'STRAT_PENDING' ? 'PENDING' :
          target === 'STRAT_IN_PROGRESS' ? 'IN_PROGRESS' :
          target === 'STRAT_REVIEW' ? 'REVIEW' :
          target === 'STRAT_REVISION' ? 'REVISION' : target
        ) as StratStatus;

        if (task.status_strat === normalizedTarget) return;

        const stageCheck = validateStageTransition('STRATEGIC', task.status_strat, normalizedTarget, {
          hasPic: Boolean(task.strat_pic_id || (task.strat_pic_ids && task.strat_pic_ids.length > 0)),
          userRole: user.role_name
        });

        if (!stageCheck.allowed) {
          alert(stageCheck.reason || 'Perpindahan tahapan tidak diizinkan.');
          return;
        }

        if (normalizedTarget === 'PENDING') {
          if (!['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name)) {
            alert('Hanya Admin, Team Lead, Requester, atau Strategic PIC yang dapat mengembalikan status ke Brief In.');
            return;
          }
          await updateStratStatus(task.id, 'PENDING', user.id);
          refreshTasks();
        } else if (normalizedTarget === 'IN_PROGRESS') {
          const isAssigned = task.strat_pic_id === user.id || (task.strat_pic_ids && task.strat_pic_ids.includes(user.id));
          if (!['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name) && !isAssigned) {
            alert('Hanya Strategic PIC, Requester, atau Lead yang dapat memulai pengerjaan strategi.');
            return;
          }
          await updateStratStatus(task.id, 'IN_PROGRESS', user.id);
          refreshTasks();
        } else if (normalizedTarget === 'REVIEW') {
          const isAssigned = task.strat_pic_id === user.id || (task.strat_pic_ids && task.strat_pic_ids.includes(user.id));
          if (!['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name) && !isAssigned) {
            alert('Hanya Strategic PIC, Requester, atau Lead yang dapat men-submit deck strategi.');
            return;
          }
          setShowStratSubmitModal({ taskId: task.id, targetAfterSubmit: null });
          return;
        } else if (normalizedTarget === 'REVISION') {
          const isLeadOrAdmin = ['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name);
          const isCreatorRequester = user.role_name === 'REQUESTER' && task.created_by === user.id;
          if (!isLeadOrAdmin && !isCreatorRequester) {
            alert('Hanya Requester, Strategic PIC, Team Lead, atau Admin yang dapat meminta revisi konsep strategis.');
            return;
          }
          setShowRevisionModal({ taskId: task.id, stage: 'STRATEGIC' });
          return;
        } else if (normalizedTarget === 'APPROVED') {
          await handleStrategicApprove(task);
        }
        return;
      }

      // GD_MOCKUP and GD_NON_MOCKUP
      const targetDesignStatus = targetStatus as DesignStatus;
      if (task.status_design === targetDesignStatus) return;

      const stageCheck = validateStageTransition(activePipeline, task.status_design, targetDesignStatus, {
        hasPic: Boolean(task.design_pic_id),
        userRole: user.role_name
      });

      if (!stageCheck.allowed) {
        alert(stageCheck.reason || 'Perpindahan tahapan tidak diizinkan.');
        return;
      }

      if (targetDesignStatus === 'DESIGN_UNASSIGNED') {
        if (!['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name)) {
          alert('Hanya Admin, Team Lead, Requester, atau Strategic PIC yang dapat memindahkan tiket ke Unassigned.');
          return;
        }
        await updateTaskStatus(task.id, 'DESIGN_UNASSIGNED', user.id);
        refreshTasks();
      } else if (targetDesignStatus === 'DESIGN_ASSIGNED') {
        if (!['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name)) {
          alert('Hanya Admin, Team Lead, Requester, atau Strategic PIC yang dapat menetapkan PIC Desainer.');
          return;
        }
        if (!task.design_pic_id) {
          setShowAssignModal(task.id);
        } else {
          await updateTaskStatus(task.id, 'DESIGN_ASSIGNED', user.id);
          refreshTasks();
        }
      } else if (targetDesignStatus === 'DESIGN_IN_PROGRESS') {
        if (!['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name) && task.design_pic_id !== user.id) {
          alert('Hanya desainer yang ditugaskan, Requester, Strategic PIC, atau Lead yang dapat memulai pengerjaan desain.');
          return;
        }
        await updateTaskStatus(task.id, 'DESIGN_IN_PROGRESS', user.id);
        refreshTasks();
      } else if (targetDesignStatus === 'DESIGN_SUBMITTED') {
        if (!['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name) && task.design_pic_id !== user.id) {
          alert('Hanya desainer yang ditugaskan, Requester, Strategic PIC, atau Lead yang dapat men-submit hasil desain.');
          return;
        }
        setShowSubmitModal({ taskId: task.id, targetAfterSubmit: null });
      } else if (targetDesignStatus === 'DESIGN_REVISION') {
        const isLeadOrAdmin = ['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name);
        const isCreatorRequester = user.role_name === 'REQUESTER' && task.created_by === user.id;
        if (!isLeadOrAdmin && !isCreatorRequester) {
          alert('Hanya Requester, Strategic PIC, Team Lead, atau Admin yang dapat meminta revisi desain.');
          return;
        }
        setShowRevisionModal({ taskId: task.id, stage: 'DESIGN' });
      } else if (targetDesignStatus === 'DESIGN_APPROVED') {
        if (!['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name)) {
          alert('Hanya Requester, Strategic PIC, Team Lead, atau Admin yang dapat menyetujui desain.');
          return;
        }
        await updateTaskStatus(task.id, 'DESIGN_APPROVED', user.id);
        refreshTasks();
      } else if (targetDesignStatus === 'STRAT_PENDING') {
        if (!['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name)) {
          alert('Hanya Admin, Team Lead, Requester, atau Strategic PIC yang dapat memindahkan ke Strategic Pending.');
          return;
        }
        await updateTaskStatus(task.id, 'STRAT_PENDING', user.id);
        refreshTasks();
      } else if (targetDesignStatus === 'TASK_CLOSED') {
        if (!['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name)) {
          alert('Hanya Admin, Team Lead, Requester, atau Strategic PIC yang dapat menutup tiket.');
          return;
        }
        if (task.status_design !== 'DESIGN_APPROVED') {
          alert('Hanya tiket yang sudah di-approve yang dapat di-close.');
          return;
        }
        await updateTaskStatus(task.id, 'TASK_CLOSED', user.id);
        refreshTasks();
      } else {
        await updateTaskStatus(task.id, targetDesignStatus, user.id);
        refreshTasks();
      }
    } catch (err: any) {
      console.error('Error on drag & drop transition:', err);
      const errMsg = err?.message || err?.details || (typeof err === 'object' ? JSON.stringify(err) : String(err));
      alert(`Gagal mengubah status: ${errMsg}`);
    }
  };

  const handleRestoreTask = async (taskId: string) => {
    if (!user) return;
    try {
      const res = await restoreTask(taskId, user.id, user);
      if (res.success) {
        await refreshTasks();
        alert('Card berhasil dipulihkan (restored) ke papan kerja aktif.');
      } else {
        alert(`Gagal memulihkan card: ${res.message}`);
      }
    } catch (err: any) {
      alert(`Error restore task: ${err.message || err}`);
    }
  };

  useEffect(() => { 
    refreshTasks(); 
  }, [refreshTasks]);

  const formatPeriod = (yyyyMm: string) => {
    if (!yyyyMm) return '';
    const [y, m] = yyyyMm.split('-');
    const date = new Date(parseInt(y), parseInt(m) - 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };
  const allMonths = Array.from({length: 12}, (_, i) => String(i + 1).padStart(2, '0'));
  
  const availableYears = Array.from(new Set([
    ...tasks.map(t => (t.created_at || '').substring(0, 4)).filter(Boolean),
    ...tasks.map(t => (t.req_date || '').substring(0, 4)).filter(Boolean),
    String(new Date().getFullYear())
  ])).sort().reverse();

  const getMonthName = (m: string) => {
    const date = new Date(2000, parseInt(m) - 1);
    return date.toLocaleDateString('en-US', { month: 'short' });
  };

  const handleSwitchPipeline = (p: PipelineType) => {
    if (p === 'MOTION') {
      router.push('/dashboard/motion');
      return;
    }
    setActivePipeline(p);
    const params = new URLSearchParams();
    params.set('pipeline', p);
    if (searchQuery.trim()) params.set('q', searchQuery.trim());
    if (selectedBrand && selectedBrand !== 'all') params.set('brand', selectedBrand);
    if (quickFilter && quickFilter !== 'all') params.set('status', quickFilter);
    router.replace(`/dashboard/tasks?${params.toString()}`);
  };

  const strategicActiveCount = useMemo(() => {
    return filterTasksByPipeline(tasks, 'STRATEGIC').filter(t => t.restored_at ? !t.is_archived : t.status_design !== 'TASK_CLOSED').length;
  }, [tasks]);

  const gdMockupActiveCount = useMemo(() => {
    return filterTasksByPipeline(tasks, 'GD_MOCKUP').filter(t => t.restored_at ? !t.is_archived : (t.status_design !== 'DESIGN_APPROVED' && t.status_design !== 'TASK_CLOSED')).length;
  }, [tasks]);

  const gdNonMockupActiveCount = useMemo(() => {
    return filterTasksByPipeline(tasks, 'GD_NON_MOCKUP').filter(t => t.restored_at ? !t.is_archived : (t.status_design !== 'DESIGN_APPROVED' && t.status_design !== 'TASK_CLOSED')).length;
  }, [tasks]);

  const motionActiveCount = useMemo(() => {
    return tasks.filter(t => Boolean(t.motion_task) && t.motion_task?.status_motion !== 'APPROVED' && t.motion_task?.status_motion !== 'COMPLETED').length;
  }, [tasks]);

  const isReadOnly = useMemo(() => {
    if (!user) return true;
    if (['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name)) return false;
    if (activePipeline === 'STRATEGIC') {
      return !['STRATEGIC_PIC', 'REQUESTER'].includes(user.role_name);
    }
    return !canUserManagePipeline(activePipeline, user.role_name);
  }, [user, activePipeline]);


  const currentColumns = useMemo(() => {
    if (activePipeline === 'STRATEGIC') return STRATEGIC_KANBAN_COLUMNS;
    if (activePipeline === 'GD_NON_MOCKUP') return GD_NON_MOCKUP_KANBAN_COLUMNS;
    return GD_MOCKUP_KANBAN_COLUMNS;
  }, [activePipeline]);

  const pipelineTasks = useMemo(() => {
    return filterTasksByPipeline(tasks, activePipeline);
  }, [tasks, activePipeline]);

  // Unique available brands across clients and pipeline tasks
  const availableBrands = useMemo(() => {
    const brands = new Set<string>();
    clients.forEach(c => {
      if (c.name) brands.add(c.name);
    });
    tasks.forEach(t => {
      if (t.client_name) brands.add(t.client_name);
    });
    return Array.from(brands).sort();
  }, [clients, tasks]);

  // Quick filter condition predicates
  const isMyAssignedTask = useCallback((t: TaskWithRelations) => {
    if (!user) return false;
    if (activePipeline === 'STRATEGIC') {
      return t.strat_pic_id === user.id || Boolean(t.strat_pic_ids && t.strat_pic_ids.includes(user.id));
    }
    return t.design_pic_id === user.id;
  }, [user, activePipeline]);

  const isTaskOverdueItem = useCallback((t: TaskWithRelations) => {
    const status = activePipeline === 'STRATEGIC' ? t.status_strat : t.status_design;
    if (['TASK_CLOSED', 'COMPLETED', 'DESIGN_APPROVED', 'APPROVED'].includes(status)) return false;
    return isTaskOverdue(t.due_date, status);
  }, [activePipeline]);

  const isNeedsReview = useCallback((t: TaskWithRelations) => {
    if (activePipeline === 'STRATEGIC') {
      return ['SUBMITTED', 'REVIEW', 'STRAT_REVIEW'].includes(t.status_strat);
    }
    return ['DESIGN_SUBMITTED', 'SUBMITTED', 'REVIEW', 'PENDING_APPROVAL'].includes(t.status_design);
  }, [activePipeline]);

  const matchSearch = useCallback((t: TaskWithRelations) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const taskCode = (t.task_code || '').toLowerCase();
    const brand = (t.client_name || '').toLowerCase();
    const stratPic = (t.strat_pic_name || '').toLowerCase();
    const designPic = (t.design_pic_name || '').toLowerCase();
    const creatorUser = allUsers.find(u => u.id === t.created_by);
    const creatorName = (creatorUser?.full_name || '').toLowerCase();
    const campaign = (t.campaign_name || '').toLowerCase();
    return taskCode.includes(q) || brand.includes(q) || stratPic.includes(q) || designPic.includes(q) || creatorName.includes(q) || campaign.includes(q);
  }, [searchQuery, allUsers]);

  // Scoped tasks filtered by active status, brand, and text search
  const baseScopedTasks = useMemo(() => {
    return pipelineTasks.filter(t => {
      if (t.is_archived === true) return false;
      if (activePipeline === 'STRATEGIC') {
        if (t.status_design === 'TASK_CLOSED' && !t.restored_at) return false;
        if ((Boolean(t.spawned_design_task_id) || tasks.some(st => st.source_strategic_task_id === t.id)) && !t.restored_at) return false;
      } else {
        if ((t.status_design === 'TASK_CLOSED' || t.motion_readiness === 'READY_TO_ANIMATE' || Boolean(t.motion_task)) && !t.restored_at) return false;
      }
      const matchesBrand = selectedBrand === 'all' || t.client_name === selectedBrand;
      return matchSearch(t) && matchesBrand;
    });
  }, [pipelineTasks, activePipeline, matchSearch, selectedBrand, tasks]);

  // Dynamic real-time counts for the 3 Quick Filter Chips
  const myAssignedCount = useMemo(() => {
    return baseScopedTasks.filter(isMyAssignedTask).length;
  }, [baseScopedTasks, isMyAssignedTask]);

  const overdueCount = useMemo(() => {
    return baseScopedTasks.filter(isTaskOverdueItem).length;
  }, [baseScopedTasks, isTaskOverdueItem]);

  const needsReviewCount = useMemo(() => {
    return baseScopedTasks.filter(isNeedsReview).length;
  }, [baseScopedTasks, isNeedsReview]);

  // Final filtered tasks combining text search, brand dropdown, and quick filter chips
  const filteredTasks = useMemo(() => {
    if (quickFilter === 'my_tasks') {
      return baseScopedTasks.filter(isMyAssignedTask);
    }
    if (quickFilter === 'overdue') {
      return baseScopedTasks.filter(isTaskOverdueItem);
    }
    if (quickFilter === 'needs_review') {
      return baseScopedTasks.filter(isNeedsReview);
    }
    return baseScopedTasks;
  }, [baseScopedTasks, quickFilter, isMyAssignedTask, isTaskOverdueItem, isNeedsReview]);

  // Horizontal Scroll & Column Navigation
  const kanbanScroll = useKanbanScroll({
    storageKey: 'cmos_tasks_kanban_width_mode',
    defaultWidthMode: 'normal',
  });

  const kanbanColumnInfos = useMemo(() => {
    return currentColumns.map(col => {
      const colTasks = filteredTasks.filter(t => {
        if (activePipeline === 'STRATEGIC') {
          if (col.status === 'STRAT_PENDING') return t.status_strat === 'PENDING';
          if (col.status === 'STRAT_IN_PROGRESS') return t.status_strat === 'IN_PROGRESS';
          if (col.status === 'STRAT_REVIEW') return t.status_strat === 'REVIEW';
          if (col.status === 'STRAT_REVISION') return t.status_strat === 'REVISION';
          if (col.status === 'APPROVED') {
            return t.status_strat === 'APPROVED' && !t.spawned_design_task_id && !tasks.some(st => st.source_strategic_task_id === t.id);
          }
          return false;
        }
        if (col.status === 'DESIGN_APPROVED') {
          return (t.status_design === 'DESIGN_APPROVED' || (t.status_design === 'TASK_CLOSED' && Boolean(t.restored_at)))
            && !t.motion_task && t.motion_readiness !== 'READY_TO_ANIMATE';
        }
        return t.status_design === (col.status as DesignStatus);
      });
      return {
        status: col.status,
        label: col.label,
        color: col.color,
        count: colTasks.length,
      };
    });
  }, [currentColumns, filteredTasks, activePipeline, tasks]);

  const handleExportCSV = useCallback(() => {
    if (activePipeline === 'STRATEGIC') {
      downloadCSV(filteredTasks.map(t => ({
        'Task Code': t.task_code,
        'Brand': t.client_name,
        'Campaign': t.campaign_name,
        'Strategic PIC': t.strat_pic_name || 'Unassigned',
        'Deck Concept': t.strat_concept_link || '-',
        'Req Date': t.req_date ? new Date(t.req_date).toLocaleDateString() : '-',
        'Due Date': t.due_date ? new Date(t.due_date).toLocaleDateString() : '-',
        'Status': STRAT_STATUS_LABELS[t.status_strat] || t.status_strat
      })), 'Strategic_Pipeline_Export.csv');
    } else if (activePipeline === 'GD_NON_MOCKUP') {
      downloadCSV(filteredTasks.map(t => ({
        'Task Code': t.task_code,
        'Brand': t.client_name,
        'Campaign': t.campaign_name,
        'Content Type': t.content_type_name || 'Design',
        'Source': t.task_source || 'Orca',
        'Designer': t.design_pic_name || 'Unassigned',
        'Req Date': t.req_date ? new Date(t.req_date).toLocaleDateString() : '-',
        'Due Date': t.due_date ? new Date(t.due_date).toLocaleDateString() : '-',
        'Status': DESIGN_STATUS_LABELS[t.status_design as keyof typeof DESIGN_STATUS_LABELS] || t.status_design
      })), 'GD_Non_Mockup_Export.csv');
    } else {
      downloadCSV(filteredTasks.map(t => ({
        'Task Code': t.task_code,
        'Brand': t.client_name,
        'Campaign': t.campaign_name,
        'Content Type': t.content_type_name || 'Design',
        'Source': t.task_source || 'Orca',
        'Designer': t.design_pic_name || 'Unassigned',
        'Req Date': t.req_date ? new Date(t.req_date).toLocaleDateString() : '-',
        'Due Date': t.due_date ? new Date(t.due_date).toLocaleDateString() : '-',
        'Status': DESIGN_STATUS_LABELS[t.status_design as keyof typeof DESIGN_STATUS_LABELS] || t.status_design
      })), 'GD_Mockup_Export.csv');
    }
  }, [activePipeline, filteredTasks]);

  const handleDeleteTask = useCallback(async (taskId: string, taskCode?: string, clientName?: string) => {
    if (!user) return;
    const label = taskCode ? `${taskCode}${clientName ? ` (${clientName})` : ''}` : 'request ini';
    const confirmed = window.confirm(`Apakah Anda yakin ingin menghapus ${label}? Tindakan ini tidak dapat dibatalkan.`);
    if (!confirmed) return;

    try {
      await deleteTask(taskId, user.id);
      refreshTasks();
      if (showDetailModal === taskId) {
        setShowDetailModal(null);
      }
    } catch (err: any) {
      console.error('Gagal menghapus task:', err);
      alert(`Gagal menghapus task: ${err?.message || err}`);
    }
  }, [user, showDetailModal, refreshTasks]);

  // Weekly Partition helpers for Active Tasks
  const activeWeeklyYear = useMemo(() => new Date().getFullYear(), []);
  const activeWeeklyMonth = useMemo(() => new Date().getMonth() + 1, []);

  const weeklyPartitions = useMemo(() => {
    return getWeeklyPartitionsForMonth(activeWeeklyYear, activeWeeklyMonth);
  }, [activeWeeklyYear, activeWeeklyMonth]);

  const pastOverdueTasks = useMemo(() => {
    return filteredTasks.filter(task => {
      if (!task.due_date) return false;
      if (['TASK_CLOSED', 'DESIGN_APPROVED', 'APPROVED'].includes(task.status_design)) return false;
      const parts = task.due_date.split('T')[0].split('-');
      if (parts.length < 3) return false;
      const tYear = parseInt(parts[0], 10);
      const tMonth = parseInt(parts[1], 10);
      if (tYear < activeWeeklyYear || (tYear === activeWeeklyYear && tMonth < activeWeeklyMonth)) {
        return true;
      }
      return false;
    });
  }, [filteredTasks, activeWeeklyYear, activeWeeklyMonth]);

  const getWeeklyTasksForPartition = useCallback((partitionKey: WeekPartitionKey) => {
    return filteredTasks.filter(task => {
      const part = getDueWeekPartition(task.due_date);
      if (partitionKey === 'NO_DUE_DATE') {
        return part === 'NO_DUE_DATE';
      }
      if (part !== partitionKey) return false;

      // Filter by active month/year if due date is present
      if (task.due_date) {
        const parts = task.due_date.split('T')[0].split('-');
        if (parts.length >= 2) {
          const tYear = parseInt(parts[0], 10);
          const tMonth = parseInt(parts[1], 10);
          return tYear === activeWeeklyYear && tMonth === activeWeeklyMonth;
        }
      }
      return true;
    });
  }, [filteredTasks, activeWeeklyYear, activeWeeklyMonth]);

  // 1. All Accessible Approved Tasks (Archive Base with RBAC)
  const accessibleApprovedTasks = useMemo(() => {
    if (!user) return [];
    let list = tasks.filter(t => (t.is_archived === true || t.status_design === 'DESIGN_APPROVED' || t.status_design === 'TASK_CLOSED') && !t.restored_at);
    
    // Role-Based Access Control
    if (!['ADMIN', 'TEAM_LEAD'].includes(user.role_name)) {
      list = list.filter(t => {
        if (user.role_name === 'REQUESTER') return t.created_by === user.id;
        if (user.role_name === 'DESIGNER') return t.design_pic_id === user.id;
        if (user.role_name === 'STRATEGIC_PIC') return t.strat_pic_id === user.id || (t.strat_pic_ids && t.strat_pic_ids.includes(user.id));
        if (user.role_name === 'MOTION_PIC') return t.motion_task?.motion_pic_id === user.id;
        if (user.role_name === 'OPERATOR') return t.operator_id === user.id;
        return t.created_by === user.id || t.design_pic_id === user.id;
      });
    }
    return list;
  }, [tasks, user]);

  // Available archive years
  const availableArchiveYears = useMemo(() => {
    const years = new Set<string>();
    accessibleApprovedTasks.forEach(t => {
      const dt = t.approved_at || t.submission_date || t.updated_at || t.created_at;
      if (dt) years.add(new Date(dt).getFullYear().toString());
    });
    years.add(new Date().getFullYear().toString());
    return Array.from(years).sort().reverse();
  }, [accessibleApprovedTasks]);

  // Unique Approved Requesters & Designers
  const archiveUniqueRequesters = useMemo(() => {
    return Array.from(new Set(accessibleApprovedTasks.filter(t => t.created_by_name).map(t => t.created_by_name as string))).sort();
  }, [accessibleApprovedTasks]);

  const archiveUniquePics = useMemo(() => {
    return Array.from(new Set(accessibleApprovedTasks.filter(t => t.design_pic_name).map(t => t.design_pic_name as string))).sort();
  }, [accessibleApprovedTasks]);

  // Indonesian Month Name Lists
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

  // Period Navigation Handlers
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

  // Filtered Approved Tasks for Archive
  const filteredArchiveTasks = useMemo(() => {
    return accessibleApprovedTasks.filter(t => {
      const approvalDate = t.approved_at || t.submission_date || t.updated_at || t.created_at;
      const dateObj = new Date(approvalDate);
      const taskYear = dateObj.getFullYear().toString();
      const taskMonth = (dateObj.getMonth() + 1).toString();
      const taskWeek = getWeekOfMonth(approvalDate).toString();

      // Year filter
      if (archiveYear !== 'all' && taskYear !== archiveYear) return false;

      // Month filter
      if (archiveMonth !== 'all' && taskMonth !== archiveMonth) return false;

      // Week filter
      if (archiveWeek !== 'all' && taskWeek !== archiveWeek) return false;

      // Requester filter
      if (archiveRequester !== 'all' && t.created_by_name !== archiveRequester) return false;

      // PIC filter
      if (archivePic !== 'all' && t.design_pic_name !== archivePic) return false;

      // Search query (Task Code, Client/Brand, Campaign, Requester, Designer)
      if (archiveSearch.trim() !== '') {
        const q = archiveSearch.toLowerCase().trim();
        const codeMatch = (t.task_code || '').toLowerCase().includes(q);
        const clientMatch = (t.client_name || '').toLowerCase().includes(q);
        const campaignMatch = (t.campaign_name || '').toLowerCase().includes(q);
        const picMatch = (t.design_pic_name || '').toLowerCase().includes(q);
        const reqMatch = (t.created_by_name || '').toLowerCase().includes(q);
        if (!codeMatch && !clientMatch && !campaignMatch && !picMatch && !reqMatch) {
          return false;
        }
      }

      return true;
    });
  }, [accessibleApprovedTasks, archiveYear, archiveMonth, archiveWeek, archiveRequester, archivePic, archiveSearch]);

  // Sorted Approved Tasks
  const sortedArchiveTasks = useMemo(() => {
    const list = [...filteredArchiveTasks];
    list.sort((a, b) => {
      const dateA = new Date(a.approved_at || a.submission_date || a.updated_at || a.created_at).getTime();
      const dateB = new Date(b.approved_at || b.submission_date || b.updated_at || b.created_at).getTime();
      const reqDateA = new Date(a.req_date || a.created_at).getTime();
      const reqDateB = new Date(b.req_date || b.created_at).getTime();

      switch (archiveSort) {
        case 'approved_asc':
          return dateA - dateB;
        case 'req_date_desc':
          return reqDateB - reqDateA;
        case 'req_date_asc':
          return reqDateA - reqDateB;
        case 'code_asc':
          return (a.task_code || '').localeCompare(b.task_code || '');
        case 'code_desc':
          return (b.task_code || '').localeCompare(a.task_code || '');
        case 'approved_desc':
        default:
          return dateB - dateA;
      }
    });
    return list;
  }, [filteredArchiveTasks, archiveSort]);

  // Pagination for Archive Table View
  const totalArchivePages = Math.ceil(sortedArchiveTasks.length / archiveLimit) || 1;
  const paginatedArchiveTasks = useMemo(() => {
    const offset = (archivePage - 1) * archiveLimit;
    return sortedArchiveTasks.slice(offset, offset + archiveLimit);
  }, [sortedArchiveTasks, archivePage, archiveLimit]);

  // Summary Metrics for Archive
  const thisMonthApprovedCount = useMemo(() => {
    return accessibleApprovedTasks.filter(t => {
      const dt = t.approved_at || t.submission_date || t.updated_at || t.created_at;
      const d = new Date(dt);
      return d.getFullYear().toString() === archiveYear && (d.getMonth() + 1).toString() === archiveMonth;
    }).length;
  }, [accessibleApprovedTasks, archiveYear, archiveMonth]);

  const thisWeekApprovedCount = useMemo(() => {
    const now = new Date();
    const currentCalendarWeek = getWeekOfMonth(now);
    return accessibleApprovedTasks.filter(t => {
      const dt = t.approved_at || t.submission_date || t.updated_at || t.created_at;
      const d = new Date(dt);
      return d.getFullYear() === now.getFullYear() && (d.getMonth() + 1) === (now.getMonth() + 1) && getWeekOfMonth(dt) === currentCalendarWeek;
    }).length;
  }, [accessibleApprovedTasks]);

  const latestApprovalDateFormatted = useMemo(() => {
    if (accessibleApprovedTasks.length === 0) return '—';
    const sorted = [...accessibleApprovedTasks].sort((a, b) => {
      const dateA = new Date(a.approved_at || a.submission_date || a.updated_at || a.created_at).getTime();
      const dateB = new Date(b.approved_at || b.submission_date || b.updated_at || b.created_at).getTime();
      return dateB - dateA;
    });
    const latest = sorted[0];
    const dt = latest.approved_at || latest.submission_date || latest.updated_at || latest.created_at;
    return formatDisplayDate(dt);
  }, [accessibleApprovedTasks]);

  const archiveStats = useMemo(() => {
    const totalCount = filteredArchiveTasks.length;
    const totalOutputQty = filteredArchiveTasks.reduce((sum, t) => sum + (t.output_qty || t.req_qty || 1), 0);
    const excellenceCount = filteredArchiveTasks.filter(t => t.operational_excellence === 'EXCELLENCE').length;
    const excellenceRate = totalCount > 0 ? Math.round((excellenceCount / totalCount) * 100) : 0;
    return {
      totalCount,
      totalOutputQty,
      excellenceCount,
      excellenceRate
    };
  }, [filteredArchiveTasks]);

  const activeTasksCount = tasks.filter(t => t.restored_at ? !t.is_archived : (t.status_design !== 'DESIGN_APPROVED' && t.status_design !== 'TASK_CLOSED')).length;
  const approvedTasksCount = accessibleApprovedTasks.length;

  const archiveMonthOptions = [
    { value: 'all', label: 'Semua Bulan (All Months)' },
    { value: '1', label: 'Januari (Jan)' },
    { value: '2', label: 'Februari (Feb)' },
    { value: '3', label: 'Maret (Mar)' },
    { value: '4', label: 'April (Apr)' },
    { value: '5', label: 'Mei (May)' },
    { value: '6', label: 'Juni (Jun)' },
    { value: '7', label: 'Juli (Jul)' },
    { value: '8', label: 'Agustus (Aug)' },
    { value: '9', label: 'September (Sep)' },
    { value: '10', label: 'Oktober (Oct)' },
    { value: '11', label: 'November (Nov)' },
    { value: '12', label: 'Desember (Dec)' }
  ];

  const archiveWeekOptions = [
    { value: 'all', label: 'Semua Minggu (All Weeks)' },
    { value: '1', label: 'Minggu 1 (Tgl 1 - 7)' },
    { value: '2', label: 'Minggu 2 (Tgl 8 - 14)' },
    { value: '3', label: 'Minggu 3 (Tgl 15 - 21)' },
    { value: '4', label: 'Minggu 4 (Tgl 22 - 28)' },
    { value: '5', label: 'Minggu 5 (Tgl 29 - Akhir)' }
  ];

  if (!user) return null;

  return (
    <div className="space-y-5">
      {/* Top Header & Section Navigation */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[var(--border-secondary)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--bg-card)] border border-[var(--border-primary)] shadow-xs shrink-0">
            {activePipeline === 'STRATEGIC' ? (
              <Compass className="w-5 h-5 text-purple-500" />
            ) : activePipeline === 'GD_MOCKUP' ? (
              <Layers className="w-5 h-5 text-blue-500" />
            ) : (
              <ShoppingBag className="w-5 h-5 text-emerald-500" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-[var(--text-primary)]">
                {activePipeline === 'STRATEGIC' ? 'Strategic Pipeline'
                  : activePipeline === 'GD_MOCKUP' ? 'GD Mockup Pipeline'
                  : 'GD E-Commerce Pipeline'}
              </h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-secondary)] shadow-xs">
                {mainTab === 'active' 
                  ? `${activePipeline === 'STRATEGIC' ? strategicActiveCount : activePipeline === 'GD_NON_MOCKUP' ? gdNonMockupActiveCount : gdMockupActiveCount} Active`
                  : `${approvedTasksCount} Approved`}
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {activePipeline === 'STRATEGIC' ? 'Perumusan konsep visual & penyiapan deck strategi sebelum produksi desain.'
                : activePipeline === 'GD_MOCKUP' ? 'Produksi aset desain mockup statis yang terintegrasi dengan alur Motion.'
                : 'Papan kerja mandiri desain non-mockup, PDP e-commerce, banner promosi & aset internal.'}
            </p>
          </div>
        </div>

        {/* Section Switcher Navigation & Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* View Mode Toggle: Kanban | Weekly | Table */}
          <div className="flex items-center bg-[var(--bg-secondary)] p-0.5 rounded-lg border border-[var(--border-primary)] shadow-xs">
                <button
                  type="button"
                  onClick={() => setViewMode('kanban')}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md transition-all ${
                    viewMode === 'kanban'
                      ? 'bg-[var(--accent-blue)] text-white shadow-xs'
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
                      ? 'bg-[var(--accent-blue)] text-white shadow-xs'
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
                      ? 'bg-[var(--accent-blue)] text-white shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                  title="Table View"
                >
                  <List className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Table</span>
                </button>
              </div>

              {/* Export CSV */}
              <button
                type="button"
                onClick={handleExportCSV}
                className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-primary)] transition-colors shadow-xs"
                title="Export Filtered CSV"
              >
                <Download className="w-3.5 h-3.5" />
              </button>

              {/* New Task Button */}
              {['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name) && (
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 h-[32px] rounded-lg text-xs font-semibold bg-[var(--accent-blue)] text-white hover:bg-blue-600 transition-colors shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Task</span>
                </button>
              )}
        </div>
      </div>

      {/* ACTIVE PIPELINE VIEW */}
      {mainTab === 'active' && (
        <div className="space-y-4">

          {/* Read-Only Mode Banner */}
          {isReadOnly && (
            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400 text-xs font-semibold shadow-sm animate-fade-in">
              <Eye className="w-4 h-4 shrink-0 text-amber-400" />
              <span>
                Mode Read-Only: Anda sedang memantau {PIPELINE_LABELS[activePipeline]} dalam mode pantau (view-only). Pengelolaan pengerjaan dan perubahan status hanya dapat dilakukan oleh tim penanggung jawab.
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
                  className="h-[34px] w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-blue)] transition-all"
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

              {/* Dropdown Brand */}
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
                    ? 'bg-blue-500/20 border border-blue-500 text-blue-400 font-semibold shadow-sm'
                    : 'bg-[var(--bg-secondary)] border border-[var(--border-primary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span>My Assigned Tasks ({myAssignedCount})</span>
              </button>

              {/* • Overdue */}
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

      {/* KANBAN VIEW */}
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
              style={{ minHeight: 'calc(100vh - 200px)' }}
            >
              {currentColumns.map(col => {
                const colTasks = filteredTasks.filter(t => {
                  if (activePipeline === 'STRATEGIC') {
                    if (col.status === 'STRAT_PENDING') {
                      return t.status_strat === 'PENDING';
                    }
                    if (col.status === 'STRAT_IN_PROGRESS') {
                      return t.status_strat === 'IN_PROGRESS';
                    }
                    if (col.status === 'STRAT_REVIEW') {
                      return t.status_strat === 'REVIEW';
                    }
                    if (col.status === 'STRAT_REVISION') {
                      return t.status_strat === 'REVISION';
                    }
                    if (col.status === 'APPROVED') {
                      return t.status_strat === 'APPROVED' && !t.spawned_design_task_id && !tasks.some(st => st.source_strategic_task_id === t.id);
                    }
                    return false;
                  }
                  if (col.status === 'DESIGN_APPROVED') {
                    return (t.status_design === 'DESIGN_APPROVED' || (t.status_design === 'TASK_CLOSED' && Boolean(t.restored_at)))
                      && !t.motion_task && t.motion_readiness !== 'READY_TO_ANIMATE';
                  }
                  return t.status_design === (col.status as DesignStatus);
                });
                const isTargetOver = dragOverColumn === col.status;
                return (
                  <div 
                    key={col.status} 
                    data-column-status={col.status}
                    onDragOver={(e) => handleDragOver(e, col.status)}
                    onDragLeave={(e) => handleDragLeave(e, col.status)}
                    onDrop={(e) => handleDrop(e, col.status)}
                    className={`kanban-column flex-shrink-0 ${
                      kanbanScroll.columnWidthMode === 'compact' ? 'w-[260px]' : 'w-[320px]'
                    } snap-center transition-all duration-200 flex flex-col ${
                      isTargetOver ? 'ring-2 ring-[var(--accent-blue)] bg-[var(--bg-tertiary)]/60 shadow-lg scale-[1.01]' : ''
                    }`}
                  >
                    <div className="p-4 flex items-center justify-between sticky top-0 bg-[var(--bg-secondary)] z-10" style={{ borderBottom: '1px solid var(--border-secondary)', borderTopLeftRadius: '16px', borderTopRightRadius: '16px' }}>
                      <div className="flex items-center gap-2.5">
                        <div className="w-3 h-3 rounded-full shadow-sm" style={{ background: col.color }} />
                        <span className="text-sm font-bold text-[var(--text-primary)] tracking-wide">{col.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                          {colTasks.length}
                        </span>
                      </div>
                    </div>
                    <div className={`p-3 space-y-3 overflow-y-auto flex-1 transition-colors ${isTargetOver ? 'bg-[var(--accent-blue)]/5' : ''}`}>
                      {colTasks.length === 0 && (
                        <div className={`p-8 text-center flex flex-col items-center justify-center h-full rounded-xl transition-all ${
                          isTargetOver ? 'border-2 border-dashed border-[var(--accent-blue)] bg-[var(--accent-blue)]/10' : 'opacity-60'
                        }`}>
                          <LayoutGrid className="w-8 h-8 mb-3" style={{ color: isTargetOver ? 'var(--accent-blue)' : 'var(--text-muted)' }} />
                          <p className="text-sm font-medium" style={{ color: isTargetOver ? 'var(--accent-blue)' : 'var(--text-secondary)' }}>
                            {isTargetOver ? 'Lepas di sini untuk pindah status' : 'No active tasks'}
                          </p>
                        </div>
                      )}
                      {colTasks.map(task => {
                        const isMovable = !isReadOnly && canMoveTask(task);
                        const isBeingDragged = draggedTaskId === task.id;
                        return (
                          <RequestKanbanCard
                            key={task.id}
                            task={task}
                            currentPipeline={activePipeline}
                            isMovable={isMovable}
                            isBeingDragged={isBeingDragged}
                            isArchive={false}
                            isReadOnly={isReadOnly}
                            user={user}
                            onDragStart={(e) => handleDragStart(e, task)}
                            onDragEnd={() => { setDraggedTaskId(null); setDragOverColumn(null); }}
                            onClick={() => setShowDetailModal(task.id)}
                            onAssignClick={(taskId) => setShowAssignModal(taskId)}
                            onStratStart={async (taskId) => {
                              if (!user) return;
                              await updateStratStatus(taskId, 'IN_PROGRESS', user.id);
                              refreshTasks();
                            }}
                            onStratSubmit={(taskId) => setShowStratSubmitModal(taskId)}
                            onStratApprove={async (taskId) => {
                              const targetTask = tasks.find(t => t.id === taskId);
                              if (targetTask) await handleStrategicApprove(targetTask);
                            }}
                            onStratRevise={(taskId) => setShowRevisionModal({ taskId, stage: 'STRATEGIC' })}
                            onHandoverToGD={handleOpenHandoverGDModal}
                            onStartWork={async (taskId) => {
                              if (!user) return;
                              await updateTaskStatus(taskId, 'DESIGN_IN_PROGRESS', user.id);
                              refreshTasks();
                            }}
                            onMoveToMotion={async (taskId) => {
                              if (!user) return;
                              await handleForwardTaskToMotion(taskId, false);
                            }}
                            onDelete={handleDeleteTask}
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

      {/* WEEKLY PARTITION VIEW (W1 - W4 & NO DUE DATE) */}
      {viewMode === 'weekly' && (
        <div className="space-y-4">
          {/* Overdue Past Notice if tasks from prior months are overdue */}
          {pastOverdueTasks.length > 0 && (
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs shadow-sm">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>
                  <strong>Perhatian:</strong> Terdapat <strong>{pastOverdueTasks.length} task aktif terlambat</strong> dengan tenggat waktu bulan sebelumnya yang belum selesai.
                </span>
              </div>
              <span className="text-[11px] font-mono bg-rose-500/20 text-rose-200 px-2 py-0.5 rounded-md">
                Overdue Lampau
              </span>
            </div>
          )}

          <div className="flex gap-6 overflow-x-auto pb-6 scroll-smooth snap-x" style={{ minHeight: 'calc(100vh - 240px)' }}>
            {/* If there are past overdue tasks, render an Overdue column first */}
            {pastOverdueTasks.length > 0 && (
              <div className="kanban-column flex-shrink-0 w-[320px] snap-center flex flex-col rounded-2xl border border-rose-500/30 bg-[var(--bg-card)] shadow-sm overflow-hidden">
                <div className="p-4 flex items-center justify-between sticky top-0 bg-rose-950/20 border-b border-rose-500/20 z-10">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                    <div>
                      <h4 className="text-sm font-bold text-rose-300">Overdue Lampau</h4>
                      <p className="text-[11px] text-rose-400/80">Deadline Sebelum Bulan Ini</p>
                    </div>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    {pastOverdueTasks.length}
                  </span>
                </div>
                <div className="p-3 space-y-3 overflow-y-auto flex-1">
                  {pastOverdueTasks.map(task => (
                    <RequestKanbanCard
                      key={task.id}
                      task={task}
                      currentPipeline={activePipeline}
                      isMovable={false}
                      isBeingDragged={false}
                      isArchive={false}
                      isReadOnly={isReadOnly}
                      user={user}
                      onClick={() => setShowDetailModal(task.id)}
                      onAssignClick={(taskId) => setShowAssignModal(taskId)}
                      onStratStart={async (taskId) => {
                        if (!user) return;
                        await updateStratStatus(taskId, 'IN_PROGRESS', user.id);
                        refreshTasks();
                      }}
                      onStratSubmit={(taskId) => setShowStratSubmitModal(taskId)}
                      onStratApprove={async (taskId) => {
                        const targetTask = tasks.find(t => t.id === taskId);
                        if (targetTask) await handleStrategicApprove(targetTask);
                      }}
                      onStratRevise={(taskId) => setShowRevisionModal({ taskId, stage: 'STRATEGIC' })}
                      onHandoverToGD={handleOpenHandoverGDModal}
                      onStartWork={async (taskId) => {
                        if (!user) return;
                        await updateTaskStatus(taskId, 'DESIGN_IN_PROGRESS', user.id);
                        refreshTasks();
                      }}
                      onMoveToMotion={async (taskId) => {
                        if (!user) return;
                        await handleForwardTaskToMotion(taskId, false);
                      }}
                      onRestore={handleRestoreTask}
                      onDelete={handleDeleteTask}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Standard Weekly Partitions: W1, W2, W3, W4, NO_DUE_DATE */}
            {weeklyPartitions.map(col => {
              const colTasks = getWeeklyTasksForPartition(col.key);
              const overdueCount = colTasks.filter(t => isTaskOverdue(t.due_date, t.status_design)).length;

              return (
                <div
                  key={col.key}
                  className="kanban-column flex-shrink-0 w-[320px] snap-center flex flex-col rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-card)] shadow-sm overflow-hidden"
                >
                  <div className="p-4 flex items-center justify-between sticky top-0 bg-[var(--bg-secondary)] border-b border-[var(--border-secondary)] z-10">
                    <div>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-[var(--accent-blue)]" />
                        <span className="text-sm font-bold text-[var(--text-primary)]">{col.title}</span>
                      </div>
                      <p className="text-[11px] font-medium text-[var(--text-muted)] mt-0.5">
                        {col.dateRange}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {overdueCount > 0 && (
                        <span className="text-[10px] font-semibold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20" title={`${overdueCount} task terlambat`}>
                          {overdueCount} Overdue
                        </span>
                      )}
                      <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                        {colTasks.length}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 space-y-3 overflow-y-auto flex-1">
                    {colTasks.length === 0 ? (
                      <div className="p-8 text-center flex flex-col items-center justify-center h-48 rounded-xl border border-dashed border-[var(--border-secondary)] bg-[var(--bg-secondary)]/30 text-[var(--text-muted)]">
                        <Calendar className="w-8 h-8 mb-2 opacity-30" />
                        <p className="text-xs font-semibold text-[var(--text-secondary)]">Tidak Ada Card</p>
                        <p className="text-[11px] opacity-70 mt-0.5">Kelompok {col.label} kosong</p>
                      </div>
                    ) : (
                      colTasks.map(task => (
                        <RequestKanbanCard
                          key={task.id}
                          task={task}
                          currentPipeline={activePipeline}
                          isMovable={false}
                          isBeingDragged={false}
                          isArchive={false}
                          isReadOnly={isReadOnly}
                          user={user}
                          onClick={() => setShowDetailModal(task.id)}
                          onAssignClick={(taskId) => setShowAssignModal(taskId)}
                          onStratStart={async (taskId) => {
                            if (!user) return;
                            await updateStratStatus(taskId, 'IN_PROGRESS', user.id);
                            refreshTasks();
                          }}
                          onStratSubmit={(taskId) => setShowStratSubmitModal(taskId)}
                          onStratApprove={async (taskId) => {
                            const targetTask = tasks.find(t => t.id === taskId);
                            if (targetTask) await handleStrategicApprove(targetTask);
                          }}
                          onStratRevise={(taskId) => setShowRevisionModal({ taskId, stage: 'STRATEGIC' })}
                          onHandoverToGD={handleOpenHandoverGDModal}
                          onStartWork={async (taskId) => {
                            if (!user) return;
                            await updateTaskStatus(taskId, 'DESIGN_IN_PROGRESS', user.id);
                            refreshTasks();
                          }}
                          onMoveToMotion={async (taskId) => {
                            if (!user) return;
                            await handleForwardTaskToMotion(taskId, false);
                          }}
                          onRestore={handleRestoreTask}
                          onDelete={handleDeleteTask}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TABLE VIEW */}
      {viewMode === 'table' && (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Task Code</th>
                <th>Brand / Campaign</th>
                <th>Requester</th>
                {activePipeline === 'STRATEGIC' ? (
                  <>
                    <th>Strategic PIC</th>
                    <th>GD PIC</th>
                    <th>Concept Deck</th>
                    <th>Req Date</th>
                    <th>Due Date</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </>
                ) : activePipeline === 'GD_NON_MOCKUP' ? (
                  <>
                    <th>Content Type</th>
                    <th>Source</th>
                    <th>Qty</th>
                    <th>Designer</th>
                    <th>Difficulty</th>
                    <th>Status</th>
                    <th>Due Date</th>
                    <th>Actions</th>
                  </>
                ) : (
                  <>
                    <th>Content</th>
                    <th>Deck Strategi</th>
                    <th>Designer</th>
                    <th>Motion Ready</th>
                    <th>Status</th>
                    <th>Due Date</th>
                    <th>Actions</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredTasks.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(task => (
                <motion.tr initial={{opacity:0}} animate={{opacity:1}} transition={{duration:0.2}} key={task.id}>
                  <td>
                    <button onClick={() => setShowDetailModal(task.id)} className="font-mono text-sm font-semibold hover:underline" style={{ color: 'var(--accent-blue)' }}>
                      {task.task_code}
                    </button>
                  </td>
                  <td>
                    <p className="font-medium text-[var(--text-primary)] text-sm">{task.client_name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{task.campaign_name}</p>
                  </td>
                  <td className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    {task.created_by_name || 'Requester'}
                  </td>

                  {/* Pipeline specific columns */}
                  {activePipeline === 'STRATEGIC' ? (
                    <>
                      <td className="text-sm">
                        <span className="font-medium text-purple-300">
                          {task.strat_pic_name || 'Unassigned'}
                        </span>
                      </td>
                      <td className="text-sm">
                        {task.design_pic_name ? (
                          <span className="font-medium text-emerald-400">
                            {task.design_pic_name}
                          </span>
                        ) : (
                          <span className="text-xs italic text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                      <td>
                        {task.strat_concept_link ? (
                          <a href={sanitizeUrl(task.strat_concept_link)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-purple-300 hover:underline">
                            <Presentation className="w-3 h-3" /> Deck
                          </a>
                        ) : <span className="text-xs text-[var(--text-muted)]">—</span>}
                      </td>
                      <td className="text-sm text-[var(--text-secondary)]">{formatDisplayDate(task.req_date)}</td>
                      <td className="text-sm text-[var(--text-secondary)]">{formatDisplayDate(task.due_date)}</td>
                      <td>
                        <span className="badge bg-purple-500/20 text-purple-300 border-purple-500/30">
                          {STRAT_STATUS_LABELS[task.status_strat] || task.status_strat}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          {['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name) || (user.role_name === 'REQUESTER' && task.created_by === user.id) ? (
                            <button onClick={() => setShowEditModal(task.id)} className="btn-ghost text-xs py-1 px-2" title="Edit Request">
                              <Edit3 className="w-3 h-3" /> Edit
                            </button>
                          ) : null}
                          {canUserDeleteTask(user, task) && (
                            <button
                              onClick={() => handleDeleteTask(task.id, task.task_code, task.client_name)}
                              className="btn-ghost text-xs py-1 px-2 text-rose-400 hover:text-rose-300"
                              title="Hapus Request"
                            >
                              <Trash2 className="w-3 h-3" /> Hapus
                            </button>
                          )}
                          {['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name) && (
                            <button onClick={() => setShowAssignModal(task.id)} className="btn-ghost text-xs py-1 px-2 text-blue-400 font-medium">
                              {!task.strat_pic_id ? 'Assign Strat' : 'Assign / Reassign PIC'}
                            </button>
                          )}
                          {task.status_strat === 'PENDING' && (task.strat_pic_id || (task.strat_pic_ids && task.strat_pic_ids.length > 0)) && (task.strat_pic_id === user.id || Boolean(task.strat_pic_ids && task.strat_pic_ids.includes(user.id)) || ['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name)) && (
                            <button onClick={async () => { await updateStratStatus(task.id, 'IN_PROGRESS', user.id); refreshTasks(); }} className="btn-ghost text-xs py-1 px-2 text-cyan-400">Start</button>
                          )}
                          {(task.status_strat === 'IN_PROGRESS' || task.status_strat === 'REVISION') && (task.strat_pic_id === user.id || Boolean(task.strat_pic_ids && task.strat_pic_ids.includes(user.id)) || ['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name)) && (
                            <button onClick={() => setShowStratSubmitModal(task.id)} className="btn-ghost text-xs py-1 px-2 text-emerald-400">
                              {task.status_strat === 'REVISION' ? 'Resubmit Deck' : 'Submit Deck'}
                            </button>
                          )}
                          {task.status_strat === 'REVIEW' && (['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name) || (user.role_name === 'REQUESTER' && task.created_by === user.id)) && (
                            <button onClick={async () => {
                              try {
                                await updateStratStatus(task.id, 'APPROVED', user.id);
                                refreshTasks();
                              } catch (err: any) {
                                alert(err?.message || String(err));
                              }
                            }} className="btn-ghost text-xs py-1 px-2 text-emerald-400">Approve</button>
                          )}
                          {task.status_strat === 'APPROVED' && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {task.spawned_design_task_id ? (
                                <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Dialihkan ke GD {task.design_pic_name ? `(${task.design_pic_name})` : ''}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleOpenHandoverGDModal(task.id)}
                                  className="btn-ghost text-xs py-1 px-2.5 text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 rounded font-semibold flex items-center gap-1 cursor-pointer"
                                  title="Alihkan tiket ke Graphic Design dan pilih GD PIC"
                                >
                                  <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>Alihkan ke GD</span>
                                </button>
                              )}
                              {task.spawned_design_task_id && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenHandoverGDModal(task.id)}
                                  className="btn-ghost text-[10px] py-0.5 px-1.5 text-cyan-400 hover:bg-cyan-500/10 border border-cyan-500/20 rounded font-medium flex items-center gap-1 cursor-pointer"
                                  title="Ubah GD PIC"
                                >
                                  <User className="w-2.5 h-2.5" /> Ganti GD PIC
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </>
                  ) : activePipeline === 'GD_NON_MOCKUP' ? (
                    <>
                      <td className="text-sm text-[var(--text-secondary)]">{task.content_type_name}</td>
                      <td><span className="text-xs text-[var(--text-secondary)]">{SOURCE_LABELS[task.task_source]}</span></td>
                      <td className="text-sm text-center text-[var(--text-secondary)]">{task.output_qty || task.req_qty}</td>
                      <td className="text-sm" style={{ color: task.design_pic_name ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {task.design_pic_name || '—'}
                      </td>
                      <td>
                        {task.design_difficulty ? (
                          <span className={`badge text-[10px] ${DIFFICULTY_COLORS[task.design_difficulty]}`}>{DIFFICULTY_LABELS[task.design_difficulty]}</span>
                        ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td><span className={`badge ${DESIGN_STATUS_COLORS[task.status_design]}`}>{DESIGN_STATUS_LABELS[task.status_design]}</span></td>
                      <td className="text-sm text-[var(--text-secondary)]">{formatDisplayDate(task.due_date)}</td>
                      <td>
                        <div className="flex items-center gap-1">
                          {['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name) || (user.role_name === 'REQUESTER' && task.created_by === user.id) ? (
                            <button onClick={() => setShowEditModal(task.id)} className="btn-ghost text-xs py-1 px-2" title="Edit Request">
                              <Edit3 className="w-3 h-3" /> Edit
                            </button>
                          ) : null}
                          {canUserDeleteTask(user, task) && (
                            <button
                              onClick={() => handleDeleteTask(task.id, task.task_code, task.client_name)}
                              className="btn-ghost text-xs py-1 px-2 text-rose-400 hover:text-rose-300"
                              title="Hapus Request"
                            >
                              <Trash2 className="w-3 h-3" /> Hapus
                            </button>
                          )}
                          {task.status_design === 'DESIGN_UNASSIGNED' && ['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name) && (
                            <button onClick={() => setShowAssignModal(task.id)} className="btn-ghost text-xs py-1 px-2" style={{ color: 'var(--accent-blue)' }}>{task.design_pic_id ? 'Confirm' : 'Assign'}</button>
                          )}
                          {task.status_design === 'DESIGN_ASSIGNED' && (task.design_pic_id === user.id || ['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name)) && (
                            <button onClick={async () => { await updateTaskStatus(task.id, 'DESIGN_IN_PROGRESS', user.id); refreshTasks(); }} className="btn-ghost text-xs py-1 px-2" style={{ color: 'var(--accent-cyan)' }}>
                              <Play className="w-3 h-3" /> Start
                            </button>
                          )}
                          {task.status_design === 'DESIGN_IN_PROGRESS' && (task.design_pic_id === user.id || ['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name)) && (
                            <button onClick={() => setShowSubmitModal(task.id)} className="btn-ghost text-xs py-1 px-2" style={{ color: 'var(--accent-emerald)' }}>
                              <Send className="w-3 h-3" /> Submit
                            </button>
                          )}
                          {task.status_design === 'DESIGN_SUBMITTED' && ['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name) && (
                            <>
                              <button onClick={async () => { await updateTaskStatus(task.id, 'DESIGN_APPROVED', user.id); refreshTasks(); }} className="btn-ghost text-xs py-1 px-2" style={{ color: 'var(--accent-emerald)' }}>
                                <CheckCircle2 className="w-3 h-3" /> Approve
                              </button>
                              <button onClick={() => setShowRevisionModal({ taskId: task.id, stage: 'DESIGN' })} className="btn-ghost text-xs py-1 px-2" style={{ color: 'var(--accent-amber)' }}>
                                <RotateCcw className="w-3 h-3" /> Revise
                              </button>
                            </>
                          )}
                          {task.status_design === 'DESIGN_REVISION' && (task.design_pic_id === user.id || ['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name)) && (
                            <button onClick={() => setShowSubmitModal(task.id)} className="btn-ghost text-xs py-1 px-2" style={{ color: 'var(--accent-emerald)' }}>
                              <Send className="w-3 h-3" /> Re-submit
                            </button>
                          )}
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="text-sm text-[var(--text-secondary)]">{task.content_type_name || 'Mockup'}</td>
                      <td>
                        {task.strat_concept_link ? (
                          <a href={sanitizeUrl(task.strat_concept_link)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-purple-300 hover:underline">
                            <Presentation className="w-3 h-3" /> Deck
                          </a>
                        ) : <span className="text-xs text-[var(--text-muted)]">—</span>}
                      </td>
                      <td className="text-sm" style={{ color: task.design_pic_name ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {task.design_pic_name || '—'}
                      </td>
                      <td>
                        {task.motion_readiness === 'READY_TO_ANIMATE' ? (
                          <span className="badge bg-pink-500/20 text-pink-300 border-pink-500/30">Ready Motion</span>
                        ) : task.motion_task ? (
                          <span className="badge bg-pink-500/10 text-pink-400">In Motion</span>
                        ) : (
                          <span className="text-xs text-[var(--text-muted)]">-</span>
                        )}
                      </td>
                      <td><span className={`badge ${DESIGN_STATUS_COLORS[task.status_design]}`}>{DESIGN_STATUS_LABELS[task.status_design]}</span></td>
                      <td className="text-sm text-[var(--text-secondary)]">{formatDisplayDate(task.due_date)}</td>
                      <td>
                        <div className="flex items-center gap-1">
                          {['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name) || (user.role_name === 'REQUESTER' && task.created_by === user.id) ? (
                            <button onClick={() => setShowEditModal(task.id)} className="btn-ghost text-xs py-1 px-2" title="Edit Request">
                              <Edit3 className="w-3 h-3" /> Edit
                            </button>
                          ) : null}
                          {canUserDeleteTask(user, task) && (
                            <button
                              onClick={() => handleDeleteTask(task.id, task.task_code, task.client_name)}
                              className="btn-ghost text-xs py-1 px-2 text-rose-400 hover:text-rose-300"
                              title="Hapus Request"
                            >
                              <Trash2 className="w-3 h-3" /> Hapus
                            </button>
                          )}
                          {task.status_design === 'DESIGN_UNASSIGNED' && ['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name) && (
                            <button onClick={() => setShowAssignModal(task.id)} className="btn-ghost text-xs py-1 px-2" style={{ color: 'var(--accent-blue)' }}>{task.design_pic_id ? 'Confirm' : 'Assign'}</button>
                          )}
                          {task.status_design === 'DESIGN_ASSIGNED' && (task.design_pic_id === user.id || ['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name)) && (
                            <button onClick={async () => { await updateTaskStatus(task.id, 'DESIGN_IN_PROGRESS', user.id); refreshTasks(); }} className="btn-ghost text-xs py-1 px-2" style={{ color: 'var(--accent-cyan)' }}>
                              <Play className="w-3 h-3" /> Start
                            </button>
                          )}
                          {task.status_design === 'DESIGN_IN_PROGRESS' && (task.design_pic_id === user.id || ['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name)) && (
                            <button onClick={() => setShowSubmitModal(task.id)} className="btn-ghost text-xs py-1 px-2" style={{ color: 'var(--accent-emerald)' }}>
                              <Send className="w-3 h-3" /> Submit
                            </button>
                          )}
                          {task.status_design === 'DESIGN_SUBMITTED' && ['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name) && (
                            <>
                              <button onClick={async () => { await updateTaskStatus(task.id, 'DESIGN_APPROVED', user.id); refreshTasks(); }} className="btn-ghost text-xs py-1 px-2" style={{ color: 'var(--accent-emerald)' }}>
                                <CheckCircle2 className="w-3 h-3" /> Approve
                              </button>
                              <button onClick={() => setShowRevisionModal({ taskId: task.id, stage: 'DESIGN' })} className="btn-ghost text-xs py-1 px-2" style={{ color: 'var(--accent-amber)' }}>
                                <RotateCcw className="w-3 h-3" /> Revise
                              </button>
                            </>
                          )}
                          {task.status_design === 'DESIGN_REVISION' && (task.design_pic_id === user.id || ['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name)) && (
                            <button onClick={() => setShowSubmitModal(task.id)} className="btn-ghost text-xs py-1 px-2" style={{ color: 'var(--accent-emerald)' }}>
                              <Send className="w-3 h-3" /> Re-submit
                            </button>
                          )}
                          {canForwardToMotion(task) && !task.motion_task && (
                            <button
                              disabled={forwardingMotionTaskId === task.id}
                              onClick={async () => {
                              try {
                                await handleForwardTaskToMotion(task.id);
                              } catch (error) {
                                const message = extractErrorMessage(error);
                                window.alert(`Gagal meneruskan request ke Motion: ${message}`);
                              }
                            }} className="btn-ghost text-xs py-1 px-2 text-pink-400 disabled:opacity-60 disabled:cursor-not-allowed">
                              {forwardingMotionTaskId === task.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Film className="w-3 h-3" />}
                              {forwardingMotionTaskId === task.id ? 'Forwarding...' : 'Forward to Motion'}
                            </button>
                          )}
                        </div>
                      </td>
                    </>
                  )}
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
        </div>
      )}

      {/* APPROVED REQUEST ARCHIVE VIEW */}
      {mainTab === 'archive' && (
        <div className="space-y-5">
          {/* 1. Summary Header */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* Total Approved */}
            <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] p-4 rounded-xl shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Total Approved</p>
                  <h3 className="text-2xl font-black text-emerald-400 mt-1">{accessibleApprovedTasks.length}</h3>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] mt-2 flex items-center gap-1">
                <FolderCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Seluruh arsip disetujui</span>
              </p>
            </div>

            {/* This Month */}
            <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] p-4 rounded-xl shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">This Month</p>
                  <h3 className="text-2xl font-black text-[var(--accent-blue)] mt-1">{thisMonthApprovedCount}</h3>
                </div>
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-[var(--accent-blue)] border border-blue-500/20 flex items-center justify-center">
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
                  placeholder="Search Request (Kode, Brand, Campaign, Requester, PIC)..."
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
                {(archiveWeek !== 'all' || archiveRequester !== 'all' || archivePic !== 'all' || archiveSearch !== '' || archiveSort !== 'approved_desc') && (
                  <button
                    onClick={() => {
                      setArchiveWeek('all');
                      setArchiveRequester('all');
                      setArchivePic('all');
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
                    downloadCSV(sortedArchiveTasks.map(t => ({
                      'Kode Request': t.task_code,
                      'Brand / Klien': t.client_name,
                      'Nama Campaign': t.campaign_name,
                      'Requester': t.created_by_name || 'Requester',
                      'Designer PIC': t.design_pic_name || 'Unassigned',
                      'Kategori Konten': t.content_type_name,
                      'Qty Output': t.output_qty || t.req_qty || 1,
                      'Tgl Request': formatDisplayDate(t.req_date),
                      'Tgl Disetujui': formatDisplayDateTime(t.approved_at || t.submission_date || t.updated_at || t.created_at),
                      'SLA Quality': t.operational_excellence || '-',
                      'Revisi': t.design_revision_count || 0,
                      'Link Final Asset': t.final_asset_link || '-'
                    })), `Approved_Archive_${currentMonthShort}_${archiveYear}.csv`);
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
                    <option key={y} value={y}>{y}</option>
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
                    <option key={idx + 1} value={String(idx + 1)}>{mName}</option>
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
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Requester Dropdown */}
              {archiveUniqueRequesters.length > 0 && (
                <div className="flex items-center gap-2 bg-[var(--bg-secondary)] px-3 py-1.5 rounded-lg border border-[var(--border-primary)]">
                  <User className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-xs font-semibold text-[var(--text-muted)]">Requester:</span>
                  <select
                    value={archiveRequester}
                    onChange={(e) => {
                      setArchiveRequester(e.target.value);
                      setArchivePage(1);
                    }}
                    className="bg-transparent text-xs font-medium text-[var(--text-primary)] focus:outline-none cursor-pointer pr-2"
                  >
                    <option value="all">All Requesters</option>
                    {archiveUniqueRequesters.map(req => (
                      <option key={req} value={req}>{req}</option>
                    ))}
                  </select>
                </div>
              )}

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
            </div>
          </div>

          {/* 4. APPROVED ARCHIVE KANBAN VIEW (Default) */}
          {archiveViewMode === 'kanban' && (
            <div className="flex gap-4 overflow-x-auto pb-6 scroll-smooth snap-x" style={{ minHeight: 'calc(100vh - 360px)' }}>
              {archiveKanbanColumns
                .filter(col => archiveWeek === 'all' || archiveWeek === String(col.week))
                .map(col => {
                  const colTasks = filteredArchiveTasks
                    .filter(t => {
                      const dt = t.approved_at || t.submission_date || t.updated_at || t.created_at;
                      return getWeekOfMonth(dt) === col.week;
                    })
                    .sort((a, b) => {
                      const dateA = new Date(a.approved_at || a.submission_date || a.updated_at || a.created_at).getTime();
                      const dateB = new Date(b.approved_at || b.submission_date || b.updated_at || b.created_at).getTime();
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
                            {colTasks.length} {colTasks.length === 1 ? 'Request' : 'Requests'}
                          </span>
                        </div>
                      </div>

                      {/* Cards List */}
                      <div className="p-3 space-y-3 overflow-y-auto flex-1">
                        {colTasks.length === 0 ? (
                          <div className="p-6 text-center flex flex-col items-center justify-center h-48 rounded-xl border border-dashed border-[var(--border-secondary)] bg-[var(--bg-secondary)]/30 text-[var(--text-muted)]">
                            <Calendar className="w-6 h-6 mb-2 opacity-30" />
                            <p className="text-xs font-medium">No approved requests</p>
                            <span className="text-[10px] opacity-70">pada {col.label.toLowerCase()}</span>
                          </div>
                        ) : (
                          colTasks.map(task => (
                            <RequestKanbanCard
                              key={task.id}
                              task={task}
                              isMovable={false}
                              isBeingDragged={false}
                              isArchive={true}
                              user={user}
                              onRestore={handleRestoreTask}
                              onDelete={handleDeleteTask}
                              onClick={() => {
                                setShowDetailModal(task.id);
                                setModalInitialTab('details');
                              }}
                            />
                          ))
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
                      <th>Kode Request</th>
                      <th>Brand & Campaign</th>
                      <th>Requester</th>
                      <th>Designer PIC</th>
                      <th>Konten & Format</th>
                      <th className="text-center">Qty</th>
                      <th>Tgl Request</th>
                      <th>Tgl Disetujui (Approved At)</th>
                      <th>SLA / Kualitas</th>
                      <th>Aset Desain Final</th>
                      <th className="text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedArchiveTasks.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="py-16 text-center">
                          <div className="flex flex-col items-center justify-center max-w-md mx-auto text-center">
                            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-3 shadow-inner">
                              <FolderCheck className="w-7 h-7" />
                            </div>
                            <h4 className="text-base font-bold text-[var(--text-primary)] mb-1">
                              Tidak Ada Request Disetujui Ditemukan
                            </h4>
                            <p className="text-xs text-[var(--text-muted)] leading-relaxed mb-4">
                              Tidak ada arsip request yang sesuai dengan filter tahun, bulan, minggu, atau kata kunci pencarian yang sedang aktif.
                            </p>
                            {(archiveWeek !== 'all' || archiveRequester !== 'all' || archivePic !== 'all' || archiveSearch !== '') && (
                              <button
                                onClick={() => {
                                  setArchiveWeek('all');
                                  setArchiveRequester('all');
                                  setArchivePic('all');
                                  setArchiveSearch('');
                                  setArchivePage(1);
                                }}
                                className="btn-outline text-xs px-4 py-2 rounded-lg flex items-center gap-1.5"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Reset Filter</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      paginatedArchiveTasks.map((task) => {
                        const approvalTimestamp = task.approved_at || task.submission_date || task.updated_at || task.created_at;
                        return (
                          <motion.tr
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.15 }}
                            key={task.id}
                            className="hover:bg-[var(--bg-secondary)]/50 transition-colors"
                          >
                            {/* Task Code */}
                            <td>
                              <button
                                onClick={() => {
                                  setShowDetailModal(task.id);
                                  setModalInitialTab('details');
                                }}
                                className="font-mono text-xs font-bold text-[var(--accent-blue)] hover:underline flex items-center gap-1 group"
                              >
                                <span>{task.task_code}</span>
                                <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </button>
                            </td>

                            {/* Brand & Campaign */}
                            <td>
                              <p className="font-semibold text-xs text-[var(--text-primary)]">{task.client_name}</p>
                              <p className="text-[11px] text-[var(--text-muted)] line-clamp-1">{task.campaign_name}</p>
                            </td>

                            {/* Requester */}
                            <td>
                              <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                                <div className="w-5 h-5 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center text-[10px] font-bold text-[var(--text-muted)]">
                                  {(task.created_by_name || 'R').charAt(0).toUpperCase()}
                                </div>
                                <span className="truncate max-w-[120px]">{task.created_by_name || 'Requester'}</span>
                              </div>
                            </td>

                            {/* Designer */}
                            <td>
                              <div className="flex items-center gap-1.5 text-xs">
                                {task.design_pic_name ? (
                                  <>
                                    <div className="w-5 h-5 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center text-[10px] font-bold">
                                      {task.design_pic_name.charAt(0).toUpperCase()}
                                    </div>
                                    <span className="text-[var(--text-primary)] font-medium truncate max-w-[120px]">{task.design_pic_name}</span>
                                  </>
                                ) : (
                                  <span className="text-[var(--text-muted)] italic text-[11px]">Unassigned</span>
                                )}
                              </div>
                            </td>

                            {/* Content & Format */}
                            <td>
                              <div className="flex flex-col">
                                <span className="text-xs text-[var(--text-primary)] font-medium">{task.content_type_name || 'Desain'}</span>
                                {task.platform && (
                                  <span className="text-[10px] text-[var(--text-muted)]">{task.platform}</span>
                                )}
                              </div>
                            </td>

                            {/* Qty */}
                            <td className="text-center">
                              <span className="badge text-[11px] px-2 py-0.5 bg-[var(--bg-secondary)] border border-[var(--border-secondary)] font-mono font-semibold">
                                {task.output_qty || task.req_qty || 1}
                              </span>
                            </td>

                            {/* Request Date */}
                            <td className="text-xs text-[var(--text-secondary)] whitespace-nowrap">
                              {formatDisplayDate(task.req_date)}
                            </td>

                            {/* Approved Date */}
                            <td>
                              <div className="flex flex-col">
                                <div className="flex items-center gap-1 text-xs font-semibold text-emerald-400">
                                  <CheckCheck className="w-3.5 h-3.5 shrink-0" />
                                  <span>{formatDisplayDate(approvalTimestamp)}</span>
                                </div>
                                <span className="text-[10px] text-[var(--text-muted)] font-mono">
                                  {approvalTimestamp ? new Date(approvalTimestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':') + ' WIB' : ''}
                                </span>
                              </div>
                            </td>

                            {/* SLA & Excellence */}
                            <td>
                              <div className="flex items-center gap-1.5">
                                {task.operational_excellence ? (
                                  <span className={`badge text-[10px] py-0.5 px-2 ${EXCELLENCE_COLORS[task.operational_excellence]}`}>
                                    {EXCELLENCE_LABELS[task.operational_excellence]}
                                  </span>
                                ) : (
                                  <span className="badge text-[10px] py-0.5 px-2 bg-emerald-500/10 text-emerald-300 border-emerald-500/30">
                                    Approved
                                  </span>
                                )}
                                {task.design_revision_count > 0 && (
                                  <span className="text-[10px] text-amber-400 font-mono" title={`${task.design_revision_count}x revisi`}>
                                    ({task.design_revision_count}R)
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Final Asset Link */}
                            <td>
                              {task.final_asset_link ? (
                                <a
                                  href={sanitizeUrl(task.final_asset_link)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-500/10 text-[var(--accent-blue)] hover:bg-blue-500/20 border border-blue-500/20 transition-all shadow-sm"
                                  title={task.final_asset_link}
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  <span>Buka Drive</span>
                                </a>
                              ) : (
                                <span className="text-xs text-[var(--text-muted)] italic">-</span>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {/* View Details */}
                                <button
                                  onClick={() => {
                                    setShowDetailModal(task.id);
                                    setModalInitialTab('details');
                                  }}
                                  className="btn-ghost text-xs p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-md"
                                  title="Lihat Detail Request"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>

                                {/* Open Chat */}
                                <button
                                  onClick={() => {
                                    setShowDetailModal(task.id);
                                    setModalInitialTab('chat');
                                  }}
                                  className="btn-ghost text-xs p-1.5 text-blue-400 hover:bg-blue-500/10 rounded-md"
                                  title="Buka Diskusi / Chat"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                </button>

                                {/* Restore Button */}
                                {user && canUserRestoreTask(user.role_name, user.id, task) && (
                                  <button
                                    onClick={() => handleRestoreTask(task.id)}
                                    className="btn-ghost text-xs p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded-md"
                                    title="Pulihkan Card ke Board Aktif (Restore)"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </motion.tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {sortedArchiveTasks.length > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border-primary)] text-xs text-[var(--text-secondary)] shadow-sm">
                  <div className="flex items-center gap-2">
                    <span>
                      Menampilkan <strong className="text-[var(--text-primary)]">{(archivePage - 1) * archiveLimit + 1}</strong> - <strong className="text-[var(--text-primary)]">{Math.min(archivePage * archiveLimit, sortedArchiveTasks.length)}</strong> dari <strong className="text-[var(--text-primary)]">{sortedArchiveTasks.length}</strong> request disetujui
                    </span>
                    <span className="text-[var(--text-muted)]">|</span>
                    <div className="flex items-center gap-1.5">
                      <span>Per halaman:</span>
                      <select
                        value={archiveLimit}
                        onChange={(e) => {
                          setArchiveLimit(parseInt(e.target.value, 10));
                          setArchivePage(1);
                        }}
                        className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded px-2 py-0.5 text-xs text-[var(--text-primary)] focus:outline-none cursor-pointer"
                      >
                        <option value="10">10</option>
                        <option value="15">15</option>
                        <option value="25">25</option>
                        <option value="50">50</option>
                      </select>
                    </div>
                  </div>

                  {/* Page navigation */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setArchivePage(p => Math.max(1, p - 1))}
                      disabled={archivePage === 1}
                      className="p-1.5 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      title="Halaman Sebelumnya"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    <div className="flex items-center gap-1 px-2">
                      {Array.from({ length: totalArchivePages }, (_, i) => i + 1)
                        .filter(p => p === 1 || p === totalArchivePages || Math.abs(p - archivePage) <= 1)
                        .map((p, idx, arr) => {
                          const prevP = arr[idx - 1];
                          const showEllipsis = prevP && p - prevP > 1;
                          return (
                            <div key={p} className="flex items-center">
                              {showEllipsis && <span className="px-1 text-[var(--text-muted)]">...</span>}
                              <button
                                onClick={() => setArchivePage(p)}
                                className={`min-w-[28px] h-7 px-2 text-xs font-semibold rounded-md transition-all ${
                                  archivePage === p
                                    ? 'bg-emerald-600 text-white shadow-sm'
                                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                                }`}
                              >
                                {p}
                              </button>
                            </div>
                          );
                        })}
                    </div>

                    <button
                      onClick={() => setArchivePage(p => Math.min(totalArchivePages, p + 1))}
                      disabled={archivePage === totalArchivePages}
                      className="p-1.5 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      title="Halaman Selanjutnya"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* CREATE / EDIT TASK MODAL */}
      {showCreateModal && (
        <TaskFormModal
          onClose={() => { setShowCreateModal(false); refreshTasks(); }}
          userId={user.id}
          userRole={user.role_name}
          clients={clients}
          contentTypes={contentTypes}
          stratUsers={allUsers.filter(u => ['STRATEGIC_PIC', 'TEAM_LEAD'].includes(u.role_name))}
          designers={allUsers.filter(u => ['DESIGNER', 'TEAM_LEAD'].includes(u.role_name))}
          activePipeline={activePipeline}
        />
      )}
      {showEditModal && (
        <TaskFormModal
          onClose={() => { setShowEditModal(null); refreshTasks(); }}
          userId={user.id}
          userRole={user.role_name}
          editTaskId={showEditModal}
          taskToEdit={tasks.find(t => t.id === showEditModal)}
          clients={clients}
          contentTypes={contentTypes}
          stratUsers={allUsers.filter(u => ['STRATEGIC_PIC', 'TEAM_LEAD'].includes(u.role_name))}
          designers={allUsers.filter(u => ['DESIGNER', 'TEAM_LEAD'].includes(u.role_name))}
          activePipeline={activePipeline}
        />
      )}
      {/* ASSIGN MODAL */}
      {showAssignModal && (
        <AssignModal
          taskId={showAssignModal}
          task={tasks.find(t => t.id === showAssignModal)}
          onClose={() => { setShowAssignModal(null); refreshTasks(); }}
          userId={user.id}
          userRole={user.role_name}
          designers={allUsers.filter(u => ['DESIGNER', 'TEAM_LEAD'].includes(u.role_name) && u.daily_capacity_points > 0)}
          stratUsers={allUsers.filter(u => ['STRATEGIC_PIC', 'TEAM_LEAD'].includes(u.role_name))}
        />
      )}
      {/* DETAIL MODAL */}
      {showDetailModal && (
        <TaskDetailModal 
          task={tasks.find(t => t.id === showDetailModal)} 
          allTasks={tasks}
          initialTab={modalInitialTab}
          onClose={handleCloseAnyModal} 
          user={user} 
          onRefresh={refreshTasks} 
          onAssign={() => { if (showDetailModal) switchModal('ASSIGN', { taskId: showDetailModal }); }}
          onSubmit={() => { if (showDetailModal) switchModal('SUBMIT', { taskId: showDetailModal }); }}
          onSubmitStrat={() => { if (showDetailModal) switchModal('STRAT_SUBMIT', { taskId: showDetailModal }); }}
          onRevise={(stage = 'DESIGN') => { if (showDetailModal) switchModal('REVISION', { taskId: showDetailModal, stage }); }}
          onEdit={() => { if (showDetailModal) switchModal('EDIT', { taskId: showDetailModal }); }}
          onStratApprove={handleStrategicApprove}
          onHandoverToGD={handleOpenHandoverGDModal}
          onForwardToMotion={handleForwardTaskToMotion}
          isForwardingMotion={forwardingMotionTaskId === showDetailModal}
        />
      )}
      {/* REVISION MODAL */}
      {showRevisionModal && (
        <RevisionModal 
          taskId={showRevisionModal.taskId} 
          stage={showRevisionModal.stage}
          task={tasks.find(t => t.id === showRevisionModal.taskId)}
          onClose={handleCloseAnyModal} 
          userId={user.id} 
        />
      )}
      {/* SUBMIT MODAL */}
      {showSubmitModal && (
        <SubmitModal 
          taskId={typeof showSubmitModal === 'string' ? showSubmitModal : showSubmitModal.taskId} 
          task={tasks.find(t => t.id === (typeof showSubmitModal === 'string' ? showSubmitModal : showSubmitModal.taskId))}
          targetAfterSubmit={typeof showSubmitModal === 'object' ? showSubmitModal?.targetAfterSubmit : null}
          onRequestRevision={(tId) => {
            switchModal('REVISION', { taskId: tId, stage: 'DESIGN' });
          }}
          onClose={handleCloseAnyModal} 
          userId={user.id} 
        />
      )}
      {/* STRATEGIC SUBMIT MODAL */}
      {showStratSubmitModal && (
        <SubmitStratModal
          taskId={typeof showStratSubmitModal === 'string' ? showStratSubmitModal : showStratSubmitModal.taskId}
          targetAfterSubmit={typeof showStratSubmitModal === 'object' ? showStratSubmitModal.targetAfterSubmit : null}
          task={tasks.find(t => t.id === (typeof showStratSubmitModal === 'string' ? showStratSubmitModal : showStratSubmitModal.taskId))}
          onClose={handleCloseAnyModal}
          onSuccess={refreshTasks}
          userId={user.id}
        />
      )}

      {/* HANDOVER STRATEGIC TO GD MODAL */}
      {handoverGDModalTaskId && (
        <HandoverToGDModal
          task={tasks.find(t => t.id === handoverGDModalTaskId)!}
          onClose={() => setHandoverGDModalTaskId(null)}
          userId={user.id}
          userRole={user.role_name}
          designers={allUsers.filter(u => u.is_active && ['DESIGNER', 'TEAM_LEAD', 'ADMIN'].includes(u.role_name))}
          onSuccess={async () => {
            await refreshTasks();
          }}
          onNavigateToGD={(targetPipeline) => {
            setHandoverGDModalTaskId(null);
            handleSwitchPipeline(targetPipeline);
          }}
        />
      )}

      {/* STRATEGIC FORWARDING SUCCESS MODAL */}
      {strategicForwardModal && strategicForwardModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <Sparkles className="w-6 h-6 text-emerald-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  Request berhasil dikirim ke Graphic Design
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
                  Request telah disetujui dan diteruskan ke pipeline Graphic Design sesuai kategori pekerjaan.
                </p>
              </div>
              <button
                onClick={() => setStrategicForwardModal(null)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl space-y-2.5 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-[var(--border-secondary)]">
                <span className="text-[var(--text-muted)]">Nama Request:</span>
                <span className="font-semibold text-[var(--text-primary)] max-w-[200px] truncate text-right">
                  {strategicForwardModal.requestName}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-[var(--border-secondary)]">
                <span className="text-[var(--text-muted)]">Kode Request:</span>
                <span className="font-mono font-bold text-cyan-400">
                  {strategicForwardModal.taskCode}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-[var(--border-secondary)]">
                <span className="text-[var(--text-muted)]">Brand / Client:</span>
                <span className="font-medium text-[var(--text-primary)]">
                  {strategicForwardModal.brandName}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-[var(--border-secondary)]">
                <span className="text-[var(--text-muted)]">Kategori Pekerjaan:</span>
                <span className="font-medium text-[var(--text-secondary)]">
                  {strategicForwardModal.category}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-[var(--border-secondary)]">
                <span className="text-[var(--text-muted)]">Pipeline Tujuan:</span>
                <span className="px-2 py-0.5 rounded font-bold text-xs bg-purple-500/10 text-purple-300 border border-purple-500/20">
                  {strategicForwardModal.targetPipelineLabel}
                </span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-[var(--text-muted)]">Status Terbaru:</span>
                <span className="px-2 py-0.5 rounded font-bold text-[11px] bg-orange-500/10 text-orange-400 border border-orange-500/20">
                  {strategicForwardModal.newStatus}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStrategicForwardModal(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-all cursor-pointer"
              >
                Mengerti
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = strategicForwardModal.targetPipeline;
                  setStrategicForwardModal(null);
                  handleSwitchPipeline(target);
                }}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-[var(--accent-blue)] text-white shadow-sm hover:opacity-95 transition-all cursor-pointer"
              >
                <span>Lihat Pipeline</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===================== STRATEGIC PIC MULTI-SELECT COMPONENT =====================
function StratPicMultiSelect({
  selectedIds,
  onChange,
  stratUsers,
  disabled
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  stratUsers: UserType[];
  disabled?: boolean;
}) {
  const toggleUser = (userId: string) => {
    if (disabled) return;
    if (selectedIds.includes(userId)) {
      onChange(selectedIds.filter(id => id !== userId));
    } else {
      onChange([...selectedIds, userId]);
    }
  };

  // Operational assignees strictly exclude ADMIN (System Admin holds supervisory/management control, not operational worker tasks)
  const assignableStratUsers = useMemo(() => {
    return (stratUsers || []).filter(u => ['STRATEGIC_PIC', 'TEAM_LEAD'].includes(u.role_name) && u.role_name !== 'ADMIN');
  }, [stratUsers]);

  const selectedUsers = assignableStratUsers.filter(u => selectedIds.includes(u.id));

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <label className="label mb-0 text-xs font-semibold text-[var(--text-primary)]">
          Assign Strategic PIC / Team Lead {selectedIds.length > 0 && `(${selectedIds.length} Orang Terpilih)`}
        </label>
        {selectedIds.length > 0 && !disabled && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-[11px] text-[var(--text-muted)] hover:text-red-400 transition-colors"
          >
            Reset Pilihan
          </button>
        )}
      </div>

      {/* Selected badges/pills */}
      {selectedUsers.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 p-2.5 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg min-h-[42px] items-center">
          {selectedUsers.map(u => (
            <span
              key={u.id}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-500/15 text-blue-300 border border-blue-500/30 shadow-xs"
            >
              <span className="w-4 h-4 rounded-full bg-blue-600/50 text-[10px] font-bold flex items-center justify-center text-blue-200 shrink-0">
                {u.avatar_initials || u.full_name.substring(0, 2).toUpperCase()}
              </span>
              <span className="truncate max-w-[140px]">{u.full_name}</span>
              <span className="text-[10px] text-blue-400/80 shrink-0">({u.role_name === 'TEAM_LEAD' ? 'Lead' : 'Strat'})</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => toggleUser(u.id)}
                  className="hover:text-red-400 ml-0.5 rounded-full p-0.5 hover:bg-blue-500/20 transition-colors shrink-0"
                  title="Hapus"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      ) : (
        <div className="p-2.5 text-xs text-[var(--text-muted)] bg-[var(--bg-secondary)] border border-dashed border-[var(--border-primary)] rounded-lg text-center">
          Belum ada Strategic PIC / Team Lead yang dipilih (Bisa pilih 1 orang atau lebih di bawah)
        </div>
      )}

      {/* Selectable grid / list */}
      {!disabled && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar p-0.5">
          {assignableStratUsers.map(u => {
            const isSelected = selectedIds.includes(u.id);
            return (
              <div
                key={u.id}
                onClick={() => toggleUser(u.id)}
                className={`flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer transition-all select-none ${
                  isSelected
                    ? 'bg-blue-500/10 border-blue-500/60 text-blue-200 shadow-sm ring-1 ring-blue-500/30'
                    : 'bg-[var(--bg-card)] border-[var(--border-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:border-[var(--border-secondary)]'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                    isSelected ? 'bg-blue-500 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                  }`}>
                    {u.avatar_initials || u.full_name.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="truncate">
                    <p className="font-medium text-[var(--text-primary)] truncate">{u.full_name}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">
                      {u.role_name === 'TEAM_LEAD' ? 'Team Lead' : 'Strategic PIC'}
                    </p>
                  </div>
                </div>
                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                  isSelected ? 'bg-blue-500 border-blue-500 text-white' : 'border-[var(--border-primary)]'
                }`}>
                  {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-[var(--accent-blue)] flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5 shrink-0" />
        Dapat memilih lebih dari 1 Strategic PIC / Team Lead untuk tugas ini.
      </p>
    </div>
  );
}

// ===================== CREATE / EDIT TASK MODAL =====================
function TaskFormModal({ 
  onClose, userId, userRole, editTaskId, taskToEdit, clients, contentTypes, stratUsers, designers = [], activePipeline
}: { 
  onClose: () => void; userId: string; userRole?: string; editTaskId?: string; taskToEdit?: TaskWithRelations | null;
  clients: Client[]; contentTypes: ContentType[]; stratUsers: UserType[];
  designers?: UserType[];
  activePipeline?: PipelineType;
}) {
  const activeClients = clients.filter(c => c.is_active);
  const validDesigners = (designers || []).filter(u => ['DESIGNER', 'TEAM_LEAD'].includes(u.role_name));

  // Determine target pipeline context
  const targetPipeline: PipelineType = editTaskId && taskToEdit
    ? (taskToEdit.pipeline_type || (taskToEdit.requires_strategic_concept ? 'STRATEGIC' : isMockupTask(taskToEdit) ? 'GD_MOCKUP' : 'GD_NON_MOCKUP'))
    : (activePipeline || 'GD_MOCKUP');

  const isStrategicPipeline = targetPipeline === 'STRATEGIC';
  const isMockupPipeline = targetPipeline === 'GD_MOCKUP';
  const isNonMockupPipeline = targetPipeline === 'GD_NON_MOCKUP';

  // Content type configurations per pipeline
  const mockupContentType = contentTypes.find(ct => ct.id === 1 || ct.name.toLowerCase().includes('mockup')) || contentTypes[0];
  const mockupContentTypes = contentTypes.filter(ct => ct.id === 1 || ct.name.toLowerCase().includes('mockup'));
  const availableMockupTypes = mockupContentTypes.length > 0 ? mockupContentTypes : (mockupContentType ? [mockupContentType] : []);
  const nonMockupContentTypes = contentTypes.filter(ct => ct.id !== 1 && !ct.name.toLowerCase().includes('mockup'));

  const isInitialStratEcom = isStrategicPipeline && (
    taskToEdit ? (taskToEdit.task_source === 'ECOMMERCE' || taskToEdit.is_mockup === false) : false
  );

  let defaultContentTypeId = contentTypes[0]?.id || 1;
  if (isStrategicPipeline) {
    defaultContentTypeId = isInitialStratEcom
      ? (taskToEdit?.content_type_id && taskToEdit.content_type_id !== (mockupContentType?.id || 1) ? taskToEdit.content_type_id : (nonMockupContentTypes[0]?.id || 2))
      : (mockupContentType?.id || 1);
  } else if (isMockupPipeline) {
    defaultContentTypeId = mockupContentType?.id || 1;
  } else if (isNonMockupPipeline) {
    defaultContentTypeId = nonMockupContentTypes[0]?.id || 2;
  }

  // Task source configurations
  const defaultTaskSource: TaskSource = isStrategicPipeline
    ? (isInitialStratEcom ? 'ECOMMERCE' : 'ORCA')
    : (isMockupPipeline ? 'ORCA' : (isNonMockupPipeline ? 'ECOMMERCE' : (taskToEdit?.task_source || 'ORCA')));

  const initialStratPicIds = taskToEdit?.strat_pic_ids?.length 
    ? taskToEdit.strat_pic_ids 
    : (taskToEdit?.strat_pic_id ? [taskToEdit.strat_pic_id] : []);

  // Campaign name initialization (preserve legacy or default to BAU)
  const initialCampaignName = taskToEdit?.campaign_name || 'BAU';

  const [form, setForm] = useState<CreateTaskInput>({
    client_id: taskToEdit?.client_id || activeClients[0]?.id || 1, 
    campaign_name: initialCampaignName, 
    content_type_id: isMockupPipeline
      ? (mockupContentType?.id || 1)
      : (taskToEdit?.content_type_id || defaultContentTypeId),
    task_source: isMockupPipeline
      ? 'ORCA'
      : (isNonMockupPipeline ? 'ECOMMERCE' : (taskToEdit?.task_source || defaultTaskSource)),
    is_mockup: isStrategicPipeline ? !isInitialStratEcom : (isMockupPipeline ? true : (taskToEdit?.is_mockup ?? false)),
    platform: taskToEdit?.platform || 'TIKTOK', 
    req_qty: taskToEdit?.req_qty || 1, 
    req_date: taskToEdit?.req_date ? taskToEdit.req_date.substring(0, 10) : new Date().toISOString().split('T')[0],
    due_date: taskToEdit?.due_date ? taskToEdit.due_date.substring(0, 10) : '', 
    requires_strategic_concept: isStrategicPipeline, 
    strat_pic_id: taskToEdit?.strat_pic_id || '',
    strat_pic_ids: initialStratPicIds,
    design_pic_id: taskToEdit?.design_pic_id || '',
    notes: taskToEdit?.notes || '',
    attachments: taskToEdit?.attachments || [],
  });

  const [selectedStratPicIds, setSelectedStratPicIds] = useState<string[]>(initialStratPicIds);
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (taskToEdit) {
      const pics = taskToEdit.strat_pic_ids?.length 
        ? taskToEdit.strat_pic_ids 
        : (taskToEdit.strat_pic_id ? [taskToEdit.strat_pic_id] : []);
      setSelectedStratPicIds(pics);

      const isTaskStratEcom = isStrategicPipeline && (taskToEdit.task_source === 'ECOMMERCE' || taskToEdit.is_mockup === false);
      const resolvedContentTypeId = isStrategicPipeline
        ? (isTaskStratEcom
            ? (taskToEdit.content_type_id && taskToEdit.content_type_id !== (mockupContentType?.id || 1) ? taskToEdit.content_type_id : (nonMockupContentTypes[0]?.id || 2))
            : (mockupContentType?.id || 1))
        : (taskToEdit.content_type_id || (contentTypes[0]?.id || 1));

      setForm(prev => ({
        ...prev,
        client_id: taskToEdit.client_id,
        campaign_name: taskToEdit.campaign_name || prev.campaign_name,
        content_type_id: resolvedContentTypeId,
        task_source: isStrategicPipeline
          ? (isTaskStratEcom ? 'ECOMMERCE' : 'ORCA')
          : (isMockupPipeline ? 'ORCA' : (isNonMockupPipeline ? 'ECOMMERCE' : (taskToEdit.task_source || prev.task_source))),
        is_mockup: isStrategicPipeline ? !isTaskStratEcom : (isMockupPipeline ? true : (taskToEdit.is_mockup ?? prev.is_mockup)),
        platform: taskToEdit.platform || prev.platform,
        req_qty: taskToEdit.req_qty || prev.req_qty,
        req_date: taskToEdit.req_date ? taskToEdit.req_date.substring(0, 10) : prev.req_date,
        due_date: taskToEdit.due_date ? taskToEdit.due_date.substring(0, 10) : prev.due_date,
        requires_strategic_concept: taskToEdit.requires_strategic_concept ?? prev.requires_strategic_concept,
        strat_pic_id: taskToEdit.strat_pic_id || '',
        strat_pic_ids: pics,
        design_pic_id: taskToEdit.design_pic_id || '',
        notes: taskToEdit.notes || '',
        attachments: taskToEdit.attachments || [],
      }));
    }
  }, [taskToEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    // Validation: Campaign Name must be selected
    if (!form.campaign_name) {
      setValidationError('Campaign Name wajib dipilih.');
      return;
    }

    // Validation: Strategic Pipeline MUST have at least 1 Strategic PIC selected
    if (isStrategicPipeline && selectedStratPicIds.length === 0) {
      setValidationError('Strategic PIC wajib dipilih sebelum task Strategic dapat disimpan.');
      return;
    }

    setSubmitting(true);
    try {
      const isStratEcom = isStrategicPipeline && (form.task_source === 'ECOMMERCE' || form.is_mockup === false);
      const resolvedContentTypeId = isStrategicPipeline
        ? (isStratEcom ? form.content_type_id : (mockupContentType?.id || 1))
        : (isMockupPipeline ? (mockupContentType?.id || 1) : form.content_type_id);
      const resolvedTaskSource: TaskSource = isStrategicPipeline
        ? (isStratEcom ? 'ECOMMERCE' : 'ORCA')
        : (isMockupPipeline ? 'ORCA' : (isNonMockupPipeline ? 'ECOMMERCE' : form.task_source));

      const sanitizedForm: CreateTaskInput = {
        ...form,
        requires_strategic_concept: isStrategicPipeline,
        pipeline_type: isStrategicPipeline ? 'STRATEGIC' : targetPipeline,
        is_mockup: isStrategicPipeline ? !isStratEcom : (isMockupPipeline ? true : (isNonMockupPipeline ? false : form.is_mockup)),
        content_type_id: resolvedContentTypeId,
        task_source: resolvedTaskSource,
        strat_pic_ids: isStrategicPipeline ? selectedStratPicIds : [],
        strat_pic_id: (isStrategicPipeline && selectedStratPicIds.length > 0)
          ? selectedStratPicIds[0]
          : undefined,
        design_pic_id: isStrategicPipeline ? null : (form.design_pic_id && form.design_pic_id.trim() !== '' ? form.design_pic_id : null),
      };

      if (editTaskId) {
        await editTask(editTaskId, sanitizedForm, userId, userRole);
      } else {
        await createTask(sanitizedForm, userId);
      }
      onClose();
    } catch (err: any) {
      console.error('Error saving task:', err);
      const errMsg = err?.message || err?.details || err?.error_description || (typeof err === 'object' ? JSON.stringify(err) : String(err));
      setValidationError(`Gagal menyimpan task: ${errMsg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const getPipelineBadge = () => {
    switch (targetPipeline) {
      case 'STRATEGIC':
        return <span className="badge text-xs bg-purple-500/15 text-purple-400 border-purple-500/30">Pipeline Strategic</span>;
      case 'GD_MOCKUP':
        return <span className="badge text-xs bg-blue-500/15 text-blue-400 border-blue-500/30">Pipeline GD Mockup</span>;
      case 'GD_NON_MOCKUP':
        return <span className="badge text-xs bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Pipeline GD E-Commerce</span>;
      default:
        return null;
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-bold text-[var(--text-primary)]">
              {editTaskId ? 'Edit Task Request' : 'Create New Task'}
            </h2>
            {getPipelineBadge()}
          </div>
          <button onClick={onClose} className="btn-ghost p-1"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {/* Validation Error Banner */}
          {validationError && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span className="font-medium">{validationError}</span>
            </div>
          )}

          {/* Row 1: Client / Brand & Campaign Name */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label mb-1 text-xs">Client / Brand *</label>
              <select className="select h-8 py-1 text-xs" value={form.client_id} onChange={e => setForm({ ...form, client_id: Number(e.target.value) })}>
                {activeClients.map(c => <option key={c.id} value={c.id}>{c.name} ({c.client_type})</option>)}
              </select>
            </div>

            <div>
              <label className="label mb-1 text-xs">Campaign Name *</label>
              <select 
                className="select h-8 py-1 text-xs" 
                required
                value={form.campaign_name} 
                onChange={e => {
                  setForm({ ...form, campaign_name: e.target.value });
                  if (validationError) setValidationError(null);
                }}
              >
                {taskToEdit?.campaign_name && !isValidCampaignName(taskToEdit.campaign_name) && (
                  <option value={taskToEdit.campaign_name}>
                    {taskToEdit.campaign_name} (Legacy)
                  </option>
                )}
                {CAMPAIGN_NAMES.map(cn => (
                  <option key={cn} value={cn}>{cn}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Kategori Pipeline GD (Strategic) / Task Source (GD pipelines) & Content Type */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {isStrategicPipeline ? (
              <div>
                <label className="label mb-1 text-xs font-semibold text-[var(--text-primary)]">
                  Kategori Pipeline GD *
                </label>
                <select
                  className="select h-8 py-1 text-xs"
                  value={form.task_source === 'ECOMMERCE' || form.is_mockup === false ? 'NON_MOCKUP' : 'MOCKUP'}
                  onChange={e => {
                    const isEcom = e.target.value === 'NON_MOCKUP';
                    if (isEcom) {
                      setForm(prev => {
                        const isCurrentlyMockup = prev.content_type_id === (mockupContentType?.id || 1);
                        return {
                          ...prev,
                          task_source: 'ECOMMERCE',
                          is_mockup: false,
                          content_type_id: isCurrentlyMockup ? (nonMockupContentTypes[0]?.id || 2) : prev.content_type_id
                        };
                      });
                    } else {
                      setForm(prev => ({
                        ...prev,
                        task_source: 'ORCA',
                        is_mockup: true,
                        content_type_id: mockupContentType?.id || 1
                      }));
                    }
                  }}
                >
                  <option value="MOCKUP">Mockup (Orca)</option>
                  <option value="NON_MOCKUP">Non Mockup (E-Commerce)</option>
                </select>
              </div>
            ) : isMockupPipeline ? (
              <div>
                <label className="label mb-1 text-xs font-semibold text-[var(--text-primary)]">Task Source *</label>
                <select className="select h-8 py-1 text-xs bg-[var(--bg-secondary)] cursor-not-allowed opacity-90" value="ORCA" disabled>
                  <option value="ORCA">Orca</option>
                </select>
              </div>
            ) : isNonMockupPipeline ? (
              <div>
                <label className="label mb-1 text-xs font-semibold text-[var(--text-primary)]">Task Source *</label>
                <select className="select h-8 py-1 text-xs bg-[var(--bg-secondary)] cursor-not-allowed opacity-90" value="ECOMMERCE" disabled>
                  <option value="ECOMMERCE">E-Commerce</option>
                </select>
              </div>
            ) : (
              <div>
                <label className="label mb-1 text-xs font-semibold text-[var(--text-primary)]">Task Source *</label>
                <select className="select h-8 py-1 text-xs" value={form.task_source} onChange={e => setForm({ ...form, task_source: e.target.value as TaskSource })}>
                  <option value="ORCA">Orca</option>
                  <option value="ECOMMERCE">E-Commerce</option>
                </select>
              </div>
            )}

            <div>
              <label className="label mb-1 text-xs font-semibold text-[var(--text-primary)]">
                Content Type *
              </label>
              {isStrategicPipeline ? (
                form.task_source === 'ECOMMERCE' || form.is_mockup === false ? (
                  <select 
                    className="select h-8 py-1 text-xs" 
                    value={form.content_type_id} 
                    onChange={e => setForm({ ...form, content_type_id: Number(e.target.value) })}
                  >
                    {nonMockupContentTypes.map(ct => (
                      <option key={ct.id} value={ct.id}>{ct.name}</option>
                    ))}
                  </select>
                ) : (
                  <select 
                    className="select h-8 py-1 text-xs" 
                    value={form.content_type_id || (mockupContentType?.id || 1)} 
                    onChange={e => setForm({ ...form, content_type_id: Number(e.target.value) })}
                  >
                    {availableMockupTypes.map(ct => (
                      <option key={ct.id} value={ct.id}>{ct.name}</option>
                    ))}
                  </select>
                )
              ) : isMockupPipeline ? (
                <select className="select h-8 py-1 text-xs bg-[var(--bg-secondary)] cursor-not-allowed opacity-90" value={mockupContentType?.id || 1} disabled>
                  <option value={mockupContentType?.id || 1}>Mockup Set (Mockup Khusus)</option>
                </select>
              ) : isNonMockupPipeline ? (
                <select className="select h-8 py-1 text-xs" value={form.content_type_id} onChange={e => setForm({ ...form, content_type_id: Number(e.target.value) })}>
                  {nonMockupContentTypes.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
                </select>
              ) : (
                <select className="select h-8 py-1 text-xs" value={form.content_type_id} onChange={e => setForm({ ...form, content_type_id: Number(e.target.value) })}>
                  {contentTypes.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
                </select>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="label mb-1 text-xs">Request Qty *</label>
              <input className="input h-8 py-1 text-xs" type="number" min={1} required
                value={form.req_qty} onChange={e => setForm({ ...form, req_qty: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label mb-1 text-xs">Request Date *</label>
              <input className="input h-8 py-1 text-xs" type="date" required
                value={form.req_date} onChange={e => setForm({ ...form, req_date: e.target.value })} />
            </div>
            <div>
              <label className="label mb-1 text-xs">Due Date *</label>
              <input className="input h-8 py-1 text-xs" type="date" required
                value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
            </div>
          </div>

          {/* STRATEGIC PIPELINE PIC SECTION (Mandatory for Strategic; Hidden for GD Mockup & GD Non-Mockup) */}
          {isStrategicPipeline && (
            <div className="p-3 rounded-lg space-y-2" style={{ background: 'rgba(147, 51, 234, 0.05)', border: '1px solid rgba(147, 51, 234, 0.22)' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <label className="label mb-0 font-bold text-xs text-[var(--text-primary)]">Strategic PIC *</label>
                  <span className="badge text-[9px] bg-purple-500/15 text-purple-400 border-purple-500/30">Wajib Dipilih</span>
                </div>
              </div>

              <div>
                <StratPicMultiSelect
                  selectedIds={selectedStratPicIds}
                  onChange={(ids) => {
                    setSelectedStratPicIds(ids);
                    if (ids.length > 0 && validationError) setValidationError(null);
                  }}
                  stratUsers={stratUsers}
                />
              </div>

              {selectedStratPicIds.length === 0 && (
                <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Strategic PIC wajib dipilih sebelum task dapat disimpan.</span>
                </div>
              )}
            </div>
          )}

          {/* STRATEGIC PIPELINE CONCEPT INFO BANNER */}
          {isStrategicPipeline && (
            <div className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 shrink-0 text-indigo-400 mt-0.5" />
              <div>
                <p className="font-semibold text-indigo-200 m-0">Perancangan & Pembuatan Konsep Strategic</p>
                <p className="text-[11px] text-indigo-300/80 m-0 mt-0.5 leading-relaxed">
                  Pipeline Strategic khusus untuk perumusan konsep visual & penyiapan deck strategi. Setelah konsep selesai dan di-approve, request dapat diserahterimakan ke Graphic Design untuk proses produksi aset.
                </p>
              </div>
            </div>
          )}

          {/* NON-STRATEGIC EDIT MODE GD PIC SECTION */}
          {!isStrategicPipeline && editTaskId && ['ADMIN', 'TEAM_LEAD'].includes(userRole || '') && (
            <div className="p-3 rounded-lg space-y-2 bg-[var(--bg-tertiary)] border border-[var(--border-secondary)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <label className="label mb-0 font-bold text-xs text-[var(--text-primary)]">Graphic Designer (GD PIC)</label>
                  {form.design_pic_id && (
                    <span className="badge text-[9px] bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Assigned</span>
                  )}
                </div>
              </div>
              <div>
                <select 
                  className="select h-8 py-1 text-xs" 
                  value={form.design_pic_id || ''} 
                  onChange={e => setForm({ ...form, design_pic_id: e.target.value || null })}
                >
                  <option value="">-- Belum Ditentukan (Unassigned) --</option>
                  {validDesigners.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.full_name} ({d.role_name === 'TEAM_LEAD' ? 'Team Lead' : 'Graphic Designer'})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Pipeline Lifecycle Preview */}
          <div className="p-2.5 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
            <span className="text-[var(--text-muted)] font-semibold flex items-center gap-1">
              <Compass className="w-3 h-3 text-blue-400" />
              Alur Pipeline:
            </span>
            <span className="font-semibold text-xs">
              {isStrategicPipeline ? (
                <span className="text-purple-400">
                  Strategic Mockup: Brief → Strat Concept → GD Mockup → Approved (Motion Ready)
                </span>
              ) : isMockupPipeline ? (
                <span className="text-blue-400">
                  ORCA Mockup: Brief → Desain GD → Motion Handover
                </span>
              ) : (
                <span className="text-emerald-400">
                  E-Commerce Mockup: Brief → Desain GD → Approval
                </span>
              )}
            </span>
          </div>

          {/* CREATIVE BRIEF & OBJECTIVE (WITH INTEGRATED PHOTO ATTACHMENT ICON) */}
          <div className="p-2.5 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-secondary)]">
            <RequestImageUpload
              section="brief"
              title="Creative Brief & Objective"
              attachments={form.attachments || []}
              onChange={atts => setForm(prev => ({ ...prev, attachments: atts }))}
              maxFiles={10}
            >
              <textarea 
                className="input py-1.5 text-xs w-full mt-1.5" 
                rows={2} 
                placeholder="Catatan brief, link aset referensi, atau instruksi..."
                value={form.notes} 
                onChange={e => setForm({ ...form, notes: e.target.value })} 
              />
            </RequestImageUpload>
          </div>

          <div className="flex justify-end gap-2 pt-2.5 border-t border-[var(--border-secondary)]">
            <button type="button" onClick={onClose} className="h-8 px-3 rounded-lg text-xs font-semibold btn-secondary">Cancel</button>
            <button type="submit" className="h-8 px-3.5 rounded-lg text-xs font-semibold btn-primary inline-flex items-center gap-1.5" disabled={submitting}>
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              {editTaskId ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}

// ===================== HANDOVER STRATEGIC TO GD MODAL =====================
function HandoverToGDModal({
  task, onClose, userId, userRole, designers, onSuccess, onNavigateToGD
}: {
  task: TaskWithRelations;
  onClose: () => void;
  userId: string;
  userRole?: string;
  designers: UserType[];
  onSuccess: () => Promise<void> | void;
  onNavigateToGD?: (pipeline: PipelineType) => void;
}) {
  const isNonMockup = task?.task_source === 'ECOMMERCE' || task?.is_mockup === false;
  const targetPipeline: PipelineType = (task?.pipeline_type === 'GD_NON_MOCKUP' || task?.pipeline_type === 'GD_MOCKUP')
    ? task.pipeline_type
    : (isNonMockup ? 'GD_NON_MOCKUP' : 'GD_MOCKUP');
  const [gdPicId, setGdPicId] = useState<string>(task?.design_pic_id || '');
  const [difficulty, setDifficulty] = useState<'LOW' | 'MEDIUM' | 'HIGH'>(task?.design_difficulty || 'MEDIUM');
  const [dueDate, setDueDate] = useState<string>(task?.due_date || '');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [completedHandover, setCompletedHandover] = useState<boolean>(false);
  const [spawnedTaskCode, setSpawnedTaskCode] = useState<string>('');

  if (!task) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gdPicId) {
      alert('Silakan pilih Graphic Designer (GD PIC) terlebih dahulu.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await handoverStrategicTaskToGD(task.id, {
        design_pic_id: gdPicId,
        design_difficulty: difficulty,
        target_pipeline: targetPipeline,
        due_date: dueDate || undefined,
        handover_notes: notes.trim() || undefined
      }, userId);

      await onSuccess();
      setSpawnedTaskCode(res?.spawnedTask?.task_code || task.task_code);
      setCompletedHandover(true);
    } catch (err: any) {
      console.error('Error handover strategic to GD:', err);
      alert(`Gagal mengalihkan ke GD: ${err?.message || err}`);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedDesigner = designers.find(d => d.id === gdPicId);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-lg p-0 overflow-hidden" onClick={e => e.stopPropagation()}>
        {completedHandover ? (
          <div className="p-6 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  Berhasil Dialihkan ke Graphic Design!
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Tiket telah diteruskan ke pipeline {targetPipeline === 'GD_MOCKUP' ? 'GD Mockup' : 'GD Non-Mockup'} dengan status <strong>Assigned</strong>.
                </p>
              </div>
            </div>

            <div className="p-4 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl space-y-2 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-[var(--border-secondary)]">
                <span className="text-[var(--text-muted)]">Kode Tiket:</span>
                <span className="font-mono font-bold text-cyan-400">{spawnedTaskCode}</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-[var(--border-secondary)]">
                <span className="text-[var(--text-muted)]">GD PIC Ditugaskan:</span>
                <span className="font-semibold text-emerald-400">{selectedDesigner?.full_name || 'Desainer'}</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-[var(--border-secondary)]">
                <span className="text-[var(--text-muted)]">Pipeline Tujuan:</span>
                <span className="px-2 py-0.5 rounded font-bold text-xs bg-purple-500/10 text-purple-300 border border-purple-500/20">
                  {targetPipeline === 'GD_MOCKUP' ? 'GD Mockup Pipeline' : 'GD Non-Mockup Pipeline'}
                </span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-[var(--text-muted)]">Status di Strategic:</span>
                <span className="text-emerald-400 font-semibold">Dialihkan ke Pipeline Tujuan</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-all cursor-pointer"
              >
                Tetap di Strategic
              </button>
              {onNavigateToGD && (
                <button
                  type="button"
                  onClick={() => onNavigateToGD(targetPipeline)}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all cursor-pointer"
                >
                  <span>Buka di Pipeline GD</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {/* Header */}
            <div className="px-5 py-4 border-b border-[var(--border-primary)] flex items-center justify-between bg-[var(--bg-secondary)]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
                  <ArrowRight className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-[var(--text-primary)]">
                    Alihkan ke Graphic Design
                  </h2>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Pilih GD PIC untuk memproses desain.
                  </p>
                </div>
              </div>
              <button type="button" onClick={onClose} className="btn-ghost p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[calc(85vh-120px)] overflow-y-auto">
              {/* Concept Info Card */}
              <div className="p-3.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-cyan-400">{task.task_code}</span>
                  <span className="badge text-[10px] bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                    Konsep Disetujui
                  </span>
                </div>
                <div className="text-[var(--text-primary)] font-semibold text-sm">
                  {task.campaign_name || 'Strategic Request'}
                </div>
                <div className="text-[var(--text-secondary)] text-[11px] flex items-center gap-2 flex-wrap">
                  <span>Client: <strong>{task.client_name || '-'}</strong></span>
                  {task.content_type_name && <span>• Content Type: <strong>{task.content_type_name}</strong></span>}
                  {task.strat_pic_name && <span>• Strat PIC: <strong>{task.strat_pic_name}</strong></span>}
                </div>
                {task.strat_concept_link && (
                  <div className="pt-1.5 border-t border-[var(--border-secondary)]">
                    <a
                      href={sanitizeUrl(task.strat_concept_link)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 hover:text-cyan-300 text-[11px] font-medium flex items-center gap-1 hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Buka Link Konsep Strategic</span>
                    </a>
                  </div>
                )}
              </div>

              {/* Target Pipeline Info (Pre-determined from Strategic task) */}
              <div className="p-3.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-[var(--text-muted)] font-medium">
                    Kategori Pipeline GD Tujuan
                  </div>
                  <div className="text-xs font-bold text-[var(--text-primary)] mt-0.5 flex items-center gap-1.5">
                    {targetPipeline === 'GD_MOCKUP' ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-purple-400 inline-block" />
                        <span>Mockup (Orca) &rarr; GD Mockup Pipeline</span>
                      </>
                    ) : (
                      <>
                        <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                        <span>Non Mockup (E-Commerce) &rarr; GD Non-Mockup Pipeline</span>
                      </>
                    )}
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${
                  targetPipeline === 'GD_MOCKUP'
                    ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                    : 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                }`}>
                  {targetPipeline === 'GD_MOCKUP' ? 'GD Mockup' : 'GD Non-Mockup'}
                </span>
              </div>

              {/* GD PIC Selection */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="label mb-0 text-xs font-semibold text-[var(--text-primary)]">
                    Pilih GD PIC (Graphic Designer) *
                  </label>
                  {task.design_pic_name && (
                    <span className="text-[10px] text-emerald-400">
                      Saat ini: {task.design_pic_name}
                    </span>
                  )}
                </div>
                <select
                  value={gdPicId}
                  onChange={e => setGdPicId(e.target.value)}
                  className="select h-9 text-xs w-full"
                  required
                >
                  <option value="">-- Pilih Graphic Designer --</option>
                  {designers.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.full_name} ({d.daily_capacity_points} pts/day)
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-[var(--text-muted)] mt-1">
                  Tiket akan langsung masuk ke kolom Assigned desainer di pipeline Graphic Design.
                </p>
              </div>

              {/* Difficulty & Due Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label mb-1 text-xs font-semibold text-[var(--text-primary)]">
                    Difficulty Desain
                  </label>
                  <select
                    value={difficulty}
                    onChange={e => setDifficulty(e.target.value as any)}
                    className="select h-9 text-xs w-full"
                  >
                    <option value="LOW">Low (1 pt)</option>
                    <option value="MEDIUM">Medium (2 pts)</option>
                    <option value="HIGH">High (3 pts)</option>
                  </select>
                </div>

                <div>
                  <label className="label mb-1 text-xs font-semibold text-[var(--text-primary)]">
                    Tenggat Waktu Desain (Due Date)
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className="input h-9 text-xs w-full"
                  />
                </div>
              </div>

              {/* Handover Notes */}
              <div>
                <label className="label mb-1 text-xs font-semibold text-[var(--text-primary)]">
                  Catatan Handover untuk Desainer (Opsional)
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Contoh: Fokus pada varian rasa cokelat, gunakan tone warna cerah sesuai deck..."
                  className="input py-2 text-xs min-h-[70px] w-full"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[var(--border-primary)] bg-[var(--bg-secondary)] flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="h-8 px-3.5 rounded-lg text-xs font-semibold btn-secondary"
                disabled={submitting}
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={!gdPicId || submitting}
                className="h-8 px-4 rounded-lg text-xs font-semibold btn-primary inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Mengalihkan...</span>
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-3.5 h-3.5" />
                    <span>Konfirmasi & Alihkan ke GD</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </motion.div>
  );
}

// ===================== ASSIGN MODAL =====================
function AssignModal({ 
  taskId, onClose, userId, userRole, designers, stratUsers = [], task
}: { 
  taskId: string; onClose: () => void; userId: string; userRole?: string; designers: UserType[]; stratUsers?: UserType[]; task?: TaskWithRelations | null;
}) {
  const [picId, setPicId] = useState(task?.design_pic_id || '');

  const initialStratPicIds = task?.strat_pic_ids?.length 
    ? task.strat_pic_ids 
    : (task?.strat_pic_id ? [task.strat_pic_id] : []);

  const [stratPicIds, setStratPicIds] = useState<string[]>(initialStratPicIds);
  const [difficulty, setDifficulty] = useState<'LOW' | 'MEDIUM' | 'HIGH'>(task?.design_difficulty || 'MEDIUM');
  const [submitting, setSubmitting] = useState(false);

  const hasStrategic = Boolean(task?.requires_strategic_concept && task?.status_strat !== 'NOT_REQUIRED');
  const alreadyHasDesignPic = Boolean(task?.design_pic_id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const finalDesignPicId = picId || undefined;

      const payload: AssignTaskInput = {
        design_pic_id: finalDesignPicId,
        design_difficulty: difficulty,
        strat_pic_ids: hasStrategic ? stratPicIds : undefined,
        strat_pic_id: (hasStrategic && stratPicIds.length > 0) ? stratPicIds[0] : undefined
      };
      await assignTask(taskId, payload, userId, userRole || 'TEAM_LEAD');
      onClose();
    } catch (err: any) {
      console.error('Error assigning task:', err);
      const errMsg = err?.message || err?.details || err?.error_description || (typeof err === 'object' ? JSON.stringify(err) : String(err));
      alert(`Gagal assign task: ${errMsg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const getModalTitle = () => {
    if (hasStrategic && !alreadyHasDesignPic) return 'Assign Strategic & Design PIC';
    if (hasStrategic) return 'Assign Strategic PIC & GD PIC';
    if (!alreadyHasDesignPic) return 'Assign Design PIC';
    return 'Confirm Assignment & Difficulty';
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <h2 className="text-base font-bold text-[var(--text-primary)]">
            {getModalTitle()}
          </h2>
          <button onClick={onClose} className="btn-ghost p-1"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {/* Strategic PIC Section (Multi-Select) */}
          {hasStrategic && (
            <div className="p-3 rounded-lg space-y-2" style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.18)' }}>
              <StratPicMultiSelect
                selectedIds={stratPicIds}
                onChange={setStratPicIds}
                stratUsers={stratUsers}
              />
            </div>
          )}

          {/* Design PIC Section */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0 text-xs font-semibold">{hasStrategic ? 'GD PIC (Graphic Designer)' : 'Design PIC *'}</label>
              {task?.design_pic_name && (
                <span className="badge text-[9px] bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                  Saat ini: {task.design_pic_name}
                </span>
              )}
            </div>
            <select
              className="select h-8 py-1 text-xs"
              value={picId}
              onChange={e => setPicId(e.target.value)}
              required={!hasStrategic}
            >
              <option value="">{hasStrategic ? '-- Belum Ditentukan (Unassigned) --' : '(Pilih Desainer)'}</option>
              {designers.map(d => (
                <option key={d.id} value={d.id}>
                  {d.full_name} ({d.daily_capacity_points} pts/day)
                </option>
              ))}
            </select>
          </div>

          {/* Design Difficulty */}
          <div>
            <label className="label mb-1 text-xs font-semibold">Design Difficulty *</label>
            <select className="select h-8 py-1 text-xs" value={difficulty} onChange={e => setDifficulty(e.target.value as 'LOW' | 'MEDIUM' | 'HIGH')}>
              <option value="LOW">Low (2.5 pts)</option>
              <option value="MEDIUM">Medium (3.5 pts)</option>
              <option value="HIGH">High (4.5 pts)</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-secondary)]">
            <button type="button" onClick={onClose} className="h-8 px-3 rounded-lg text-xs font-semibold btn-secondary">Cancel</button>
            <button type="submit" className="h-8 px-3.5 rounded-lg text-xs font-semibold btn-primary inline-flex items-center gap-1.5" disabled={submitting}>
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <User className="w-3.5 h-3.5" />} Simpan Assignment
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}

// ===================== SUBMIT STRATEGIC CONCEPT MODAL =====================
function SubmitStratModal({
  taskId,
  task,
  onClose,
  onSuccess,
  userId
}: {
  taskId: string;
  targetAfterSubmit?: StratStatus | null;
  task?: TaskWithRelations;
  onClose: () => void;
  onSuccess?: () => Promise<void> | void;
  userId: string;
}) {
  const [conceptName, setConceptName] = useState(task?.strat_concept_name || '');
  const [conceptLink, setConceptLink] = useState(task?.strat_concept_link || '');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isRevision = task?.status_strat === 'REVISION';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!conceptName.trim()) {
      alert('Silakan isi nama konsep/deck terlebih dahulu.');
      return;
    }
    if (!conceptLink.trim()) {
      alert('Silakan masukkan link Google Slides / Google Drive deck terlebih dahulu.');
      return;
    }
    setSubmitting(true);
    try {
      await submitStrategicConcept(taskId, { 
        strat_concept_name: conceptName.trim(), 
        strat_concept_link: conceptLink.trim(),
        notes: notes.trim() || undefined
      }, userId);

      if (onSuccess) {
        await onSuccess();
      }
      onClose();
    } catch (err: any) {
      console.error('Error submitting strategic concept:', err);
      const errMsg = err?.message || err?.details || err?.error_description || (typeof err === 'object' ? JSON.stringify(err) : String(err));
      alert(`Gagal submit Strategic Concept: ${errMsg}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-[var(--text-primary)]">
              {isRevision ? 'Re-submit Strategic Concept Deck' : 'Submit Strategic Concept Deck'}
            </h2>
            {isRevision && (
              <span className="text-[11px] px-2 py-0.5 rounded font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                Hasil Revisi
              </span>
            )}
          </div>
          <button onClick={onClose} className="btn-ghost p-1"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className="label mb-1 text-xs font-semibold">Deck / Concept Name *</label>
            <input
              className="input h-8 py-1 text-xs"
              required
              placeholder="e.g. Sosro Big Idea & Key Visual Concept V1"
              value={conceptName}
              onChange={e => setConceptName(e.target.value)}
            />
          </div>
          <div>
            <label className="label mb-1 text-xs font-semibold">Link Google Slides / Google Drive *</label>
            <input
              className="input h-8 py-1 text-xs"
              required
              placeholder="https://docs.google.com/presentation/d/... atau https://drive.google.com/..."
              value={conceptLink}
              onChange={e => setConceptLink(e.target.value)}
            />
          </div>
          <div>
            <label className="label mb-1 text-xs font-semibold">Catatan Konsep / Ringkasan (Opsional)</label>
            <textarea
              className="input py-1.5 text-xs min-h-[60px]"
              placeholder={isRevision ? "Tambahkan catatan perubahan hasil revisi..." : "Tambahkan ringkasan atau catatan konsep..."}
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
          <p className="text-[11px] p-2 rounded-lg" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', color: 'var(--accent-blue)' }}>
            Strategic deck akan masuk ke kolom Submit untuk ditinjau dan disetujui (Approved) oleh Reviewer / Lead.
          </p>
          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-secondary)]">
            <button type="button" onClick={onClose} className="h-8 px-3 rounded-lg text-xs font-semibold btn-secondary">Cancel</button>
            <button type="submit" className="h-8 px-3.5 rounded-lg text-xs font-semibold btn-primary inline-flex items-center gap-1.5" disabled={submitting}>
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Presentation className="w-3.5 h-3.5" />} 
              {isRevision ? 'Submit Hasil Revisi' : 'Submit Deck'}
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}

// ===================== SUBMIT MODAL =====================
function SubmitModal({ 
  taskId, 
  task,
  onClose, 
  userId
}: { 
  taskId: string; 
  task?: TaskWithRelations;
  onClose: () => void; 
  userId: string;
  targetAfterSubmit?: DesignStatus | null;
  onRequestRevision?: (taskId: string) => void;
}) {
  const [outputQty, setOutputQty] = useState(task?.output_qty || 1);
  const [assetName, setAssetName] = useState(task?.final_asset_name || '');
  const [assetLink, setAssetLink] = useState(task?.final_asset_link || '');
  const [submitting, setSubmitting] = useState(false);

  const isRevision = task?.status_design === 'DESIGN_REVISION';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetName.trim()) {
      alert('Silakan isi nama final asset terlebih dahulu.');
      return;
    }
    if (!assetLink.trim()) {
      alert('Silakan isi link Google Drive asset terlebih dahulu.');
      return;
    }
    setSubmitting(true);
    try {
      await submitTask(taskId, { output_qty: outputQty, final_asset_name: assetName.trim(), final_asset_link: assetLink.trim() }, userId);
      onClose();
    } catch (err: any) {
      console.error('Error submitting task:', err);
      const errMsg = err?.message || err?.details || err?.error_description || (typeof err === 'object' ? JSON.stringify(err) : String(err));
      alert(`Gagal submit design: ${errMsg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const titleText = isRevision ? 'Re-submit Output Desain (Revisi)' : 'Submit Output Desain';
  const buttonText = isRevision ? 'Re-submit Output' : 'Submit Output';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <h2 className="text-base font-bold text-[var(--text-primary)]">{titleText}</h2>
          <button onClick={onClose} className="btn-ghost p-1"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {task?.strat_concept_link && (
            <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-blue-400 truncate">
                <Presentation className="w-3.5 h-3.5 shrink-0" />
                <span className="font-semibold truncate">Ref Concept: {task.strat_concept_name || 'Deck'}</span>
              </div>
              <a href={sanitizeUrl(task.strat_concept_link)} target="_blank" rel="noopener noreferrer" className="text-blue-300 hover:underline inline-flex items-center gap-1 text-[11px] shrink-0 font-medium">
                Buka Deck <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          )}
          <div>
            <label className="label mb-1 text-xs font-semibold">Output Quantity *</label>
            <input className="input h-8 py-1 text-xs" type="number" min={1} required value={outputQty} onChange={e => setOutputQty(Number(e.target.value))} />
          </div>
          <div>
            <label className="label mb-1 text-xs font-semibold">Final Asset Name *</label>
            <input className="input h-8 py-1 text-xs" required placeholder="e.g. Delfi_Ramadhan_Banner_V1" value={assetName} onChange={e => setAssetName(e.target.value)} />
          </div>
          <div>
            <label className="label mb-1 text-xs font-semibold">Google Drive Link *</label>
            <input className="input h-8 py-1 text-xs" required placeholder="https://drive.google.com/..." value={assetLink} onChange={e => setAssetLink(e.target.value)} />
          </div>
          <p className="text-[11px] p-2 rounded-lg" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: 'var(--accent-emerald)' }}>
            SLA dihitung otomatis saat submit (hari kerja exclude weekend & libur nasional).
          </p>
          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-secondary)]">
            <button type="button" onClick={onClose} className="h-8 px-3 rounded-lg text-xs font-semibold btn-secondary">Cancel</button>
            <button type="submit" className="h-8 px-3.5 rounded-lg text-xs font-semibold btn-primary inline-flex items-center gap-1.5" disabled={submitting}>
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} {buttonText}
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}

// ===================== REVISION MODAL =====================
function RevisionModal({ 
  taskId, stage = 'DESIGN', task, onClose, userId 
}: { 
  taskId: string; stage?: 'STRATEGIC' | 'DESIGN'; task?: TaskWithRelations | null; onClose: () => void; userId: string; 
}) {
  const [reason, setReason] = useState<ReasonCategory>('CLIENT_CHANGE');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notes.trim()) {
      alert('Silakan isi catatan revisi terlebih dahulu.');
      return;
    }
    setSubmitting(true);
    try {
      await requestRevision(taskId, { stage, reason_category: reason, notes: notes.trim() }, userId);
      onClose();
    } catch (err: any) {
      console.error('Error requesting revision:', err);
      const errMsg = err?.message || err?.details || err?.error_description || (typeof err === 'object' ? JSON.stringify(err) : String(err));
      alert(`Gagal request revisi: ${errMsg}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
              <RotateCcw className="w-3.5 h-3.5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">
                {stage === 'STRATEGIC' ? 'Minta Revisi Konsep Strategic' : 'Request Revision (Design)'}
              </h2>
              <p className="text-[10px] text-[var(--text-muted)]">
                {stage === 'STRATEGIC'
                  ? 'Jelaskan catatan revisi konsep strategi untuk Strategic PIC.'
                  : 'Jelaskan catatan revisi desain untuk Desainer.'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost p-1"><X className="w-4 h-4" /></button>
        </div>

        {task && (
          <div className="px-4 pt-3">
            <div className="p-2.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-secondary)] text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-cyan-400">{task.task_code}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold">
                  {stage === 'STRATEGIC' ? 'Konsep Strategic' : 'Desain'}
                </span>
              </div>
              <div className="font-semibold text-[var(--text-primary)]">
                {task.campaign_name || 'Request'} {task.client_name ? `• ${task.client_name}` : ''}
              </div>
              {stage === 'STRATEGIC' && task.strat_pic_name && (
                <div className="text-[11px] text-[var(--text-muted)]">
                  Strategic PIC: <strong className="text-[var(--text-secondary)]">{task.strat_pic_name}</strong>
                </div>
              )}
              {stage === 'STRATEGIC' && task.strat_concept_link && (
                <div className="pt-1 border-t border-[var(--border-secondary)]">
                  <a
                    href={sanitizeUrl(task.strat_concept_link)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-400 hover:text-cyan-300 text-[10px] font-medium flex items-center gap-1 hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Link Deck: {task.strat_concept_name || 'Lihat Draft Konsep'}</span>
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className="label mb-1 text-xs font-semibold">Alasan Revisi (Reason Category) *</label>
            <select className="select h-8 py-1 text-xs w-full" value={reason} onChange={e => setReason(e.target.value as ReasonCategory)}>
              {Object.entries(REASON_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="label mb-1 text-xs font-semibold">
              {stage === 'STRATEGIC' ? 'Catatan Revisi Konsep *' : 'Revision Notes *'}
            </label>
            <textarea 
              className="input py-2 text-xs min-h-[75px] w-full" 
              required 
              placeholder={stage === 'STRATEGIC'
                ? 'Jelaskan secara detail bagian ide, deck, moodboard, atau pesan kampanye yang perlu diperbaiki...'
                : 'Describe what needs to be changed...'}
              value={notes} 
              onChange={e => setNotes(e.target.value)} 
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-secondary)]">
            <button type="button" onClick={onClose} className="h-8 px-3 rounded-lg text-xs font-semibold btn-secondary">
              Batal
            </button>
            <button type="submit" className="h-8 px-3.5 rounded-lg text-xs font-semibold btn-danger inline-flex items-center gap-1.5" disabled={submitting}>
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} 
              {stage === 'STRATEGIC' ? 'Kirim Permintaan Revisi' : 'Request Revision'}
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}

// ===================== TASK DETAIL MODAL (WITH CHAT & DISCUSSION) =====================
function TaskDetailModal({ 
  task, allTasks = [], onClose, user, onRefresh, onAssign, onSubmit, onRevise, onEdit, onSubmitStrat, onStratApprove, onHandoverToGD, onForwardToMotion, isForwardingMotion = false, initialTab = 'details'
}: { 
  task?: TaskWithRelations | null; allTasks?: TaskWithRelations[]; onClose: () => void; user: UserType; onRefresh: () => void;
  onAssign?: () => void; onSubmit?: () => void; onRevise?: (stage?: 'STRATEGIC' | 'DESIGN') => void; onEdit?: () => void;
  onSubmitStrat?: () => void; onStratApprove?: (task: TaskWithRelations) => void; onHandoverToGD?: (taskId: string) => void; initialTab?: 'details' | 'chat';
  onForwardToMotion?: (taskId: string, requireConfirmation?: boolean) => Promise<boolean>; isForwardingMotion?: boolean;
}) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [commentCount, setCommentCount] = useState<number>(task?.comments?.length || 0);
  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);
  const [taskAttachments, setTaskAttachments] = useState<TaskAttachment[]>(task?.attachments || []);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setTaskAttachments(task?.attachments || []);
  }, [task?.attachments]);

  const handleDirectUpload = async (newAttachment: TaskAttachment): Promise<void> => {
    if (!task) return;
    await addTaskAttachment(task.id, newAttachment);
    setTaskAttachments(prev => [...prev, newAttachment]);
    onRefresh();
  };

  const handleDirectDelete = async (attachmentId: string): Promise<void> => {
    if (!task) return;
    await removeTaskAttachment(task.id, attachmentId);
    setTaskAttachments(prev => prev.filter(a => a.id !== attachmentId));
    onRefresh();
  };

  if (!task) return null;

  const sourceStratTask = task.source_strategic_task_id ? (allTasks || []).find(t => t.id === task.source_strategic_task_id) : null;
  const spawnedDesignTask = task.spawned_design_task_id ? (allTasks || []).find(t => t.id === task.spawned_design_task_id) : null;

  const effectiveStratLink = task.strat_concept_link || sourceStratTask?.strat_concept_link || null;
  const effectiveStratName = task.strat_concept_name || sourceStratTask?.strat_concept_name || 'Strategic Concept Deck';
  const effectiveStratSubmittedAt = task.strat_submitted_at || sourceStratTask?.strat_submitted_at || null;

  const effectiveFinalAssetLink = task.final_asset_link || spawnedDesignTask?.final_asset_link || null;
  const effectiveFinalAssetName = task.final_asset_name || spawnedDesignTask?.final_asset_name || 'Final Asset Result';

  const effectiveMotionLink = task.motion_task?.link_motion || null;

  const canEdit = ['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name) || 
    (user.role_name === 'REQUESTER' && task.created_by === user.id) ||
    (task.pipeline_type === 'STRATEGIC' && user.role_name === 'STRATEGIC_PIC' && (task.strat_pic_id === user.id || Boolean(task.strat_pic_ids && task.strat_pic_ids.includes(user.id))));

  const isUserStratPic = task.strat_pic_id === user.id || Boolean(task.strat_pic_ids && task.strat_pic_ids.includes(user.id));
  const canManageStrat = ['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name);

  const pipelineLabel = task.pipeline_type === 'STRATEGIC' 
    ? 'STRATEGIC PIPELINE' 
    : task.is_mockup 
      ? 'GD MOCKUP PIPELINE' 
      : 'GD NON-MOCKUP PIPELINE';

  const pipelineIcon = task.pipeline_type === 'STRATEGIC'
    ? <Compass className="w-3.5 h-3.5 text-blue-400" />
    : task.is_mockup
      ? <Layers className="w-3.5 h-3.5 text-blue-400" />
      : <FileText className="w-3.5 h-3.5 text-blue-400" />;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="modal-overlay" onClick={onClose} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px' }}>
      <div className="modal-workspace-dialog" onClick={e => e.stopPropagation()}>
        
        {/* Header Bar (52px Fixed) */}
        <div className="modal-workspace-header">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] text-[10px] font-bold tracking-wider text-[var(--text-secondary)]">
              {pipelineIcon}
              <span>{pipelineLabel}</span>
            </div>
            <span className="text-xs text-[var(--text-muted)]">•</span>
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20">
              {task.task_code}
            </span>
            <span className="text-xs text-[var(--text-muted)]">•</span>
            {task.pipeline_type === 'STRATEGIC' ? (
              <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', borderColor: 'rgba(59, 130, 246, 0.2)', fontWeight: 600, fontSize: '11px', padding: '1px 6px' }}>
                • {STRAT_STATUS_LABELS[task.status_strat]}
              </span>
            ) : (
              <span className={`badge ${DESIGN_STATUS_COLORS[task.status_design]}`} style={{ fontSize: '11px', padding: '1px 6px' }}>
                • {DESIGN_STATUS_LABELS[task.status_design]}
              </span>
            )}
            {task.motion_readiness === 'READY_TO_ANIMATE' && (
              <span className="badge" style={{ background: 'rgba(236, 72, 153, 0.1)', color: '#ec4899', borderColor: 'rgba(236, 72, 153, 0.2)', fontSize: '10px', padding: '1px 5px' }}>
                Motion Ready
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* SLA Badge */}
            <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Clock className="w-3 h-3" />
              <span>SLA: {task.operational_excellence ? EXCELLENCE_LABELS[task.operational_excellence] : `${task.sla_working_days ?? 2} Hari Kerja`}</span>
            </div>

            {/* Copy / Share Link */}
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  navigator.clipboard.writeText(`${window.location.origin}/dashboard/tasks?code=${task.task_code}`);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }
              }}
              className="p-1.5 rounded-md border border-[var(--border-primary)] bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1 text-xs font-medium cursor-pointer"
              title="Salin Link Tiket"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Share2 className="w-3.5 h-3.5" />}
              {copiedLink && <span className="text-[10px] text-emerald-500 hidden md:inline">Tersalin</span>}
            </button>

            {/* Close button */}
            <button 
              onClick={onClose} 
              className="p-1.5 rounded-md border border-[var(--border-primary)] bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              title="Tutup Modal"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Modal Body: Two-Column Side-by-Side */}
        <div className="modal-workspace-body">
          
          {/* LEFT COLUMN: Request & Brief Details */}
          <div className="modal-workspace-left custom-scrollbar space-y-2.5">
            
            {/* Title & Priority Badges */}
            <div className="space-y-1.5 pb-2 border-b border-[var(--border-secondary)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                  <h2 className="text-base font-bold text-[var(--text-primary)] leading-tight truncate m-0">
                    {task.client_name}
                  </h2>
                  {task.client_type && (
                    <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-muted)] border border-[var(--border-secondary)] shrink-0">
                      {task.client_type}
                    </span>
                  )}
                  <span className="text-xs text-[var(--text-muted)]">•</span>
                  <span className="text-xs text-[var(--text-secondary)] font-medium truncate">
                    {task.campaign_name}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {task.design_difficulty && (
                    <span className={`badge ${DIFFICULTY_COLORS[task.design_difficulty]}`} style={{ fontSize: '10px', padding: '1px 5px' }}>
                      {DIFFICULTY_LABELS[task.design_difficulty]}
                    </span>
                  )}
                  {task.operational_excellence && (
                    <span className={`badge ${EXCELLENCE_COLORS[task.operational_excellence]}`} style={{ fontSize: '10px', padding: '1px 5px' }}>
                      {EXCELLENCE_LABELS[task.operational_excellence]}
                    </span>
                  )}
                </div>
              </div>

              {/* Quick Actions Row under title */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {canEdit && (
                  <button 
                    onClick={onEdit}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] border border-[var(--border-primary)] text-[var(--text-primary)] transition-colors cursor-pointer"
                  >
                    <Edit3 className="w-3 h-3 text-blue-500" /> Edit Brief
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      navigator.clipboard.writeText(`${window.location.origin}/dashboard/tasks?code=${task.task_code}`);
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
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 transition-colors"
                    title="Buka Strategic Concept Deck"
                  >
                    <Presentation className="w-3 h-3" /> Concept Deck
                  </a>
                )}
                {effectiveFinalAssetLink && (
                  <a
                    href={sanitizeUrl(effectiveFinalAssetLink)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 transition-colors"
                    title="Buka Final Asset GD"
                  >
                    <ExternalLink className="w-3 h-3" /> Final Asset
                  </a>
                )}
                {effectiveMotionLink && (
                  <a
                    href={sanitizeUrl(effectiveMotionLink)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-pink-500/10 hover:bg-pink-500/20 border border-pink-500/30 text-pink-400 transition-colors"
                    title="Buka Render Motion"
                  >
                    <Film className="w-3 h-3" /> Output Motion
                  </a>
                )}
              </div>
            </div>

            {/* Linkage Banner: Strategic Task -> Spawned Design Task */}
            {task.pipeline_type === 'STRATEGIC' && task.status_strat === 'APPROVED' && (
              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-emerald-400">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    Konsep disetujui. {task.spawned_design_task_id ? `Task produksi desain telah dibuat di ${task.task_source === 'ECOMMERCE' ? 'Ecommerce Pipeline' : 'Mockup Pipeline'}.` : 'Menunggu dialihkan ke Graphic Design.'}
                  </span>
                </div>
                {task.spawned_design_task_id ? (
                  <Link
                    href={`/dashboard/tasks?pipeline=${task.task_source === 'ECOMMERCE' ? 'GD_NON_MOCKUP' : 'GD_MOCKUP'}&search=${encodeURIComponent(task.task_code || '')}`}
                    onClick={onClose}
                    className="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 font-semibold text-[11px] hover:bg-emerald-500/30 transition-colors inline-flex items-center gap-1 shrink-0"
                  >
                    <span>Buka Desain</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onHandoverToGD?.(task.id);
                    }}
                    className="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 font-semibold text-[11px] hover:bg-emerald-500/30 transition-colors inline-flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <span>Alihkan ke GD</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}

            {/* Linkage Banner: Spawned Design Task -> Source Strategic Task */}
            {task.source_strategic_task_id && (
              <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-indigo-300">
                  <Compass className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span>Dibuat secara otomatis dari Strategic Concept yang telah disetujui.</span>
                </div>
                <Link
                  href={`/dashboard/tasks?pipeline=STRATEGIC&search=${encodeURIComponent(task.task_code?.replace('-DSGN', '') || '')}`}
                  onClick={onClose}
                  className="px-2.5 py-1 rounded bg-indigo-500/20 text-indigo-300 font-semibold text-[11px] hover:bg-indigo-500/30 transition-colors inline-flex items-center gap-1 shrink-0"
                >
                  <span>Lihat Konsep Strategic</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            )}

            {/* Key Information Card (Specs Grid) */}
            <div className="p-2.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)]">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2 text-xs">
                
                {/* Assigned PIC */}
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">
                    Assigned PIC
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3.5 h-3.5 rounded-full bg-blue-500/20 text-blue-400 font-bold text-[8px] flex items-center justify-center shrink-0">
                      {(task.design_pic_name || task.strat_pic_name || 'U').substring(0, 2).toUpperCase()}
                    </span>
                    <span className="font-semibold text-xs text-[var(--text-primary)] truncate">
                      {task.pipeline_type === 'STRATEGIC'
                        ? (task.strat_pic_names && task.strat_pic_names.length > 0 ? task.strat_pic_names.join(', ') : (task.strat_pic_name || 'Belum Ditentukan'))
                        : (task.design_pic_name || 'Belum Ditentukan')
                      }
                    </span>
                  </div>
                </div>

                {/* Requester / AE */}
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">
                    Requester (AE)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3.5 h-3.5 rounded-full bg-purple-500/20 text-purple-400 font-bold text-[8px] flex items-center justify-center shrink-0">
                      {(task.created_by_name || 'AE').substring(0, 2).toUpperCase()}
                    </span>
                    <span className="font-semibold text-xs text-[var(--text-primary)] truncate">
                      {task.created_by_name || 'Requester'}
                    </span>
                  </div>
                </div>

                {/* Target Deadline */}
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">
                    Target Deadline
                  </span>
                  <div className="flex items-center gap-1 text-xs font-semibold text-[var(--text-primary)]">
                    <Calendar className="w-3 h-3 text-amber-500 shrink-0" />
                    <span>{formatDisplayDate(task.due_date)}</span>
                  </div>
                </div>

                {/* Complexity & SLA */}
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">
                    Complexity &amp; SLA
                  </span>
                  <p className="font-semibold text-xs text-[var(--text-secondary)] m-0">
                    {(task.design_difficulty && DIFFICULTY_LABELS[task.design_difficulty]) || 'Standard'} • {task.sla_working_days ?? '—'} Hari
                  </p>
                </div>

                {/* Source & Output Qty */}
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">
                    Source &amp; Qty
                  </span>
                  <p className="font-semibold text-xs text-[var(--text-secondary)] m-0">
                    {SOURCE_LABELS[task.task_source]} • Req: {task.req_qty} | Out: {task.output_qty}
                  </p>
                </div>

                {/* Content Type */}
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">
                    Content Type
                  </span>
                  <p className="font-semibold text-xs text-[var(--text-primary)] m-0 truncate">
                    {task.content_type_name}
                  </p>
                </div>

              </div>
            </div>

            {/* Creative Brief & Technical Objective with Integrated Photo Attachment */}
            <div className="p-2.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] space-y-1.5">
              <RequestImageUpload
                section="brief"
                title="Creative Brief & Objective"
                attachments={taskAttachments}
                onChange={setTaskAttachments}
                onDirectUpload={canEdit ? handleDirectUpload : undefined}
                onDirectDelete={canEdit ? handleDirectDelete : undefined}
                readOnly={!canEdit}
                maxFiles={10}
                headerExtra={
                  <span className="text-[10px] text-[var(--text-muted)] font-medium">
                    Req: {formatDisplayDate(task.req_date)}
                  </span>
                }
              >
                <p className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed m-0 font-normal max-h-24 overflow-y-auto custom-scrollbar pr-1 mt-1">
                  {task.notes || 'Tidak ada catatan brief khusus yang disertakan.'}
                </p>
              </RequestImageUpload>
              <div className="flex flex-wrap gap-1 pt-1 border-t border-[var(--border-secondary)]">
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] text-[var(--text-secondary)]">
                  Format: PSD / Output Design
                </span>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] text-[var(--text-secondary)]">
                  Pipeline: {pipelineLabel}
                </span>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] text-[var(--text-secondary)]">
                  Target: {task.output_qty || 1} Output Asset
                </span>
              </div>
            </div>

            {/* Strategic Concept Link Section */}
            {(effectiveStratLink || task.status_strat !== 'NOT_REQUIRED') && (
              <div className="p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/20 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">
                    Strategic Concept Deck {task.source_strategic_task_id ? '(Ref Induk)' : ''}
                  </span>
                  {task.status_strat !== 'NOT_REQUIRED' ? (
                    <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', borderColor: 'rgba(59, 130, 246, 0.2)', fontSize: '10px', padding: '1px 5px' }}>
                      {STRAT_STATUS_LABELS[task.status_strat]}
                    </span>
                  ) : effectiveStratLink ? (
                    <span className="badge" style={{ background: 'rgba(168, 85, 247, 0.1)', color: '#a855f7', borderColor: 'rgba(168, 85, 247, 0.2)', fontSize: '10px', padding: '1px 5px' }}>
                      From Strategic
                    </span>
                  ) : null}
                </div>
                {effectiveStratLink ? (
                  <>
                    <p className="text-xs text-[var(--text-primary)] font-semibold m-0">{effectiveStratName}</p>
                    <a href={sanitizeUrl(effectiveStratLink)} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:underline flex items-center gap-1.5 font-medium truncate">
                      <ExternalLink className="w-3 h-3 shrink-0" /> {effectiveStratLink}
                    </a>
                    {effectiveStratSubmittedAt && (
                      <span className="text-[10px] text-[var(--text-muted)]">Submitted: {formatDisplayDateTime(effectiveStratSubmittedAt)}</span>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-[var(--text-muted)] m-0">Concept deck belum di-submit oleh Strategic PIC.</p>
                )}
              </div>
            )}

            {/* Final Asset Result */}
            {effectiveFinalAssetLink && (
              <div className="p-2.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                    Final Asset Result (Design GD)
                  </span>
                  {task.pipeline_type === 'STRATEGIC' && spawnedDesignTask && (
                    <span className="badge text-[10px] py-0 px-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Output {spawnedDesignTask.task_source === 'ECOMMERCE' ? 'Ecommerce' : 'Mockup'}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--text-primary)] font-semibold m-0">{effectiveFinalAssetName}</p>
                <a href={sanitizeUrl(effectiveFinalAssetLink)} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-emerald-400 hover:underline flex items-center gap-1.5 font-medium truncate">
                  <ExternalLink className="w-3 h-3 shrink-0" /> {effectiveFinalAssetLink}
                </a>
              </div>
            )}

            {/* Motion Output Render */}
            {effectiveMotionLink && (
              <div className="p-2.5 rounded-lg bg-pink-500/5 border border-pink-500/20 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-pink-400 font-bold uppercase tracking-wider">Output Render Animasi (Motion)</span>
                  {task.motion_task && (
                    <span className={`badge ${MOTION_STATUS_COLORS[task.motion_task.status_motion]}`} style={{ fontSize: '10px' }}>
                      {MOTION_STATUS_LABELS[task.motion_task.status_motion]}
                    </span>
                  )}
                </div>
                <a href={sanitizeUrl(effectiveMotionLink)} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-pink-400 hover:underline flex items-center gap-1.5 font-semibold truncate">
                  <Film className="w-3.5 h-3.5 shrink-0" /> {effectiveMotionLink}
                </a>
              </div>
            )}

            {/* Motion Task / Handover Section (Only for non-strategic tasks) */}
            {task.pipeline_type !== 'STRATEGIC' && (
              task.motion_task ? (
                <div className="p-2.5 rounded-lg bg-pink-500/5 border border-pink-500/20 flex flex-col gap-1.5">
                  <span className="text-[10px] text-pink-400 font-bold uppercase tracking-wider">Motion Subtask</span>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`badge ${MOTION_STATUS_COLORS[task.motion_task.status_motion]}`} style={{ fontSize: '10px' }}>{MOTION_STATUS_LABELS[task.motion_task.status_motion]}</span>
                      {task.motion_pic_name && <span className="text-xs text-[var(--text-secondary)]">PIC: {task.motion_pic_name}</span>}
                    </div>
                    <Link href="/dashboard/motion" onClick={onClose} className="text-xs text-pink-400 hover:underline flex items-center gap-1 font-medium">
                      Lihat Pipeline <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              ) : canForwardToMotion(task) ? (
                <div className="p-2.5 rounded-lg bg-pink-500/5 border border-dashed border-pink-500/30 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] text-pink-400 font-bold uppercase tracking-wider block">Motion Handover</span>
                    <p className="text-xs text-[var(--text-secondary)] m-0">Desain telah disetujui. Tiket ini dapat diteruskan ke tim Motion Designer.</p>
                  </div>
                  <button
                    disabled={isForwardingMotion}
                    onClick={async () => {
                      try {
                        const forwarded = await onForwardToMotion?.(task.id);
                        if (forwarded) onClose();
                      } catch (error) {
                        const message = extractErrorMessage(error);
                        window.alert(`Gagal meneruskan request ke Motion: ${message}`);
                      }
                    }}
                    className="btn-primary h-7 px-2.5 text-xs font-semibold rounded-md inline-flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{ background: 'var(--accent-pink)' }}
                  >
                    {isForwardingMotion ? <Loader2 className="w-3 h-3 animate-spin" /> : <Film className="w-3 h-3" />}
                    {isForwardingMotion ? 'Forwarding...' : 'Forward to Motion Pipeline'}
                  </button>
                </div>
              ) : null
            )}

            {/* Revision History */}
            {task.revisions && task.revisions.length > 0 && (
              <div className="flex flex-col gap-1.5 pt-1">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-primary)] m-0 flex items-center gap-1">
                  <RotateCcw className="w-3 h-3 text-amber-500" />
                  Revision History ({task.revisions.length})
                </h4>
                <div className="flex flex-col gap-1.5">
                  {task.revisions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(rev => (
                    <div key={rev.id} className="p-2.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] flex flex-col gap-1 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[var(--text-primary)]">{rev.stage} Rev #{rev.revision_number}</span>
                        <span className="text-[10px] text-[var(--text-muted)]">{formatDisplayDate(rev.created_at)}</span>
                      </div>
                      <div>
                        <span className="badge" style={{ fontSize: '9px', padding: '1px 5px', background: 'rgba(217, 119, 6, 0.1)', color: 'var(--accent-amber)', borderColor: 'rgba(217, 119, 6, 0.2)' }}>{REASON_LABELS[rev.reason_category]}</span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] m-0 leading-relaxed">{rev.notes || (rev as any).revision_notes}</p>
                      {rev.asset_link && (
                        <div className="mt-1 p-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border-secondary)] flex items-center gap-1.5 text-[11px]">
                          <ExternalLink className="w-3 h-3 text-blue-400 shrink-0" />
                          <span className="text-[var(--text-muted)]">Output:</span>
                          <a 
                            href={sanitizeUrl(rev.asset_link)} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-blue-400 hover:underline font-medium truncate"
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
              task={task}
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
            {canEdit && (
              <button 
                onClick={onEdit} 
                className="h-8 px-2.5 rounded-lg text-xs font-semibold bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] border border-[var(--border-primary)] text-[var(--text-primary)] transition-colors inline-flex items-center gap-1 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5 text-blue-500" /> Edit Request
              </button>
            )}
            {canUserDeleteTask(user, task) && (
              <button 
                disabled={isDeleting}
                onClick={async () => { 
                  const label = task.task_code ? `${task.task_code} (${task.client_name})` : 'request ini';
                  if (window.confirm(`Apakah Anda yakin ingin menghapus ${label}? Tindakan ini tidak dapat dibatalkan.`)) {
                    try {
                      setIsDeleting(true);
                      await deleteTask(task.id, user.id);
                      onRefresh();
                      onClose();
                    } catch (err: any) {
                      console.error('Gagal menghapus task:', err);
                      alert(`Gagal menghapus task: ${err?.message || err}`);
                    } finally {
                      setIsDeleting(false);
                    }
                  }
                }} 
                className="h-8 px-2.5 rounded-lg text-xs font-semibold text-rose-500 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-colors inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" /> {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            )}
            {/* ROLLBACK BUTTON */}
            {['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name) && (
              task.pipeline_type === 'STRATEGIC' ? (
                task.status_strat !== 'PENDING' && (
                  <button 
                    onClick={async () => { 
                      const prevStatus = task.status_strat === 'IN_PROGRESS' ? 'PENDING' :
                                         task.status_strat === 'REVIEW' ? 'IN_PROGRESS' :
                                         task.status_strat === 'REVISION' ? 'REVIEW' :
                                         task.status_strat === 'APPROVED' ? 'REVIEW' : null;
                      if (prevStatus) {
                        await updateStratStatus(task.id, prevStatus, user.id);
                        onRefresh();
                      }
                    }} 
                    className="h-8 px-2.5 rounded-lg text-xs font-semibold btn-secondary inline-flex items-center gap-1"
                  >
                    <Undo2 className="w-3.5 h-3.5" /> Undo Status
                  </button>
                )
              ) : (
                task.status_design !== 'DESIGN_UNASSIGNED' && task.status_design !== 'TASK_CLOSED' && (
                  <button 
                    onClick={async () => { 
                      const prevStatus = task.status_design === 'DESIGN_ASSIGNED' ? 'DESIGN_UNASSIGNED' :
                                         task.status_design === 'DESIGN_IN_PROGRESS' ? 'DESIGN_ASSIGNED' :
                                         task.status_design === 'DESIGN_SUBMITTED' ? 'DESIGN_IN_PROGRESS' :
                                         task.status_design === 'DESIGN_REVISION' ? 'DESIGN_SUBMITTED' :
                                         task.status_design === 'DESIGN_APPROVED' ? 'DESIGN_SUBMITTED' : null;
                      if (prevStatus) {
                        await updateTaskStatus(task.id, prevStatus, user.id);
                        onRefresh();
                      }
                    }} 
                    className="h-8 px-2.5 rounded-lg text-xs font-semibold btn-secondary inline-flex items-center gap-1"
                  >
                    <Undo2 className="w-3.5 h-3.5" /> Undo Status
                  </button>
                )
              )
            )}
          </div>

          {/* RIGHT SIDE: Primary Flow Actions */}
          <div className="flex flex-wrap items-center gap-1.5 justify-end">
            {/* Strategic Workflow Actions */}
            {(task.pipeline_type === 'STRATEGIC' || task.status_design === 'STRAT_PENDING' || task.requires_strategic_concept) && (
              <>
                {task.status_strat === 'PENDING' && (
                  !task.strat_pic_id && (!task.strat_pic_ids || task.strat_pic_ids.length === 0) ? (
                    canManageStrat && (
                      <button onClick={onAssign} className="h-8 px-3 rounded-lg text-xs font-semibold btn-primary inline-flex items-center gap-1" style={{ background: 'var(--accent-blue)' }}>
                        <User className="w-3.5 h-3.5" /> Assign Strat PIC
                      </button>
                    )
                  ) : (
                    (isUserStratPic || canManageStrat) && (
                      <button onClick={async () => { await updateStratStatus(task.id, 'IN_PROGRESS', user.id); onRefresh(); onClose(); }} className="h-8 px-3 rounded-lg text-xs font-semibold btn-primary inline-flex items-center gap-1" style={{ background: 'var(--accent-cyan)' }}>
                        <Play className="w-3.5 h-3.5" /> Start Strat
                      </button>
                    )
                  )
                )}
                {(task.status_strat === 'IN_PROGRESS' || task.status_strat === 'REVISION') && (isUserStratPic || canManageStrat) && (
                  <button onClick={onSubmitStrat} className="h-8 px-3 rounded-lg text-xs font-semibold btn-primary inline-flex items-center gap-1" style={{ background: 'var(--accent-blue)' }}>
                    <Presentation className="w-3.5 h-3.5" /> {task.status_strat === 'REVISION' ? 'Resubmit Deck' : 'Submit Deck'}
                  </button>
                )}
                {task.status_strat === 'REVIEW' && (canManageStrat || (user.role_name === 'REQUESTER' && task.created_by === user.id)) && (
                  <>
                    <button 
                      onClick={() => onRevise?.('STRATEGIC')} 
                      className="h-8 px-3 rounded-lg text-xs font-semibold btn-secondary text-amber-500 border-amber-500/30 hover:bg-amber-500/10 inline-flex items-center gap-1"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Request Revision
                    </button>
                    <button onClick={async () => {
                      if (onStratApprove) {
                        await onStratApprove(task);
                        onClose();
                      } else {
                        try {
                          await updateStratStatus(task.id, 'APPROVED', user.id);
                          onRefresh();
                          onClose();
                        } catch (err: any) {
                          console.error('Error approving strategic concept:', err);
                          alert(err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err)));
                        }
                      }
                    }} className="h-8 px-3 rounded-lg text-xs font-semibold btn-primary inline-flex items-center gap-1" style={{ background: 'var(--accent-emerald)' }}>
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve Strat
                    </button>
                  </>
                )}
                {task.status_strat === 'APPROVED' && (
                  <div className="inline-flex items-center gap-2 flex-wrap">
                    <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Konsep Strategis Disetujui
                    </div>
                    {task.pipeline_type === 'STRATEGIC' && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onHandoverToGD?.(task.id);
                        }}
                        className="h-8 px-3 rounded-lg text-xs font-semibold btn-primary inline-flex items-center gap-1.5 text-white bg-emerald-600 hover:bg-emerald-500 cursor-pointer"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                        <span>{task.spawned_design_task_id ? 'Ubah GD PIC' : 'Alihkan ke GD'}</span>
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Design Workflow Actions (Strictly for design pipelines) */}
            {task.pipeline_type !== 'STRATEGIC' && (
              <>
                {(task.status_design === 'DESIGN_UNASSIGNED' || !task.design_pic_id) && ['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name) && (
                  <button onClick={onAssign} className="h-8 px-3 rounded-lg text-xs font-semibold btn-primary inline-flex items-center gap-1">
                    <User className="w-3.5 h-3.5" /> Assign PIC
                  </button>
                )}
                
                {(task.status_design === 'DESIGN_ASSIGNED' || task.status_design === 'STRAT_PENDING') && Boolean(task.design_pic_id) && (task.design_pic_id === user.id || ['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name)) && (
                  <button onClick={async () => { await updateTaskStatus(task.id, 'DESIGN_IN_PROGRESS', user.id); onRefresh(); onClose(); }} className="h-8 px-3 rounded-lg text-xs font-semibold btn-primary inline-flex items-center gap-1" style={{ background: 'var(--accent-cyan)' }}>
                    <Play className="w-3.5 h-3.5" /> Start Work
                  </button>
                )}

                {(task.status_design === 'DESIGN_IN_PROGRESS' || task.status_design === 'DESIGN_REVISION') && (task.design_pic_id === user.id || ['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name)) && (
                  <button onClick={onSubmit} className="h-8 px-3 rounded-lg text-xs font-semibold btn-primary inline-flex items-center gap-1" style={{ background: 'var(--accent-emerald)' }}>
                    <Send className="w-3.5 h-3.5" /> Submit Output
                  </button>
                )}

                {task.status_design === 'DESIGN_SUBMITTED' && ['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name) && (
                  <>
                    <button onClick={() => onRevise?.('DESIGN')} className="h-8 px-3 rounded-lg text-xs font-semibold btn-secondary text-amber-500 border-amber-500/30 hover:bg-amber-500/10 inline-flex items-center gap-1">
                      <RotateCcw className="w-3.5 h-3.5" /> Request Revision
                    </button>
                    
                    <button onClick={async () => { await updateTaskStatus(task.id, 'DESIGN_APPROVED', user.id); onRefresh(); onClose(); }} className="h-8 px-3 rounded-lg text-xs font-semibold btn-primary inline-flex items-center gap-1" style={{ background: 'var(--accent-emerald)' }}>
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve Design
                    </button>
                  </>
                )}

                {canForwardToMotion(task) && (
                  <>
                    {task.motion_task ? (
                      <Link
                        href="/dashboard/motion"
                        onClick={onClose}
                        className="h-8 px-3 rounded-lg text-xs font-semibold btn-primary inline-flex items-center gap-1"
                        style={{ background: 'var(--accent-pink)' }}
                      >
                        <Film className="w-3.5 h-3.5" /> Buka di Motion ({task.motion_task.status_motion})
                      </Link>
                    ) : (
                      <button
                        disabled={isForwardingMotion}
                        onClick={async () => {
                          try {
                            const forwarded = await onForwardToMotion?.(task.id);
                            if (forwarded) onClose();
                          } catch (error) {
                            const message = extractErrorMessage(error);
                            window.alert(`Gagal meneruskan request ke Motion: ${message}`);
                          }
                        }}
                        className="h-8 px-3 rounded-lg text-xs font-semibold btn-primary inline-flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed"
                        style={{ background: 'var(--accent-pink)' }}
                      >
                        {isForwardingMotion ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Film className="w-3.5 h-3.5" />}
                        {isForwardingMotion ? 'Forwarding...' : 'Forward to Motion Pipeline'}
                      </button>
                    )}

                    {['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC', 'DESIGNER'].includes(user.role_name) && (
                      <button
                        onClick={async () => {
                          await updateTaskStatus(task.id, 'TASK_CLOSED', user.id);
                          onRefresh();
                          onClose();
                        }}
                        className="h-8 px-3 rounded-lg text-xs font-semibold btn-secondary text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 inline-flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Close Task
                      </button>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
