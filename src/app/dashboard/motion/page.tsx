'use client';

import { useEffect, useState, useRef, useCallback, useMemo, Suspense } from 'react';
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
  deleteComment
} from '@/lib/supabase-store';
import { TaskChatSection } from '@/components/task-chat-section';
import { MotionKanbanCard } from '@/components/motion-kanban-card';
import { supabase } from '@/lib/supabase';
import { 
  MOTION_KANBAN_COLUMNS, 
  MOTION_STATUS_COLORS, 
  MOTION_STATUS_LABELS, 
  MOTION_DIFFICULTY_LABELS, 
  REASON_LABELS
} from '@/lib/constants';
import { 
  formatDisplayDate, 
  formatDisplayDateTime, 
  sanitizeUrl,
  getWeekOfMonth,
  getISOWeekNumber,
  getWeekRangeLabel
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
  ReasonCategory 
} from '@/lib/types';
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
  FolderCheck
} from 'lucide-react';

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

  // View Mode: 'kanban' | 'table'
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');

  // Modal States
  const [showAssign, setShowAssign] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState<EnrichedMotionTask | null>(null);
  const [detailInitialTab, setDetailInitialTab] = useState<'details' | 'chat'>('details');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<string | null>(null);
  const [showSubmitModal, setShowSubmitModal] = useState<string | null>(null);
  const [showRevisionModal, setShowRevisionModal] = useState<string | null>(null);
  const [showHandoverModal, setShowHandoverModal] = useState<string | null>(null);

  // Auto open modal from searchParams (e.g. from notification click)
  useEffect(() => {
    if (taskIdParam && motionTasks.length > 0) {
      const matched = motionTasks.find(t => 
        t.id === taskIdParam || 
        t.task_id === taskIdParam || 
        t.parentTask?.id === taskIdParam || 
        t.parentTask?.task_code === taskIdParam
      );
      if (matched) {
        setShowDetail(matched);
        setDetailInitialTab(tabParam === 'chat' ? 'chat' : 'details');
      }
    }
  }, [taskIdParam, tabParam, motionTasks]);

  // Drag & Drop State
  const [draggedMotionId, setDraggedMotionId] = useState<string | null>(null);
  const [dragOverMotionCol, setDragOverMotionCol] = useState<string | null>(null);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPic, setFilterPic] = useState<string>('all');
  const [filterClient, setFilterClient] = useState<string>('all');
  const [filterMonths, setFilterMonths] = useState<string[]>([]);
  const [filterYears, setFilterYears] = useState<string[]>([]);
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  const [showYearDropdown, setShowYearDropdown] = useState(false);
  const [filterExactDate, setFilterExactDate] = useState<string>('');

  // Section Navigation: 'active' | 'archive'
  const [mainTab, setMainTab] = useState<'active' | 'archive'>('active');

  // Approved Archive Filters, Period Navigation & View Mode
  const [archiveViewMode, setArchiveViewMode] = useState<'kanban' | 'table'>('kanban');
  const [archiveYear, setArchiveYear] = useState<string>(String(new Date().getFullYear()));
  const [archiveMonth, setArchiveMonth] = useState<string>(String(new Date().getMonth() + 1));
  const [archiveWeek, setArchiveWeek] = useState<string>('all');
  const [archiveSearch, setArchiveSearch] = useState<string>('');
  const [archivePic, setArchivePic] = useState<string>('all');
  const [archiveClient, setArchiveClient] = useState<string>('all');
  const [archiveStudio, setArchiveStudio] = useState<string>('all');
  const [archivePlatform, setArchivePlatform] = useState<string>('all');
  const [archiveSort, setArchiveSort] = useState<string>('approved_desc');
  const [archivePage, setArchivePage] = useState<number>(1);
  const [archiveLimit, setArchiveLimit] = useState<number>(15);

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

  const refresh = async () => {
    try {
      const [mts, tasks, users, clients] = await Promise.all([
        getMotionTasks(),
        getAllTasksWithRelations(),
        getUsers(),
        getClients(),
      ]);
      setAllUsers(users);
      setAllClients(clients);
      setAllTasks(tasks);
      const enriched: EnrichedMotionTask[] = mts.map(mt => ({
        ...mt,
        parentTask: tasks.find(t => t.id === mt.task_id),
      }));
      setMotionTasks(enriched);

      // If detail modal is open, refresh detail reference
      if (showDetail) {
        const updatedDetail = enriched.find(t => t.id === showDetail.id);
        if (updatedDetail) setShowDetail(updatedDetail);
      }
    } catch (err) {
      console.error('Failed to load motion data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    refresh(); 
  }, []);

  // Keyboard shortcut to close modals with ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowDetail(null);
        setShowAssign(null);
        setShowCreateModal(false);
        setShowEditModal(null);
        setShowSubmitModal(null);
        setShowRevisionModal(null);
        setShowHandoverModal(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 1. All Accessible Approved Motion Tasks (Archive Base with RBAC)
  const accessibleApprovedMotionTasks = useMemo(() => {
    if (!user) return [];
    let list = motionTasks.filter(mt => mt.status_motion === 'APPROVED' || mt.status_motion === 'COMPLETED');
    
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
    return motionTasks.filter(mt => mt.status_motion !== 'APPROVED' && mt.status_motion !== 'COMPLETED').length;
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

  if (!user) return null;

  const canMoveMotionTask = (mt: EnrichedMotionTask) => {
    if (!user) return false;
    if (['ADMIN', 'TEAM_LEAD'].includes(user.role_name)) return true;
    if (user.role_name === 'MOTION_PIC' && mt.motion_pic_id === user.id) return true;
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

  const handleDragOver = (e: React.DragEvent, targetStatus: MotionStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverMotionCol !== targetStatus) {
      setDragOverMotionCol(targetStatus);
    }
  };

  const handleDragLeave = (e: React.DragEvent, targetStatus: MotionStatus) => {
    if (dragOverMotionCol === targetStatus) {
      setDragOverMotionCol(null);
    }
  };

  const handleStatusChange = async (id: string, status: MotionStatus) => {
    await updateMotionStatus(id, status);
    await refresh();
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: MotionStatus) => {
    e.preventDefault();
    setDragOverMotionCol(null);
    const mId = e.dataTransfer.getData('text/plain') || draggedMotionId;
    setDraggedMotionId(null);

    if (!mId || !user) return;
    const mt = motionTasks.find(t => t.id === mId);
    if (!mt || mt.status_motion === targetStatus) return;

    try {
      if (targetStatus === 'QUEUED') {
        if (!['ADMIN', 'TEAM_LEAD'].includes(user.role_name)) {
          alert('Hanya Admin atau Team Lead yang dapat mengembalikan status ke Queued.');
          return;
        }
        await handleStatusChange(mt.id, 'QUEUED');
      } else if (targetStatus === 'IN_PROGRESS') {
        if (!['ADMIN', 'TEAM_LEAD'].includes(user.role_name) && mt.motion_pic_id !== user.id) {
          alert('Hanya Motion Designer yang ditugaskan atau Lead yang dapat memulai pengerjaan motion.');
          return;
        }
        await handleStatusChange(mt.id, 'IN_PROGRESS');
      } else if (targetStatus === 'SUBMITTED') {
        if (!['ADMIN', 'TEAM_LEAD'].includes(user.role_name) && mt.motion_pic_id !== user.id) {
          alert('Hanya Motion Designer yang ditugaskan atau Lead yang dapat men-submit hasil motion.');
          return;
        }
        setShowSubmitModal(mt.id);
      } else if (targetStatus === 'REVISION') {
        setShowRevisionModal(mt.id);
      } else if (targetStatus === 'APPROVED') {
        if (!['ADMIN', 'TEAM_LEAD', 'STRATEGIC_PIC', 'REQUESTER'].includes(user.role_name)) {
          alert('Hanya Requester, Team Lead, atau Admin yang dapat menyetujui motion.');
          return;
        }
        await handleStatusChange(mt.id, 'APPROVED');
      } else if (targetStatus === 'COMPLETED') {
        if (!['ADMIN', 'TEAM_LEAD'].includes(user.role_name)) {
          alert('Hanya Admin atau Team Lead yang dapat melakukan handover/complete.');
          return;
        }
        setShowHandoverModal(mt.id);
      }
    } catch (err: any) {
      console.error('Error on motion drop transition:', err);
      alert(`Gagal mengubah status: ${err?.message || err}`);
    }
  };

  // Filter active motion tasks
  const filteredMotionTasks = motionTasks.filter(mt => {
    const pt = mt.parentTask;
    const clientName = pt?.client_name || allClients.find(c => c.id === mt.client_id)?.name || 'Unknown Client';
    const motionPicName = mt.motion_pic_id ? motionUsers.find(u => u.id === mt.motion_pic_id)?.full_name || 'Unassigned' : 'Unassigned';

    const matchSearch = searchQuery === '' ||
      (pt?.task_code || mt.id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (pt?.campaign_name || mt.campaign_type || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (mt.motion_type || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (mt.studio || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (mt.platform || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      motionPicName.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchStatus = filterStatus === 'all' || mt.status_motion === filterStatus;
    const matchPic = filterPic === 'all' || motionPicName === filterPic;
    const matchClient = filterClient === 'all' || clientName === filterClient;
    
    let matchDate = true;
    if (filterExactDate) {
      matchDate = (mt.created_at || '').startsWith(filterExactDate) || pt?.req_date === filterExactDate;
    } else {
      const createdMonth = (mt.created_at || '').substring(5, 7);
      const createdYear = (mt.created_at || '').substring(0, 4);
      const reqMonth = pt?.req_date ? pt.req_date.substring(5, 7) : '';
      const reqYear = pt?.req_date ? pt.req_date.substring(0, 4) : '';
      
      const matchMonth = filterMonths.length === 0 || (!!createdMonth && filterMonths.includes(createdMonth)) || (!!reqMonth && filterMonths.includes(reqMonth));
      const matchYear = filterYears.length === 0 || (!!createdYear && filterYears.includes(createdYear)) || (!!reqYear && filterYears.includes(reqYear));
      matchDate = Boolean(matchMonth && matchYear);
    }
    return matchSearch && matchStatus && matchPic && matchClient && matchDate;
  });

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
    setFilterStatus('all');
    setFilterPic('all');
    setFilterClient('all');
    setFilterMonths([]);
    setFilterYears([]);
    setFilterExactDate('');
  };

  return (
    <div className="space-y-5">
      {/* Top Header & Section Switcher Navigation */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-[var(--border-secondary)]">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <span>Motion Graphics Pipeline</span>
          </h1>
        </div>

        {/* Section Switcher Navigation */}
        <div className="flex items-center p-1 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl shadow-sm">
          <button
            onClick={() => setMainTab('active')}
            className={`flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
              mainTab === 'active'
                ? 'bg-pink-600 text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            <span>Active Pipeline</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${mainTab === 'active' ? 'bg-white/20 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'}`}>
              {activeMotionTasksCount}
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
              {approvedMotionTasksCount}
            </span>
          </button>
        </div>
      </div>

      {/* ================= 1. ACTIVE PIPELINE VIEW ================= */}
      {mainTab === 'active' && (
        <div className="space-y-4">
          {/* Toolbar & Filters */}
          <div className="bg-[var(--bg-card)] p-4 rounded-xl border border-[var(--border-primary)] shadow-sm flex flex-col gap-4">
            
            {/* Top Row: Search Bar & View Mode Toggle */}
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <input 
                  className="input pl-10 w-full text-xs" 
                  placeholder="Search code, brand, campaign, PIC, studio, platform..."
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)} 
                />
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {/* View Mode Toggle */}
                <div className="flex items-center p-1 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)]">
                  <button
                    onClick={() => setViewMode('kanban')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      viewMode === 'kanban'
                        ? 'bg-pink-600 text-white shadow-sm'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                    title="Kanban Board View"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" /> Kanban
                  </button>
                  <button
                    onClick={() => setViewMode('table')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      viewMode === 'table'
                        ? 'bg-pink-600 text-white shadow-sm'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                    title="Table List View"
                  >
                    <List className="w-3.5 h-3.5" /> Table
                  </button>
                </div>

                <button
                  onClick={refresh}
                  className="btn-ghost p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-primary)]"
                  title="Refresh Data"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Bottom Row: Unified Filter Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 mt-1 border-t border-[var(--border-secondary)]">
              <div className="flex flex-wrap items-center gap-2.5 flex-1">
                <div className="flex flex-wrap items-center bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-primary)] shadow-sm">
                  
                  {/* Month Dropdown */}
                  <div className="relative">
                    <button 
                      onClick={() => { setShowMonthDropdown(!showMonthDropdown); setShowYearDropdown(false); }}
                      className="px-3 py-2 h-[36px] flex items-center justify-between min-w-[120px] bg-transparent hover:bg-[var(--bg-tertiary)] rounded-l-lg transition-colors text-xs font-medium text-[var(--text-primary)]"
                    >
                      <span>
                        {filterMonths.length === 0 ? 'All Months' : filterMonths.length === 1 ? getMonthName(filterMonths[0]) : `${filterMonths.length} Bulan`}
                      </span>
                      <ChevronDown className="w-3.5 h-3.5 ml-1.5 opacity-50" />
                    </button>
                    {showMonthDropdown && (
                      <div className="absolute top-full left-0 mt-2 w-48 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
                        <div className="p-2 border-b border-[var(--border-primary)] sticky top-0 bg-[var(--bg-secondary)]">
                          <label className="flex items-center gap-2 p-1.5 hover:bg-[var(--bg-tertiary)] rounded cursor-pointer text-xs font-medium">
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
                            <span>Pilih Semua Bulan</span>
                          </label>
                        </div>
                        <div className="p-1">
                          {allMonths.map(m => (
                            <label key={m} className="flex items-center gap-2 p-2 hover:bg-[var(--bg-tertiary)] rounded cursor-pointer text-xs">
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
                              <span>{getMonthName(m)}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="w-px h-4 bg-[var(--border-primary)]" />

                  {/* Year Dropdown */}
                  <div className="relative">
                    <button 
                      onClick={() => { setShowYearDropdown(!showYearDropdown); setShowMonthDropdown(false); }}
                      className="px-3 py-2 h-[36px] flex items-center justify-between min-w-[100px] bg-transparent hover:bg-[var(--bg-tertiary)] transition-colors text-xs font-medium text-[var(--text-primary)]"
                    >
                      <span>
                        {filterYears.length === 0 ? 'All Years' : filterYears.length === 1 ? filterYears[0] : `${filterYears.length} Tahun`}
                      </span>
                      <ChevronDown className="w-3.5 h-3.5 ml-1.5 opacity-50" />
                    </button>
                    {showYearDropdown && (
                      <div className="absolute top-full left-0 mt-2 w-44 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
                        <div className="p-2 border-b border-[var(--border-primary)] sticky top-0 bg-[var(--bg-secondary)]">
                          <label className="flex items-center gap-2 p-1.5 hover:bg-[var(--bg-tertiary)] rounded cursor-pointer text-xs font-medium">
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
                            <span>Pilih Semua</span>
                          </label>
                        </div>
                        <div className="p-1">
                          {availableYears.map(y => (
                            <label key={y} className="flex items-center gap-2 p-2 hover:bg-[var(--bg-tertiary)] rounded cursor-pointer text-xs">
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
                              <span>{y}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="w-px h-4 bg-[var(--border-primary)]" />

                  {/* Exact Date Input */}
                  <div className="flex items-center">
                    <input 
                      type="date" 
                      className="px-3 py-1.5 h-[36px] text-xs bg-transparent border-none focus:outline-none min-w-[130px] hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)]" 
                      value={filterExactDate} 
                      onChange={(e) => setFilterExactDate(e.target.value)} 
                      title="Filter by Exact Date (Overrides Month)"
                    />
                  </div>

                  <div className="w-px h-4 bg-[var(--border-primary)]" />

                  {/* Status Dropdown */}
                  <div className="flex items-center">
                    <select 
                      className="px-3 py-1.5 h-[36px] text-xs bg-transparent border-none focus:outline-none min-w-[130px] hover:bg-[var(--bg-tertiary)] cursor-pointer text-[var(--text-primary)]" 
                      value={filterStatus} 
                      onChange={(e) => setFilterStatus(e.target.value)}
                    >
                      <option value="all" className="bg-[var(--bg-secondary)]">All Status</option>
                      {Object.entries(MOTION_STATUS_LABELS).map(([k, v]) => (
                        <option key={k} value={k} className="bg-[var(--bg-secondary)]">{v}</option>
                      ))}
                    </select>
                  </div>

                  <div className="w-px h-4 bg-[var(--border-primary)]" />

                  {/* Motion PIC Dropdown */}
                  <div className="flex items-center">
                    <select 
                      className="px-3 py-1.5 h-[36px] text-xs bg-transparent border-none focus:outline-none min-w-[130px] hover:bg-[var(--bg-tertiary)] cursor-pointer text-[var(--text-primary)]" 
                      value={filterPic} 
                      onChange={(e) => setFilterPic(e.target.value)}
                    >
                      <option value="all" className="bg-[var(--bg-secondary)]">All Motion PIC</option>
                      {uniquePics.map(pic => (
                        <option key={pic as string} value={pic as string} className="bg-[var(--bg-secondary)]">{pic}</option>
                      ))}
                    </select>
                  </div>

                  <div className="w-px h-4 bg-[var(--border-primary)]" />

                  {/* Client / Brand Dropdown */}
                  <div className="flex items-center">
                    <select 
                      className="px-3 py-1.5 h-[36px] text-xs bg-transparent border-none focus:outline-none min-w-[130px] rounded-r-lg hover:bg-[var(--bg-tertiary)] cursor-pointer text-[var(--text-primary)]" 
                      value={filterClient} 
                      onChange={(e) => setFilterClient(e.target.value)}
                    >
                      <option value="all" className="bg-[var(--bg-secondary)]">All Brands</option>
                      {allClients.map(c => (
                        <option key={c.id} value={c.name} className="bg-[var(--bg-secondary)]">{c.name}</option>
                      ))}
                    </select>
                  </div>

                </div>

                {(searchQuery || filterStatus !== 'all' || filterPic !== 'all' || filterClient !== 'all' || filterMonths.length > 0 || filterYears.length > 0 || filterExactDate) && (
                  <button 
                    onClick={handleResetFilters} 
                    className="btn-ghost text-xs py-1.5 px-3 text-[var(--text-muted)] hover:text-red-400"
                  >
                    Reset Filter
                  </button>
                )}
              </div>

              {['ADMIN', 'TEAM_LEAD', 'MOTION_PIC', 'REQUESTER'].includes(user.role_name) && (
                <button 
                  onClick={() => setShowCreateModal(true)} 
                  className="btn-primary shrink-0" 
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 16px', height: '36px', borderRadius: '8px', fontWeight: '600', background: 'var(--accent-pink)', borderColor: 'var(--accent-pink)', fontSize: '12px' }}
                >
                  <Plus className="w-4 h-4" /> <span>Create Request</span>
                </button>
              )}
            </div>
          </div>

          {/* VIEW MODE 1: KANBAN BOARD VIEW */}
          {viewMode === 'kanban' && (
            <div className="kanban-board-wrapper" style={{ minHeight: 520 }}>
              {MOTION_KANBAN_COLUMNS.map((col, colIdx) => {
                const colTasks = filteredMotionTasks.filter(mt => mt.status_motion === col.status);
                const isTargetOver = dragOverMotionCol === col.status;
                return (
                  <div 
                    key={col.status || colIdx} 
                    onDragOver={(e) => handleDragOver(e, col.status)}
                    onDragLeave={(e) => handleDragLeave(e, col.status)}
                    onDrop={(e) => handleDrop(e, col.status)}
                    className={`kanban-column flex-shrink-0 w-[320px] scroll-snap-align-start transition-all duration-200 flex flex-col ${
                      isTargetOver ? 'ring-2 ring-[var(--accent-pink)] bg-[var(--bg-tertiary)]/60 shadow-lg scale-[1.01]' : ''
                    }`}
                  >
                    <div className="p-4 flex items-center justify-between border-b border-[var(--border-secondary)]">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: col.color, boxShadow: `0 0 8px ${col.color}` }} />
                        <span className="text-sm font-bold text-[var(--text-primary)]">{col.label}</span>
                      </div>
                      <span className="text-xs px-2.5 py-0.5 rounded-md font-semibold bg-[var(--bg-card)] border border-[var(--border-primary)] text-[var(--text-secondary)]">
                        {colTasks.length}
                      </span>
                    </div>
                    <div className={`p-3 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3 transition-colors ${isTargetOver ? 'bg-[var(--accent-pink)]/5' : ''}`}>
                      {colTasks.length === 0 && (
                        <div className={`empty-state mt-4 p-6 rounded-xl transition-all ${
                          isTargetOver ? 'border-2 border-dashed border-[var(--accent-pink)] bg-[var(--accent-pink)]/10' : ''
                        }`}>
                          <Film className="w-8 h-8" style={{ color: isTargetOver ? 'var(--accent-pink)' : 'var(--border-primary)' }} />
                          <p className="text-xs font-medium mt-2" style={{ color: isTargetOver ? 'var(--accent-pink)' : 'var(--text-muted)' }}>
                            {isTargetOver ? 'Lepas di sini untuk pindah status' : 'Antrean Kosong'}
                          </p>
                        </div>
                      )}
                      {colTasks.map((mt) => {
                        const isMovable = canMoveMotionTask(mt);
                        const isBeingDragged = draggedMotionId === mt.id;
                        const clientName = mt.parentTask?.client_name || allClients.find(c => c.id === mt.client_id)?.name || 'Unknown Client';
                        const picUser = motionUsers.find(u => u.id === mt.motion_pic_id);

                        return (
                          <MotionKanbanCard
                            key={mt.id}
                            mt={mt}
                            isMovable={isMovable}
                            isBeingDragged={isBeingDragged}
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
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
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
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <input
                  type="text"
                  className="input pl-10 w-full"
                  placeholder="Search Motion (Kode, Brand, Campaign, PIC, Studio, Platform)..."
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
          initialTab={detailInitialTab}
          onClose={() => {
            setShowDetail(null);
            setDetailInitialTab('details');
            if (taskIdParam) {
              window.history.replaceState(null, '', window.location.pathname);
            }
          }}
          onRefresh={refresh}
          onAssign={() => setShowAssign(showDetail.id)}
          onSubmit={() => setShowSubmitModal(showDetail.id)}
          onRevise={() => setShowRevisionModal(showDetail.id)}
          onHandover={() => setShowHandoverModal(showDetail.id)}
          onEdit={() => setShowEditModal(showDetail.id)}
        />
      )}

      {/* ================= MODAL 2: ASSIGN MOTION PIC MODAL ================= */}
      {showAssign && (
        <AssignMotionPicModal
          motionTaskId={showAssign}
          currentTask={motionTasks.find(t => t.id === showAssign)}
          motionUsers={motionUsers}
          userId={user.id}
          onClose={() => { setShowAssign(null); refresh(); }}
        />
      )}

      {/* ================= MODAL 3: CREATE / EDIT MOTION REQUEST MODAL ================= */}
      {showCreateModal && (
        <MotionFormModal 
          onClose={() => { setShowCreateModal(false); refresh(); }} 
          userId={user.id} 
          clients={allClients} 
          motionUsers={motionUsers} 
        />
      )}
      {showEditModal && (
        <MotionFormModal 
          onClose={() => { setShowEditModal(null); refresh(); }} 
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
          taskId={showSubmitModal} 
          onClose={() => { setShowSubmitModal(null); refresh(); }} 
          userId={user.id} 
        />
      )}

      {/* ================= MODAL 5: REQUEST MOTION REVISION MODAL ================= */}
      {showRevisionModal && (
        <MotionRevisionModal
          taskId={showRevisionModal}
          onClose={() => { setShowRevisionModal(null); refresh(); }}
          userId={user.id}
        />
      )}

      {/* ================= MODAL 6: HANDOVER TO OPERATOR MODAL ================= */}
      {showHandoverModal && (
        <HandoverModal 
          taskId={showHandoverModal} 
          onClose={() => { setShowHandoverModal(null); refresh(); }} 
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
  initialTab = 'details',
  onClose,
  onRefresh,
  onAssign,
  onSubmit,
  onRevise,
  onHandover,
  onEdit
}: {
  motionTask: EnrichedMotionTask;
  user: UserType;
  allUsers: UserType[];
  allClients: Client[];
  initialTab?: 'details' | 'chat';
  onClose: () => void;
  onRefresh: () => void;
  onAssign: () => void;
  onSubmit: () => void;
  onRevise: () => void;
  onHandover: () => void;
  onEdit: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'details' | 'chat'>(initialTab);
  const [commentCount, setCommentCount] = useState<number>(0);
  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const canEdit = ['ADMIN', 'TEAM_LEAD'].includes(user.role_name) || !motionTask.parentTask;
  const clientName = motionTask.parentTask?.client_name || allClients.find(c => c.id === motionTask.client_id)?.name || 'Unknown Client';
  const picUser = allUsers.find(u => u.id === motionTask.motion_pic_id);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="modal-overlay" onClick={onClose} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', zIndex: 999 }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '840px', background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-primary)', boxShadow: 'var(--shadow-dropdown)', display: 'flex', flexDirection: 'column', maxHeight: '92vh', overflow: 'hidden' }}>
        
        {/* Header */}
        <div style={{ padding: '20px 24px 16px 24px', borderBottom: '1px solid var(--border-primary)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', background: 'var(--bg-secondary)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div className="flex items-center gap-2.5">
              <span style={{ fontFamily: 'monospace', fontSize: '13px', color: 'var(--accent-pink)', fontWeight: '700', padding: '2px 8px', background: 'rgba(236,72,153,0.1)', borderRadius: '6px' }}>
                {motionTask.parentTask?.task_code || (motionTask.id || '').substring(0, 10).toUpperCase()}
              </span>
              <span className="text-xs text-[var(--text-muted)] font-medium">|</span>
              <span className="text-xs text-[var(--text-secondary)] font-medium">{clientName}</span>
            </div>
            <h2 style={{ fontSize: '19px', fontWeight: '700', color: 'var(--text-primary)', margin: 0, lineHeight: 1.3 }}>
              {motionTask.parentTask?.campaign_name || motionTask.campaign_type || 'Standalone Motion Request'}
            </h2>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
              <span className={`badge ${MOTION_STATUS_COLORS[motionTask.status_motion]}`}>
                {MOTION_STATUS_LABELS[motionTask.status_motion]}
              </span>
              <span className="badge text-[10px] py-0 px-2 bg-purple-500/20 text-purple-300 border-purple-500/30">
                {MOTION_DIFFICULTY_LABELS[motionTask.motion_difficulty]}
              </span>
              {motionTask.platform && (
                <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', borderColor: 'rgba(59, 130, 246, 0.2)' }}>
                  {motionTask.platform}
                </span>
              )}
              {motionTask.studio && (
                <span className="badge" style={{ background: 'rgba(236, 72, 153, 0.1)', color: '#ec4899', borderColor: 'rgba(236, 72, 153, 0.2)' }}>
                  Studio {motionTask.studio}
                </span>
              )}
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
                ? 'bg-pink-600 text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Detail Motion
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'chat'
                ? 'bg-pink-600 text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Kolom Chat &amp; Diskusi
            {commentCount > 0 && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                activeTab === 'chat' ? 'bg-white/25 text-white' : 'bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-300'
              }`}>
                {commentCount}
              </span>
            )}
            {unreadChatCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" title={`${unreadChatCount} pesan belum dibaca`} />
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
                    {clientName}
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Requester</span>
                  <p style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '14px', margin: 0 }}>
                    {motionTask.parentTask?.created_by_name || 'Requester'}
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Motion Type</span>
                  <p style={{ color: 'var(--text-primary)', fontSize: '14px', margin: 0, fontWeight: '500' }}>
                    {motionTask.motion_type || motionTask.parentTask?.content_type_name || 'Motion Video'}
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Platform &amp; Studio</span>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
                    {motionTask.platform || 'General'} • Studio {motionTask.studio || 'Jakarta'}
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Motion PIC</span>
                  <p style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600', margin: 0 }}>
                    {picUser?.full_name || 'Belum di-assign'}
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Design Origin PIC</span>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
                    {motionTask.parentTask?.design_pic_name || '—'}
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tanggal Produksi</span>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
                    {motionTask.production_date ? formatDisplayDate(motionTask.production_date) : formatDisplayDate(motionTask.created_at)}
                  </p>
                </div>
                {motionTask.period_start && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Periode Tayang</span>
                    <p style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '14px', margin: 0 }}>
                      {formatDisplayDate(motionTask.period_start)} s/d {formatDisplayDate(motionTask.period_end || '')}
                    </p>
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Revisions</span>
                  <p style={{ color: motionTask.motion_revision_count > 0 ? 'var(--accent-amber)' : 'var(--text-secondary)', fontSize: '14px', fontWeight: '500', margin: 0 }}>
                    Motion Rev: {motionTask.motion_revision_count}
                  </p>
                </div>
              </div>

              {/* Brief & Notes */}
              {motionTask.notes && (
                <div className="p-4 rounded-xl space-y-1.5" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Brief &amp; Catatan Khusus</span>
                  <p style={{ fontSize: '13px', color: 'var(--text-primary)', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{motionTask.notes}</p>
                </div>
              )}

              {/* Design GD Final Asset Handoff Section */}
              <div style={{ padding: '16px', background: 'rgba(59,130,246,0.05)', borderRadius: '12px', border: '1px solid rgba(59,130,246,0.2)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '11px', color: 'var(--accent-blue)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Asset Handoff (Design GD)
                </span>
                {motionTask.parentTask?.final_asset_link ? (
                  <>
                    <p style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: '600', margin: 0 }}>
                      {motionTask.parentTask?.final_asset_name || 'Design Approved Asset'}
                    </p>
                    <a href={sanitizeUrl(motionTask.parentTask.final_asset_link)} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: '13px', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none', fontWeight: '500' }}>
                      <ExternalLink style={{ width: '14px', height: '14px' }} /> {motionTask.parentTask.final_asset_link}
                    </a>
                  </>
                ) : (
                  <p className="text-xs text-[var(--text-muted)] italic">
                    {motionTask.parentTask ? 'Asset GD belum dilampirkan pada tiket induk.' : 'Tiket standalone (tanpa tiket desain induk).'}
                  </p>
                )}
              </div>

              {/* Motion Render Output Link Section */}
              {motionTask.link_motion && (
                <div style={{ padding: '16px', background: 'rgba(236,72,153,0.05)', borderRadius: '12px', border: '1px solid rgba(236,72,153,0.2)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--accent-pink)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Output Render Animasi (Motion)
                  </span>
                  <a href={sanitizeUrl(motionTask.link_motion)} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: '13px', color: 'var(--accent-pink)', display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none', fontWeight: '600' }}>
                    <Film style={{ width: '15px', height: '15px' }} /> {motionTask.link_motion}
                  </a>
                </div>
              )}

              {/* Revision History for Motion */}
              {motionTask.parentTask?.revisions && motionTask.parentTask.revisions.filter(r => r.stage === 'MOTION').length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <RotateCcw style={{ width: '15px', height: '15px', color: 'var(--accent-amber)' }} />
                    Riwayat Revisi Motion ({motionTask.parentTask.revisions.filter(r => r.stage === 'MOTION').length})
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {motionTask.parentTask.revisions.filter(r => r.stage === 'MOTION').sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(rev => (
                      <div key={rev.id} style={{ padding: '14px', background: 'var(--bg-tertiary)', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '13px' }}>Motion Rev #{rev.revision_number}</span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{formatDisplayDate(rev.created_at)}</span>
                        </div>
                        <div>
                          <span className="badge" style={{ fontSize: '10px', padding: '2px 8px', background: 'rgba(217, 119, 6, 0.1)', color: 'var(--accent-amber)', borderColor: 'rgba(217, 119, 6, 0.2)' }}>
                            {REASON_LABELS[rev.reason_category] || rev.reason_category}
                          </span>
                        </div>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.5' }}>
                          {rev.notes || (rev as any).revision_notes}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================= TAB 2: KOLOM CHAT & DISKUSI TIM ================= */}
          {activeTab === 'chat' && (
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
              isActiveTab={activeTab === 'chat'}
              onCommentsUpdated={(count, unread) => {
                setCommentCount(count);
                setUnreadChatCount(unread);
              }}
            />
          )}

        </div>

        {/* Action Buttons Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-primary)', display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-secondary)', borderBottomLeftRadius: '16px', borderBottomRightRadius: '16px' }}>
          
          {/* LEFT SIDE: Management Actions */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
            {canEdit && !motionTask.parentTask && (
              <button 
                onClick={onEdit} 
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', fontWeight: '600', fontSize: '13px', color: 'var(--text-primary)', background: 'var(--bg-tertiary)', border: '1px solid var(--border-secondary)', cursor: 'pointer' }}
              >
                <Edit2 style={{ width: '14px', height: '14px' }} /> Edit Request
              </button>
            )}
            {['ADMIN', 'TEAM_LEAD'].includes(user.role_name) && (
              <button 
                onClick={async () => { 
                  if (confirm('Apakah Anda yakin ingin menghapus tiket motion ini? Tindakan ini tidak dapat dibatalkan.')) {
                    await deleteMotionTask(motionTask.id, user.id);
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
            {['ADMIN', 'TEAM_LEAD'].includes(user.role_name) && motionTask.status_motion !== 'QUEUED' && (
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
                    await updateMotionStatus(motionTask.id, prevStatus);
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
            {/* Assign PIC */}
            {motionTask.status_motion === 'QUEUED' && ['ADMIN', 'TEAM_LEAD'].includes(user.role_name) && (
              <button 
                onClick={onAssign} 
                className="btn-primary" 
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', fontWeight: '600', fontSize: '13px' }}
              >
                <User style={{ width: '14px', height: '14px' }} /> {motionTask.motion_pic_id ? 'Edit PIC' : 'Assign Motion PIC'}
              </button>
            )}

            {/* Start Work */}
            {motionTask.status_motion === 'QUEUED' && motionTask.motion_pic_id && (motionTask.motion_pic_id === user.id || ['ADMIN', 'TEAM_LEAD'].includes(user.role_name)) && (
              <button 
                onClick={async () => { await updateMotionStatus(motionTask.id, 'IN_PROGRESS'); onRefresh(); }} 
                className="btn-primary" 
                style={{ background: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', fontWeight: '600', fontSize: '13px' }}
              >
                <Play style={{ width: '14px', height: '14px' }} /> Start Work
              </button>
            )}

            {/* Submit Render */}
            {(motionTask.status_motion === 'IN_PROGRESS' || motionTask.status_motion === 'REVISION') && (motionTask.motion_pic_id === user.id || ['ADMIN', 'TEAM_LEAD'].includes(user.role_name)) && (
              <button 
                onClick={onSubmit} 
                className="btn-primary" 
                style={{ background: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', fontWeight: '600', fontSize: '13px' }}
              >
                <Send style={{ width: '14px', height: '14px' }} /> Submit Render
              </button>
            )}

            {/* Revision & Approval */}
            {motionTask.status_motion === 'SUBMITTED' && ['ADMIN', 'TEAM_LEAD', 'STRATEGIC_PIC', 'REQUESTER'].includes(user.role_name) && (
              <>
                <button 
                  onClick={onRevise} 
                  className="btn-secondary" 
                  style={{ color: 'var(--accent-amber)', borderColor: 'var(--accent-amber)', display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', fontWeight: '600', fontSize: '13px', background: 'rgba(245, 158, 11, 0.05)' }}
                >
                  <RotateCcw style={{ width: '14px', height: '14px' }} /> Request Revision
                </button>
                
                <button 
                  onClick={async () => { await updateMotionStatus(motionTask.id, 'APPROVED'); onRefresh(); }} 
                  className="btn-primary" 
                  style={{ background: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', fontWeight: '600', fontSize: '13px' }}
                >
                  <CheckCircle2 style={{ width: '14px', height: '14px' }} /> Approve Motion
                </button>
              </>
            )}

            {/* Handover to Operator */}
            {motionTask.status_motion === 'APPROVED' && ['ADMIN', 'TEAM_LEAD'].includes(user.role_name) && (
              <button 
                onClick={onHandover} 
                className="btn-primary" 
                style={{ background: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', fontWeight: '600', fontSize: '13px' }}
              >
                <CheckCircle2 style={{ width: '14px', height: '14px' }} /> Handover to Operator
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
  motionTaskId, currentTask, motionUsers, userId, onClose 
}: { 
  motionTaskId: string; currentTask?: MotionTask; motionUsers: UserType[]; userId: string; onClose: () => void; 
}) {
  const [picId, setPicId] = useState(currentTask?.motion_pic_id || motionUsers[0]?.id || '');
  const [difficulty, setDifficulty] = useState<MotionDifficulty>(currentTask?.motion_difficulty || 'LVL_1_SIMPLE');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await assignMotionPic(motionTaskId, picId, userId, difficulty);
      onClose();
    } catch (err: any) {
      alert(err.message || 'Error assigning Motion PIC');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-md w-full" onClick={e => e.stopPropagation()}>
        <div className="p-6 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-primary)', background: 'var(--bg-card)' }}>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">{currentTask?.motion_pic_id ? 'Edit / Reassign Motion PIC' : 'Assign Motion PIC'}</h2>
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
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Saving...' : 'Confirm Assignment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ===================== MODAL: SUBMIT MOTION RENDER =====================
function SubmitMotionModal({ taskId, onClose, userId }: { taskId: string, onClose: () => void, userId: string }) {
  const [linkMotion, setLinkMotion] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkMotion.trim()) return;
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-md w-full" onClick={e => e.stopPropagation()}>
        <div className="p-6 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Submit Motion Render</h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-full"><X className="w-5 h-5" /></button>
        </div>
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
              {submitting ? 'Submitting...' : 'Submit Output'}
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

  const [formData, setFormData] = useState({
    client_id: taskToEdit?.client_id || clients[0]?.id || 0,
    platform: (taskToEdit?.platform as any) || 'TIKTOK',
    motion_type: taskToEdit?.motion_type || '',
    campaign_type: taskToEdit?.campaign_type || 'BaU',
    motion_difficulty: (taskToEdit?.motion_difficulty as MotionDifficulty) || 'LVL_1_SIMPLE',
    motion_pic_id: taskToEdit?.motion_pic_id || '',
    production_date: taskToEdit?.production_date || new Date().toISOString().substring(0, 10),
    period_start: taskToEdit?.period_start || new Date().toISOString().substring(0, 10),
    period_end: taskToEdit?.period_end || new Date(Date.now() + 7 * 86400000).toISOString().substring(0, 10),
    studio: (taskToEdit?.studio as any) || 'Jakarta',
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
                <option value="BaU" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">BaU</option>
                <option value="PayDay" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">PayDay</option>
                <option value="DD" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">Double Date (DD)</option>
                <option value="Special" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">Special</option>
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
