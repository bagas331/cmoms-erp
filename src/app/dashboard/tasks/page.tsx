'use client';
import { motion } from 'framer-motion';

import { useEffect, useState, useCallback, useMemo, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  getAllTasksWithRelations, getClients, getContentTypes, getUsers,
  createTask, editTask, assignTask, updateTaskStatus, submitTask, requestRevision, setMotionReadyness,
  deleteTask, getAuditLogs, updateStratStatus, submitStrategicConcept,
  getComments, addComment, deleteComment, getInvolvedUserIds
} from '@/lib/supabase-store';
import {
  DESIGN_STATUS_COLORS, DESIGN_STATUS_LABELS, DESIGN_KANBAN_COLUMNS,
  EXCELLENCE_COLORS, EXCELLENCE_LABELS, DIFFICULTY_LABELS, DIFFICULTY_COLORS,
  SOURCE_LABELS, REASON_LABELS, STRAT_STATUS_LABELS,
  MOTION_STATUS_COLORS, MOTION_STATUS_LABELS
} from '@/lib/constants';
import { formatDisplayDate, formatDisplayDateTime, cn, sanitizeUrl, getWeekOfMonth, getISOWeekNumber, getWeekRangeLabel } from '@/lib/utils';
import { TaskWithRelations, CreateTaskInput, AssignTaskInput, DesignStatus, TaskSource, ReasonCategory, Client, ContentType, User as UserType, StratStatus, TaskComment } from '@/lib/types';
import {
  Plus, Search, Filter, LayoutGrid, List, X, ChevronRight, ChevronDown, Trash2,
  User, Clock, Tag, Send, RotateCcw, CheckCircle2, Undo2, Play, Edit3,
  AlertTriangle, FileText, ExternalLink, ArrowRight, Download,
  MessageSquare, Loader2, Sparkles, Presentation, Film, GripVertical,
  MessageCircle, CornerDownRight, Check, Paperclip, Image as ImageIcon,
  Video as VideoIcon, Maximize2, Eye, FileVideo, XCircle,
  FolderCheck, Calendar, ChevronLeft, TrendingUp, Layers, CheckCheck, RefreshCw, Archive
} from 'lucide-react';
import { downloadCSV } from '@/lib/export';
import { TaskChatSection } from '@/components/task-chat-section';
import { RequestKanbanCard } from '@/components/request-kanban-card';

type ViewMode = 'kanban' | 'table';

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
  const searchParams = useSearchParams();
  const taskIdParam = searchParams?.get('taskId');
  const tabParam = searchParams?.get('tab') as 'details' | 'chat' | 'audit' | null;
  const sectionParam = searchParams?.get('section') as 'active' | 'archive' | null;

  const [mainTab, setMainTab] = useState<'active' | 'archive'>(sectionParam === 'archive' ? 'archive' : 'active');

  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [allUsers, setAllUsers] = useState<UserType[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Active Pipeline Filters
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPic, setFilterPic] = useState<string>('all');
  const [filterMonths, setFilterMonths] = useState<string[]>([]);
  const [filterYears, setFilterYears] = useState<string[]>([]);
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  const [showYearDropdown, setShowYearDropdown] = useState(false);
  const [filterExactDate, setFilterExactDate] = useState<string>('');

  // Approved Archive Filters, Period Navigation & View Mode
  const [archiveViewMode, setArchiveViewMode] = useState<'kanban' | 'table'>('kanban');
  const [archiveYear, setArchiveYear] = useState<string>(String(new Date().getFullYear()));
  const [archiveMonth, setArchiveMonth] = useState<string>(String(new Date().getMonth() + 1));
  const [archiveWeek, setArchiveWeek] = useState<string>('all');
  const [archiveSearch, setArchiveSearch] = useState<string>('');
  const [archiveRequester, setArchiveRequester] = useState<string>('all');
  const [archivePic, setArchivePic] = useState<string>('all');
  const [archiveSort, setArchiveSort] = useState<string>('approved_desc');
  const [archivePage, setArchivePage] = useState<number>(1);
  const [archiveLimit, setArchiveLimit] = useState<number>(15);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<string | null>(null);
  const [showDetailModal, setShowDetailModal] = useState<string | null>(null);
  const [modalInitialTab, setModalInitialTab] = useState<'details' | 'chat' | 'audit'>('details');
  const [showAssignModal, setShowAssignModal] = useState<string | null>(null);
  const [showRevisionModal, setShowRevisionModal] = useState<{ taskId: string; stage: 'STRATEGIC' | 'DESIGN' } | null>(null);
  const [showSubmitModal, setShowSubmitModal] = useState<string | null>(null);
  const [showStratSubmitModal, setShowStratSubmitModal] = useState<string | null>(null);

  // Auto-open task modal and switch tab if taskId is provided in query params
  useEffect(() => {
    if (taskIdParam && tasks.length > 0) {
      const matched = tasks.find(t => t.id === taskIdParam || t.task_code === taskIdParam);
      if (matched) {
        setShowDetailModal(matched.id);
        setModalInitialTab(tabParam === 'chat' ? 'chat' : tabParam === 'audit' ? 'audit' : 'details');
      }
    }
  }, [taskIdParam, tabParam, tasks]);

  // Drag & Drop State
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const canMoveTask = useCallback((t: TaskWithRelations) => {
    if (!user) return false;
    if (['ADMIN', 'TEAM_LEAD'].includes(user.role_name)) return true;
    if (user.role_name === 'DESIGNER' && t.design_pic_id === user.id) return true;
    if (user.role_name === 'REQUESTER' && t.created_by === user.id) return true;
    if (user.role_name === 'STRATEGIC_PIC' && (t.strat_pic_id === user.id || t.strat_pic_ids?.includes(user.id))) return true;
    return false;
  }, [user]);

  const handleDragStart = (e: React.DragEvent, task: TaskWithRelations) => {
    if (!canMoveTask(task)) {
      e.preventDefault();
      return;
    }
    setDraggedTaskId(task.id);
    e.dataTransfer.setData('text/plain', task.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, targetStatus: DesignStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColumn !== targetStatus) {
      setDragOverColumn(targetStatus);
    }
  };

  const handleDragLeave = (e: React.DragEvent, targetStatus: DesignStatus) => {
    if (dragOverColumn === targetStatus) {
      setDragOverColumn(null);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: DesignStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId;
    setDraggedTaskId(null);

    if (!taskId || !user) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    if (task.status_design === targetStatus) return;

    try {
      if (targetStatus === 'DESIGN_UNASSIGNED') {
        if (!['ADMIN', 'TEAM_LEAD'].includes(user.role_name)) {
          alert('Hanya Admin atau Team Lead yang dapat memindahkan tiket ke Unassigned.');
          return;
        }
        await updateTaskStatus(task.id, 'DESIGN_UNASSIGNED', user.id);
        refreshTasks();
      } else if (targetStatus === 'DESIGN_ASSIGNED') {
        if (!['ADMIN', 'TEAM_LEAD'].includes(user.role_name)) {
          alert('Hanya Admin atau Team Lead yang dapat menetapkan PIC Desainer.');
          return;
        }
        if (!task.design_pic_id) {
          setShowAssignModal(task.id);
        } else {
          await updateTaskStatus(task.id, 'DESIGN_ASSIGNED', user.id);
          refreshTasks();
        }
      } else if (targetStatus === 'DESIGN_IN_PROGRESS') {
        if (!['ADMIN', 'TEAM_LEAD'].includes(user.role_name) && task.design_pic_id !== user.id) {
          alert('Hanya desainer yang ditugaskan atau Lead yang dapat memulai pengerjaan desain.');
          return;
        }
        await updateTaskStatus(task.id, 'DESIGN_IN_PROGRESS', user.id);
        refreshTasks();
      } else if (targetStatus === 'DESIGN_SUBMITTED') {
        if (!['ADMIN', 'TEAM_LEAD'].includes(user.role_name) && task.design_pic_id !== user.id) {
          alert('Hanya desainer yang ditugaskan atau Lead yang dapat men-submit hasil desain.');
          return;
        }
        setShowSubmitModal(task.id);
      } else if (targetStatus === 'DESIGN_REVISION') {
        setShowRevisionModal({ taskId: task.id, stage: 'DESIGN' });
      } else if (targetStatus === 'DESIGN_APPROVED') {
        if (!['ADMIN', 'TEAM_LEAD', 'REQUESTER'].includes(user.role_name)) {
          alert('Hanya Requester, Team Lead, atau Admin yang dapat menyetujui desain.');
          return;
        }
        await updateTaskStatus(task.id, 'DESIGN_APPROVED', user.id);
        refreshTasks();
      } else if (targetStatus === 'STRAT_PENDING') {
        if (!['ADMIN', 'TEAM_LEAD'].includes(user.role_name)) {
          alert('Hanya Admin atau Team Lead yang dapat memindahkan ke Strategic Pending.');
          return;
        }
        await updateTaskStatus(task.id, 'STRAT_PENDING', user.id);
        refreshTasks();
      } else {
        await updateTaskStatus(task.id, targetStatus, user.id);
        refreshTasks();
      }
    } catch (err: any) {
      console.error('Error on drag & drop transition:', err);
      alert(`Gagal mengubah status: ${err?.message || err}`);
    }
  };


  const refreshTasks = useCallback(async () => {
    try {
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

  const uniquePics = Array.from(new Set(tasks.filter(t => t.design_pic_name).map(t => t.design_pic_name))).sort();

  const filteredTasks = tasks.filter(t => {
    const matchSearch = searchQuery === '' ||
      (t.task_code || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.client_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.campaign_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.design_pic_name || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = filterStatus === 'all' || t.status_design === filterStatus;
    
    // Date Filtering
    let matchDate = true;
    if (filterExactDate) {
      matchDate = (t.created_at || '').startsWith(filterExactDate) || t.req_date === filterExactDate;
    } else {
      const createdMonth = (t.created_at || '').substring(5, 7);
      const createdYear = (t.created_at || '').substring(0, 4);
      const reqMonth = (t.req_date || '').substring(5, 7);
      const reqYear = (t.req_date || '').substring(0, 4);
      
      const matchMonth = filterMonths.length === 0 || filterMonths.includes(createdMonth) || filterMonths.includes(reqMonth);
      const matchYear = filterYears.length === 0 || filterYears.includes(createdYear) || filterYears.includes(reqYear);
      matchDate = matchMonth && matchYear;
    }

    const matchPic = filterPic === 'all' || t.design_pic_name === filterPic;

    return matchSearch && matchStatus && matchDate && matchPic;
  });

  // 1. All Accessible Approved Tasks (Archive Base with RBAC)
  const accessibleApprovedTasks = useMemo(() => {
    if (!user) return [];
    let list = tasks.filter(t => t.status_design === 'DESIGN_APPROVED' || t.status_design === 'TASK_CLOSED');
    
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

  const activeTasksCount = tasks.filter(t => t.status_design !== 'DESIGN_APPROVED' && t.status_design !== 'TASK_CLOSED').length;
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
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-[var(--border-secondary)]">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <span>Mockup & Request Pipeline</span>
          </h1>
        </div>

        {/* Section Switcher Navigation */}
        <div className="flex items-center p-1 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl shadow-sm">
          <button
            onClick={() => setMainTab('active')}
            className={`flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
              mainTab === 'active'
                ? 'bg-[var(--accent-blue)] text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            <span>Active Pipeline</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${mainTab === 'active' ? 'bg-white/20 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'}`}>
              {activeTasksCount}
            </span>
          </button>

          <button
            onClick={() => setMainTab('archive')}
            className={`flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
              mainTab === 'archive'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
            }`}
          >
            <FolderCheck className="w-4 h-4" />
            <span>Approved Archive</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${mainTab === 'archive' ? 'bg-white/20 text-white' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
              {approvedTasksCount}
            </span>
          </button>
        </div>
      </div>

      {/* ACTIVE PIPELINE VIEW */}
      {mainTab === 'active' && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="bg-[var(--bg-card)] p-4 rounded-xl border border-[var(--border-primary)] shadow-sm mb-6 flex flex-col gap-4">
        
        {/* Top Row: Search & View Toggle */}
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            <input className="input pl-10 w-full" placeholder="Search tasks, brands, PIC..."
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <button onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-2 px-5 py-2 h-[38px] text-sm font-medium rounded-lg transition-all focus:outline-none ${viewMode === 'kanban' ? 'bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--accent-blue)] shadow-sm' : 'text-[var(--text-secondary)] bg-transparent border border-transparent hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'}`}>
              <LayoutGrid className="w-4 h-4" /> Kanban
            </button>
            <button onClick={() => setViewMode('table')}
              className={`flex items-center gap-2 px-5 py-2 h-[38px] text-sm font-medium rounded-lg transition-all focus:outline-none ${viewMode === 'table' ? 'bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--accent-blue)] shadow-sm' : 'text-[var(--text-secondary)] bg-transparent border border-transparent hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'}`}>
              <List className="w-4 h-4" /> Table
            </button>
          </div>
        </div>

        {/* Bottom Row: Filters & Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 mt-1" style={{ borderTop: '1px solid var(--border-secondary)' }}>
          <div className="flex flex-wrap items-center gap-3 flex-1">
            {/* Filter Group: Unified Pill */}
            <div className="flex flex-wrap items-center bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-primary)] shadow-sm">
              
              {/* Month Dropdown */}
              <div className="relative">
                <button 
                  onClick={() => { setShowMonthDropdown(!showMonthDropdown); setShowYearDropdown(false); }}
                  className="px-4 py-2 h-[38px] flex items-center justify-between min-w-[130px] bg-transparent hover:bg-[var(--bg-tertiary)] rounded-l-lg transition-colors focus:outline-none"
                >
                  <span className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-2">
                    {filterMonths.length === 0 ? 'All Months' : filterMonths.length === 1 ? getMonthName(filterMonths[0]) : `${filterMonths.length} Months`}
                  </span>
                  <ChevronDown className="w-4 h-4 ml-2 opacity-50" />
                </button>
              {showMonthDropdown && (
                <div className="absolute top-full left-0 mt-2 w-48 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
                  <div className="p-2 border-b border-[var(--border-primary)] sticky top-0 bg-[var(--bg-secondary)]">
                    <label className="flex items-center gap-2 p-1.5 hover:bg-[var(--bg-tertiary)] rounded cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={filterMonths.length === 12}
                        onChange={(e) => {
                          if (e.target.checked) setFilterMonths(allMonths);
                          else setFilterMonths([]);
                          setFilterExactDate('');
                        }}
                        className="rounded border-[var(--border-primary)]"
                      />
                      <span className="text-sm font-medium">Select All</span>
                    </label>
                  </div>
                  <div className="p-1">
                    {allMonths.map(m => (
                      <label key={m} className="flex items-center gap-2 p-2 hover:bg-[var(--bg-tertiary)] rounded cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={filterMonths.includes(m)}
                          onChange={(e) => {
                            if (e.target.checked) setFilterMonths([...filterMonths, m]);
                            else setFilterMonths(filterMonths.filter(x => x !== m));
                            setFilterExactDate('');
                          }}
                          className="rounded border-[var(--border-primary)]"
                        />
                        <span className="text-sm">{getMonthName(m)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              </div>

              <div className="w-px h-5 bg-[var(--border-primary)]"></div>

              {/* Year Dropdown */}
              <div className="relative">
                <button 
                  onClick={() => { setShowYearDropdown(!showYearDropdown); setShowMonthDropdown(false); }}
                  className="px-4 py-2 h-[38px] flex items-center justify-between min-w-[110px] bg-transparent hover:bg-[var(--bg-tertiary)] transition-colors focus:outline-none"
                >
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    {filterYears.length === 0 ? 'All Years' : filterYears.length === 1 ? filterYears[0] : `${filterYears.length} Years`}
                  </span>
                  <ChevronDown className="w-4 h-4 ml-2 opacity-50" />
                </button>
                {showYearDropdown && (
                  <div className="absolute top-full left-0 mt-2 w-48 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
                    <div className="p-2 border-b border-[var(--border-primary)] sticky top-0 bg-[var(--bg-secondary)]">
                      <label className="flex items-center gap-2 p-1.5 hover:bg-[var(--bg-tertiary)] rounded cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={filterYears.length === availableYears.length}
                          onChange={(e) => {
                            if (e.target.checked) setFilterYears(availableYears);
                            else setFilterYears([]);
                            setFilterExactDate('');
                          }}
                          className="rounded border-[var(--border-primary)]"
                        />
                        <span className="text-sm font-medium">Select All</span>
                      </label>
                    </div>
                    <div className="p-1">
                      {availableYears.map(y => (
                        <label key={y} className="flex items-center gap-2 p-2 hover:bg-[var(--bg-tertiary)] rounded cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={filterYears.includes(y)}
                            onChange={(e) => {
                              if (e.target.checked) setFilterYears([...filterYears, y]);
                              else setFilterYears(filterYears.filter(x => x !== y));
                              setFilterExactDate('');
                            }}
                            className="rounded border-[var(--border-primary)]"
                          />
                          <span className="text-sm">{y}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="w-px h-5 bg-[var(--border-primary)]"></div>

              {/* Date Input */}
              <div className="flex items-center">
                <input 
                  type="date" 
                  className="px-4 py-2 h-[38px] text-sm bg-transparent border-none focus:outline-none focus:ring-0 min-w-[140px] transition-all hover:bg-[var(--bg-tertiary)]" 
                  value={filterExactDate} 
                  onChange={(e) => setFilterExactDate(e.target.value)} 
                  title="Filter by Exact Date (Overrides Month)"
                />
              </div>

              <div className="w-px h-5 bg-[var(--border-primary)]"></div>

              {/* Status Dropdown */}
              <div className="flex items-center">
                <select className="px-4 py-2 h-[38px] text-sm bg-transparent border-none focus:outline-none focus:ring-0 min-w-[140px] transition-all hover:bg-[var(--bg-tertiary)] cursor-pointer" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                  <option value="all">All Status</option>
                  {Object.entries(DESIGN_STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              <div className="w-px h-5 bg-[var(--border-primary)]"></div>

              {/* Designer Dropdown */}
              <div className="flex items-center">
                <select className="px-4 py-2 h-[38px] text-sm bg-transparent border-none focus:outline-none focus:ring-0 min-w-[140px] rounded-r-lg transition-all hover:bg-[var(--bg-tertiary)] cursor-pointer" value={filterPic} onChange={(e) => setFilterPic(e.target.value)}>
                  <option value="all">All Designers</option>
                  {uniquePics.map(pic => (
                    <option key={pic as string} value={pic as string}>{pic}</option>
                  ))}
                </select>
              </div>

            </div>
          </div>

          {/* Actions */}
          <button 
            onClick={() => {
              downloadCSV(filteredTasks.map(t => ({
                'Task Code': t.task_code,
                'Brand': t.client_name,
                'Campaign': t.campaign_name,
                'Platform': t.platform || '-',
                'Req Date': new Date(t.req_date).toLocaleDateString(),
                'Due Date': new Date(t.due_date).toLocaleDateString(),
                'Designer': t.design_pic_name || 'Unassigned',
                'Status': DESIGN_STATUS_LABELS[t.status_design as keyof typeof DESIGN_STATUS_LABELS] || t.status_design
              })), 'Graphic_Tasks_Export.csv');
            }}
            className="btn-outline shrink-0 h-10 px-4 rounded-lg flex items-center gap-2"
          >
            <Download className="w-4 h-4" /> Export
          </button>
          
          {['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name) && (
            <button onClick={() => setShowCreateModal(true)} className="btn-primary shrink-0" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 16px', height: '40px', borderRadius: '8px', fontWeight: '600' }}>
              <Plus className="w-4 h-4" /> <span>New Task</span>
            </button>
          )}
        </div>
      </div>

      {/* KANBAN VIEW */}
      {viewMode === 'kanban' && (
        <div className="flex gap-6 overflow-x-auto pb-6 scroll-smooth snap-x" style={{ minHeight: 'calc(100vh - 200px)' }}>
          {DESIGN_KANBAN_COLUMNS.map(col => {
            const colTasks = filteredTasks.filter(t => t.status_design === col.status);
            const isTargetOver = dragOverColumn === col.status;
            return (
              <div 
                key={col.status} 
                onDragOver={(e) => handleDragOver(e, col.status)}
                onDragLeave={(e) => handleDragLeave(e, col.status)}
                onDrop={(e) => handleDrop(e, col.status)}
                className={`kanban-column flex-shrink-0 w-[320px] snap-center transition-all duration-200 flex flex-col ${
                  isTargetOver ? 'ring-2 ring-[var(--accent-blue)] bg-[var(--bg-tertiary)]/60 shadow-lg scale-[1.01]' : ''
                }`}
              >
                <div className="p-4 flex items-center justify-between sticky top-0 bg-[var(--bg-secondary)] z-10" style={{ borderBottom: '1px solid var(--border-secondary)', borderTopLeftRadius: '16px', borderTopRightRadius: '16px' }}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-3 h-3 rounded-full shadow-sm" style={{ background: col.color }} />
                    <span className="text-sm font-bold text-[var(--text-primary)] tracking-wide">{col.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {col.status === 'DESIGN_APPROVED' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMainTab('archive');
                        }}
                        className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 hover:underline transition-all"
                        title="Buka Halaman Arsip Approved"
                      >
                        <span>Arsip</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
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
                    const isMovable = canMoveTask(task);
                    const isBeingDragged = draggedTaskId === task.id;
                    return (
                      <RequestKanbanCard
                        key={task.id}
                        task={task}
                        isMovable={isMovable}
                        isBeingDragged={isBeingDragged}
                        isArchive={false}
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
                          if (!user) return;
                          await updateStratStatus(taskId, 'APPROVED', user.id);
                          refreshTasks();
                        }}
                        onStratRevise={(taskId) => setShowRevisionModal({ taskId, stage: 'STRATEGIC' })}
                        onStartWork={async (taskId) => {
                          if (!user) return;
                          await updateTaskStatus(taskId, 'DESIGN_IN_PROGRESS', user.id);
                          refreshTasks();
                        }}
                        onMoveToMotion={async (taskId) => {
                          if (!user) return;
                          await setMotionReadyness(taskId, true, user.id);
                          refreshTasks();
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
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
                <th>Content</th>
                <th>Source</th>
                <th>Qty</th>
                <th>Designer</th>
                <th>Difficulty</th>
                <th>Status</th>
                <th>SLA</th>
                <th>Rev</th>
                <th>Req Date</th>
                <th>Due Date</th>
                <th>Actions</th>
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
                  <td className="text-sm" style={{ color: 'var(--text-secondary)' }}>{task.content_type_name}</td>
                  <td><span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{SOURCE_LABELS[task.task_source]}</span></td>
                  <td className="text-sm text-center" style={{ color: 'var(--text-secondary)' }}>{task.output_qty}</td>
                  <td className="text-sm" style={{ color: task.design_pic_name ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                    {task.design_pic_name || '—'}
                  </td>
                  <td>
                    {task.design_difficulty ? (
                      <span className={`badge text-[10px] ${DIFFICULTY_COLORS[task.design_difficulty]}`}>{DIFFICULTY_LABELS[task.design_difficulty]}</span>
                    ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td><span className={`badge ${DESIGN_STATUS_COLORS[task.status_design]}`}>{DESIGN_STATUS_LABELS[task.status_design]}</span></td>
                  <td>
                    {task.operational_excellence ? (
                      <span className={`badge ${EXCELLENCE_COLORS[task.operational_excellence]}`}>{EXCELLENCE_LABELS[task.operational_excellence]}</span>
                    ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td className="text-sm text-center" style={{ color: task.design_revision_count > 0 ? 'var(--accent-amber)' : 'var(--text-muted)' }}>
                    {task.design_revision_count}
                  </td>
                  <td className="text-sm" style={{ color: 'var(--text-secondary)' }}>{formatDisplayDate(task.req_date)}</td>
                  <td className="text-sm" style={{ color: 'var(--text-secondary)' }}>{formatDisplayDate(task.due_date)}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      {/* Edit (Requester can only edit their own task) */}
                      {['ADMIN', 'TEAM_LEAD'].includes(user.role_name) || (user.role_name === 'REQUESTER' && task.created_by === user.id) ? (
                        <button onClick={() => setShowEditModal(task.id)} className="btn-ghost text-xs py-1 px-2" style={{ color: 'var(--text-primary)' }} title="Edit Request">
                          <Edit3 className="w-3 h-3" /> Edit
                        </button>
                      ) : null}

                      {/* Status-specific actions */}
                      {task.status_design === 'STRAT_PENDING' && (
                        <>
                          {!task.strat_pic_id && ['ADMIN', 'TEAM_LEAD'].includes(user.role_name) && (
                            <button onClick={() => setShowAssignModal(task.id)} className="btn-ghost text-xs py-1 px-2 text-blue-400 font-medium">Assign Strat</button>
                          )}
                          {task.status_strat === 'PENDING' && task.strat_pic_id && (task.strat_pic_id === user.id || ['ADMIN', 'TEAM_LEAD'].includes(user.role_name)) && (
                            <button onClick={async () => { await updateStratStatus(task.id, 'IN_PROGRESS', user.id); refreshTasks(); }} className="btn-ghost text-xs py-1 px-2 text-cyan-400">Start Strat</button>
                          )}
                          {(task.status_strat === 'IN_PROGRESS' || task.status_strat === 'REVISION') && (task.strat_pic_id === user.id || ['ADMIN', 'TEAM_LEAD'].includes(user.role_name)) && (
                            <button onClick={() => setShowStratSubmitModal(task.id)} className="btn-ghost text-xs py-1 px-2 text-emerald-400">Submit Deck</button>
                          )}
                          {task.status_strat === 'REVIEW' && ['ADMIN', 'TEAM_LEAD', 'REQUESTER'].includes(user.role_name) && (
                            <>
                              <button onClick={async () => { await updateStratStatus(task.id, 'APPROVED', user.id); refreshTasks(); }} className="btn-ghost text-xs py-1 px-2 text-emerald-400">Approve Strat</button>
                              <button onClick={() => setShowRevisionModal({ taskId: task.id, stage: 'STRATEGIC' })} className="btn-ghost text-xs py-1 px-2 text-amber-400">Revise</button>
                            </>
                          )}
                        </>
                      )}

                      {task.status_design === 'DESIGN_UNASSIGNED' && ['ADMIN', 'TEAM_LEAD'].includes(user.role_name) && (
                        <button onClick={() => setShowAssignModal(task.id)} className="btn-ghost text-xs py-1 px-2" style={{ color: 'var(--accent-blue)' }}>{task.design_pic_id ? 'Confirm' : 'Assign'}</button>
                      )}
                      {task.status_design === 'DESIGN_ASSIGNED' && (task.design_pic_id === user.id || ['ADMIN', 'TEAM_LEAD'].includes(user.role_name)) && (
                        <button onClick={async () => { await updateTaskStatus(task.id, 'DESIGN_IN_PROGRESS', user.id); refreshTasks(); }} className="btn-ghost text-xs py-1 px-2" style={{ color: 'var(--accent-cyan)' }}>
                          <Play className="w-3 h-3" /> Start
                        </button>
                      )}
                      {task.status_design === 'DESIGN_IN_PROGRESS' && (task.design_pic_id === user.id || ['ADMIN', 'TEAM_LEAD'].includes(user.role_name)) && (
                        <button onClick={() => setShowSubmitModal(task.id)} className="btn-ghost text-xs py-1 px-2" style={{ color: 'var(--accent-emerald)' }}>
                          <Send className="w-3 h-3" /> Submit
                        </button>
                      )}
                      {task.status_design === 'DESIGN_SUBMITTED' && ['ADMIN', 'TEAM_LEAD', 'REQUESTER'].includes(user.role_name) && (
                        <>
                          <button onClick={async () => { await updateTaskStatus(task.id, 'DESIGN_APPROVED', user.id); refreshTasks(); }} className="btn-ghost text-xs py-1 px-2" style={{ color: 'var(--accent-emerald)' }}>
                            <CheckCircle2 className="w-3 h-3" /> Approve
                          </button>
                          <button onClick={() => setShowRevisionModal({ taskId: task.id, stage: 'DESIGN' })} className="btn-ghost text-xs py-1 px-2" style={{ color: 'var(--accent-amber)' }}>
                            <RotateCcw className="w-3 h-3" /> Revise
                          </button>
                        </>
                      )}
                      {task.status_design === 'DESIGN_REVISION' && (task.design_pic_id === user.id || ['ADMIN', 'TEAM_LEAD'].includes(user.role_name)) && (
                        <button onClick={() => setShowSubmitModal(task.id)} className="btn-ghost text-xs py-1 px-2" style={{ color: 'var(--accent-emerald)' }}>
                          <Send className="w-3 h-3" /> Re-submit
                        </button>
                      )}
                      {task.status_design === 'DESIGN_APPROVED' && !task.motion_task && (
                        <button onClick={async () => { await setMotionReadyness(task.id, true, user.id); refreshTasks(); }} className="btn-ghost text-xs py-1 px-2 text-pink-400">
                          <Film className="w-3 h-3" /> Motion
                        </button>
                      )}
                      
                      {/* Undo Status */}
                      {['ADMIN', 'TEAM_LEAD'].includes(user.role_name) && task.status_design !== 'DESIGN_UNASSIGNED' && task.status_design !== 'TASK_CLOSED' && (
                        <button onClick={async () => { 
                          const prevStatus = task.status_design === 'DESIGN_ASSIGNED' ? 'DESIGN_UNASSIGNED' :
                                             task.status_design === 'DESIGN_IN_PROGRESS' ? 'DESIGN_ASSIGNED' :
                                             task.status_design === 'DESIGN_SUBMITTED' ? 'DESIGN_IN_PROGRESS' :
                                             task.status_design === 'DESIGN_REVISION' ? 'DESIGN_SUBMITTED' :
                                             task.status_design === 'DESIGN_APPROVED' ? 'DESIGN_SUBMITTED' : null;
                          if (prevStatus) {
                            await updateTaskStatus(task.id, prevStatus, user.id);
                            refreshTasks();
                          }
                        }} className="btn-ghost text-xs py-1 px-2" style={{ color: 'var(--text-secondary)' }} title="Undo Status">
                          <Undo2 className="w-3 h-3" /> Undo
                        </button>
                      )}
                    </div>
                  </td>
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
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <input
                  type="text"
                  className="input pl-10 w-full"
                  placeholder="Search Request (Kode, Brand, Campaign, Requester, PIC)..."
                  value={archiveSearch}
                  onChange={(e) => {
                    setArchiveSearch(e.target.value);
                    setArchivePage(1);
                  }}
                />
                {archiveSearch && (
                  <button
                    onClick={() => { setArchiveSearch(''); setArchivePage(1); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
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
          stratUsers={allUsers.filter(u => ['STRATEGIC_PIC', 'TEAM_LEAD', 'ADMIN'].includes(u.role_name))}
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
          stratUsers={allUsers.filter(u => ['STRATEGIC_PIC', 'TEAM_LEAD', 'ADMIN'].includes(u.role_name))}
        />
      )}
      {/* ASSIGN MODAL */}
      {showAssignModal && (
        <AssignModal
          taskId={showAssignModal}
          task={tasks.find(t => t.id === showAssignModal)}
          onClose={() => { setShowAssignModal(null); refreshTasks(); }}
          userId={user.id}
          designers={allUsers.filter(u => ['DESIGNER', 'TEAM_LEAD'].includes(u.role_name) && u.daily_capacity_points > 0)}
          stratUsers={allUsers.filter(u => ['STRATEGIC_PIC', 'TEAM_LEAD', 'ADMIN'].includes(u.role_name))}
        />
      )}
      {/* DETAIL MODAL */}
      {showDetailModal && (
        <TaskDetailModal 
          task={tasks.find(t => t.id === showDetailModal)} 
          initialTab={modalInitialTab}
          onClose={() => { 
            setShowDetailModal(null); 
            setModalInitialTab('details');
            if (taskIdParam) {
              window.history.replaceState(null, '', window.location.pathname);
            }
            refreshTasks(); 
          }} 
          user={user} 
          onRefresh={refreshTasks} 
          onAssign={() => { const id = showDetailModal; setShowDetailModal(null); setShowAssignModal(id); }}
          onSubmit={() => { const id = showDetailModal; setShowDetailModal(null); setShowSubmitModal(id); }}
          onSubmitStrat={() => { const id = showDetailModal; setShowDetailModal(null); setShowStratSubmitModal(id); }}
          onRevise={(stage = 'DESIGN') => { const id = showDetailModal; setShowDetailModal(null); setShowRevisionModal({ taskId: id, stage }); }}
          onEdit={() => { const id = showDetailModal; setShowDetailModal(null); setShowEditModal(id); }}
        />
      )}
      {/* REVISION MODAL */}
      {showRevisionModal && (
        <RevisionModal 
          taskId={showRevisionModal.taskId} 
          stage={showRevisionModal.stage}
          onClose={() => { setShowRevisionModal(null); refreshTasks(); }} 
          userId={user.id} 
        />
      )}
      {/* SUBMIT MODAL */}
      {showSubmitModal && <SubmitModal taskId={showSubmitModal} onClose={() => { setShowSubmitModal(null); refreshTasks(); }} userId={user.id} />}
      {/* STRATEGIC SUBMIT MODAL */}
      {showStratSubmitModal && <SubmitStratModal taskId={showStratSubmitModal} onClose={() => { setShowStratSubmitModal(null); refreshTasks(); }} userId={user.id} />}
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

  const selectedUsers = stratUsers.filter(u => selectedIds.includes(u.id));

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
          {stratUsers.map(u => {
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
                      {u.role_name === 'TEAM_LEAD' ? 'Team Lead' : u.role_name === 'STRATEGIC_PIC' ? 'Strategic PIC' : u.role_name}
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
  onClose, userId, userRole, editTaskId, taskToEdit, clients, contentTypes, stratUsers
}: { 
  onClose: () => void; userId: string; userRole?: string; editTaskId?: string; taskToEdit?: TaskWithRelations | null;
  clients: Client[]; contentTypes: ContentType[]; stratUsers: UserType[];
}) {
  const activeClients = clients.filter(c => c.is_active);

  const initialStratPicIds = taskToEdit?.strat_pic_ids?.length 
    ? taskToEdit.strat_pic_ids 
    : (taskToEdit?.strat_pic_id ? [taskToEdit.strat_pic_id] : []);

  const [form, setForm] = useState<CreateTaskInput>({
    client_id: taskToEdit?.client_id || activeClients[0]?.id || 1, 
    campaign_name: taskToEdit?.campaign_name || '', 
    content_type_id: taskToEdit?.content_type_id || contentTypes[0]?.id || 1,
    task_source: taskToEdit?.task_source || 'ORCA',
    platform: taskToEdit?.platform || 'TIKTOK', 
    req_qty: taskToEdit?.req_qty || 1, 
    req_date: taskToEdit?.req_date ? taskToEdit.req_date.substring(0, 10) : new Date().toISOString().split('T')[0],
    due_date: taskToEdit?.due_date ? taskToEdit.due_date.substring(0, 10) : '', 
    requires_strategic_concept: taskToEdit ? (taskToEdit.status_strat !== 'NOT_REQUIRED') : false, 
    strat_pic_id: taskToEdit?.strat_pic_id || '',
    strat_pic_ids: initialStratPicIds,
    notes: taskToEdit?.notes || '',
  });
  const [selectedStratPicIds, setSelectedStratPicIds] = useState<string[]>(initialStratPicIds);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const sanitizedForm: CreateTaskInput = {
        ...form,
        strat_pic_ids: form.requires_strategic_concept ? selectedStratPicIds : [],
        strat_pic_id: (form.requires_strategic_concept && selectedStratPicIds.length > 0)
          ? selectedStratPicIds[0]
          : undefined,
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
      alert(`Gagal menyimpan task: ${errMsg}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">{editTaskId ? 'Edit Task Request' : 'Create New Task'}</h2>
          <button onClick={onClose} className="btn-ghost p-1"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="label">Client / Brand *</label>
              <select className="select" value={form.client_id} onChange={e => setForm({ ...form, client_id: Number(e.target.value) })}>
                {activeClients.map(c => <option key={c.id} value={c.id}>{c.name} ({c.client_type})</option>)}
              </select>
            </div>
            <div>
              <label className="label">Content Type *</label>
              <select className="select" value={form.content_type_id} onChange={e => setForm({ ...form, content_type_id: Number(e.target.value) })}>
                {contentTypes.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Campaign Name *</label>
            <input className="input" placeholder="e.g. Ramadhan Big Sale 2026" required
              value={form.campaign_name} onChange={e => setForm({ ...form, campaign_name: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="label">Task Source *</label>
              <select className="select" value={form.task_source} onChange={e => setForm({ ...form, task_source: e.target.value as TaskSource })}>
                <option value="ORCA">Orca</option>
                <option value="ECOMMERCE">E-Commerce</option>
              </select>
            </div>
            <div>
              <label className="label">Request Qty *</label>
              <input className="input" type="number" min={1} required
                value={form.req_qty} onChange={e => setForm({ ...form, req_qty: Number(e.target.value) })} />
            </div>
          </div>

          {/* STRATEGIC CONCEPT SECTION */}
          <div className="p-4 rounded-xl space-y-3.5" style={{ background: 'rgba(59, 130, 246, 0.04)', border: '1px solid rgba(59, 130, 246, 0.18)' }}>
            <div className="flex items-center justify-between">
              <div>
                <label className="label mb-0" style={{ fontWeight: '600', color: 'var(--text-primary)' }}>Requires Strategic Concept?</label>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">Aktifkan jika brief memerlukan deck konsep/strategi sebelum didesain</p>
              </div>
              <div className="flex items-center gap-3">
                <div className={`toggle ${form.requires_strategic_concept ? 'active' : ''}`}
                  onClick={() => {
                    const nextVal = !form.requires_strategic_concept;
                    setForm({ 
                      ...form, 
                      requires_strategic_concept: nextVal,
                      strat_pic_id: !nextVal ? '' : form.strat_pic_id
                    });
                    if (!nextVal) setSelectedStratPicIds([]);
                  }} 
                />
                <span className="text-sm font-semibold" style={{ color: form.requires_strategic_concept ? 'var(--accent-blue)' : 'var(--text-secondary)', minWidth: '28px' }}>
                  {form.requires_strategic_concept ? 'Yes' : 'No'}
                </span>
              </div>
            </div>

            {form.requires_strategic_concept && (
              <div className="pt-3 border-t border-[rgba(59,130,246,0.15)]">
                <StratPicMultiSelect
                  selectedIds={selectedStratPicIds}
                  onChange={setSelectedStratPicIds}
                  stratUsers={stratUsers}
                />
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="label">Request Date *</label>
              <input className="input" type="date" required
                value={form.req_date} onChange={e => setForm({ ...form, req_date: e.target.value })} />
            </div>
            <div>
              <label className="label">Due Date *</label>
              <input className="input" type="date" required
                value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={3} placeholder="Additional notes..."
              value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-secondary)]">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {editTaskId ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}

// ===================== ASSIGN MODAL =====================
function AssignModal({ 
  taskId, onClose, userId, designers, stratUsers = [], task
}: { 
  taskId: string; onClose: () => void; userId: string; designers: UserType[]; stratUsers?: UserType[]; task?: TaskWithRelations | null;
}) {
  const [picId, setPicId] = useState(task?.design_pic_id || (task?.design_pic_id ? '' : (designers[0]?.id || '')));

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
      const finalDesignPicId = task?.design_pic_id || picId;

      const payload: AssignTaskInput = {
        design_pic_id: finalDesignPicId || undefined,
        design_difficulty: difficulty,
        strat_pic_ids: hasStrategic ? stratPicIds : undefined,
        strat_pic_id: (hasStrategic && stratPicIds.length > 0) ? stratPicIds[0] : undefined
      };
      await assignTask(taskId, payload, userId, 'TEAM_LEAD');
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
    if (hasStrategic) return 'Assign Strategic PIC / Team Lead';
    if (!alreadyHasDesignPic) return 'Assign Design PIC';
    return 'Confirm Assignment & Difficulty';
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            {getModalTitle()}
          </h2>
          <button onClick={onClose} className="btn-ghost p-1"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Strategic PIC Section (Multi-Select) */}
          {hasStrategic && (
            <div className="p-4 rounded-xl space-y-3" style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.18)' }}>
              <StratPicMultiSelect
                selectedIds={stratPicIds}
                onChange={setStratPicIds}
                stratUsers={stratUsers}
              />
            </div>
          )}

          {/* Design PIC Section */}
          {alreadyHasDesignPic ? (
            <div className="p-3.5 rounded-xl flex items-center justify-between" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-secondary)' }}>
              <div>
                <span className="text-[11px] font-semibold text-[var(--text-muted)] block uppercase">Design PIC</span>
                <span className="text-sm font-semibold text-[var(--text-primary)]">{task?.design_pic_name || 'Sudah Ditugaskan'}</span>
              </div>
              <span className="badge text-[10px] bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Assigned</span>
            </div>
          ) : (
            <div>
              <label className="label">Design PIC *</label>
              <select className="select" value={picId} onChange={e => setPicId(e.target.value)} required>
                <option value="">(Pilih Desainer)</option>
                {designers.map(d => <option key={d.id} value={d.id}>{d.full_name} ({d.daily_capacity_points} pts/day)</option>)}
              </select>
            </div>
          )}

          {/* Design Difficulty */}
          <div>
            <label className="label">Design Difficulty *</label>
            <select className="select" value={difficulty} onChange={e => setDifficulty(e.target.value as 'LOW' | 'MEDIUM' | 'HIGH')}>
              <option value="LOW">Low (2.5 pts)</option>
              <option value="MEDIUM">Medium (3.5 pts)</option>
              <option value="HIGH">High (4.5 pts)</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <User className="w-4 h-4" />} Simpan Assignment
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}

// ===================== SUBMIT STRATEGIC CONCEPT MODAL =====================
function SubmitStratModal({ taskId, onClose, userId }: { taskId: string; onClose: () => void; userId: string }) {
  const [conceptName, setConceptName] = useState('');
  const [conceptLink, setConceptLink] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await submitStrategicConcept(taskId, { strat_concept_name: conceptName, strat_concept_link: conceptLink }, userId);
      onClose();
    } catch (err: any) {
      console.error('Error submitting strategic concept:', err);
      alert(err.message || 'Error submitting concept');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Submit Strategic Concept Deck</h2>
          <button onClick={onClose} className="btn-ghost p-1"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="label">Deck / Concept Name *</label>
            <input className="input" required placeholder="e.g. Sosro Big Idea & Key Visual Concept V1" value={conceptName} onChange={e => setConceptName(e.target.value)} />
          </div>
          <div>
            <label className="label">Google Slides / Doc Link *</label>
            <input className="input" required placeholder="https://docs.google.com/presentation/d/..." value={conceptLink} onChange={e => setConceptLink(e.target.value)} />
          </div>
          <p className="text-xs p-3 rounded-lg" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', color: 'var(--accent-blue)' }}>
            Strategic deck akan diteruskan ke Review Requester / Team Lead sebelum task design dapat di-assign.
          </p>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Presentation className="w-4 h-4" />} Submit Deck
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}

// ===================== SUBMIT MODAL =====================
function SubmitModal({ taskId, onClose, userId }: { taskId: string; onClose: () => void; userId: string }) {
  const [outputQty, setOutputQty] = useState(1);
  const [assetName, setAssetName] = useState('');
  const [assetLink, setAssetLink] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await submitTask(taskId, { output_qty: outputQty, final_asset_name: assetName, final_asset_link: assetLink }, userId);
      onClose();
    } catch (err: any) {
      console.error('Error submitting task:', err);
      const errMsg = err?.message || err?.details || err?.error_description || (typeof err === 'object' ? JSON.stringify(err) : String(err));
      alert(`Gagal submit design: ${errMsg}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Submit Design</h2>
          <button onClick={onClose} className="btn-ghost p-1"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="label">Output Quantity *</label>
            <input className="input" type="number" min={1} required value={outputQty} onChange={e => setOutputQty(Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Final Asset Name *</label>
            <input className="input" required placeholder="e.g. Delfi_Ramadhan_Banner_V1" value={assetName} onChange={e => setAssetName(e.target.value)} />
          </div>
          <div>
            <label className="label">Google Drive Link *</label>
            <input className="input" required placeholder="https://drive.google.com/..." value={assetLink} onChange={e => setAssetLink(e.target.value)} />
          </div>
          <p className="text-xs p-3 rounded-lg" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: 'var(--accent-emerald)' }}>
            SLA akan dihitung otomatis saat submit (hari kerja exclude weekend & libur nasional)
          </p>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Submit
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}

// ===================== REVISION MODAL =====================
function RevisionModal({ 
  taskId, stage = 'DESIGN', onClose, userId 
}: { 
  taskId: string; stage?: 'STRATEGIC' | 'DESIGN'; onClose: () => void; userId: string; 
}) {
  const [reason, setReason] = useState<ReasonCategory>('CLIENT_CHANGE');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await requestRevision(taskId, { stage, reason_category: reason, notes }, userId);
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
        <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Request Revision ({stage})</h2>
          <button onClick={onClose} className="btn-ghost p-1"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="label">Reason Category *</label>
            <select className="select" value={reason} onChange={e => setReason(e.target.value as ReasonCategory)}>
              {Object.entries(REASON_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Revision Notes *</label>
            <textarea className="input" rows={3} required placeholder="Describe what needs to be changed..."
              value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-danger" disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />} Request Revision
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}

// ===================== TASK DETAIL MODAL (WITH CHAT & DISCUSSION) =====================
function TaskDetailModal({ 
  task, onClose, user, onRefresh, onAssign, onSubmit, onRevise, onEdit, onSubmitStrat, initialTab = 'details'
}: { 
  task?: TaskWithRelations | null; onClose: () => void; user: UserType; onRefresh: () => void;
  onAssign?: () => void; onSubmit?: () => void; onRevise?: (stage?: 'STRATEGIC' | 'DESIGN') => void; onEdit?: () => void;
  onSubmitStrat?: () => void; initialTab?: 'details' | 'chat' | 'audit';
}) {
  const [activeTab, setActiveTab] = useState<'details' | 'chat' | 'audit'>(initialTab);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [commentCount, setCommentCount] = useState<number>(task?.comments?.length || 0);
  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    if (!task) return;
    getAuditLogs().then(logs => {
      setAuditLogs(logs.filter(l => l.entity_id === task.id || l.entity_id === task.task_code));
    }).catch(console.error);
  }, [task?.id, task?.task_code]);

  if (!task) return null;

  const canEdit = ['ADMIN', 'TEAM_LEAD'].includes(user.role_name) || (user.role_name === 'REQUESTER' && task.created_by === user.id);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="modal-overlay" onClick={onClose} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', zIndex: 999 }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '840px', background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-primary)', boxShadow: 'var(--shadow-dropdown)', display: 'flex', flexDirection: 'column', maxHeight: '92vh', overflow: 'hidden' }}>
        
        {/* Header */}
        <div style={{ padding: '20px 24px 16px 24px', borderBottom: '1px solid var(--border-primary)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', background: 'var(--bg-secondary)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div className="flex items-center gap-2.5">
              <span style={{ fontFamily: 'monospace', fontSize: '13px', color: 'var(--accent-blue)', fontWeight: '700', padding: '2px 8px', background: 'rgba(59,130,246,0.1)', borderRadius: '6px' }}>
                {task.task_code}
              </span>
              <span className="text-xs text-[var(--text-muted)] font-medium">|</span>
              <span className="text-xs text-[var(--text-secondary)] font-medium">{task.client_name}</span>
            </div>
            <h2 style={{ fontSize: '19px', fontWeight: '700', color: 'var(--text-primary)', margin: 0, lineHeight: 1.3 }}>{task.campaign_name}</h2>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
              <span className={`badge ${DESIGN_STATUS_COLORS[task.status_design]}`}>{DESIGN_STATUS_LABELS[task.status_design]}</span>
              {task.status_strat !== 'NOT_REQUIRED' && (
                <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', borderColor: 'rgba(59, 130, 246, 0.2)' }}>
                  Strat: {STRAT_STATUS_LABELS[task.status_strat]}
                </span>
              )}
              {task.operational_excellence && <span className={`badge ${EXCELLENCE_COLORS[task.operational_excellence]}`}>{EXCELLENCE_LABELS[task.operational_excellence]}</span>}
              {task.design_difficulty && <span className={`badge ${DIFFICULTY_COLORS[task.design_difficulty]}`}>{DIFFICULTY_LABELS[task.design_difficulty]}</span>}
              {task.motion_readiness === 'READY_TO_ANIMATE' && <span className="badge" style={{ background: 'rgba(236, 72, 153, 0.1)', color: '#ec4899', borderColor: 'rgba(236, 72, 153, 0.2)' }}>Motion Ready</span>}
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost" style={{ padding: '8px', borderRadius: '8px', background: 'var(--bg-tertiary)', border: 'none', cursor: 'pointer' }}>
            <X style={{ width: '20px', height: '20px', color: 'var(--text-secondary)' }} />
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex items-center gap-2 px-6 py-2 border-b border-[var(--border-primary)] bg-[var(--bg-primary)]">
          <button
            type="button"
            onClick={() => setActiveTab('details')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'details'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Detail Request
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'chat'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Kolom Chat &amp; Diskusi
            {commentCount > 0 && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                activeTab === 'chat' ? 'bg-white/25 text-white' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
              }`}>
                {commentCount}
              </span>
            )}
            {unreadChatCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" title={`${unreadChatCount} pesan belum dibaca`} />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'audit'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Audit Trail
            {auditLogs.length > 0 && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                activeTab === 'audit' ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}>
                {auditLogs.length}
              </span>
            )}
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }} className="custom-scrollbar">
          
          {/* ================= TAB 1: DETAIL REQUEST ================= */}
          {activeTab === 'details' && (
            <div className="space-y-6">
              {/* Info Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Brand / Client</span>
                  <p style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '14px', margin: 0 }}>
                    {task.client_name} <span style={{ fontSize: '10px', padding: '2px 6px', background: 'var(--bg-tertiary)', borderRadius: '4px', marginLeft: '4px', color: 'var(--text-secondary)' }}>{task.client_type}</span>
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Requester</span>
                  <p style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '14px', margin: 0 }}>{task.created_by_name || 'Requester'}</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Content Type</span>
                  <p style={{ color: 'var(--text-primary)', fontSize: '14px', margin: 0, fontWeight: '500' }}>{task.content_type_name}</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Source &amp; Qty</span>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>{SOURCE_LABELS[task.task_source]} • Req: {task.req_qty} | Out: {task.output_qty}</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Request Date</span>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>{formatDisplayDate(task.req_date)}</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Due Date</span>
                  <p style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '14px', margin: 0 }}>{formatDisplayDate(task.due_date)}</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>SLA Working Days</span>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>{task.sla_working_days ?? '—'} hari kerja</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Design PIC</span>
                  <p style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600', margin: 0 }}>{task.design_pic_name || 'Belum di-assign'}</p>
                </div>
                {task.requires_strategic_concept && task.status_strat !== 'NOT_REQUIRED' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Strategic PIC</span>
                    <p style={{ color: 'var(--accent-blue)', fontSize: '14px', fontWeight: '600', margin: 0 }}>
                      {task.strat_pic_names && task.strat_pic_names.length > 0 ? task.strat_pic_names.join(', ') : (task.strat_pic_name || '—')}
                    </p>
                  </div>
                ) : null}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Revisions</span>
                  <p style={{ color: task.design_revision_count > 0 ? 'var(--accent-amber)' : 'var(--text-secondary)', fontSize: '14px', fontWeight: '500', margin: 0 }}>
                    Design: {task.design_revision_count} | Strat: {task.strat_revision_count}
                  </p>
                </div>
              </div>

              {/* Brief & Notes */}
              {task.notes && (
                <div className="p-4 rounded-xl space-y-1.5" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Brief / Notes</span>
                  <p style={{ fontSize: '13px', color: 'var(--text-primary)', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{task.notes}</p>
                </div>
              )}

              {/* Strategic Concept Link Section */}
              {task.status_strat !== 'NOT_REQUIRED' && (
                <div style={{ padding: '18px', background: 'rgba(59,130,246,0.05)', borderRadius: '12px', border: '1px solid rgba(59,130,246,0.2)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: '11px', color: 'var(--accent-blue)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Strategic Concept Deck</span>
                    <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', borderColor: 'rgba(59, 130, 246, 0.2)' }}>{STRAT_STATUS_LABELS[task.status_strat]}</span>
                  </div>
                  {task.strat_concept_link ? (
                    <>
                      <p style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: '600', margin: 0 }}>{task.strat_concept_name || 'Strategic Concept Deck'}</p>
                      <a href={sanitizeUrl(task.strat_concept_link)} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: '13px', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none', fontWeight: '500' }}>
                        <ExternalLink style={{ width: '14px', height: '14px' }} /> {task.strat_concept_link}
                      </a>
                      {task.strat_submitted_at && (
                        <span className="text-xs text-slate-400 mt-1">Submitted at: {formatDisplayDateTime(task.strat_submitted_at)}</span>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-slate-400">Concept deck belum di-submit oleh Strategic PIC.</p>
                  )}
                </div>
              )}

              {/* Final Asset */}
              {task.final_asset_link && (
                <div style={{ padding: '18px', background: 'var(--bg-tertiary)', borderRadius: '12px', border: '1px solid var(--border-primary)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Final Asset Result</span>
                  <p style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: '600', margin: 0 }}>{task.final_asset_name}</p>
                  <a href={sanitizeUrl(task.final_asset_link)} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: '13px', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none', fontWeight: '500' }}>
                    <ExternalLink style={{ width: '14px', height: '14px' }} /> {task.final_asset_link}
                  </a>
                </div>
              )}

              {/* Motion Task / Handover Section */}
              {task.motion_task ? (
                <div style={{ padding: '16px', background: 'rgba(236,72,153,0.05)', borderRadius: '12px', border: '1px solid rgba(236,72,153,0.2)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--accent-pink)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Motion Subtask</span>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span className={`badge ${MOTION_STATUS_COLORS[task.motion_task.status_motion]}`}>{MOTION_STATUS_LABELS[task.motion_task.status_motion]}</span>
                      {task.motion_pic_name && <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>PIC: {task.motion_pic_name}</span>}
                    </div>
                    <Link href="/dashboard/motion" onClick={onClose} className="text-xs text-pink-500 hover:underline flex items-center gap-1 font-medium">
                      Lihat Pipeline <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              ) : task.status_design === 'DESIGN_APPROVED' ? (
                <div style={{ padding: '16px', background: 'rgba(236,72,153,0.05)', borderRadius: '12px', border: '1px dashed rgba(236,72,153,0.3)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--accent-pink)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>Motion Handover</span>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>Desain telah disetujui. Tiket ini dapat diteruskan ke tim Motion Designer.</p>
                  </div>
                  <button
                    onClick={async () => {
                      await setMotionReadyness(task.id, true, user.id);
                      onRefresh();
                      onClose();
                    }}
                    className="btn-primary"
                    style={{ background: 'var(--accent-pink)', padding: '8px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Film className="w-3.5 h-3.5" /> Lanjutkan ke Motion
                  </button>
                </div>
              ) : null}

              {/* Revision History */}
              {task.revisions && task.revisions.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <RotateCcw style={{ width: '15px', height: '15px', color: 'var(--accent-amber)' }} />
                    Revision History ({task.revisions.length})
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {task.revisions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(rev => (
                      <div key={rev.id} style={{ padding: '14px', background: 'var(--bg-tertiary)', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '13px' }}>{rev.stage} Rev #{rev.revision_number}</span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{formatDisplayDate(rev.created_at)}</span>
                        </div>
                        <div>
                          <span className="badge" style={{ fontSize: '10px', padding: '2px 8px', background: 'rgba(217, 119, 6, 0.1)', color: 'var(--accent-amber)', borderColor: 'rgba(217, 119, 6, 0.2)' }}>{REASON_LABELS[rev.reason_category]}</span>
                        </div>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.5' }}>{rev.notes || (rev as any).revision_notes}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================= TAB 2: KOLOM CHAT & DISKUSI ================= */}
          {activeTab === 'chat' && (
            <TaskChatSection
              task={task}
              user={user}
              isActiveTab={activeTab === 'chat'}
              onCommentsUpdated={(count, unread) => {
                setCommentCount(count);
                setUnreadChatCount(unread);
              }}
            />
          )}

          {/* ================= TAB 3: AUDIT TRAIL ================= */}
          {activeTab === 'audit' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Riwayat Aktivitas &amp; Log Perubahan</span>
                <span className="text-xs text-[var(--text-muted)]">{auditLogs.length} event tercatat</span>
              </div>
              {auditLogs.length > 0 ? (
                <div className="space-y-3">
                  {auditLogs.map(log => (
                    <div key={log.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '10px', border: '1px solid var(--border-secondary)' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-blue)', marginTop: '5px', flexShrink: 0 }} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                        <p style={{ fontSize: '13px', color: 'var(--text-primary)', margin: 0 }}>
                          <span style={{ fontWeight: '600' }}>{log.performer_name || 'System'}</span> — {log.action.replace(/_/g, ' ')}
                        </p>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>
                          {formatDisplayDateTime(log.timestamp)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-[var(--text-muted)] border border-dashed border-[var(--border-primary)] rounded-xl">
                  Belum ada catatan audit trail pada request ini.
                </div>
              )}
            </div>
          )}

        </div>

        {/* Action Buttons Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-primary)', display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-secondary)', borderBottomLeftRadius: '16px', borderBottomRightRadius: '16px' }}>
          
          {/* LEFT SIDE: Management Actions */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
            {canEdit && (
              <button 
                onClick={onEdit} 
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', fontWeight: '600', fontSize: '13px', color: 'var(--text-primary)', background: 'var(--bg-tertiary)', border: '1px solid var(--border-secondary)', cursor: 'pointer' }}
              >
                <Edit3 style={{ width: '14px', height: '14px' }} /> Edit Request
              </button>
            )}
            {['ADMIN', 'TEAM_LEAD'].includes(user.role_name) && (
              <button 
                onClick={async () => { 
                  if (confirm('Are you sure you want to delete this task? This action cannot be undone.')) {
                    await deleteTask(task.id, user.id);
                    onRefresh();
                    onClose();
                  }
                }} 
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', fontWeight: '600', fontSize: '13px', color: 'var(--accent-red)', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', cursor: 'pointer' }}
              >
                <Trash2 style={{ width: '14px', height: '14px' }} /> Delete
              </button>
            )}
            {/* ROLLBACK BUTTON */}
            {['ADMIN', 'TEAM_LEAD'].includes(user.role_name) && task.status_design !== 'DESIGN_UNASSIGNED' && task.status_design !== 'TASK_CLOSED' && (
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
                className="btn-secondary" 
                style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-primary)', opacity: 0.9, display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '13px', borderRadius: '8px', fontWeight: '600', background: 'var(--bg-primary)' }}
              >
                <Undo2 style={{ width: '14px', height: '14px' }} /> Undo Status
              </button>
            )}
          </div>

          {/* RIGHT SIDE: Primary Flow Actions */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'flex-end', alignItems: 'center' }}>
            {/* Strategic Workflow Actions */}
            {task.status_design === 'STRAT_PENDING' && (
              <>
                {task.status_strat === 'PENDING' && task.strat_pic_id && (task.strat_pic_id === user.id || ['ADMIN', 'TEAM_LEAD'].includes(user.role_name)) && (
                  <button onClick={async () => { await updateStratStatus(task.id, 'IN_PROGRESS', user.id); onRefresh(); onClose(); }} className="btn-primary" style={{ background: 'var(--accent-cyan)', padding: '8px 16px', fontSize: '13px' }}>
                    <Play className="w-3.5 h-3.5" /> Start Strat
                  </button>
                )}
                {(task.status_strat === 'IN_PROGRESS' || task.status_strat === 'REVISION') && (task.strat_pic_id === user.id || ['ADMIN', 'TEAM_LEAD'].includes(user.role_name)) && (
                  <button onClick={onSubmitStrat} className="btn-primary" style={{ background: 'var(--accent-blue)', padding: '8px 16px', fontSize: '13px' }}>
                    <Presentation className="w-3.5 h-3.5" /> Submit Deck
                  </button>
                )}
                {task.status_strat === 'REVIEW' && ['ADMIN', 'TEAM_LEAD', 'REQUESTER'].includes(user.role_name) && (
                  <>
                    <button onClick={() => onRevise?.('STRATEGIC')} className="btn-secondary" style={{ color: 'var(--accent-amber)', borderColor: 'var(--accent-amber)', padding: '8px 14px', fontSize: '13px' }}>
                      <RotateCcw className="w-3.5 h-3.5" /> Revise Strat
                    </button>
                    <button onClick={async () => { await updateStratStatus(task.id, 'APPROVED', user.id); onRefresh(); onClose(); }} className="btn-primary" style={{ background: 'var(--accent-emerald)', padding: '8px 16px', fontSize: '13px' }}>
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve Strat
                    </button>
                  </>
                )}
              </>
            )}

            {/* Design Workflow Actions */}
            {task.status_design === 'DESIGN_UNASSIGNED' && ['ADMIN', 'TEAM_LEAD'].includes(user.role_name) && (
              <button onClick={onAssign} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', fontWeight: '600', fontSize: '13px' }}>
                <User style={{ width: '14px', height: '14px' }} /> Assign PIC
              </button>
            )}
            
            {task.status_design === 'DESIGN_ASSIGNED' && (task.design_pic_id === user.id || ['ADMIN', 'TEAM_LEAD'].includes(user.role_name)) && (
              <button onClick={async () => { await updateTaskStatus(task.id, 'DESIGN_IN_PROGRESS', user.id); onRefresh(); onClose(); }} className="btn-primary" style={{ background: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', fontWeight: '600', fontSize: '13px' }}>
                <Play style={{ width: '14px', height: '14px' }} /> Start Work
              </button>
            )}

            {(task.status_design === 'DESIGN_IN_PROGRESS' || task.status_design === 'DESIGN_REVISION') && (task.design_pic_id === user.id || ['ADMIN', 'TEAM_LEAD'].includes(user.role_name)) && (
              <button onClick={onSubmit} className="btn-primary" style={{ background: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', fontWeight: '600', fontSize: '13px' }}>
                <Send style={{ width: '14px', height: '14px' }} /> Submit Output
              </button>
            )}

            {task.status_design === 'DESIGN_SUBMITTED' && ['ADMIN', 'TEAM_LEAD', 'REQUESTER'].includes(user.role_name) && (
              <>
                <button onClick={() => onRevise?.('DESIGN')} className="btn-secondary" style={{ color: 'var(--accent-amber)', borderColor: 'var(--accent-amber)', display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', fontWeight: '600', fontSize: '13px', background: 'rgba(245, 158, 11, 0.05)' }}>
                  <RotateCcw style={{ width: '14px', height: '14px' }} /> Request Revision
                </button>
                
                <button onClick={async () => { await updateTaskStatus(task.id, 'DESIGN_APPROVED', user.id); onRefresh(); onClose(); }} className="btn-primary" style={{ background: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', fontWeight: '600', fontSize: '13px' }}>
                  <CheckCircle2 style={{ width: '14px', height: '14px' }} /> Approve Design
                </button>
              </>
            )}

            {task.status_design === 'DESIGN_APPROVED' && (
              <>
                {task.motion_task ? (
                  <Link
                    href="/dashboard/motion"
                    onClick={onClose}
                    className="btn-primary"
                    style={{ background: 'var(--accent-pink)', display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', fontWeight: '600', fontSize: '13px', textDecoration: 'none' }}
                  >
                    <Film style={{ width: '14px', height: '14px' }} /> Buka di Motion Pipeline ({task.motion_task.status_motion})
                  </Link>
                ) : (
                  <button
                    onClick={async () => {
                      await setMotionReadyness(task.id, true, user.id);
                      onRefresh();
                      onClose();
                    }}
                    className="btn-primary"
                    style={{ background: 'var(--accent-pink)', display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', fontWeight: '600', fontSize: '13px' }}
                  >
                    <Film style={{ width: '14px', height: '14px' }} /> Lanjutkan ke Motion
                  </button>
                )}

                {['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'DESIGNER'].includes(user.role_name) && (
                  <button
                    onClick={async () => {
                      await updateTaskStatus(task.id, 'TASK_CLOSED', user.id);
                      onRefresh();
                      onClose();
                    }}
                    className="btn-secondary"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', fontWeight: '600', fontSize: '13px', color: 'var(--accent-emerald)', borderColor: 'var(--accent-emerald)' }}
                  >
                    <CheckCircle2 style={{ width: '14px', height: '14px' }} /> Close Task
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
